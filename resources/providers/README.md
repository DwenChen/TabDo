# 内置提供商的上游适配代码

来源：[ZToolsCenter/ZTools-plugins f-provider](https://github.com/ZToolsCenter/ZTools-plugins/tree/ae2bd2cc678b743f7683c3fb40b6606940acc3d1/plugins/f-provider)，MIT，许可证见 LICENSE。

services.cjs 保留上游翻译协议、OCR 与图片上传算法，改为工厂导出，移除插件注册副作用。宿主仅在独立、按次退出的 Electron Node 进程中加载它，不使用其设置持久化、模型下载安装或界面功能。下载安装由宿主校验 SHA-256、隔离目录和事务状态后完成。

latexOcr.cjs 改由宿主注入解码后的 BGRA 位图，纠正上游把 Electron 位图当作 RGBA 的通道顺序；完成后逐项等待 ONNX 会话 release，再退出独立进程。未引入上游截图实现。工具的 OcrImageViewer.vue 参考上游 MIT 同名组件的坐标叠层，独立实现可选择文字、坐标明细与缩放，不依赖上游 UI 组件。

运行资源固定采用 kaineooo/f-provider v1.1.1 release，下载摘要来自 GitHub release asset digest。用户启用后下载到隔离的 TabDo 数据目录，不随程序提交或分发用户数据。
