# Bug 与待验收边界

> 自动生成；状态只描述已有证据，不以加入测试清单替代实际验证。

## BUG-SETTINGS-REENTRY · 设置窗口循环重开与菜单失焦隐藏

状态：已修复；有源码 E2E。

原因：窗口显示、焦点恢复和异步插件装配之间缺少有效会话检查，迟到事件会重新显示已关闭窗口。

处理：合并并发设置请求，校验装配会话与当前视图，原生菜单期间抑制失焦隐藏。

回归：HS-05；settings-window-stability、plugin-cleanup-tray。v1.0.1 已发布。

## BUG-CLIPBOARD-CATEGORY · 剪贴板分类分页、内容变更与代码高亮

状态：已修复；有单测和源码 E2E。

原因：分类发生在分页之后，缓存未跟随内容更新；内置页与 preload 产物曾不同步。

处理：先分类再分页，按内容维护分类缓存；保留代码/链接分类与高亮，并逐文件核验预览资源。

回归：CL-01、CL-02、CL-03、PV-01；clipboardCategory、clipboardTypeDetection、tools-clipboard。

## BUG-CLIPBOARD-SELECTION · 默认选中与多选复制丢失

状态：已修复；有单测和源码 E2E。

原因：刷新默认激活首项、右键重置多选，以及旧版版本检测阻断复制；宿主输入框吞掉复制快捷键。

处理：刷新保持零选中，保留右键整组选区，转发无输入文字选区时的复制动作，按复制结果决定粘贴。

回归：CL-04、CL-05、CL-06、CL-07；clipboardSelectionState、clipboardWriteContentApi、tools-clipboard；分离输入框原生选区优先级仍属人工验收。

## BUG-CLIPBOARD-OFFICE · Office 文本被误识别为图片

状态：已修复；有单测。

原因：Office 复制文本时同时附带选择区图像，类型判断优先级不正确。

处理：存在有效文本时保留文本类型，真实图片及空白文本边界单独处理。

回归：CL-08；clipboardTypeDetection。

## BUG-PANEL-MATCH · 中键快速匹配破坏原选区与固定项行为

状态：已修复；有真实 Windows 输入 E2E。

原因：最近复制匹配与传统中键入口争用，旧缓存被优先使用，延迟 CF_HDROP 事件可能超时丢失。

处理：当前选区始终优先；没有选区时按时限回退最近复制，过期后使用固定项；允许受控延迟的文件复制。

回归：PN-01、PN-02、PN-03、PN-04、PN-05；super-panel-selection、tools-clipboard；真实 Explorer、多 DPI 和多屏边界保留人工项。

## BUG-PANEL-LATE-RESULT · 面板外部点击不关闭或被迟到复制重新弹出

状态：已修复；有源码 E2E。

原因：只依赖窗口 blur，未覆盖不获焦面板；取消后仍消费旧异步复制结果。

处理：原生外部点击关闭可见面板，取消时作废待处理请求并拒绝迟到结果。

回归：PN-06、PN-07；super-panel-selection。

## BUG-HOST-STALE-VIEW · 插件冷启动目标错误、持续 loading 与分离空白

状态：已修复；有源码 E2E。

原因：宿主恢复焦点入口与设置入口耦合，单例复用未结束加载状态，迁移视图时仍可能消费过期装配结果。

处理：独立处理目标插件、完成单例加载状态、迁移同一视图并恢复标题栏输入与有效高度。

回归：HS-01、HS-02、HS-03、HS-04；plugin-host-regressions 覆盖内置工具与第三方夹具。

## BUG-PLUGIN-REMOVAL · 运行中插件删除后遗留归档与配置

状态：已修复；有单测和源码 E2E。

原因：视图、ASAR sidecar、运行配置及插件命名空间分散管理，Windows 文件占用导致立即删除失败。

处理：先终止对应运行时和窗口，统一清理配置/数据；无法立即释放的归档由独立清理 worker 收束。

