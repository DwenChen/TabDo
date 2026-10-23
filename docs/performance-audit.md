# 性能审查与资源预算（历史测量）

本文保留 2026-10-21 至 2026-10-22 的审查条件、测量结果与原始版本标识。它不表示 TabDo 1.0 已重新完成所有测量；当前测试结果以当轮维护记录为准。

该次审查覆盖宿主、超级面板、搜索索引、插件 Session、设置页路由、工具入口的 37 个功能码及其 10 个异步页面组件。保持现有功能、交互、布局、主题、指令名称和图标。依据当前源码检查资源归属、异步过期处理、缓存上限、请求并发与退出路径；下表明确区分该次审查改动、保留设计与实际测试范围。

## 发现与处理

| 层级         | 发现                                                                                   | 该次审查处理                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 插件宿主     | 每次主视图/子窗口创建都向相同 Session 注册公共 preload，连续切换实测注册数 1→6         | 查询真实注册表后幂等注册，公共脚本保持一份；注销后允许重新注册                                                                         |
| 插件 Session | 每次进入重复 setProxy，切换配置的异步写入没有串行边界                                  | WeakMap 按 Session 合并相同配置，串行应用新配置，失败可重试；保留用户代理设置                                                          |
| 插件切换     | 旧 plugin-closed 通知可能在新页面开始创建后隐藏宿主                                    | 关闭事件携带切换身份，前端不会把正在进行的切换当作普通退出；旧工具仍立即撤出显示树和缓存                                               |
| 插件通信     | 模式、无界面方法、mainPush 查询/选择超时后残留专属 once 监听；DOM 就绪等待也未撤销监听 | 统一一次性 RPC 收束；成功、失败、超时和销毁均清理计时器及监听，页面销毁立即结束等待                                                    |
| 面板首开     | 等系统复制完成后才开始创建窗口和装载页面                                               | 仅在真实触发后、等待复制时准备隐藏首帧；不抢来源焦点；仍等待复制结果决定内容                                                           |
| 面板闲置     | 隐藏窗口长期保留选文、图片、翻译、匹配列表和 Chromium 页面                             | 隐藏即清空会话引用，取消所属内置翻译；短期复用空页面，30 秒闲置后销毁窗口；不预热常驻页面                                              |
| 面板过期结果 | 内容搜索返回没有请求编号，旧结果可能回填后一次面板；未就绪队列可累计旧数据             | 内容搜索和窗口匹配均检查当前请求，隐藏令请求失效；未就绪队列每个通道只留最新一份                                                       |
| 面板布局     | 一个结果更新可能同时由 watcher 和显式调用测量尺寸                                      | 同一 Vue 更新批次只测量一次，隐藏页面不测量                                                                                            |
| 搜索索引     | 深层 ref 将只读指令集合、数据来源和 Fuse 实例变为响应式对象                            | 整体重建的集合及索引使用 shallowRef；保留排序、别名、禁用和各输入匹配语义                                                              |
| 网页文本匹配 | 为选择一个网站，先装载整个工具页面与 Vue、读取配置、隐藏，然后创建菜单                 | 内置文本匹配由宿主直接读取相同私有配置、执行原有有界菜单/浏览器操作；管理页和识图入口保留原流程                                        |
| 图标         | 仅限 128 条，无法约束大 PNG 的总字节；同源并发缺少合并                                 | 同时限制 128 条和 16 MiB；超大图标交付但不缓存；同源在途提取合并，保留原生串行约束                                                     |
| 剪贴板       | 分类缓存保存全部文本；批量文件状态检查用嵌套 Promise.all 同时提交所有 I/O              | 缓存只保留记录版本/哈希和分类，上限 1024；分页文件检查最多 4×8 个同时进行，保持结果顺序                                                |
| 媒体页面     | 快速换图仅忽略旧响应，旧读图进程仍继续；清空后迟到预览可复活                           | 取消旧请求并等旧进程退出再启动最新请求；读元数据和预览分别串行，清空/换模式/退出均作废旧预览；退出等前台请求收束，必要编码任务独立完成 |

## 子组件审查矩阵

设置页子输入框还修复了两处调度问题：注册不再固定等待 100ms；失败最多尝试 10 次，路由卸载立即清理注册及聚焦计时器，旧输入回调不再写入已退出页面。`settingsSubInputResources` 用 20 次生命周期循环及失败重试验证计时器归零，设置源码回归验证实际输入框行为。

