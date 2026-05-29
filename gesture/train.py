import argparse
import json
import random
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Subset

from config import CHECKPOINT_DIR, GESTURE_LABELS, MODEL_CONFIG
from gesture.dataset import FrameFolderGestureDataset, ManifestVideoGestureDataset, load_label_map
from gesture.model import ResNet50LSTM

print("[train] imports done, starting...", flush=True)


def parse_args():
    parser = argparse.ArgumentParser(description="Train reusable ResNet50-LSTM dynamic gesture weights")
    parser.add_argument("--dataset-format", default="frame-folder", choices=["frame-folder", "manifest"])
    parser.add_argument("--data-dir", default="data/custom_samples", help="Frame root dir or video root dir")
    parser.add_argument("--annotations", default=None, help="CSV file for manifest/video training")
    parser.add_argument("--label-map", default=None, help="CSV rows: source_label,target_label")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    parser.add_argument("--roi-mode", default="center", choices=["center", "none"])
    parser.add_argument("--freeze-backbone", action="store_true", help="Train LSTM/classifier only")
    parser.add_argument("--output-dir", default=str(CHECKPOINT_DIR / "resnet50_lstm_dynamic"))
    parser.add_argument("--run-name", default="run")
    return parser.parse_args()


def make_dataset(args):
    label_map = load_label_map(args.label_map)
    if args.dataset_format == "frame-folder":
        return FrameFolderGestureDataset(
            args.data_dir,
            roi_mode=args.roi_mode,
            label_map=label_map,
            labels=GESTURE_LABELS,
        )
    if not args.annotations:
        raise ValueError("--annotations is required when --dataset-format manifest")
    return ManifestVideoGestureDataset(
        args.data_dir,
        args.annotations,
        roi_mode=args.roi_mode,
        label_map=label_map,
        labels=GESTURE_LABELS,
    )


def split_dataset(dataset, val_ratio, seed):
    if len(dataset) < 2:
        raise ValueError("Not enough samples to train. Prepare at least two gesture samples.")

    # Group samples by video path so the same video is never split across train/val
    from torch.utils.data import Subset

    video_groups = {}
    for i in range(len(dataset)):
        video_path = str(dataset.samples[i]["video_path"])
        video_groups.setdefault(video_path, []).append(i)

    video_list = sorted(video_groups.keys())
    random.seed(seed)
    random.shuffle(video_list)

    val_size = max(1, int(len(video_list) * val_ratio))
    val_videos = set(video_list[:val_size])
    train_videos = set(video_list[val_size:])

    train_indices = [idx for v in video_list if v in train_videos for idx in video_groups[v]]
    val_indices = [idx for v in video_list if v in val_videos for idx in video_groups[v]]

    return Subset(dataset, train_indices), Subset(dataset, val_indices)


def build_model(args, device):
    model = ResNet50LSTM(
        num_classes=MODEL_CONFIG["num_classes"],
        hidden_size=MODEL_CONFIG["hidden_size"],
        num_layers=MODEL_CONFIG["num_layers"],
        dropout=MODEL_CONFIG["dropout"],
        pretrained=True,
    ).to(device)
    if args.freeze_backbone:
        for param in model.feature_extractor.parameters():
            param.requires_grad = False
    return model


def train():
    args = parse_args()
    print(f"[train] args parsed", flush=True)
    set_seed(args.seed)
    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError(
            "Training defaults to GPU, but CUDA is not available. "
            "Run training on a GPU machine or pass --device cpu for a local smoke test."
        )

    device = torch.device(args.device)
    print(f"[train] device={device}", flush=True)
    print(f"[train] loading dataset from {args.data_dir} ...", flush=True)
    dataset = make_dataset(args)
    print(f"[train] dataset loaded: {len(dataset)} samples", flush=True)
    print(f"[train] splitting train/val ...", flush=True)
    train_set, val_set = split_dataset(dataset, args.val_ratio, args.seed)
    print(f"[train] train={len(train_set)}, val={len(val_set)}", flush=True)
    train_loader = DataLoader(
        train_set,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=args.device == "cuda",
    )
    print(f"[train] train_loader created", flush=True)
    val_loader = DataLoader(
        val_set,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=args.device == "cuda",
    )
    print(f"[train] val_loader created", flush=True)

    print(f"[train] building model (downloading ResNet-50 weights if needed)...", flush=True)
    model = build_model(args, device)
    print(f"[train] model built, moving to {device}", flush=True)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(
        [param for param in model.parameters() if param.requires_grad],
        lr=args.lr,
        weight_decay=args.weight_decay,
    )

    output_dir = Path(args.output_dir) / args.run_name
    output_dir.mkdir(parents=True, exist_ok=True)
    best_acc = -1.0
    history = []
    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = evaluate(model, val_loader, criterion, device)
        row = {
            "epoch": epoch,
            "train_loss": train_loss,
            "train_acc": train_acc,
            "val_loss": val_loss,
            "val_acc": val_acc,
        }
        history.append(row)
        print(
            f"epoch={epoch} train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
        )
        save_checkpoint(output_dir / "last.pth", model, args, epoch, val_acc)
        if val_acc > best_acc:
            best_acc = val_acc
            save_checkpoint(output_dir / "best.pth", model, args, epoch, val_acc)

    metadata = {
        "model_name": "ResNet50-LSTM",
        "labels": GESTURE_LABELS,
        "model_config": MODEL_CONFIG,
        "preprocessing": {"roi_mode": args.roi_mode},
        "dataset_format": args.dataset_format,
        "data_dir": str(Path(args.data_dir)),
        "annotations": args.annotations,
        "best_val_acc": best_acc,
        "history": history,
        "weights": {"best": "best.pth", "last": "last.pth"},
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "labels.json").write_text(json.dumps(GESTURE_LABELS, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved reusable model directory: {output_dir}")
    print(f"use in Flask with: set GESTURE_MODEL_PATH={output_dir}")


def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0
    for frames, labels in loader:
        frames, labels = frames.to(device), labels.to(device)
        optimizer.zero_grad()
        logits = model(frames)
        loss = criterion(logits, labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * frames.size(0)
        correct += (logits.argmax(1) == labels).sum().item()
        total += frames.size(0)
    return total_loss / max(total, 1), correct / max(total, 1)


def evaluate(model, loader, criterion, device):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    with torch.no_grad():
        for frames, labels in loader:
            frames, labels = frames.to(device), labels.to(device)
            logits = model(frames)
            loss = criterion(logits, labels)
            total_loss += loss.item() * frames.size(0)
            correct += (logits.argmax(1) == labels).sum().item()
            total += frames.size(0)
    return total_loss / max(total, 1), correct / max(total, 1)


def save_checkpoint(path, model, args, epoch, val_acc):
    torch.save({
        "model": model.state_dict(),
        "labels": GESTURE_LABELS,
        "config": MODEL_CONFIG,
        "preprocessing": {"roi_mode": args.roi_mode},
        "epoch": epoch,
        "val_acc": val_acc,
    }, path)


def set_seed(seed):
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


if __name__ == "__main__":
    print("[train] script starting...", flush=True)
    train()
    print("[train] done!", flush=True)