回归：HS-06；pluginRemovalCleanup、pluginCleanupWorker、pluginStorage、plugin-cleanup-tray。

## BUG-SCREENSHOT-LONG · 截图未确认即结束、通知干扰与长截图不拼接

状态：已修复；有原生源码 E2E。

原因：工具入口使用自动确认；长截图仅依赖 wheel 观察，触控板/滚动条路径缺少采样。

处理：进入编辑态后等待用户确认，确认不弹复制通知；增加画面变化采样并保留重叠校验，缩窄工具栏分隔区。

回归：SC-01、SC-02、SC-03；tools-screenshot；工具栏图标、间距和复杂内容拼接像素质量仍需人工检查。

## BUG-TOOLS-RETAINED-RUNTIME · 工具退出后残留界面、模型或原生运行时

状态：已修复；有生命周期及真实进程 E2E。

原因：工具沿用通用插件缓存策略；截图与取色在宿主长期装载；异步保存需继续使用旧会话身份。

处理：工具退役移出缓存，立即撤销前台资源；必要任务登记完整链并保持 IPC 命名空间，完成后销毁旧 WebContents；Windows 原生工具按次进程退出。

回归：LC-01、LC-02、LC-03；toolsLifecycle、toolsHostLifecycle、tools-lifecycle、tools-screenshot；后台新复制仍由宿主采集。

## BUG-TOOLS-PAGEHIDE · 首次工具页面被旧文档退出事件提前清理

状态：已修复；有源码 E2E。

原因：通过 window 动态引用作用域的 pagehide 回调可能清理后续新会话，挂载流程未校验终止状态。

处理：卸载回调捕获本次作用域，改为 beforeunload；已终止时不挂载 Vue，迟到初始化不重新登记监听。

回归：LC-01、LC-02；tools-clipboard 与 tools-lifecycle 已验证首次加载、重进和后台保存。

## BUG-PREVIEW-STALE-RESOURCES · 源码已改而免安装预览仍使用旧资源

状态：已修复；有完整性单测和资源核验。

原因：只替换 out 会遗漏 resources/preload.js、worker、原生展开模块或内置插件 dist。

处理：同步整份程序清单、内置构建产物和原生展开资源，保留回滚副本并对用户文件前后 SHA-256 比对。

回归：PV-01、PV-02、PV-M01；portablePreviewResources、verify-portable-preview；资源一致不替代成品人工交互验收。

## BUG-PREVIEW-HIDDEN-STAGING · 私有隐藏目录暂存时原生依赖未物理展开

状态：已修复；有归档回归测试及完整资源核验。

原因：ASAR 按绝对路径匹配 unpack，通配符 ** 默认不跨 .artifacts，目录集中迁移后原生资源展开标记失效。

处理：使用包含暂存绝对目录的规则，保留逐文件展开校验；校验在切换程序前执行，失败时不改现有预览。

回归：PV-03；portablePreviewResources 在隐藏目录生成微型归档，核验 LMDB 入口和原生文件的物理展开。

## BOUNDARY-EXTERNAL-PLUGIN · 失效的外部同名剪贴板固定项

状态：待补独立自动化；不宣称修复外部插件。

原因：同名显示文字不能确定插件来源，用户旧固定项可能指向已失效外部插件。

处理：保持用户固定项，内置工具按路径和 featureCode 区分；后续修复需先复现并补独立用例。

回归：HS-M02；内置固定项已有 E2E，失效外部路径未自动覆盖。

## BOUNDARY-MANUAL · 多屏、DPI、原生输入与截图像素质量

状态：保留人工验收。

原因：自动化当前测试桌面无法代表所有系统缩放、应用选择区与复杂图像内容。

处理：按历史回归集人工条目验收，不将文件数量或跳过状态当作通过。

回归：SC-M01、SC-M02、CL-M01、CL-M02、HS-M01、PN-M01、PN-M02、PV-M02；详见 tests/regressions/README.md。