| 页面/子组件与功能码                                                                                                                   | 资源与调度结论                                                                                                                                               | 自动化位置                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| ClipboardApp → ClipboardList、TextItem、ImageItem、FileItem、TabBar、SideBar、ContextMenu、FavoriteDialog、ConfirmDialog；`clipboard` | 分页读取、图片文件 URL、作用域退出清空引用；全局采集归宿主，不能随页面停止。该次审查缩减分类缓存并限制文件检查 I/O                                           | tools-clipboard、tools-lifecycle、performance-budget、clipboardCategory/TypeDetection/Shutdown           |
| ProviderTools → OcrImageViewer；`recognize`、`latex-recognize`                                                                        | 请求版本与取消信号、图像/画布释放、KaTeX 按需装载；内置模型/原生推理按次进程隔离。面板翻译新增取消链；第三方 provider 已开始的计算仍遵守其公开接口           | builtin-providers、builtinProviderService、providerManager/Consumption、tools-expanded                   |
| FileRenamer → rename 子面板/虚拟列表/规则 Worker；`file-renamer`                                                                      | 120ms 合并预览、Worker 可终止、验证并发有界；智能模型列表按需加载；事务与回滚由必要任务持有，退出不缓存页面                                                  | tools-expanded、tools-lifecycle、toolsFiles、toolsRenameRules                                            |
| BreakFolder → BreakProgress/预览/撤销；`folder-break`                                                                                 | 扫描版本作废、必要事务登记、取消先回滚、写入队列串行；保留原实现                                                                                             | tools-folder-break、toolsFiles                                                                           |
| QrScanner → 解码 Worker；`qrcode-scan`                                                                                                | 按次 Worker、超时/换图终止、图片与结果退出释放；不预加载解码器                                                                                               | tools-expanded、tools-lifecycle、performance-budget                                                      |
| FloatingLauncher → 独立图片画布/便签；`image-annotate`、`float-content`、`sticky-note`                                                | 启动链必要任务；独立可见窗口只持有纯内容，不保留入口页面；最后一个窗口结束后停止共享观察器；保留用户主动创建窗口                                             | tools-expanded、tools-polish、floating-pointer、tools-lifecycle                                          |
| LocalSearch → FinderSidebar/Results/Preview/Settings/Resize；`local-search`                                                           | 250ms 合并查询、版本过滤、100 条分页、有界预览；Everything 桥接随会话关闭，不终止用户 Everything                                                             | tools-expanded、tools-polish、everythingBridge、localSearchQuery                                         |
| ScreenRecorder → RecorderIcon/RecorderSettings；`screen-recorder`、`screen-recorder-region`、`screen-recorder-stop`                   | 来源按需枚举、无常驻捕获；启动事务转交独立控制条，计时器随页面释放；控制条、选区、倒计时、效果窗口和捕获进程分别收尾                                         | media-batch、tools-recorder-web、recorder-overlay、recorderLayout                                        |
| MediaBatch → MediaIcon/手动裁剪/队列/设置；`image-batch`、`image-batch-folder`、`image-manual-crop`、`image-merge`、`video-batch`     | 该次审查限制前台请求叠加；宿主最多 4 个媒体任务，Sharp 缓存关闭/并行度 2，逐文件处理、尺寸有界、临时输出清理；合并输出仍需完整画布                           | media-batch、mediaOperations、mediaRuntimeDependencies                                                   |
| WebQuickOpen/独立 quick-menu；`web-quick-open`、`web-search-text`、`web-search-image`                                                 | 文本匹配走该次审查直达路径；网站配置不写回、不复制到新命名空间；菜单 sender 校验、关闭销毁、90 秒任务上限；Lens 一次性内存服务 60 秒超时保留                 | tools-recorder-web、lens-browser-upload、webQuickOpen、performance-budget                                |
| 截图/取色；`screenshot`、`color-picker`                                                                                               | 原生能力在独立进程按次执行，预抓帧最多 2 秒；确认/取消后关闭所属进程，保留原实现                                                                             | tools-screenshot、screenCaptureResult、tools-lifecycle                                                   |
| 系统操作；`clear`、`clear-history`、`reboot`、`shutdown`、`logoff`、`sleep`、`lock-screen`                                            | 纯宿主指令，不装载 Vue 工具页；关机/重启等破坏性真实系统操作不在自动化中执行                                                                                 | 清单及路由静态检查；停止插件由宿主回归覆盖                                                               |
| 路径/窗口操作；`open-url`、`open-folder`、`window-info`、`copy-path`、`copy-name`、`open-terminal`                                    | 有限宿主操作；窗口信息独立可见窗口归自身；用户浏览器/终端不属于待回收进程                                                                                    | tools-copy-commands、tools-catalog；终端/系统外部程序启动边界保留人工项                                  |
| 设置：通用/快捷键/插件/市场/提供商与 AI/数据/全部指令/本地启动/HTTP/关于/安装页及共享详情、菜单、子输入框                             | 路由已经按需 import；切换路由卸载页面，不增加 KeepAlive；状态订阅在组件卸载时解除。持久设置及后台下载属于宿主服务，不因关闭设置页取消。该次审查不改变设置 UI | settings-window-stability、plugin-host-regressions、plugin-cleanup-tray；配置默认值/数据迁移另有既有专项 |

