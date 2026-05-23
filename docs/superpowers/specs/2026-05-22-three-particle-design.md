# 3D 粒子交互模块设计

目标：将现有 Canvas 2D 粒子替换为 Three.js 3D 粒子场。粒子交互模式占满整个浏览器窗口，左侧导航悬停显示，右侧提供预设模型按钮，右下角仅保留置信度和状态。

预设模型：星云、烟花、土星、花朵。粒子需要细、密、彩色、有辉光感和空间纵深。粒子不跟随鼠标，只由手势识别结果驱动。

手势映射：左滑/右滑控制旋转方向，上滑/下滑控制垂直流动，放大扩散，缩小聚拢，点击切换配色，no_gesture 保持缓慢自转。

实现：使用 CDN 引入 Three.js。`particles.js` 封装 `ParticleScene`，提供 `applyGesture(gesture, confidence, triggered)`，保持和现有 `app.js` 的接口一致。HTML 增加右侧模型选择按钮，CSS 在粒子模式下显示该选择器。
