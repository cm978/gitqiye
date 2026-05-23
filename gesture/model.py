import torch
from torch import nn
from torchvision import models


class ResNet50LSTM(nn.Module):
    def __init__(self, num_classes=8, hidden_size=256, num_layers=1, dropout=0.3, pretrained=True):
        super().__init__()
        try:
            weights = models.ResNet50_Weights.DEFAULT if pretrained else None
            backbone = models.resnet50(weights=weights)
        except (AttributeError, TypeError):
            backbone = models.resnet50(pretrained=pretrained)
        self.feature_extractor = nn.Sequential(*list(backbone.children())[:-1])
        self.feature_size = backbone.fc.in_features
        self.lstm = nn.LSTM(
            input_size=self.feature_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size, num_classes),
        )

    def forward(self, frames):
        batch_size, seq_len, channels, height, width = frames.shape
        flat_frames = frames.reshape(batch_size * seq_len, channels, height, width)
        features = self.feature_extractor(flat_frames).flatten(1)
        features = features.reshape(batch_size, seq_len, self.feature_size)
        output, _ = self.lstm(features)
        return self.classifier(output[:, -1, :])
