# ResNet50-LSTM 动态手势训练说明

## 当前 Demo 阶段

当前项目优先展示“摄像头真实手势控制网页粒子效果”。在没有训练权重时，前端使用 MediaPipe Hands 关键点生成连续手部信号，再由规则层映射为 demo 手势，并通过现有 `/api/predict` 的 `demo_gesture` 字段保持后端返回格式一致。

当前 demo 输入对象约定：

```js
{
  hasHands: true,
  hands: 1,
  center: { x: 0.5, y: 0.5 },
  openness: 0.0,
  pinch: 0.0,
  motion: 0.0
}
```

- `center`：控制粒子旋转偏移和上下流动。
- `openness`：控制粒子扩散、亮度扰动和镜头距离。
- `pinch`：预留给捏合交互，当前用于增强聚拢效果。
- `motion`：控制粒子扰动、速度和能量感。

训练完成后，不需要重写粒子交互层；只需要让真实模型继续输出现有 8 类标签，并保持 `/api/predict` 返回结构兼容。

## 数据目录方式

适合已经把视频切成样本帧的情况：

```text
data/custom_samples/
  swipe_left/
    sample_001/
      0001.jpg
      0002.jpg
  swipe_right/
    sample_001/
      0001.jpg
```

训练：

```bash
python -m gesture.train --dataset-format frame-folder --data-dir data/custom_samples --output-dir checkpoints --run-name ipn_resnet50_lstm
```

输出目录：

```text
checkpoints/ipn_resnet50_lstm/
  best.pth
  last.pth
  metadata.json
  labels.json
```

## 视频标注 CSV 方式

适合 IPN Hand 这类连续视频数据。CSV 至少需要这些列：

```csv
video_path,start_frame,end_frame,label
video_001.mp4,120,156,swipe_left
```

训练：

```bash
python -m gesture.train --dataset-format manifest --data-dir data/ipn_hand/videos --annotations data/ipn_hand/annotations.csv --output-dir checkpoints --run-name ipn_resnet50_lstm
```

如果公开数据集原始标签和项目标签不同，可以提供标签映射：

```csv
source_label,target_label
left_swipe,swipe_left
right_swipe,swipe_right
```

训练时加入：

```bash
--label-map data/ipn_hand/label_map.csv
```

## 在 Flask 中使用训练好的目录

Windows PowerShell：

```powershell
$env:GESTURE_MODEL_PATH="C:\Users\34593\Desktop\大二下\qiye\checkpoints\ipn_resnet50_lstm"
python app.py
```

程序会优先加载目录中的 `best.pth`，找不到时加载 `last.pth`。

## 说明

训练默认使用 GPU：

```bash
--device cuda
```

如果只想在本机 CPU 上做小样本冒烟测试，可以显式传：

```bash
--device cpu
```

模型路线：

```text
MediaPipe 手部 ROI 裁剪
  ↓
ResNet-50 CNN 每帧特征
  ↓
LSTM 时序建模
  ↓
动态手势类别
```
