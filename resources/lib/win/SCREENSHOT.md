# 工具截图模块

`tabdo_screenshot.node` 是独立的 Windows x64 Node-API 8 模块，来源为 MIT 许可的 [ZTools-native-api](https://github.com/ZToolsCenter/ZTools-native-api) 提交 `8b221e72c4b5462ba2c9b490370cc10df72108cc`。

从工具枚举与图标数组中移除翻译按钮，保留标注、选区调整、保存、确定和长截图。长截图增加每 150ms 的画面变化采样，修复触控板、滚动条等不产生原始滚轮事件时始终停留首屏的问题；静止画面跳过，不误判到底，拼接仍须通过原有重叠校验。宿主其他原生功能仍使用原有的 `tabdo_native.node`。

两处分隔区由整按钮宽缩窄至 12/32 按钮宽，绘制、点击和提示框使用相同布局。长截图的工具栏、预览与悬停提示声明为不参与屏幕捕获，防止界面自身混入拼接结果。

运行时由 `resources/tools-native-worker.cjs` 在独立 Electron Node 进程按次加载本模块。确认、取消或异常后退出进程，宿主等待进程关闭后回传结果，从而回收静态缓存、屏幕帧及线程；预抓帧未使用时两秒后退出。截图保持单会话，重复快捷键不会叠加工作进程。新增子组件必须遵守 [工具开发原则](../../../docs/tools-development.md)。

重编译：将 MinGW-w64 g++ 和 objdump 加入 PATH，设置 `TABDO_NODE_HEADERS` 为 Electron 头文件目录（包含 `include/node`），设置 `TABDO_ADDON_HEADERS` 为 node-addon-api 目录，然后运行 `node scripts/build-tools-screenshot.cjs`。编译脚本固定上游提交、应用可审查的补丁，并静态链接 C++ 运行库，不依赖额外 DLL；Node-API 从当前宿主解析以兼容 Electron 的进程名称。可通过 `TABDO_NATIVE_CXX` 指定编译器、`TABDO_SCREENSHOT_SOURCE` 复用对应提交的本地源码。

宿主交付截图时直接使用原生已编码的 PNG；Windows/macOS 确认复制与保存由原生执行，不再重复读取、编码、解码并写回整图。持续拼接回归使用固定长度页面及逐行身份色带，覆盖数万像素输出和进程回收；该场景验证可用性，不代表已经测得最大长度。
