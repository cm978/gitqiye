这是一个动作识别和虚拟交互系统。

1. 当前已经接入训练后的 ResNet50-LSTM 权重，默认从 `checkpoints/ipn_resnet50_lstm/best.pth` 自动加载。
2. “识别”页使用当前训练模型展示训练成果；网页控制、媒体控制和粒子交互使用浏览器端实时手势引擎保证速度。
3. 训练模型识别路径：

摄像头帧
  ->
中心裁剪和归一化
  ->
ResNet-50 CNN 提取每帧特征
  ->
LSTM 识别动态手势
  ->
Flask 返回训练模型预测结果

4. 实时交互路径：

摄像头视频
  ->
MediaPipe Tasks Gesture Recognizer / hand landmarks
  ->
前端实时动作映射
  ->
网页、媒体和 Three.js 粒子交互

5. 当前 8 类标签只限制训练模型展示，不限制实时交互动作设计。
