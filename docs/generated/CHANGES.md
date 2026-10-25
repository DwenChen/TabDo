# 变更索引

> 自动生成；原始记录在 [entries](../history/entries/)。

## 2026-10-25 · 发布悬浮中转、宿主临时常驻与剪贴板交互优化版本

记录：[release-tabdo-1.2.0](../../docs/history/entries/2026-10-25-03-release-1.2.0.json)；版本：1.2.0。

- 当前用户明确授权push、云端构建和release；保留前几轮全部功能与修复，不推导数据重置授权。
- 版本由1.1.1更新为1.2.0，更新发布说明；按现有Release TabDo流程发布Windows x64安装包、免安装ZIP及更新元数据。

- 验证：已依次读取维护流程、改动索引、Bug台账与发布规范，检查Git状态和现有未提交文件。git fetch后main与origin/main一致，hooks保持启用。
- 验证：发布候选完整pnpm test --maxWorkers=2通过103文件699项，归档.artifacts/runs/2026-10-25T04-20-06-403Z-unit。
- 验证：发布候选6个受影响源码E2E全部通过：clipboard-interactions、floating-relay、local-tutorial、tools-expanded、tools-lifecycle与tools-polish，归档.artifacts/runs/2026-10-25T04-21-07-174Z-e2e。使用scripts/preview-main.cjs和隔离data/legacy，不为E2E打包。
- 验证：pnpm lint、pnpm typecheck:setting和4份修改的公共JS/preload语法检查通过。远端正式版为1.1.1，候选1.2.0尚未存在。
- 验证：pnpm build包含宿主Node/Web类型检查、设置/工具插件和宿主编译全部通过；既有设置跨chunk循环依赖警告保留。编译用于预览交付，E2E仍直接加载源码。
- 验证：pnpm preview:sync同步1.2.0程序资源，原有data/legacy共173文件前后路径与SHA-256完全一致，收据.artifacts/backups/preview-sync/update-1792902275792/preservation.json；原程序资源保留在同目录previous-resources。未启动成品或重置资料。
- 验证：pnpm test:preview:resources通过，核对95程序、246内置插件及1676媒体资源；pnpm maintain、maintain:check与git diff --check通过。候选暂存只包含本轮源码、图标、文档、测试和版本说明，不包含日志、备份、资料或凭据。

## 2026-10-25 · 剪贴板与中转提示自动消失，扩大勾选区域并恢复右侧排序手柄

记录：[relay-feedback-hit-area-and-reorder-handle](../../docs/history/entries/2026-10-25-02-relay-feedback-hit-area.json)；版本：未发布。

- 根据用户补充截图定位剪贴板底部弹窗与中转底部红色反馈，两处增加自动清除和重复触发重置计时，退出清理计时器。
- 剪贴板与中转左侧整列均可勾选，不再触发正文拖出；中转排序手柄恢复到删除按钮左侧，保留正文拖出和多选。
- 同步工具规范、指令清单、本地教程与TX-86回归分组。

- 验证：开始时保留已有未提交内容；未重置预览资料，未push、未云端构建、未release。
- 验证：pnpm test:e2e floating-relay与clipboard-interactions两个源码专项全部通过，归档.artifacts/runs/2026-10-25T04-09-20-337Z-e2e。验证排序结果提示自动清除、禁止提示4秒清除、相同错误重新触发后重置计时、左侧边缘勾选、左列系统拖动不交付内容、删除按钮左侧手柄排序，以及真实文本/文件/图片拖放、删除清空、关闭销毁和取消常驻回收。
- 验证：所有E2E从scripts/preview-main.cjs加载源码并隔离data/legacy，不为测试打包。node --check与改动Vue/E2E的ESLint通过，pnpm test:regressions relay-feedback --list确认2个专项。
- 验证：pnpm build通过，包含Node/Web类型检查、设置/工具插件与宿主编译，仅用于预览交付；原有设置跨chunk循环依赖警告保留。pnpm maintain、maintain:check及git diff --check通过。
- 验证：pnpm preview:sync已更新1.1.1本地预览，173个原有data/legacy文件的路径与SHA-256前后完全一致；收据.artifacts/backups/preview-sync/update-1792901489784/preservation.json，程序回退位于同目录previous-resources。
- 验证：pnpm test:preview:resources通过，独立核对95项程序资源、246个内置插件文件与1676项媒体依赖。提示计时、整列勾选和右侧手柄均已同步，未启动成品或改动已有配置与已安装插件。

## 2026-10-25 · 移除中转条目两侧操作手柄，恢复左侧勾选多选

记录：[relay-checkbox-selection-and-simple-rows](../../docs/history/entries/2026-10-25-01-relay-checkboxes.json)；版本：未发布。

- 按用户最新要求移除逐条排序与拖出图标，左侧改为勾选框；保留删除按钮。
- 恢复勾选、Ctrl切换、Shift范围和全选快捷键；同类型选择按显示顺序合并复制或拖出，混合文本图片文件仍禁止并明确反馈。
- 直接拖动正文进行外部粘贴，Alt拖动或上移/下移按钮继续支持手动排序；删除与清空仍只清理中转内容。

- 验证：开始时存在前几轮未提交内容，按用户最新要求恢复勾选多选，保留其他改动。未push、未云端构建、未release，未重置用户或预览资料。
- 验证：3个相关单测文件18项通过，归档.artifacts/runs/2026-10-25T03-09-49-501Z-unit；本轮不把上轮699项结论当作当前全量执行结果。
- 验证：floating-relay源码专项最终通过，归档.artifacts/runs/2026-10-25T03-17-26-659Z-e2e：两侧手柄不存在、左侧复选框勾选两条、按显示顺序合并复制、Shift范围及Ctrl+A取消全选、Alt正文拖动和按钮排序、删除/清空、混合选择复制与拖出可见禁止反馈。
- 验证：最终floating-relay实际用Windows系统鼠标从正文拖动两条选中文本到独立窗口textarea，核对中转第二条与中转第一条由空行分隔；TXT与PNG分别进入drop.files，未以DOM派发或调用标志代替接收。
- 验证：原生拖放早期出现未接收结果，失败归档保留。排查后夹具在每次系统拖动前显式聚焦源窗口，避免CDP点击不等同于Windows激活；原生拖放改用单向IPC和同步本地图标，不在鼠标手势期间等待系统图标查询，最终实收通过。
- 验证：clipboard-interactions通过见.artifacts/runs/2026-10-25T03-06-26-138Z-e2e中的1项通过；local-tutorial通过见.artifacts/runs/2026-10-25T03-11-51-973Z-e2e中的1项通过，两个归档的其他失败均保留并由后续专项修正，不宣称整轮全通过。
- 验证：所有E2E从scripts/preview-main.cjs加载源码并隔离data/legacy，不为测试打包。改动TS和E2E的ESLint零错误零警告，中转JS/preload的node --check通过。
- 验证：当前规范、清单、教程正文与剪贴板SVG已同步，TX-85标明恢复多选并替代旧单选要求；pnpm test:regressions floating-relay --list确认5个单测文件与4个源码专项，pnpm maintain、maintain:check和git diff --check通过。
- 验证：最后宿主拖放通道调整后再次执行相关3文件18项单测并通过，归档.artifacts/runs/2026-10-25T03-19-36-615Z-unit；pnpm build最终通过（Node/Web类型、设置与工具插件、宿主编译），仅用于预览交付，原有设置跨chunk循环依赖警告保留。
- 验证：pnpm preview:sync更新1.1.1本地预览，169个既有data/legacy文件前后路径和SHA-256逐项一致，收据.artifacts/backups/preview-sync/update-1792898472668/preservation.json，回退程序位于同目录previous-resources。未重置配置、收藏、历史或已安装插件，未启动成品。
- 验证：pnpm test:preview:resources通过，核对95项程序资源、246个内置插件文件与1676项媒体依赖；复选框界面、已移除的手柄、批量操作和原生拖放通道均已同步。

## 2026-10-24 · 补全中转入口多选反馈、单条管理和手动排序，修复取消临时常驻未回收

记录：[relay-single-item-management-and-residency-release](../../docs/history/entries/2026-10-24-06-relay-management.json)；版本：未发布。

- 保留工作区既有未提交内容；剪贴板侧栏中转按钮显示选择数量、选中样式与转交状态，并转入全部选中条目。
- 中转窗口取消多选、复选框及全选，Ctrl/Shift也只选一个；混合文本、图片、文件的复制或拖出明确禁止，普通文件集合保留文件传输语义。
- 增加单条删除与清空，清理会话图片及容量，不删除原文件和剪贴板历史；清空后继续接收新复制。
- 支持独立手柄拖动排序、上移/下移与Alt方向键；手动排序后新复制追加末尾，仍可切回时间排序。
- 用户取消临时常驻立即关闭所属独立会话并进入原有回收链，已登记任务正常收尾，配置和插件不受影响。

- 验证：开始时已有上一轮未提交内容，在其上增量修改，未回滚或清理用户文件；本轮不push、不云端构建、不release、不重置资料。
- 验证：pnpm typecheck通过；完整pnpm test --maxWorkers=2最终103文件699项全通过，归档.artifacts/runs/2026-10-24T07-20-01-041Z-unit。相关3文件11项先行验证通过，归档.artifacts/runs/2026-10-24T07-16-22-437Z-unit。
- 验证：floating-relay最终源码E2E通过，归档.artifacts/runs/2026-10-24T07-21-23-665Z-e2e：Ctrl单选且无复选框/全选、上移与真实拖动排序、手动追加、不同类型选择禁止提示、宿主绕过UI混合复制拒绝、单条删除清理PNG、清空后继续采集、保留原文件、取消常驻无需隐藏即关闭正文与标题栏。
- 验证：中转源码专项通过真实Windows系统鼠标向独立原生窗口拖动，文本实际进入textarea，TXT与PNG分别进入drop.files；中转只交付当前一条，不再一起拖出不同条目。
- 验证：clipboard-interactions、tools-polish和local-tutorial源码专项通过见.artifacts/runs/2026-10-24T07-18-49-331Z-e2e的3项通过；同轮floating-relay因隐藏界面暂停刷新而未找到历史的测试夹具失败，切换真实分类刷新后单独重跑通过，不宣称该轮全部通过。
- 验证：clipboard-interactions确认侧栏多选显示2项和选中样式，点击侧栏按钮真实转入两条；其早期失败因新复制生成同文历史而触发夹具严格定位，改用原始条目后通过。保留失败归档.artifacts/runs/2026-10-24T07-16-22-344Z-e2e。
- 验证：全部E2E从scripts/preview-main.cjs直接加载源码并隔离data/legacy，不为E2E打包；直接保留稳定中转和工具正文截图。更新当前规范、教程正文、剪贴板SVG及TX-84回归记录。
- 验证：43个改动JS/TS/Vue文件ESLint零错误零警告，中转JS/preload的node --check及git diff --check通过。pnpm build通过（类型、设置/工具插件及Electron宿主），仅用于预览交付；设置构建原有两个跨chunk循环依赖警告保留，未扩展到无关重构。
- 验证：pnpm test:regressions floating-relay --list确认5个单测文件和4个源码专项；pnpm maintain与maintain:check通过。
- 验证：pnpm preview:sync成功更新本地1.1.1免安装预览；165个原有data/legacy文件前后路径及SHA-256完全相同，收据.artifacts/backups/preview-sync/update-1792826739365/preservation.json；未启动成品或重置配置、历史、收藏及已安装插件。
- 验证：pnpm test:preview:resources通过，核对95项程序资源、246个内置插件文件与1676项媒体依赖；本轮中转单选、删除/清空、手动排序、侧栏状态与常驻取消的程序资源已同步。

## 2026-10-24 · 统一宿主临时常驻入口，新增悬浮中转并调整材质、品牌及便签编辑

记录：[floating-relay-and-host-residency](../../docs/history/entries/2026-10-24-05-floating-relay.json)；版本：未发布。

- 保留本轮开始前已有未提交改动；Windows 11缺省材质改为云母，其余系统无材质，已有选择不覆盖。超级面板默认图标使用TabDo品牌资源。
- 便签撤销/重做移至右上角，右键移除撤销、重做和全选，保留剪切复制粘贴。
- 临时常驻能力由开发者声明，用户开关统一由宿主标题栏右上角提供，使用窗口加号图标，正文不能自动启用常驻。
- 悬浮中转接收指定文本、图片、文件和打开后的复制，提供排序、取消全选、缩略图预览、复制和拖出，关闭清理会话内容但保留剪贴板记录。图片固定与标记保持独立。
- 新增悬浮中转普通与文本/图片/文件匹配指令，保留悬浮图片匹配；同步模块文档和本地图文教程。

- 验证：开始时存在上一轮未提交内容，本轮在其上增量修改并保留；不push、不云端构建、不release、不重置真实或预览资料。
- 验证：pnpm typecheck通过；pnpm test --maxWorkers=2最终103文件698项全通过，归档.artifacts/runs/2026-10-24T06-47-13-125Z-unit。旧常驻接口测试最初4项失败，按声明能力与宿主点击的新契约更新为6项后通过，保留失败证据。
- 验证：源码floating-relay最终通过，归档.artifacts/runs/2026-10-24T06-49-13-858Z-e2e：空入口不载历史、系统文本图片文件追加、两种排序、全选/取消、缩略图放大、复制后紧接外部复制不丢失、关闭销毁图片副本且保留用户文件、重开为空、普通及匹配指令、宿主固定常驻开关。
- 验证：floating-relay通过真实Windows鼠标跨窗口拖动：一条文本实际进入独立原生窗口textarea，图片PNG和用户TXT一起进入drop.files；未以DOM派发或startDrag标志代替实际接收。初版正文起拖不稳定，增加明确手柄后真实接收通过。
- 验证：clipboard-interactions通过，归档.artifacts/runs/2026-10-24T06-47-13-064Z-e2e：便签顶部撤销/重做、原生右键仅剪切复制粘贴、字号、多选文本/图片原生拖出、常驻默认关闭/分离/隐藏保留/取消及明确关闭释放。早期失败包括旧按钮位置断言及采集迟到混入新窗口，均已修正重跑。
- 验证：tools-expanded与tools-polish通过，归档.artifacts/runs/2026-10-24T06-42-45-581Z-e2e；local-tutorial与tools-lifecycle通过，归档.artifacts/runs/2026-10-24T06-39-36-230Z-e2e。这些归档中其他失败项已由后续专项修正，不宣称整轮全通过。
- 验证：全部E2E使用scripts/preview-main.cjs源码与隔离data/legacy，未为E2E打包。真实接收测试设置可见独立窗口并转换DIP至系统物理坐标；当前Windows单屏及1.375缩放，其他环境不作已验收承诺。
- 验证：本地图文教程正文和clipboard/notes两张SVG示意更新；超级面板默认图标与resources/icons/icon-tabdo.png的SHA-256相同。
- 验证：pnpm build通过（Node/Web类型、设置插件及工具插件、Electron宿主编译），仅用于交付预览；设置构建原有两个跨chunk循环依赖警告保留，不影响本次退出状态。39个改动JS/TS/Vue文件ESLint零错误零警告，公共preload、便签与中转JS/preload的node --check通过，git diff --check通过。
- 验证：pnpm test:regressions floating-relay --list确认4个单测文件与4个源码E2E文件；pnpm maintain、maintain:check均通过。各专项真实结果和失败修正见上文。
- 验证：pnpm preview:sync成功更新1.1.1程序资源，163个既有data/legacy文件更新前后路径与SHA-256完全一致；收据.artifacts/backups/preview-sync/update-1792824758498/preservation.json，回退程序在同目录previous-resources。未启动成品、重置资料或修改已安装插件。
- 验证：pnpm test:preview:resources通过，核验95程序资源、246内置插件文件和1676媒体依赖；同步器同时核对96项暂存程序清单。本轮中转HTML/JS/CSS/preload及教程SVG、工具新图标均已交付，构建警告与设备人工边界如上记录。

## 2026-10-24 · 优化便签编辑、独立文本悬浮、剪贴板多选拖出与临时常驻，统一设置控件

记录：[clipboard-interactions-and-residency](../../docs/history/entries/2026-10-24-04-clipboard-interactions.json)；版本：未发布。

- 便签默认14px，字号完成编辑后校验，原生右键提供剪切复制粘贴与撤销。
- 剪贴板文本与悬浮内容指令使用独立文本条目窗口，支持追加、选中、多选、复制与拖出，和便签互不混用。
- 图片悬浮按钮处理当前多选图片；文本使用标准文本拖放，图片通过宿主原生多文件拖出。收藏排序继续使用独立手柄。
- 提供setTemporaryResident/isTemporaryResident会话属性接口；剪贴板右上角启用时转入独立窗口，临时隐藏或最小化保留，明确关闭及退出仍释放，不保存状态。
- 通用表单控件统一34px高度与材质背景，关于教程入口沿用普通按钮；同步子组件、插件、设置开发规范。
- 同时修正关闭中的便签仍被追加路由命中、连续新建不能立即重置编号的边界；文本浮窗限定1000条/100万字符，初始化追加不提前显示空窗。

- 验证：初始Git状态干净；已依序阅读维护流程、改动索引、Bug台账与相关模块规范；本轮未获远端授权，不push、不云端构建、不release、不重置预览资料。
- 验证：pnpm test --maxWorkers=2最终102文件691项全部通过，归档.artifacts/runs/2026-10-24T04-57-57-893Z-unit；最终便签关闭路由调整后另跑floatingPointer与temporaryResidencyApi共17项通过，归档.artifacts/runs/2026-10-24T05-04-06-270Z-unit。
- 验证：首轮全量单测暴露文本浮窗静态导入提前初始化LMDB，导致旧窗口替身失败；改为按文本类型动态加载后全量通过。失败归档.artifacts/runs/2026-10-24T04-56-34-852Z-unit保留。
- 验证：源码clipboard-interactions最终通过，归档.artifacts/runs/2026-10-24T05-05-07-057Z-e2e：便签14px、清空后连续输入18、原生上下文菜单复制与粘贴；独立文本条目多选复制/追加与初始化并发有序，同便签相互隔离。
- 验证：专项通过真实系统鼠标跨窗口拖动：两条原始文本到独立原生窗口textarea、两张PNG到drop.files并核对收到文件名；未以DOM派发或startDrag调用标志代替实际接收。两张选中图片一键分别悬浮。
- 验证：临时常驻实际迁移当前页面，最小化和隐藏后页面仍在；取消后隐藏销毁，重新进入默认关闭，常驻时明确关闭仍销毁。第三方API单测验证调用者身份、分离失败不保活、会话状态隔离。
- 验证：早期源码专项失败分别暴露脚本top全局命名冲突、preload错误转发新IPC，以及未等待原生复制完成就写入下一份剪贴板的测试竞态；已修正并重跑。原生拖放夹具额外置顶以排除桌面其他程序遮挡，不改变产品置顶默认值。
- 验证：相邻tools-polish通过，归档.artifacts/runs/2026-10-24T05-00-57-151Z-e2e；tools-expanded、tools-lifecycle、local-tutorial通过见.artifacts/runs/2026-10-24T04-56-16-208Z-e2e中的3项通过（同轮另外2项失败已专项修正）；教程正文最终更新后local-tutorial再次通过，归档.artifacts/runs/2026-10-24T05-02-45-237Z-e2e。
- 验证：真实设置入口检查明暗×三材质控件外框34px与数字框背景、关于页全部普通按钮样式一致，保留文本浮窗、便签编辑与关于页直接截图。当前Windows单屏1397×786 DIP、scaleFactor1.375；WebContents透明通道不代表DWM最终观感。
- 验证：pnpm build最终通过（Node/Web与设置类型检查、两内置插件构建、宿主编译）；该构建只用于预览交付，所有E2E独立从scripts/preview-main.cjs加载源码与隔离data/legacy。改动文件ESLint零错误零警告，公共preload、便签与新文本浮窗脚本node --check通过。
- 验证：pnpm test:regressions clipboard-interactions --list确认4个单测文件、4个源码专项；pnpm maintain、maintain:check和git diff --check通过。
- 验证：pnpm preview:sync成功同步程序资源，原有data/legacy共157个文件前后路径及内容SHA-256完全一致；收据.artifacts/backups/preview-sync/update-1792818410097/preservation.json，程序回滚副本在同目录previous-resources。未启动成品或重置数据。
- 验证：pnpm test:preview:resources通过，核验96程序文件、244内置插件文件及1676媒体依赖；新增文本浮窗HTML/JS/CSS/preload及更新便签与公共preload的物理展开字节逐一与源码相同。

## 2026-10-24 · 彻底移除全屏引导，以12章本地图文教程替代并发布补丁版

记录：[local-illustrated-tutorial](../../docs/history/entries/2026-10-24-03-local-tutorial.json)；版本：1.1.1。

- 按本次用户指示替换不稳定全屏引导，并授权push、云端构建和release；不推导数据重置授权。
- 删除全屏教学、隔离子进程、运行资料与样例管理、焦点豁免、模拟提供商和Everything接口及专用资源；首次启动不再自动展示。
- 关于页新增本地图文教程入口，旧路由保留为教程页面；12章、70项操作步骤、24条问题说明与12张原创SVG，具备章节目录、全文关键词筛选、上下章及返回。
- 保留原配置、旧引导状态及遗留目录、历史和已安装插件，不再主动读取或清理旧练习资料。既有未提交清理记录保持。