## 测量方法与结果

`tests/e2e/performance-budget.spec.ts` 使用源码 Electron、同机隔离数据和临时旧数据目录。重复切换 6 次；真实调用匹配链；确认旧 WebContents 关闭、Session 注册数量稳定、1040 条历史分类缓存不保留正文；实际等待 30 秒验证闲置页面销毁。性能测试不强制 GC，不修改用户配置，不把工作集的单次变化当作普适收益。

最终同进程对照（`.artifacts/runs/2026-10-21T15-25-16-508Z-e2e`）：固定 600ms 系统复制延迟，仅替换系统输入边界，交替运行 3 次顺序创建与 3 次提前准备；正文可见耗时中位数由 **1923ms 降至 935ms（约 51%）**。这是控制复制延迟的源码对照；真实原生选区链由 super-panel-selection 单独验证，不能将此数字当作所有应用/设备的承诺。

同轮交替对照原有完整页面启动链与宿主直达链各 3 次，文本搜索二级菜单中位数从 **905ms 降至 395ms（约 56%）**，直达入口未创建工具 WebContents。直接冷开面板约 939ms，短期复用约 34–45ms，测量包含 Playwright 往返及正文断言。首次二维码涉及 Vite 首次模块处理，不能把开发服务器的冷编译耗时作为发布版进入时间。

30 秒闲置后 WebContents 回到仅宿主 1 个、工具缓存 0 个；该次 Electron 进程工作集总和约 434MiB，面板再次打开并隐藏后约 598MiB。工作集包含主进程、GPU、服务与页面，受 Windows 回收和开发服务影响；这是资源确已释放的辅助证据，不是独立 JS 堆或生产版常驻内存指标。

原始 JSON、主进程日志、截图与 trace 仅在 `.artifacts/runs/` 和 `test-results/playwright/`，不提交。最终执行结果及预览校验以该次审查历史记录为准。

## 保留边界

- 2026-10-21 轮次保留的第三方保活策略已由下方 2026-10-22 的 session-v1 策略替代。内置 provider 继续完整传递 AbortSignal。
- 不增加常驻工具页、常驻模型、启动预热进程或主动 GC 轮询。短期复用面板与 30 秒闲置回收是启动速度和闲时资源的明确折中。
- 文件历史全量分类/排序、合并媒体画布和用户主动打开的多个独立窗口仍随真实内容增长；输出尺寸、分页和任务数有界，但不承诺所有输入都获得相同峰值内存。
- 不改变用户配置、收藏、剪贴板历史、已安装插件或原始文件。不同 DPI/多屏、显卡/音频设备、真实 Everything 索引、外网与第三方插件内部性能继续以设备验收为准。

## 重定位前内存审查（历史版本 2.0，2026-10-22）

第三方插件与子组件使用一致的退出策略：所有前台页面在隐藏、最小化、切换、刷新后立即移出缓存，清理前台资源；只保留已登记且有时限的必要任务，完成、失败或超时后销毁旧 WebContents。随主程序预加载与退出保活设置已删除。可见独立子窗口持有自己的会话，父页退出解除引用；子窗口隐藏或最小化后也收束。

隐藏 Provider/动态指令调用采用引用计数和合并装载，最后一个调用结束释放隐藏页；Provider 调用登记为有限任务，旧页面退出不会误杀仍在完成的计算。资源登记支持主动提前释放并移除闭包，防止长时间可见页面积累已完成资源。独立市场并发查询共用一次索引请求，只在请求期间持有完整索引；最新版本缓存最多128项，索引网络缓冲最多2MiB/15秒，异常响应取消所属请求。

源码第三方压力回归（`.artifacts/runs/2026-10-21T16-19-24-640Z-e2e`）：连续8次创建并实际填充32MiB缓冲后隐藏，旧页面全部关闭且插件缓存归零。后台保存后重进、旧任务完成、超时清理，以及独立子窗口父页退出后继续可见/最小化回收均通过；最终 WebContents 回到仅宿主1个。工作集初始约589MiB、峰值740MiB、结束约543MiB。数值来自源码开发进程，未强制GC；资源数量是释放证据，工作集仅作同机辅助，不作为生产版内存承诺。后续增加并发Provider后重验结果见该次审查维护条目。

同轮原有性能专项：Session preload 连续6次保持1份，30秒闲置后仅宿主1页/工具缓存0。固定600ms复制延迟的交替对照中位数1912ms→923ms；文本菜单896ms→389ms。它们验证既有优化在更名和新策略后保持有效，不是该次审查相对上一版新增的速度收益。

迁移清理只涉及运行时资源，保留真实配置、私有数据、剪贴板与安装插件。默认数据根仅新安装使用 .tabdo；已有 .ztools 和位置指针原地兼容，旧备份格式继续可恢复。全量测试、最终预览及云端发布结果以该次审查历史条目为准。
