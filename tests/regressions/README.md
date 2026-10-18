# 历史故障回归集

收录本轮“工具、截图、剪贴板、中键、插件宿主、免安装预览”改动中实际遇到的故障，并保留相邻功能的兼容性检查。自动化测试、人工验收和待补自动化分别标记；列入清单不代表本次已执行或全部通过。

## 运行入口

清单来源为 [suites.json](suites.json)。分组允许组合，共用测试文件自动去重。以下命令在项目根目录执行：

```powershell
# 只查看后续要执行的测试，不启动服务或 Electron
pnpm test:regressions --list

# 按本次修改的范围选择分组
pnpm test:regressions clipboard
pnpm test:regressions panel --e2e
pnpm test:regressions host --e2e
pnpm test:regressions screenshot --e2e
pnpm test:regressions clipboard panel --unit
pnpm test:regressions preview --unit

# 已同步的免安装预览：只读比较当前编译产物与预览资源，不构建、不启动应用
pnpm test:preview:resources

# 需要完整复查历史故障时才执行；并非项目所有测试
pnpm test:regressions
```

日常修复优先选择相关分组，不默认运行整个历史集或项目全量回归。`--unit` 只运行单测，`--e2e` 只运行 E2E；同时传两者等同于均运行。

E2E 继续使用 `playwright.e2e.config.ts`，等价于通过 `pnpm test:e2e <文件>` 筛选已有测试。由 `scripts/preview-local.cjs --servers-only` 自动准备源码服务，使用 `scripts/preview-main.cjs` 启动隔离 Electron。不得为 E2E 打包、生成 out/dist、使用免安装成品或下载另一份 Chromium。每个实例同时隔离 `ZTOOLS_DATA_ROOT` 与 `ZTOOLS_LEGACY_USER_DATA_PATH`，不读写真实配置和插件。Windows 原生输入及截图用例需要可交互的 Windows 桌面，会移动鼠标并操作测试窗口；非 Windows 跳过不视为通过。

## 自动化场景索引

下表“覆盖位置”均相对于 `tests/`。U 表示单测，E 表示源码 Electron E2E。组合用例内的多个断言对应多个故障场景，并不等同于独立测试条数。

