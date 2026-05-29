# ResNet50-LSTM 动态手势训练说明

## 当前模型阶段

当前项目把“训练模型展示”和“实时交互体验”拆成两条链路。训练后的权重已放入 `checkpoints/ipn_resnet50_lstm/`，应用会自动加载目录中的 `best.pth`。“识别”页使用该模型展示训练成果；网页控制、媒体控制和粒子交互使用浏览器端实时手势引擎，以保证速度和体验。

当前模型输入约定：

```js
{
  frames: ["data:image/jpeg;base64,..."],
  mode: "web"
}
```

模型继续输出现有 8 类标签，并保持 `/api/predict` 返回结构兼容。

## 实时交互说明

实时交互不受当前 8 类训练标签限制。前端通过 `static/js/realtime_gestures.js` 调用 MediaPipe Tasks Gesture Recognizer，输出统一信号：

```js
{
  source: "realtime",
  gesture,
  confidence,
  center,
  velocity,
  openness,
  pinch,
  motion,
  hands
}
```

`app.js` 使用该信号直接驱动网页、媒体和 Three.js 粒子。后端 ResNet50-LSTM 结果保留为训练成果展示和历史记录。

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
如果没有设置 `GESTURE_MODEL_PATH`，当前项目也会自动发现 `checkpoints/ipn_resnet50_lstm/best.pth`。

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
摄像头帧中心裁剪
  ↓
ResNet-50 CNN 每帧特征
  ↓
LSTM 时序建模
  ↓
动态手势类别
```