- 验证：已检查Git状态与既有清理记录；依次阅读维护、索引、Bug台账、模块与发布要求。按功能链盘点后删除29个全屏引导专用文件、页面标记及模拟服务分支；rg确认运行源码、资源和测试中不再存在旧环境变量、IPC及教学DOM标记。
- 验证：Node/Web类型检查、设置插件类型检查通过；相关改动ESLint为0错误（resources/preload.js按仓库配置忽略，另以node --check通过），公共preload及tools-files语法检查通过。
- 验证：首次完整单测暴露一条仍调用已删除教学接口的遗留用例，按功能移除后重跑完整pnpm test --maxWorkers=2：101文件687项全部通过，归档.artifacts/runs/2026-10-24T02-57-00-595Z-unit。
- 验证：首次教程E2E夹具误从插件页调用宿主launch，改为主渲染器真实入口后通过；最终pnpm test:e2e运行local-tutorial、settings-cleanup与native-shutdown三项全部通过，归档.artifacts/runs/2026-10-24T02-58-23-058Z-e2e。
- 验证：源码E2E从真实设置关于入口读取全部12章与插图，阻断外网后检查目录、全文关键词筛选、空结果、翻页、返回和明暗截图；新资料与带旧引导标记重启均无全屏或练习目录，旧状态、显式空固定列表、数据库与插件文件哨兵保留。未把源码服务请求视为离线成品执行。
- 验证：pnpm build含Node/Web类型检查、设置与工具构建及宿主编译通过；最后公共脚本注释更新后补跑build:tools。编译仅用于程序交付，E2E均通过源码入口与隔离资料执行。
- 验证：pnpm preview:sync成功同步1.1.1程序资源，逐文件保留现有113个data/legacy文件，未重置或启动成品；回滚程序资源位于.artifacts/backups/preview-sync/update-1792810847926/previous-resources。
- 验证：pnpm test:preview:resources通过，预览归档中旧全屏资源与guide-samples均已移除，13个教程资源逐文件与源码一致；收据.artifacts/work/local-tutorial/preview-tutorial.json。
- 验证：pnpm maintain、maintain:check、usage-guide回归清单与git diff --check通过；已读取当前远端发行列表，v1.1.1尚不存在。推送与云端产物核验已完成，见后续条目。
- 验证：88个已审阅文件通过pre-commit提交82e23f2613d92a7cace8552caf7851bb530573cf，经pre-push推送main；全新v1.1.1注释标签解引用为同一提交。只以标签push触发一次云端工作流，未移动既有标签或覆盖已发布版本。
- 验证：云端运行40056793620的build作业120761428146与publish作业120762141094均首次成功；Node22/pnpm9.15.9执行维护校验、两组宿主与设置类型检查、101文件687单测及Windows打包。verification制品12545956643与win-x64制品12545637926归属候选SHA，收据.artifacts/work/local-tutorial/workflow-evidence.json。
- 验证：v1.1.1于2026-10-24 11:08:38（Asia/Shanghai）正式发布，release ID422482993；非草稿、非预发布，标签解引用与target_commitish均为候选82e23f2613d92a7cace8552caf7851bb530573cf。
- 验证：四项资产实际下载并全部核对GitHub SHA-256：setup.exe129156440字节、ZIP176079037字节、blockmap135739字节和latest.yml5537字节；更新清单版本1.1.1、所引用安装包文件名、大小与SHA-512一致。收据.artifacts/work/local-tutorial/release-verification.json。
- 验证：ZIP共491条目、ASAR3617条目；核对应用版本、许可证、更新仓库身份、46项源文件/教程资源及编译教程正文，旧全屏资源与guide-samples为0，不含项目个人资料目录。私有核验脚本的Windows ASAR路径分隔符已规范化后通过，未修改发布产物。收据.artifacts/work/local-tutorial/package-verification.json。
- 验证：安装包与主exe的FileVersion均1.1.1；云端主exe同步到固定预览前确认退出，原exe已备份，data/legacy共113文件前后路径及SHA-256完全一致。主程序ProductVersion1.1.1.0；再次test:preview:resources通过91程序、244内置、1676媒体依赖核验。未启动成品或重置资料，收据.artifacts/work/local-tutorial/preview-executable.json。

## 2026-10-24 · 清理历史版本与预览资料备份、下载包和运行缓存

记录：[local-history-backups-cache-cleanup](../../docs/history/entries/2026-10-24-02-local-cleanup.json)；版本：未发布。

- 按当前用户明确要求清理项目内历史版本、免安装预览历史配置及插件资料备份、运行缓存和临时材料；不重置当前资料，不修改Git历史或执行远端操作。
- 清理.artifacts/backups、downloads及旧history归档，删除过期诊断脚本、参考副本、解包目录和重复测试输出；原始自动测试归档、发布核验JSON及验证日志继续保留。历史记录中的被清理备份路径只代表当时事实，不再代表本机仍可恢复。
- 仅清理预览浏览器根与分区的明确缓存、日志和temp，以及项目Vite缓存；保留源码预览LMDB、配置、剪贴板、浏览器会话、插件及插件资料，保留当前免安装程序和构建依赖。
- 删除前检查Git与进程，校验绝对路径边界及目录链接，生成明确删除清单与当前预览逐文件SHA-256清单；清理后验证程序与持久资料保持一致。

- 验证：工作前Git main工作区干净；已阅读维护流程、改动索引、Bug台账、Agent指南、设置规范及备份迁移文档。
- 验证：进程检查没有项目相关程序运行；免安装预览data和legacy均为空，源码预览有独立资料，不按历史备份处理。
- 验证：按79个明确目标完成删除，累计162014个文件、14911285031字节（13.887 GiB逻辑大小，不等同于实测磁盘空间增量）；清单全部目标已不存在。详细本机收据位于.artifacts/cleanup-2026-10-24/before.json及result.json。
- 验证：清理前后2067个当前预览程序及持久资料文件的路径、SHA-256完全一致；免安装data和legacy仍各0文件。392份原始测试归档、发布核验收据和验证日志保留。
- 验证：清理前后pnpm test:preview:resources均通过：97项程序资源、236项内置资源、1676项媒体依赖一致。未修改业务代码，本轮未运行单测或E2E，也未启动预览。
- 验证：仓库其余目录补充扫描未发现遗漏的备份压缩包或临时文件；本轮临时清理脚本和清理后空目录移除，仅保留审计清单与结果。
- 验证：收尾pnpm maintain、pnpm maintain:check与git diff --check均通过；最终Git差异仅包含本轮历史记录和自动生成的改动索引，无业务源码变化。

## 2026-10-24 · 发布TabDo1.1.0全屏实操教学并核验云端成品

记录：[guide-v110-release](../../docs/history/entries/2026-10-24-01-guide-release.json)；版本：1.1.0。

- 当前用户指示“现在push到仓库，并完成后续流程”；按发布指南执行提交推送、Windows云端构建、正式Release和产物核验。发布不推导再次重置数据。
- 本轮将近期未提交的使用引导完整链与测试、维护记录一并审查提交；更新package.json和changelog为1.1.0，保留已发布1.0.0及历史标签。
- 使用全新v1.1.0标签作为唯一工作流触发入口，不重复手动派发，不覆盖既有发行产物。

- 验证：工作前检查main分支、未提交清单、Git hooks和发布文档；fetch后origin/main与本地HEAD同为1f73272e17bd78147a4c48998c5e144f641c9163。GitHub最新正式版本为v1.0.0。
- 验证：前一轮生产源码冻结后107文件729项单测、类型检查、ESLint与build通过；五项源码E2E最终归档.artifacts/runs/2026-10-23T16-04-04-896Z-e2e，主线42完成/8跳过、52份原生可见性记录，包含已同步免安装物理资源探针。
- 验证：1.1.0版本候选重新执行pnpm test，107文件729项全部通过，归档.artifacts/runs/2026-10-23T16-19-49-883Z-unit；pnpm build含Node/Web类型检查及设置、工具、宿主编译通过，另行typecheck:setting通过。日志.artifacts/work/guide-redesign/release-unit.log及release-build.log。
- 验证：提交范围只读审查通过，近期使用引导基础链及重做应完整纳入，无个人资料、配置、已安装插件、日志或构建输出；原创练习素材7份共179894字节。
- 验证：1.1.0执行preview:sync及test:preview:resources通过，98项程序同步，97程序/236内置资源/1676媒体依赖核验；data与legacy仍空，0份资料前后保持，不启动成品或再次重置。程序回滚副本.artifacts/backups/preview-sync/update-1792772485863/previous-resources。
- 验证：pnpm maintain、maintain:check及差异检查通过，91个已审查文件经pre-commit提交756ce1df8fc6585b8313055360a53b03678712eb并经pre-push推送main；全新v1.1.0标签经hook单独推送，远端main及标签均核对为该提交。
- 验证：标签push触发唯一云端运行39986556716，运行SHA与候选一致。普通main推送没有重复派发，未覆盖1.0.0。
- 验证：云端首轮Node/Web/设置页类型检查通过；单测728通过、Everything原生IPC测试夹具10秒启动超时1项失败，打包和发布未执行。诊断.artifacts/work/guide-release/cloud-failure-summary.json、cloud-failure.log及运行attempt1原始证据保留。相同用例以CI参数本机复验通过，归档.artifacts/runs/2026-10-23T16-28-04-744Z-unit；未改源码或断言，重试失败作业一次，仍为同一SHA和run的attempt2。
- 验证：云端attempt2构建与发布均成功，Node22/pnpm9.15.9执行107文件729项单测全通过；build job120528911197、publish job120531305903。成功原始日志.artifacts/work/guide-release/cloud-build-success.log；verification（12515104522）和win-x64（12516690830）制品归属同一候选SHA，工作流与制品元数据收据workflow-evidence.json。
- 验证：v1.1.0于2026-10-24 00:34:22（Asia/Shanghai）正式发布，release ID422076565，非草稿、非预发布；标签与target_commitish均为756ce1df8fc6585b8313055360a53b03678712eb。未移动既有标签或覆盖1.0.0。
- 验证：四项正式资产全部实际下载到.artifacts/downloads/TabDo-v1.1.0并核对GitHub SHA-256：安装包129338245字节、免安装ZIP176267610字节、blockmap135638字节、latest.yml4719字节；更新清单版本、文件名、大小与SHA-512均匹配。收据.artifacts/work/guide-release/release-verification.json。
- 验证：ZIP共490个条目（441文件），ASAR3623条；应用与PE版本、安装/更新身份、许可、图标、5项引导物理资源、115个内置public文件及新运行时标记通过静态核验，136项文件比较。源文件按精确发行Git提交及eol规则比较，收据.artifacts/work/guide-release/package-verification-1.1.0.json。私有探针初始Windows ASAR虚拟根分隔符及文件API路径格式已修正；本机LICENSE旧CRLF工作副本与发布LF差异经正文及提交字节核对一致，未改发布资产。
- 验证：本地预览补充替换已验收云端TabDo.exe，FileVersion1.1.0、ProductVersion1.1.0.0；原exe备份.artifacts/backups/guide-v110-executable/2026-10-23T16-41-42-433Z-79975720。切换前确认退出，data/legacy前后均空且指纹一致；最终test:preview:resources再次通过97程序/236内置/1676媒体依赖。未启动成品，首次欢迎状态保留。
- 验证：收尾执行pnpm maintain、pnpm maintain:check与git diff --check，通过hooks单独提交推送发行验收记录；v1.1.0保持原云端构建提交。

## 2026-10-23 · 重做全屏实操教学、剪贴板会话与首次启动选择

记录：[guide-interactive-teaching-redesign](../../docs/history/entries/2026-10-23-08-guide-redesign.json)；版本：未发布。

- 保留工作区既有未提交成果，重新梳理引导控制器、工具会话、鼠标触发与首次启动链。
- 删除代替用户复制的按钮，提供可选取的练习文字，由用户实际复制、中键呼出超级面板并选择剪贴板。练习独占鼠标触发期间暂停正式实例的面板输入，退出恢复，不停止正式剪贴板采集或修改正式配置。
- 按章节拆分连续教学，细化剪贴板搜索、收藏与悬浮，以及便签编辑、样式、新建和贴边收展；高亮跟随真实控件与菜单选项。
- 同工具连续步骤保留当前会话，恢复操作合并并发并设置有界等待，退出始终可用；复制序号与当前发布结果区分旧操作和迟到输出。明确非默认参数目标避免准备期误采，重命名与媒体连续步骤继承操作前文件基线。
- 首次全新资料启动直接显示全屏欢迎选择，用户可拒绝，关于入口可重新进入。浮窗按实际创建身份排序、换目标时提升和错位，避免新便签被旧窗口覆盖；鼠标透传按帧频更新且只在命中状态改变时调用原生接口。
- 按用户测试现场指出的设置页覆盖问题，进入工具教学时释放隔离实例旧设置前台，正式关于窗在欢迎接管后收起、退出后重开；同一宿主换新工具按WebContents身份重新提升，而不只缓存窗口ID。增加Windows原生HWND命中和实际屏幕验收，不能用CDP能操作隐藏页面替代可见性。引导快捷键文本只展示Windows写法。
- 真实选图与保存对话框打开时，覆盖层暂隐并暂停检查；选择、取消或失败后恢复，退出后的迟到结果不能复活页面。沿用受控file-input拦截，取消文件读取、阻止重复弹窗及退役页面回填；会话WeakMap保留用户所选File的实际路径，正式实例沿原API直通。图片标记独立保存同样纳入原生对话框让位。
- Windows隔离主工具切入教学卡片时按本次准确窗口身份保留可见，转到外部程序仍按既有失焦策略收束；退出撤销监听，不按URL或全局标记放宽所有窗口。网页快开必须保存明确非默认名称，初始页面直接保存不计完成。
- 本轮用户明确授权将优化同步免安装预览，并备份后还原为初始资料状态。

- 验证：鼠标交接单测18项通过，归档.artifacts/runs/2026-10-23T14-37-26-700Z-unit；验证暂停期间不触发、拒绝旧回调、退出恢复当前配置。
- 验证：全量105文件712项单测通过，.artifacts/runs/2026-10-23T15-03-58-517Z-unit；后续迟到输出防护连同运行时专项17项通过，.artifacts/runs/2026-10-23T15-07-28-224Z-unit。
- 验证：首次欢迎自动弹出、拒绝后清理与重启不重复，以及物理资源缺失/脚本缺失/正常首帧两项源码E2E通过，.artifacts/runs/2026-10-23T14-45-32-998Z-e2e。
- 验证：Node、Web、设置页类型检查及最终修改范围ESLint通过；resources下浏览器JS/CJS按仓库规则不纳入TS lint，node --check通过。本地pnpm build完成，日志.artifacts/work/guide-redesign/build.log，未执行electron-builder或远端操作。
- 验证：早期失败归档保留：旧按钮及旧完成协议断言、菜单文本与菜单行几何比较、首帧原生窗口边界读取时序已修正；主宿主搜索框漏定位、新便签枚举顺序与遮挡等真实问题由逐步源码E2E发现并修复。
- 验证：用户指出旧设置页遮挡后新增原生验收；15-15-17旧完整CDP主线通过只作为操作和文件结果证据，不能证明实际屏幕可见。15-23-35原生专项到crop后主动退出，图片标记/处理/裁剪窗口关键点Direct/Effective/Expected HWND和child PID一致且Visible=true；三张desktopCapturer整屏已逐张查看，正确工具位于前台。归档.artifacts/runs/2026-10-23T15-23-35-751Z-e2e。
- 验证：原生对话框scope、file-input取消与原API直通等专项通过，归档.artifacts/runs/2026-10-23T15-29-05-749Z-unit、.artifacts/runs/2026-10-23T15-30-28-076Z-unit。焦点身份及既有窗口行为26项通过，.artifacts/runs/2026-10-23T15-43-41-250Z-unit；文件路径和网页非默认目标专项30项通过，.artifacts/runs/2026-10-23T15-46-36-167Z-unit。
- 验证：最终全量107文件729项单测通过，归档.artifacts/runs/2026-10-23T15-47-53-456Z-unit。
- 验证：15-47-10五项源码回归中四项通过，主线断言在二维码组件主动清空file-input后读取文件而得到空值；改为change捕获阶段即时取证，15-54-03已确认真实File返回完整素材路径，生产WeakMap有效。该轮后续标注保存入口使用CDP点击但实际前台为外部窗口，未建立真实指针透传/焦点边界；改为先原生移入、核对WindowFromPoint直接命中工具HWND再点击，16-00-31已通过真实取消、选图及保存。保留失败归档，后续最终五项已通过。
- 验证：预览同步完成，切换98项程序资源前后108份资料文件逐字节不变；test:preview:resources核验97项程序、236项内置资源、1676项媒体依赖通过。
- 验证：16-00-31主线专项完整通过，51份原生可见性记录，真实取消、成功选图的完整路径、标记保存和媒体提示卡恢复均通过；已逐张查看稳定后的真实打开、另存为和修改尺寸整屏，正确工具处于前台。归档.artifacts/runs/2026-10-23T16-00-31-953Z-e2e。
- 验证：按本次用户明确授权执行preview:reset：108份配置/插件等原资料完整迁入.artifacts/backups/portable-profile/2026-10-23T16-04-27-307Z-edf63fb7，manifest前后逐文件指纹相同；data和legacy目录均为空，app.asar哈希不变，预览进程0。未再启动成品，保留下次首次欢迎状态。
- 验证：最终同次五项源码E2E全部通过，归档.artifacts/runs/2026-10-23T16-04-04-896Z-e2e：正式中键面板与外点击、工具退役与后台剪贴板、首帧故障释放、首次欢迎拒绝重启、实操主线。首帧探针通过TABDO_TEST_GUIDE_RESOURCE_ROOT直接读取已同步免安装物理资源，仅运行隔离源码实例，不访问预览data。主线报告42完成/8跳过、52份原生可见性记录，三次真实选图/保存点击前均直接命中所属工具HWND，成功File路径与素材绝对路径一致。
- 验证：最终修改范围ESLint和JS语法检查通过；收尾pnpm maintain与pnpm maintain:check通过，git diff --check通过。

## 2026-10-23 · 修复免安装引导空白与点击阻塞，精简按钮和更新提示

记录：[guide-preview-startup-and-update-copy](../../docs/history/entries/2026-10-23-07-guide-preview-startup.json)；版本：未发布。