| 编号  | 历史故障 / 必须保持的行为                                   | 覆盖位置及关键断言                                                                                                                                                               |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CL-01 | 分类按钮切换但内容不变，较旧代码、链接被第一页普通文本淹没  | E `e2e/tools-clipboard.spec.ts`：65 条更新文本后仍能找到代码、链接；U `main/clipboardTypeDetection.test.ts`：先分类再分页                                                        |
| CL-02 | 分类缓存导致内容修改后仍归入旧分类                          | U `main/clipboardTypeDetection.test.ts`：同一记录由代码改为链接后分类立即更新                                                                                                    |
| CL-03 | 代码未高亮、链接点击不能调用默认浏览器                      | E `e2e/tools-clipboard.spec.ts`：代码 token 渲染；拦截并验证 `shell.openExternal` 地址。U `main/clipboardCategory.test.ts` 补充分类样本                                          |
| CL-04 | 首次进入、重新进入或分类刷新时自动选中最新条目              | E `e2e/tools-clipboard.spec.ts`：初始零选中、再次进入复制按钮禁用；U `main/clipboardSelectionState.test.ts`：刷新清空选择，首次向下导航才选第一项                                |
| CL-05 | 多选后 Ctrl+C 无效，或被旧 ZTools 版本检测拦截              | E `e2e/tools-clipboard.spec.ts`：在当前本地版本中，宿主搜索框获焦后 Ctrl+C 复制两个条目，无升级提示                                                                              |
| CL-06 | 多选复制按钮或右键操作丢失已选条目                          | E `e2e/tools-clipboard.spec.ts`：两个条目经侧栏按钮复制；U `main/clipboardSelectionState.test.ts`：右键已有选中项保留整组                                                        |
| CL-07 | 文件多选复制退化、失败后仍自动粘贴                          | U `main/clipboardTypeDetection.test.ts`、`main/clipboardWriteContentApi.test.ts`：过滤无效路径，多文件写入成功才自动粘贴；文本和图片不接受数组                                   |
| CL-08 | Office 文本被伴随的截图错误分类为图片                       | U `main/clipboardTypeDetection.test.ts`：真实图片、Office 文本、纯文本及空白文本边界                                                                                             |
| PN-01 | 最新复制后中键无反应                                        | E `e2e/tools-clipboard.spec.ts`：禁用传统超级面板时，通过真实 Windows 中键进入最近复制匹配                                                                                       |
| PN-02 | 超过时限仍弹出最近复制匹配；设置不生效                      | E `e2e/tools-clipboard.spec.ts`：默认 5 秒，修改为 2 秒并检查保存；超时无快速匹配。U `main/clipboardTypeDetection.test.ts`：只取最新内容、过期返回空、0 关闭                     |
| PN-03 | 快速匹配占用中键，破坏原有选中文本匹配                      | E `e2e/super-panel-selection.spec.ts`：旧剪贴板过期时仍通过真实 Ctrl+C 获取当前选中网址，出现文本头部及“打开网址”结果                                                            |
| PN-04 | 选中文件无法匹配，稍慢的复制结果被丢弃                      | E `e2e/super-panel-selection.spec.ts`：原生中键触发 Ctrl+C，延迟 300ms 写入真实 CF_HDROP，面板接收到正确文件路径与文件计数                                                       |
| PN-05 | 快速匹配与已配置的中键超级面板互相覆盖                      | E `e2e/tools-clipboard.spec.ts`：无选区且旧复制过期时打开固定面板；新复制仍进入匹配；从固定项打开内置“工具 → 剪贴板”并能切换代码分类                                             |
| PN-06 | 面板出现后，点击其他地方无法关闭                            | E `e2e/super-panel-selection.spec.ts`：文本、文件匹配后外部原生左键关闭；强制面板不获焦时连续两次打开也能关闭                                                                    |
| PN-07 | 点击外部关闭后，延迟复制完成又把面板弹回来                  | E `e2e/super-panel-selection.spec.ts`：复制未完成时点击外部，等待真实延迟事件抵达，面板仍保持隐藏                                                                                |
| HS-01 | 冷启动/重启后的第一次剪贴板进入设置，之后偶发再次出现       | E `e2e/plugin-host-regressions.spec.ts`：全新源码进程首开剪贴板，正文就绪且无设置页面；重复进入保持目标与完成态                                                                  |
| HS-02 | 打开截图顺带启动设置界面                                    | E `e2e/plugin-host-regressions.spec.ts`：走真实指令与宿主隐藏恢复链路，以取消结果替代原生截图，断言没有调用设置入口                                                              |
| HS-03 | 右上角持续加载、单例重入不结束，影响多个插件                | E `e2e/plugin-host-regressions.spec.ts`：工具与普通第三方夹具均检查首次和重复进入后的 loading 状态消失                                                                           |
| HS-04 | 插件分离后空白、正文高度为零、标题栏初始化丢失              | E `e2e/plugin-host-regressions.spec.ts`：工具与第三方夹具实际挂载视图；正文高度大于 200，正文可见，工具分离搜索占位正确。U `main/detachedWindowUpgrade.test.ts` 补充分离窗口复用 |
| HS-05 | 设置重复打开/焦点通知导致闪退、重载或关闭后自行重开         | E `e2e/settings-window-stability.spec.ts`：并发请求合并、页面保留、菜单失焦、关闭后的迟到通知、过期启动结果；E `e2e/plugin-cleanup-tray.spec.ts`：托盘恢复设置                   |
| HS-06 | 运行中的插件移除不完整，遗留 ASAR/sidecar/数据或窗口状态    | E `e2e/plugin-cleanup-tray.spec.ts`；U `main/pluginRemovalCleanup.test.ts`、`main/pluginCleanupWorker.test.ts`、`main/pluginStorage.test.ts`                                     |
| SC-01 | 截图编辑未确认就结束，确认后弹“已复制”提示                  | E `e2e/tools-screenshot.spec.ts`：编辑时结果未完成，确认后剪贴板得到有效图像，通知计数为 0                                                                                       |
| SC-02 | 长截图滚动后不拼接或只得到第一屏                            | E `e2e/tools-screenshot.spec.ts`：不发送原始 wheel，模拟滚动条/触控板路径滚动五次；长截图高度比第一屏至少增加 200px，确认仍无通知                                                |
| SC-03 | 工具名称、截图名称和重复别名回退                            | E `e2e/tools-clipboard.spec.ts`：内置名称为“工具”，截图说明为“截图”，指令数组严格为 `["截图"]`                                                                                   |
| PV-01 | 源码正常，免安装仍使用旧 preload，分类与中键设置失效        | U `scripts/portablePreviewResources.test.ts`：主程序一致但 preload 过旧必须失败；`pnpm test:preview:resources` 对实际预览逐文件比较                                              |
| PV-02 | 同步遗漏运行时 worker/原生模块/内置页面，或模块没有物理展开 | U `scripts/portablePreviewResources.test.ts`：遗漏 worker、缺失展开文件、原生模块仅在归档内、设置/工具旧页面均失败；实际预览核验覆盖 out、Windows resources 和两份内置 dist      |
| PV-03 | 隐藏暂存目录使原生依赖展开规则失效                          | U `scripts/portablePreviewResources.test.ts`：在 `.artifacts` 下实际生成归档，单个和多个展开项都必须保留标记及物理文件                                                           |
| LC-01 | 工具后台残留界面、监听、查询和模型资源                      | U `main/toolsLifecycle.test.ts`、`main/toolsHostLifecycle.test.ts`；E `e2e/tools-lifecycle.spec.ts`：旧界面销毁，后台复制仍能被宿主记录                                          |
| LC-02 | 保存未完成被退出截断、旧任务关闭新会话或写入错误命名空间    | E `e2e/tools-lifecycle.spec.ts`：保留完整保存链，旧任务结束仅销毁旧视图；U 生命周期的失败、超时和迟到模型清理                                                                    |
| LC-03 | 截图/取色或未使用的预抓帧留下原生进程                       | E `e2e/tools-screenshot.spec.ts`：完成后进程不存在，预抓帧超期退出，取色取消收束回调和 active 状态                                                                               |

PV-01/PV-02/PV-03 的单测只在临时目录创建微型资源夹具，不是为 E2E 打包应用。实际预览核验是独立只读命令，要求已有编译产物和已同步预览；它不会生成产物，也不能替代下面的数据保留与成品交互检查。

## 人工验收与尚未自动覆盖的边界

这些场景也属于后续回归集，执行时应逐项记录结果，不能用上一节通过数替代。截图工具栏是原生窗口，无 DOM；当前 E2E 会输出工具栏和长截图供检查，但没有对翻译图标、间距或拼接像素连续性作自动断言。

| 编号   | 准备与操作                                                                                                                             | 验收标准 / 当前覆盖边界                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-M01 | 打开截图，画出选区；查看工具栏并点击确定                                                                                               | 无翻译按钮；长截图与撤销之间、重做与下载之间的两个分隔间距紧凑一致；确认按钮可用且无复制成功弹窗。通知已有自动覆盖，图标和间距需人工检查                                                                  |
| SC-M02 | 对有文字、图片、重复纹理的长页面分别用滚轮、触控板、拖动滚动条滚动；覆盖慢滚、快滚、短暂停顿、到底和无变化；检查保存结果               | 不停留第一屏；无明显重复段、断层、错位；不滚动时不无限增长；结束后图像可用。自动用例只保证无 wheel 时仍增加高度                                                                                           |
| CL-M01 | 在工具剪贴板中准备文本、代码、链接、图像、文件和收藏；逐类切换、搜索、翻页、切回全部，新增和删除记录                                   | 每类内容准确，旧记录可查；刷新后零选中；大历史量分类切换响应正常。现有自动化重点覆盖文本/代码/链接和缓存正确性，未设时间阈值性能基准                                                                      |
| CL-M02 | 分别在插件正文、宿主搜索框、分离窗口标题栏多选两条并 Ctrl+C；再选中搜索框自身文字 Ctrl+C                                               | 多选条目按预期复制；搜索框有文字选区时复制选中文字。宿主搜索框和侧栏按钮已有自动化，分离标题栏及原生输入框选区优先级仍需人工检查                                                                          |
| HS-M01 | 从全新进程先开剪贴板、先开截图；关闭重启重复；依次分离工具与现有第三方插件                                                             | 均进入正确页面，不额外打开设置，无持续 loading、空白正文；保留原来插件。自动化使用隔离夹具，已有第三方插件兼容性需在预览验收                                                                              |
| HS-M02 | 检查超级面板固定项来源；分别保留外部同名“剪贴板”和新增“工具 → 剪贴板”固定项；从工具固定项进入                                          | 工具固定项打开内置页面，分类可用；不能因标题相同混淆两个来源。之前外部插件卡住已确认属于外部固定项；未自动迁移/删除用户固定项，也未将“损坏或失效的外部插件仍卡住”标为已修复。该外部失效路径待补独立自动化 |
| PN-M01 | 在资源管理器真实选择一个/多个文件、编辑器选择文本；复制前后以及超过快速匹配时限后按中键；分别开关传统超级面板和快速匹配（0 秒）        | 当前选区匹配始终优先；无选区时仅在时限内使用最新复制；过期后按原面板配置行为；窗口外点击关闭。自动化文件复制用受控 CF_HDROP，真实 Explorer 和其他应用需验收                                               |
| PN-M02 | 100%/125%/150% 缩放及双屏下，重复打开面板，点击面板内部和外部；快速关闭后立即重新触发                                                  | 内部点击可操作、外部关闭；无失焦卡住、迟到事件重开或旧选区覆盖新触发。现有自动化只覆盖当前测试桌面的 DPI/显示器及一次取消路径                                                                             |
| PV-M01 | 同步前退出预览；执行已有 `scripts/sync-portable-preview.cjs` 同步程序；核验该次 `preservation.json`；运行只读资源核验                  | 同步器逐文件比较 data/legacy 的前后 SHA-256，已有配置、插件和旧数据完全不变；资源核验通过。只读核验本身不证明同步前后数据保留                                                                             |
| PV-M02 | 用根目录 `PreviewPortable.cmd`（指向 `.local/portable-preview/Start-Preview.cmd`）打开已同步成品，复测分类、中键、首次启动、截图和分离 | 成品与源码专项结果一致，启动沿用隔离预览数据目录。不得直接双击 exe 导致读到真实用户目录；人工使用带来的正常数据变化不应与同步破坏混为一谈                                                                 |

## 留存结果

E2E 截图与失败 trace 保存在 `test-results/playwright`，不提交。插件页面截图直接截取 WebContentsView，等待正文稳定特征后只截当前可见区域；原生截图编辑器使用屏幕捕获单独留证，不与宿主拼接。

复查记录至少包含：日期、修改版本/工作区状态、执行命令、场景编号、自动化通过/失败/跳过、人工项结果、源码或免安装预览、Windows 缩放与显示器信息。资源同步另保留该次 `preservation.json` 路径和 `test:preview:resources` 文件数。没有执行的场景标记“未执行”，待补自动化标记不随测试通过自动关闭。