- 实际检查免安装资源发现引导HTML、CSS和界面JS未物理展开，而加载器使用app.asar.unpacked路径；同步规则改为与打包的resources/**策略一致，核验器检查全部运行资源的展开标记及物理字节。
- 覆盖窗口保持隐藏，等待界面实际渲染回执再显示并报告启动成功；预加载错误、页面加载失败、渲染进程退出或10秒超时立即释放窗口并通知父实例清理，避免透明窗口拦截桌面。
- 缩小关于页开始全屏引导按钮；核对关于→内部更新API→UpdaterAPI→GitHub Releases调用链和下载Feed均为DwenChen/TabDo，将提示改为当前已是最新版本。
- 用户明确选择保留修复代码、重置免安装预览资料；交付前先备份并校验，再重置为首次启动，重置后不再启动预览。

- 验证：物理资源及更新源专项26项通过，.artifacts/runs/2026-10-23T14-00-10-928Z-unit；全量104文件698项通过，.artifacts/runs/2026-10-23T14-05-42-167Z-unit。更新源用例实际断言GitHub请求URL和下载页/Feed均为DwenChen/TabDo。
- 验证：启动失败/正常首帧及完整引导2项源码E2E通过，.artifacts/runs/2026-10-23T14-02-31-335Z-e2e；初次执行被测试fixture参数声明拦截，修正后通过，失败归档保留。
- 验证：pnpm build、修改文件ESLint、git diff --check及usage-guide回归清单通过。
- 验证：pnpm preview:sync及pnpm test:preview:resources通过；157个原资料文件同步时逐文件保留，97个程序文件、236个插件文件和1676个媒体依赖一致。引导HTML/CSS/JS/preload均在物理路径存在。
- 验证：以源码Electron入口加载已同步预览物理目录的启动探针通过，.artifacts/runs/2026-10-23T14-08-25-641Z-e2e；直接查看physical-guide-welcome.png，内容、样式与按钮可见，点击退出与缺资源失败边界均通过。未启动成品主程序或读写预览资料。
- 验证：按当前用户明确授权执行pnpm preview:reset --confirm-reset；备份157个资料文件，manifest前后摘要完全相同；重置后data/legacy均为空且预览进程数为0，未再次启动预览消耗首次状态。

## 2026-10-23 · 对齐关于页使用引导标题并移除冗长介绍

记录：[guide-entry-compact-layout](../../docs/history/entries/2026-10-23-06-guide-entry-layout.json)；版本：未发布。

- 按用户截图反馈移除使用引导标题前的装饰图标与flex间距，使其与本版项目等分节标题左对齐；同步删除未使用的图标素材及safelist。
- 删除从全屏分步提示到自动进入下一步的整段介绍，保留练习目录及退出清理说明和现有操作入口。
- 复用既有源码引导专项补充关于页当前可见区域截图，不为低影响样式新增独立测试。

- 验证：pnpm test:e2e tests/e2e/usage-guide.spec.ts通过，归档.artifacts/runs/2026-10-23T13-34-12-964Z-e2e；直接查看设置插件的about-guide-entry.png当前可见区域，两个分节标题左对齐，冗长介绍已移除。截图透明留白不作为DWM材质验收。
- 验证：pnpm build:setting通过（含vue-tsc）；修改文件ESLint通过；usage-guide回归分组清单确认完成。
- 验证：用户确认退出预览后，进程检查为0；pnpm preview:sync及pnpm test:preview:resources通过，153个已有资料文件逐文件保留，程序与内置插件资源一致。维护检查与差异检查通过。

## 2026-10-23 · 隔离引导使用后台教学接口，修复测试切换视图时的主进程异常

记录：[guide-demo-and-repaint-crash](../../docs/history/entries/2026-10-23-05-guide-demo-and-crash.json)；版本：未发布。

- 按用户反馈修复延迟重绘读取已释放视图的 webContents，回调校验原会话及布局；测试入口遇到未捕获异常时失败退出，避免原生错误框阻塞桌面。
- 按用户明确要求，在隔离引导中使用按次运行的后台脚本模拟 OCR、公式、翻译与 Everything；正式实例继续走真实服务。
- 欢迎页、设置、工具显示教学演示标识；教学启用开关不下载模型或校验凭据，识别结果为固定样例，搜索范围仅限本次练习目录。
- 新增设置启用教学接口步骤，实际开启两项开关、复制 OCR 与公式结果、切换搜索分类后自动推进；脚本取消、超时、断开均释放且不产生过程文件。
- 按用户遮挡反馈，将隔离实例的当前教学设置与工具窗口临时置顶，提示覆盖层保持在上方；不改变正式实例窗口。

- 验证：pnpm test main/usageGuideDemo.test.ts main/builtinProviderService.test.ts main/usageGuideVerification.test.ts main/viewRepaint.test.ts：17项通过；.artifacts/runs/2026-10-23T13-17-10-522Z-unit。
- 验证：重绘修复后的原23步源码引导专项通过：.artifacts/runs/2026-10-23T13-07-33-639Z-e2e。此前失败与崩溃记录保留，不视为通过。
- 验证：24步教学接口源码专项通过：.artifacts/runs/2026-10-23T13-21-52-207Z-e2e；开启两项教学开关、OCR与公式复制、模拟图片搜索、重进与退出清理均完成，其他步骤明确跳过。首次模拟搜索因渲染进程访问限制失败，改为鉴权主进程代理后通过；失败归档保留。
- 验证：pnpm test：104文件697项通过，.artifacts/runs/2026-10-23T13-23-46-061Z-unit；物理脚本加载器调整后相关12项再次通过，.artifacts/runs/2026-10-23T13-25-10-761Z-unit。
- 验证：pnpm build通过（包含主进程/渲染器/设置页类型检查与构建）；专项ESLint错误修复后通过；git diff --check通过。
- 验证：pnpm preview:sync通过，152个已有资料文件逐文件保留；pnpm test:preview:resources通过，97个程序文件、236个内置插件文件、1676个媒体依赖均一致，教学脚本按物理资源展开。未发现残留源码测试或教学脚本进程。
- 验证：pnpm maintain与pnpm maintain:check通过，维护索引及Bug台账已同步。

## 2026-10-23 · 将使用引导升级为全屏桌面交互教学，并移入关于

记录：[fullscreen-guided-walkthrough](../../docs/history/entries/2026-10-23-04-guided-walkthrough.json)；版本：未发布。

- 保留前轮全部未提交成果，按用户反馈重写引导体验：独立全屏透明覆盖窗口、工具镂空、侧边提示卡、具体设置项定位和真实操作结果自动推进。
- 在桌面排他创建带所有权标记的专属练习目录，工具文件选择和默认输出只在隔离实例临时定位；进程退出后双重校验并清理所属目录，桌面其他文件保留。
- 移除全部系统指令课程；设置教学伴随工具直达通用设置、快捷键和提供商页签，真实保存、识别记录、文件发布和用户选中等作为判定证据。
- 取消侧栏的使用引导菜单，改为设置→关于中的入口；旧路由兼容跳转到关于。跳过与完成分别统计，不提供手动伪造完成入口。

- 验证：pnpm test main/usageGuide.test.ts main/usageGuideVerification.test.ts：7项通过，归档.artifacts/runs/2026-10-23T10-07-25-853Z-unit；覆盖桌面清理所有权、旧结果不冒充完成、真实配置与识别证据。
- 验证：全量单测102文件689项通过，.artifacts/runs/2026-10-23T10-12-39-824Z-unit；23步源码专项最终通过，.artifacts/runs/2026-10-23T13-07-33-639Z-e2e。
- 验证：源码专项验证含任务栏的实际显示器覆盖范围、鼠标真实穿透、设置保存、复制与选中、便签、桌面改名、扫码复制、媒体输出和退出清理；原生与未操作课程明确跳过。分数DPI/native-fullscreen断言、未设置改名规则的测试与切换崩溃等前置失败记录保留，崩溃修复及后续教学模拟见同日05记录。

## 2026-10-23 · 首次启动使用引导与一次性隔离练习环境

记录：[first-use-guide](../../docs/history/entries/2026-10-23-03-usage-guide.json)；版本：未发布。

- 新增首次资料启动的使用引导，以及设置中的长期入口；已有资料升级不强制弹出。
- 八节课程覆盖36个内置功能码，并介绍超级面板、快捷键、提供商与插件设置；系统中断操作和外部程序入口只讲解。
- 每次使用独立Electron实例、数据根和样例副本，结束后等待进程退出再清理数据库、缓存和默认输出；可保留或删除可重建素材。
- 新增原创图片、练习文件及三秒视频；引导不复制正式配置、密钥或第三方插件，不抢占正式实例的全局鼠标触发。
- 用户本轮明确要求同步后还原本地预览至初始状态；执行前备份并逐文件校验旧预览数据和插件，正式资料不受影响。

- 验证：pnpm test main/usageGuide.test.ts：3项通过，覆盖所有权、越界/链接拒绝、运行目录清理、素材重建与36个功能码一致性；归档.artifacts/runs/2026-10-23T09-04-43-476Z-unit。
- 验证：pnpm test --maxWorkers=2：101个文件685项全量单测通过，归档.artifacts/runs/2026-10-23T09-10-23-817Z-unit。
- 验证：pnpm test:e2e tests/e2e/usage-guide.spec.ts：最终专项1项通过（42.8秒），归档.artifacts/runs/2026-10-23T09-16-48-704Z-e2e。实际覆盖首次展示、两文件重命名界面、960×600图片读取、切换销毁旧页、保留重入、删除重建、标题栏关闭、宿主退出清理及已有资料重启不自动提示，正式数据库和插件文件哨兵始终保留。
- 验证：pnpm test:e2e tests/e2e/usage-guide.spec.ts tests/e2e/settings-cleanup.spec.ts tests/e2e/tools-lifecycle.spec.ts：设置迁移及原有生命周期2项通过，引导关闭路径1项失败；原始归档.artifacts/runs/2026-10-23T09-11-54-192Z-e2e，不能将整批写成通过。关闭路径随后修复并由最终专项覆盖。
- 验证：失败证据保留：首轮新页尚未装配就查询（09-05-49）补充真实页面等待；关闭控制页的无所属WebContents收尾等待（09-11-54、09-14-48）改为只等待system工具会话；一次与旧测试服务退出重叠的09-16-11启动失败，随后独立重跑最终通过。未放宽清理和数据保留断言。
- 验证：pnpm typecheck、pnpm typecheck:setting、16个受影响源码/测试文件ESLint及pnpm build通过。交付编译在源码E2E后执行，不使用electron-builder或build:unpack作为E2E入口。构建日志.artifacts/work/usage-guide/build.log，保留现有循环分块与混合导入提示。
- 验证：已直接查看引导插件明暗主题正文截图；测试底色只便于查看透明正文，不作为DWM材质验收。设置侧栏书本图标显式加入UnoCSS safelist。
- 验证：pnpm test:regressions usage-guide --list正确选择2个单测文件和2个源码E2E；TX-72与BUG-GUIDE-CLOSE-WAIT同步记录。
- 验证：pnpm preview:sync完成，92个程序文件核验；171个原有data文件与legacy前后逐路径/SHA-256一致，证据.artifacts/backups/preview-sync/update-1792747203360/preservation.json。pnpm test:preview:resources通过：91个程序资源、238个内置文件、1676个媒体依赖。
- 验证：按用户本轮明确指示执行pnpm preview:reset --confirm-reset，先确认预览退出，完整迁出并校验171个旧资料文件，再创建空data/legacy；旧配置和插件原件保存在.artifacts/backups/portable-profile/2026-10-23T09-21-39-164Z-76d32a35，manifest的before/after完全一致。程序不变，未再次启动预览消耗首次引导状态。
- 验证：收尾pnpm maintain、pnpm maintain:check与git diff --check；没有提交、push、云端构建或release。

## 2026-10-23 · 建立 TabDo 独立仓库首版，统一产品定位、开发规范及来源致谢

记录：[independent-repository-v1](../../docs/history/entries/2026-10-23-02-independent-v1.json)；版本：1.0.0。

- 应用版本设为1.0.0，正式发行序列与旧fork开发版本分开，保留Git历史、许可及原始维护记录。
- 重写README、架构、开发、贡献和维护入口，新增Agent执行、项目定位、发布升级及第三方来源文档，核对原插件作者署名。
- 保留开始时媒体工具与便签未提交改动，纳入首版候选验证。
- 发布工作流统一TabDo命名，单测使用自动归档入口并保留云端验证证据。
- 修正pnpm9的CI测试参数解析差异：直接使用node scripts/run-tests.cjs unit --maxWorkers=2，继续自动归档测试证据。

- 验证：已核实旧仓库DwenChen/TabDo（ID 1415714024）为ZToolsCenter/ZTools的fork，当前账号有admin权限，无未关闭议题及下游fork。git bundle verify通过；完整历史位于.artifacts/backups/tabdo-before-independent-v1.bundle。五个旧版本20个资产共1291836856字节已核对大小与SHA-256，元数据、初始25个工作区文件及补丁保留在.artifacts/backups/tabdo-before-independent-v1/。
- 验证：旧本地发行标签转存refs/archive/tabdo-fork/tags/，保留对象和备份，不推送旧发行标签，不覆盖任何旧仓库发布对象。
- 验证：pnpm test --maxWorkers=2：100个文件、682项全部通过，归档.artifacts/runs/2026-10-23T07-42-18-281Z-unit。
- 验证：pnpm test:e2e完整首轮：29项通过、performance-budget一项面板结果等待超时、builtin-models按默认条件跳过；失败截图/trace和真实退出码保留于.artifacts/runs/2026-10-23T07-44-00-273Z-e2e，不能表述为整套一次通过。
- 验证：设置TABDO_MODEL_TEST_ASSETS指向已有v1.1.1归档后，pnpm test:e2e tests/e2e/performance-budget.spec.ts tests/e2e/builtin-models.spec.ts：2项通过（2.3分钟），归档.artifacts/runs/2026-10-23T07-53-11-799Z-e2e。未调整产品逻辑或放宽断言；性能回归确认实际30秒闲置回收、缓存预算、页面/任务释放及六次preload均为1，离线引擎实际执行并清理。合并两次结果覆盖31个场景。
- 验证：pnpm typecheck、pnpm typecheck:setting、16个受影响源码/测试文件ESLint、pnpm build均通过。编译仅用于交付资源，E2E全程直接加载源码，未使用electron-builder或build:unpack。当前本机Node24.15.0、pnpm11.25.0，云端继续固定Node22、pnpm9.15.9；保留现有Rollup循环分块/混合导入及本机pnpm配置提示。
- 验证：Markdown本地链接核对通过，发布YAML解析通过，确认版本1.0.0、单测自动归档及win-x64制品路径一致。保留原始LICENSE并新增TabDo修改版权行。
- 验证：pnpm preview:sync及pnpm test:preview:resources通过：91个程序文件、229个内置资源文件、1676个媒体依赖文件匹配；171个data文件前后路径与SHA-256一致，legacy为空并保留。证据.artifacts/backups/preview-sync/update-1792741594402/preservation.json。
- 验证：本地收尾执行pnpm maintain、pnpm maintain:check与git diff --check，保留提交和推送hooks；远端迁移、发布及成品结果补充如下。
- 验证：旧仓库已删除（API404），新建同名独立公开仓库ID1430751482，fork=false且无parent；8148c958候选已推送。云端首轮39921705044在pnpm9内置test命令解析maxWorkers时失败，未打包、未发布；日志保存在.artifacts/work/independent-v1/cloud-failure.json。修正后重新验证与派发。
- 验证：修正后的精确CI入口node scripts/run-tests.cjs unit --maxWorkers=2在本机再次执行，100文件682项通过，归档.artifacts/runs/2026-10-23T08-04-23-398Z-unit；release --list列出6个单测文件。验证证据上传显式允许固定.artifacts/runs路径中的隐藏目录。
- 验证：云端运行39922305495在提交84620c1c2e3e6721a81ad0647d682e665fba521a上构建和发布均成功；Node22.23.4、pnpm9.15.9执行100文件682单测通过。verification和win-x64两个制品归属该提交，测试归档真实保留。运行https://github.com/DwenChen/TabDo/actions/runs/39922305495。
- 验证：TabDo v1.0.0于2026-10-23 16:11（Asia/Shanghai）发布，release ID421592326，非草稿/非预发布，标签和target_commitish均为84620c1c；新仓库只拉取v1.0.0，旧标签保留本地归档引用，未强推或覆盖。
- 验证：全部四个资产已实际下载并核对GitHub SHA-256；latest.yml版本、文件名、大小与SHA-512均匹配。收据.artifacts/work/independent-v1/release-verification.json；发行https://github.com/DwenChen/TabDo/releases/tag/v1.0.0。
- 验证：ZIP包含475个条目，ASAR应用名/版本/来源、原项目与TabDo修改版权、录屏win32原生组件、识别及悬浮资源许可和媒体裁剪模块核对通过。初次私有探针误用省略win32的路径，按真实包结构修正后通过；剪贴板同版权MIT完整文本与包内共享许可逐字核对，未改写任何发布产物。
- 验证：本地预览补充替换云端TabDo.exe，文件版本1.0.0、产品版本1.0.0.0；旧exe另行备份。复制前确认预览退出，data171文件与legacy0文件前后SHA-256完全一致；证据.artifacts/backups/tabdo-independent-v1-executable/preservation.json。最终pnpm test:preview:resources通过91程序/229内置/1676媒体依赖。
- 验证：最终验收记录仅修改文档和台账，收尾再次pnpm maintain、pnpm maintain:check、git diff --check，并经hooks提交推送；v1.0.0标签保持原构建提交，不因后续文档归档移动。

## 2026-10-23 · 改善媒体批量读取容错、可视化尺寸与裁剪交互，并自动整理相邻便签色签

记录：[media-preview-and-note-stack](../../docs/history/entries/2026-10-23-01-media-preview-note-stack.json)；版本：未发布。

- 按文件隔离图片原生读取，解码异常仅产生该行错误；逐行回传并等待 IPC 送达后断开，连续添加串行排队，保留已读文件。工作进程异常补充退出诊断。
- 图片和视频常驻预览，前台更新防抖并取消、等待旧请求；效果图仅写入所属暂存目录，不向用户输出目录发布。尺寸、旋转、翻转、水印、边框、圆角等使用实际处理管线。
- 提供常用比例与尺寸组合、图片百分比缩放、旋转和倍速预选；统一裁剪入口，支持自由/固定比例框选、移动和四角调整，批次使用相对构图并保持固定比例。旧直达功能码保留。
- 视频提供播放画面、时间轴与当前位置设为截取起止点；静态构图效果复用生产视频滤镜，声音与完整编码效果仍以输出文件为准。
- 同屏同边缘的相邻便签在拖动释放后按数字顺序整齐排列并轻微错位，仅重叠标签留白；远处便签不移动，工作区不足时向内分列，正文和正常纸张尺寸保留。

- 验证：pnpm test:regressions media-note-interaction --list 正确列出5个单测文件与2个源码E2E；分组单测45项通过，归档 .artifacts/runs/2026-10-23T06-45-39-884Z-unit。
- 验证：pnpm test main/mediaOperations.test.ts main/floatingPointer.test.ts main/noteDockLayout.test.ts：最新33项通过，归档 .artifacts/runs/2026-10-23T06-48-42-645Z-unit；包含相对构图、固定比例、视频完整显示/裁边和四边贴靠。
- 验证：pnpm test main/mediaInspection.test.ts：最新1项通过，归档 .artifacts/runs/2026-10-23T06-51-12-512Z-unit。两轮各26文件含损坏与注入原生崩溃，24个正常文件均完整返回；13张合并预览限制前12张，返回96×768且源文件字节保留。
- 验证：pnpm test:e2e tests/e2e/media-batch.spec.ts：最新1项通过（39.3秒），归档 .artifacts/runs/2026-10-23T06-51-29-193Z-e2e。验证尺寸预选、固定比例框选及真实输出、预览取消峰值1、播放器时间设起止点、播放器错误后逐帧回退、旧直达裁剪入口、明暗截图、输出目录和取消清理。
- 验证：pnpm test:e2e tests/e2e/floating-pointer.spec.ts tests/e2e/tools-lifecycle.spec.ts：2项通过，归档 .artifacts/runs/2026-10-23T06-47-32-500Z-e2e。实际系统鼠标把第三张便签拖入组，核对编号排序、0/3/6 DIP错位、每张文字范围不与其他色签窗口相交、点击展开及正文保留；生命周期检查后台采集继续与必要任务收尾。
- 验证：失败与修正均保留归档：首轮Vue模板多语句格式化后无法解析，改为独立有JSDoc的函数；次轮预览预算在防抖开始前取样，改为等待效果完成；扩展便签用例有窗口关闭等待缺口，补充逐页等待真正销毁后重跑通过。
- 验证：直接查看插件WebContentsView的尺寸/裁剪/时间选择截图，核对常驻预览与固定底栏；便签单窗截图及文字矩形检查通过。截图不代表其他显示器/DPI或DWM最终视觉已验收。
- 验证：pnpm typecheck、相关15个源码/测试文件ESLint、pnpm build均通过。编译用于本地交付，未使用electron-builder或build:unpack作为E2E入口；构建保留Rollup循环分块和混合导入提示。
- 验证：pnpm preview:sync 完成；preservation.json确认data的171个文件前后路径与SHA-256完全一致，legacy为空且保留。pnpm test:preview:resources通过：91个程序文件、229个内置资源文件、1676个媒体依赖文件。
- 验证：收尾执行 pnpm maintain、pnpm maintain:check 与 git diff --check。

## 2026-10-22 · 放大鼠标主体并改为透明背景，改善 TabDo 托盘与任务栏图标

记录：[transparent-mouse-icon](../../docs/history/entries/2026-10-22-03-transparent-icon.json)；版本：2.0.1。

- 用户提供任务栏与托盘截图，指出鼠标主体过小并要求透明背景。直接编辑既有SVG，移除圆角背景和顶部箭头，放大浅绿色鼠标、加粗轮廓及滚轮。
- 同步六份品牌PNG、Windows多尺寸ICO、ICNS与托盘模板。ICO补充20/40像素帧，覆盖16至256像素的九种尺寸；未改动内置工具各自的专属图标。
- 原品牌文件保存在忽略目录.artifacts/backups/icon-refresh/2026-10-22；小尺寸浅色/深色/粉色底对照与一次性生成脚本在.artifacts/work/icon-refresh，临时材料不进入根目录或提交。
- 图标调整阶段未push或发布；用户随后明确要求push并完成后续流程，本轮按2.0.1补丁版本完成提交、云端构建与release，保持现有预览资料，不重置。

- 验证：开始时工作区干净；已阅读维护、变更索引、Bug台账及工具/设置规范。检查实际消费路径，Windows托盘读取windows-icon.png，主界面与设置使用各自logo，发布与预览exe需要同步ICO。
- 验证：已目视比较16/20/24/32/48像素在浅、深与截图近似粉色底上的效果，主体与滚轮更清楚。资产字节核验通过：六份512像素PNG一致，四角及侧边透明；512主图可见范围396×500，ICO的16像素帧为14×16。ICO九帧、ICNS三帧解码透明边界通过，记录.artifacts/work/icon-refresh/asset-check.json。
- 验证：pnpm test:e2e tests/e2e/plugin-cleanup-tray.spec.ts通过1项，23.2秒正文操作、整批46.3秒；使用源码Electron和隔离数据，未为E2E打包。归档.artifacts/runs/2026-10-22T01-40-18-915Z-e2e。pnpm test:regressions branding --list确认只选择该专项。
- 验证：源码验证之后执行pnpm build，仅为预览编译Node/Web/设置/工具资源，类型检查及编译通过，未执行electron-builder或云端构建。保留已有编译提示，日志在.artifacts/work/icon-refresh/build.log。
- 验证：预览停止状态校验通过；先将TabDo.exe备份至.artifacts/backups/icon-refresh/2026-10-22/preview/TabDo.exe，在临时副本更新ICO，确认九帧PNG确实嵌入后替换。程序版本与其他元数据未改，153个现有资料文件在exe更新前后逐文件一致。
- 验证：pnpm preview:sync完成，91份程序文件核对、153份现有资料文件同步前后逐文件一致；程序资源回退位于.artifacts/backups/preview-sync/update-1792633421284/previous-resources。pnpm test:preview:resources通过90个程序资源、229个内置插件文件、1676个媒体运行库文件。
- 验证：针对当前预览TabDo.exe发送Windows Shell条目更新通知；图标阶段EXE产品名TabDo、文件与产品版本2.0.0保持。未启动真实预览写入测试数据。收尾执行pnpm maintain、pnpm maintain:check和git diff --check。
- 验证：用户授权发布后将package/changelog更新为2.0.1，并规范SVG源码LF换行。最新远端main与工作基线一致，v2.0.1标签尚不存在，不覆盖v2.0.0。
- 验证：2.0.1发布候选全量单测98文件675项通过（.artifacts/runs/2026-10-22T01-55-43-813Z-unit）；源码托盘专项再次通过1项（.artifacts/runs/2026-10-22T01-57-01-806Z-e2e，21.0秒）。pnpm lint、pnpm typecheck:setting和pnpm build均通过；E2E先于仅为预览进行的资源编译，未在本地运行electron-builder。
- 验证：最新预览EXE版本与产品版本更新为2.0.1，九帧图标仍完整；旧EXE保存在.artifacts/backups/icon-release/2.0.1/TabDo.exe。pnpm preview:sync核对91个程序文件，保留当前161份资料文件；回退资源.artifacts/backups/preview-sync/update-1792634349114/previous-resources。pnpm test:preview:resources通过90/229/1676项，未重置资料。
- 验证：发布提交fb419b50e92591b3bfc90e2243f971fd63f66bec正常hook提交并push，远端SHA一致；云端run 39709129095的build与publish均成功，维护/类型检查及98文件675项单测通过。v2.0.1标签和release target均指向该提交，latest已指向2.0.1：https://github.com/DwenChen/TabDo/releases/tag/v2.0.1。
- 验证：四项公开资产实际下载并与GitHub SHA-256核对：安装包129127851字节、ZIP176045418字节、blockmap135237字节、latest.yml883字节。更新清单版本、文件名、大小及SHA-512均与安装包一致，证据.artifacts/work/icon-release/release-verification.json。
- 验证：静态检查云端ZIP474项及ASAR3616项：不含本地预览、测试和私有目录，package为TabDo 2.0.1，更新源与appId正确。EXE九帧PNG逐帧匹配ICO，设置/主界面/托盘PNG与当前源文件字节一致，SVG与提交版本一致。程序与安装包产品名TabDo、文件版本2.0.1；未运行真实安装或成品E2E。证据.artifacts/work/icon-release/package-verification.json及package/exe-metadata.json。
- 验证：完成发布后仅补充本轮归档与Bug台账，执行maintain/maintain:check和差异检查后正常hook提交push文档；不改发布tag、不重复触发云端任务。

## 2026-10-22 · 按独立项目重写 TabDo README，补齐特性与内置工具介绍

记录：[tabdo-readme](../../docs/history/entries/2026-10-22-02-readme.json)；版本：未发布。

- 用户要求将TabDo作为新的独立项目介绍。README以产品定位、超级面板与内容匹配开篇，补充常用入口、按需运行、提供商与个性化特性。
- 按实际工具清单介绍剪贴板、截图取色、识别、文件、便签悬浮、录屏、媒体处理、网页及系统能力，补充使用场景、Windows产物选择和首次启动步骤。
- 整理插件市场与session-v1开发入口、本地数据与在线服务边界、源码运行和文档导航；上游来源与许可统一保留在末尾致谢。README_CN继续指向唯一中文主文档。
- 用户随后明确授权将本轮README文档改动提交并push到仓库，且无需构建或发布。仅推送main文档提交，不创建tag或触发workflow_dispatch。

- 验证：修改前工作区干净；已阅读维护、改动索引、Bug台账及工具清单、设置默认值、提供商、媒体和插件规范。按源码核对鼠标触发选项与固定工具，未把独立文本翻译或未发布平台写成现有能力。
- 验证：README的21处本地文件/章节链接、图标路径及示例pnpm脚本名称核对通过；工具清单与实际manifest均为36个功能码。正文在许可致谢之前不再出现旧品牌引用。
- 验证：README与本轮JSON已通过Prettier格式化；完成后执行pnpm maintain、pnpm maintain:check及git diff --check。未借用上一轮程序测试结果作为本轮文档验证。
- 验证：推送前确认工作区仅有README、当前历史条目及生成索引；发布工作流仅由版本tag或手动调度触发，main分支文档push不会触发构建与发布。

## 2026-10-22 · TabDo 最终整理、资源策略与独立插件市场

记录：[tabdo-final](../../docs/history/entries/2026-10-22-01-tabdo-final.json)；版本：2.0.0。

- 保留工作区既有多轮未提交成果；用户本轮明确授权软件更名、独立插件市场、内存优化、push、云端构建、release及预览重置。
- 软件统一更名为TabDo，独立应用仓库更名DwenChen/TabDo，更新来源/发布元数据/界面/启动器同步；新建浅绿色鼠标SVG、多尺寸ICO/PNG/ICNS及托盘图标。旧API别名、资料与备份格式仅作迁移兼容，上游版权与README/关于致谢保留。
- 第三方与内置工具共享session-v1资源作用域：隐藏/最小化/切换/刷新后移出缓存，前台立即取消与清理；有限任务保留旧IPC身份完成后销毁。移除退出保活、随主程序启动设置和运行链；可见独立子窗口归自身、解除父引用。
- 隐藏Provider/动态指令按完整调用链引用计数，合并并发装载；最后一个调用结束后回收隐藏页。登记资源支持主动提前释放并移除闭包；最新版本缓存上限128项，独立索引请求合并且有2MiB/15秒边界。新Session默认system代理不重复设置，自定义配置切换仍串行。
- 新建DwenChen/TabDo-plugins，含插件源码/图标/校验构建脚本/CI/索引及可安装的hello-tabdo示例。仅收录session-v1，主程序不再请求原市场服务或回退旧目录缓存；讨论/提交改为仓库入口。安装核对实际包的名称、版本与生命周期。
- 新增第三方开发规范与市场维护说明，移除原CLI/类型同步发布脚本及未初始化的旧子模块入口；开发使用本地plugin.json。保留开发期API类型依赖和许可。整理文档入口、回归分组、Bug台账及历史记录，未挪动稳定业务目录。
- 新安装默认.tabdo；已有.ztools、旧Chromium资料、迁移位置指针和旧备份格式原地兼容；NSIS保留原安装GUID，产品与新安装标记使用TabDo。用户本轮授权的预览重置单独备份后执行。

- 验证：开始前阅读维护、变更索引、Bug台账、性能审查及工具/设置约定；默认使用context-mode。
- 验证：首轮全量单测发现6项失败：新市场协议fixture、实际旧资料根与更名后的原生文件路径假设；修正后98文件673项全量通过（.artifacts/runs/2026-10-21T16-26-17-204Z-unit），之后补充旧备份兼容用例待最终全量。
- 验证：第三方源码E2E连续8次分配并填充32MiB后退出，缓存归零，最终仅宿主1页；后台保存重进、超时清理、可见子窗口独立及最小化回收通过。补充并发Provider成功后最后一次调用回收；初次3项及Provider专项分别归档16-19-24和16-24-37运行目录。
- 验证：首轮全量源码E2E共30项，20通过、8失败、1模型资源未指定跳过、1串行后续未执行；保留失败证据（.artifacts/runs/2026-10-21T16-26-40-510Z-e2e）。失败包括旧品牌/QR矩阵/原生窗口类的更名假设、相同URL取到收束旧页、设置Page退出后仍复用，以及第三方新Session代理初始化挂起并导致worker teardown超时。
- 验证：修正fixture会话选择与新建设置页预期，不为通过测试改产品布局；QR矩阵重新生成并由真实Worker解码，原生Win32类名保留二进制接口。新Session默认代理不重复写入后宿主专项15.2秒通过；不将单次通过推断为所有系统网络服务故障已消除。第二批12项11通过，仅设置计数仍沿用错误假设，已纠正，最终全量进行中。
- 验证：独立市场初始CI与tag发布成功，v1.0.0示例ZPX 21245字节；实际源码Electron联网读取新索引、下载发布包、安装、保存、退出回收和重进保留数据通过（第二批16-38-07运行）。主仓库尚未push/构建/release。
- 验证：pnpm lint最终零错误零警告；类型与最终源码/单测、预览和发布核验待完成。
- 验证：最终全量单测98文件675项通过（.artifacts/runs/2026-10-21T16-52-48-136Z-unit）；新增旧备份marker恢复私有数据、模拟hashed preload成品目录装载作用域与zbrowser客户端的回归。首个成品路径夹具误用已Mock的fs已修正，失败证据保留。
- 验证：指定本机既有v1.1.1离线归档运行最终31项源码E2E（.artifacts/runs/2026-10-21T16-41-12-329Z-e2e）：30项通过，含真实OCR/公式推理、录屏和截图；1项tools-polish仍按同URL取到收束旧页。先仅排除旧Page又破坏同指令无操作重入，改为按宿主当前WebContents身份选页后专项通过（.artifacts/runs/2026-10-21T16-55-01-780Z-e2e）。31项不同场景本轮均实际通过，未把有失败的整批记录宣称为整批全绿。
- 验证：最终第三方压力同机工作集约601MiB起始、748MiB峰值、615MiB结束，页面/缓存仍回到1/0；工作集可因系统调度波动，不宣称反复操作必然降低全部工作集。原始JSON在最终全量运行的third-party-memory.json。
- 验证：补跑宿主、市场联网安装、第三方生命周期与浮图/搜索专项：16-52-36运行前三项通过，最后夹具修正后16-55-01通过。公共SDK按资源根装载浏览器客户端，避免编译后相对hashed目录丢失依赖。所有E2E均使用preview-main.cjs源码与临时数据，未用本地成品做E2E。
- 验证：pnpm typecheck:setting、pnpm build通过Node/Web/设置类型检查及设置、工具、宿主/preload编译；pnpm lint最终零错误零警告。保留已有循环重导出/供应商脚本/混合导入提示。只为交付预览编译，所有源码E2E已先执行；未执行本地electron-builder或build:unpack。
- 验证：预览运行时沿用相同Electron基座，原可执行文件与启动器完整备份后将Windows图标/产品名/文件版本更新为TabDo 2.0.0；旧exe移入.artifacts/backups/preview-branding/1792601892226。启动器3种调用方式用私有GUI探针核对真实目录、TABDO数据/旧数据隔离和ELECTRON_RUN_AS_NODE清除均通过；未启动真实预览写入测试数据。
- 验证：pnpm preview:sync最终同步2.0.0，209个既有资料/插件文件前后逐文件一致，91个程序文件核验；资源回退.artifacts/backups/preview-sync/update-1792602163010/previous-resources。同步脚本完整替换当前resources/out，并去除历史开发入口与旧原生文件，防止更名后旧资源残留；portablePreviewResources的11项专项通过。
- 验证：pnpm test:preview:resources通过：90个程序资源、229个内置插件文件、1676个媒体运行库文件。随后按当前用户授权执行pnpm preview:reset --confirm-reset，209文件完整备份到.artifacts/backups/portable-profile/2026-10-21T17-04-16-175Z-2382ea83，指纹一致，data/legacy确认空目录，程序不变。真实用户资料根未重置。
- 验证：提交hook的差异检查发现jsQR许可副本末尾多余空行并阻止首次提交；仅规范化末尾换行，许可正文保持不变，再次执行正常hook。暂存清单未包含.local、.artifacts、test-results或个人环境文件，新增文件无超过50MiB的单文件。
- 验证：主仓库e8155966已正常hook提交并push，远端SHA一致。首次云端run 39641049196在设置类型检查失败：pnpm workspace仅包含根项目，原--dir安装命令未安装独立设置插件的API类型依赖。尚未构建产物、未发布tag/release；修为显式--ignore-workspace并用pnpm9复验后重跑。
- 验证：CI修复复验：CI=true并使用pnpm 9.15.9对独立设置插件执行--ignore-workspace --frozen-lockfile --force，实际重装完成，API类型解析到插件自身node_modules；pnpm typecheck:setting通过。仅工作流及开发说明调整，继续正常hook提交并重跑云端。
- 验证：CI修复提交6d25e186d1c34e0ae6e0c03ab1d66c559df3ee7a已push；云端run 39642241585的build/publish均成功。维护、两组类型检查和98文件675项单测通过，Windows云端构建生成NSIS/ZIP及更新资产。v2.0.0标签与release target均核对指向该提交；公开发布https://github.com/DwenChen/TabDo/releases/tag/v2.0.0，latest已指向2.0.0。
- 验证：最终发布资产全部实际下载到忽略目录并核对GitHub SHA-256：安装包129126560字节、ZIP176045951字节、blockmap135646字节、latest.yml1088字节。更新清单2.0.0的文件大小、路径、SHA-512与安装包逐项相符。静态检查安装包及ZIP内TabDo.exe的产品名/版本为TabDo/2.0.0；未运行安装或成品E2E。
- 验证：ZIP静态核验474项、app.asar内3616项，未包含.local/.artifacts/test-results/预览入口等私有文件，ASAR package.json为TabDo 2.0.0；发布包生命周期源码与当前源文件规范化换行后一致。成品更新源DwenChen/TabDo与appId正确，保留新原生模块命名和媒体运行库。证据在.artifacts/work/final-release/release-verification.json及packaged-verification.json。
- 验证：独立市场v1.0.0及main CI均成功，当前main d7d859686c75396a4fd3af30d2f3f68f4b5056ee；主仓库与市场的生命周期类型声明规范化换行后一致。最后归档发布记录后执行maintain/maintain:check并正常提交push，仅文档变更不重发版本。

## 2026-10-21 · 覆盖宿主、超级面板、插件与工具子组件的性能审查及优化

记录：[performance-audit](../../docs/history/entries/2026-10-21-08-performance-audit.json)；版本：未发布。

- 完成宿主、面板、插件 Session、搜索索引、设置页及 37 个工具功能/10 个异步工具页面的资源审查，新增 docs/performance-audit.md，区分本轮实现、保留设计、验证范围和设备边界。保留工作区既有修改。
- 公共 preload 按 Session 幂等注册，代理初始化按配置合并及串行切换；关闭通知携带切换身份，避免旧关闭通知隐藏新工具。插件 RPC 和 DOM 就绪等待在成功、超时、失败或销毁后撤销监听。
- 超级面板在系统复制等待期间准备隐藏首帧，隐藏即清空选文/图片/翻译/结果，取消内置翻译，30 秒闲置回收页面；请求编号拒绝迟到结果，未就绪通道只保留最新消息，同批更新合并布局测量。
- 只读搜索集合和 Fuse 索引改为 shallowRef，保留别名、排序和所有输入匹配；网页文本匹配直接读取原工具私有配置并执行原二级菜单，不再创建完整工具页面，不改变管理页和识图流程。
- 图标缓存限制为 128 条/16MiB并合并同源在途提取；剪贴板分类缓存只留版本/哈希及分类、上限1024条；分页文件存在性检查使用4×8有界I/O，保持顺序且失败先等待已开始工作收束。
- 媒体前台读取和预览取消旧请求并等待进程结束后再执行最新请求，清空、换模式和退出均令旧结果失效，退出等前台请求收束；必要编码任务保持独立。设置子输入框立即注册、有限重试、卸载清理注册与聚焦计时器。
- 新增 performance 回归分组、TX-62～64和资源预算/压力用例；同步 Bug 台账。未改UI设计、布局、功能码或用户数据。

- 验证：默认使用 context-mode 盘点与分析，先阅读维护、当前改动、Bug台账及工具/设置约定；不把已有未提交修改当作本轮新工作。
- 验证：基线源码 E2E 复现连续6次切换公共preload注册1→6，归档 .artifacts/runs/2026-10-21T14-45-06-261Z-e2e；最终资源压力回归注册数稳定为1。
- 验证：pnpm test 最终全量96文件/667项通过，归档 .artifacts/runs/2026-10-21T15-26-50-448Z-unit；包含100次preload配置、100次RPC超时清理、2000条搜索索引重建、1000项有界I/O、图标字节淘汰及20次设置页面生命周期/失败重试。
- 验证：14个不同源码E2E分批执行并补跑后通过。首批 .artifacts/runs/2026-10-21T15-06-46-816Z-e2e 的12项中11通过，tools-expanded最后断言仍使用旧文案“悬浮文本”，按当前清单修为“悬浮文字”后 .artifacts/runs/2026-10-21T15-13-00-354Z-e2e 通过，未改产品文案。设置清理、设置稳定性和真实原生选区3项在 .artifacts/runs/2026-10-21T15-20-34-568Z-e2e 通过。其余覆盖识别、剪贴板、生命周期、截图、录屏、悬浮与宿主。
- 验证：media-batch新增真实读图的快速换图检查通过，前台预览并发峰值1、旧请求被取消、最终选择正确；首次新增检查因循环已停留在手动裁剪而没有触发新读取，修正测试准备步骤后通过。
- 验证：最终性能专项 .artifacts/runs/2026-10-21T15-25-16-508Z-e2e 通过：真实30秒闲置后仅宿主1个WebContents、工具缓存0；1040条历史缓存1024且不含正文，修改记录后分类仍正确。固定600ms复制延迟交替对照中位数1923ms→935ms（约51%）；文本二级菜单905ms→395ms（约56%），直达路径不创建工具页。包含Playwright往返，不作为所有设备/生产版的承诺。冷开/复用基准改用中性测试窗口交接焦点，避免把宿主失焦恢复前应用的真实行为误判为面板性能失败，保留产品的blur退出。
- 验证：实现期间的新用例语法/选择器、命名空间Mock及临时Prettier文件写入失败均已纠正，失败记录保留；首次全量因新增静态LMDB导入扩大旧测试依赖失败，改为文本匹配路径内按需导入后全量通过。
- 验证：修改范围ESLint零错误零警告；pnpm build通过Node/Web/设置类型检查及设置、工具、宿主/preload编译。保留构建中的循环重导出、供应商脚本和混合导入提示；LMDB按需导入用于缩小AppsAPI直接依赖，主程序其他静态引用使其仍在主包内，不宣称分包收益。全部E2E先于交付编译使用源码运行，未执行electron-builder、build:unpack或云端构建。
- 验证：pnpm preview:sync同步1.1.0，208个既有资料/插件文件前后逐文件一致，核对89个程序文件；回退资源 .artifacts/backups/preview-sync/update-1792596500264/previous-resources，同目录preservation.json保留指纹。pnpm test:preview:resources通过：88个程序资源、229个内置插件文件、1676个媒体运行库文件。
- 验证：pnpm maintain、pnpm maintain:check及git diff --check均通过；维护记录与自动索引已刷新。未重置数据、未push、未云端构建、未发布release。

## 2026-10-21 · 图片标记窗口以图片图标和中文标题替代左上角装饰点

记录：[annotation-window-title](../../docs/history/entries/2026-10-21-07-annotation-title.json)；版本：未发布。

- 移除拖动区的三颗装饰点，补充简洁的图片图标与“图片标记”标题，保留原生拖动。标题单行可收缩，基础第三方样式保持原样。

- 验证：使用 context-mode 阅读维护、变更、Bug、工具与悬浮窗口规范。生产改动仅涉及独立 HTML/CSS 及来源说明，保留原生拖动区和现有操作，无新增运行时函数或依赖。
- 验证：运行既有 tools-polish 源码 Electron 用例，首次在旧的 Everything 命名实例定位器处失败；当前精简界面已移除此字段且连接区域已分为两组，因此更新定位器及全部区域的无内部裁剪检查，未改变产品逻辑。
- 验证：增加默认/窄窗口截图时发现旧 setSize 调用没有真正缩到预期宽度，记录仍为 618 CSS px；改为调用实际窗口手柄使用的受限 resize 入口，并等待宽度不超过 342。最终记录 341×520 CSS px，标题及所有现有操作在视口内。
- 验证：pnpm test:e2e tests/e2e/tools-polish.spec.ts 最终 1/1 通过，归档 .artifacts/runs/2026-10-21T14-30-02-711Z-e2e。绘制、荧光笔配色、文字标注、复制图片、独立窗口存续/关闭、便签及文件搜索既有路径均通过；测试使用隔离数据和旧数据目录，不访问真实或预览资料。
- 验证：直接查看工具独立 WebContents 的 tools-image-toolbar-default.png 与 tools-image-toolbar-narrow.png 当前可见区域截图。默认及窄窗口标题均完整、无装饰点，操作按钮正常；尺寸记录在 annotation-toolbar-layout.json。仅复用现有用例补充截图和修正旧假设，未为此低影响样式新增独立测试。
- 验证：修改范围 ESLint 通过；Prettier 完成格式检查。HTML/CSS 由预览同步器直接复制，未更改需要编译的生产源码，本轮沿用已有编译输出，未重新构建或运行打包器。
- 验证：pnpm preview:sync 已同步 1.1.0，208 个现有配置及插件文件前后逐项一致，核对 89 个程序文件；备份 .artifacts/backups/preview-sync/update-1792593049065/previous-resources，同目录 preservation.json 留存前后指纹。pnpm test:preview:resources 通过：88 个程序资源、229 个内置插件文件、1676 个媒体运行库文件。
- 验证：收尾执行 pnpm maintain、pnpm maintain:check 及 git diff --check，全部通过。未重置资料，未启动实际免安装预览写入测试资料，未 push、云端构建或发布 release。

## 2026-10-21 · 修复聚焦窗口中快捷键页签实色色带，恢复整页详情的材质融合

记录：[material-page-layout](../../docs/history/entries/2026-10-21-06-material-page-layout.json)；版本：未发布。

- 确认上轮防透字方案把不透明背景同时用于固定导航和整页详情，原生材质在聚焦时变化后出现固定色带，失焦时才接近页面底色。快捷键页签改为独立布局，正文单独滚动并裁剪，页签不再覆盖旧内容，移除固定实色和吸顶偏移。
- 设置共享 DetailPanel 与市场分类页恢复 --bg-color；离场列表/详情在过渡开始隐藏，分类退到详情后立即隐藏，数据二/三级页隐藏主级导航，避免透明材质内叠放两页文字。真正覆盖正文的菜单、对话框、提示及工具表头继续使用不透明底色。
- 重新审查上轮实色处理：固定页签和整页详情恢复材质；菜单/消息/确认栏等具备独立弹层用途，保留遮挡。宿主 DetailPanel 当前无使用方，不以未知调用推断应透明。设置、工具开发必读及覆盖层清单更新为先分区/撤下旧页、再判断实际叠放，不把透明材质全部填实。
- overlay-surfaces 新增 TX-61 真实焦点与材质回归；TX-58 的页签检查改为越界裁剪，透明反例移至实际菜单，继续覆盖之前修复的工具弹窗和便签。

- 验证：遵照项目要求使用 context-mode 阅读维护、当前变更、Bug 及设置/工具规范，核对共享详情全部调用处和列表的 v-show/过渡结构，保留既有未提交内容。
- 验证：pnpm test:regressions overlay-surfaces --e2e 最终 5/5 通过，归档 .artifacts/runs/2026-10-21T14-11-06-069Z-e2e。48 次分区/弹层像素检查保持通过；菜单透明反例有效；新增明暗 × none/Mica/Acrylic × 真实窗口聚焦/失焦共 12 组、三个滚动位置的几何检查，固定页签不移动且与正文不交叉。
- 验证：16 处页签或详情留白 PNG 透明通道检查通过：Mica/Acrylic alpha=0，普通材质 alpha=255；检查快捷键编辑、插件安装、数据二/三级详情旧内容或导航隐藏。当前 Windows 单屏 1397×786 DIP，scaleFactor=1.375；显示器/主题记录在 native-focus-environment.json。数据和旧数据目录均隔离，不访问真实或免安装预览资料。
- 验证：直接捕获并查看插件 WebContents 当前可见区域，未拼接宿主截图。WebContents 不含 DWM 最终材质合成，因此透明通道和真实焦点断言不能冒充桌面原生色彩的最终视觉验收。
- 验证：首轮新增详情测试错误地寻找已安装页中的内置工具，而该页按裁剪约定排除内置插件，定位超时；改用真实的 npm 安装子页覆盖同一详情组件，未实际安装插件或改产品筛选规则。一次 Prettier 写入返回临时 UNKNOWN，重试成功；失败及最终通过记录均保留。
- 验证：修改范围 ESLint 零错误零警告；pnpm build 完成 Node/Web/设置类型检查及设置、工具、宿主/preload 编译。保留已有循环重导出、混合导入及 pnpm 兼容提示；源码 E2E 先于交付编译完成，未使用编译成品或 electron-builder 运行测试。
- 验证：pnpm preview:sync 已同步 1.1.0，204 个现有配置及插件文件前后逐项一致，核对 89 个程序文件；备份 .artifacts/backups/preview-sync/update-1792592090038/previous-resources，同目录 preservation.json 留存前后指纹。pnpm test:preview:resources 通过：88 个程序资源、229 个内置插件文件、1676 个媒体运行库文件。
- 验证：收尾执行 pnpm maintain、pnpm maintain:check 及 git diff --check，全部通过；仅同步程序资源，未重置资料，未启动实际免安装预览写入测试资料，未 push、云端构建或发布 release。

## 2026-10-21 · 修复快捷键吸顶栏透字，并统一设置、工具和独立窗口的覆盖层背景

记录：[opaque-interaction-surfaces](../../docs/history/entries/2026-10-21-05-overlay-surfaces.json)；版本：未发布。

- 快捷键页签补充不透明主题底色并覆盖两侧/底部留白，抵消滚动容器 20px 内边距，吸顶后上方不再露出旧卡片。
- 设置共享 Dropdown、TagDropdown、Select 改用 --dialog-bg；四类 Toast 的透明语义色叠在不透明底色上。设置/宿主详情和市场分类覆盖页不再复用透明窗口背景，宿主增加明暗 --bg-elevated。
- 剪贴板右键、收藏、确认及悬浮提示改用工具 --bg-elevated，公共表格吸顶表头和固定确认条补充不透明底色与叠放顺序。
- 便签选项移出纸张 opacity 层，纸张降至 35% 时菜单继续不透明；图片标记文字输入、提示、工具栏、悬浮图片控制按钮，以及更新来源提示和窗口信息采用不透明前景背景。保留纸张、画布、选区、OCR 定位、遮罩、窗口圆角及录屏效果的透明用途。
- 新增覆盖层审查文档，记录现有正确表面及透明例外，并将约束写入设置/工具开发必读。新增 overlay-surfaces 源码 E2E 回归组，登记 TX-58/59/60 和 Bug 台账。

- 验证：使用 context-mode 分析；初始扫描设置、工具、宿主及独立 HTML/CSS 共 122 个文件、256 条交互/定位规则，逐类检查背景变量、父表面、布局及同名规则覆盖，补查主进程生成的窗口 HTML。修正后再次解析 122 文件、248 条规则，零解析错误；剩余候选包含有意透明的遮罩/选区、普通流控件及过渡态，不能按颜色字符串批量改造。私有扫描器和盘点保存在 .artifacts/work/opacity-audit、.artifacts/reviews/opacity-audit-2026-10-21。
- 验证：pnpm test:regressions overlay-surfaces --e2e 最终 4/4 通过，归档 .artifacts/runs/2026-10-21T13-47-37-622Z-e2e。48 次正向内部像素比较全部不受底图变化影响，透明反例出现约 23.47% 变化，证明探针有效。明暗 × none/Mica/Acrylic 覆盖吸顶栏、设置菜单及四类 Toast；剪贴板右键/收藏/清空确认、文件表头/确认条、35% 透明度便签菜单覆盖明暗。取消后测试历史与 25 个文件保留，关闭便签后窗口销毁。
- 验证：验证直接从 scripts/preview-main.cjs 加载源码与设置开发页，数据和旧数据目录均隔离；截图直接捕获对应 WebContents 当前可见区域。人工查看吸顶栏、明暗菜单/收藏、文件确认条及便签截图。未为 E2E 使用编译成品或打包器。
- 验证：首轮探针在 Vue 进入位移完成前采样 Toast，后改为等待帧提交/不透明；表格探针原先在 tr 中插入 div 造成匿名盒重排，改为在 table 前插入且保持同层顺序。正向检查通过后视觉发现吸顶上方仍有 20px 缝隙，新增贴顶几何断言并修正偏移；各次失败、通过和截图均由测试入口归档，未隐去失败。
- 验证：修改范围 ESLint 零错误零警告；pnpm build 完成 Node/Web/设置类型检查及设置、工具、宿主/preload 编译，保留已有循环重导出、混合导入及 pnpm 兼容提示。
- 验证：pnpm preview:sync 已同步 1.1.0，177 个现有配置及插件文件前后逐项一致，核对 89 个程序文件；备份 .artifacts/backups/preview-sync/update-1792590566277/previous-resources，同目录 preservation.json 留存前后指纹。pnpm test:preview:resources 通过：88 个程序资源、229 个内置插件文件、1676 个媒体运行库文件。
- 验证：收尾执行 pnpm maintain、pnpm maintain:check 与 git diff --check。仅更新预览程序资源，未重置配置、插件或历史，未启动实际预览写入测试资料；不提交私有文件、不 push、不云端构建或 release。

## 2026-10-21 · 优化通用设置翻译入口、快捷匹配文案和秒数输入宽度，统一插件默认高度为 540

记录：[general-settings-compact-controls](../../docs/history/entries/2026-10-21-04-general-settings-layout.json)；版本：未发布。

- 描述区可收缩换行，操作区保持独立宽度，前往翻译按钮保持单行；精简自动翻译与复制后匹配说明，标签去掉固定中键。秒数输入框覆盖旧 250px 最小宽度，固定为 96 CSS 像素。
- 插件正文初值、无效输入回退、主动重置与宿主初值统一使用 DEFAULT_PLUGIN_HEIGHT=540；已有自定义高度保留，占位文字和重置按钮同步采用共享常量。
- 最近主动复制的回退匹配不再限定 middle 且非长按，跟随当前配置的超级面板触发键，当前选区仍优先；既有独立中键兼容入口保持原行为。
- 用户补充要求对此触发键适配单独测试并加入测试集：新增 17 项用例和 clipboard-trigger 三文件回归组；同步 Bug 台账、TX-56 视觉/TX-57 行为说明及既有剪贴板 E2E 标签定位器（本轮未运行 E2E）。

- 验证：按用户最初要求，界面仅做隔离源码窗口视觉验证；随后按其补充要求，仅对触发键逻辑运行专项单测。本轮未运行 E2E，未使用成品执行端到端流程。
- 验证：直接捕获并查看设置插件当前可见区域的默认、较窄及高度位置三张图。视口 804×543 和 788×551 CSS 像素，翻译按钮为 nowrap，秒数框实测 96px，表单及宿主高度为 540。截图/布局记录在 test-results/playwright/settings-layout-visual，独立资料在 .artifacts/visual/settings-layout，不访问真实或免安装预览资料。
- 验证：首轮视觉发现旧最小宽度仍把输入框撑至 250px，修正选择器后截图确认 96px。私有截图脚本初次退出等待及关闭后 process API 失效已修正，最终视觉脚本正常退出。
- 验证：pnpm test:regressions clipboard-trigger --list 明确选择 3 个单测文件、0 个 E2E；--unit 实际 35 项通过，新增触发链用例 17 项，归档 .artifacts/runs/2026-10-21T10-20-03-281Z-unit。原生监视器和窗口发布边界用替身隔离，宿主异步匹配链真实执行；剪贴板既有测试用真实时效读取验证过期/关闭。
- 验证：修改范围 ESLint 零错误零警告；pnpm build 完成 Node/Web/设置类型检查与设置、工具、宿主/preload 编译。既有循环重导出、混合静态/动态导入及 pnpm 兼容提示保留；未执行 electron-builder/build:unpack。
- 验证：pnpm preview:sync 已同步 1.1.0，105 个现有资料及插件文件前后校验一致；核对 89 个程序文件，回退资源在 .artifacts/backups/preview-sync/update-1792578060763/previous-resources，资料指纹在同目录 preservation.json。pnpm test:preview:resources 通过：88 个程序资源、229 个内置插件文件、1676 个媒体运行库文件。
- 验证：本轮只更新程序资源，未重置任何预览或正常用户资料，未启动实际免安装预览写入测试资料。收尾执行 pnpm maintain、pnpm maintain:check 与 git diff --check，不提交私有文件，不 push、云端构建或发布 release。

## 2026-10-21 · 整理设置与快捷键，精简调试日志和托盘菜单，增加数据缓存目录选择并调整初始指令

记录：[settings-shortcuts-defaults-and-data-location](../../docs/history/entries/2026-10-21-03-settings-defaults-storage.json)；版本：未发布。

- 通用设置优先展示超级面板，开发者组默认折叠；呼出及全屏快捷键统一移至快捷键的内置页，呼出明确打开应用设置页。所有应用级快捷键与全屏暂停初始关闭，宿主、插件、分离视图、开发者全局注册和录屏 F10 均按显式 true 启用；Windows 移除会绕过开关的 Electron 默认菜单。
- 完整删除唤醒黑名单设置、系统指令、运行时拦截与内部 API，失效内置固定/历史引用清理且不改原始配置。工具清单现为 36 功能、28 个普通中文入口和 13 类。删除调试日志页、路由、内存收集器及日志 API，保留文件日志。托盘左键打开设置，右键删除重复显示/隐藏设置；游戏模式继续暂停呼出/全局指令快捷键和超级面板鼠标触发，不优化性能或停止剪贴板采集。
- 新增数据与缓存目录选择，迁移整个 .ztools 配置、插件、历史与缓存。原生确认后退出，由专属工作进程复制并逐文件 SHA-256 校验、发布空目标、最后原子切换锚点位置记录并重启；userData/sessionData 跟随新根。原件保留，拒绝非空/嵌套/联接，复制失败不切换；插件私有同名文件保留，宿主路径重定位，根外开发插件仍在原位。
- 首次缺失对应存储键时禁用设置来源全部普通与匹配指令，并按截图、剪贴板、便签、文件搜索、录屏顺序固定到超级面板；已有明确选择和空列表不覆盖。
- 新增设置开发必读并关联 AGENTS.md、维护必读和文档入口；同步架构、迁移、工具清单、Bug 台账与 settings-defaults 回归组。再次核对终端、代理、剪贴板保留、外观材质及插件高度仍有实际消费者，保留其设置。保留本来已有的未提交改动。

- 验证：全量单测 90 文件 637 项通过，.artifacts/runs/2026-10-21T04-54-30-926Z-unit。此前全量发现浮动窗口夹具缺少上轮图标 API mock，补齐 nativeImage/createFromPath 与窗口 setter 后通过，失败归档 .artifacts/runs/2026-10-21T04-53-54-210Z-unit。
- 验证：追加二次迁移和插件私有 .data-location.json 保留场景后，目录迁移单测 9 项通过，.artifacts/runs/2026-10-21T04-58-32-172Z-unit；覆盖完整内容、非空/同根/相互嵌套/联接/复制失败和坏位置记录。
- 验证：settings-defaults 源码 Electron E2E 七项通过，.artifacts/runs/2026-10-21T04-55-20-249Z-e2e；覆盖设置默认状态、实际 Ctrl+D 开关、托盘游戏模式、设置指令禁用及固定项、完整资料迁移退出重启、相邻宿主/窗口稳定/任务栏图标/生命周期/原生录屏/退出清理。未用成品或打包进行 E2E。
- 验证：迁移专项先修正测试输入方式（CDP 按键不经过宿主 before-input-event，改原生 ctrl 注入）、Playwright 调试连接释放、重启探针错误模块引用及等待启动迁移完成；曾遇到测试 worker 原生退出和清理时 EBUSY。失败和一次挂起中断均保留归档，不表述为首次通过；最终专项单独通过 .artifacts/runs/2026-10-21T04-51-26-710Z-e2e，完整组再次通过。
- 验证：已直接查看设置插件当前可见区域截图，核对超级面板提前、快捷键归类及关闭状态；目录 E2E 真实重启后核对 userData/sessionData、插件版本、私有二进制、宿主绝对路径与原件保留。
- 验证：Node、设置类型检查通过，修改范围 ESLint 零错误，格式修正后新增测试零警告，数据工作进程 node --check 通过；pnpm build 完成 Node/Web/设置类型检查及设置、工具、宿主/preload 编译。既有设置组件循环分块与宿主静态/动态导入提示保留；未执行 electron-builder/build:unpack。
- 验证：pnpm preview:sync 已同步 1.1.0，494 个原有配置及插件文件前后逐项校验一致，核对 89 个程序资源；回退资源 .artifacts/backups/preview-sync/update-1792558789805/previous-resources，资料校验在同目录 preservation.json。pnpm test:preview:resources 通过：88 个程序资源、229 个内置插件文件及 1676 个媒体运行库文件均与当前编译/源码一致。
- 验证：按用户本轮明确要求，在同步后运行 pnpm preview:reset --confirm-reset：494 个原配置和已安装插件文件完整移入 .artifacts/backups/portable-profile/2026-10-21T05-03-44-894Z-9a453e96，备份前后指纹完全一致。data 和 legacy 已确认空目录，程序不变，未启动真实预览写入测试资料，下一次通过 PreviewPortable.cmd 初始化最新默认状态。正常用户 .ztools 未重置。
- 验证：收尾生成 CHANGES.md 首次遇到 UNKNOWN 文件访问错误，随后只重试标准维护入口成功；最终执行 pnpm maintain、pnpm maintain:check 和 git diff --check，不绕过维护检查。不提交私有配置、插件、截图、日志或备份，未提交、push、云端构建或 release。
- 验证：初次清理旧隔离测试临时目录被自动审批拒绝，返回 blocked by policy；用户随后明确授权重试时仍被拒绝，当时未绕过限制，临时资料保留。项目根未产生临时文件。
- 验证：用户切换为请求审批并再次要求清理后，通过 require_escalated 发起一次审批并执行成功。仅删除系统临时目录下 ztools-settings-cleanup-DJwdWu、ztools-settings-cleanup-Jblrmi、ztools-settings-cleanup-e9UuQT：先核对绝对路径白名单、普通目录/无联接及无 Electron 占用，再逐项删除并确认不存在。项目、预览程序、用户配置及资料备份未参与删除；预览可执行文件和 494 文件备份清单仍存在。仅补记清理结果，未改业务源码，无需重新构建或运行 E2E；收尾执行标准维护与差异检查。

## 2026-10-21 · 工具指令中文去重与分类，配备独立功能图标并补齐子组件任务栏入口

记录：[tools-command-catalog-and-window-icons](../../docs/history/entries/2026-10-21-02-tools-catalog-icons.json)；版本：未发布。

- 全面梳理 37 个功能：普通文字指令 57 → 29，清除同功能中英文重复名称；保留全部功能码及文本、图片、文件、窗口匹配约束。按 13 类整理，录屏、区域录屏和停止录屏同组，图片处理与网页快开等同样归类。
- 设置所有指令与插件详情共用分组函数，指令菜单仍传递原功能码；分类名参与搜索。每项功能采用独立 Lucide 图形与本地 128px PNG，固定来源提交，保留原始 SVG、完整许可及逐项配色清单。
- 可见工具正文打开时更新宿主任务栏图标、标题与身份，退出和分离后恢复搜索面板。补齐分离、自动分离、便签、悬浮图片、图片标记、窗口信息及录屏控制条图标；临时选区、倒计时和效果覆盖层继续不占任务栏。
- 同步工具开发原则、工具清单、Bug 台账和 tools-catalog 回归组；保留本来已有的未提交改动，未提交、push、云端构建或 release。
- 按用户补充要求，将语义去重、唯一中文命名、分类保留原指令身份、免费图标许可/来源/本地资源、专属图形、可见窗口任务栏及验证要求写入工具开发必读；根 AGENTS.md 和维护必读建立强制关联。

- 验证：tools-catalog 回归单测 6 文件 42 项通过，.artifacts/runs/2026-10-21T03-46-59-044Z-unit；覆盖分组保持原成员身份、筛选与第三方不误合并、指令排序、宿主启动和旧默认配置保留。
- 验证：新增 E2E 夹具先修正 Windows PowerShell 编码与 UIntPtr 参数、Electron 没有 isSkipTaskbar getter（改为观察实际 setter）及测试误取退出中的旧页面；失败归档保留，不表述为首次全绿。
- 验证：最终完整相关源码 E2E 4 项通过，.artifacts/runs/2026-10-21T03-47-12-840Z-e2e：宿主冷热启动/单例/分离、工具分类和全部正文/独立窗口、生命周期、实际原生录屏/网页快开。均使用 preview-main.cjs、源码服务器和隔离数据，无成品 E2E。
- 验证：进一步补充实际 setIcon 像素比对后，tools-catalog 与 tools-recorder-web 两项再通过，.artifacts/runs/2026-10-21T03-50-47-592Z-e2e。20 个窗口全部通过对应功能图标、Windows WM_GETICON 原生句柄和真实任务栏 setter 检查；另验证实际录制控制条。分组内单条禁用/恢复不影响同组、图片和文件匹配保留；直接切换旧页关闭、宿主分离后恢复搜索任务栏、独立图片/便签隐藏后销毁。
- 验证：38 张本地 PNG（37 功能及工具总图标）均为 128×128，像素哈希全部不同；固定 Lucide 提交 c29c276f16590cf017126671535ad8c792be64d8，保留原始 SVG 和完整许可。已查看图标总览及稳定插件正文截图；证据 .artifacts/reviews/tools-catalog-2026-10-21。
- 验证：Node 与设置类型检查、修改范围 ESLint 零错误零警告、git diff --check 通过；pnpm build 完成 Node/Web/设置类型检查、设置/工具/宿主与 preload 编译。既有设置组件循环重导出、宿主静态/动态导入分块和 pnpm 配置兼容提示仍保留；未执行 electron-builder/build:unpack。
- 验证：pnpm preview:sync 已同步 1.1.0，470 个配置及插件文件前后校验一致；回退资源 .artifacts/backups/preview-sync/update-1792554733856/previous-resources，数据校验在同目录 preservation.json。pnpm test:preview:resources 通过，核对 87 个程序资源、234 个内置插件文件和 1676 个媒体运行库文件。
- 验证：收尾运行 pnpm maintain、pnpm maintain:check 和 git diff --check；不提交配置、插件、备份、截图、探针或日志。

## 2026-10-21 · 按用户原录屏插件重做布局交互，媒体默认输出源目录并精简文件搜索设置

记录：[recorder-reference-and-source-output](../../docs/history/entries/2026-10-21-01-recorder-reference-output.json)；版本：未发布。

- 重新在隔离渲染器对照用户录频助手 2.1.0，不执行原 preload、不开外部账号。替换上一版录屏页面和区域选择器：全屏单列大图、窗口图标列表、横排声音/操作、3–9 秒分段及中心数字倒计时；区域按钮直接进入真实鼠标所在屏幕的全屏可调整选区，支持八方向、宽高、键盘微调、显式确认和取消。
- 设置改为原版式右抽屉、系统/自定义存储目录、质量、左右键独立颜色与 Emoji 卡片/恢复、屏幕取色、五种键帽与九宫格位置；实际效果与预览一致，声音勾选检查设备且不持有流。保留统一系统字体、绿色、明暗与圆角控制条。自动命名保存，停止等待封装后定位文件；宿主真正退出只保存，启动、取消和停止等待完整准备链及资源清理。
- 图片与视频输出方式各自保存，默认源文件同级，多目录逐项分别输出，合并归首项，剪贴板图片回退下载目录。自定义路径保留可切换；源模式不显示无效的自定义路径，减少误解。各输出卷暂存目录由宿主登记准备 Promise 并统一清理，排他发布不覆盖，非硬链接文件系统回退排他复制。
- 文件搜索移除命名实例和通用权限说明输入块，默认自动连接常用实例，旧命名配置只读兼容回退；正则和大小写改为独立搜索方式、说明示例和持久化。更新工具开发规范、媒体/录屏文档、Bug 台账与 recorder-reference 回归组。保留已有未提交内容，没有提交、push、云端构建或 release。

- 验证：单测 6 文件 35 项通过，.artifacts/runs/2026-10-21T02-39-39-264Z-unit。包括真实媒体编码、非硬链接排他复制、Everything Unicode/标志/分页、查询组装、录屏避让、依赖树及预览核验逻辑。
- 验证：源码 E2E 先后修正多屏夹具选择、误用不存在的 uiohook 鼠标接口及外部失焦干扰扫码；保留失败归档。区域效果刻意录入的键帽与输入法候选使纯色阈值不成立，改为聚焦专属纯色窗口按 Shift，并等待键帽退场后核对控制条排除。新增剪贴板测试另修正 output 元素隐含 status 导致的定位歧义。没有把这些失败写成一次全绿。
- 验证：最终录屏区域、文件搜索/相邻工具和原生录屏/网页 3 项通过，.artifacts/runs/2026-10-21T02-56-58-036Z-e2e；界面和生命周期在 .artifacts/runs/2026-10-21T02-53-43-461Z-e2e 中通过，其余录屏项后续独立复核。完整启动和停止覆盖自动保存、确认/取消、捕获进程与效果窗口/输入订阅释放。
- 验证：媒体 E2E 新增多目录同级输出、合并首项、图片/视频独立设置、同级编码暂存区出现后取消和剪贴板下载回退；并检查原版来源布局、设备缺失提示、设置卡片/颜色/Emoji/九位置、明暗主题。最终补充及收紧输出设置复核通过，.artifacts/runs/2026-10-21T03-05-10-819Z-e2e。截图直接捕获稳定插件 WebContentsView，并查看对照，留存 .artifacts/reviews/recorder-reference-2026-10-21。
- 验证：修改范围 ESLint 零错误零警告，Node 类型检查、Vue 模板检查及 git diff --check 通过。pnpm build 成功，包含 Node/Web/设置类型检查和全部编译；最后收紧输出目录设置后 pnpm build:tools 通过。既有循环重导出、静态/动态分块和 pnpm 配置兼容提示仍保留，未执行 electron-builder/build:unpack。
- 验证：pnpm preview:sync 完成，更新免安装预览 1.1.0，467 个配置及插件文件前后校验一致；备份与校验清单位于 .artifacts/backups/preview-sync/update-1792552103610。pnpm test:preview:resources 通过，核对 87 个程序资源、156 个内置插件文件和 1676 个媒体运行库文件。预览 Electron 的隔离媒体探针 6 项通过，证据 .artifacts/probes/media-runtime-1792552287762/result.json。
- 验证：收尾执行 pnpm maintain、pnpm maintain:check 和 git diff --check。

## 2026-10-20 · 研究用户提供的三个插件，移植图片与视频批量处理并完善录屏

记录：[media-tools-asar-port](../../docs/history/entries/2026-10-20-11-media-tools-port.json)；版本：未发布。

- 对照用户提供的录频助手 2.1.0、图片批量处理 2.2.5、视频批量处理 1.2.0 研究布局与实际依赖；新建图片/视频批处理子组件，左侧功能、中间参数、右侧文件队列，统一系统字体、绿色强调色与明暗主题，不重复宿主标题。增加图片文件夹、手动裁剪、合并直达入口及文件/图片匹配。
- 图片处理接入 Sharp、PDFKit 和用户提供的 x64 GIF 编码器，支持压缩、九种输出格式、尺寸、裁剪、旋转/翻转、水印、圆角、边框/填充和图片/PDF/GIF 合并。视频通过所属 FFmpeg 支持压缩、截取、比例裁剪、格式、动图、水印、尺寸、封面、倍速、翻转/旋转、合并、音轨和提帧。原文件保留，同名结果独占发布并自动编号，逐项提示错误，可取消。
- 媒体读取和处理使用按次 Electron Node 工作进程，读取随前台退出取消，确认批次登记完整必要任务。取消、超时或宿主真正退出等待所属进程树结束后清理本次暂存目录，不停止全局剪贴板，不读外部插件配置。
- 录屏更新为用户提供的 2.1.0 六参数引擎，补质量、存储和点击/按键效果设置及区域/停止快捷入口；输入效果复用宿主已有全局输入管理器的专属订阅。按最新要求控制条改为 12px 圆角矩形、原生透明四角并适配明暗，保留拖动、停止、录区避让与首次显示前的捕获排除。
- 修复新增子组件遗漏宿主视图白名单导致不显示，补齐首帧高度；开发文档加入入口四处登记和真实宿主验证要求。记录三份 ASAR/原生文件哈希与许可来源，新增 media-tools 文档、Bug 台账和回归组。生产依赖完整版本树进入免安装物理展开及逐文件核验。保留既有未提交修改，未提交、push、云端构建或 release。

- 验证：专项单测最终 4 文件 30 项通过，归档 .artifacts/runs/2026-10-20T16-12-40-759Z-unit。实际编码九种图片格式、压缩大小边界、图片像素/几何、PDF/GIF、视频水印像素、封面、音轨替换、混合尺寸/缺音轨合并和取消；验证非覆盖发布与生产依赖树展开。较早测试失败和修正保留在 runs，不覆盖失败证据。
- 验证：源码 E2E 首轮发现宿主白名单遗漏；后续发现并修正 Vue 清空事件模板解析问题。测试夹具修正原生目录对话框 async API、插件 outPlugin 调用作用域及纯色底图被无关桌面窗口遮挡问题。media-batch 独立通过 .artifacts/runs/2026-10-20T16-05-29-642Z-e2e；最终组合 .artifacts/runs/2026-10-20T16-12-30-423Z-e2e 为 3 通过 1 失败，图片/视频、生命周期、录屏/网页均通过，新增透明断言误将仅返回 RGB 的 getBackgroundColor 当含 alpha，按本地 Electron 类型说明改为直接检查捕获位图 alpha；补充键盘效果测试另修正主进程裸 require 的解析上下文。最终 recorder-overlay 独立复核通过 .artifacts/runs/2026-10-20T16-16-16-230Z-e2e，圆角 12px、角像素 alpha=0、原生按键显示、效果窗口关闭与专属订阅释放全部通过。解码视频 578×358、底图绿色比例 1、洋红控制条比例 0。保留失败归档，不表述为组合一次全绿。所有 E2E 从源码和隔离数据启动，未为 E2E 打包。
- 验证：修改范围 ESLint 零错误零警告，git diff --check 通过。pnpm build 成功，包含 Node/Web/设置类型检查、设置与工具构建及宿主编译；已有设置循环重导出和宿主静态/动态混用提示仍存在，未改无关构建策略；未执行 electron-builder/build:unpack。
- 验证：pnpm preview:sync 同步 1.1.0，86 个程序文件（含 package.json），458 个 data/legacy 文件前后哈希完全一致；备份 .artifacts/backups/preview-sync/update-1792512518240/previous-resources，同目录 preservation.json。只读资源核验通过：85 运行时、156 内置插件、1676 媒体依赖文件。
- 验证：同步后使用成品自己的 Electron Node 和物理工作脚本执行六个合成媒体探针：图片缩放、PDF、GIF、BMP 转换与读取，以及视频缩放均成功，验证依赖从 app.asar 完整解析；证据 .artifacts/probes/media-runtime-1792512648302/result.json。未启动产品界面，未读取/写入预览配置或用户图片。
- 验证：最终 pnpm maintain 与 pnpm maintain:check 刷新并检查历史、Bug 和项目索引；未改预览数据、未启动产品界面。

## 2026-10-20 · 修复 Google Lens 浏览器结果上传失败与录屏控制条进入画面

记录：[lens-result-and-recorder-overlay](../../docs/history/entries/2026-10-20-10-lens-recorder-followup.json)；版本：未发布。

- 根据用户确认的浏览器上传失败，复现应用会话返回的 Lens 地址在独立浏览器缺少图片和结果；修正上轮仅验证重定向的验收表述。Lens 改由默认浏览器直接提交一次性内存 JPEG 表单，使用随机回环端口和路径、无同源权限的 CSP sandbox、nonce、无缓存/无来源策略和限定 Google 的提交与跳转；不保存临时图片、不使用图床，不保活工具视图。
- 一次性页面完整送达后关闭所属服务；浏览器启动失败、取消、连接中断及 60 秒未领取统一清理。Bing 保留已验证的 ClientRequest 重定向方式，搜索图片的校验、缩放和 JPEG 编码共用。
- 录屏控制条在首次显示前设置系统排除捕获；区域模式按全局 DIP 坐标依次避让到下、上、侧面及其他显示器，覆盖负坐标工作区。全屏或用户拖入选区仍保留系统保护，不改变原录制进程和停止收尾链。
- 工具子组件开发原则、录屏说明和工具模块文档补齐浏览器完整会话交接、临时资源释放和视频像素验证要求；同步 Bug 台账与 recorder-web 回归分组。保留已有未提交改动，不 push、不云端构建、不发布 release。

- 验证：新增 Lens 交接与录屏布局单测，专项 3 文件 13 项通过，归档 .artifacts/runs/2026-10-20T14-52-13-841Z-unit；最终 recorder-web 单测分组 6 文件 45 项通过，归档 .artifacts/runs/2026-10-20T14-56-35-408Z-unit。覆盖领取协议、JPEG 内容、CSP、失败/取消/超时端口回收和布局边界，以及相邻迁移与预览资源逻辑。
- 验证：源码 E2E 首轮 3 项通过、1 项失败，归档 .artifacts/runs/2026-10-20T14-52-45-028Z-e2e。录屏实际区域视频、原生进程清理、网页快开及工具生命周期均通过；Lens 已完成表单提交和图片解码，失败来自自定义 protocol Request 不携带 Origin，而断言只接受字符串 null。修正测试边界后 Lens 独立复核通过，归档 .artifacts/runs/2026-10-20T14-56-08-139Z-e2e；保留首轮失败，不写成一次完整运行全绿。E2E 均使用源码和隔离数据，未为测试打包。
- 验证：真实区域录制将洋红控制条强制移入绿色录区，解码 MP4 得到 578×358、绿色比例 0.9960468577835341、洋红比例 0；初始位置也验证在选区外。当前桌面验证系统排除真实生效，不只检查 API 标志。
- 验证：真实联网使用生产 launchWebQuickOpen 和本机生成的 640×400 彩色网格；由替代 shell.openExternal 的独立无持久化 Chromium 会话领取表单并直接上传，Google 结果页显示 640×400 原图和实际搜索内容。未上传用户图片。已查看截图，证据 .artifacts/reviews/lens-recorder-2026-10-20，不能把网络替身 E2E 或单纯跳转当作外网验收。
- 验证：pnpm typecheck:node、修改范围 ESLint 和 git diff --check 通过；pnpm build 成功，含 Node/Web/设置类型检查、设置与工具及宿主编译。保留已有设置组件循环重导出等提示，未调整无关构建策略；未执行 electron-builder 或 build:unpack。
- 验证：pnpm preview:sync 已同步 1.1.0，更新 77 个程序文件（含 package.json），458 个 data/legacy 文件同步前后 SHA-256 一致；pnpm test:preview:resources 只读核验 76 个运行时文件、154 个内置插件文件一致。保留 .artifacts/backups/preview-sync/update-1792508330474/previous-resources 与同目录 preservation.json，未启动成品。
- 验证：收尾执行 pnpm maintain 与 pnpm maintain:check，生成变更、故障和项目索引；不提交配置、插件、备份、日志、截图或探针。

## 2026-10-20 · 重命名预览校验与清晰提示、文件搜索设置修复、新增内置录屏及网页快开

记录：[recorder-web-search-and-tool-refinements](../../docs/history/entries/2026-10-20-09-recorder-web-search.json)；版本：未发布。

- 重命名主按钮改为执行重命名；预览增加逐行名称、重复目标、既有目标、父子混合和源文件身份检查，8 路有界并发、去抖与迟到结果隔离，提供刷新；事务仍重新校验并支持回滚与撤销，无二次确认。
- 模型未配置等状态消息进入独立布局并使用不透明 --bg-elevated 明暗背景，避免叠字；收紧规则栏，保留预览列表可读空间。
- 文件搜索补齐 FinderIcon 导入和可见设置文字，抽屉只保留一个关闭按钮；整理分类响应式网格、连接选项和复选框尺寸，增加焦点及 Esc。
- 移植指定 screen-recorder 2.0.1 的 Windows x64 原生录制引擎，来源提交 af6dc6df9bae6dc61022dabeb3a1d0c54e6de8f2、MIT 许可保留。统一 Vue 界面提供全屏/窗口/区域、系统声音/麦克风/鼠标及倒计时。录制由独立可见控制条和隔离工作进程持有，停止等待原生捕获与工作进程退出后发布 MP4，异常保留可恢复文件。启动等待首个输出再计时，避免编码器尚未开始就提前停止导致空文件。
- 新增网页快开网站配置，以及文本搜索/以图搜图匹配指令。多个启用项使用独立紧凑二级菜单，取消和失焦销毁；文字编码进网址模板，图片上传 Bing 或 Google Lens 并在默认浏览器打开结果。使用 Electron ClientRequest 捕获重定向，避免 net.fetch manual 模式拒绝跳转；无图片缓存或图床。
- 旧网页快开迁移逻辑明确保留新增的两个固定匹配功能码，避免重启时删除其固定项和使用统计；预览同步与核验把录屏 exe 纳入必须物理展开的资源。
- 更新工具开发原则、模块说明、Bug 台账和 recorder-web 回归分组；保留已有未提交工作、配置和插件，不 push、不云端构建、不发布 release。

- 验证：全量单测 83 文件 596 项通过，归档 .artifacts/runs/2026-10-20T13-32-11-080Z-unit；随后迁移专项新增保留固定指令用例，6 项通过，归档 .artifacts/runs/2026-10-20T13-34-13-972Z-unit。
- 验证：录屏资源展开和网页请求单测专项 15 项通过，归档 .artifacts/runs/2026-10-20T13-46-48-597Z-unit；更换 Electron 请求方式后网页专项 4 项通过。
- 验证：完整源码 E2E 首轮 16 通过、1 跳过、1 失败，归档 .artifacts/runs/2026-10-20T13-32-53-015Z-e2e；失败确认录制进程已启动但编码器尚未输出，过早停止未生成 MP4，改为等待输出后计时。此前和后续专项保留全部失败与修复证据，不把失败计为通过。
- 验证：补验真实 Electron 联网时发现 net.fetch redirect:manual 报 Redirect was cancelled，改用 ClientRequest redirect 事件并立即关闭请求。用本机生成的 32×32 纯色图片调用实际生产上传函数，Bing 返回 www.bing.com/images/search，Google Lens 返回 www.google.com/search，证据 .artifacts/probes/recorder-web-network.json；未上传用户图片。
- 验证：最终网页快开/录屏源码专项通过，归档 .artifacts/runs/2026-10-20T13-51-18-382Z-e2e；实际点击二级菜单、验证两个匹配入口、MP4 和两级进程清理、倒计时及区域取消。Windows 菜单请求宽度 250，实际页面客户区 254，紧凑宽度断言允许 260；不套用超级面板的固定宽度断言。
- 验证：最终全量单测 83 文件 598 项通过，归档 .artifacts/runs/2026-10-20T13-53-16-069Z-unit；包含新增迁移保留与 exe 解包用例。类型检查、修改范围 ESLint（无错误）和 runtime 脚本语法检查通过，git diff --check 通过。
- 验证：最终完整源码 E2E 16 通过、1 跳过、1 原生截图工具栏点击超时，归档 .artifacts/runs/2026-10-20T13-53-05-634Z-e2e；新工具、重命名、搜索设置及生命周期均通过。原生截图未改代码单独复核通过，归档 .artifacts/runs/2026-10-20T13-59-38-493Z-e2e。不能将跨运行合并结果写成一次完整运行全绿；保留整轮失败和 trace。跳过项为缺少真实离线模型归档。
- 验证：已查看重命名模型提示、文件搜索设置、网页快开明暗及录屏正文截图；稳定截图等候抽屉过渡完成，截图直接来自工具 WebContentsView，留存 .artifacts/reviews/recorder-web-2026-10-20。
- 验证：pnpm build 编译成功，包含类型检查、设置、工具、宿主和 preload；未执行 electron-builder 或 build:unpack，E2E 均使用源码。保留既有设置循环重导出等构建提示，未借本轮改动调整无关构建策略。
- 验证：pnpm preview:sync 成功同步 1.1.0，更新 77 个程序文件（含 package.json），453 个 data/legacy 文件前后 SHA-256 一致。pnpm test:preview:resources 只读核验 76 个运行时文件及 154 个内置插件文件一致，包含新原生 exe 的物理展开。保留回滚 .artifacts/backups/preview-sync/update-1792504944574/previous-resources，数据证据同目录 preservation.json。
- 验证：pnpm maintain 与 pnpm maintain:check 完成；源码和免安装交付分开验证，未启动成品替用户操作，未 push、未云端构建、未 release。

## 2026-10-20 · 恢复窄版面板、上次使用置首、切换退役旧页面，重命名取消二次确认并修复图标

记录：[panel-ranking-and-tool-switch](../../docs/history/entries/2026-10-20-08-panel-ranking-and-switch.json)；版本：未发布。

- 根据用户确认隐藏匹配指令的描述，仅显示名称并收紧图标和行间距；恢复初始 250×400 默认尺寸，内容高度限于 250–400，宽度不大于高度。每次调整或复用均显式使用逻辑宽度，不继承异常旧宽度。
- 匹配候选中最近使用的一项固定首位，其余按真实频次降序，同频次按最近时间再保持稳定顺序；不再以频次封顶和近期权重竞争首位。插件统计按路径与功能码识别，显示别名不丢失使用记录。超级面板先等待最新统计，并对合并后的结果统一排序。
- 重命名执行按钮使用 SVG 圆与三角形，三角形几何中心与圆心重合，不依赖字体三角字符的基线和字面框。
- 确认同工具插件路径的子组件切换此前复用同一 WebContents，绕过整页退役；现于占位/显示前移除旧工具，撤销可见性、退出缓存、释放前台，必要任务收尾后关闭旧 WebContents。保留同一文本指令的无操作重入及第三方插件缓存/分离单例行为。
- 按用户后续要求取消重命名二次确认：点击时锁定计划快照，在同一必要任务中校验并直接执行；防重复提交，冲突阻止、失败回滚及本次撤销保留。删除确认状态、暂存计划和弹层样式。
- 保留本轮开始时已有未提交工作，未 push、未云端构建、未发布 release，未重置配置或插件。

- 验证：排序与生命周期单测 34 项通过，归档 .artifacts/runs/2026-10-20T11-59-55-442Z-unit。首次类型检查发现持久化功能码可为 null，补齐参数后 pnpm typecheck 通过。
- 验证：pnpm test 全量单测：82 文件 591 项通过，归档 .artifacts/runs/2026-10-20T12-07-44-778Z-unit。
- 验证：源码专项：plugin-host-regressions 通过；super-panel-selection 在 .artifacts/runs/2026-10-20T12-04-35-290Z-e2e 中通过；最终 tools-expanded（单击、冲突与撤销）及 tools-lifecycle（直接切换、有保存任务）2 项通过，归档 .artifacts/runs/2026-10-20T12-07-32-481Z-e2e。
- 验证：保留失败证据：.artifacts/runs/2026-10-20T12-01-02-722Z-e2e 初次窗口断言只容忍 1px，但实际 Windows 客户区为 252px；改为 2px 并继续验证 20 次请求完全稳定。生命周期用例原先只按共享 URL 选页，曾误选尚在导航或退役的扫码页；改为等待本次剪贴板正文，不以额外延时掩盖。相关失败记录均保留。
- 验证：最终 pnpm test:e2e 完整源码回归：16 项通过、1 项因缺少真实离线模型归档跳过，归档 .artifacts/runs/2026-10-20T12-09-31-887Z-e2e。未为 E2E 打包，测试结束无隔离 Electron 进程遗留。
- 验证：pnpm build 编译交付资源成功，包含宿主、preload、设置与工具；未运行 electron-builder 或 build:unpack。保留设置循环重导出、工具静态 highlight 脚本的既有构建提示。修改范围 ESLint 无错误，git diff --check 通过。
- 验证：用户从托盘退出预览后，pnpm preview:sync 成功替换 64 个程序文件（含 package.json）；450 个 data/legacy 文件前后 SHA-256 相同。pnpm test:preview:resources 只读核验 63 个运行时文件和 150 个内置插件文件一致。实际截图已查看并留存 .artifacts/reviews/panel-switch-2026-10-20。

## 2026-10-20 · 对齐剪贴板与 OCR 的系统字体和绿色主题，重命名界面统一配色，二维码改为方正双栏并固化开发要求

记录：[tools-visual-consistency](../../docs/history/entries/2026-10-20-07-tools-visual-consistency.json)；版本：未发布。

- 抽出工具共用系统字体变量，剪贴板、OCR、utility 页面与重命名复用；文件名和手动编辑不再使用上游等宽字体。
- 重命名主题接入工具现有强调色、文本、背景与边框变量，默认绿色，移除上游蓝色主题、焦点及阴影；保留用户宿主主题注入和错误/警告语义色。
- 二维码空态、扫描中与结果态均为左图右结果等宽双栏；图片充分占用左栏并保持比例，右栏结果独立滚动，主窗口按宽度计算有界高度尽量方正，首帧同步更新。窄窗可堆叠，宽度监听随会话释放。
- 工具子组件开发要求补充字体、默认绿色、语义色、明暗模式、紧凑间距、图片双栏、稳定窗口与可访问性要求，并明确实际正文截图和视觉验收。
- 保留本轮开始时已有未提交工作；不 push、不云端构建、不发布 release，不修改用户配置与已安装插件。

- 验证：pnpm test:e2e tests/e2e/tools-expanded.spec.ts tests/e2e/builtin-providers.spec.ts tests/e2e/tools-clipboard.spec.ts tests/e2e/tools-lifecycle.spec.ts：4 项通过，归档 .artifacts/runs/2026-10-20T10-45-23-898Z-e2e。全部直接运行源码且使用隔离数据，未为 E2E 打包。
- 验证：真实二维码 Worker 解码、完整文本复制、HTTP(S) 打开通过；图像实际展示宽度超过左栏 85%，双栏对齐且无横向溢出，宿主宽高比小于 1.35。空态与结果态均截取实际插件视图，明暗截图已人工查看。
- 验证：重命名文件名、编号输入和手动编辑的计算字体与剪贴板一致，默认选中及执行按钮为绿色；深色正文可读，实际规则预览、执行、撤销及无效名称阻止继续通过。
- 验证：pnpm typecheck、本轮改动范围 ESLint 及 git diff --check 通过。
- 验证：pnpm build 交付资源编译成功（含类型检查、设置/工具及宿主），未执行 electron-builder 或 build:unpack。设置页原有循环重导出和工具静态 highlight 脚本构建提示仍存在，本轮未改其实现。
- 验证：pnpm test:regressions tools-visual --list 正确选择 4 个源码 E2E 文件；审阅截图留存 .artifacts/reviews/tools-visual-2026-10-20。
- 验证：用户从托盘退出预览后，pnpm preview:sync 成功替换 64 个程序文件（含 package.json）；436 个 data/legacy 文件前后 SHA-256 完全一致。只读 pnpm test:preview:resources 验证 63 个运行时资源与 150 个内置插件文件一致。测试结束无隔离 Electron 实例遗留。

## 2026-10-20 · 逐项复查工具优化，直接复用 batch-rename 界面、压紧解散文件夹，修复窗口尺寸遗漏与主进程 EPIPE 弹窗

记录：[tools-review-ui-and-window-behavior](../../docs/history/entries/2026-10-20-06-tools-review.json)；版本：未发布。

- 直接复用 batch-rename 提交 af6dc6df9bae6dc61022dabeb3a1d0c54e6de8f2 的编号卡片、替换/插入/手动/智能面板、图标与底部操作栏，保留 MIT 许可；六个标签按用户顺序排列。
- 重命名双列预览明确原名/新名，手动页行内编辑并校验非法名称；虚拟列表仅在条目集合或顺序变化时归零，编辑不会跳回首行。规则清理用四个紧凑分组，AI 模型仅进入智能页才查询；保留 Worker、执行检查、事务回滚及撤销。 清理配置区按当前分组自然高度收紧；无变化使用中性状态，与待改名及错误区分。
- 解散文件夹删除重复拖放占位与选择块，目录栏和模式/冲突策略压紧为两行；不再展示标题或介绍。目录解散、历史与撤销经过实际临时文件验证。
- 二维码以紧凑入口、固定最大缩略图和结果双栏减少留白，避免用 vh 造成窗口越测越高；二维码、解散目录及重命名冷启动和缓存恢复时直接使用目标高度。
- 浮窗成功入口不再渲染大标题、介绍或重试页；保留 mainHide 与转交完成后入口释放。 App 改为按需加载当前工具组件，避免扫码入口先解析全部工具；只加载组件定义，不缓存退出的实例。
- 便签拖动中暂停不贴靠，释放即收起且悬停不展开；标签可沿边移动并同步恢复位置，点击或拖离解除，拖出本次释放不会再贴回。贴靠开关同步全部便签，正文字号保留 12–32。
- 贴靠动画调整为 200ms 缓出；标签去空格、零字距、upright 使数字直立紧凑；解除拖出直接接续纸张拖动。
- 修复图片连续缩小时旧画布滚动条造成的透明区域：画布按百分比铺满窗口；单边缩放等比跟随，拖动固定最近缩放的逻辑尺寸，避免 Windows 非整数 DPI 下 getBounds/setPosition 的逐次尺寸增长。
- 超级面板补齐此前遗漏的宿主 preload 尺寸接口，按自然内容高度伸缩至 84–420 DIP；头部拖动及返回按钮 no-drag 保持可用。
- 使用频次与最近使用统一排序，最近七天按精确时间连续衰减，补上同一天使用先后的区分。复制名称（文件及目录）和复制路径的文本历史及 mainHide 重新验收。
- 针对用户新截图的 electron-log EPIPE，安装/免安装模式关闭控制台通道；开发方式同步/异步断管只停用控制台，保留文件日志与订阅，其他异常保持抛出。新增真实关闭管道的源码 E2E。
- 预览同步遇到旧原生模块哈希残留导致的校验失败，发生在切换资源之前；重建当前展开清单，排除失效 out 哈希但保留依赖完整性校验，并清理私有暂存中的旧 out。实际重新同步成功。
- 保留开始时的全部未提交工作；本轮未 push、未云端构建、未发布 release、未重置配置或插件。

- 验证：最终全量单测 pnpm test：82 个文件 586 项通过，归档 .artifacts/runs/2026-10-20T08-59-55-784Z-unit。
- 验证：主进程与渲染器类型检查通过；本轮修改范围 ESLint 无错误。
- 验证：源码 E2E 先后暴露真实画布滚动条留白、面板 preload 漏接及移动 DPI 尺寸增长，已逐项修复并通过专项。首轮失败与修复后日志均由测试入口归档。
- 验证：pnpm test:e2e 完整源码验证：16 通过、1 跳过（未提供真实离线模型归档），归档 .artifacts/runs/2026-10-20T09-07-45-115Z-e2e。之后的最终界面收紧与组件按需加载，重命名/二维码/浮窗/文件搜索、解散文件夹及生命周期 3 项专项通过（.artifacts/runs/2026-10-20T09-22-46-826Z-e2e）；识别工具与冷启动/分离宿主另 2 项通过（.artifacts/runs/2026-10-20T09-24-39-228Z-e2e）。
- 验证：确认并正常退出一个父进程已结束的旧隔离测试实例（临时 ztools-folder-break 数据目录），先停用断开的控制台；未退出用户免安装实例或改动真实数据。
- 验证：此前完整回归包含一次长截图高度不足的失败；保留失败证据 .artifacts/runs/2026-10-20T08-48-44-036Z-e2e，未修改截图实现，专项复验及最终完整回归均通过，不把偶发失败隐藏或归入 EPIPE 的已证实根因。
- 验证：pnpm build 编译交付资源成功，含宿主、宿主 preload、设置及工具分块；源码 E2E 不依赖这些编译产物，未执行 electron-builder 或 build:unpack。构建保留设置页既有循环重导出分块警告，本轮未修改设置模块。
- 验证：新版插件视图截图留存 .artifacts/reviews/tools-2026-10-20（直接 WebContentsView 捕获，未拼接宿主）。
- 验证：预览同步器补充新旧哈希替换及缺失依赖回归，portablePreviewResources 10 项通过，归档 .artifacts/runs/2026-10-20T10-30-41-327Z-unit。
- 验证：pnpm preview:sync 成功：64 个程序文件比对（含 package.json）；433 个 data/legacy 文件 SHA-256 前后完全一致。只读 pnpm test:preview:resources 通过：63 个运行时文件及 150 个内置插件文件一致。

## 2026-10-20 · 便签字号与贴靠交互重做、图片悬浮尺寸跟随、重命名预览重做、指令使用热度排序

记录：[note-dock-interaction-and-command-ranking](../../docs/history/entries/2026-10-20-05-note-dock-and-ranking.json)；版本：未发布。

- 便签选项新增字号设置（12–32 像素），只影响当前窗口正文，不写入用户配置。
- 图片悬浮窗口尺寸按原图比例锁定：缩小高度跟随图片、放大不超过原图，拖动只保留原点不再还原旧尺寸；悬浮窗口禁用原生边缘缩放，缩放统一走页面手柄。
- 便签贴靠改为拖动释放即收起，指针停在色签上不再自动展开；点击色签或把色签拖离边缘才解除贴靠，解除后需再次拖动才会重新贴边。
- 收起后的色签可以沿所属边缘自由拖动，位置不再由宿主固定分配；标签在垂直边缘使用 18×80、水平边缘使用 88×18。
- 贴靠与解除改为分帧缓出过渡（150ms），色签与正文增加淡入动画，贴靠过程更顺滑。
- 竖排色签去掉“便签 1”里的空格并把字距收紧到 1 像素，标签与编号之间不再出现大间距。
- 匹配指令列表按使用频次与最近使用排序：新增 calculateUsageBoost（频次最多 120、最近使用最多 180 并按天衰减），接入文本搜索排序与图片/文件/文本/窗口匹配列表，启动指令后强制刷新统计。
- 文件批量重命名预览区按上游 batch-rename 重做：卡片式“原名 → 新名”行、状态徽标（待改名/无变化/错误）、行内改名、还原与移除、全选与已选计数、筛选框、有界滚动提示，底部按左右分组排列操作。
- 重命名、二维码扫描、解散文件夹三个子组件不再自带标题与说明文字，正文直接进入控件。
- 修复超级面板头部拖动区域吞掉左上角“返回固定列表”按钮点击：标题按钮补 no-drag。
- 修复源码 E2E 与源码预览在 Electron 系 IDE 终端下误判打包环境：启动被测 Electron 前清除宿主残留的 ELECTRON_FORCE_IS_PACKAGED（连同 ELECTRON_RUN_AS_NODE），避免内置插件与原生资源按 app.asar.unpacked 解析。

- 验证：仅验证本轮改动与相关回归，没有为验证打包应用。
- 验证：node scripts/run-tests.cjs unit：81 个文件 580 项通过（含 calculateUsageBoost 与指令使用统计键、贴合与图片比例、贴靠状态机用例）；归档 .artifacts/runs/2026-10-20T07-22-36-036Z-unit。
- 验证：node scripts/run-tests.cjs e2e：全量源码 E2E 15 通过 1 跳过（4.9 分钟），覆盖 floating-pointer、super-panel-selection、tools-polish、tools-expanded、tools-folder-break、tools-copy-commands、tools-clipboard、tools-screenshot、tools-lifecycle、builtin-providers、local-edition、plugin-host-regressions 等；归档 .artifacts/runs/2026-10-20T07-17-29-909Z-e2e。
- 验证：floatingPointer 单测 9 项通过：四边识别与拖动释放收起、指针停留不展开、点击解除贴靠、色签沿边缘拖动与拖离解除、图片窗口比例锁定与拖动保持尺寸、贴靠开关。
- 验证：floating-pointer 源码 E2E 通过：系统鼠标把便签拖到边缘后释放即收起、指针停在色签不展开、拖动色签改变位置、点击色签解除贴靠并保留纸张尺寸与正文，图片正文进入后按钮显示并真实点击关闭。
- 验证：tools-expanded 源码 E2E 通过：二维码、重命名插入规则→检查并重命名→确认执行→撤销、便签与悬浮窗口、mainHide 与入口退役、本地搜索；tools-polish 通过贴靠登记与解除、便签字号 16/22、本地搜索 Finder 布局；super-panel-selection 通过返回按钮可点击断言。
- 验证：node_modules/.bin/tsc --noEmit -p tsconfig.node.json 与 node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json 通过；vite build internal-plugins/system 与 electron-vite build 成功。
- 验证：宿主环境修复前后对比：同一终端下全量 E2E 从 13 失败 2 通过变为 15 通过 1 跳过；探针确认内置插件路径回到 internal-plugins/<name>/public。

## 2026-10-20 · 便签贴靠手感与开关、入口页面闪现、二维码扫描、重命名与解散文件夹、复制名称与复制路径、超级面板自适应

记录：[tools-commands-panel-and-rename](../../docs/history/entries/2026-10-20-04-tools-commands-panel.json)；版本：未发布。

- 便签拖动释放后宿主在尺寸稳定时立即贴靠，不再要求指针离开便签；释放位置仍在色签上时保持收起，指针离开后重新进入才展开，指针已在别处则照常响应悬停。
- 便签选项新增贴靠开关，作用于本次运行的整组便签；关闭时解除已有贴靠并恢复完整纸张，不写入用户配置。
- 竖排收起色签的文字使用 text-orientation: upright，编号不再横躺。
- 只开独立窗口的子组件（便签、悬浮内容、图片标记）声明 mainHide，面板或快捷键启动不唤出宿主窗口；入口转交完成后主动隐藏宿主窗口并按内容收紧高度，去除闪出的入口页面。
- 二维码扫描重做紧凑界面并按实测正文高度请求 setExpendHeight，去掉固定高度留下的大片空白。
- 纯系统指令（复制路径、复制名称、前往文件夹、取色等）声明 mainHide，从超级面板触发不再闪出宿主窗口。
- 新增匹配指令“复制名称”，文件与文件夹均能匹配，复制末级名称并登记到剪贴板历史。
- 修复“复制路径”：宿主 clipboardManager.writeTextEntry 写入文本并立即按文本条目登记，剪贴板与历史都呈现路径文本。
- 文件批量重命名按 batch-rename 界面重做：上栏顺序为自动编号、查找替换、规则清理、插入内容、手动编辑、智能重命名；规则清理含大小写转换、文件名清洗、扩展名处理、删除字符；预览列表、行内改名、排序、检查后确认执行与撤销上次改名。
- 新增内置“解散文件夹”：单层或递归模式、自动重命名/覆盖/跳过冲突策略、预览统计、确认后执行、最近 50 条历史与撤销；文件事务在插件私有桥接内完成并先回滚。
- 超级面板按正文与列表实测高度自适应（120–420），弹层展开时撑到上限；面板头部可拖动窗口。

- 验证：仅验证本轮改动与相关回归，没有为验证打包应用。
- 验证：node scripts/run-tests.cjs unit：81 个文件 574 项通过，含新增的贴合/开关用例与重构后的重命名规则用例；归档 .artifacts/runs/2026-10-20T05-41-02-695Z-unit。
- 验证：node scripts/test-regressions.cjs tools-commands：新增分组（2 个单测文件 24 项 + tools-copy-commands、tools-expanded、tools-folder-break 三个源码 E2E）全部通过；归档 .artifacts/runs/2026-10-20T05-46-43-799Z-unit 与 .artifacts/runs/2026-10-20T05-46-45-864Z-e2e。
- 验证：node scripts/run-tests.cjs e2e 全量：15 项通过、1 项跳过（builtin-models 因本机没有离线模型资产）；归档 .artifacts/runs/2026-10-20T05-35-40-016Z-e2e。覆盖真实系统鼠标拖动贴靠与展开、便签开关、超级面板弹出与关闭、剪贴板与工具生命周期、原生退出码。
- 验证：floating-pointer 用真实系统鼠标按下/移动/松开标题栏后释放即收起、指针离开重进展开；tools-polish 验证开关关闭/开启与竖排色签 text-orientation；tools-expanded 验证 mainHide、入口转交后宿主隐藏、重命名执行与撤销、二维码扫描。
- 验证：tools-copy-commands 先在剪贴板与历史留下文件条目，再以超级面板来源启动复制路径与复制名称，断言剪贴板文本、历史首条为文本条目、宿主窗口未 show() 且两条指令声明 mainHide。
- 验证：tools-folder-break 单层解散把文件与子目录移到父目录并删除空目录，历史保留移动 2 项并可撤销回原结构。
- 验证：node_modules/.bin/tsc --noEmit -p tsconfig.node.json 与 node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json 通过。
- 验证：vite build internal-plugins/system 与 electron-vite build 通过，仅为交付预览编译；未执行 electron-builder、build:unpack，未使用 dist 替代源码 E2E。
- 验证：node scripts/project-maintenance.cjs prepare 与 check 通过（prepare 生成 2 份索引，check 无待处理项）。
- 验证：node scripts/sync-portable-preview.cjs：更新 64 份程序文件、保留 423 份用户数据文件，版本 1.1.0，回滚资源 .artifacts/backups/preview-sync/update-1792475161288/previous-resources。
- 验证：node scripts/verify-portable-preview.cjs：63 份运行资源与 134 份内置插件资源一致。

## 2026-10-20 · 修复便签贴边漏触发与悬浮图片关闭按钮难以显示

记录：[floating-edge-and-pointer-input](../../docs/history/entries/2026-10-20-03-floating-pointer.json)；版本：未发布。

- 贴边识别覆盖接近和越过工作区边缘，使用实际窗口位置和系统鼠标坐标；不再依赖 moved 或页面悬停消息。
- 便签标题栏及普通图片使用受控指针拖动，避免原生 app-region 拦截移动/悬停；图片关闭按钮保持淡显，鼠标进入图片后完整显示。
- 共享鼠标观察器仅属于存活的独立窗口，最后一个窗口关闭后立即释放；标记窗口不运行此观察器。
- 更正旧专项里手工 emit moved 和调用 dock-hover 的验证，新增系统鼠标按下、拖动、松开及真实关闭点击验收。
- 拖动和展开恢复使用正常纸张尺寸，便签最小纸张尺寸由受限缩放入口保证，避免频繁切换原生最小尺寸及移动时累积 DPI 舍入。

- 验证：仅验证相关改动，没有全量回归。
- 验证：pnpm test tests/main/floatingPointer.test.ts：最终 5 项通过，覆盖四边越界贴靠、展开及解除、鼠标状态发布和观察器回收；归档 .artifacts/runs/2026-10-20T01-58-47-411Z-unit。
- 验证：pnpm test:e2e tests/e2e/floating-pointer.spec.ts tests/e2e/tools-polish.spec.ts：2 项源码 Electron E2E 通过，归档 .artifacts/runs/2026-10-20T01-57-52-141Z-e2e。真实系统鼠标按下/移动/松开拖动标题栏；四边接近/越界后收起、系统鼠标进入展开、拖离解除、正文及纸张尺寸保留；鼠标进入图片正文使按钮完整显示，真实系统点击关闭按钮成功。
- 验证：旧人工 emit moved / 调用 dock-hover 的专项已改为系统鼠标输入。真实系统拖动复现旧方案失败，并发现展开与移动的 DPI 尺寸累积；修复后专项通过，所有中间失败 trace 和拖动诊断均保留。
- 验证：pnpm typecheck:node、变更文件 eslint --no-cache --max-warnings=0、node --check resources/tools-floating.js 通过。源码测试结束后无 preview-main Electron 进程遗留。
- 验证：pnpm test:e2e tests/e2e/floating-pointer.spec.ts --repeat-each=2：针对用户报告的交互可靠性，系统鼠标专项连续两次通过，归档 .artifacts/runs/2026-10-20T02-02-00-641Z-e2e；未扩大到全量回归。
- 验证：pnpm build 通过，仅为预览交付编译，没有为 E2E 构建或使用打包应用；未调用 electron-builder/build:unpack。原有 Rollup 分块及 highlight 脚本提示保留。
- 验证：pnpm preview:sync：64 份程序文件核验，268 个 data/legacy 文件内容指纹保持一致，版本 1.1.0；回滚资源 .artifacts/backups/preview-sync/update-1792461684701/previous-resources。
- 验证：pnpm test:preview:resources 通过：63 份运行资源及 134 份内置插件资源一致。

## 2026-10-20 · 定位并修复原生剪贴板及窗口监听未停止导致的退出崩溃

记录：[native-monitor-shutdown](../../docs/history/entries/2026-10-20-02-native-shutdown.json)；版本：未发布。

- 独立进程复现：仅加载正常；启动剪贴板或窗口监听后直接退出均返回 0xc0000409；先停止监听均返回 0。未替换原生二进制。
- 真正退出前停止原生提供商桥接、全局剪贴板及窗口监听；先封闭回调入口并等待已接收记录保存，再继续窗口和数据库关闭。
- 退出清理幂等，取消复制等待计时器；目录初始化迟到时不再启动原生线程。工具隐藏/关闭不停止全局采集。
- 开发终止信号走同一清理链，移除会跳过异步保存的 process.exit。

- 验证：只运行相关验证，没有全量回归。
- 验证：独立进程对照证据 .artifacts/runs/native-exit-reproduction.json。
- 验证：pnpm test tests/main/clipboardShutdown.test.ts tests/main/clipboardTypeDetection.test.ts tests/main/clipboardCategory.test.ts：3 文件 27 项通过，归档 .artifacts/runs/2026-10-20T01-29-03-397Z-unit。覆盖在途保存等待、停止幂等、迟到初始化、原有采集分类与写入行为。
- 验证：pnpm test:e2e tests/e2e/native-shutdown.spec.ts tests/e2e/tools-lifecycle.spec.ts：2 项源码 Electron E2E 通过，归档 .artifacts/runs/2026-10-20T01-28-47-078Z-e2e。自动化关闭、app.quit、SIGTERM 三个真实进程退出码均为 0，重启读取隔离哨兵记录验证留存；工具隐藏后仍采集新内容和必要任务收尾也通过。
- 验证：修复后的专项期间 Windows Application Error 未新增 ztools_native.node 事件；无本轮源码测试进程遗留。检查证据 .artifacts/runs/native-exit-after-fix-events.json。
- 验证：pnpm typecheck:node 及变更文件 eslint --no-cache --max-warnings=0 通过。
- 验证：pnpm build 通过，仅用于本地预览交付；没有为 E2E 构建应用，没有调用 electron-builder 或 build:unpack。原有 Rollup 分块及 highlight 脚本提示保留。
- 验证：pnpm preview:sync：64 份程序文件核验，267 个 data/legacy 文件内容保持一致，版本 1.1.0；回滚资源 .artifacts/backups/preview-sync/update-1792459918748/previous-resources。
- 验证：pnpm test:preview:resources 通过：63 份运行资源及 134 份内置插件资源一致。

## 2026-10-20 · 新增便签贴边彩色标签，修复多选悬浮与编号重置，恢复原文件搜索分类及布局

记录：[floating-multiselect-and-original-finder](../../docs/history/entries/2026-10-20-01-floating-and-finder.json)；版本：未发布。

- 图片悬浮隐藏绘图工具栏与标注交互，仅保留悬停置顶/关闭；标记仍使用完整工具栏。
- 多选文本按可见列表顺序合并悬浮；便签全部关闭后序号和颜色重新开始。
- 重新检查 upstream 691870b5b45a209f34b3626b162efeb00f177601，复用原分类侧栏、设置抽屉、分栏拖动与排序底栏，使用宿主搜索框。
- 原十类筛选、自定义分组与启用排序；空搜索仍列举分类文件，全部支持空表达式浏览，保留连接检测契约。
- 便签拖至屏幕工作区四边后收起为同色编号小标签，移入展开、移出收起，拖离解除；完整纸张尺寸和正文保留，追加文字时展开。
- 修复搜索底栏箭头默认 SVG 视口放大，统一图标尺寸；设置连接指引按内容自然布局，避免被挤压。

- 验证：按用户要求仅验证相关改动，不进行全量回归。
- 验证：pnpm test tests/main/localSearchQuery.test.ts tests/main/everythingBridge.test.ts：2 文件 4 项通过，归档 .artifacts/runs/2026-10-20T01-16-03-888Z-unit。覆盖原十类、空查询、正则与分类组合、自定义规则、桥接分页/Unicode/路径匹配。
- 验证：pnpm typecheck、变更源码及测试 eslint --no-cache --max-warnings=0、node --check resources/tools-floating.js 通过。
- 验证：验证期间修复 Windows PowerShell 5 对无 BOM 中文注释的解析问题；便签窄标签断言兼容当前 Windows DPI 的 2 DIP 舍入。真实 Everything 已返回文件，将旧空列表断言改为接受已连接与未连接状态。
- 验证：pnpm test:e2e tests/e2e/tools-polish.spec.ts：最终 1 项源码 Electron E2E 通过，归档 .artifacts/runs/2026-10-20T01-20-54-277Z-e2e。覆盖图片悬浮与标记分离、多选文本全部悬浮、便签黄色编号重置、贴边标签实际鼠标移入/移出和解除、原十类空查询、宿主输入、排序/分栏、真实文件预览及查询进程退出。
- 验证：原生退出日志仍记录 ztools_native.node 0xc0000409，未宣称修复。已保留 .artifacts/runs/tools-followup-native-exit-events.json，并确认最终无本轮源码 Electron、Everything 桥接或 IPC 夹具进程遗留。
- 验证：pnpm build 通过，仅用于预览交付；连接卡片布局补充后 pnpm build:tools 再次通过。未使用 electron-builder 或 build:unpack，源码 E2E 未使用构建应用。原有 Rollup 分块及 highlight 脚本提示保留。
- 验证：pnpm preview:sync：核验 64 份程序文件，267 个 data/legacy 文件内容指纹一致，版本 1.1.0；备份 .artifacts/backups/preview-sync/update-1792459318350/previous-resources。
- 验证：pnpm test:preview:resources 通过：63 份运行资源及 134 份内置插件资源一致。

## 2026-10-19 · 优化便签、图片标记、搜索及识别界面，增加自动翻译与语言设置

记录：[tools-ui-and-translation-preferences](../../docs/history/entries/2026-10-19-06-tools-polish.json)；版本：未发布。

- 便签缩小初始尺寸，黄色起始并轮换新窗口颜色，置顶独立图标，支持四边和角落缩放。
- 图片窗口按原图与工作区适配，修复文字输入焦点，荧光笔独立颜色、默认荧光黄，五档笔触与分行工具栏。
- 本地文件搜索复用原插件 Finder 布局与样式，集中连接指引、分类与预览。
- 选区弹窗新增独立自动翻译开关；在线服务保存源语言和目标语言，默认自动识别并译为简体中文。
- 识别页参考原插件双栏布局，保留坐标选文并增加受限 LaTeX 预览。

- 验证：按用户本轮指示，仅验证相关改动，不运行全量单测或全量 E2E。
- 验证：pnpm test tests/main/builtinProviderService.test.ts --maxWorkers=2：1 个文件、6 项通过，归档 .artifacts/runs/2026-10-19T15-43-17-890Z-unit。覆盖在线语言默认值、服务配置、显式调用优先级与原有提供商协调。
- 验证：pnpm test:e2e tests/e2e/builtin-providers.spec.ts：在两次组合执行中均通过，最近证据 .artifacts/runs/2026-10-19T15-49-58-796Z-e2e。覆盖自动翻译关闭后不调用服务、开关持久化、在线语言配置、OCR 双栏坐标选文与翻译，以及 KaTeX 实时预览和公式格式复制。该组合中的 tools-expanded 失败未计为通过。
- 验证：pnpm test:e2e tests/e2e/tools-polish.spec.ts：独立专项通过，归档 .artifacts/runs/2026-10-19T15-54-42-067Z-e2e。覆盖图片初始贴合、340px 工具栏、文字实际输入与画布变化、荧光笔独立配色、五档笔触、便签初始黄色/新建轮色/独立置顶/真实边缘拖动、原搜索布局和连接提示、真实文件预览及分类查询。
- 验证：开发验证中的模板多语句编译错误、入口固定绿色参数、Windows DPI 尺寸断言等均已修正并在最终专项通过。首次类型检查发现 unknown 配置值类型不匹配，已增加字符串边界检查；后续 pnpm typecheck、pnpm typecheck:setting 及 pnpm build 中类型检查通过。
- 验证：早期 tools-expanded 组合在无关二维码阶段出现页面重载/结果丢失，并有一次测试 worker 原生退出异常，未宣称该宽组通过。按用户范围新增无二维码/重命名路径的 tools-polish 专项，失败日志与 trace 均保留。
- 验证：修改文件 eslint --no-cache --max-warnings=0、resources/tools-floating.js 的 node --check、git diff --check 通过；新增专项文件 lint 通过。
- 验证：公式预览固定使用 KaTeX 0.16.22，trust:false，保留 MIT 许可；原搜索 Finder 固定源码的布局/样式来源及 MIT 许可随插件保留。依赖增加只包含 KaTeX 和 commander@8.3.0，保留既有 jsQR 变更。
- 验证：pnpm build 通过，仅用于本地预览交付，未执行 electron-builder、build:unpack 或云端构建。原有 Rollup 分块和 highlight 非 module 脚本警告仍保留。
- 验证：pnpm preview:sync 通过：64 份程序文件核验，172 个 data/legacy 文件同步前后内容指纹一致；版本保持 1.1.0，回滚程序 .artifacts/backups/preview-sync/update-1792425398894/previous-resources。
- 验证：pnpm test:preview:resources 通过：63 份运行资源与 134 份内置插件资源一致。
- 验证：用户询问 Java 报错弹窗后，读取 Windows Application Error，发现本轮源码 Electron 在退出时发生 ztools_native.node 0xc0000409。还发现 23:49 创建的本轮中断 E2E 进程 PID 28656 遗留，已按精确 PID 结束该进程及其两个子进程，并确认无仍运行的本项目 preview-main 源码实例；未按进程名批量结束用户应用。事件证据 .artifacts/runs/tools-polish-native-exit-events.json。弹窗正文尚未取得，不能断言原生异常就是该弹窗或已修复底层退出问题。
- 验证：最终 pnpm maintain、pnpm maintain:check、git diff --check 通过；变更、Bug 与测试索引已刷新。

## 2026-10-19 · 复用原插件悬浮界面并改为临时纸张便签

记录：[floating-plugin-ui-and-ephemeral-notes](../../docs/history/entries/2026-10-19-05-floating-ui.json)；版本：未发布。

- 移除系统边框，复用原图片插件窗口结构、SVG 工具栏、拖动与缩放手柄，保留 MIT 许可和明确来源。
- 颜色为预览圆圈点击展开八种基本配色，笔触大小为单独显示的拖动滑块；窄窗口工具栏可换行。
- 便签复用原插件窄彩色标题栏与五种纸色，增加纸张折角；关闭即释放，不再记录或提供历史入口。
- 文字条目右下角增加悬浮固定，匹配标签精简为悬浮文本/悬浮图片；文本匹配优先于残留剪贴板图片。
- 剪贴板文字默认以空行追加到最近聚焦的存活便签，保留用户编辑；多窗口关闭后顺延，首次初始化期间排队追加。独立便签指令、窗口加号和 Ctrl+N 可主动新建空白窗口，新窗口错开位置。
- 按本轮明确要求，在程序同步和资源校验后备份并重置免安装预览为初始状态。
- 工具默认嵌入主窗口；一次迁移只撤回工具旧版默认自动分离与通用退出开关。内置插件隐藏主窗口与独立窗口右上角行为设置入口。
- 评估后保留专属后台释放：子组件取消资源，宿主等待已登记任务后销毁页面；工具分支不会重复进入通用杀插件流程，退出 Promise 和窗口标识提供幂等保护。

- 验证：pnpm test --maxWorkers=2：78 个文件、554 项单测通过，归档 .artifacts/runs/2026-10-19T13-58-59-364Z-unit。
- 验证：全套源码 pnpm test:e2e：8 项通过、2 项失败、1 项真实模型测试按默认跳过；两项失败分别是新增标题栏检查未等待页面，以及冷启动未等待宿主 IPC 监听。保留完整失败日志 .artifacts/runs/2026-10-19T13-55-54-938Z-e2e。
- 验证：修正等待条件后，pnpm test:e2e tests/e2e/plugin-host-regressions.spec.ts tests/e2e/tools-expanded.spec.ts：2 项通过，归档 .artifacts/runs/2026-10-19T14-00-50-586Z-e2e。本轮所有 10 个常规源码 E2E 均有通过记录，未把默认跳过模型测试计为通过。
- 验证：tools-expanded 验证透明无边框、340px 工具栏、颜色圆圈与预设色板、实际滑块拖动、标注复制、文字快捷入口、折角/配色、关闭不持久化、多窗口聚焦追加/关闭回退、独立便签指令、加号与 Ctrl+N、新窗口初始化期间排队追加。
- 验证：builtin-providers 验证工具默认嵌入后的自动识别和退出释放；宿主/设置稳定性回归验证内置两种标题栏无行为入口，第三方两种标题栏仍保留入口。
- 验证：开发中早期高 DPI 1px 边界、output 隐式 status 角色、便签指令未加入宿主白名单及旧菜单断言等失败均已修正。失败输出与 trace 均保留于 .artifacts/runs，未删改或覆盖为成功。
- 验证：pnpm typecheck、全仓 eslint --no-cache --max-warnings=0 通过；格式化过程的 Windows 临时文件占用已重试成功。
- 验证：界面来源及 MIT 许可随资源保留；原图片插件基础 CSS 与下载版本一致。
- 验证：git diff --check 通过。
- 验证：pnpm build 通过，仅用于免安装预览交付；未执行 electron-builder 或 build:unpack。既有 Rollup 循环分块、动态/静态导入和 highlight 非 module 脚本警告仍保留，未宣称消除。
- 验证：pnpm preview:sync 成功：64 份程序文件核验，565 个 data/legacy 文件同步前后 SHA-256 一致；版本保持 1.1.0。程序回退 .artifacts/backups/preview-sync/update-1792418577471/previous-resources。
- 验证：pnpm test:preview:resources 通过：63 份运行资源、73 份内置插件资源一致。
- 验证：按本轮用户明确授权执行 pnpm preview:reset --confirm-reset：原 data/legacy 共 565 文件完整迁移并校验到 .artifacts/backups/portable-profile/2026-10-19T14-03-52-978Z-a6ef7c76，创建空数据目录，程序不变；同步后未再次启动预览。
- 验证：pnpm maintain、pnpm maintain:check 与最终 git diff --check 通过；记录更新后的索引过期提示已通过重新生成解决。

## 2026-10-19 · 工具扩充与剪贴板悬浮融合

记录：[tools-expansion-and-clipboard-floating](../../docs/history/entries/2026-10-19-04-tools-expansion.json)；版本：未发布。

- 超级面板译文改为可选文、可滚动区域；识别工具进入、换图、粘贴与切换渠道后自动识别。
- 纯图片文件组进入剪贴板图片分类并显示缩略图，保留文件载荷及资源管理器粘贴语义。
- 参考指定五个上游插件 c8475ad7944ffdb78843cc5f56886d1443d0a724，内置文件重命名、二维码扫描、悬浮标注与本地文件搜索。
- 重命名提供十类规则工作流、Worker 预览、冲突预检、交换改名、失败回滚和本次撤销；扫码在可终止 Worker 中执行，HTTP(S) 结果可默认浏览器打开。
- 剪贴板右键与选区匹配可打开图片标注或悬浮；独立文字便签可选六种颜色并保存，图片标记采用换行工具栏与统一画笔设置。
- Everything 仅连接用户已运行的本机实例，缺失或未运行时提供官方安装和开机启动指引；不随包携带、下载或自动运行 Everything。
- 本地搜索提供有界文本、图片、目录与音视频预览；图片条目提供逐张悬浮/标记入口，支持含空格、井号和 Unicode 的路径。

- 验证：pnpm test --maxWorkers=2：77 个单测文件、551 项通过，归档 .artifacts/runs/2026-10-19T12-53-50-066Z-unit。
- 验证：原生 Everything IPC 在唯一命名的隔离 Win32 测试实例中验证中文路径、正则/大小写标志、排序及 100 条分页；不启动或停止用户 Everything。
- 验证：最终 pnpm test:e2e：11 项中 10 项通过、1 项显式真实模型下载测试默认跳过；全套只启动 scripts/preview-main.cjs 源码和隔离数据。归档 .artifacts/runs/2026-10-19T12-55-36-664Z-e2e。
- 验证：新增 tools-expanded 源码 E2E 覆盖真实二维码 Worker 解码与默认浏览器点击、图片文件历史分类、340 像素标注窗口无横向溢出、真实绘制/复制、关闭剪贴板后悬浮窗口保留、便签颜色/编辑/重开、真实重命名与撤销、查询进程退出以及长译文滚动。
- 验证：自动识别由 builtin-providers 验证进入后选图、换图后取消旧翻译并自动重新识别、切换 OCR 服务及公式模式。
- 验证：开发期间遇到模板多语句解析、测试焦点/旧 Page 选择、悬浮脚本全局 top 名冲突、窄窗口溢出及画笔浮层遮挡等失败，均已修正；失败日志和 trace 继续保存在 .artifacts/runs，未删改为成功。
- 验证：pnpm typecheck、pnpm typecheck:setting、全仓 eslint --no-cache --max-warnings=0 通过。
- 验证：pnpm build 通过，仅用于本地预览交付，未运行 electron-builder、build:unpack；保留既有构建警告记录，未将警告当作错误或宣称消除。
- 验证：pnpm maintain、pnpm maintain:check 和 git diff --check 通过；预览同步完成后再次维护检查。
- 验证：pnpm preview:sync 成功：61 份含版本元数据的程序文件通过同步核验，555 个 data/legacy 文件同步前后 SHA-256 一致；版本保持 1.1.0。
- 验证：程序回退资源与 preservation.json：.artifacts/backups/preview-sync/update-1792414913480。
- 验证：pnpm test:preview:resources：60 份运行资源、73 份内置插件资源一致；免安装物理展开目录包含查询桥接、文件事务和 jsQR 许可，未携带 Everything.exe。

## 2026-10-19 · 长截图持续拼接验证与大图交付优化

记录：[long-screenshot-continuity](../../docs/history/entries/2026-10-19-03-long-screenshot.json)；版本：未发布。

- 按用户后续要求，以固定数万像素连续页面验收，不查找极限上限；身份色带检查拼接连续性和完整输出。
- 宿主直接复用原生 PNG，不再重复读取并编码剪贴板；Windows/macOS 确认时沿用原生复制/保存，避免再次解码写回。
- 保留旧原生模块缺少 PNG 的兼容回退；取消不触碰剪贴板，保存文件可返回正确原图而非旧剪贴板。

- 验证：screenCaptureResult 与 toolsHostLifecycle 2 个单测文件、7 项通过，归档 .artifacts/runs/2026-10-19T11-38-26-541Z-unit。
- 验证：初次扩展场景原生日志生成 PNG，但 E2E 完成后遇到 CDP 临时求值 Promise 被 GC 而失败；加入仅针对该错误的有限等待重试后完成完整验收，失败证据仍保留。
- 验证：最终全量 pnpm test --maxWorkers=2：74 个文件、531 项通过；日志 .artifacts/runs/2026-10-19T11-41-25-266Z-unit。
- 验证：最终源码 Electron E2E builtin-providers 与 tools-screenshot 2 项通过，归档 .artifacts/runs/2026-10-19T11-40-55-149Z-e2e；pnpm typecheck、全仓 eslint 通过。
- 验证：固定页面 96 次滚动后输出 931×48170 PNG，549 个身份编号段从 2 到 550 连续，gapCount=0；完成、预抓帧超时和取色取消后全部工具进程退出。
- 验证：此前 80 次滚动场景同样通过：931×40250、459 个身份段无断序，归档 .artifacts/runs/2026-10-19T11-39-18-877Z-e2e。最终场景均记录 1 次 CDP 临时求值 GC 重试，其他通信错误不忽略；不将本次长度声称为最大上限。
- 验证：最终 pnpm build 通过；pnpm preview:sync 核验 57 份程序文件，527 个 data/legacy 文件同步前后 SHA-256 一致，未重置数据或插件。
- 验证：预览回退资源和 preservation.json：.artifacts/backups/preview-sync/update-1792410460157；程序版本保持 1.1.0。
- 验证：pnpm test:preview:resources：56 份运行资源、67 份内置插件资源通过；pnpm maintain、pnpm maintain:check 与 git diff --check 通过。

## 2026-10-19 · 精简识别指令并恢复图片选文、坐标标注与识别后翻译

记录：[ocr-selection-and-translation](../../docs/history/entries/2026-10-19-02-ocr-interaction.json)；版本：未发布。

- 移除独立文本翻译、代码翻译及图片识别并翻译功能入口；旧快捷键返回已移除说明，保留翻译提供商供结果翻译与公共 API 使用。
- 保留 OCR 完整行框，恢复原图坐标、逐行高亮、缩放对齐与图上整行和部分文字选择。
- 识别后手动翻译英文，优先选文否则全文；原文、坐标与译文分别展示，换图/取消/退出阻止迟到回填。
- 离线翻译沿用引擎单次 1000 字符限制，结果页明确拒绝超长输入并提示选文或改用在线/AI，避免静默截断。

- 验证：提供商与指令相关 6 个单测文件、64 项通过。
- 验证：源码 Electron E2E：builtin-providers、tools-clipboard、tools-lifecycle、tools-screenshot 共 4 项通过；补充翻译失败重试、无坐标说明与公式识别后 builtin-providers 专项通过。
- 验证：pnpm typecheck、全仓 eslint --no-cache --max-warnings=0、pnpm build 通过；构建仅用于交付，E2E 直接加载源码。
- 验证：失败过程包括旧控件名称、模板多语句格式化及纯中文夹具仍含 AI 英文；均修正并保留自动归档。
- 验证：日志：.artifacts/runs/2026-10-19T11-24-00-535Z-unit、2026-10-19T11-25-36-101Z-e2e、2026-10-19T11-28-08-865Z-e2e；成功截图分别记录原图标注与译文。
- 验证：最终全量 pnpm test --maxWorkers=2：74 个文件、531 项通过；日志 .artifacts/runs/2026-10-19T11-41-25-266Z-unit。
- 验证：最终源码 Electron E2E builtin-providers 与 tools-screenshot 2 项通过，归档 .artifacts/runs/2026-10-19T11-40-55-149Z-e2e；pnpm typecheck、全仓 eslint 通过。
- 验证：最终补充离线翻译长度提示与拒绝截断的源码 E2E 通过，归档 .artifacts/runs/2026-10-19T11-45-37-571Z-e2e。
- 验证：最终 pnpm build 通过；pnpm preview:sync 核验 57 份程序文件，527 个 data/legacy 文件同步前后 SHA-256 一致，未重置数据或插件。
- 验证：预览回退资源和 preservation.json：.artifacts/backups/preview-sync/update-1792410460157；程序版本保持 1.1.0。
- 验证：pnpm test:preview:resources：56 份运行资源、67 份内置插件资源通过；pnpm maintain、pnpm maintain:check 与 git diff --check 通过。

## 2026-10-19 · 提供商内置、工具子组件与本地版默认行为优化

记录：[builtin-providers-and-tools](../../docs/history/entries/2026-10-19-01-builtin-providers.json)；版本：未发布。

- 研究并固定 f-provider 源码 ae2bd2cc678b743f7683c3fb40b6606940acc3d1，将翻译、OCR、公式识别及图床配置内置到提供商页。
- 在线翻译四个服务共用下拉栏目；AI OCR 直接复用宿主视觉模型。离线资源启用即下载，支持校验、取消、重试与删除。
- 将文本翻译、文字/公式识别、图片识别并翻译、九种代码命名和处理记录整合为工具子组件；移除重复截图入口。
- 默认路由只调用仍存在且已启用的提供商；保留旧 f-provider 安装与私有数据，兼容旧参数、默认标识和快捷入口。
- 原生能力按次独立进程执行，结果交付前结束进程树；ONNX 显式 release，Bergamot 按次释放 Worker 并改用隔离数据根。
- 超级面板始终启用，缺省按下中键触发，保留已有按键设置；已安装列表隐藏内置插件，首次应用其默认分离与退出结束配置。

- 验证：pnpm test --maxWorkers=2：73 个单测文件、526 项通过；之后增加的旧提供商显式标识兼容用例随 providerConsumption/pluginPreloadInternalApi 专项 15 项通过。
- 验证：源码 Electron E2E 全量运行 10 项：9 项通过，托盘用例因 Playwright 尚未登记插件 Page 引用失败；补充正文/页面等待后专项复测通过。
- 验证：最终 pnpm test:e2e builtin-models、builtin-providers、plugin-cleanup-tray 专项 3 项通过；其余 7 项已在全量运行通过。所有 E2E 仅加载源码并使用隔离数据。
- 验证：真实微信 OCR 识别 HELLO 123 通过；真实 ONNX 公式模型完成推理、逐项 release 与资源删除，实际文本记录在 real-offline-results.json，精度不作为本次通过结论。
- 验证：初次全量单测 520 项通过、1 项窗口测试超时；该文件单独 7 项通过，随后完整 526 项通过。初期界面语法、测试控件及旧默认假设失败与修正日志均保留。
- 验证：pnpm typecheck、pnpm typecheck:setting、全仓 eslint --no-cache --max-warnings=0 及 pnpm build 均通过；编译仅用于本地交付，E2E 未使用编译或打包产物。
- 验证：日志和截图证据：.artifacts/runs/2026-10-19T10-51-58-470Z-unit、2026-10-19T10-54-41-602Z-unit、2026-10-19T10-49-06-766Z-e2e、2026-10-19T10-54-12-021Z-e2e。
- 验证：pnpm preview:sync：57 份含版本元数据的程序文件通过核验；241 个 data/legacy 文件同步前后 SHA-256 一致。回退资源与 preservation.json 位于 .artifacts/backups/preview-sync/update-1792407479668。
- 验证：pnpm test:preview:resources：56 份运行资源、67 份内置插件资源一致；公式适配脚本采用 .cjs 确保免安装预览物理展开，独立进程的两个 CommonJS 适配模块导入通过。
- 验证：pnpm maintain 与 pnpm maintain:check 通过，改动索引、Bug 台账和回归分组已同步；既有启动器修复及维护记录未撤销。

## 2026-10-18 · 修复免安装启动器找不到可执行文件

记录：[portable-launcher-absolute-path](../../docs/history/entries/2026-10-18-05-portable-launcher.json)；版本：1.1.0。

- 复现根启动器相对 CALL 后内部脚本切换工作目录，导致 %~dp0 重新解析并把 .local/portable-preview 重复拼接。
- 根启动器在调用前保存绝对入口路径；本机内部启动器在 cd 前保存绝对目录，并检查 exe 存在。两份批处理使用 CRLF，关闭延迟展开以兼容含感叹号的路径。
- 本地预览入口已直接修复，程序资源、配置、数据、已安装插件和原数据备份均不改动；本轮不 push、不云端构建、不发布 release。

- 验证：先在隔离副本复现重复路径，确认 LF 和 CRLF 都存在同一相对路径问题，未将换行格式误记为根因。
- 验证：Windows 真实 cmd.exe 调用三种启动方式全部通过：从无关目录以绝对路径调用根入口、从父目录以相对路径调用根入口、直接相对调用内部入口；夹具路径包含空格和中文。
- 验证：隔离探针验证实际可执行目录、工作目录、data/legacy 目录及 ELECTRON_RUN_AS_NODE 清除；探针不启动 ZTools，不读写真实预览数据。证据：.artifacts/runs/portable-launcher-smoke-result.json。
- 验证：仅修复批处理启动入口，未修改宿主/插件代码，未运行源码 E2E 或应用编译打包。

## 2026-10-18 · 目录集中整理、自动维护与一次授权发布

记录：[repository-maintenance-and-release](../../docs/history/entries/2026-10-18-04-maintenance.json)；版本：1.1.0。

- 归档历次日志、一次性脚本、下载与程序回退资源；活跃预览和私有数据集中到 .local。
- 建立维护必读、Bug 台账、版本化变更条目、全量测试索引和历史回归分组。
- 单测/E2E 自动归档日志和退出状态；提交前自动刷新索引并要求变更记录，推送及云端执行只读维护检查。
- 统一维护文本的 LF 换行并清理全仓遗留 lint 问题，Windows 启动脚本保留 CRLF，供应商压缩库保留原样。
- 中键取词 E2E 等待真实剪贴板通知和窗口焦点；每轮截图、trace 和主进程日志单独归档，避免后续运行覆盖证据。
- 修复迁入 .artifacts 后 ASAR 展开规则失配，新增隐藏目录单项/多项展开回归测试；预览同步同时更新版本元数据。
- 用户明确授权本次 push、云端构建及 release；该授权不延续到后续任务。
- 按用户确认保留最新预览程序，完整备份配置和插件后重置预览数据为首次启动状态。

- 验证：Windows：pnpm test 全量 71 个文件、517 项单测通过，涵盖归档、提交约束、预览重置与隐藏路径展开。证据：.artifacts/runs/maintenance-unit-complete.log。
- 验证：pnpm typecheck、pnpm typecheck:setting 通过；全仓 eslint --no-cache --max-warnings=0 通过，后续变动文件再次检查通过。
- 验证：源码 Electron E2E 的 8 个场景均通过：整套先通过 7 项；中键原生输入夹具改进后专项通过，并连续复测两次通过。首次失败及复测证据均保留，不声称整套一次通过。
- 验证：本地交付 pnpm build 通过；pnpm preview:sync 更新为 1.1.0，核验 52 份含版本元数据的程序文件；pnpm test:preview:resources 核验 51 份运行资源和 67 份内置插件资源通过。E2E 未使用该编译产物。
- 验证：按本轮明确确认将原配置和插件完整移入 .artifacts/backups/portable-profile/2026-10-18T12-14-09-536Z-4de7271d，1189 个文件重新核对 SHA-256 一致；新 data/legacy 为空，未启动以保留首次启动状态。
- 验证：本条目记录发布前验证；本轮授权的云端构建和 release 以 GitHub Actions 对应提交及 v1.1.0 release 的最终结果为准，执行回执存于 .artifacts/runs/。多屏/DPI 与截图像素质量继续保留人工验收。

## 2026-10-18 · 工具整合、剪贴板/中键回归和运行时释放

记录：[tools-integration-and-lifecycle](../../docs/history/entries/2026-10-18-03-tools.json)；版本：1.1.0。

- 内置工具集成剪贴板分类、高亮、显式选择与合并复制，保留插件标识 system。
- 修复中键选区匹配、固定项回退、外部点击关闭和异步结果重开。
- 截图进入编辑态，修复非 wheel 长截图；Windows 截图/取色按次独立进程运行。
- 工具退出清理前台资源，必要任务完成再销毁；旧任务保持原插件数据隔离。
- 预览资源完整同步；此前 1186 个用户文件前后校验一致，保留程序回退副本。

- 验证：本次整理前历史验证：508 项单测通过；8 个源码 E2E 场景均通过（整套 7 项通过后，对旧 Page 引用修正并重跑相关 2 项通过）。
- 验证：历史类型检查与修改文件 lint 通过；全仓 lint 的遗留问题在本轮维护中处理。
- 验证：历史原始日志迁入 .artifacts/history/，原生截图视觉边界仍需人工验收。

## 2026-10-18 · 设置窗口稳定性与插件菜单恢复

记录：[settings-stability](../../docs/history/entries/2026-10-18-02-settings.json)；版本：1.0.1。

- 避免设置循环重开，复用并发请求，丢弃过期装配和焦点结果。
- 恢复分离、开发者工具、运行设置与终止菜单，保护原生菜单期间的焦点。

- 验证：历史证据：ba75802 与 v1.0.1 成功云端工作流 39099861246；详情见 changelog.md。

## 2026-10-18 · 本地版边界与 Windows 云端发布基线

记录：[local-edition-baseline](../../docs/history/entries/2026-10-18-01-local-edition.json)；版本：1.0.0。

- 保留超级面板、插件、自定义模型和系统能力；裁剪账号、云同步、MCP 与主搜索等孤立入口。
- 完整数据备份和迁移增加 SHA-256 校验、恢复前检查、回滚与路径重定位。
- 源码 Electron 预览和隔离测试数据；发布范围收敛至 Windows x64。

- 验证：历史证据：changelog.md、3579d85、5879de3、d5368ed、6136fe4；v1.0.0 已由云端发布。
