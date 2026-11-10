# 变更索引

> 自动生成；原始记录在 [entries](../history/entries/)。

## 2026-11-10 · 补齐 Windows 发布包的呼叫AI内置 npm 和 npx

记录：[release-1.5.2](../../docs/history/entries/2026-11-10-09-release-1.5.2.json)；版本：1.5.2。

- Windows afterPack 显式发布官方 Node 的 npm 目录，从最终程序资源运行 npm、npx 和 pip 版本命令。
- 修正 1.5.1 成品验证发现的缺项并继续发布 1.5.2。

- 验证：从 1.5.1 正式 ZIP 提取 51 个运行时文件，确认 npm 缺失，运行修正的 afterPack 后实际执行 npm、npx 与 pip 通过。日志 .artifacts/releases/1.5.2/afterpack.log。
- 验证：pnpm build、pnpm preview:sync、pnpm test:preview:resources 通过。程序已更新到 1.5.2，核对 2138 个程序文件、352 个内置文件及 11881 个运行依赖文件。
- 验证：已确认本地预览 data 与 legacy 保持首次启动的空目录状态。资料备份仍为 .artifacts/backups/portable-profile/2026-11-10T10-13-39-601Z-e05ac45e。

## 2026-11-10 · 修正干净检出的进程隔离测试并继续发布呼叫AI

记录：[release-1.5.1](../../docs/history/entries/2026-11-10-08-release-1.5.1.json)；版本：1.5.1。

- 云端 1.5.0 的两项 Job Object 单测在构建前访问尚未准备的内置 Node。改用测试运行器的 Node，并在子进程就绪后验证取消。
- 保留未发布的 v1.5.0 标签与失败记录，正式发布候选顺延为 1.5.1。

- 验证：1.5.0 构建 42797906870 完成依赖、文档和类型检查，云端 900 项单测通过，2 项进程隔离测试因程序路径不存在失败，发布跳过。原始日志 .artifacts/releases/1.5.0/cloud-build-attempt-1.log。
- 验证：修正后呼叫AI运行时与默认固定专项 8 项单测通过，归档 .artifacts/runs/2026-11-10T10-22-49-747Z-unit。应用行为已由 1.5.0 同轮的 4 项源码 E2E 覆盖。
- 验证：1.5.1 本地生产构建和预览同步通过。预览 data 与 legacy 已处于空目录状态，本次同步保留该状态。同步收据 .artifacts/backups/preview-sync/update-1794306240687/preservation.json。
- 验证：合并调用到时中止后，独立执行 pnpm test:preview:resources 通过，核对 2138 个程序文件、352 个内置文件和 11881 个运行依赖文件。
- 验证：云端 42799565340 的构建与发布成功，135 文件 902 项单测通过。标签和 Release 对应 3692005eda2639127aa5b527ed56ef8a84933a8b。四个产物 SHA-256 和更新清单的安装包 SHA-512 一致。
- 验证：深入检查正式 ZIP 发现内置 Node 缺少 npm 和 npx 的入口及依赖。保留正式版和验证收据，使用 1.5.2 补齐打包规则。

## 2026-11-10 · 首次启动默认固定呼叫AI并交付 TabDo 1.5.0

记录：[release-1.5.0](../../docs/history/entries/2026-11-10-07-release-1.5.0.json)；版本：1.5.0。

- 在超级面板原有六个默认固定项后加入呼叫AI，数据库已有固定项时沿用用户选择。
- 同步 README、设置规范、仓库和应用内教程及发行说明。1.5.0 收录呼叫AI和待发布的演示编辑器修正。
- 预览同步与重置共用进程退出检查，明确拒绝查询失败。

- 验证：本地全量单测 135 文件 902 项通过。首次运行仅大型 ASAR 夹具超出 5 秒，调整此用例时限后复跑通过，归档 .artifacts/runs/2026-11-10T10-06-13-433Z-unit。
- 验证：默认固定、呼叫AI、演示编辑边界和工具目录四项源码 E2E 通过，归档 .artifacts/runs/2026-11-10T10-07-19-938Z-e2e。已清理 16 个重复输出，共 1461181 字节。
- 验证：pnpm typecheck、pnpm typecheck:setting、pnpm build、pnpm maintain、pnpm maintain:check、pnpm docs:check 与差异检查通过。
- 验证：CIM 查询报错时首轮同步仍继续，误启动的重试与首轮切换冲突并退出。首轮 1.5.0 同步成功，校验 2139 个程序文件，2277 个资料文件保留。独立验证通过 2138 个程序文件、352 个内置文件及 11881 个运行依赖文件。保留收据 .artifacts/backups/preview-sync/update-1794305282780/preservation.json。
- 验证：按用户授权在同步和资源核验后重置预览资料。备份 .artifacts/backups/portable-profile/2026-11-10T10-13-39-601Z-e05ac45e 含 2277 个逐文件核验的原文件，预览 data 与 legacy 已清空供首次启动。
- 验证：验证修正后受限 CIM 查询明确返回失败，正常查询确认预览已退出。预览资源、依赖与维护重置专项记录在 .artifacts/releases/1.5.0/。

## 2026-11-10 · 在呼叫AI设置中查看 MCP 工具和 Skill 描述，精简运行时检查反馈

记录：[call-ai-settings-details](../../docs/history/entries/2026-11-10-06-call-ai-settings-details.json)；版本：1.5.1。

- 已配置 MCP 可按需连接并分页读取工具名称及说明，结束后释放连接、所属进程与临时目录。
- 展开已安装 Skill 时读取 SKILL.md 的 YAML 描述，兼容旧安装。
- 运行时更新与清理额外库使用带悬停提示的图标，检查后在按钮旁显示绿勾，反馈文字靠行末。

- 验证：pnpm typecheck、pnpm typecheck:setting、pnpm build、pnpm docs:check 与回归分组入口检查通过。
- 验证：呼叫AI四个单测文件共 25 项通过，归档 .artifacts/runs/2026-11-10T09-44-13-428Z-unit。
- 验证：首次源码 E2E 因测试局部变量重名无法加载。修正后，设置断言通过，整套测试在依赖系统剪贴板的聊天粘贴断言处失败。复跑时模拟可粘贴状态，保留真实右键与菜单处理，完整回归通过。最终归档 .artifacts/runs/2026-11-10T09-44-35-315Z-e2e。
- 验证：端到端检查覆盖停用 MCP 的显式连接、工具分页、查询进程回收、Skill 的多行描述与旧安装回退、运行时图标提示和检查行对齐。
- 验证：已清理 8 个完成自动归档的 Playwright 重复文件，共 357603 字节，保留运行归档与清理收据。
- 验证：首次同步发现免安装预览仍在运行，脚本在替换前停止。用户退出后，pnpm preview:sync 通过，更新本地免安装预览 1.4.1，核对 2139 个程序文件，data 与 legacy 共 2253 个文件逐一保持一致。保留收据 .artifacts/backups/preview-sync/update-1794304122474/preservation.json。
- 验证：pnpm test:preview:resources 独立核验通过，覆盖 2138 个程序文件、352 个内置文件和 11881 个运行依赖文件。同步和核验日志位于 .artifacts/call-ai-settings-details/。
- 验证：核验后回收本轮程序暂存与旧的纯程序回退，共 29990 个文件、1389252497 字节。保留本轮程序回退 722381362 字节和全部保留收据，清理收据 .artifacts/call-ai-settings-details/preview-cleanup.json。
- 验证：收尾复核 .artifacts 约 6146 MiB，主要为测试归档 2716 MiB、备份与收据 1397 MiB、现用工具链 1228 MiB、既有下载 571 MiB 和上游参考 185 MiB。预览回退目录只保留本轮程序副本。

## 2026-11-10 · 精简呼叫AI权限与网页控件，记住权限选择并支持类似命令审批

记录：[call-ai-permission-controls](../../docs/history/entries/2026-11-10-05-call-ai-permission-controls.json)；版本：1.5.1。

- 权限选择收起时以居中的盾牌图标显示，完全权限用红色提示，展开保留模式名称。网页搜索和产物定位改为带悬停说明的图标。
- 首次打开使用请求批准，确认过的权限模式保存在本机。确认或保存期间暂停发起任务，新窗口加载上次选择。
- 内置脚本和 context-mode 命令可允许类似命令，只在当前窗口内匹配相同执行工具与完整参数。关闭窗口立即清除批准。
- 同步仓库教程、应用内教程、设置规范、更新说明和 TX-136 回归分组。

- 验证：四个呼叫AI单测文件共 25 项通过，覆盖默认权限、取消完全权限和确认后跨窗口恢复。归档 .artifacts/runs/2026-11-10T07-23-36-421Z-unit。
- 验证：源码 Electron 首轮功能回归通过，归档 .artifacts/runs/2026-11-10T07-23-43-027Z-e2e。去箭头后首轮居中检查测出盾牌竖向偏移，调整垂直对齐后通过。失败与最终归档分别为 .artifacts/runs/2026-11-10T07-27-15-986Z-e2e 与 .artifacts/runs/2026-11-10T07-28-13-769Z-e2e。
- 验证：最终源码回归验证无箭头、盾牌横纵居中、展开模式文字、红色全权限、新窗口恢复、图标提示、同窗跨轮复用批准、参数变化重新审批及关闭撤销。窄窗口截图直接捕获插件正文。
- 验证：pnpm typecheck、pnpm test:regressions call-ai --list、pnpm docs:check、pnpm maintain、pnpm maintain:check、pnpm build 与最后的 pnpm build:tools 通过。
- 验证：首次 pnpm preview:sync 发现免安装预览仍在运行，替换前退出。运行保护日志 .artifacts/call-ai-permission-controls/preview-sync-running.log。
- 验证：清理两份已自动归档的 Playwright 副本，共 16 个文件、715322 字节，保留成功与失败证据及清理收据。
- 验证：预览退出后重新执行 pnpm preview:sync，通过并更新本地免安装预览 1.4.1。核对 2139 个程序文件，data 与 legacy 共 2254 个文件在同步前后一致。保留收据 .artifacts/backups/preview-sync/update-1794295957921/preservation.json。
- 验证：pnpm test:preview:resources 独立核验通过，覆盖 2138 个程序文件、352 个内置文件和 11881 个运行依赖文件。同步与核验日志位于 .artifacts/call-ai-permission-controls/。
- 验证：清理程序暂存和旧的纯程序回退，共 29990 个文件、1389247382 字节。保留本轮程序回退（722378373 字节）、全部保留收据和原始测试归档。清理收据 .artifacts/call-ai-permission-controls/preview-cleanup.json。
- 验证：同步收尾后空间复核约 5.92 GiB，主要为测试归档 2.62 GiB、备份与收据 1.33 GiB、现用工具链 1.18 GiB、既有下载 0.56 GiB 和上游参考 0.18 GiB。

## 2026-11-10 · 将呼叫AI模型和权限选择集中到聊天输入框

记录：[call-ai-composer-settings](../../docs/history/entries/2026-11-10-04-call-ai-composer-settings.json)；版本：1.5.1。

- 移除聊天顶部的重复工具栏，将模型和权限下拉移入输入框。
- 模型选择收起时显示模型名，展开后显示提供商、完整模型名和已有说明。窄窗口内工具按钮可换行。
- 同步仓库教程、应用内教程、更新说明和 TX-136 回归分组。

- 验证：源码 Electron 在 520 与 650 像素宽度下验证模型和权限位于输入框内、顶部栏移除、工具按钮未溢出，并验证收起模型简名、展开说明、主题强调色、切换模型及权限。截图直接捕获插件正文，归档 .artifacts/runs/2026-11-10T06-57-47-223Z-e2e。
- 验证：源码开发服务的 Vue 旧版 HTML 嵌套校验提示了原生可定制下拉的子元素。当前 Electron 中展开、键盘关闭及选中结果均通过回归。
- 验证：pnpm build:setting 与 pnpm build:tools 通过。最终免安装预览 1.4.1 已包含网页 API 修复和输入框调整。同步核对 2139 个程序文件，data 与 legacy 共 2256 个文件通过保留校验。收据 .artifacts/backups/preview-sync/update-1794294057000/preservation.json。
- 验证：pnpm test:preview:resources 独立核验通过，覆盖 2138 个程序文件、352 个内置文件和 11881 个运行依赖文件。构建、同步及核验日志位于 .artifacts/call-ai-composer-settings/。
- 验证：清理两次同步的程序暂存、旧纯程序回退和已归档的布局截图副本，共 59988 个文件、2778862276 字节。保留最近一次程序回退（722377476 字节）、全部保留收据及原始测试归档。清理收据位于 .artifacts/call-ai-composer-settings/。
- 验证：清理后 .artifacts 约 5.92 GiB，主要保留原始测试归档 2.62 GiB、备份和审计收据 1.33 GiB、现用工具链 1.18 GiB、既有下载 0.56 GiB 和上游参考 0.18 GiB。

## 2026-11-10 · 修复 DeepSeek 网页工具被代理虚拟 IP 误拦

记录：[call-ai-deepseek-virtual-ip](../../docs/history/entries/2026-11-10-03-call-ai-deepseek-virtual-ip.json)；版本：1.5.1。

- 当前聊天已开启网页搜索，仍显示目标解析为内网或保留地址。本机系统解析返回 198.18.0.0/15 地址，通用网页防护在请求前拒绝了固定官方工具接口。
- 将 DeepSeek Search、Fetch 和 Brave Search 纳入统一的固定端点登记。共用入口使用系统 DNS、验证 HTTPS 证书并拒绝重定向，只有登记的 API 请求可附带凭据。通用网页保留连接时和重定向的公网校验。
- 记录新增搜索 API 的接入规则。TX-136 覆盖代理虚拟地址、固定端点的凭据边界以及同一会话关闭搜索后重新开启。

- 验证：用本机系统 DNS、启用证书校验且不带 API 密钥探测两个 DeepSeek 官方端点，均完成 TLS 并返回 HTTP 401。执行最终源码入口进行无密钥探测，两个 DeepSeek 端点返回鉴权错误，Brave 返回 HTTP 422。
- 验证：四个呼叫AI单测文件共 24 项通过，最终归档 .artifacts/runs/2026-11-10T06-53-29-644Z-unit。
- 验证：源码 Electron 验证同一会话关闭后重新开启搜索并使用两个 DeepSeek 端点，通过归档 .artifacts/runs/2026-11-10T06-52-45-734Z-e2e。
- 验证：pnpm typecheck、pnpm test:regressions call-ai --list、pnpm maintain、pnpm maintain:check、pnpm docs:check 和 git diff --check 通过。
- 验证：pnpm build 与共用入口调整后的 pnpm exec electron-vite build 通过。免安装预览 1.4.1 已同步，核对 2139 个程序文件，data 与 legacy 共 2256 个文件通过保留校验。收据 .artifacts/backups/preview-sync/update-1794293665446/preservation.json。
- 验证：pnpm test:preview:resources 独立核验通过，覆盖 2138 个程序文件、352 个内置文件和 11881 个运行依赖文件。构建、同步及核验日志位于 .artifacts/call-ai-deepseek-virtual-ip/。
- 验证：两次源码回归清理已归档的 Playwright 副本共 14 个文件、688626 字节。保留原始自动归档及清理收据。

## 2026-11-10 · 合并呼叫AI连续思考，添加产物链接并接通图片匹配

记录：[call-ai-results-and-image-match](../../docs/history/entries/2026-11-10-02-call-ai-results-and-image-match.json)；版本：1.5.1。

- 模型工具往返未产生新内容时复用同一思考条目，保留各轮间隔和展开状态。
- 原生文件工具和成功生成已声明文件的脚本发布会话内产物链接。点击文件名用默认软件打开，也可在文件夹中选中文件。
- 为呼叫AI登记 img 匹配并将选中图片带入附件区。用户点击发送后才提交，沿用视觉能力和大小限制。
- 同步仓库教程、应用内教程、指令清单、更新说明、Bug 台账和 TX-136 回归分组。

- 验证：四个呼叫AI单测文件共 24 项通过，覆盖图片能力、格式和大小校验。最终归档 .artifacts/runs/2026-11-10T06-28-22-178Z-unit。
- 验证：源码 Electron 回归通过，验证连续思考合并与保留展开状态、产物名称与系统打开和定位路由、脚本生成文件、未登记路径拒绝、超级面板图片匹配及点击发送后的模型入参。最终归档 .artifacts/runs/2026-11-10T06-28-28-472Z-e2e。
- 验证：pnpm typecheck、pnpm test:regressions call-ai --list、pnpm docs:check、pnpm maintain 和 pnpm maintain:check 通过。
- 验证：pnpm build 通过。免安装预览 1.4.1 已同步，核对 2139 个程序文件，data 与 legacy 共 2254 个文件通过保留校验。保留收据 .artifacts/backups/preview-sync/update-1794292244203/preservation.json。
- 验证：pnpm test:preview:resources 独立核验通过，覆盖 2138 个程序文件、352 个内置文件和 11881 个运行依赖文件。构建、同步及核验日志位于 .artifacts/call-ai-results-and-image-match/。
- 验证：清理本轮程序暂存、上一次纯程序回退及已归档的 Playwright 副本，共 29997 个文件、1389579259 字节。保留本轮唯一程序回退（722372301 字节）、全部保留收据及原始测试归档。清理收据位于 .artifacts/call-ai-results-and-image-match/。
- 验证：清理后 .artifacts 约 5.92 GiB，保留原始测试归档 2.62 GiB、备份和审计收据 1.33 GiB、现用工具链 1.18 GiB、既有下载 0.56 GiB 和上游参考 0.18 GiB。

## 2026-11-10 · 修复呼叫AI网页工具错误处理与授权，统一聊天交互

记录：[call-ai-web-and-chat](../../docs/history/entries/2026-11-10-01-call-ai-web-and-chat.json)；版本：1.5.1。

- 核对 DeepSeek 官方 Search 和 Fetch 端点。搜索只请求摘要，读取正文走 Fetch，格式异常返回可归因的工具错误。模型生成非法工具参数时保持工具调用配对并拒绝执行，允许模型修正。
- 开启网页搜索即授权本轮内置网页工具。关闭时在两种权限模式下都不注册检索与抓取，第三方 MCP 仍需显式引用并遵循当前审批模式。
- 移除单次任务 40 次模型往返计数，保留停止、超时和会话清理。
- 为模型和权限下拉使用圆角主题面板。审批按钮与代码块分区，用户消息右侧显示，选中文本可右键复制，输入框可右键粘贴。
- 同步仓库和应用内教程、更新说明、Bug 台账和 TX-136 回归分组。

- 验证：四个呼叫AI相关单测文件共 24 项通过，归档 .artifacts/runs/2026-11-09T16-34-40-581Z-unit。
- 验证：源码 Electron 首轮未通过强调色断言，原因是夹具只发送广播，没有按设置页流程先保存颜色。修正夹具后通过，归档 .artifacts/runs/2026-11-09T16-34-48-311Z-e2e 和 .artifacts/runs/2026-11-09T16-36-49-223Z-e2e。
- 验证：通过的源码回归使用模型和 HTTPS 响应替身，验证非法工具参数和非法搜索响应后的恢复、超过 40 次工具往返、完全权限下关闭开关时无请求，以及强调色、圆角菜单、气泡位置、审批间距和原生右键操作路由。
- 验证：pnpm typecheck、pnpm test:regressions call-ai --list、pnpm maintain、pnpm maintain:check 和 pnpm docs:check 通过。
- 验证：本地 pnpm build 通过，日志 .artifacts/call-ai-web-and-chat/build.log。免安装预览 1.4.1 已同步，核对 2139 个程序文件，data 与 legacy 共 2249 个文件一致。保留收据 .artifacts/backups/preview-sync/update-1794242339884/preservation.json。
- 验证：独立资源核验通过 2138 个程序文件、352 个内置文件和 11881 个运行依赖文件。
- 验证：清理已消费的程序暂存、上一次纯程序回退和已归档的 Playwright 副本，共 29996 个文件、1389582775 字节。保留本次唯一预览程序回退（722368954 字节）、全部保留收据及原始测试归档，清理收据见 .artifacts/call-ai-web-and-chat/。
- 验证：空间复核中 .artifacts 子目录合计约 5.92 GiB，主要为测试归档 2.62 GiB、备份及审计收据 1.33 GiB、工具链 1.18 GiB、既有下载 0.56 GiB、上游参考 0.18 GiB。保留原始证据、持久资料、现用工具链和其他任务资料。

## 2026-11-09 · 紧凑呼叫AI工具栏并按聊天开关接入 DeepSeek 网页搜索与抓取

记录：[call-ai-web-controls](../../docs/history/entries/2026-11-09-03-call-ai-web-controls.json)；版本：1.5.1。

- 按截图移除键盘提示和独占底行的结果目录入口，将附件、引用、结果目录与发送放在同一行并使用带可访问名称的图标。
- Skill 和 MCP 管理区都使用水平与垂直居中的“添加”，设置强调色改用通用设置的主题变量。根据截图反馈，补齐实际按钮与菜单按钮的垂直对齐。
- 网页搜索默认关闭，主进程只接受本轮显式布尔授权。关闭时同时禁用内置 URL 索引和第三方 MCP 引用，现有通用代码执行继续遵循所选权限模式。
- 官方 DeepSeek 提供商复用当前密钥调用 Search 和 Fetch 的固定 POST 端点，兼容网关和其他提供商使用原有通用抓取及可选 Brave Search。
- 同步仓库与应用内教程、开发规范、更新说明、Bug 台账和 TX-136 回归分组。

- 验证：呼叫AI四个单测文件共 23 项通过，归档 .artifacts/runs/2026-11-09T15-16-10-937Z-unit。
- 验证：首轮源码 Electron 回归通过，但当时只验证了水平居中。用户指出 Skill 标签偏上后统一对齐，重新以文字和按钮边界校验两轴中心，源码 Electron 回归通过。归档 .artifacts/runs/2026-11-09T15-16-20-098Z-e2e 与 .artifacts/runs/2026-11-09T15-23-42-148Z-e2e，后者包含修正后的设置正文截图。
- 验证：本地 pnpm build 与居中修正后的 pnpm build:setting 通过。构建日志 .artifacts/call-ai-web-controls-build.log 和 .artifacts/call-ai-web-controls-setting-centering-build.log。
- 验证：两次固定免安装预览同步各比对 2139 个程序文件，data 与 legacy 共 2247 个文件保持一致。首次收据 .artifacts/backups/preview-sync/update-1794237528185/preservation.json，最终居中修正收据 .artifacts/backups/preview-sync/update-1794237875564/preservation.json。
- 验证：最终预览独立核验通过 2138 个程序资源、352 个内置文件和 11881 个运行依赖文件。
- 验证：核对工作区边界、Git 跟踪和链接后，清理两轮已消费程序暂存、旧程序回退和已归档测试副本，共 59987 个文件、2778768782 字节。保留最新程序回退、审计收据和原始测试归档。清单与结果见 .artifacts/cleanup-2026-11-09-call-ai-web-controls/。

## 2026-11-09 · 呼叫AI批量文件审批、附件拖放与公网网页工具

记录：[call-ai-workflow](../../docs/history/entries/2026-11-09-02-call-ai-workflow.json)；版本：1.5.1。

- 通过 Electron 已知目录解析真实桌面。新建文本文件走主进程原生文件 API，批量预检并一次审批，展示绝对路径和实际 UTF-8 字节数。冲突保留原文件，批次失败回收本次已创建文件。
- 对话支持选择和拖入附件。普通文件按路径读取，具备图片输入能力的模型接收受限图片内容；仅保留最近一轮图片字节。
- 新增 HTTPS 网页读取与可选 Brave Search。公网校验绑定连接时的 IPv4 DNS，限制重定向、总时长和响应大小。搜索密钥使用系统加密存储。
- 修复分离标题栏图标、Markdown 列表缩进和设置操作对齐。移除重复标题及添加按钮下箭头，设置控件跟随 Windows 系统强调色。
- 更新呼叫AI开发规范、教程、更新说明与 TX-136 回归分组。

- 验证：相关 6 个单测文件共 29 项通过，归档 .artifacts/runs/2026-11-09T14-42-25-813Z-unit；pnpm docs:check 通过。
- 验证：最终源码 Electron 回归验证一次批准创建五个中文空文件、附件选择与拖放、图片输入、Markdown 列表、专属标题栏图标、设置按钮对齐及系统强调色。截图与日志归档 .artifacts/runs/2026-11-09T14-45-27-152Z-e2e。
- 验证：生产编译发现格式化后内联附件事件语法不兼容，提取为具名处理器后 pnpm build 通过。构建日志 .artifacts/call-ai-workflow-build-final.log。
- 验证：退出固定免安装预览后同步本地资源，程序比对 2139 个文件，data 与 legacy 共 2240 个文件保留。收据 .artifacts/backups/preview-sync/update-1794235506433/preservation.json。长时会话中的 CIM 查询发出提示，另通过 context-mode 确认切换前固定预览无运行进程。
- 验证：独立资源核验通过 2138 个程序资源、352 个内置文件和 11881 个运行依赖文件。
- 验证：确认目标位于工作区且无重解析点或 Git 跟踪后，清理已消费暂存、旧程序回退和已归档的测试副本，共 29997 个文件、1389545689 字节。保留最新程序回退及全部审计和原始测试证据，清单与收据位于 .artifacts/cleanup-2026-11-09-call-ai-workflow/。
- 验证：清理后资源核验、pnpm docs:check 与 git diff --check 通过。

## 2026-11-09 · 缩小呼叫AI首次窗口并独立管理 Skill 和 MCP

记录：[call-ai-settings](../../docs/history/entries/2026-11-09-01-call-ai-settings.json)；版本：1.5.1。

- 根据用户截图缩小首次窗口，移除红框文本，保留模型、权限、引用和结果目录入口。呼叫AI使用独立的分离窗口尺寸记录。
- 设置侧栏新增“呼叫AI”。规则和手填路径在编辑结束后逐项保存，列表开关和已确认的操作立即生效。全局规则和运行时默认折叠，产物清理入口精简为“一键清理”。
- 默认产物父目录和新会话子目录使用 Call_AI，保留自定义路径和旧产物。清理兼容当前默认位置内已登记的旧格式子目录。
- Skill 从 ZIP 安装，限制文件项数和解包体积，保留相对资源及已有 Skill。MCP 支持启停、编辑、移除配置、mcpServers JSON 和 npm 包安装。
- 对话增加受当前权限模式控制的 Skill ZIP 安装、npm MCP 安装和 MCP 配置工具，更新已打开窗口的引用列表。系统提示仅提供目录及能力标识、名称和状态，外部 MCP 按轮加载和释放。
- 同步 README、更新说明、开发规范、仓库与应用内教程，沿用 call-ai 回归分组。

- 验证：呼叫AI、分离窗口升级、生命周期、临时常驻及命名空间单测共 6 个文件 37 项通过，归档 .artifacts/runs/2026-11-09T13-54-50-066Z-unit。
- 验证：首次 Electron 回归发现正文的旧固定高度覆盖宿主初始尺寸，移除后回归通过，归档 .artifacts/runs/2026-11-09T13-45-10-883Z-e2e。
- 验证：复核直接正文截图后调整 MCP 弹窗居中，尺寸断言和完整回归通过。窗口、设置列表、MCP 弹窗及对话截图见 .artifacts/runs/2026-11-09T13-49-44-830Z-e2e。
- 验证：pnpm docs:check、pnpm build 和最终 pnpm build:setting 通过。构建日志见 .artifacts/call-ai-settings-build.log 和 .artifacts/call-ai-settings-final-build.log。
- 验证：中间预览同步在程序切换后、收据写入前达到 MCP 调用时限，独立资源核验通过后改用长时会话同步最终程序。
- 验证：固定免安装预览已同步，程序比对 2139 个文件，data 与 legacy 共 207 个文件保留。收据 .artifacts/backups/preview-sync/update-1794232458660/preservation.json。长时会话中的 CIM 查询发出提示，另通过 context-mode 在切换前确认固定预览无运行进程。
- 验证：独立资源核验通过 2138 个程序资源、352 个内置文件与 11881 个运行依赖文件。
- 验证：核对工作区边界、Git 跟踪和链接后，清理已消费暂存、旧程序回退及已归档的测试副本，共 47749 个文件、2610024316 字节。保留最新程序回退及全部审计和原始测试归档。清单和收据位于 .artifacts/cleanup-2026-11-09-call-ai/。
- 验证：清理后 pnpm test:preview:resources、pnpm docs:check 与 git diff --check 通过。

## 2026-11-08 · 新增一次性呼叫AI子组件，集成提供商、Node/Python、context-mode与手动Skill/MCP

记录：[call-ai](../../docs/history/entries/2026-11-08-09-call-ai.json)；版本：1.5.1。

- 保留开始时演示编辑器等已有未提交改动，默认使用context-mode阅读维护流程与模块规范。
- 采用pi agent core 1.5.0和宿主提供商协议适配器；聊天只在当前内存会话中存在，没有历史、记忆和进化。
- 按用户新增要求集成实际context-mode 2.1.6进程，仅暴露执行、批量、索引、搜索与统计，索引和HOME属于本次会话。
- 新增请求批准/完全权限、Markdown受限渲染、审批与提问卡片、手动斜线引用；普通、选文、文件、窗口入口统一路由。
- 内置官方便携Node/Python，新增包与预置程序分目录，设置提供状态、更新和额外库清理。
- 设置集成全局规则、Skill安装与MCP配置、默认产物位置及原生二次确认清理，仅清理本工具登记的当前默认目录产物。
- 用户明确要求打开即临时常驻，宿主对call-ai实施该例外；关闭或取消常驻撤销能力，Windows Job Object回收命令及后代，产物保留。

- 验证：主进程类型检查通过。新增5项单测通过，归档.artifacts/runs/2026-11-08T14-41-40-911Z-unit。
- 验证：首次命令取消单测发现非零退出码覆盖取消原因，修正后通过；两次失败归档保留。
- 验证：初次源码专项发现首次复制预置工具造成状态等待和输出目录防护误把整盘判定保护目录，分别改为直接使用只读预置程序与精确根目录校验。
- 验证：完整pnpm test --maxWorkers=2通过133个文件885项，归档.artifacts/runs/2026-11-08T15-01-05-834Z-unit。
- 验证：源码Electron扩展专项最终通过，归档.artifacts/runs/2026-11-08T15-10-21-368Z-e2e：实际Node/Python版本检查、真实context-mode执行、审批、自由提问、手动Skill和stdio MCP、Python结果文件、长命令PID结束、完全权限、普通/文本/文件/窗口入口与重入、关闭临时目录清空、重开空聊天，以及二次确认取消/删除并保留其他文件。直接插件正文截图保存在该归档。
- 验证：精简框架打包为74532字节，pi依赖仅供构建使用，保留所有实际打入依赖的原始许可；最终程序不加载pi提供商。早期ESM导出不兼容的失败记录保留；初次分离遇焦点切换已用宿主保护链修正，冷启动等待按完整正文就绪处理。
- 验证：相邻tools-catalog在.artifacts/runs/2026-11-08T15-04-38-206Z-e2e中通过；同次呼叫AI失败已在后续独立专项修正并通过。
- 验证：9项工具边界单测通过，归档.artifacts/runs/2026-11-08T14-56-53-547Z-unit，覆盖清理目录边界、链接拒绝、额外环境隔离、根进程结束后的后代清理、取消、默认目录、内置MCP身份、原生确认和活动会话互斥。
- 验证：pnpm docs:check通过40功能码、15分类、31普通指令和16章教程；最终源码类型检查及本地构建完成后再同步固定预览。
- 验证：最终pnpm build通过，日志.artifacts/call-ai-build-final.log；相关宿主生命周期4文件17项通过，归档.artifacts/runs/2026-11-08T15-12-24-317Z-unit。
- 验证：首次preview:sync在替换前因逐文件glob过长失败，原预览与资料未动；登记BUG-PREVIEW-LARGE-RUNTIME-GLOB和TX-135，改为目录树展开，900条长路径实际归档及相邻14项单测通过，归档.artifacts/runs/2026-11-08T15-17-52-776Z-unit。
- 验证：已校验失败暂存无回退载荷、无链接且未跟踪，删除本轮失败stage的17683文件1200838059字节；收据.artifacts/cleanup-2026-11-08-call-ai/failed-stage.json，失败日志及原始测试归档保留。
- 验证：空间分类盘点.artifacts/cleanup-2026-11-08-call-ai/before.json：历史测试证据约2682MiB、工具链1213MiB、备份1200MiB、下载570MiB、上游181MiB属于既有资料或独有证据保留；本轮内置运行时约126MiB为实际程序资源，保留。
- 验证：preview:sync最终成功，2139个程序文件通过同步核对，143个原有资料文件逐文件保留；收据.artifacts/backups/preview-sync/update-1794151121846/preservation.json。固定入口PreviewPortable.cmd，预览.local/portable-preview/，未重置配置或已安装插件。
- 验证：pnpm test:preview:resources通过2138个程序资源、350个内置文件及11881个运行依赖文件，日志.artifacts/call-ai-preview-resources.log。
- 验证：校验绝对路径、祖先后代无链接及无Git跟踪后，清理成功同步的app、空new-resources与被替代的旧previous-resources，共17755文件1220559640字节；计划和结果见.artifacts/cleanup-2026-11-08-call-ai/preview-plan.json与preview-result.json。合计本轮回收35438文件2421397699字节，最新previous-resources及全部资料、审计收据、原始失败证据保留。
- 验证：清理后再次pnpm test:preview:resources通过，日志.artifacts/call-ai-preview-resources-final.log；pnpm docs:check、pnpm maintain、pnpm maintain:check与git diff --check全部通过。未执行push、云端构建或Release，保留任务开始时所有既有未提交内容。

## 2026-11-08 · 1.4.1发布验收与Windows素材库路径别名修正

记录：[release-1.4.1-verification](../../docs/history/entries/2026-11-08-08-release-1.4.1-verification.json)；版本：1.4.1。

- 云端Windows以RUNNER~1短路径创建临时目录，录制库仅规范根目录而未规范选择路径，回收事务错误拒绝合法素材。移除、撤销和指定回收统一使用真实父目录及原文件名，父目录解析按选择批次缓存，外部目录别名仍拒绝。
- 补充目录别名跨入口撤销及指定回收、外部别名拒绝的回归。当前v1.4.0仅为未发布候选，失败构建未生成Release，修正后继续本轮已授权的发布流程。
- 保留已推送的v1.4.0失败候选标签及工作流记录，正式版本顺延为1.4.1，更新package、README和发行说明后重新构建，不覆盖既有标签。

- 验证：候选b5a493cec273451f1a9062f5bb4220d1b21927d5通过hooks提交并原子推送main和v1.4.0；工作流https://github.com/DwenChen/TabDo/actions/runs/42472925526在云端单测失败，发布作业跳过。869项通过、录制库两项因真实/短路径字符串比较失败，原始日志已保留到context-mode索引cloud-v1.4.0-failed-unit-log，后续保存本地发布收据。
- 验证：确认GitHub不存在v1.4.0正式Release（404）；本地素材库/回收单测2文件7项通过，归档.artifacts/runs/2026-11-08T10-54-33-531Z-unit；真实控制条和素材回收源码专项通过，归档.artifacts/runs/2026-11-08T10-54-36-441Z-e2e。首轮完整云端失败日志已保存.artifacts/releases/1.4.0/first-cloud-build.log。
- 验证：1.4.1最终全量单测130文件872项通过，归档.artifacts/runs/2026-11-08T10-57-26-671Z-unit；pnpm build完整生产编译和Node/Web类型检查通过，日志.artifacts/presentation-1.4.1-build.log；设置类型检查、相关ESLint与docs:check通过。
- 验证：1.4.1预览同步成功，preservedFiles=0，104项程序同步，103程序/346内置/1687媒体资源核验通过；data与legacy均为0项。最新回退为.artifacts/backups/preview-sync/update-1794135615311/previous-resources，保留所有资料备份及审计收据。
- 验证：核验预览后回收本轮已消费app/new-resources和被替代的上一程序回退，共3目录5526文件1055199212字节；删除前检查工作区绝对边界、目录链接和Git跟踪，清理后再次通过预览资源核验。收据.artifacts/cleanup-2026-11-08-release-1.4.1/。
- 验证：1.4.1代码提交013d9e17a476d38c429ebed98f3e6db9528729cc，保留hooks原子推送main及v1.4.1。云端42474211118第一轮通过维护、文档、类型、单测和生产编译，在electron-builder下载Electron 41.4.0官方ZIP时HTTP 504失败，发布跳过；原始日志.artifacts/releases/1.4.1/cloud-build-attempt-1.log，使用同一提交重试失败作业。
- 验证：同一工作流第二轮构建与发布均成功，云端130文件872项单测通过，Windows安装包与便携包完整打包。https://github.com/DwenChen/TabDo/actions/runs/42474211118；正式Release于2026-11-08T11:22:36Z发布：https://github.com/DwenChen/TabDo/releases/tag/v1.4.1，非草稿/非预发布且latest=v1.4.1；标签解引用和target_commitish均为013d9e17a476d38c429ebed98f3e6db9528729cc。
- 验证：下载并逐项核对4份资产的大小及GitHub SHA-256：latest.yml 14990字节、安装包261962246字节、blockmap 271551字节、便携ZIP 335686341字节，总计597935128字节；安装包SHA-512与更新清单files及顶层字段一致。ZIP共634成员，12项关键资源及AGPL/OFL许可齐全，ASAR内3653成员、应用版本1.4.1、组合许可正确且无工作区资料；实际运行包内wgc-capture --test-clock通过暂停边界和音频包连续时钟向量。元数据、下载/包核验收据和完整云端日志保存在.artifacts/releases/1.4.1/。
- 验证：产物核验后回收已替代的1.3.0三份二进制下载、验收解包副本及两份一次性脚本，共6目标8文件632493882字节；保留最新版原始发行资产、旧更新清单、全部失败证据和资料备份。空间收据.artifacts/cleanup-2026-11-08-release-1.4.1/；剩余.artifacts约6165539459字节，主要为独有测试证据2800001859、已安装工具链1271403533、资料及最新程序回退1258673567、新发行原件597961935、上游对照资料190214495，未按年龄清除其他任务材料。
- 验证：最终推送前对照源码复核README、发行说明、开发/工具/演示/内存规范、应用内与仓库教程；路径修正未改变可见操作名称和教程流程，现有说明仍准确。维护和文档检查在发布前及最终验收记录提交前重新执行，保留所有hooks。

## 2026-11-08 · 演示编辑器遮罩控件、片段选中强调、拖动光标及预览尾边界优化

记录：[presentation-editor-boundaries](../../docs/history/entries/2026-11-08-08-presentation-editor-boundaries.json)；版本：1.5.1。

- 开始时工作区干净，按维护流程审阅索引、Bug台账、侧栏、时间轴、视觉效果和空间规范。
- 圆角只在矩形遮罩与图片显示，使用共享滑条，切换圆形或手绘时保留原圆角；三类遮罩采用同一条件。
- 所有片段增加覆盖缩略图和波形的统一对比选区环，明暗主题使用对应色，选中后持续显示非缩略图片段的长度手柄。
- 游标与关键帧共用按手势创建的系统指针样式，避免时间轴更新反复清除body光标；松开、Escape、失焦、系统取消和卸载释放所属样式及监听。
- 将相机的终点规则提取为全部预览图层共用的取样，字幕和注释保留亚毫秒精度；相机、二维/三维镜头、模糊及录制光标共同使用末片内部时间，内部切口和短片段不延长。
- 新增TX-134及四项Bug记录，同步README、仓库/内置教程、侧栏/时间轴/视觉规范与未发布更新说明。

- 验证：完整pnpm test --maxWorkers=2通过131文件876项，归档.artifacts/runs/2026-11-08T12-44-01-675Z-unit；最终相邻单测5文件36项通过，归档.artifacts/runs/2026-11-08T12-53-49-215Z-unit。
- 验证：首轮新增单测把比结尾早1ms的注释与60fps最后输出帧混为同一时刻，断言失败归档.artifacts/runs/2026-11-08T12-41-54-425Z-unit；改为真正早于末输出帧的短片段，仍单独检查精确终点不恢复较短注释。
- 验证：新增源码专项发现共享SliderControl漏传formatValue导致选中遮罩时页面报错，已补齐必填回调；最初5秒冷启动等待和原生range的aria-valuenow断言也已按实际页面修正，失败归档完整保留。
- 验证：独立演示tsconfig路径不存在，初次命令未完成检查；随后通过TypeScript API按Vite别名检查七个修改文件及依赖，0错误，收据.artifacts/presentation-boundaries-source-typecheck-final.json。主进程/宿主类型检查完成，日志.artifacts/presentation-boundaries-host-typecheck.log；修改文件ESLint无错误。
- 验证：pnpm test:regressions presentation-editor-boundaries --list确认3单测文件与3源码专项登记；另执行统一侧栏相邻专项。
- 验证：空间分类盘点收据.artifacts/cleanup-2026-11-08-editor-boundaries/before.json：历史测试证据约2671MiB、实际工具链约1213MiB、备份约1200MiB、发行下载约570MiB、上游来源约181MiB。资料和独有证据保留，预览核验后清理本轮暂存及被替代的旧程序回退。
- 验证：新增源码Electron专项最终通过，归档.artifacts/runs/2026-11-08T13-04-44-237Z-e2e；三类遮罩、撤销重做、明暗选区、字幕/注释/按键终点、内部切口、两次重开后的原生指针稳定性、松开/失焦/Escape清理及保存恢复全部验证。
- 验证：标准/现代两套合成器分别在WebGL/WebGPU中，最后输出帧与预览终点取样均有11556个红色标记像素，精确结束边界为0；收据见本次terminal-export-pixels.json，明暗及终点截图仅捕获插件正文。
- 验证：相邻presentation-inspector、presentation-timeline-effects、presentation-visual-effects全部通过，归档.artifacts/runs/2026-11-08T12-54-38-017Z-e2e；该次新增专项因非整数DPI的边框计算断言失败，单独修正后已通过。主题测试同步所属父页面，避免实际主题跟随刷新覆盖；像素对照改用独立纯红图片，避免把文字紧凑背景面积误作整个显示框。
- 验证：pnpm build成功，日志.artifacts/presentation-boundaries-build.log；仅用于本地预览交付，未执行push、云端构建或Release，也未重置资料。
- 验证：pnpm preview:sync成功，104个程序文件通过同步核对；原data与legacy均为空，前后快照完全相同，未创建、删除或重置已有配置/插件。收据.artifacts/backups/preview-sync/update-1794143310571/preservation.json，当前预览.local/portable-preview/，根PreviewPortable.cmd仍为固定入口。
- 验证：pnpm test:preview:resources通过103个程序文件、346个内置文件及1687个媒体资源，日志.artifacts/presentation-boundaries-preview-resources.log。
- 验证：按明确清单校验绝对路径、祖先/后代无链接、无Git跟踪，且4份重复测试证据与自动归档逐文件内容一致后，清理本轮app、空new-resources、被替代旧previous-resources及当前重复测试输出，回收5530文件1055933722字节（约1007.02MiB）；最新程序回退update-1794143310571/previous-resources和所有保留收据不动。清单与结果见.artifacts/cleanup-2026-11-08-editor-boundaries/。
- 验证：清理后再次pnpm test:preview:resources通过，日志.artifacts/presentation-boundaries-preview-resources-final.log；最终pnpm docs:check、pnpm maintain、pnpm maintain:check及git diff --check全部通过，未触及其他未提交内容。

## 2026-11-08 · 演示录屏最终资源优化与TabDo1.4.0发布候选验收

记录：[presentation-final-review](../../docs/history/entries/2026-11-08-07-presentation-final-review.json)；版本：1.4.0。

- 麦克风电平检测按effect独立持有设备和音频上下文，在resume前登记资源，迟到、失败及菜单关闭均释放；分析限制为每秒最多20次并使用整数级别减少重复更新。
- 顺序视频解码器销毁先取消背压和帧等待，再关闭解码器并释放解复用；取消后的输出帧立即关闭，异步URL、加载及配置完成不得复活工作进程。
- 演示后端成对追踪创建和取消的定时器，立即移除已取消句柄，清理退出期间产生的短期等待，并在普通退出解除owner销毁监听。删除无调用方的VideoFileDecoder；保留仍被标准导出路径调用的VideoExporter及原背景圆角改动。
- 新增TX-132资源回归，按用户本轮授权推进提交、push、云端构建和正式Release；本地预览同步核验后备份并重置为初始安装资料。
- 实际同步专项暴露WASAPI逐包QPC抖动修改连续PCM内容，改用可靠首包QPC锚定设备帧计数，真实缺口和重置重新校准，匹配门槛保持不变。
- 两套导出渲染器在异步准备前登记辅助解码来源，退出阻止恢复媒体元素回退；坏素材准备失败自动释放解复用器，等待帧期间的解码错误不再当作EOF。
- 空视频与注释图片来源使用undefined，避免React将空src解释为当前页面下载；原生构建同步更新已分发WGC程序的源码与二进制收据。
- 播放与片段工具复用PlaybackAction提示，修复启用按钮缺少触发器及播放条提示未呈现；原生回退全屏在捕获阶段响应Esc，模态菜单仍优先处理，避免提示层吞掉全屏退出。

- 验证：开始时Git已有416项未提交变化，保留此前修改；按维护流程审阅索引、Bug台账、模块、资源和发布规范。
- 验证：pnpm test tests/main/presentationRuntimeTimers.test.ts tests/main/presentationForwardFrames.test.ts tests/main/presentationAudioMeter.test.ts通过3文件11项，归档.artifacts/runs/2026-11-08T09-30-08-640Z-unit。
- 验证：完整pnpm test --maxWorkers=2通过130文件868项，归档.artifacts/runs/2026-11-08T09-36-37-387Z-unit；主进程、宿主与设置类型检查通过。全仓静态检查发现7项返回类型错误，已修复并通过相关文件检查；历史格式警告保留。
- 验证：真实WebCodecs连续五次满队列销毁通过，归档.artifacts/runs/2026-11-08T09-35-30-152Z-e2e；首轮因样片未经正式项目登记而被媒体白名单拒绝的失败归档.artifacts/runs/2026-11-08T09-32-00-103Z-e2e，测试已通过正式接口登记素材。
- 验证：控制条、物理相机与三次冷启动通过，双音轨同步第二处参考匹配失败，归档.artifacts/runs/2026-11-08T09-39-27-260Z-e2e。离线PCM复核发现连续包的采样位置跳变，定位到逐包QPC修正而非降低参考匹配门槛。
- 验证：片段及导入专项通过；旧录制和编辑审查测试仍引用已删除自动保存说明与旧箭头名称，归档.artifacts/runs/2026-11-08T09-43-32-226Z-e2e，按当前源码修正定位器并保留实际持久化与撤销验证。
- 验证：原生帮助程序以MSVC14.44.35207和SDK10.0.26100.0编译成功，日志.artifacts/presentation-final-native-build.log；初次工具链路径缺少msvc子目录而未启动编译，修正路径后成功。
- 验证：原生时钟及短音单测10项通过，归档.artifacts/runs/2026-11-08T09-49-27-263Z-unit。pnpm test:e2e tests/e2e/presentation-synchronization.spec.ts --repeat-each=2两轮全部通过，归档.artifacts/runs/2026-11-08T09-49-30-321Z-e2e；八处音频测点最大绝对误差约0.273ms，相关度0.961至0.964，背景RMS约0.055至0.063；屏幕与相机每轮五处实际时间码相等。
- 验证：最终完整单测通过130文件871项，归档.artifacts/runs/2026-11-08T09-52-57-323Z-unit；全仓ESLint0错误77条历史警告，收据.artifacts/presentation-final-eslint.json。文档检查通过37文档253本地链接、15章66步。
- 验证：录制综合回归发现旧自动保存说明、旧编辑鼠标隐藏行为及默认展开的变焦设置断言；按现行规范更新测试，不恢复旧UI。旧箭头标签与教程首次就绪期限亦已修正，失败归档.artifacts/runs/2026-11-08T09-51-48-530Z-e2e及.artifacts/runs/2026-11-08T09-55-30-950Z-e2e。后者教程与完整编辑审查通过。
- 验证：默认值、重开拖轨、摄像头编辑、检查器以及录制导出和会话回收四项源码专项通过，归档.artifacts/runs/2026-11-08T09-59-16-383Z-e2e；轨道专项暴露提示触发器缺失；后续已补齐并统一实际提示验证，原失败继续保留。
- 验证：.artifacts/runs/2026-11-08T10-06-19-348Z-e2e中资源退出、时间轴关联效果、视觉效果和三维镜头专项通过；轨道提示断言暴露真实触发器缺失。修复后.artifacts/runs/2026-11-08T10-15-46-012Z-e2e轨道整套通过，帧图横移复用50帧，四次热横移为36、26、36、25ms；新增提示使全屏Esc先被提示层消费，原失败保留并修正事件优先级。
- 验证：.artifacts/runs/2026-11-08T10-11-36-913Z-e2e真实解码满队列及两套渲染器背景/摄像头准备退出均通过；辅助来源在await之前登记所有权，退出不得回退到媒体元素或画布。
- 验证：播放提示与全屏Esc修复后，pnpm test:e2e tests/e2e/presentation-visual-effects.spec.ts通过，归档.artifacts/runs/2026-11-08T10-19-36-446Z-e2e；未降低原有全屏和导出断言。
- 验证：performance-budget通过，归档.artifacts/runs/2026-11-08T10-21-16-429Z-e2e。内存测试首次因旧5秒正文期限失败；修正后在设置闲置15秒测得工作集102.67MB、私有345.40MB而中断，归档.artifacts/runs/2026-11-08T10-23-10-903Z-e2e，原失败保留。
- 验证：根据AGENTS及memory-development的100MB目标口径，测试分别输出工作集/私有提交达标状态，资源退出、必要任务、恢复与重开仍硬性断言，不将目标未达或工作集下降写作完整释放。最终idle-memory完整流程通过，归档.artifacts/runs/2026-11-08T10-27-42-112Z-e2e。35秒工作集102.03MB/私有521.13MB，65秒104.99MB/519.97MB，两项目标均未达；三轮演示会话与工具页面全部退出，详细分进程数据见performance-audit。
- 验证：设置热重开中位794.7ms、回收后840.0ms；控制条首次3523.1ms、热开2463.3/2466.8ms、闲置后2421.7ms，保留源码编译边界。100MB目标未完全达成，未强杀共享GPU或音频服务。
- 验证：最终pnpm build通过宿主Node/Web类型检查、设置与工具编译及Electron生产编译，日志.artifacts/presentation-final-build.log；pnpm typecheck:setting与docs:check通过。最终全量单测130文件871项通过，归档.artifacts/runs/2026-11-08T10-34-09-471Z-unit；ESLint0错误76条历史警告。
- 验证：本轮对照源码审校README、开发指南、工具与内存规范、演示各模块文档、工具清单、应用内及仓库教程、changelog与维护记录；修正录制来源操作名和变焦设置称谓，教程正文继续保持15章66步一致。
- 验证：首轮preview:sync在new-resources/app.asar.unpacked切换时遭遇Windows EPERM，脚本自动回滚后确认预览仍为1.3.0、原资源保留，日志.artifacts/presentation-final-preview-sync.log。随后重试成功同步1.4.0的104项程序，219项既有资料逐文件一致，收据.artifacts/backups/preview-sync/update-1794134346262/preservation.json，日志.artifacts/presentation-final-preview-sync-retry.log。
- 验证：pnpm test:preview:resources通过103个程序文件、346个内置文件和1687个媒体文件，日志.artifacts/presentation-final-preview-resources.log。按本轮明确授权执行pnpm preview:reset --confirm-reset，将219项原资料完整备份到.artifacts/backups/portable-profile/2026-11-08T10-40-54-657Z-5cb58bcd，逐文件校验一致后创建空data与legacy；程序保持1.4.0。
- 验证：空间清理首次路径父级检查使用当前PowerShell不支持的Split-Path参数组合，在删除前停止；改用.NET路径父级与终止错误处理。逐项核对工作区绝对路径、祖先及后代无链接、无Git跟踪后，清理13项11058文件2118200848字节（约2020MiB）的已消费暂存、旧回退和本轮原生中间文件；收据.artifacts/cleanup-2026-11-08-final-review/plan.json与result.json。
- 验证：保留当前预览、update-1794134346262/previous-resources最近程序回退、全部资料备份、保留收据、工具链及原始测试失败证据。清理后资源复核再次通过，日志.artifacts/presentation-final-preview-resources-after-cleanup.log；Git状态和受保护程序/资料收据元数据一致，一次性清理脚本已删除。
- 验证：收尾空间复核.artifacts逻辑大小6164235324字节（约5.74GiB）：原始运行证据约2.61GiB、既有工具链约1.18GiB、最近程序回退与受保护资料备份约1.17GiB、旧发行下载约0.56GiB、上游参考约0.18GiB，详细清单.artifacts/cleanup-2026-11-08-final-review/space-after.json。本轮已消费程序暂存与原生中间文件清理完成；旧发行下载待新Release产物核验后按独立清单淘汰，资料和独有证据继续保留。
- 验证：提交前pnpm maintain、maintain:check、docs:check及git diff --check全部通过；核对远端main仍为cd9e1c8f，v1.4.0尚不存在，原有改动已保留且未混入日志、资料、备份、工具链或下载文件。

## 2026-11-08 · 解决演示录屏声音参考误判与控制条启动待复核项

记录：[presentation-pending-verification](../../docs/history/entries/2026-11-08-06-presentation-pending-verification.json)；版本：未发布。

- 将非静音阈值参考升级为31ms相位编码短音。原生参考与伴随PCM使用同一差分、4ms分段正交投影和完整编码覆盖校验，容忍包间载波相位变化，拒绝背景音、同频普通音及半段短音。正式录制的采集和编码时间边界保持原实现。
- 诊断发射按设备缓冲区连续提交，包含50ms静默准备及500ms独立WASAPI观察，参考时间来自实际匹配采样的QPC，不使用排队或函数返回时间。
- 源码验收改为等待三个服务共同就绪，接口在Vite的HTML回退前注册；启动Electron前验证JSON就绪响应及三个来源，避免误用返回SPA页面的旧服务。首次设置页与控制条使用明确的30秒正文就绪期限。
- 从覆盖层页面创建起捕获脚本、网络和崩溃诊断，新增三次全新隔离数据冷启动、带持续背景声的实际双音轨同步及负向识别回归，更新TX-131与模块文档。

- 验证：开始时Git已有409项变化，保留全部既有未提交内容。读取上轮声音参考和启动失败证据，没有把历史通过当成本轮验收。
- 验证：修改前新增冷启动诊断连续三次通过，归档.artifacts/runs/2026-11-08T08-16-12-249Z-e2e。首次集成时，就绪接口晚于Vite回退注册而返回HTML，短音参考也未可靠识别，归档.artifacts/runs/2026-11-08T08-22-42-892Z-e2e；修正为configureServer阶段注册，并补充设备分段发送和原始匹配诊断。
- 验证：首轮联合验收中控制条、真实相机和三次冷启动通过，短音在背景下相关度0.692不足，归档.artifacts/runs/2026-11-08T08-27-34-773Z-e2e。原生及脚本增加相同差分后，独立参考可识别，伴随PCM仍因相位相消无法匹配，归档.artifacts/runs/2026-11-08T08-33-05-548Z-e2e。离线逐毫秒分析发现后段载波相位翻转，改为分段正交匹配。
- 验证：分段匹配首轮单测因起点有一个采样差异导致两项严格相等失败，归档.artifacts/runs/2026-11-08T08-42-55-426Z-unit；将离线定位容差明确为两采样（48kHz约0.042ms），实际WASAPI对齐仍要求小于一帧，未放宽该验收标准。同频未编码声音和相位翻转负向/正向对照同步覆盖。
- 验证：后续联合验收中三个相邻源码专项通过，但第二个声音点错误匹配到17ms后的半段短音，归档.artifacts/runs/2026-11-08T08-46-23-377Z-e2e。增加至少四分之三编码分段有效匹配的覆盖要求，同时保留0.75整体匹配门槛；半段短音负向用例在脚本与编译后的原生实现均覆盖。
- 验证：最终原生源码以既有MSVC14.44.35207和SDK10.0.26100.0重新编译，成功后发布resources内程序，日志.artifacts/presentation-pending-native-build.log。pnpm test tests/main/presentationDiagnosticTone.test.ts tests/main/presentationCaptureClock.test.ts tests/main/presentationTimeline.test.ts通过3文件20项，归档.artifacts/runs/2026-11-08T08-54-07-657Z-unit。
- 验证：最终匹配器复核原失败录音三处，误差分别0.1114、0.0835和-0.0549ms，均小于一帧，数值收据.artifacts/presentation-pending-pulse-audit.json；原始录音和失败日志继续保留。没有修改声音采集时间戳或用预期位置回填实际结果。
- 验证：连续验收中一轮首次设置页等待沿用默认5秒而失败，另一轮完整同步通过，归档.artifacts/runs/2026-11-08T08-55-19-771Z-e2e；原始日志显示设置插件已创建但页面目标尚未就绪。两项冷启动测试统一显式30秒正文就绪期限，继续进行两轮真实采集复核。
- 验证：最终pnpm test:e2e tests/e2e/presentation-synchronization.spec.ts --repeat-each=2连续两轮全部通过，归档.artifacts/runs/2026-11-08T08-57-15-116Z-e2e。八个真实声音测点均小于一帧，最大绝对误差约0.0183ms，匹配质量0.806至0.864，背景RMS约0.021至0.024证明并非静音环境；两轮各五处屏幕和相机实际时间码完全一致，暂停恢复、输入轨迹及真实播放EOF保留相机末帧均通过。
- 验证：冷启动和相邻回归：.artifacts/runs/2026-11-08T08-46-23-377Z-e2e中的控制条、物理相机和三次冷启动均通过，真实相机两路时长均0.783317秒；随后两轮同步分别使用全新隔离资料再次完成启动。共同就绪接口、三个来源及正文均经过检查，上轮启动待复核项关闭，历史失败继续保留。
- 验证：7个相关脚本、配置、检测器及测试ESLint无错误无警告；pnpm docs:check通过37文档253本地链接、15章66步；pnpm test:regressions presentation-pending-verification --list通过。原声音参考和源码启动待复核项均已完成当前验收，历史失败未删除或改写。
- 验证：pnpm preview:sync同步1.3.0程序104项，312个原有配置、资料和插件文件保持一致；收据.artifacts/backups/preview-sync/update-1794128503496/preservation.json，日志.artifacts/presentation-pending-preview-sync.log。交付编译后的原生诊断程序，前端产物未发生本轮行为变化。pnpm test:preview:resources通过103个程序文件、346个内置文件与1687个媒体文件，日志.artifacts/presentation-pending-preview-resources.log。
- 验证：按明确清单核对绝对路径、祖先及后代无链接、无Git跟踪后，回收本轮app、空new-resources、被替代previous-resources及六个已消费原生编译中间文件，共9处5532文件1062989880字节（约1014MiB）；清单与结果位于.artifacts/cleanup-2026-11-08-pending-verification/。保留当前预览、resources中已发布原生程序、update-1794128503496/previous-resources最近程序回退、工具链、全部收据和原始失败证据。
- 验证：清理后pnpm test:preview:resources再次通过，日志.artifacts/presentation-pending-preview-resources-after-cleanup.log。空间复核.artifacts逻辑大小5909416496字节（约5.50GiB），原始测试证据约2.39GiB、既有工具链1.18GiB、最近回退与资料备份1.15GiB、历史下载0.56GiB、上游参考0.18GiB按原用途保留；本轮无新增下载或工具链，已消费程序暂存和本轮原生中间文件已清理。
- 验证：pnpm maintain、pnpm maintain:check、pnpm docs:check及git diff --check通过。未重置配置、资料或插件，未push、云端构建或Release。

## 2026-11-08 · 修复摄像头悬浮预览开启但不显示，并核查相机片段提前结束

记录：[presentation-camera-preview-tail](../../docs/history/entries/2026-11-08-05-presentation-camera-preview-tail.json)；版本：未发布。

- 宿主穿透能力响应补齐success，符合预加载契约，使渲染器实际创建悬浮预览；补充窗口可见、视频帧前进、关闭后移除及菜单关闭后仍显示的验证。
- 相机预览在全片最终端点使用末片内部取样，与主视频保留最后一帧一致；可见性与相机媒体同步使用同一取样，兼容独立片段、源偏移、倍速及旧项目。
- 保持内部切口左闭右开，较短相机片段、显式删空与时间轴间隙不补帧、不延长；不修改既有录制文件和项目片段。同步模块文档、Bug台账和回归TX-130。

- 验证：只读核对用户最近三次录制，两路实际视频帧数分别为194、208、347且每对完全一致，已保存项目的录屏与相机片段起止也一致；不读取或归档人像画面，不将资料文件名写入维护记录。定位到屏幕终点保留末片、相机却按独立半开边界隐藏的预览差异。
- 验证：修改前pnpm test:e2e tests/e2e/presentation-native-camera.spec.ts通过真实设备基线，归档.artifacts/runs/2026-11-08T07-41-52-602Z-e2e，短录制两路容器时长均0.783317秒，准备取消无遗留素材。未改动或重编译原生采集程序。
- 验证：首次增加编辑器终点断言时，仅等待录制会话发布就开始查询预览正文，5秒内未加载出相机视频，归档.artifacts/runs/2026-11-08T07-47-46-700Z-e2e；改为等待真实录屏片段正文和相机视频就绪，不以会话IPC返回代替页面就绪。
- 验证：pnpm test tests/main/presentationTimeline.test.ts tests/main/presentationCaptureClock.test.ts tests/main/presentationRecordingPreferences.test.ts通过3文件15项，归档.artifacts/runs/2026-11-08T07-50-06-772Z-unit；覆盖终点、内部切口、短相机、空片段、非终点、源偏移及倍速和真实原生时钟边界。
- 验证：pnpm test:e2e tests/e2e/presentation-controls.spec.ts tests/e2e/presentation-synchronization.spec.ts tests/e2e/presentation-native-camera.spec.ts三项全部通过，归档.artifacts/runs/2026-11-08T07-50-49-734Z-e2e；悬浮窗确实可见且视频时间前进，开关往返有效；真实相机两路时长均0.783317秒；实际屏幕与参考相机五处时间码完全相同，双声音脉冲与暂停恢复继续通过，编辑器全片终点保留相机末帧。人工查看悬浮窗与终点截图，另补充菜单退场完成和进度值确已到终点的最终断言。
- 验证：最终控制条专项再次通过（.artifacts/runs/2026-11-08T07-55-30-359Z-e2e中的第一项），明确等待菜单完全关闭后再检查悬浮窗与视频。该轮第二项因新增断言错误读取原生range的aria-valuemax而失败；改用原生max/value后同步专项通过，归档.artifacts/runs/2026-11-08T07-58-03-007Z-e2e。进一步发现range的10ms步长不能对任意素材触及精确终点，最终改为真实播放至源视频ended、播放按钮恢复后检查相机仍可见。
- 验证：追加真实播放结尾验证时，相机EOF断言及五处两路时间码一致均通过，但既有声音参考断言在.artifacts/runs/2026-11-08T07-59-34-639Z-e2e与2026-11-08T08-03-52-631Z-e2e失败：首次参考点的搜索窗口起点已有非静音信号，差值约150ms。调整顺序为先核对采集文件、再静音播放预览，仍保留该失败，不能记为最终全链专项通过。未改动产品声音采集、同步、编解码或原生二进制。
- 验证：不穿插其他桌面操作的复测首次在进入测试前退出，原始退出码3221226505且output.log为空，归档.artifacts/runs/2026-11-08T08-06-05-687Z-e2e；后续重试归档.artifacts/runs/2026-11-08T08-07-05-973Z-e2e未在30秒内显示录制按钮，尚未进入采集验收。检查未发现残留Playwright、Vite或源码预览进程；保留所有原始失败，不以此前三项通过覆盖当前未稳定验收项。
- 验证：pnpm docs:check通过37文档253本地链接、15章66步；pnpm test:regressions presentation-camera-preview-tail --list通过。新增取样函数、控制条和两项源码回归ESLint无错误无警告。宿主适配器和既有时间轴单测保留原有显式返回类型问题，不将其记为本轮Lint全部通过。pnpm build:tools通过，日志.artifacts/presentation-camera-preview-tail-build.log。
- 验证：用户确认退出预览后，pnpm preview:sync更新1.3.0程序104项，312个既有配置、资料和插件文件保持一致，收据.artifacts/backups/preview-sync/update-1794124650210/preservation.json；资源校验通过103个程序文件、346个内置文件和1687个媒体文件。日志.artifacts/presentation-camera-preview-tail-preview-sync.log与presentation-camera-preview-tail-preview-resources.log。
- 验证：预览核验后按绝对路径、无链接、无Git跟踪和程序载荷清单清理app、空new-resources及被替代previous-resources，共3处5526文件1055182069字节（约1006MiB），清单与结果位于.artifacts/cleanup-2026-11-08-camera-preview-tail/。仅保留update-1794124650210/previous-resources最近程序回退和全部收据；未清理资料、插件、独有测试证据或其他任务内容。清理后pnpm test:preview:resources再次通过，日志.artifacts/presentation-camera-preview-tail-preview-resources-after-cleanup.log。
- 验证：空间复核.artifacts逻辑大小5682009928字节（约5.29GiB），原始测试证据约2.17GiB、既有工具链1.18GiB、最近回退及资料备份1.15GiB、历史下载0.56GiB、上游参考0.18GiB按原用途保留；本轮未新增下载和工具链，已消费程序暂存已清理。未重置资料、push、云端构建或Release。

## 2026-11-08 · 录屏控制条补齐悬停提示，悬浮预览按钮居中显示当前开关状态

记录：[presentation-hud-hints](../../docs/history/entries/2026-11-08-04-presentation-hud-hints.json)；版本：未发布。

- 摄像头菜单将显示/隐藏悬浮预览改为悬浮预览已开启/已关闭，文字独立居中，左侧图标跟随当前状态。
- 录制前控制条的来源、系统音频、麦克风、摄像头、按键、倒计时、录制、编辑器、隐藏和关闭使用统一悬停及焦点提示；菜单打开时抑制提示，保留原触发行为和无障碍名称。

- 验证：pnpm test tests/main/presentationRecordingPreferences.test.ts通过1项相邻偏好单测，归档.artifacts/runs/2026-11-08T07-19-53-400Z-unit。
- 验证：源码专项前两轮首次悬停未出现提示，归档.artifacts/runs/2026-11-08T07-19-59-092Z-e2e与2026-11-08T07-22-49-226Z-e2e；为透明控制条增加显式Tooltip.Trigger，并在测试首次进入前通过透明区域的实际鼠标移动建立指针交互模式。第三轮提示已实际出现，但旧提示退场动画导致未限定名称的定位命中两项，归档.artifacts/runs/2026-11-08T07-24-31-220Z-e2e；改为按当前提示名称定位。
- 验证：pnpm test:e2e tests/e2e/presentation-controls.spec.ts通过，归档.artifacts/runs/2026-11-08T07-25-37-482Z-e2e，覆盖十项悬停提示、菜单触发与提示互斥、悬浮预览文字几何居中及选中状态往返，并继续完成原设备、真实按键录制、目录选择及素材回收流程。人工查看开启、关闭及提示截图，另补充提示动画结束后的稳定位置验证。
- 验证：相关4个源码与测试文件ESLint无错误无警告；pnpm test:regressions presentation-hud-hints --list通过。pnpm docs:check通过37文档253本地链接、15章66步。
- 验证：pnpm build:tools通过生产编译，日志.artifacts/presentation-hud-hints-build.log。最终源码专项再次通过，归档.artifacts/runs/2026-11-08T07-28-43-465Z-e2e；新增等待提示进入及退场动画结束后检查提示位于按钮上方，人工查看camera-hover-hint.png确认文字完整、没有旧提示重叠。开启与关闭截图显示状态文字独立居中，几何误差小于1px。
- 验证：对照源码审校README、开发规范、工具清单、应用内与仓库教程的演示录屏说明，现有通用入口和操作描述仍准确；工具开发规范补充状态文案、居中及提示互斥要求，Bug台账和回归TX-129同步维护。
- 验证：pnpm preview:sync更新1.3.0程序104项，261个既有配置、资料与插件文件保持一致，收据.artifacts/backups/preview-sync/update-1794123008460/preservation.json；pnpm test:preview:resources通过103个程序文件、346个内置文件与1687个媒体文件。日志.artifacts/presentation-hud-hints-preview-sync.log和presentation-hud-hints-preview-resources.log。
- 验证：预览核验通过后按绝对路径、无链接、无Git跟踪及程序载荷清单回收本轮app、空new-resources和被替代previous-resources共3处5526文件1055186372字节（约1006MiB），清单与结果位于.artifacts/cleanup-2026-11-08-hud-hints/。保留update-1794123008460/previous-resources最近回退和全部收据；未删除资料、插件及独有测试证据。
- 验证：空间复核.artifacts逻辑大小5489674644字节（约5.11GiB），原始测试证据约1.99GiB、既有工具链1.18GiB、最近回退及资料备份1.15GiB、历史下载0.56GiB、上游参考0.18GiB，均按原用途保留；本轮无新增下载和工具链，已消费程序暂存已清理。未重置资料、push、云端构建或Release。
- 验证：空间清理后pnpm test:preview:resources再次通过，日志.artifacts/presentation-hud-hints-preview-resources-after-cleanup.log；最终4个相关源码与测试文件ESLint均无错误无警告，pnpm maintain、pnpm maintain:check、pnpm docs:check及git diff --check通过。

## 2026-11-08 · 整理按键大小、颜色与分组设置，精简箭头并完善全屏播放控制

记录：[presentation-controls-refinement](../../docs/history/entries/2026-11-08-03-presentation-controls-refinement.json)；版本：未发布。

- 移除蓝晶、果冻、珍珠及折纸四款指针及资源，旧项目和偏好中的已移除标识沿读取规范归回标准光标，其他系统及自定义外观保留。
- 箭头重绘为直线、饱满、双向、虚线、弧形及缎带六种卡通外观，统一深色墨线、柔和阴影和可调填充；新箭头默认白色弧形，初始框由30%×20%缩为16%×8%，转换类型时保留原对象中心。旧形状标识映射到最接近的现有外观。
- 按键设置按外观、大小与配色、分组、当前片段内容及动画组织；字号与键帽倍率折算为唯一键帽大小，文字、键帽和框同时缩放并保持组中心，不再展示独立宽高和字号，预览保留移动与旋转，大小统一从侧栏调整。切换预设不改变用户设置的大小。
- 按键文字颜色与底色直接复用注释ColorControl及同一预设色板，提供颜色面板、色相、预设、十六进制输入和清除底色。共用菜单统一侧向展开，避免侧栏底部触发时预设和色值输入被垂直空间挤出。
- 普通注释和按键的缺省动画统一为无；只有进入或退出效果非无时才显示动画时长，保留已有显式动画及隐藏时长值。
- 间隔重命名为变焦衔接最大间隔及按键分组最大间隔，解释变焦片段之间的空白、相邻按键按下时间差，以及小于或等于阈值时的连接或分组行为。进一步发现原变焦渲染未读取该值，修复预览、二维/三维、标准/现代导出和原生逐帧轨迹，统一连接阈值。
- 全屏按钮移到预览音量旁，普通及全屏共用播放、跳转、音量、全屏和时间轴进度控制；拖动进度沿已有时间轴到源素材映射定位并暂停，不重建播放器或产生编辑历史。

- 验证：pnpm typecheck通过。首次完整126文件848项单测通过，归档.artifacts/runs/2026-11-08T06-29-17-394Z-unit；首次侧栏与视觉两个源码专项通过，归档.artifacts/runs/2026-11-08T06-29-33-724Z-e2e。
- 验证：补充变焦阈值时，边界用例首轮导错normalizeZoomCamera导致1项失败，归档.artifacts/runs/2026-11-08T06-35-01-832Z-unit；更正导入后3文件20项通过，归档.artifacts/runs/2026-11-08T06-37-01-115Z-unit。最终完整126文件849项通过，归档.artifacts/runs/2026-11-08T06-38-32-273Z-unit。
- 验证：最终视觉与三维镜头两个源码专项通过，归档.artifacts/runs/2026-11-08T06-39-47-912Z-e2e：六款箭头48组方向导出像素、默认白色16%宽弧形、删除四款指针、统一键帽缩放与一次撤销重做、完整颜色菜单、默认无动画及条件时长、音量旁全屏按钮、正常与原生全屏进度定位、播放器身份和项目重开。标准/现代导出实际像素均验证1599/1600ms连接阈值生效，证据zoom-gap-pixels.json。人工查看直接插件侧栏、全屏、白色卡通箭头与颜色菜单截图。
- 验证：相关模块与测试ESLint错误检查通过；pnpm docs:check通过37文档253本地链接、15章66步，pnpm maintain及pnpm maintain:check通过。
- 验证：pnpm build通过宿主类型检查、设置与工具插件及Electron生产编译，日志.artifacts/presentation-refinement-build.log。最后补充色值实际编辑和清除底色验证时，主进程对话框夹具evaluate发生调试结果promise被回收，归档.artifacts/runs/2026-11-08T06-49-54-211Z-e2e；仅对同一幂等夹具赋值增加限定错误重试，产品代码不吞错。
- 验证：统一侧向颜色菜单后源码视觉专项通过，归档.artifacts/runs/2026-11-08T06-52-33-086Z-e2e；额外核验色值输入完整在视口内、编辑为白色、清除底色及两次独立撤销恢复原值。稳定正文截图keyboard-color-picker.png包含颜色区域、色相、完整16色板和十六进制输入，人工确认未被截断。标准/现代阈值边界各产生50904个显著变化通道值；四套动画导出中段各变化849通道、尾边界残留0。最后颜色菜单相关ESLint通过，pnpm build:tools补编译通过。
- 验证：pnpm test:regressions presentation-visual-effects --list通过。最终pnpm preview:sync同步1.3.0程序104项，241个既有配置、项目、资料及插件文件保持一致；收据.artifacts/backups/preview-sync/update-1794121038453/preservation.json。pnpm test:preview:resources通过103个程序文件、346个内置插件文件与1687个媒体依赖；日志.artifacts/presentation-refinement-preview-sync.log和presentation-refinement-preview-resources.log。
- 验证：空间收尾在预览核验后执行：确认绝对路径、祖先和子项无链接、无Git跟踪且只含程序载荷，回收已消费app/new-resources及被替代回退共3处5526文件1055186181字节（约1006MiB）。只保留update-1794121038453/previous-resources最近程序回退与所有收据，清单和结果位于.artifacts/cleanup-2026-11-08-refinement/，未删除资料、插件或独有测试证据。
- 验证：空间复核.artifacts逻辑大小5488049208字节（约5.11GiB），其中原始测试证据约1.99GiB、既有工具链1.18GiB、最近回退及资料备份1.15GiB、历史下载0.56GiB、上游参考0.18GiB；受保护证据、资料和既有工具链继续保留，本轮无新增下载或工具链，已消费程序暂存已清理。未重置资料、push、云端构建或Release。

## 2026-11-08 · 隔离全屏预览失败，统一录制关闭斜线并增加可换色立体 SVG 外观

记录：[presentation-fullscreen-svg](../../docs/history/entries/2026-11-08-02-presentation-fullscreen-svg.json)；版本：未发布。

- 全屏失败从素材恢复和全局错误链分离，局部提示可关闭且六秒后自动清除；DOM 全屏被拒绝时回退所属宿主原生窗口，Esc、换项目和服务退出恢复本次接管的全屏状态，解除监听并拒绝迟到请求。原生预览覆盖宿主标题栏，不将临时全屏尺寸写回窗口偏好，退出恢复当前标题栏高度。
- 录制按键关闭斜线改为左上至右下，与相邻关闭状态统一。
- 扩大排查修饰键同类故障：单独左右Shift、Ctrl、Alt、Meta即时记录，按键松开分别清理，修饰键长按去重、普通键重复保留，组合键补足首帧状态；小键盘导航补齐图例，连接显示折叠紧邻组合键前缀但保留原始输入事件。
- 五款原箭头改为共用 SVG 材质，新增缎带、晶透、霓虹和叠影；九款均支持主色和线宽，保留渐变、高光及投影，预览、缩略图和导出共用同一 SVG 源。旧项目外观标识、短色值和透明度继续兼容，完整材质统一应用透明度，移除旧生图箭头运行依赖。
- 新增蓝晶、果冻、珍珠和折纸四款 SVG 光标，沿原有图集、预览和导出链使用相同尖端热点；保留原有样式和配置。
- 同步当前模块文档、工具清单、教程及回归 TX-127；本轮生成尝试已按用户后续要求停用，交付程序不使用这些生成图片。

- 验证：pnpm typecheck通过；修改模块ESLint错误检查通过。
- 验证：完整单测首次沙箱运行124文件中120通过、11项失败，原因包括临时目录权限、目录链接和本机端口访问限制，归档.artifacts/runs/2026-11-08T05-14-02-557Z-unit。正常本机隔离重跑124文件833项全部通过，归档.artifacts/runs/2026-11-08T05-16-16-164Z-unit。
- 验证：加入修饰键修复后完整单测125文件844项通过，归档.artifacts/runs/2026-11-08T05-24-58-353Z-unit。
- 验证：真实Windows键盘源码专项通过，归档.artifacts/runs/2026-11-08T05-26-10-395Z-e2e：左右Shift、Ctrl、Alt、Shift+A、Ctrl+Shift+S、Space、Enter、ArrowLeft均核对控制条响应及保存遥测。Meta及更多特殊键由单测验证，未触发真实Windows系统菜单。
- 验证：全屏视觉专项首轮在导入前主进程evaluate出现promise被回收，归档.artifacts/runs/2026-11-08T05-17-48-828Z-e2e；重跑完成全屏回退、双失败隔离、九款箭头换色及72组方向像素、四款光标图集热点和四套导出动画，但末尾项目重开用例仍采用失效的clip选择器，归档.artifacts/runs/2026-11-08T05-24-11-934Z-e2e。更正为正文和媒体就绪特征；检查直接插件截图时进一步修复原生回退中编辑器头部、时间轴跨堆叠上下文覆盖的问题。首次沙箱E2E因本机服务不可连接而中止，保留.artifacts/presentation-svg-e2e.log。
- 验证：最终源码全屏/视觉专项通过，归档.artifacts/runs/2026-11-08T05-28-51-945Z-e2e：浏览器及原生全屏进出、双路径失败局部提示、九款SVG换色、72组八方向实际导出像素及边缘留白、四款光标9种状态图集与精确热点、标准/现代WebGL/WebGPU动画、手绘单步撤销重做及项目重开与真实媒体就绪。人工查看直接插件全屏截图与独立矢量材质图；头部及时间轴不再覆盖原生全屏。
- 验证：pnpm docs:check通过37文档253本地链接及15章66步；presentation-visual-effects回归分组--list通过；修改模块与测试ESLint错误检查通过。
- 验证：补充宿主全屏尺寸隔离后，最终125文件844项单测通过，归档.artifacts/runs/2026-11-08T05-34-16-327Z-unit；源码视觉专项再次通过，归档.artifacts/runs/2026-11-08T05-34-01-559Z-e2e，额外核对真实插件视图y=0且高度等于窗口正文，不露出宿主标题栏。
- 验证：pnpm build通过设置、工具插件、宿主及渲染器生产编译；最终宿主修改后再次通过pnpm typecheck及pnpm exec electron-vite build，日志.artifacts/presentation-svg-build.log、presentation-svg-typecheck-final.log和presentation-svg-host-build-final.log。最终相关模块ESLint与pnpm maintain、pnpm maintain:check均通过。
- 验证：首次同步检测免安装预览仍运行，脚本在修改前拒绝替换；用户保存并完全退出后同步成功，233个既有资料与插件文件逐文件保留，核验104项程序资源，收据.artifacts/backups/preview-sync/update-1794116296919/preservation.json；资源专项通过。末次兼容审校补充3/4/6/8位十六进制颜色及整材质透明度，2文件17项专项单测通过，归档.artifacts/runs/2026-11-08T05-40-16-194Z-unit；补齐既有测试辅助函数返回类型后ESLint通过，pnpm build:tools补编译通过。
- 验证：最终pnpm preview:sync同步1.3.0程序资源104项，233个既有配置、项目、资料及插件文件保持一致，收据.artifacts/backups/preview-sync/update-1794116526987/preservation.json。pnpm test:preview:resources通过103个程序文件、346个内置插件文件和1687个媒体依赖；日志.artifacts/presentation-svg-preview-sync-delivery.log与presentation-svg-preview-resources-final.log。
- 验证：完成空间收尾：验证最终绝对路径、祖先与子项无链接、目标无Git跟踪且属于纯程序暂存后，清理两轮已消费app/new-resources及被替代回退共6处11054文件2112043216字节（约2014MiB）。只保留update-1794116526987/previous-resources最近程序回退和所有preservation.json，资料、插件、独有证据及其他活跃任务保留；清单与收据位于.artifacts/cleanup-2026-11-08-svg/。
- 验证：收尾空间复核.artifacts逻辑大小5450903236字节（约5.08GiB）：主要为1.95GiB测试原始证据、1.18GiB既有工具链、1.15GiB最近回退及资料备份、0.56GiB历史下载和0.18GiB上游参考。独有证据、资料备份和仍保留的既有工具链不属于本轮消费材料；本轮没有新增下载或工具链，程序暂存已回收。未重置资料、push、云端构建或Release。

## 2026-11-08 · 完善演示全屏预览、实体键帽、手绘遮罩及注释动画

记录：[presentation-preview-keycaps-annotations](../../docs/history/entries/2026-11-08-01-presentation-preview-keycaps-annotations.json)；版本：未发布。

- 增加复用当前播放器的全屏预览和退出、播放控制，恢复预览全区域系统鼠标。
- 关闭按键录制时显示斜线；空格记录为显式键名，旧空格同样显示空格键符号。
- 实体键帽共用预览和导出绘制器，提供尺寸、显示框、连接开关及连接阈值，按轨选择最新输入而非重叠覆盖。
- 矩形、圆形与手绘笔画遮罩覆盖模糊、马赛克和聚焦，笔画沿项目历史保存。
- 使用内置 imagegen 生成透明卡通箭头，并接入缩略图选择、八向预览和导出。
- 所有注释增加淡入淡出、弹性缩放、浮入浮出和擦除，使用媒体时间统一计算。变焦通用设置开放连接间隔。

- 验证：阅读维护流程、改动索引、Bug 台账、侧栏/镜头/默认值/空间规范及工具和设置开发要求；保留大量既有未提交改动。
- 验证：24项初始相关单测通过，归档.artifacts/runs/2026-11-08T04-06-08-166Z-unit；首轮完整831项通过，归档.artifacts/runs/2026-11-08T04-15-09-200Z-unit。补充旧累积文本与事件版本恢复后，最终124文件832项全部通过，归档.artifacts/runs/2026-11-08T04-35-12-936Z-unit。
- 验证：源码首轮HUD正文等待不足，随后两轮对尚未落盘模型直接取属性导致测试失败；分别保留04-08-24-694Z、04-09-39-236Z、04-11-06-985Z的e2e归档。修正稳定正文等待与自动保存轮询后，录制控制及视觉专项联合通过，归档.artifacts/runs/2026-11-08T04-12-52-542Z-e2e。
- 验证：扩展真实导出验证时，测试使用不存在的变焦工具按钮，改为实际变焦空轨入口；失败归档.artifacts/runs/2026-11-08T04-21-00-318Z-e2e。侧栏和视觉专项通过，旧轨道测试仍依赖选择前游标及旧累积文本；分别保留04-23-12-961Z、04-26-27-138Z、04-28-34-006Z的e2e归档。按当前选中回起点规则明确定位切点及显示区间，并更新独立事件内容断言。
- 验证：最终轨道及视觉源码专项全部通过，归档.artifacts/runs/2026-11-08T04-32-19-517Z-e2e。真实宿主覆盖全屏进出、鼠标、连接开关与阈值、键帽尺寸撤销重做、手绘一笔撤销重做、卡通箭头及保存重开；像素检查覆盖圆形/手绘聚焦、键帽、贴纸及动画。标准和现代导出分别在WebGL/WebGPU实际渲染，四组中段均产生947个显著变化通道值，尾边界残留均为0；结果见该归档export-pipelines.json。
- 验证：原生Space采集、控制条斜线及相邻录制流程通过，归档.artifacts/runs/2026-11-08T04-28-34-006Z-e2e；侧栏规范专项通过，归档.artifacts/runs/2026-11-08T04-23-12-961Z-e2e。四项相关源码专项已分批通过。人工查看直接插件截图，包括全屏、键帽侧栏与明暗注释，未拼接宿主截图。
- 验证：修改模块ESLint错误检查通过；新增文件按仓库Prettier格式整理。pnpm docs:check通过37文档252本地链接及15章66步，presentation-visual-effects回归分组--list通过。
- 验证：pnpm maintain与pnpm maintain:check通过；pnpm build通过宿主类型检查、设置/工具插件和Electron生产编译，日志.artifacts/presentation-visual-effects-build.log。首次预览同步保留221个资料文件，程序和内置插件资源验证通过。
- 验证：最后细化键帽阴影按实际字高缩放及安全留白；五种不透明键帽在80×28小区域的四周alpha均为0，确认未裁切键壁或RGB光晕。源码专项及标准/现代WebGL/WebGPU动画再次通过，归档.artifacts/runs/2026-11-08T04-44-50-949Z-e2e；pnpm build:tools补编译通过，日志.artifacts/presentation-visual-effects-build-tools-final.log。
- 验证：最终源码再次通过完整124文件832项单测，归档.artifacts/runs/2026-11-08T04-47-16-258Z-unit；日志.artifacts/presentation-visual-effects-unit-final.log。
- 验证：最终pnpm preview:sync更新104项程序资源，221个既有配置、项目及插件文件逐文件保持一致；保留收据.artifacts/backups/preview-sync/update-1794113309915/preservation.json。pnpm test:preview:resources及清理后复核均通过103个程序文件、347个内置插件文件及1687个媒体依赖，日志.artifacts/presentation-visual-effects-preview-sync-final.log、presentation-visual-effects-preview-resources-final.log和presentation-visual-effects-preview-after-cleanup.log。
- 验证：完成两轮同步的空间收尾：验证最终绝对路径、祖先和子项无链接、目标无Git跟踪及纯程序边界后，清理6处已消费暂存和被替代程序回退，共11052文件2110304917字节（约2013MiB）。只保留update-1794113309915/previous-resources最近回退和所有preservation.json；配置、插件、资料备份及独有证据保留。清单、结果和占用摘要位于.artifacts/cleanup-2026-11-08/，一次性清理脚本已移除。
- 验证：空间复核：.artifacts目录逻辑大小约5.07GiB，主要为1.95GiB原始测试证据、1.18GiB既有工具链、1.15GiB回退与资料备份、0.56GiB历史下载及0.18GiB上游材料。资料和独有证据受保护，历史材料并非本轮消费范围，继续保留；本轮无新增下载或工具链。未进行资料重置、push、云端构建或Release。

## 2026-11-07 · 精简演示片段文案，统一选中定位并修复重排变焦和连续注释

记录：[presentation-timeline-effects](../../docs/history/entries/2026-11-07-03-presentation-timeline-effects.json)；版本：未发布。

- 变焦片段精简为2D/3D、倍率及自动/手动，悬停保留完整参数。
- 所有类型片段选中后暂停定位到起点，重复选择同样生效。
- 重排时按实际保留画面映射效果，分离区间拆成独立片段，不再跨越无关画面。
- 连续添加注释共用粘贴的空闲导轨分配，片段图标按文字、图片、箭头、模糊、马赛克、聚焦及按键类型变化。
- 审查移动、裁剪、变速、删除、插入、复制粘贴、字幕源投影、独立声音与摄像头，新增时间轴关联规则文档，移除独立音频锚点平移及渲染自动改写。
- 移动保持原时长，短变焦不按手动最小时长拉长；注释同轨遵循避让/重排，跨轨可叠加。左键重复选择回起点，已选片段的右键保留分割/粘贴游标。
- 录屏派生裁剪镜像从历史比较中排除，避免同一删除/变速占用额外撤销步骤。
- context-mode 2.1.5补齐--agent codex，执行原生setup修复配置与hooks，更新旧工具名；为MCP单独提供大写PATH修复Windows Git Bash识别，不迁移或删除旧知识库。

- 验证：context-mode执行和自检均返回Project source --agent is missing；回退有界本地命令，依次阅读维护、改动/Bug索引及相关模块规范，保留既有未提交内容。
- 验证：18项初始相关单测通过，归档.artifacts/runs/2026-11-07T12-31-10-078Z-unit；扩展边界后22项通过，归档.artifacts/runs/2026-11-07T12-47-40-401Z-unit。
- 验证：完整pnpm test在沙箱中11项临时权限、路径或回环网络失败，归档.artifacts/runs/2026-11-07T12-40-40-250Z-unit；正常本机环境同入口复跑123文件825项通过，归档.artifacts/runs/2026-11-07T12-42-01-359Z-unit。补充历史修复后的完整测试另行记录。
- 验证：源码专项沙箱服务器未能就绪后取消，保留.artifacts/runs/2026-11-07T12-39-03-360Z-e2e日志；正常环境首轮定位到HeroUI内层gridcell被行拦截，改为可交互row，失败归档.artifacts/runs/2026-11-07T12-42-24-825Z-e2e。
- 验证：第二轮并行生产编译与源码加载期间正文等待不足，失败归档.artifacts/runs/2026-11-07T12-44-57-950Z-e2e；改为独立运行并等待片段正文稳定。第三轮已通过连续注释、类型切换、真实分割重排、全类型选择及独立媒体检查，发现删除需额外撤销，归档.artifacts/runs/2026-11-07T12-47-47-665Z-e2e；补齐派生裁剪历史比较后联合回归。
- 验证：已审校README、组件说明、仓库与应用内教程、镜头规范、更新说明及新时间轴规则，pnpm docs:check通过36文档243链接、15章65步；presentation-timeline-effects分组--list通过。
- 验证：context-mode修正后新MCP连接的D1/2/3/5/5b/6/7/8/9/10/11均通过，Git Bash、PowerShell执行和文档索引搜索实际可用；D4只报告保留的旧数据。当前聊天旧连接仍需Codex重新加载后才采用新启动参数。
- 验证：最终完整pnpm test通过123文件827项，包含移动短变焦/超长声音不改时长及派生裁剪镜像单步撤销，归档.artifacts/runs/2026-11-07T12-51-03-713Z-unit。
- 验证：四项联合源码回归中教程与片段专项通过；摄像头专项在HUD正文未就绪时被关闭，关联轨道最终断言只因重开补齐rotation/blurIntensity默认字段失败，已有参数未丢失。保留归档.artifacts/runs/2026-11-07T12-50-41-099Z-e2e，重开断言改为全部已有值须匹配、允许新增缺省字段。
- 验证：最终摄像头补充与关联轨道两项源码专项通过，归档.artifacts/runs/2026-11-07T12-55-14-905Z-e2e；六次连续新增注释均滚入视口且各占空闲轨道，五种类型切换及图标、真实四段分割与拖动、变焦精确拆段/10ms短段、独立声音和摄像头原样保留、字幕三段源投影、六类重复选择起点、重排/删除一次撤销重做及项目重开通过。四项相关源码专项分批全部通过。
- 验证：人工查看直接插件WebContentsView的明暗时间轴截图，确认精简变焦标签、分离区间和文字/图片/箭头/模糊/马赛克/聚焦图标；没有拼接宿主截图。
- 验证：修改模块ESLint错误检查通过，保留移植目录原有格式与未使用参数警告；日志.artifacts/presentation-timeline-effects-lint.log及presentation-timeline-effects-lint-final.log。pnpm docs:check通过36文档246链接，pnpm maintain、pnpm maintain:check及git diff --check通过。
- 验证：context-mode最终新连接自检所有功能项通过，D4仅提示保留旧资料；证据.artifacts/context-mode-v2-final-verification.json与context-mode-v2-final.log。
- 验证：最终pnpm build通过宿主类型检查、设置/工具插件和Electron生产编译，日志.artifacts/presentation-timeline-effects-build-final.log。预览同步前pnpm maintain与pnpm maintain:check通过。
- 验证：pnpm preview:sync通过：更新104项程序资源，564个原配置/项目/插件文件逐文件保持一致；pnpm test:preview:resources通过103个归档程序文件、346个内置插件文件及1687个媒体依赖。日志.artifacts/presentation-timeline-effects-preview-sync.log与presentation-timeline-effects-preview-resources.log。
- 验证：按本轮用户明确授权执行pnpm preview:reset --confirm-reset：预览已退出，完整备份并逐文件验证564个资料文件，再建立空data和legacy；程序资源不变。备份.artifacts/backups/portable-profile/2026-11-07T13-01-10-767Z-e48393c8，日志.artifacts/presentation-timeline-effects-preview-reset.log。已确认两个新目录均为空，下次从固定启动器运行时初始化首次安装默认值。
- 验证：空间复核通过：原程序回退及暂存约1.50GiB、独有自动归档证据约1.92GiB、工具链约1.18GiB、历史下载约570MiB，其余资料与其他任务材料保留。本轮无新增下载。
- 验证：核验范围、祖先/子项链接及Git跟踪边界后，清理6处已消费程序目录，共2110300719字节（约2013MiB），包括前轮曾被策略拦截的纯程序载荷；保留本次update-1794056358255/previous-resources、全部preservation.json、完整资料备份与原始证据。清单和结果.artifacts/cleanup-2026-11-07/timeline-effects-program-payloads.json、timeline-effects-program-results.json。
- 验证：空间清理后pnpm test:preview:resources再次通过103个程序文件、346个内置插件文件与1687个媒体依赖；日志.artifacts/presentation-timeline-effects-preview-after-cleanup.log。已移除本轮context-mode临时MCP验证桥和一次性清理脚本，保留完整诊断与清理收据。

## 2026-11-07 · 统一变焦文案和镜头片段信息，修复摄像头删除、重置及时间尺检查器联动

记录：[presentation-editor-followup](../../docs/history/entries/2026-11-07-02-presentation-editor-followup.json)；版本：未发布。

- 变焦相关按钮、提示、快捷键与教程统一名称，片段显示2D/3D镜头和倍率，悬停补齐取景方式、有效光学参数、起止时间及持续时间。
- 光圈随景深开关挂载，关闭后保留数值；注释和变焦选中及边界变动时定位有效时间，手动时间尺浏览保留当前选区和检查器。
- 删除最后一段摄像头时解除当前项目来源引用并撤下空轨，侧栏只保留导入入口，禁用空素材重置；磁盘素材保留，撤销恢复完整项目模型。显式片段优先于旧可见范围，删空后粘贴旧摄像头片段也能恢复编辑。
- 当前分类重置标记状态已经完成迁移，规范化时修复已独立编辑来源的旧虚拟音频可见状态，并移除历史音频独立编辑按钮。

- 验证：通过context-mode检查维护流程、当前变更/Bug索引及模块规范，保留368项既有未提交内容。
- 验证：23项相关单测通过，归档.artifacts/runs/2026-11-07T04-08-08-123Z-unit；完整pnpm test通过122文件820项，归档.artifacts/runs/2026-11-07T04-16-06-449Z-unit。
- 验证：新增源码Electron专项通过，归档.artifacts/runs/2026-11-07T04-14-22-900Z-e2e：伴随系统音频/麦克风及摄像头真实导入，变焦2D/3D片段名称和悬停、游标定位、时间尺保留侧栏、景深光圈显隐与保留、撤销重做；摄像头重置完整音频/录屏模型不变，删除独立音频不补回。
- 验证：源码专项还验证摄像头分割后逐段删除、删空撤轨及文件/外观控件、空状态重置禁用、磁盘原件保留、撤销恢复和重做删除、项目完整重载不补轨及重新导入。人工查看直接插件WebContentsView空状态和重新导入明暗截图，摄像头预览实际可见。
- 验证：开发期首轮项目列表就绪的默认5秒等待不足；改为30秒后通过该阶段。第二轮在自动保存防抖完成前读取尚未出现的camera字段报错，改为可选字段轮询并等待关闭状态落盘后通过。保留失败归档.artifacts/runs/2026-11-07T04-09-58-207Z-e2e与.artifacts/runs/2026-11-07T04-12-36-530Z-e2e。
- 验证：修改模块ESLint错误检查通过，保留原移植文件的格式及原有未使用参数警告，不做无关重排；日志.artifacts/presentation-editor-followup-lint.log。pnpm docs:check通过35文档238链接、15章65步，新增回归分组--list确认3个单测及1个E2E文件。
- 验证：相邻源码5项首轮3通过（教程、逐栏默认值、变焦与导出像素），导入和轨道两项旧断言仍要求空摄像头显示外观控件、时间尺清空选区；按本轮明确行为更新，并同步检查器同类断言。归档.artifacts/runs/2026-11-07T04-17-02-383Z-e2e保留。
- 验证：审查补齐摄像头显式片段优先于旧空可见范围的统一判断，新增删空后粘贴边界单测及源码回归；pnpm test通过122文件821项，归档.artifacts/runs/2026-11-07T04-22-22-711Z-unit。
- 验证：更新后的导入、检查器和轨道3项源码回归通过，归档.artifacts/runs/2026-11-07T04-23-39-525Z-e2e；该轮补充用例发现复制的摄像头在删空后因旧来源一致性检查无法粘贴，保留失败证据。随后补齐剪贴板来源/时长/偏移/显示快照，仅允许当前项目空来源恢复，不覆盖不同的现有来源；粘贴不生成无来源默认片段。
- 验证：最终完整pnpm test再次通过122文件821项，归档.artifacts/runs/2026-11-07T04-28-03-816Z-unit；最终补充源码专项通过，归档.artifacts/runs/2026-11-07T04-28-40-814Z-e2e，包含删空后粘贴摄像头恢复编辑再删除，其他删除/重置/历史/重开和文案检查保持通过。
- 验证：最终变更模块ESLint错误检查通过，日志.artifacts/presentation-editor-followup-lint-final.log。全部7个相关源码专项（教程、默认值、变焦及导出像素、导入、检查器、轨道及补充专项）分批通过；实际执行分布见上述归档。
- 验证：pnpm build通过宿主类型检查、设置与工具插件及Electron生产编译，日志.artifacts/presentation-editor-followup-build.log。交付前pnpm maintain、pnpm maintain:check、pnpm docs:check和git diff --check通过。固定预览仍运行，等待用户退出后同步，未强制结束进程。
- 验证：用户明确回复已退出并继续同步后，pnpm preview:sync通过：更新104项程序资源，543个现有资料与插件文件逐文件保持一致。pnpm test:preview:resources通过103个归档程序文件、346个内置插件文件及1687个媒体依赖文件。日志.artifacts/presentation-editor-followup-preview-sync.log和.artifacts/presentation-editor-followup-preview-resources.log。
- 验证：空间收尾已审查工作区范围、链接及Git跟踪边界，形成纯程序暂存/旧回退清单。带路径保护的PowerShell清理和随后明确绝对路径的清理均在创建进程前被自动审批检查拒绝，仅返回blocked by policy，未执行删除。1055149319字节（约1006MiB）已消费载荷暂时保留；4779个受保护文件的路径、大小、修改时间及Git状态保持一致。清单和结果.artifacts/cleanup-2026-11-07/editor-followup-program-payloads.json、editor-followup-program-results.json。
- 验证：剩余空间分类：程序回退及待清理载荷约1.50GiB，自动归档证据2061064521字节（约1.92GiB）、工具链约1.18GiB、历史下载约570MiB；证据、工具链及其他任务材料保留。本轮没有新增下载或一次性脚本，当前构建产物保留一套可用版本。

## 2026-11-07 · 修复演示3D变焦提前裁切局部画面导致额外露底

记录：[presentation-camera-framing](../../docs/history/entries/2026-11-07-01-presentation-camera-framing.json)；版本：未发布。

- 预览和两套导出器共用的镜头滤镜按逆投影保留需要的真实画外内容，正确换算采样原点和二维取景位移、倍率。
- 运动模糊等子滤镜临时使用相同采样区域，退出3D或销毁时恢复原裁切策略和最新布局区域；采样限制在原场景与输出视口并集内。
- 新增TX-123与presentation-camera-framing回归，更新README、镜头文档、组件说明、工具清单、仓库与应用内教程和更新说明。

- 验证：按顺序通过context-mode阅读维护、改动索引、Bug台账及模块规范，保留现有未提交修改。
- 验证：pnpm test tests/main/presentationZoomCamera.test.ts通过8项；归档.artifacts/runs/2026-11-07T03-30-59-615Z-unit。
- 验证：pnpm test完整通过122文件817项；归档.artifacts/runs/2026-11-07T03-39-32-349Z-unit。
- 验证：最终源码Electron变焦镜头与local-tutorial两项通过，归档.artifacts/runs/2026-11-07T03-37-40-007Z-e2e。真实宿主5倍放大3D运镜无额外背景；原有角度手势撤销重做、项目重开、模式及光学参数回归通过。
- 验证：标准和现代导出器分别在WebGL/WebGPU执行居中放大、偏心加裁剪、左右边缘共16组像素检查；每组独立验证3405–3600个射线落点，误差超限0个。内部放大背景0像素；真实边缘自然露出背景；每组175–772个落点来自原视口外，运动模糊输入和退出3D裁切策略恢复通过。
- 验证：首轮沙箱源码服务器未就绪后取消，日志保留.artifacts/runs/2026-11-07T03-32-26-328Z-e2e；改在沙箱外运行。首轮完整专项的新增预览断言从非preserveDrawingBuffer的GPU画布异步读到清空缓冲而失败，16组导出检查已通过；改用实际合成截图取样后通过。失败归档.artifacts/runs/2026-11-07T03-35-23-398Z-e2e。
- 验证：人工查看实际插件1.41倍及5倍取景截图与导出证据，深度放大保持全幅录屏；没有拼接宿主截图。
- 验证：镜头实现、新增几何模块和两份测试的ESLint检查通过；pnpm docs:check通过35文档238链接、15章65步，pnpm test:regressions presentation-camera-framing --list确认1个单测文件和1个E2E文件。
- 验证：构建前空间分类：已有程序回退553677642字节；自动测试归档约1.82GiB、工具链约1.18GiB、历史下载约570MiB，独有证据、工具链及其他任务材料保留。
- 验证：pnpm build通过，包含宿主类型检查、设置与工具插件、Electron生产编译；日志.artifacts/presentation-camera-framing-build.log。
- 验证：交付前pnpm maintain、pnpm maintain:check、pnpm docs:check和git diff --check通过。检测固定预览仍运行后等待用户退出，收到本轮明确继续同步指示后执行既有同步脚本。
- 验证：pnpm preview:sync通过，更新104项程序资源，543个现有资料与插件文件逐文件保持一致；pnpm test:preview:resources通过，核对103个归档程序文件、346个内置插件文件和1687个媒体依赖文件。日志.artifacts/presentation-camera-framing-preview-sync.log和.artifacts/presentation-camera-framing-preview-resources.log。
- 验证：核验后清理本次app、空new-resources及已替代的上次previous-resources，回收1055135479字节（约1006MiB）逻辑程序载荷；保留本次previous-resources和全部preservation.json。清单与收据.artifacts/cleanup-2026-11-07/camera-framing-program-payloads.json、camera-framing-program-results.json；4779个受保护文件的路径、大小、修改时间及Git状态保持一致，未新增下载或一次性脚本。
- 验证：清理后再次通过pnpm test:preview:resources、pnpm maintain、pnpm maintain:check、pnpm docs:check及git diff --check；资源复核日志.artifacts/presentation-camera-framing-preview-resources-final.log。

## 2026-11-06 · 建立项目空间管理规范，将产物保留及清理纳入每轮开发和预览交付收尾

记录：[workspace-storage-policy-2026-11-06](../../docs/history/entries/2026-11-06-02-workspace-storage-policy.json)；版本：未发布。

- 响应用户要求新增docs/workspace-storage.md，规范目录分类、每轮责任、预览回退保留、下载及工具链缓存、测试证据、保护边界、安全删除和验收。
- 将每轮已消费暂存回收、预览成功核验后保留最近一次程序回退及全部审计收据写入AGENTS、维护流程、Agent指南、开发指南和脚本说明，并在文档目录增加入口。
- 设置单轮可重建材料净增长500MiB与.artifacts总量5GiB的人工复核阈值；阈值不授权删除资料、独有证据或其他活跃任务。纯文档任务不为交付而重建或同步预览。
- 明确当前maintain仅整理及更新索引，preview:sync与资源核验也不会自动淘汰历史副本；要求执行者同轮完成空间收尾，不将规范描述为已实现的自动清理功能。

- 验证：通过context-mode审阅当前维护流程、Agent/开发指南、文档目录、脚本实现及文档校验范围，保留用户已有改动，仅增补空间管理相关条款。
- 验证：规范复用本轮已实际验证的清理边界：不触及当前预览及持久资料，不自动删除原始测试证据，按清单校验路径和链接，常规清理不重复哈希整个资料树。
- 验证：pnpm docs:check通过：34份文档、232项本地链接、15章65步教程，无链接或内容一致性错误；人工审阅规范与当前脚本职责，未将人工收尾写成已有自动清理能力。
- 验证：pnpm maintain与pnpm maintain:check通过，仅更新生成改动索引；git diff --check通过。仅修改仓库规范，不运行单测/E2E，不构建或同步预览。

## 2026-11-06 · 安全清理开发积累的程序暂存、旧回退载荷及下载缓存，保留当前资料和测试原始证据

记录：[safe-workspace-cleanup-2026-11-06](../../docs/history/entries/2026-11-06-01-safe-workspace-cleanup.json)；版本：未发布。

- 按当前用户要求盘点并清理本地项目开发产物；保留全部既有源码及未提交改动，不调整业务实现、不修改Git历史、不执行远端操作。
- 仅按明确清单清理预览同步的程序暂存和过期回退载荷、旧发行程序副本、旧版本下载及可重建开发缓存；保留最近一次预览回退资源和全部preservation.json。
- 历史记录中已清理的程序备份路径只代表当时事实，不再作为现存恢复点；本轮保留update-1793892596347/previous-resources共553678061字节及对应保留收据。
- 保留.local下当前免安装程序、配置、数据库、浏览器资料、剪贴板、收藏、插件和源码预览资料；保留原始测试归档、核验日志、当前1.3.0发行下载、开发依赖、已安装原生工具链、来源与许可。
- 删除前逐项验证工作区绝对路径边界、祖先及子项目录链接和Git跟踪状态；记录受保护文件路径、大小、修改时间，避免重复进行全目录哈希校验。

- 验证：按要求使用context-mode盘点分析，依次审阅维护流程、改动索引、Bug台账、Agent指南和开发文档；工作区已有大量未提交改动，全部保留。
- 验证：完整扫描333953个实际文件，逻辑大小47910496893字节（47.91GB、44.62GiB），跳过依赖目录链接，未出现扫描错误；其中.artifacts/backups为38615985874字节。
- 验证：清理前pnpm test:preview:resources通过：103项程序资源、346项内置插件文件和1687项媒体依赖。未启动、重置或同步预览，避免为清理重新产生程序副本。
- 验证：原生PowerShell按131个明确目标完成删除，共207592个文件、39669559558字节（39.67GB、36.95GiB逻辑大小）；相当于初始逻辑大小的82.8%，不等同于实测磁盘可用空间增量。计划、逐项目标日志和结果位于.artifacts/cleanup-2026-11-06/plan.json、deletions.json和verification.json。
- 验证：分类逻辑大小：预览暂存及旧回退37612058491字节、旧发行程序副本961200663字节、旧版本下载610799967字节、已安装工具链下载缓存479380683字节、可重建开发缓存6119754字节。未清理用途不明确的工作副本、历史源码、资料目录或原始验证证据。
- 验证：删除后15865个受保护文件的路径、大小和修改时间全部一致，131个目标全部不存在；原始测试归档772次运行、9209个文件以及.local下2725个实际文件继续保留。后续仅更新本轮维护记录与生成改动索引，不进行整树哈希或完整资料备份。
- 验证：清理后pnpm test:preview:resources再次通过，仍为103项程序资源、346项内置插件文件、1687项媒体依赖；当前预览和媒体运行依赖可继续使用。
- 验证：pnpm docs:check通过（33份文档、222项本地链接、15章65步教程），pnpm maintain及pnpm maintain:check通过，git diff --check通过；仅刷新1份生成索引。未修改业务代码，本轮未运行单测/E2E或启动手动预览。

## 2026-11-06 · 将演示缩放升级为连续倍率与2D/3D变焦镜头

记录：[presentation-zoom-camera](../../docs/history/entries/2026-11-06-01-presentation-zoom-camera.json)；版本：未发布。

- 缩放侧栏升级为变焦，倍率改为1–5×、步进0.01的连续滑条；轨道同步显示真实倍率，旧六档项目保持原映射。
- 新增2D/3D镜头切换、可拖动角度板与六种预设、水平与俯仰角度、18–200mm焦距、f/1.4–f/22光圈、景深、独立对焦点和屏幕反光；切回2D保留3D参数。
- 预览及两套导出器共用WebGL/WebGPU透视和光学滤镜，随原变焦进出场及连接窗口混合；结束效果及实例销毁立即释放滤镜。
- 参数沿现有项目、复制分割及完整历史链保存；重置恢复2D和1.5×，保留区间、取景焦点及其他片段。手动取景框改为按连续倍率钳制。
- 同步README、演示组件说明、设置/UI/默认值规范、工具清单、仓库与应用内教程及更新说明；新增变焦模块文档和TX-122回归。

- 验证：通过context-mode盘点维护流程、改动和Bug台账、模块规范；保留355项既有工作区改动。
- 验证：新增5项镜头单测通过，覆盖旧六档、连续倍率与JSON保存、非法输入、时间过渡及重置；首次测试误以为原变焦在0ms尚无进场权重，改为真实进场前时刻。失败归档 .artifacts/runs/2026-11-06T08-45-11-778Z-unit。
- 验证：pnpm test完整通过：122文件814项，归档 .artifacts/runs/2026-11-06T09-23-27-543Z-unit。沙箱内首轮有临时目录EPERM及库路径隔离失败，改在沙箱外完整复跑；保留失败归档 .artifacts/runs/2026-11-06T09-17-59-619Z-unit。
- 验证：变焦源码专项通过，归档 .artifacts/runs/2026-11-06T09-35-56-136Z-e2e：真实宿主导入、1.41倍滑条与轨道标签、角度拖动单步撤销重做、光学开关、2D/3D切换保留参数、完整卸载后项目重开及重置历史。两套导出器分别在WebGL/WebGPU上核对透视、景深及焦距的真实像素变化。
- 验证：开发期源码专项分别发现保存防抖等待不足、WebGPU资源命名与顶点布局、WebGL跨阶段精度不一致，均修正后复跑；失败证据保留在当日自动归档。一次沙箱源码服务器启动未完成即取消；独立GPU诊断测试已消费并移除，证据仍保留。
- 验证：人工查看实际插件可见区域明暗截图，确认透视画面、角度板、统一侧栏层级和主题表面；没有拼接宿主截图。
- 验证：对本轮新模块及主要修改模块强制取消移植目录忽略后运行ESLint错误检查，通过；保留原有推断返回值风格，专项关闭explicit-function-return-type。修正测试finally抛错写法；日志 .artifacts/zoom-camera-lint.log。
- 验证：pnpm docs:check通过：35份文档238个本地链接、15章65步；pnpm test:regressions presentation-editing --list通过，14个单测文件、12个E2E文件。
- 验证：最终相邻6项源码回归通过：local-tutorial、presentation-defaults/fragments/import/inspector/review，归档 .artifacts/runs/2026-11-06T11-16-40-300Z-e2e。该批变焦专项新增资源断言误读不存在的destroyed字段而失败；按已安装Pixi的resources/groups销毁状态修正断言后，最终变焦专项独立通过，归档 .artifacts/runs/2026-11-06T11-26-19-578Z-e2e。
- 验证：最终变焦专项对两套导出器分别在WebGL/WebGPU验证角度、景深、焦距、光圈、对焦点及反光逐项改变实际像素，并核对导出实例销毁后镜头资源解绑；人工查看倍率/模式及明暗角度截图。重试期间一次测试进程原生退出、一次复用服务提前消失导致HUD入口未出现，均保留失败归档，重新启动独立源码服务后通过。
- 验证：pnpm build通过，包含宿主类型检查、设置与工具插件、Electron生产编译；日志 .artifacts/zoom-camera-build.log。交付前pnpm maintain、pnpm maintain:check和git diff --check通过。
- 验证：空间分类盘点：原有程序回退约528MiB，测试归档约1.82GiB、工具链约1.18GiB、历史下载约570MiB；独有证据、工具链和来源不明的其他任务材料保留。
- 验证：pnpm preview:sync通过：1.3.0预览更新104项程序资源，530个现有配置、项目及插件文件逐文件保持一致；pnpm test:preview:resources通过，核验103个归档程序文件、346个内置插件文件及1687个媒体依赖文件。日志 .artifacts/zoom-camera-preview-sync.log 与 .artifacts/zoom-camera-preview-resources.log。
- 验证：预览核验后清理本次app暂存、空new-resources及旧纯程序回退，共1055135898字节（约1006MiB），逐项验证范围、链接与Git跟踪边界；保留本次 previous-resources 和全部 preservation.json。清单和结果 .artifacts/cleanup-2026-11-06/zoom-camera-program-payloads.json、zoom-camera-program-results.json。

## 2026-11-05 · 修复演示新项目外观串用、分类重置及重开整轨拖动

记录：[presentation-project-defaults](../../docs/history/entries/2026-11-05-11-presentation-project-defaults.json)；版本：未发布。

- 新素材与新录制建立完整出厂编辑模型，应用级偏好与项目外观分开；旧项目参数继续恢复。
- 分类重置共用出厂默认值，补齐缩放通用参数；摄像头保留源时长与剪辑并恢复显示，按键完整恢复简约外观；独立音频补充重置，裁剪重置退出框选。
- 轨道名称改用指针捕获并在完成、取消、失焦和卸载时清理，键盘上下移动继续保留。
- 新增默认值与重置范围清单及源码回归，同步现行教程和设置规范。

- 验证：通过context-mode阅读维护流程、改动索引、Bug台账、工具/设置及演示侧栏规范，保留工作区既有未提交内容。
- 验证：pnpm test：121个文件809项通过；证据 .artifacts/runs/2026-11-05T15-23-34-916Z-unit。新增6项默认模型隔离、分类边界、素材同步保留及按键默认外观回归。
- 验证：presentation-defaults源码专项通过：真实鼠标首次拖轨、完整页面重载、项目重开、Esc取消、保存与撤销重做；场景/光标/摄像头/字幕/缩放逐栏重置核对实际项目文件，裁剪取消/完成/一次撤销重做，以及旧偏好写入后新录制不继承。证据 .artifacts/runs/2026-11-05T15-27-04-445Z-e2e。
- 验证：presentation-tracks、presentation-import、local-tutorial同批通过，覆盖独立声音重置、摄像头与录屏排序、导出及教程升级后资料保留；该批4项全部通过。
- 验证：presentation-inspector、presentation-review源码专项通过，验证明暗侧栏、连续历史和相邻编辑；证据 .artifacts/runs/2026-11-05T15-21-59-574Z-e2e。该批另3项失败，修正测试/独立复跑情况见下条，不以整批通过记录。
- 验证：初轮单测把留白误设为50，按源码默认20修正；初轮拖轨断言误用row-keystroke而真实ID为row-annotation-0，已修正。完整重载最初等待所有load资源超时，改为DOMContentLoaded后等待正文稳定。批量验证中default受并行构建/格式化触发的页面重载干扰，import一次丢失摄像头预览；未改产品源码的独立批复跑通过。tracks新增断言误读aria-valuenow，原生range使用value，修正后通过。保留失败证据 .artifacts/runs/2026-11-05T15-15-22-175Z-unit、2026-11-05T15-10-14-489Z-e2e、2026-11-05T15-16-16-481Z-e2e、2026-11-05T15-21-59-574Z-e2e。
- 验证：人工审阅实际插件可见区域的缩放重置和侧栏截图，正文层级、固定标题与重置入口保持共享样式。
- 验证：强制检查本轮13个移植编辑文件的ESLint错误；保留移植代码的推断返回值风格，仅在该命令关闭explicit-function-return-type，实际检查通过。常规入口会忽略整个移植目录，未将忽略误报为检查通过。
- 验证：pnpm build通过，包含主程序类型检查、设置与工具插件、Electron生产编译；日志 .artifacts/presentation-defaults-build.log。
- 验证：pnpm test:regressions presentation-editing --list通过：13个单测文件、11个E2E文件；同步TX-121与两项Bug台账。
- 验证：对照源码人工审校README、演示组件README、设置/UI规范、仓库与应用内教程及更新说明；新增默认值与重置清单。pnpm docs:check通过，33份文档222个本地链接、15章65步教程无错误。
- 验证：交付前pnpm maintain、pnpm maintain:check及git diff --check通过；保留既有ItemGlass.module.css换行提示。
- 验证：第一次preview:sync因预览正在运行按脚本规则停止，未修改程序或资料；用户明确退出后重新同步通过。
- 验证：pnpm preview:sync通过：1.3.0免安装预览替换104项程序资源，518个既有配置、项目与插件文件逐文件保持一致；回退程序 .artifacts/backups/preview-sync/update-1793892596347/previous-resources。
- 验证：pnpm test:preview:resources通过；同步与资源核验日志分别为 .artifacts/presentation-defaults-preview-sync-final.log 和 .artifacts/presentation-defaults-preview-resources.log。收尾再次执行维护、文档与差异检查。

## 2026-11-05 · 统一演示编辑侧栏层级、折叠和滚动条，精简场景与摄像头设置

记录：[presentation-inspector-ui](../../docs/history/entries/2026-11-05-10-presentation-inspector-ui.json)；版本：未发布。

- 编辑侧栏集中定义标题14px、小节13px、选项12px、描述11px；正文使用主题前景色，描述使用浅灰；辅助留白开关按要求使用浅灰。
- 所有检查器共用细滚动条与稳定滚动槽；高级与缩放通用设置复用折叠布局，默认收起，子项与标题之间保留固定留白，开关对齐选项标题行。
- 场景将录屏圆角置于阴影前，联动各边留白移至移除背景前；解除联动仍保留内边距标题并显示四边滑条；移除场景高级和重复裁剪入口。
- 摄像头移除顶部说明、整体缩放和高级中的位置/边距入口；圆角和阴影移入普通设置，素材标题改为当前摄像头视频文件；宽高比例和预览拖动继续保留。
- 规范和教程随当前界面同步更新，并验证相关设置进入保存、预览、撤销及重做链。

- 验证：通过context-mode读取维护流程、最新改动、Bug台账、工具与设置规范，核对并保留338项既有工作区改动。
- 验证：pnpm test：120个文件、803项通过；证据 .artifacts/runs/2026-11-05T14-13-49-623Z-unit。
- 验证：源码E2E五专项（presentation-inspector/import/review/tracks/fragments）5项通过，覆盖字号、滚动条、折叠、选项精简，以及相邻导轨、注释、复制粘贴、保存、连续撤销重做；证据 .artifacts/runs/2026-11-05T14-12-24-766Z-e2e。
- 验证：新增场景裁切后重置不影响裁切的断言，独立复跑presentation-inspector通过；证据 .artifacts/runs/2026-11-05T14-23-25-525Z-e2e。
- 验证：local-tutorial源码专项通过，实际离线教程、重启和配置/插件保留均通过；同批inspector在进入编辑器前HUD页提前关闭，独立复跑通过；保留失败证据 .artifacts/runs/2026-11-05T14-18-56-010Z-e2e。
- 验证：首次inspector断言测量到了switch交互节点而非可见轨道，改为测量data-slot=switch-control后通过；失败证据 .artifacts/runs/2026-11-05T14-09-53-680Z-e2e。
- 验证：人工审阅实际插件可见区域截图：按键、四边留白、摄像头明暗主题、高级与通用设置；实际标题/选项/描述字号14/13/12/11px，可见开关轨道与标题行对齐，折叠正文上留白12px。
- 验证：修改的编辑侧栏组件及专项eslint --quiet无错误；pnpm test:regressions presentation-editing --list通过，新增专项已纳入12个单测文件、10个E2E文件分组。
- 验证：对照当前源码审校README、工具清单、设置规范、仓库/应用内教程和更新说明；新增演示编辑侧栏UI规范，AGENTS及模块规范链接至强制规则；pnpm docs:check通过。
- 验证：pnpm build通过（含主程序类型检查、设置插件、工具插件及Electron生产编译）；构建日志 .artifacts/sidebar-ui-work/build.log。
- 验证：交付前pnpm maintain、pnpm maintain:check和git diff --check通过；既有ItemGlass.module.css换行提示未作无关格式化。
- 验证：pnpm preview:sync通过：1.3.0免安装预览同步104个程序资源，492个既有配置/项目/插件文件逐文件保持一致；旧程序资源保留在 .artifacts/backups/preview-sync/update-1793888771130/previous-resources。
- 验证：pnpm test:preview:resources通过：103个归档程序文件、346个内置插件文件及1687个媒体依赖文件匹配当前构建；收尾执行文档、维护索引与差异检查。

## 2026-11-05 · 优化演示编辑器多选与字号，统一片段复制粘贴删除并支持注释旋转

记录：[presentation-fragment-editing](../../docs/history/entries/2026-11-05-09-presentation-fragment-editing.json)；版本：未发布。

- 项目多选使用常见列表勾选图标，缩放通用设置按实际像素统一标签、说明及选项字号。
- 注释支持中心旋转手柄及角度滑块，旋转后的局部缩放保持对角点；移除箭头方向控件，旧项目方向继续兼容。
- 所有片段菜单提供复制、粘贴和删除片段，副本保留素材偏移、速度、样式、音量与字幕词时间；剪贴板仅属于当前项目会话。
- 摄像头侧栏移除整份视频的删除入口，沿片段菜单删除具体区间。
- 选中或移动注释边界时定位到有效预览时间，撤销重做同样更新，手动浏览不被强制锁定。
- 内部粘贴视频按插入时长保留后半段注释与缩放，跨插入点的效果拆成两段；副本及被切开的右半段分别继承声音设置。
- 根据追加反馈，删除文件设置的“所有项目及编辑改动始终自动保存。”说明；音频分类补中文标题，原始及自定义比例名称统一中文，内部native值保持兼容。

- 验证：通过context-mode核对维护规范、历史索引、Bug台账与演示模块，保留工作区已有未提交内容。
- 验证：新增片段单测与相邻历史/轨道单测21项通过，归档.artifacts/runs/2026-11-05T12-45-05-154Z-unit；首轮源码专项因测试把4×4矩阵作为六个分量断言而失败，归档.artifacts/runs/2026-11-05T12-47-23-281Z-e2e；修正后完整专项通过，归档.artifacts/runs/2026-11-05T12-49-33-233Z-e2e。
- 验证：扩展保存重开发现内部粘贴视频会因新右半段身份裁掉原注释；增加insertTimelineGap和跨插入点回归，相关22项单测通过，归档.artifacts/runs/2026-11-05T12-57-10-258Z-unit。首轮三专项失败归档.artifacts/runs/2026-11-05T12-53-29-730Z-e2e。
- 验证：后续源码回归纠正旧菜单名称和原复制即重复的测试假设、按CSS缩放值检查选中轮廓的断言、未重新选择的旋转手柄，以及打开当前项目未退回编辑器导致的重复项目按钮定位；失败证据保存在.artifacts/runs/2026-11-05T12-58-46-477Z-e2e和.artifacts/runs/2026-11-05T13-04-07-832Z-e2e。独立审修专项在前一归档中通过。
- 验证：全量120文件803项单测通过，归档.artifacts/runs/2026-11-05T13-04-32-042Z-unit；追加中文显示修复后相关4文件28项单测通过，归档.artifacts/runs/2026-11-05T13-09-18-145Z-unit。
- 验证：新增代码及相关交互文件强制ESLint错误检查通过；补充独立TypeScript诊断发现集成上游目录仍有16处既有/配置问题，涉及反馈服务缺失、旧云端组件属性和环境声明等，本轮新增旋转、剪贴板及回调链无剩余类型错误；未将该诊断描述为全目录类型检查通过。
- 验证：文档检查通过31文档207链接15章65步；presentation-editing分组含12个单测和9个源码专项。README、工具规范与目录、两份教程和更新说明按当前行为同步审校。
- 验证：最终片段交互、导入和完整轨道3个源码专项通过，归档.artifacts/runs/2026-11-05T13-08-57-825Z-e2e；覆盖六类复制/粘贴/删除及连续撤销重做、注释移动/旋转/缩放/取消、普通画布和现代GPU导出像素、视频内部插入保留注释和声音、保存重开、音频标题和原始比例中文及native值、文件说明移除、明暗字号截图、帧图缓存和退出释放。
- 验证：人工查看实际插件正文截图，通用设置完整可见、标签及选项字号一致；旋转后的编辑框及手柄围绕对象中心。最终强制ESLint错误检查通过。
- 验证：pnpm build完整通过Node/Web类型检查、设置教程、演示工具与宿主生产编译；日志.artifacts/editor-fragment-work/build.log。未执行electron-builder或build:unpack，E2E使用源码隔离实例。
- 验证：pnpm preview:sync通过，更新本地1.3.0程序资源，逐文件保留同步前全部485个data/legacy资料与插件文件；104项程序资源核验通过。pnpm test:preview:resources通过103项程序、346项内置插件及1687项媒体依赖；回退资源保存在.artifacts/backups/preview-sync/update-1793884515555/previous-resources。
- 验证：收尾再次执行pnpm docs:check、pnpm maintain、pnpm maintain:check和git diff --check；未执行push、云端构建、Release或资料重置。

## 2026-11-05 · 审修演示编辑历史、素材关联提示、项目归类与中文界面

记录：[presentation-editor-review](../../docs/history/entries/2026-11-05-08-presentation-editor-review.json)；版本：未发布。

- 按键侧栏更名并补右上角重置，缩放重置恢复当前模式/倍率与通用连接和运动效果，通用文字收紧字号；预览音量与时间之间去掉竖线。
- 箭头方向采用两行八向紧凑矩形选项，增加线形、实心、双向和虚线外观，预览与导出共用几何；移除所有注释页的快捷键与提示。
- 项目支持多选追加到文件夹，移除单项目分享；缺失素材提供项目关联说明、回收站恢复提示与独立删除，设置页不继承打开项目错误。
- 项目及附属文件事务回收，失败恢复原件；删除仍被引用的原始录制前列出项目影响并保存、释放当前媒体。
- 编辑历史跟踪完整持久模型，修复轨道排序、摄像头、声音与外观遗漏；单纯选区不入栈、不清空重做，拖动中间帧合并为一次操作。
- 核查中文翻译、共享控件、素材库、项目菜单、字幕和权限界面、系统文件选择器，外部英文故障在展示边界提供中文解释。
- 根据用户追加反馈，公共单选卡片统一明确主题色内轮廓，覆盖按键外观、箭头方向与外观等相邻选择。

- 验证：通过context-mode核对维护规范、最新改动与Bug索引及演示模块源码，保留工作区已有未提交内容。
- 验证：相关4文件43项单测通过，归档.artifacts/runs/2026-11-05T11-17-05-075Z-unit；新增审修5项单测通过，归档.artifacts/runs/2026-11-05T11-19-22-720Z-unit。初轮因读取引用的工具模块耦合宿主初始化而无法导入，归档.artifacts/runs/2026-11-05T11-19-07-294Z-unit；将清单读取改为独立文件解析。
- 验证：前三轮源码审修分别暴露测试将重做写为恢复、添加缩放未切换侧栏、以及5×显示倍率与内部等级6的测试假设错误；修正名称与断言，同时修复添加后切换检查器及重置使用DEFAULT_ZOOM_DEPTH。失败归档.artifacts/runs/2026-11-05T11-20-59-478Z-e2e、2026-11-05T11-23-33-571Z-e2e、2026-11-05T11-25-35-763Z-e2e。
- 验证：默认ESLint排除集成上游目录；强制检查发现原目录存在缺少显式返回类型的规则问题，后续强制检查单独禁用该上游风格规则，保留其他错误检查。
- 验证：全量119文件798项单测通过，归档.artifacts/runs/2026-11-05T11-33-03-994Z-unit；随后补充音频素材偏移和轨道字段到历史快照测试，并更新英文故障边界后，新增5项再次通过，归档.artifacts/runs/2026-11-05T11-40-44-241Z-unit。
- 验证：扩展源码专项已验证按键和缩放重置、选区切换后重做、轨道排序、一次滑条拖动只需一次撤销、摄像头分割连续恢复、箭头四种实际导出像素与明暗选中轮廓。后续失败来自新测试的Tag子格命中、调用renderAnnotations时误用参数次序、取消按钮匹配到隐藏关闭控件、Dropdown菜单的无障碍名称及项目模态关闭等待；依次修正测试定位与异步边界，失败证据归档.artifacts/runs/2026-11-05T11-28-01-296Z-e2e、2026-11-05T11-30-27-159Z-e2e、2026-11-05T11-32-37-084Z-e2e、2026-11-05T11-35-43-138Z-e2e、2026-11-05T11-38-29-179Z-e2e。
- 验证：人工查看实际插件正文截图，箭头方向两行紧凑排列，方向及实心外观均显示明确主题色内轮廓，播放音量与时间无竖线；单项目菜单无Share。pnpm docs:check通过31文档207链接15章65步，presentation-editing分组包含11个单测文件与8个源码专项。
- 验证：完整审修源码专项通过，归档.artifacts/runs/2026-11-05T11-40-33-847Z-e2e；验证按键/缩放重置、选区保持重做、滑条手势合并、摄像头分割、箭头四种实际导出与明暗选中轮廓、项目批量归类、关联录制删除及缺失项目独立回收。
- 验证：最终全量119文件798项单测通过，归档.artifacts/runs/2026-11-05T11-42-38-751Z-unit；导入、轨道与本地教程3个相邻源码专项通过，归档.artifacts/runs/2026-11-05T11-42-38-869Z-e2e，含帧图缓存、轨道交互与资源退出清理。
- 验证：英文故障兜底补充单词型异常Unsupported的中文化断言，审修5项单测通过，归档.artifacts/runs/2026-11-05T11-46-14-934Z-unit。
- 验证：pnpm build完整通过Node/Web类型检查、设置教程、演示工具及宿主生产编译；补充精确恢复路径说明后pnpm build:tools通过。仅生成程序资源，未执行electron-builder或build:unpack。
- 验证：收尾发现中英文混合故障在半角冒号或无冒号情况下可能保留技术原文，修复并补充断言；审修5项单测通过，归档.artifacts/runs/2026-11-05T11-54-47-362Z-unit；最终工具生产编译通过。
- 验证：pnpm preview:sync通过；同步前既有483个data/legacy文件逐文件保持一致，104项程序资源核验通过。pnpm test:preview:resources通过103项程序资源、346项内置插件资源及1687项媒体依赖。
- 验证：收尾pnpm docs:check、pnpm maintain、pnpm maintain:check及git diff --check通过。文档名称与界面动作再次核对，未进行push、云端构建、Release或资料重置。

## 2026-11-05 · 修复演示缩放落点并统一按键、音频和播放工具栏交互

记录：[presentation-editor-controls](../../docs/history/entries/2026-11-05-07-presentation-editor-controls.json)；版本：未发布。

- 缩放轨道按鼠标时间解析可用区间，临近下一缩放或录屏结尾自动缩短，预览和提交共用边界。
- 去掉工具栏手动缩放按钮，音量紧邻播放时间，图标提供中文悬停提示；保留自动识别与选区分割。
- 视频保留选中轮廓并移除已选中字样，录屏侧栏去掉裁剪画面按钮，声音只用滑条设置淡入淡出并自动保留素材偏移。
- 录制按键自动入轨，按键侧栏使用共享选择卡片与设置行，显示按键输入开关置于外观前；项目、撤销、预览和导出保留显示选择及编辑内容。
- 连接缩放和运动效果归入带分割线的通用设置。

- 验证：通过context-mode核对维护规范、历史索引、Bug台账和演示模块源码，保留工作区既有未提交内容。
- 验证：缩放落点及按键显示兼容单测12项通过，归档.artifacts/runs/2026-11-05T10-21-39-251Z-unit；扩展相关4文件43项单测通过，归档.artifacts/runs/2026-11-05T10-25-49-796Z-unit。
- 验证：源码专项首次因新增局部变量与原测试重名无法启动，归档.artifacts/runs/2026-11-05T10-21-51-250Z-e2e；复用原定位器后启动。第二轮尾部添加成功，但预览测试属性由像素反算产生浮点尾差，改为与提交相同的整数毫秒，归档.artifacts/runs/2026-11-05T10-22-12-154Z-e2e。
- 验证：后续源码专项发现普通span不消费Tooltip触发上下文，改用原生HeroUI触发器；禁用子Button又重复消费上下文和产生两个无障碍按钮，改为仅保留禁用触发器及图标。失败证据分别归档.artifacts/runs/2026-11-05T10-23-14-881Z-e2e、2026-11-05T10-24-32-274Z-e2e、2026-11-05T10-25-39-557Z-e2e。
- 验证：误用tsc检查Vue项目导致6个.vue声明错误，日志.artifacts/work/presentation-editor-typecheck.log；正式类型验证改用仓库pnpm build中的Node/Web检查。
- 验证：pnpm docs:check通过31文档207链接15章65步；presentation-timeline回归分组列出4个单测文件和2个源码专项。
- 验证：禁用提示仍被React Aria的禁用状态抑制，归档.artifacts/runs/2026-11-05T10-27-00-935Z-e2e；将禁用提示显隐明确绑定悬停与焦点。后续已通过全部提示、音量弹窗与按键切换，但旧间距断言误读Tag的gridcell包装，归档.artifacts/runs/2026-11-05T10-28-29-432Z-e2e；增加卡片内部布局与精确预览标签定位。
- 验证：完整源码轨道专项通过，归档.artifacts/runs/2026-11-05T10-30-17-141Z-e2e；验证鼠标尾部及下一缩放前的短空位、预览提交一致、占用区选择、四项实际悬停与音量弹窗、音频滑条与分割素材偏移、按键首次自动入轨、开关关闭保存重开及机械样式保留、既有排序与资源退出清理。人工查看插件正文缩放和按键侧栏截图。
- 验证：受影响新模块、侧栏及测试的强制ESLint错误检查退出0。
- 验证：最终导入、轨道与本地教程3个源码专项通过，归档.artifacts/runs/2026-11-05T10-32-00-400Z-e2e；补充真实按键叠加节点随开关撤下/恢复断言，以及项目加载期间禁止自动生成轨道。
- 验证：仓库正式pnpm typecheck的Node和Web检查退出0；pnpm maintain、pnpm maintain:check及git diff --check通过。悬停控件最后统一受控状态，避免禁用切换时在受控/非受控模式间跳转。
- 验证：统一悬停状态后源码轨道专项再次通过，归档.artifacts/runs/2026-11-05T10-34-36-162Z-e2e；真实按键叠加节点关闭为0、开启为1，片段、样式及关闭选择在保存重开后保留。
- 验证：pnpm build完整退出0，包含Node/Web类型检查、设置教程、演示工具与宿主生产编译，日志.artifacts/work/presentation-editor-controls-build.log；未执行electron-builder或build:unpack。最终pnpm docs:check与git diff --check通过。
- 验证：pnpm preview:sync退出0，104项程序资源通过核验，487个同步前既有data/legacy文件逐文件保持一致，配置、资料及已安装插件保留；程序回退副本.artifacts/backups/preview-sync/update-1793875051035/previous-resources。日志.artifacts/work/presentation-editor-controls-preview-sync.log。
- 验证：pnpm test:preview:resources退出0，日志.artifacts/work/presentation-editor-controls-preview-verify.log。

## 2026-11-05 · 完善演示时间轴落点与选中反馈，修复刻度点击穿透并优化视频帧渲染

记录：[presentation-timeline-feedback](../../docs/history/entries/2026-11-05-06-presentation-timeline-feedback.json)；版本：未发布。

- 整轨拖动按上方或下方显示插入线，隐藏名称旁的手柄；片段移动显示复用最终解析结果的目标框和插入线，完成或取消后清理。
- 录屏和摄像头选区在实际可见帧图上方显示主色与白色双轮廓及已选中标记，不再被图像盖住。
- 固定刻度栏接收鼠标定位事件，阻止滚动后点击穿透到下方片段；沿统一定位流程清除旧选区。
- 帧图使用固定源时间网格与二倍采样层级；横移复用已有块，两路素材独立解码，取消旧定位并逐帧发布，去除150ms整组延迟。
- 当前会话按素材引用共享解码器，每源最多128帧；最后一个使用者卸载立即取消任务、释放媒体和画布并清空缓存。
- 音频及其他片段悬停提供名称、毫秒起止时间与时长，保留独立素材偏移。

- 验证：通过context-mode核对当前维护记录、Bug台账、工具与内存规范和未提交源码，保留既有改动。
- 验证：首轮新增单测2失败，归档.artifacts/runs/2026-11-05T09-20-26-052Z-unit：缩放窗口首块可能移出更细网格，不应断言不可见块复用；取消测试的后续批量阶段仍保留人为阻塞。修正测试边界及测试阻塞撤销后，12项单测通过，归档.artifacts/runs/2026-11-05T09-23-02-597Z-unit。
- 验证：首轮源码专项的新交互与缓存断言通过，但项目回收仍进行时遇到5秒列表等待上限，归档.artifacts/runs/2026-11-05T09-23-06-529Z-e2e；按异步系统操作边界等待完成后发现项目主页覆盖编辑器仍保留摄像头解码器。
- 验证：第二轮在并行生产编译期间导入首屏未就绪，轨道专项资源断言发现还存在1解码器25帧，归档.artifacts/runs/2026-11-05T09-25-11-334Z-e2e；为缩略图接入编辑区前台状态，主页打开或主素材卸载立即取消并释放，后续源码与生产构建按顺序执行。
- 验证：最终完整轨道专项通过，归档.artifacts/runs/2026-11-05T09-30-08-211Z-e2e；验证真实整轨及片段落点、隐藏手柄、选中轮廓、滚动后固定刻度点击及音频完整标题，离开编辑后源、解码器和缓存均为0。
- 验证：同机源码暖缓存横移4次为70、52、55、53ms；2源2解码器、56帧缓存，前后累计解码均为56，没有新增解码。此前两轮为51–59ms；不推广为所有长视频和设备的固定延迟承诺。
- 验证：全量pnpm test通过118文件791项，归档.artifacts/runs/2026-11-05T09-30-18-413Z-unit；包含慢来源隔离、渐进发布、取消定位、128帧上限和最后引用释放。
- 验证：受影响时间轴模块与新增测试的强制ESLint错误检查退出0；pnpm docs:check通过31文档207链接15章65步，presentation-timeline分组列出4个单测和2个源码专项。
- 验证：人工查看实际片段落点截图，目标框与插入线位置一致，手柄隐藏且帧图未盖住落点提示。
- 验证：最终三项源码专项全部通过：本地教程、导入、轨道，归档.artifacts/runs/2026-11-05T09-33-10-849Z-e2e；本轮暖缓存横移为51、52、58、48ms，累计解码帧不变。整轨与片段松开后落点撤下；项目回收完成后实际源/解码器/缓存归零。
- 验证：最终补上编辑区失活时撤下图片节点，轨道专项再次通过，归档.artifacts/runs/2026-11-05T09-39-37-879Z-e2e；退出时图片节点为0且源、解码器和缓存均归零。本轮暖缓存横移52、55、54、100ms，中位数54.5ms，解码仍为56帧不增加。
- 验证：pnpm build完整退出0，包含Node/Web类型检查、设置页、工具和宿主生产编译，日志.artifacts/work/presentation-timeline-feedback-build-final.log；最终图片节点释放调整后另编译工具。未执行electron-builder或build:unpack。
- 验证：pnpm maintain、pnpm maintain:check、pnpm docs:check、git diff --check及受影响模块强制ESLint错误检查退出0。
- 验证：最终pnpm build:tools退出0，含编辑区失活后撤下图片节点的最终实现，日志.artifacts/work/presentation-timeline-feedback-tools-final.log。
- 验证：pnpm preview:sync退出0，104项程序资源通过核验，461个同步前既有data/legacy文件逐文件一致；回退副本.artifacts/backups/preview-sync/update-1793871748106/previous-resources。
- 验证：pnpm test:preview:resources退出0，核验103项程序、345项内置工具与1687项媒体运行资源通过。

## 2026-11-05 · 修复演示时间轴帧预览和滚动命中，支持轨道及片段拖动排序并增大轨道区

记录：[presentation-timeline-arrangement](../../docs/history/entries/2026-11-05-05-presentation-timeline-arrangement.json)；版本：未发布。

- 帧预览按当前可见窗口定位与采样，取消旧取帧请求，移除拖动库离屏内边距的重复偏移。
- 片段拖动按指针位移计算，限制命中范围到可见片段，摄像头轨道参与统一纵向布局。
- 轨道标题支持整轨拖放和上下键排列，顺序随项目保存重开，新素材清空旧顺序；字幕独立参与排列。
- 同轨片段跨越旧邻居移动，重叠落点采用插入排列并保留时长、源偏移及留白；移除录屏菜单向前和向后移动。
- 增加轨道区比例与最小高度，收紧外边距，保证双视频轨道与第三条普通轨道同时可见。
- 同步当前说明、两份教程、模块规范与TX-115回归条目；保留已有未提交内容。

- 验证：通过context-mode读取维护规范、当前改动索引、Bug台账和演示模块实现。
- 验证：presentation-editing单测9文件50项通过，归档.artifacts/runs/2026-11-05T08-28-36-429Z-unit。
- 验证：首轮源码轨道专项在项目回收阶段失败（列表仍有2项目），时间轴新断言已通过；保留归档.artifacts/runs/2026-11-05T08-25-47-288Z-e2e。未改动回收实现，下一轮完整专项通过。
- 验证：扩展源码轨道专项通过，归档.artifacts/runs/2026-11-05T08-28-26-131Z-e2e，覆盖两路帧图随缩放变化、第三轨可见、真实标题拖动、保存顺序、录屏片段换位、留白定位和明暗菜单。
- 验证：受影响新增模块与轨道测试的ESLint错误检查退出0。
- 验证：导入源码专项通过，补充摄像头拖动首次失败，归档.artifacts/runs/2026-11-05T08-31-13-664Z-e2e；进一步诊断归档.artifacts/runs/2026-11-05T08-35-03-465Z-e2e确认：鼠标移动541px，手工移动DOM触发拖动库布局补偿后事件仅余9px。删除拖动中的重复DOM位置更新，保留裁剪几何与最终插入校验，调试输出已移除。
- 验证：最终源码轨道专项通过，归档.artifacts/runs/2026-11-05T08-38-16-175Z-e2e；摄像头右段真实拖到首位、源偏移1000ms保持且自动保存通过。录屏真实换位、标题拖动/键盘/保存重开、滚动留白定位、缩放双视频帧图更新、第三轨可见及明暗菜单均通过。
- 验证：全量pnpm test通过117文件787项，归档.artifacts/runs/2026-11-05T08-38-26-778Z-unit。
- 验证：pnpm build完整退出0，包含Node/Web类型检查、设置和工具及宿主构建；日志.artifacts/work/presentation-timeline-arrangement-build.log。最终拖动修复后另执行工具生产编译；无electron-builder或build:unpack。
- 验证：pnpm docs:check通过31文档207链接15章65步；presentation-timeline分组列出3个单测及2个源码E2E文件。
- 验证：人工查看225%时间轴可见帧截图及双视频与第三轨布局，图像覆盖可见窗口；新增模块、片段与菜单模块及受影响测试的强制ESLint错误检查退出0。
- 验证：最终pnpm build:tools退出0，日志.artifacts/work/presentation-timeline-arrangement-tools-final.log；编译含最终移除重复拖动布局的实现。
- 验证：pnpm maintain、pnpm maintain:check、pnpm docs:check与git diff --check退出0。
- 验证：pnpm preview:sync退出0，104项程序文件核验通过，463个既有data/legacy文件逐文件一致；程序回退副本.artifacts/backups/preview-sync/update-1793868089951/previous-resources。
- 验证：pnpm test:preview:resources退出0，核验103项程序、345项内置工具及1687项媒体运行资源。

## 2026-11-05 · 修复演示录屏控制、摄像头轨道、时间轴比例与片段操作

记录：[presentation-timeline-interactions](../../docs/history/entries/2026-11-05-04-presentation-timeline-interactions.json)；版本：未发布。

- 取消控制条鼠标录制开关及状态入口，录制链明确配置mouse:true；按键仍由用户单独启用。摄像头关闭与麦克风使用相同纯文字危险软按钮。
- 新增时间轴比例滑杆、加减和适应全部；横向滚动条按可见时长显示滑块，支持点击、拖动与键盘。更改片段时保留用户比例，换素材重新适配。
- 改进明暗刻度与固定游标头，显示分:秒.毫秒，方向键微调1ms、Shift微调1秒；250ms刻度保留两位小数。
- 摄像头素材自动进入独立轨道，缺失区间按实际时长、偏移和旧可见范围补齐，保留明确删除的空轨；支持分割、移动、裁剪和右键删除，沿项目保存链持久化。
- 统一片段右键菜单与选区剪刀：只处理选中目标，游标在外或无选区时不操作；声音静音/恢复、删除，录屏复制/移动等集中到菜单，移除侧栏重复操作。
- 取消录屏切口24px人为内缩和所有录屏竖条，保持显示与媒体时间一致；分割保持独立声音倍率、右段素材偏移与外侧淡入淡出。
- 同步README、模块/设置说明、工具清单、应用内与仓库教程、更新说明、Bug台账及TX-114回归分组；保留既有未提交改动。

- 验证：通过context-mode读取维护流程、改动索引、Bug台账和相关模块，核对已有未提交改动并保留。
- 验证：首轮3文件27项相关单测通过，归档.artifacts/runs/2026-11-05T07-07-19-936Z-unit。
- 验证：首轮源码专项2通过1失败（控制条和导入通过），归档.artifacts/runs/2026-11-05T07-08-11-308Z-e2e；失败为自动保存完成前读取旧摄像头数据，补上明确保存等待。
- 验证：扩展专项首轮2失败，归档.artifacts/runs/2026-11-05T07-12-31-256Z-e2e：控制测试误用弹层“关闭麦克风”寻找工具栏实际“禁用麦克风”；轨道测试在上一轮项目加载完成前开始下一次导入。修正真实名称和加载完成等待，未降低产品断言。
- 验证：最终控制/轨道两项源码专项通过，归档.artifacts/runs/2026-11-05T07-15-37-653Z-e2e；覆盖统一关闭按钮、固定鼠标采集、真实物理输入与系统回收，摄像头与音频分割保存重开、选中录屏切口紧邻、225%比例保持、横向拖动/键盘和菜单。
- 验证：全量pnpm test通过117文件784项，归档.artifacts/runs/2026-11-05T07-18-19-676Z-unit。
- 验证：pnpm docs:check通过31文档、207链接、15章65步；presentation-editing分组列出9个单测和7个源码E2E文件。
- 验证：已人工查看摄像头关闭和明暗时间轴菜单截图；浅色截图碰到侧栏过渡，补上正文和透明度稳定等待。刻度审查发现250ms被显示为0.3秒，已改为0.25并加入单测。
- 验证：最后完整录制/轨道/本地教程源码专项运行中；本地教程已通过。新增模块的强制ESLint审查提示缺少显式返回类型，待补齐后复核。
- 验证：最后3项源码E2E全部通过：完整录制、轨道与本地教程；归档.artifacts/runs/2026-11-05T07-19-11-932Z-e2e。录制实际验证摄像头自动入轨、两路音频、共同录制交接、预览、实际MP4导出和会话回收；轨道验证右键音频删除后自动保存且不重建、毫秒游标键盘与稳定明暗菜单截图。
- 验证：新建模块补齐显式返回类型后，强制--no-ignore ESLint检查及相关测试文件检查退出0；最后改动仅类型与JSDoc，不改变已验收运行行为。
- 验证：pnpm build完整退出0：Node/Web类型检查、设置页检查与构建、演示桥接、工具及宿主生产编译；日志.artifacts/work/presentation-timeline-delivery-build.log。未运行electron-builder或build:unpack；既有pnpm迁移、PostCSS和大chunk提醒保留。
- 验证：最终人工审查稳定明暗菜单和摄像头关闭截图，刻度250ms正确显示0.25/0.75、游标0:01.000；菜单使用不透明底色，屏幕片段无端点竖条。git diff --check通过。
- 验证：首次pnpm preview:sync因免安装预览仍运行而在任何资源替换前停止；只读进程与窗口检查确认仅宿主在托盘。用户明确回复“已退出，继续同步”后继续，未强制结束或重置资料。
- 验证：pnpm preview:sync退出0：104项程序资源核对、451个同步前既有data/legacy文件逐文件一致；程序回退副本.artifacts/backups/preview-sync/update-1793863659586/previous-resources。
- 验证：pnpm test:preview:resources退出0：103项程序文件、345项内置工具文件和1687项媒体运行文件核验通过。配置、素材及已安装插件保留；未push、云端构建、release或数据重置。

## 2026-11-05 · 修正重命名状态图标居中，统一序号控件排布并缓解插入页拥挤

记录：[rename-visual-alignment](../../docs/history/entries/2026-11-05-03-rename-visual-alignment.json)；版本：未发布。

- 错误、完成、待改名与无变化状态使用SVG几何图形，行尾移除也使用居中SVG，避免字体基线偏移。
- 编号与插入页共用横向标签/控件的序号参数行，统一数值和下拉的字体、字重、箭头列与线条；移除重复外框，增加行距和中列宽度。
- 保留原有规则参数、编辑、冲突保护与事务行为，扩充既有源码E2E的中文序号、渲染对齐和真实窄窗口截图。

- 验证：通过context-mode核对维护规范、当前改动与Bug台账，保留工作区已有修改。
- 验证：pnpm test的2文件26项相关单测通过，归档.artifacts/runs/2026-11-05T06-02-54-767Z-unit。
- 验证：早期源码E2E发现数字组件把class透传到内部input而没有应用外框，已改为明确的外层控件容器；失败归档.artifacts/runs/2026-11-05T06-02-44-602Z-e2e。窄窗口夹具起初只调整宿主而未同步WebContentsView边界，已调用现有布局接口，未修改宿主产品逻辑；失败归档.artifacts/runs/2026-11-05T06-03-52-289Z-e2e。
- 验证：修正后源码E2E通过，归档.artifacts/runs/2026-11-05T06-05-15-192Z-e2e；最后将类型选中文字改为普通正文绘制后，再次专项1项通过，最终归档.artifacts/runs/2026-11-05T06-06-39-157Z-e2e。
- 验证：最终专项核对中文大写真实预览、数字/下拉字体一致和箭头列小于1px差、错误与移除SVG居中小于0.5px差、640px真实宿主及视图下行距至少9px且无内部滚动；同时保留80文件标签隔离、多行键入/系统粘贴、冲突阻止、实际执行/撤销和刷新稳定回归。
- 验证：已查看最终错误、中文序号、插入序号及此前同布局的窄窗口和深色截图；直接捕获稳定插件正文。受影响源码和测试ESLint通过，回归分组列出3个单测及2个E2E文件。
- 验证：审校工具规范、指令清单、README、两份教程与更新说明；本轮不改变操作名称或行为，教程继续准确。pnpm docs:check通过31文档、207链接和15章65步。
- 验证：最终pnpm build:tools通过，日志.artifacts/work/rename-visual-build-final.log；受影响的源码和测试ESLint、pnpm maintain、pnpm maintain:check及git diff --check退出0。
- 验证：首次pnpm preview:sync检测免安装预览仍运行，保护机制在替换资源前停止；用户确认从托盘正常退出后继续同步成功。
- 验证：pnpm preview:sync与pnpm test:preview:resources退出0，431个同步前已有data/legacy文件逐文件一致。同步核对104项程序文件；只读核对103项程序、345项内置资源与1687项媒体文件通过。回退资源.artifacts/backups/preview-sync/update-1793859228585/previous-resources。

## 2026-11-05 · 优化重命名标签隔离、多行手动编辑、表单布局和稳定预览

记录：[rename-interactions](../../docs/history/entries/2026-11-05-02-rename-interactions.json)；版本：未发布。

- 切换顶层标签自动使用当前功能，移除总启用框；规则清理仅保留可勾选叠加的大小写、文件名清洗和扩展名处理，旧删除字符配置不参与预览。
- 补充多行编辑框和应用入口，手动与智能名称独立保存；重算保留原列表节点，校验与执行仍有过期隔离和冲突防护。
- 修复查找方式裁切、复选框对齐与数字微调按钮，收紧插入页布局，清空列表使用垃圾桶图标。

- 验证：已通过context-mode核对维护规范、改动索引与Bug台账，保留工作区原有未提交修改。
- 验证：使用仓库指定pnpm9.15.9入口：3文件30项相关单测通过，归档.artifacts/runs/2026-11-05T05-37-51-070Z-unit。
- 验证：首轮源码E2E为1通过2失败，归档.artifacts/runs/2026-11-05T05-38-00-820Z-e2e：tools-lifecycle通过；tools-expanded在本轮未改动的图片标记颜色断言处提前失败，未到达重命名。专项滚动断言把1100 CSS px作为精确值，忽略本机DPI实际1100.363647 px；后续改为对照实际初始值，未放宽刷新位移要求。第二轮同类断言失败保留于.artifacts/runs/2026-11-05T05-39-43-745Z-e2e。
- 验证：最终重命名专项和本地教程2项源码E2E通过，归档.artifacts/runs/2026-11-05T05-40-53-170Z-e2e。80个真实临时文件覆盖标签隔离、清理叠加、键入换行、系统剪贴板CRLF与末尾换行、条数错误保护、冲突阻止、单击执行与撤销、刷新期间滚动节点和全部采样位置精确不变。
- 验证：已查看最终编号、替换、清洗、插入序号、手动和深色正文截图；查找方式完整显示，微调按钮跟随主题，清理勾选框在边框内对齐，插入序号含指定位置无需内部滚动。截图等待计算和校验结束及实际绘制，直接捕获插件WebContentsView。
- 验证：新增及受影响源码/测试ESLint通过；pnpm docs:check通过31文档、207链接和15章65步；rename-interactions回归分组列出3个单测和2个E2E文件。
- 验证：pnpm build退出0，包含Node/Web类型检查、设置页检查与构建、工具和宿主生产构建；日志.artifacts/work/rename-delivery-build.log。
- 验证：同步前pnpm maintain及pnpm maintain:check通过；首次pnpm preview:sync检测免安装预览仍在运行，按保护机制在替换资源前停止。用户从托盘退出后继续同步成功。
- 验证：最终pnpm preview:sync及pnpm test:preview:resources退出0：同步核对104项程序文件，425个已有data/legacy文件逐文件一致；只读资源核对103项程序、345项内置资源与1687项媒体文件通过。回退副本.artifacts/backups/preview-sync/update-1793857465336/previous-resources。

## 2026-11-05 · 统一Windows无指针演示录制的采集时钟，修复摄像头首尾错位和启动等待

记录：[presentation-common-capture-clock](../../docs/history/entries/2026-11-05-01-presentation-common-capture-clock.json)；版本：未发布。

- Windows画面使用WGC并继续禁用系统指针，摄像头改用MediaFrameReader的SystemRelativeTime，系统声音与选定麦克风使用WASAPI包QPC；各路共用一次UTC/QPC校准和明确起止/暂停区间。
- 并行准备设备及独立原生编码器，取得真实源帧后才提交40ms后的共同边界；相机不再由浏览器首包重新归零。音频按实际样本切片、填充真实缺口，视频按共同60Hz输出时间轴编码，不再用文件长度反推内容偏移。
- WGC回调复制到有界队列，编码线程独立处理；静态窗口保留最新源帧，在开始和恢复边界建立画面，不依赖窗口必须刷新。窗口改用真实CreateForWindow，屏幕与区域继续显示器捕获。
- 去掉开始时同步PowerShell显示器枚举和固定窗口激活等待；去掉控制条约300ms退场动画等待。设备准备阶段不写正式素材，取消仅清理本次文件；请求相机缺失时不能自动把部分素材作为同步成功。
- 从仓库C++源码重编译Windows x64原生程序，加入可复用本地MSVC/SDK构建入口和协议说明；更新模块README、工具清单、更新说明、Bug台账、TX-112和回归分组。

- 验证：通过context-mode核对维护流程、改动索引、Bug台账及相关模块，保留原工作区其他未提交内容。
- 验证：早期浏览器VideoFrame/WebCodecs方案在内容专项中出现2–3帧偏差，已移除；未以缩小文件长度或放宽一帧阈值交付。原生源时间码验证屏幕与独立相机编码器同帧，双音轨PCM相对第三路独立WASAPI参考约0.03ms误差。
- 验证：初版1秒冷启动目标未通过；分段日志显示音频约42ms、图形约172ms、硬件编码器准备约1.2s，控制条额外约300ms。当前回归分别约束冷启动小于2秒、共同起点后UI显示小于100ms；实际数据待最终运行写回。
- 验证：真实摄像头准备和短时正式录制已通过，屏幕/相机时长均0.76665s；准备取消没有遗留素材，归档仅保存数值，真实人像临时文件随隔离目录删除。
- 验证：控制项回归发现静态窗口不推送新帧导致空录制，已补共同起点和恢复快照，等待复测。
- 验证：暂停前最近一轮5项源码E2E：4通过、1失败，归档.artifacts/runs/2026-11-05T03-27-01-319Z-e2e。通过真实摄像头（画面/相机均0.76665s）、实际原始帧指针排除（阳性1247像素/录制0像素）、完整录制预览编辑导出及资源回收、内容时钟专项。该次无倒计时实际采集起点约1208.6ms，UI约1243.9ms（起点后35.3ms）；5个采样位置画面/相机时间码相同，双音轨相对独立PCM参考最大约0.039ms误差。
- 验证：失败项为静态窗口开始后没有新WGC帧而生成空录制。已补最新帧快照、开始/恢复区间首帧和不依赖下一帧的准备回执，并重新编译原生程序成功；此最后改动尚未执行E2E。
- 验证：用户明确要求安全暂时中断。只读检查本轮Electron、原生采集、光标及仓库Node进程均已退出；系统已静音，音量0.05保持。新增测试和构建入口已格式化，改动保留于工作区。
- 验证：暂停收尾pnpm maintain、pnpm maintain:check及git diff --check退出0；仅已有CSS的CRLF转换提示。恢复后仍须完成最后补丁的专项验证和正式交付。
- 验证：用户明确要求继续；从暂停记录恢复并核对Git状态、维护与模块文档，先复测已编译的静态窗口快照补丁。
- 验证：恢复后的最后静态窗口补丁复测：5项源码E2E全部通过，归档.artifacts/runs/2026-11-05T03-58-14-623Z-e2e。控制项覆盖静态窗口、键盘独立录制、目录选择及真实回收；指针阳性1247像素/原始帧0像素；真实相机/画面时长均0.783317s；完整录制预览编辑实际导出和退出回收通过。
- 验证：最后内容专项5处画面/独立相机编码时间码相同，暂停恢复与尾段无帧偏移；双音轨对第三路独立WASAPI参考最大约0.027ms、彼此0ms。实际采集起点1614.5ms，UI1661.4ms（共同起点后46.9ms），冷启动主要为硬件编码器准备。物理来源替换与实际设备检查分别记录，未将容器时长等同于传感器内容验收。
- 验证：7文件42项相关单测通过，归档.artifacts/runs/2026-11-05T03-59-03-897Z-unit；新增/更新专项测试和原生构建脚本ESLint通过。
- 验证：人工核对README、工具清单、模块及原生构建说明、两处教程、更新说明与回归说明；更正旧浏览器编码/首帧前置量说明，补齐TX-112。pnpm docs:check通过31文档、207链接和15章65步；presentation-editing分组列出8个单测与7个E2E文件。
- 验证：测试后系统静音为true、音量0.05保持；同步前只读核对免安装预览未运行。
- 验证：最终pnpm build退出0，包含Node/Web类型检查、设置页类型检查与构建、工具和宿主生产构建；日志.artifacts/work/presentation-common-clock-delivery-build.log。
- 验证：最终录制预览实际38个帧样本的光标/呈现媒体时间最大偏差为0ms，暂停后无新增GPU重绘；实际导出流程通过，证据在最终源码E2E归档。
- 验证：同步前pnpm maintain、pnpm maintain:check、pnpm docs:check及git diff --check通过；pnpm preview:sync与pnpm test:preview:resources退出0，程序资源104项核对、423个既有data/legacy文件逐文件一致。

## 2026-11-04 · 继续修复演示录制画面双指针、Windows源访问拒绝及关闭音频斜线

记录：[presentation-cursor-and-recycle](../../docs/history/entries/2026-11-04-03-presentation-cursor-and-recycle.json)；版本：未发布。

- Windows屏幕、窗口及区域录制统一使用现有WGC原生捕获，显式禁止系统指针合成；能力不足或启动失败时明确报错，避免回退到会烘焙系统指针的浏览器采集。
- 相机及选定麦克风并行预备并同步开始；按原生首帧前置量平移输入事件、相机和麦克风，按真实视频时长补齐/裁剪独立音轨；停止时等待全部素材和遥测发布后才打开编辑器。
- 取消使用每次录制独立的失效标记阻止迟到回调发布；清理生成录制的全部同名附属素材，涵盖原生系统/麦克风音轨及元数据。
- Windows源访问拒绝时将普通文件独占复制到当前用户临时目录继承新权限，检查尺寸和源修改时间，调用同一无提权系统回收流程；只有回收成功才移除原暂存，失败保留原件并回滚，不修改原文件权限或绕过回收保护。
- 系统音频图标使用与麦克风相同的左上至右下关闭斜线；同步模块说明、工具清单、更新说明、Bug台账及TX-111回归分组。

- 验证：使用context-mode核对维护流程、改动及Bug索引、相关模块和当前Git状态；保留前轮及其他任务未提交工作。
- 验证：预览日志确认0x80270021，Microsoft SDK定义为COPYENGINE_E_ACCESS_DENIED_SRC；当前用户拥有源目录及抽查文件且具有完整控制，不能据此归咎管理员权限或预览目录。只读抽帧确认用户原始WebM已包含系统指针，未删除用户故障素材。
- 验证：原浏览器cursor约束/整屏夹具尝试的阳性对照同为零，未作为成功证据。原生专项验证实际系统指针可见且位于捕获窗口内，DrawIconEx实际指针位图阳性1247像素，原始WGC MP4对应区域0像素；也验证生成原生录制及全部附属素材取消清理。通过归档：.artifacts/runs/2026-11-04T09-23-53-126Z-e2e（原生专项及完整录制两项通过，该次控制项启动竞争失败）。
- 验证：完整录屏源码E2E通过：真实键鼠、系统音频、选定麦克风、相机、暂停恢复、预览导出及会话释放；保留原严格时长误差断言。初次原生接入暴露音频51.733ms误差后实现音轨对齐修复，未放宽阈值。
- 验证：控制项等待首次设置正文稳定后再启动录制，解决源码隔离首次启动竞争；最终在与预览同工作区的隔离数据路径注入首次源拒绝后，实际PowerShell系统回收新权限副本成功，同时验证前置输入开关及项目目录选择。归档：.artifacts/runs/2026-11-04T09-35-33-118Z-e2e，1项通过。
- 验证：回收、素材事务、设置、时间线、光标行为和退出相关6文件39项单测通过；覆盖拒绝后成功/再次失败/文件占用不回退。归档：.artifacts/runs/2026-11-04T09-17-48-864Z-unit。
- 验证：pnpm build交付构建通过（含Node/Web类型检查）；最后产品源码变更已进入构建。
- 验证：新增及更新专项测试ESLint通过；pnpm docs:check通过31文档、207本地链接、15章65步；pnpm maintain、pnpm maintain:check和git diff --check通过。presentation-editing分组列出7个单测文件和5个E2E文件。

## 2026-11-04 · 修复演示录制前输入选择、键盘采集、项目目录与按键主题间距，核实光标重叠和素材删除

记录：[presentation-capture-controls](../../docs/history/entries/2026-11-04-02-presentation-capture-controls.json)；版本：未发布。

- 系统音频独立放在麦克风之前；关闭麦克风以无图标的醒目按钮展示。录制前显示鼠标和按键的独立选择，首帧开始前配置本次采集。
- 预览日志确认按键失败来自展开组件再次加载uiohook-napi时缺少node-gyp-build；改为复用宿主已加载输入单例，不停止全局监听。按键样本沿用实际鼠标位置。
- 项目目录增加真实选择、可写验证与偏好合并保存；新项目使用新目录，已有项目沿原路径保存，不迁移素材。按键样式名称使用独立布局并增加间距。
- 保留用户与其他任务现有未提交修改。光标捕获和删除原因继续通过隔离源码实例核实。
- Windows回收改为独立STA辅助进程调用不带提权标志的IFileOperation，并由进度守卫拒绝不可回收的永久删除；只完成当前选择事务，失败恢复完整素材包并显示系统原因。列表不再触发遗留包回收。
- 原始素材的UI删除登记完整必要任务，等待系统操作或回滚完成后再退出；纯按键事件不再进入光标滤波与自动缩放。预览画布仅在显示录制光标时隐藏悬停系统指针，保留标注手柄。

- 验证：修改前通过context-mode阅读维护流程、改动索引、Bug台账、工具/设置及演示模块文档并核对Git状态。
- 验证：首轮源码E2E：presentation-tracks通过；presentation-recorder因原自动保存说明的布局变化未匹配而失败，已恢复说明，失败归档.artifacts/runs/2026-11-04T07-56-01-302Z-e2e。
- 验证：新专项首轮因仅等待5秒、正文仍在加载而失败；已按组件真实冷启动增加正文就绪等待并补充页面错误记录，失败归档.artifacts/runs/2026-11-04T07-58-31-481Z-e2e。
- 验证：预览日志两次明确记录Cannot find module node-gyp-build；检查预览录制目录普通目录属性与继承权限正常，未改动用户文件。源码隔离临时素材正常回收；不能据此判定原先那次Windows拒绝的具体原因。
- 验证：Windows新回收专项首轮发现PowerShell 5.1以本地代码页读取无BOM脚本，已为脚本添加UTF-8 BOM；原件回滚生效。失败归档.artifacts/runs/2026-11-04T08-05-24-984Z-e2e；随后新接口成功回收及键盘独立录制通过.artifacts/runs/2026-11-04T08-11-09-812Z-e2e。
- 验证：一次测试启动器在任何用例执行前以3221226505退出，保留空输出归档.artifacts/runs/2026-11-04T08-08-12-257Z-e2e；随后残留服务只剩设置端口导致工具页面连接拒绝，结束后从完整源码服务重启通过。
- 验证：8文件41项单测通过.artifacts/runs/2026-11-04T08-17-48-347Z-unit，覆盖目录/设备偏好合并及失败后队列恢复、回收失败恢复、事务隔离和纯按键不推断缩放。新增纯按键回归首次失败，证明建议生成还有独立入口，已补齐该入口过滤并复测通过。
- 验证：5项源码E2E中教程、目录/输入/回收、导入和完整录制通过.artifacts/runs/2026-11-04T08-13-18-765Z-e2e。按键主题间距断言发现13px根字体下gap-3仅9.75px，改用gap-4确保大于10px后专项复测。
- 验证：pnpm typecheck:node、主服务与新增测试ESLint、pnpm docs:check通过；源码专项尚在收尾，构建及预览状态随后补记。
- 验证：最终目录/输入/回收及轨道专项2项通过.artifacts/runs/2026-11-04T08-17-53-819Z-e2e；键盘独立录制没有鼠标位置样本，启用录制光标时预览系统指针样式为none，五组主题间距均大于10 CSS像素。已直接查看插件可见区域截图和控制条截图。
- 验证：真实录制、导入、本地教程沿此前4项通过结果；后续仅改动纯按键建议过滤、主题间距及素材删除必要任务登记，已用对应单测和两项源码专项复测。未为最终生产交付重新打包运行E2E。
- 验证：pnpm docs:check通过31文件207链接及15章65步教程，主服务与新增测试ESLint通过，git diff --check通过；既有ItemGlass.module.css和suites.json行尾归一化提示保留。
- 验证：pnpm build通过宿主Node/Web类型检查、设置构建、演示与工具构建以及Electron生产编译；日志.artifacts/work/presentation-capture-controls-build.log。
- 验证：pnpm maintain与pnpm maintain:check通过，pnpm test:regressions presentation-editing --list确认6个单测文件和4个源码E2E文件。
- 验证：pnpm preview:sync成功更新1.3.0免安装预览并逐文件保留501个现有配置、资料和插件文件，核对104项程序资源；回滚资源.artifacts/backups/preview-sync/update-1793780579535/previous-resources，日志.artifacts/work/presentation-capture-controls-preview-sync.log。
- 验证：pnpm test:preview:resources通过103项程序、345项内置与1687项媒体资源核验，含新增无提权回收脚本及宿主输入桥接；日志.artifacts/work/presentation-capture-controls-preview-verify.log。

## 2026-11-04 · 修复打开其他子组件时常驻工具关闭或正文空白

记录：[temporary-residency-switch](../../docs/history/entries/2026-11-04-01-temporary-residency-switch.json)；版本：未发布。

- 独立工具窗口保存功能码并按路径及功能匹配；其他工具使用自己的页面，同功能无操作重入恢复原窗口。
- 正文WebContents独立保存重入状态，避免其他子组件退出后重进常驻工具时清空状态；Windows隐藏窗口重入先show。
- 补测发现独立窗口快速关闭后延迟聚焦仍读取被Electron清空的view.webContents，修正为捕获所属正文、关闭时取消计时器，隐藏/最小化及销毁后禁止抢焦点。
- 增加临时常驻切换源码E2E及回归组，同步工具规范、架构、Bug台账和更新说明；保留工作区原有未提交内容。

- 验证：修改前默认使用context-mode盘点，阅读维护、改动索引、Bug台账及工具、插件、内存和Agent规范。
- 验证：临时常驻专项源码E2E通过，归档.artifacts/runs/2026-11-04T07-10-11-961Z-e2e。
- 验证：三项联合源码E2E通过，归档.artifacts/runs/2026-11-04T07-11-30-858Z-e2e：常驻切换与正文内部筛选状态、隐藏/最小化及同功能恢复、独立入口、取消常驻不影响新工具，以及原插件单例和工具资源清理。
- 验证：沙箱内第一次源码服务器未就绪，手动取消后使用沙箱外隔离Electron验证；未据此宣称缺陷已复现。
- 验证：相关四文件17项单测通过，归档.artifacts/runs/2026-11-04T07-13-09-717Z-unit；pnpm build通过类型检查及生产构建，日志.artifacts/work/temporary-residency-build.log。
- 验证：代码检查首次指出新测试空fixture参数，改为具名fixture后ESLint通过；pnpm docs:check、pnpm maintain、pnpm maintain:check和git diff --check通过。
- 验证：真实正文补测中常驻专项和工具清理通过，但plugin-host相邻回归捕获独立窗口关闭后的100ms聚焦访问已释放正文，主进程失败退出；失败归档.artifacts/runs/2026-11-04T07-15-13-161Z-e2e保留，已修复待最终复测。
- 验证：首轮预览同步成功，保留493个现有配置、资料和插件文件，核验103项程序资源；补充延迟焦点修复后仍须再次同步。
- 验证：延迟焦点修复后最终三项源码联合E2E全部通过，归档.artifacts/runs/2026-11-04T07-17-39-617Z-e2e；包含真实剪贴板正文、内部筛选状态及独立窗口快速关闭，未放宽原断言。
- 验证：最终pnpm typecheck:node和宿主electron-vite build通过，日志.artifacts/work/temporary-residency-final-host-build.log；最终相关三文件ESLint通过。
- 验证：最终pnpm preview:sync成功，版本保持1.3.0，493个现有配置、资料和插件文件完整保留；核验103项程序资源，回滚资源.artifacts/backups/preview-sync/update-1793776764737/previous-resources。
- 验证：pnpm test:preview:resources通过102项程序、345项内置和1687项媒体资源核验；日志.artifacts/work/temporary-residency-preview.log及temporary-residency-preview-resources.log。已直接查看插件正文截图，真实记录在多次切换后仍可见。

## 2026-10-29 · 修复演示录制同步、启动延迟、双音轨初始化和轨道名称遮挡

记录：[presentation-synchronization](../../docs/history/entries/2026-10-29-03-presentation-synchronization.json)；版本：未发布。

- Windows屏幕与窗口统一使用Chromium捕获，摄像头与麦克风并行准备；无倒计时在设备就绪后立即启动。四路编码在同一任务启动、暂停、恢复与停止，冻结共同录制时长，停止暂停状态不再恢复后追加画面。
- 系统音频和麦克风不再混成单路，分别保存WebM伴随素材；宿主只对显式附属保存放行规定的音频文件名，解码验证并写入零起点元数据，不替换主视频、项目或光标。停止后等待完整素材发布再进入编辑。
- 首次加载自动建立可独立设置、淡入淡出、分割和删除的双音轨；伴随来源查询完成前不提前重复分离内嵌声音。已初始化的路径标记进入项目，迟到音轨补齐，已删除音轨不因重开自动重建。
- 视频提交帧时间驱动摄像头、音频和按键预览；校正阈值收紧至一帧，移除相机首帧人为前移，音频在跳转未完成时不反复重新跳转。预览与导出沿同一时间映射。
- 按用户补图将录屏、系统音频、麦克风名称放在左侧轨道栏，移除缩略图与波形上的重复名称，保留片段无障碍名称和提示。
- 按用户后续要求取消摄像头时间轴轨道、选择联动和分割删除检查器，保留录制、画中画侧栏、素材及旧项目时间映射。
- 同步README、演示模块说明、工具目录、仓库与应用内教程和更新说明，增加TX-108与受限音频保存回归。保留其他未提交工作。

- 验证：修改前使用context-mode阅读维护流程、改动与Bug索引及模块文档，确认并保留已有未提交内容。
- 验证：pnpm test --maxWorkers=2通过111文件766项，归档.artifacts/runs/2026-10-29T11-40-05-025Z-unit；新增保存路径单测及来源初始化单测随后通过，归档.artifacts/runs/2026-10-29T11-49-20-031Z-unit。
- 验证：源码E2E使用preview-main.cjs和隔离data/legacy。首轮录制通过；轨道用例两次因保留已取消摄像头分割断言而失败，已按新交互修正，保留原失败归档。
- 验证：补测两路真实MediaRecorder音频发现音频文件名未获宿主放行，导致完整会话发布失败；补齐受限路径、音频解码校验与零偏移元数据。原失败归档.artifacts/runs/2026-10-29T11-43-25-109Z-e2e保留。
- 验证：导入和轨道源码专项通过，归档.artifacts/runs/2026-10-29T11-40-57-810Z-e2e与11-48-58-091Z-e2e；验证首次双音轨、各自检查器、淡入淡出实际采样、分割、删除、重开不重复、摄像头轨道缺席及实际导出。
- 验证：完整多路录制复测通过.artifacts/runs/2026-10-29T11-51-12-717Z-e2e：无倒计时输入到录制状态436ms；四路编码启动/暂停/恢复/停止跨度0.6/0.4/0.3/2.7ms，视频与相机及双音轨容器时长差小于一帧，光标尾部差12ms，预览帧偏移0ms且暂停GPU绘制增量0。资源回收和实际导出通过。
- 验证：暂停GPU专项原先没有等待相机最终跳转并包含非预览视频，补充只等待当前预览的实际解码状态后保留相同的零绘制断言；未放宽渲染检查。
- 验证：pnpm build通过宿主及设置类型检查与生产构建；最终工具资源编译通过，日志.artifacts/work/presentation-sync-build.log与presentation-sync-final-tools.log。新增文件强制ESLint通过；独立上游严格TypeScript仍存在原有宿主扩展、鉴权与资源类型问题，不能视为全量上游严格检查通过。
- 验证：pnpm docs:check、pnpm maintain、pnpm maintain:check及git diff --check通过；pnpm test:regressions presentation-editing --list确认专项分组。最终包含原生按键事件的复测和预览交付结果在收尾补记。
- 验证：最终3项源码E2E同次全通过，归档.artifacts/runs/2026-10-29T11-53-27-204Z-e2e。包含原生系统按键写入遥测、两路真实MediaRecorder音频、摄像头、共同编码边界及实际导出。最终启动/暂停/恢复/停止跨度0.8/0.5/0.5/2.9ms，无倒计时输入到录制状态437ms，轨迹末尾差4ms，预览帧偏移0ms，暂停GPU绘制增量0。
- 验证：最终来源、设置及路径专项16项通过，归档.artifacts/runs/2026-10-29T11-54-02-261Z-unit；已人工查看直接插件截图，确认名称位于左栏且没有摄像头轨道。
- 验证：最终pnpm build再次通过，日志.artifacts/work/presentation-sync-final-build.log；来源路径改用稳定本地路径以避免重开端口变化重复初始化后，pnpm build:tools及文档、维护校验再次通过。
- 验证：第一次预览同步因用户正在运行免安装预览被同步器安全拒绝，未替换运行中文件；用户明确退出后再次执行pnpm preview:sync成功。保留357个现有配置、资料和插件文件，核验103项程序资源；回滚资源.artifacts/backups/preview-sync/update-1793275237783/previous-resources。
- 验证：pnpm test:preview:resources通过102项程序、345项内置与1687项媒体资源核验，日志.artifacts/work/presentation-sync-preview.log与presentation-sync-preview-resources.log。

## 2026-10-29 · 修复演示录制时长、素材删除、窗口视频及编辑器检查器与滚动交互

记录：[presentation-timeline-repairs](../../docs/history/entries/2026-10-29-02-presentation-timeline-repairs.json)；版本：未发布。

- 摄像头优先录制可补齐时长的WebM，冻结明确停止时刻，附属素材不改写主视频、光标遥测及项目路径；探测真实摄像头时长，默认片段按源长度和偏移显示。更换来源清空旧片段，外观偏好和预设不携带来源时长或片段。
- 原始录制删除改为将库内主文件、摄像头、音频及匹配元数据送到系统回收站，失败回滚；原先仅隐藏的文件重新列出供用户明确删除，不静默追删。删除当前项目先退役自动保存队列并释放来源，避免删除后重建。
- Windows应用窗口改走Chromium直接窗口捕获，避免原显示器裁剪路径漏掉视频窗口内容；屏幕录制仍使用现有原生路径。保留可编辑光标和摄像头异步交接。
- 系统声音和麦克风名称置于轨道条中央；点击原音轨或独立音轨在预览旁打开音频编辑，可调音量、响度归一化、素材起点及淡入淡出，并分割或删除独立音频。摄像头轨道联动打开摄像头设置，移除轨道下方提示。
- 录屏条增加文字标识；片段检查器移除显示原始音轨及片段静音入口，提供分割、复制、前后移动、裁剪、速度和删除；复制保留所属源音频设置。
- 按键显示固定在光标旁的独立侧栏入口，提供简约、苹果、黏土、机械键盘和RGB五种样式及文字/颜色/背景调节；保存、预览和导出共用装饰参数。
- 普通注释只对聚焦、模糊、图片和马赛克显示圆角；模糊和马赛克相邻，去掉数值控件的多余冒号，图片圆角同步Canvas导出。
- 时间轴增加底部横向滚动条，保留Shift+滚轮横移和Ctrl+滚轮缩放；纵向滚动时标尺及游标时间固定可见。异步预览尚未建立播放链时保留提前跳转，避免游标请求丢失。
- 同步README、设置和工具规范、目录、仓库/应用内教程及更新说明；新增TX-107及presentation-editing回归分组，保留工作区原有未提交内容。

- 验证：修改前使用context-mode读取维护流程、改动索引、Bug台账和演示模块文档，并检查Git状态。
- 验证：pnpm test --maxWorkers=2最终通过111文件765项，归档.artifacts/runs/2026-10-29T06-33-53-979Z-unit；来源时长不串入全局偏好新增回归也通过。
- 验证：录制、导入、轨道及本地教程4项源码E2E通过，归档.artifacts/runs/2026-10-29T06-21-24-929Z-e2e。使用preview-main.cjs与隔离data/legacy，未使用electron-builder或build:unpack。
- 验证：实际播放视频窗口、合成摄像头及暂停恢复录制复测通过，归档.artifacts/runs/2026-10-29T06-32-01-673Z-e2e中的recorder：采样帧非黑且画面变化、帧率大于15、摄像头加偏移与主视频差小于150ms，光标预览/导出与退出回收通过。
- 验证：同次tracks复测因预览播放链异步初始化前的跳转被丢弃而失败，原失败归档保留；补齐提前跳转保留和游标位置断言后最终通过，归档.artifacts/runs/2026-10-29T06-37-18-159Z-e2e。覆盖音频实际采样、短摄像头时长/分割/重开、RGB导出像素、图片圆角透明像素、场景效果、真实纵向滚轮及横移、删完项目等待自动保存后不重建和素材实际路径消失。
- 验证：pnpm build通过宿主Node/Web、设置类型检查及生产编译，日志.artifacts/work/presentation-repairs-build.log；新增两个检查器的强制ESLint通过。独立上游严格TypeScript检查仍有既有宿主扩展API、翻译Pick和资源声明问题，未视作全量上游严格检查通过。
- 验证：pnpm test:regressions presentation-editing --list确认回归命令；文档按当前行为人工审校，自动文档与维护检查及最终资源交付结果在收尾补记。
- 验证：最后播放链跳转修正后pnpm build:tools通过，日志.artifacts/work/presentation-repairs-final-tools.log。pnpm docs:check通过31文档、207链接、39功能/14分类/30普通入口、15章65步；pnpm maintain与pnpm maintain:check通过，git diff --check无错误。
- 验证：pnpm preview:sync成功，保留496个现有配置、资料和插件文件，核验103项程序文件；程序资源备份.artifacts/backups/preview-sync/update-1793256120881/previous-resources。pnpm test:preview:resources通过102项程序、345项内置和1687项媒体资源核验；日志.artifacts/work/presentation-repairs-preview-sync.log及presentation-repairs-preview-verify.log。

## 2026-10-29 · 撤销上一模型改动后重做演示录屏按键、独立素材轨道与场景注释

记录：[presentation-independent-tracks](../../docs/history/entries/2026-10-29-01-presentation-independent-tracks.json)；版本：未发布。

- 撤销上一模型对7个既有文件和新增标尺、未完成条目的改动，保留此前大量未提交内容；撤销前补丁存于.artifacts/work。
- 录制时在控制条开启“按键”，可显示和记录当前会话的物理按键；编辑器点击“添加录制按键”生成可移动、裁切和改字的片段。系统声音与麦克风点击“音频独立编辑”后可分别移动、裁切、分割、静音及设置素材起点和淡入淡出；摄像头素材直接显示为独立轨道，支持拖动、两端裁切、游标处分割和删除。时间轴提供自适应标尺与可键盘微调的时间游标。注释增加聚焦、马赛克和圆角，模糊仅调强度。

- 验证：新源码专项首次因读取早于自动保存而失败，补充轮询保存完成后通过，归档.artifacts/runs/2026-10-29T03-45-09-477Z-e2e；实际音频源起点和淡入淡出采样、注释像素、双音轨/人像分割、按键及项目重开通过。
- 验证：pnpm build:tools通过；专项类型检查仅报告资源声明与已有宿主扩展类型缺失，正在补齐检查配置。
- 验证：pnpm test --maxWorkers=2通过111文件763项，归档.artifacts/runs/2026-10-29T03-54-28-124Z-unit。
- 验证：导入、真实录制及新轨道3项源码E2E全部通过，归档.artifacts/runs/2026-10-29T03-50-23-032Z-e2e；后置维护因本轮Bug台账格式错误退出1，修正JSON后后续源码专项和维护归档均通过，不掩盖原退出结果。
- 验证：最终补充实际WebGL马赛克预览采样通过，归档.artifacts/runs/2026-10-29T03-58-06-941Z-e2e，直接截取插件可见区域；测试在同一项目连续重开时存在时序问题，改用独立效果项目并等待媒体就绪，未降低像素断言。
- 验证：新增5个模块强制ESLint通过（关闭上游格式差异规则）；pnpm docs:check通过31文档、207链接、39功能/14分类/30普通入口和15章65步。专项严格TypeScript只余两处原有getTabDoSettings/openTabDoShortcuts宿主API声明缺失，未视作全项目类型检查通过。
- 验证：最终源码专项通过，归档.artifacts/runs/2026-10-29T04-02-14-806Z-e2e；涵盖实际WebGL马赛克像素、重叠注释选中后拖动不轮换选区、双音轨和人像分割、按键编辑、重开、离屏音频采样与三种场景效果。
- 验证：pnpm build完整通过宿主Node/Web及设置类型检查、桥接和生产编译，日志.artifacts/work/presentation-tracks-build.log；最后注释拖动修正后pnpm build:tools通过，日志.artifacts/work/presentation-tracks-final-tools.log。未使用electron-builder或build:unpack执行E2E。
- 验证：首次preview:sync因免安装预览运行而按保护规则退出；用户正常退出后再次同步成功，保留438个现有配置、资料和插件文件，核验103项程序文件；备份.artifacts/backups/preview-sync/update-1793246688303/previous-resources。
- 验证：pnpm test:preview:resources通过102项程序、345项内置和1687项媒体资源核验；日志.artifacts/work/presentation-tracks-preview-sync.log与presentation-tracks-preview-verify.log。

## 2026-10-28 · 改进演示编辑器折叠设置、人像尺寸、原始音频和圆角裁剪

记录：[presentation-editing-controls](../../docs/history/entries/2026-10-28-08-presentation-editing-controls.json)；版本：未发布。

- 高级由右上角开关改为普通选项后的可展开标题，分分类记住当前会话展开状态；右上角统一当前分类重置，移除正文重复重置，人像重置保留素材及同步范围。
- 旧默认运动偏好首次升级为平滑，重置缩放直接恢复平滑；已有项目和保存的外观预设继续保留明确的效果参数。
- 人像增加整体比例缩放、保持宽高比例和独立宽高；手动尺寸保存显式模式，避免被旧裁剪比例自动匹配覆盖，预览和两套导出器一致。
- 系统声音和麦克风原始音轨默认显示，片段提供显示/隐藏入口；升级旧项目的默认隐藏标记，并通过版本保留新版主动隐藏选择，不改变混音和原始素材。
- 新增独立背景圆角，贯通偏好、项目、预设、预览和各导出链；最终画面统一圆角遮罩，原生像素导出同样读取遮罩结果，不支持该效果的静态快速路径转回帧渲染，所属中间画布结束即释放。
- 裁剪弹窗采用紧凑布局和底部操作区，支持八向手柄、整体移动、正反向重新框选、自由/原始和常用比例；取消恢复原范围。裁剪画布只在媒体帧变化时刷新，不使用暂停时的永久动画循环。
- 同步README、组件说明、设置规范、工具清单、仓库与应用内教程、更新说明、Bug台账和TX-105；扩展演示设置持久化及几何单测和真实源码交互回归。

- 验证：通过context-mode核对维护、改动及Bug索引与模块规范，检查Git状态，保留前轮及其他未提交修改。
- 验证：presentation-import最终扩展专项通过，归档.artifacts/runs/2026-10-28T08-37-26-093Z-e2e中的该项；真实伴随system/mic WAV自动显示、隐藏恢复、实际MP4包含音频且PCM能量大于静音阈值，人像独立宽高与整体缩放、右上角重置保留素材、独立圆角和输出角像素、八手柄/移动/比例/反向框选/取消恢复，以及项目重开和窗口尺寸通过。
- 验证：更新后的local-tutorial通过，归档.artifacts/runs/2026-10-28T08-34-40-761Z-e2e中的该项；所有源码专项均由scripts/preview-main.cjs、源码设置/工具服务和两处隔离资料根执行，不为E2E打包或读取真实预览资料。
- 验证：前轮裁剪手柄指针取点早于弹窗动画结束，改为等待动画与稳定正文并在可见手柄内取点；相邻录制测试的高级断言从checkbox更新为aria-expanded，并等待光标正文后点击，避免操作仍在离场的旧分类。另一次来源菜单未出现的瞬时失败保留证据，不据此改动录制捕获链。
- 验证：9项演示设置及裁剪几何单测、5项文档单测通过，归档.artifacts/runs/2026-10-28T08-36-14-293Z-unit；覆盖偏好升级、已有项目选择、原始音轨可见性版本、独立圆角、八向几何、移动边界和反向比例框选。
- 验证：新增或重写的高级、裁剪、几何和圆角输出模块强制ESLint通过，测试与教程源ESLint通过；47个已修改TypeScript文件语法盘点零错误。查看直接捕获的插件可见区域裁剪截图，确认紧凑布局、八手柄和双音轨，未拼接宿主画面。
- 验证：pnpm docs:check通过31份文档、207本地链接、39功能/14分类/30普通入口及15章65步，presentation-recorder分组确认11个单测文件与4个源码E2E文件。
- 验证：最终presentation-recorder专项通过，归档.artifacts/runs/2026-10-28T08-40-10-439Z-e2e；真实选择来源、录制、运动效果保存、实际导出、文件重开、底部高级展开及所属窗口/端口回收通过。与最终presentation-import和更新后的local-tutorial合计三项源码流程均通过，原始失败证据保留。
- 验证：最终pnpm test --maxWorkers=2通过110文件760项，归档.artifacts/runs/2026-10-28T08-42-18-480Z-unit；测试与教程源ESLint、格式检查及git diff --check通过。
- 验证：pnpm build完整通过宿主Node/Web与设置类型检查、桥接及全部生产编译，日志.artifacts/work/presentation-round2-build.log；保留已有pnpm配置、PostCSS、动态/静态混合导入和大chunk提示，未执行electron-builder或build:unpack。
- 验证：首次preview:sync因预览仍运行而按保护规则拒绝替换，用户明确确认退出后继续；成功更新固定免安装预览1.3.0，415个现有配置、资料和插件文件逐文件保留，103项程序文件核验，回退副本.artifacts/backups/preview-sync/update-1793177103519/previous-resources。日志.artifacts/work/presentation-round2-preview-sync.log。
- 验证：pnpm test:preview:resources通过102项程序、345项内置及1687项媒体运行资源核验，日志.artifacts/work/presentation-round2-preview-verify.log；未重置配置、资料或插件，未push、云端构建或发布Release。

## 2026-10-28 · 整理演示编辑器设置与高级选项，支持预览拖放摄像头

记录：[presentation-settings](../../docs/history/entries/2026-10-28-07-presentation-settings.json)；版本：未发布。

- 主页设置移除动态效果分类和通用中的快捷键入口，自动为新录制应用缩放归入通用；连接缩放归入选中缩放片段后的设置，缺省继续开启。
- 缩放页的动画改为普通选项运动效果，以平滑/专注二选一替代经典动画开关，缺省平滑；只调整缩放时长，不覆盖独立光标参数。读取旧经典开关时转为现行运动效果，保留已保存时长。
- 场景、光标、字幕及摄像头高级选项集中在普通内容下方，移除没有高级内容的缩放页开关。
- 摄像头预览接入直接指针拖放，保留抓取偏移，暂停当前帧后定位，按预览缩放换算并限制边界；取消或丢失捕获回滚，卸载释放捕获。移除九宫格，精确坐标保留在高级；人像画面圆角缺省100%并归入高级。
- 项目归一化不再强制套用整套运动预设，仅补缺失参数，保留已有连接选择、独立光标和人像参数；自由位置沿现有项目与导出链保存。
- 同步组件说明、README、设置规范、工具清单、仓库与应用内教程和更新说明；增加Bug台账、TX-104与演示设置持久化单测，纳入presentation-recorder分组。

- 验证：通过context-mode核对维护流程、改动与Bug索引及工具、设置文档，检查Git状态并保留全部已有未提交修改。
- 验证：最终pnpm test:e2e tests/e2e/presentation-import.spec.ts tests/e2e/presentation-recorder.spec.ts tests/e2e/local-tutorial.spec.ts三项通过，归档.artifacts/runs/2026-10-28T07-42-21-808Z-e2e；使用scripts/preview-main.cjs、源码工具/设置服务及两处隔离资料根，未为E2E打包。
- 验证：源码交互验证通用选项及删除入口、默认连接/平滑与专注保存、摄像头真实预览指针拖放、越界钳制/取消回滚、项目重开坐标保留、100%高级圆角，以及光标/字幕/场景普通内容顺序稳定且高级统一在下部。真实录制、运动效果落盘、导出、文件重开与退出回收通过。
- 验证：前几轮测试分别暴露HeroUI原生range使用value而非aria-valuenow、中文标签应为水平位置/垂直位置，以及页面离场动画尚未结束时读取了旧正文；修正测试为真实属性、精确标签和稳定正文后最终通过。失败证据保留于.artifacts/runs/2026-10-28T07-35-39-100Z-e2e、2026-10-28T07-37-21-330Z-e2e、2026-10-28T07-40-46-593Z-e2e。
- 验证：查看直接捕获的插件WebContents可见区域截图，确认拖动后人像实际位置、普通摄像头设置与移除九宫格，未拼接宿主画面。
- 验证：最终pnpm test --maxWorkers=2通过110文件755项，归档.artifacts/runs/2026-10-28T07-44-56-796Z-unit；新增四项覆盖缺省平滑/连接/100%圆角、专注与独立光标参数保留、旧经典开关退役，以及自由坐标/零圆角保存和导出参数及分辨率换算。
- 验证：新增拖放Hook通过强制ESLint及独立严格TypeScript检查，修改测试、Vitest别名与教程源ESLint通过；初次类型检查因未配置上游路径别名失败，改用.artifacts/work中的专项配置后通过。presentation-recorder回归分组确认11个单测文件和4个源码E2E文件。
- 验证：pnpm docs:check通过31份文档、207本地链接、39功能/14分类/30普通入口及15章65步；pnpm maintain与pnpm maintain:check通过。
- 验证：pnpm build完整通过宿主Node/Web及设置类型检查、演示桥接、设置/工具/宿主生产编译，日志.artifacts/work/presentation-settings-build.log；保留已有pnpm配置迁移、PostCSS、动态/静态重复导入及大chunk提示。未运行electron-builder或build:unpack。
- 验证：pnpm preview:sync成功同步固定免安装预览1.3.0，382个现有配置、资料和插件文件逐文件保留，103项程序文件核验；回退资源.artifacts/backups/preview-sync/update-1793173640773/previous-resources，日志.artifacts/work/presentation-settings-preview-sync.log。
- 验证：pnpm test:preview:resources通过102项程序、345项内置及1687项媒体运行资源核验，日志.artifacts/work/presentation-settings-preview-verify.log。未启动真实预览写入测试资料，未重置数据，未push、云端构建或发布Release。

## 2026-10-28 · 以安全闲置与重开体验联合优化内存，并固化开发规范

记录：[memory-experience-policy](../../docs/history/entries/2026-10-28-06-memory-experience-policy.json)；版本：未发布。

- 新增docs/memory-development.md作为内存与重开体验规范，AGENTS、开发指南、架构、工具、设置、插件和测试文档统一引用；明确无任务/无临时常驻闲置范围、两种内存口径、真实释放、任务与数据保护及重开基准。
- 完全闲置后解除AppsAPI与PluginLifecycleAPI两处启动输入，以及已持久化匹配内存副本；上次匹配改为按需读取，初始化不再提前装载历史图片。保留指令索引和用户持久资料。
- 启动准备与无页面操作纳入活动计数，结束才允许清除参数；数据库返回错误或抛异常时保留未保存的唯一匹配副本，诊断日志不再序列化完整启动或匹配正文。
- 闲置先释放宿主引用，Windows工作集低于100MB时跳过冷页回收；其他平台同样执行宿主引用清理。修复同步完成的回收器仍被控制器持有的问题。
- 扩展idle-memory联合专项：实际16MiB连续启动输入、已保存匹配恢复、设置热重开/回收后重开各三次及演示控制条初次/热/回收后重开；新增idle-input-state覆盖真实数据库容量错误及尚无页面的异步启动保护。

- 验证：通过context-mode核对维护流程、改动索引、Bug台账及工具、设置、插件、性能文档，检查Git状态并保留既有改动。
- 验证：idleMemoryReclaimer七项单测和Node类型检查通过，归档.artifacts/runs/2026-10-28T06-15-39-395Z-unit；包括低于预算仍解除引用但不启动辅助进程、同步完成释放和原有活动/退出保护。
- 验证：首次联合源码专项因16MiB匹配夹具超过现有1MiB数据库文档上限而在恢复断言失败，归档.artifacts/runs/2026-10-28T06-19-00-543Z-e2e。由此确认dbPut可返回错误而不抛异常，补上成功结果判定；匹配夹具遵守现有限制，大启动输入独立分配并核对释放，未放宽数据库上限。
- 验证：最终idle-memory源码专项通过，归档.artifacts/runs/2026-10-28T06-23-39-462Z-e2e。必要任务期间两处启动引用各16,777,238字符、匹配缓存349,550字符；35秒及65秒三处引用均归零，持久匹配恢复和隔离资料读写正常。
- 验证：最终同实例设置热重开三次789.021/801.085/777.483ms，中位数789.021ms；回收后732.307/806.221/748.402ms，中位数748.402ms，通过3000ms绝对及相对容差。演示控制条初次11,179.405ms包含Vite冷编译，热重开2395.838/2377.670ms，回收后2318.183ms；这些是阶段比较，不宣称相对旧版本的性能提升。
- 验证：本机源码全应用工作集：设置闲置15秒25.842MB，录屏和工具退出后35秒46.678MB、65秒53.142MB。对应私有提交536.916/551.547/550.715MB，仍未达到100MB；65秒Browser/GPU/Tab/网络/音频分别约189.927/254.652/75.166/17.977/12.993MB。新增大输入夹具和开关次数与前轮不同，不把两轮私有提交直接当成优化前后收益。
- 验证：五项源码安全回归通过，归档.artifacts/runs/2026-10-28T06-27-06-043Z-e2e：idle-input-state、clipboard-interactions、settings-window-stability、third-party-lifecycle、tools-lifecycle。覆盖真实数据库返回失败保留、启动等待12秒保护、完成后解除引用和匹配恢复，临时常驻隐藏、跨窗口拖放、第三方/Provider必要任务及设置重开。
- 验证：全量109文件751项单测通过，归档.artifacts/runs/2026-10-28T06-29-27-266Z-unit；修改范围ESLint通过，idle-memory回归组确认6个单测文件及5个源码E2E文件。
- 验证：pnpm run build完整通过Node/Web/设置类型检查及全部生产编译，日志.artifacts/work/memory-experience-build.log；保留已有pnpm配置迁移、PostCSS和大chunk提示。构建仅用于本地交付，E2E始终直接加载源码，未运行electron-builder或build:unpack。
- 验证：pnpm docs:check通过31份文档、207个本地链接、39功能/14分类/30普通入口及15章65步；pnpm maintain、pnpm maintain:check和git diff --check通过。
- 验证：pnpm preview:sync完成固定免安装预览更新：360个现有配置、资料与插件文件逐文件保留，103项程序文件核验，版本仍为1.3.0；回退副本.artifacts/backups/preview-sync/update-1793169184108/previous-resources。
- 验证：pnpm test:preview:resources通过102项程序、345项内置资源及1687项媒体运行资源核验；收尾再次通过pnpm maintain、pnpm maintain:check、pnpm docs:check与git diff --check。

## 2026-10-28 · 图片标记二级图标、独立参数记忆与文字字号修复

记录：[mosaic-option-icons](../../docs/history/entries/2026-10-28-05-mosaic-option-icons.json)；版本：未发布。

- 马赛克二级选项全部采用截图式图标：模式为涂抹轨迹/矩形，浓度为2×2/3×3/4×4棋盘格，笔刷大小为圆点；移除浓度文字及下拉框，保留title、aria-label和选中态。二级参数区附着浅灰竖线与主工具分隔，内部细线区分三组，窄窗口换行不孤立分隔线。
- 各标记工具在当前独立窗口分别保留颜色、笔触和字号，切换恢复自己的选择；马赛克模式、浓度和半径独立保留。取消普通工具共用penColor和笔触的状态，不新增持久配置，清空标记继续保留本次工具参数。
- 文字二级选项改为16/24/36像素的三枚不同大小A图标，隐藏无效的笔触圆点；编辑期间调整字号保留输入焦点和正文，同步输入框、图片缩放及最终画布文字。普通配色二级区域也加浅灰主次分隔。
- 同步工具/悬浮来源规范、应用内及仓库教程、更新说明、Bug台账和TX-102/103回归；复用既有源码交互专项验证图标、独立参数、字号及实际绘制/复制路径。

- 验证：使用context-mode对照维护流程、当前改动/Bug索引、工具与悬浮规范和原生DrawMosaicPopup，保留所有既有未提交改动。
- 验证：pnpm test:e2e tests/e2e/image-annotation-interactions.spec.ts tests/e2e/tools-polish.spec.ts tests/e2e/local-tutorial.spec.ts：最终3项通过，归档.artifacts/runs/2026-10-28T05-57-58-886Z-e2e。保持scripts/preview-main.cjs、源码设置/工具服务和两处隔离资料根，不读取正式或免安装预览资料。
- 验证：追加真实36px导出检查后专项1/1通过，归档.artifacts/runs/2026-10-28T06-00-09-554Z-e2e。先分别设置矩形、椭圆、箭头、画笔、荧光笔、序号、橡皮擦和文字，再逐一返回确认颜色及笔触/字号恢复；马赛克图标直接选浓度、默认/340px窄窗口、无可见参数文字/下拉框、浅灰竖线、连续涂抹、框选、撤销、透明文字、焦点、缩放和复制像素均通过。
- 验证：文字专项确认没有笔触圆点，三枚A按钮分别改变真实16/24/36px输入框，修改字号仍保留焦点和正文；50%缩放后18px输入对应原图36px，最终画布绿色字形实际高度大于28像素，避免只改变输入框而仍以24px导出。
- 验证：第一轮因非整数DPI将1px边框吸附为0.727273 CSS像素导致过严断言失败，归档.artifacts/runs/2026-10-28T05-48-45-242Z-e2e；改为验证可见细线和正确颜色。独立参数及字号修复后，旧tools-polish仍在文字工具点击已隐藏的笔触圆点而失败，归档.artifacts/runs/2026-10-28T05-55-58-262Z-e2e；按新交互先切序号再选笔触，保留原有绘制验证，最终通过。
- 验证：直接查看独立WebContents的默认/窄马赛克工具栏和independent-font-options截图，确认图标、浅色竖线、三档A字号及最终大字号字形；截图等待选中态短过渡及正文两帧完成，避免把过渡中的旧工具高亮当作最终显示。未拼接宿主截图。
- 验证：pnpm test tests/scripts/documentation.test.ts：5项通过，归档.artifacts/runs/2026-10-28T06-01-00-771Z-unit。修改JS按JSDoc脚本规则强制ESLint（关闭TS显式返回类型规则），测试与教程源ESLint、Prettier、node --check及git diff --check通过。pnpm docs:check保持30份文档、193本地链接、39功能/14分类/30入口和15章65步；README与工具清单当前描述仍准确。
- 验证：pnpm build:setting通过设置类型检查及生产编译，日志.artifacts/work/mosaic-option-icons-setting-build.log。工具画布为静态资源，由同步器直接复制；未修改其他生产编译源码，未为E2E打包或运行electron-builder。
- 验证：pnpm maintain及pnpm maintain:check通过；同步器第一次检测到预览仍运行而安全中止，用户随后明确确认已退出，再继续程序资源同步。
- 验证：用户确认退出后，pnpm preview:sync成功更新固定免安装预览1.3.0，359个已有配置、资料及插件文件逐项完整保留，103项程序文件核验；回退资源.artifacts/backups/preview-sync/update-1793167395397/previous-resources，日志.artifacts/work/mosaic-option-icons-preview-sync.log。
- 验证：pnpm test:preview:resources通过102项程序、345项内置及1687项媒体运行资源核验，日志.artifacts/work/mosaic-option-icons-preview-verify.log。未启动真实预览写入测试资料，未重置配置或插件，未push、云端构建或发布Release。最终pnpm maintain、pnpm maintain:check、pnpm docs:check与git diff --check通过。

## 2026-10-28 · 对齐截图的图片箭头、马赛克和透明文字输入交互

记录：[image-annotation-interactions](../../docs/history/entries/2026-10-28-04-image-annotation-interactions.json)；版本：未发布。

- 图片箭头沿用截图的渐宽箭身和内凹机翼几何，按用户本轮追加要求把箭尾收成单一尖点，去掉平切端面；保留短箭头长度钳制与连接抗锯齿重叠、颜色、笔触、撤销和导出。
- 马赛克增加笔刷/框选两种模式、轻中重三档浓度及小中大三档独立半径。统一按原图低分辨率采样，通过连续圆形/胶囊路径及矩形并集揭示，快速划动无离散落点空隙；浓度统一更新已有马赛克，笔刷半径属于各次历史。
- 马赛克笔落点显示白边深色虚线圆圈及中心准星，尺寸随图像缩放；框选期间显示参考边界，取消、离开、切换及退出撤下，两者不写入导出画布。仅保留一份低分辨率采样，浓度切换、清空和退出释放。
- 文字输入透明底，边框、正文及插入光标跟随所选颜色，按原图落点与缩放定位并随内容伸展。编辑期间改色保留焦点和正文；回车提交、Esc取消，输入法候选Enter/Esc不提交标记或关闭窗口。
- 同步开发/悬浮/覆盖层规范、来源说明、仓库及应用内教程和更新说明，透明文字预览按用户明确要求替代旧不透明规则；增加TX-101和源码交互专项，纳入annotations分组及Bug台账。

- 验证：通过context-mode依次核对维护、当前改动及Bug索引、工具和悬浮规范，对照固定截图源码的箭头多边形、MosaicBlitRect/蒙版/圆圈光标及透明文字边框；保留全部既有未提交改动。
- 验证：pnpm test:e2e tests/e2e/image-annotation-interactions.spec.ts tests/e2e/tools-polish.spec.ts tests/e2e/local-tutorial.spec.ts：3项通过，归档.artifacts/runs/2026-10-28T05-09-37-716Z-e2e。新增专项直接通过真实图片标记命令进入独立窗口，并使用scripts/preview-main.cjs、源码服务及两处隔离资料根。
- 验证：补充输入法Esc候选取消不得冒泡关闭窗口后，专项再次1/1通过，归档.artifacts/runs/2026-10-28T05-11-11-475Z-e2e。覆盖机翼箭头关键像素、快速笔刷无孔、半径圆圈、浓度色块变化、反向框选/空区域/指针取消、撤销重做、指示不入画布PNG、编辑改色保留焦点及正文、50%缩放定位及12px字号、透明底/边框/光标颜色、文字取消和复制像素一致、340px窄窗口参数不越界、关闭释放。
- 验证：首轮箭头测试把外侧抗锯齿边界当作机翼内部像素而失败，归档.artifacts/runs/2026-10-28T05-06-41-258Z-e2e保留；依据实际几何将采样移到机翼内部后通过，未改变箭头实现。原有tools-polish在首轮和最终轮均通过。
- 验证：直接查看独立WebContents当前可见区域的arrow-wing-style、mosaic-brush-cursor、transparent-colored-text-input截图，确认箭头、圆圈与真实覆盖、透明文字框及控件布局；没有拼接宿主截图。
- 验证：pnpm test tests/main/screenCaptureResult.test.ts tests/scripts/documentation.test.ts：2文件9项通过，归档.artifacts/runs/2026-10-28T05-11-48-182Z-unit；pnpm test:regressions annotations --list确认1单测文件及3个E2E文件。本轮未修改截图原生模块，不重编译或重复运行原生长截图专项。
- 验证：资源JavaScript通过node --check，并按仓库JSDoc脚本规则强制ESLint（关闭仅适用于TS语法的显式返回类型规则）；新增测试和教程源ESLint、资源及测试Prettier通过。pnpm docs:check通过30份文档、193个本地链接、39功能/14分类/30普通入口及15章65步。README与工具清单现有描述仍准确。
- 验证：pnpm build:setting通过设置类型检查及生产构建，日志.artifacts/work/image-annotation-interactions-setting-build.log；静态画布资源由同步器直接复制，未修改其他生产编译源码。同步器检测到免安装预览仍在运行，依照退出后替换资源规则未执行替换；待用户退出后继续，不清空资料。
- 验证：用户追加指出箭尾不够尖锐后，将图片箭身由平切四边形改成从单一顶点展开的三角形，保留截图机翼头和箭身渐宽。新增起点附近像素断言，专项1/1通过，归档.artifacts/runs/2026-10-28T05-14-22-380Z-e2e；直接查看arrow-wing-style截图确认尖尾，最终资源JS与测试ESLint通过。
- 验证：用户确认已退出预览后，pnpm preview:sync成功更新1.3.0：352个已有配置、资料与插件文件逐项完整保留，103项程序文件核验；回退资源.artifacts/backups/preview-sync/update-1793164558825/previous-resources，日志.artifacts/work/image-annotation-interactions-preview-sync.log。
- 验证：pnpm test:preview:resources通过102项程序、345项内置及1687项媒体运行资源核验，日志.artifacts/work/image-annotation-interactions-preview-verify.log。未启动预览写入测试数据，未重置资料，未push、云端构建或发布Release。收尾pnpm maintain、pnpm maintain:check、pnpm docs:check与git diff --check通过。

## 2026-10-28 · 统一图片标记与截图标记工具栏，新增序号圆圈和聚光灯

记录：[unified-annotations](../../docs/history/entries/2026-10-28-03-unified-annotations.json)；版本：未发布。

- 图片标记工具栏改为截图的白底、深灰细线图标、浅蓝选中态与32px按钮；九项标记的顺序和SVG共用annotation-tools.js，荧光笔和箭头图标重绘，图片橡皮擦、五档笔触和缩放保留。
- 截图补充独立颜色的半透明荧光笔，保留既有箭头；两个入口都加入单击递增的序号圆圈和多矩形聚光灯。序号属于撤销历史，撤销后分叉与清空正确续号；聚光灯按并集保留亮度，预览、复制和保存同源。
- 原生截图采用固定上游提交的可重现补丁，将新增类型接入输入、几何、命中、历史和PNG合成；聚光灯同时完整失效窗口显示区域，修复BeginPaint局部裁剪造成的预览残影，所有资源仍随单次工作进程释放。
- 同步README、更新说明、应用内与仓库教程、工具/悬浮开发规范及原生来源说明；新增annotations回归组和TX-100，更新Bug台账。

- 验证：使用context-mode核对维护流程、当前改动与Bug索引、工具及悬浮窗口规范，检查main分支和已有未提交改动并予以保留。未push、云端构建或发布Release。
- 验证：原生模块使用GCC11.2、Electron42.1.0头文件及node-addon-api6.1.0完成独立编译，固定上游提交8b221e72c4b5462ba2c9b490370cc10df72108cc；最终日志.artifacts/logs/native-screenshot-build.log。未为E2E执行electron-builder或build:unpack。
- 验证：pnpm test tests/main/screenCaptureResult.test.ts tests/scripts/documentation.test.ts：2文件9项通过，归档.artifacts/runs/2026-10-28T04-40-45-875Z-unit。
- 验证：pnpm test:e2e tests/e2e/tools-polish.spec.ts tests/e2e/tools-screenshot.spec.ts tests/e2e/local-tutorial.spec.ts：最终3项全部通过，归档.artifacts/runs/2026-10-28T04-40-56-873Z-e2e。使用scripts/preview-main.cjs、源码服务及两个隔离资料根，不访问正式或免安装预览资料。
- 验证：图片窗口验证9项标记、默认/340px窄窗口、颜色隔离、文字输入、序号递增/撤销/重做/分叉、反向聚光区域及重叠并集、空拖动、剪贴板与保存PNG逐像素一致、独立窗口关闭；教程由真实关于入口阅读，离线与升级配置插件保留通过。
- 验证：原生截图通过真实系统鼠标操作荧光笔、两枚序号及反向和重叠聚光区域，同时检查实际屏幕预览与最终复制PNG：区域外RGB107/108/110、区域内与重叠区244/247/251、荧光笔246/237/191。长截图数万像素连续色带及工作进程回收继续通过。
- 验证：早期两次原生测试因系统鼠标轮询先于移动处理而未可靠切换工具，失败归档04-31-58和04-33-27保留；加入鼠标到位等待后功能检查通过。随后直接查看截图发现局部预览残影，补全原生完整显示失效，并新增屏幕像素断言；最终源码专项通过。
- 验证：直接查看独立图片窗口默认/窄窗口截图和原生截图预览、导出PNG，确认线图标、序号及聚光区域；未拼接宿主截图。修改脚本和测试ESLint、资源JS语法检查、pnpm docs:check及git diff --check通过。
- 验证：pnpm build:setting通过设置页类型检查及生产构建，日志.artifacts/work/annotations-setting-build.log；共享静态画布资源和原生.node由同步器直接复制，本轮未修改宿主或内置工具的编译源码，沿用既有已编译产物。
- 验证：pnpm maintain、pnpm maintain:check通过后执行pnpm preview:sync，用户已确认自行退出预览。1.3.0程序资源更新成功，345个现有配置、资料与插件文件逐项保留，103项程序文件核验；回退资源.artifacts/backups/preview-sync/update-1793162677243/previous-resources，日志.artifacts/work/annotations-preview-sync.log。
- 验证：pnpm test:preview:resources通过：102项程序文件、345项内置文件及1687项媒体运行文件，包含物理展开的annotation-tools.js和更新的tabdo_screenshot.node；日志.artifacts/work/annotations-preview-verify.log。未启动真实免安装预览读写用户资料，未重置配置或插件。
- 验证：补充清空已有序号后回到1且撤销按钮禁用的真实画布断言，pnpm test:e2e tests/e2e/tools-polish.spec.ts再次1/1通过，归档.artifacts/runs/2026-10-28T04-46-03-155Z-e2e；该次仅补测试，不改变已同步程序资源。最终修改范围ESLint与格式检查通过，pnpm maintain、pnpm maintain:check、pnpm docs:check及git diff --check全部通过。

## 2026-10-28 · 继续排查演示录屏、设置及其他子组件退出后的内存，验证100MB闲时目标

记录：[idle-memory-budget](../../docs/history/entries/2026-10-28-02-idle-memory-budget.json)；版本：未发布。

- Windows新增事件驱动的闲置回收：全部窗口、工具页与任务结束后等待10秒，一次性归还本应用冷工作集；活动恢复撤销等待和所属辅助进程，不做周期性压缩。
- 媒体处理、快速录屏、演示运行时、内置提供商及原生截图/取色登记活动与最终收尾；隐藏必要任务页和临时常驻会话同样阻止回收，不改变保存、导出或全局剪贴板采集。
- 辅助进程就绪后重新检查活动与当前Electron进程清单，使用进程句柄和创建时间防止PID复用；15秒超时，完成后解除进程与监听引用，失败不会伪报成功。
- 扩展idle-memory回归，分别记录全应用工作集和私有提交量，覆盖设置三次开关、真实录屏、编辑器三次开关、三个日常工具、必要任务保护、35/65秒闲置及设置重开读写。
- 同步生命周期、设置和性能文档、未发布说明、Bug台账与TX-98回归分组。

- 验证：修改前通过context-mode检查维护规范、历史、模块文档和Git状态，已有未提交改动全部保留。
- 验证：本轮初始源码idle-memory通过，归档.artifacts/runs/2026-10-28T03-44-26-236Z-e2e；35秒闲置全部Electron进程工作集689.369MB，私有提交479.957MB，仅剩宿主一页。
- 验证：首轮策略源码idle-memory通过，归档.artifacts/runs/2026-10-28T03-47-12-178Z-e2e；35秒全应用工作集43.266MB，私有提交480.412MB，说明收益来自冷工作集归还，不能宣称分配提交量已低于100MB。
- 验证：扩展专项通过，归档.artifacts/runs/2026-10-28T03-49-43-969Z-e2e；设置三次开关后24.396MB，真实录屏和三个工具退出后35秒45.515MB；65秒及重开设置读写断言通过，必要任务未结束时没有回收。最终增加各宿主运行时活动门槛后正在复验。
- 验证：首次单测因PS1资产被Vite作为JS解析而失败，归档.artifacts/runs/2026-10-28T03-46-38-634Z-unit；改为与打包策略一致的物理资源路径，避免运行时依赖测试专用资产转换。
- 验证：全量109文件749项单测通过，归档.artifacts/runs/2026-10-28T03-53-18-986Z-unit。新增5项覆盖事件合并、重新活动、旧完成回调隔离、隐藏任务/原生进程阻止、就绪重检、PID参数和15秒超时。
- 验证：修改范围ESLint、Node类型检查及git diff --check通过；pnpm docs:check通过30份文档、193个本地链接、39功能/14分类/30普通入口和15章65步。pnpm test:regressions idle-memory --list确认6个单测文件与4个E2E文件。
- 验证：最终7项源码回归全部通过，归档.artifacts/runs/2026-10-28T03-53-54-368Z-e2e：idle-memory、native-shutdown、presentation-import、presentation-recorder、settings-window-stability、third-party-lifecycle、tools-lifecycle。包含真实录制/编辑/导出、第三方和Provider有限任务、旧页面回收与原生退出；E2E始终通过scripts/preview-main.cjs加载源码。
- 验证：最终测量：设置三次开关后15秒工作集24.605MB，录屏及其他工具退出后35秒46.248MB、65秒59.908MB；两个闲置阶段均只剩宿主一页。对应私有提交量537.043/490.811/489.505MB，未达到100MB提交量。重开设置正文和隔离数据库读写通过，工作集可按活动需求恢复。
- 验证：自审补充取消退出边界：before-quit可能被宿主阻止，改为will-quit才永久撤销策略；针对性5项单测及Node类型检查通过，归档.artifacts/runs/2026-10-28T03-58-07-065Z-unit。最终native-shutdown源码复验通过，归档.artifacts/runs/2026-10-28T04-01-00-064Z-e2e。
- 验证：pnpm run build完整通过Node/Web/设置类型检查及设置、工具、宿主和preload生产编译；日志.artifacts/work/idle-memory-budget-build.log。保留既有pnpm配置迁移、PostCSS及大chunk提示；未执行electron-builder、build:unpack或任何云端构建。
- 验证：pnpm maintain与pnpm maintain:check通过后，pnpm preview:sync完成固定免安装预览更新：329个现有配置、资料与插件文件逐文件保留，102项程序文件核验，版本仍为1.3.0；回退副本.artifacts/backups/preview-sync/update-1793160072719/previous-resources。
- 验证：pnpm test:preview:resources通过101项程序、345项内置资源及1687项媒体运行文件布局与字节核验，包含物理展开的reclaim-idle-memory.ps1；未为E2E使用编译成品。收尾pnpm maintain、pnpm maintain:check、pnpm docs:check和git diff --check均通过。

## 2026-10-28 · 优化演示录屏及日常工具退出后的闲时内存，重写本地教程与README

记录：[idle-memory-and-guides](../../docs/history/entries/2026-10-28-01-idle-memory-and-guides.json)；版本：未发布。

- 演示捕获辅助窗口改用独占租赁的内存Session；清理权限、连接及临时站点数据后复用，禁用HTTP缓存，避免每次开关增加原生分区；明确清空后端IPC、计时器、窗口和模块引用。
- 编辑器交给控制条前显式卸载React树，退出时等待必要任务结束后再卸载；页面自身pagehide提供幂等后备清理，使视频、音频与Pixi清理不再依赖iframe被移除。
- 宿主隐藏允许Chromium后台节流，退出插件清空子输入文本；可重建图标缓存请求停止30秒后释放，不影响全局剪贴板和持久资料。
- 本地教程重写为15章65步，以具体任务组织并拆出中转、演示录屏、快速录屏和视频处理；删除旧12张SVG及说明，入口统一为阅读本地教程。
- README独立介绍剪贴板、悬浮中转和便签；演示录屏明确自动运镜缩放、手动调整、声音人像、时间轴与无需另开剪辑工具的成片流程；同步门禁、模块规范及回归分组。

- 验证：开始前Git工作区干净；通过context-mode核对维护规范、当前源码及历史索引。
- 验证：新增专项单测12项通过：分区串行20次复用、并发隔离、等待与失败隔离，图标缓存延期/闲置/再提取，教程一致性门禁；归档.artifacts/runs/2026-10-28T02-31-55-905Z-unit。
- 验证：初步源码idle-memory和local-tutorial两项通过，归档.artifacts/runs/2026-10-28T02-31-16-859Z-e2e；覆盖真实录制、3次开关、3个日常工具、35秒闲置及15章阅读、离线、主题与重启资料保留。随后增加显式React卸载，完整回归仍在执行。
- 验证：未修改前同机测量归档.artifacts/runs/2026-10-28T02-20-42-154Z-e2e；比较时区分源码启动转译开销、GPU、网络与页面，不用主进程初启到闲置的下降冒充优化收益。两次后续GPU私有内存约154–204MiB，存在波动；网络进程从约46MiB降为17–18MiB。
- 验证：诊断Memory压力通知对GPU私有内存没有明确改善，未纳入产品或最终测量；没有强制GC、压缩工作集、结束GPU进程或关闭硬件加速。
- 验证：初次工具启动使用了运行时pnpm11且在沙箱触发依赖/缓存权限错误；随后使用已安装pnpm9.15.9及原生桌面执行。测试准备期间修正页面就绪、录制后编辑器定位和无关倒计时菜单动画；失败归档保留。
- 验证：最终全量单测108文件744项通过，归档.artifacts/runs/2026-10-28T02-44-05-539Z-unit；包含最后一个必要任务结束前禁止卸载、完成后先卸载后关后端的两项新增测试。
- 验证：完整源码回归4项通过：idle-memory、performance-budget、presentation-import、presentation-recorder，归档.artifacts/runs/2026-10-28T02-37-40-305Z-e2e。同轮clipboard-interactions在原生图片拖放接收处失败，单独重跑通过，归档.artifacts/runs/2026-10-28T02-43-15-789Z-e2e；未为该瞬态失败修改拖放实现。
- 验证：严格同条件对照：临时将本轮7个运行文件替换为HEAD原内容，测试后逐文件恢复最终源码，恢复收据.artifacts/work/idle-memory-control/restored.json。原代码归档.artifacts/runs/2026-10-28T02-46-40-369Z-e2e；最终实现归档.artifacts/runs/2026-10-28T02-49-22-247Z-e2e，两次均通过相同真实录制/三次开关/三个工具/35秒闲置，未同时运行构建或单测。
- 验证：同条件闲置总工作集685.1→658.6MiB，网络进程私有内存45.9→17.5MiB；捕获Session从3个变为复用1个，最终均只剩宿主1页。GPU私有内存190.1→192.3MiB，没有证明回到初启水平，不能将早期154MiB单次结果推广为稳定收益。
- 验证：最终local-tutorial随同idle-memory通过：15章65步、无旧配图、开篇直接讲面板、演示运镜独立章节、离线、搜索翻页、明暗可见区域及重启资料保留；归档.artifacts/runs/2026-10-28T02-49-22-247Z-e2e。
- 验证：pnpm run build完整通过宿主/渲染器与设置类型检查、演示桥接和全部生产构建；日志.artifacts/work/idle-memory-build.log。修改文件ESLint零错误零警告、文档门禁和差异检查通过；工具构建仍有既有大chunk和PostCSS提醒。
- 验证：pnpm maintain、pnpm maintain:check与pnpm docs:check通过；门禁核对30份文档、192项本地链接、39功能/14分类/30普通入口和15章65步。
- 验证：pnpm preview:sync完成固定免安装预览更新，319个既有配置、资料和插件文件逐文件保留，101项程序文件核对通过；回退资源.artifacts/backups/preview-sync/update-1793155998002/previous-resources。
- 验证：pnpm test:preview:resources通过100项程序、345项内置资源和1687项媒体运行文件布局校验；内置资源减少12项对应已删除教程SVG。未启动真实资料的预览实例，以免改变用户当前配置。

## 2026-10-27 · 完成 TabDo 1.3.0 推送、云端构建及正式发行核验

记录：[release-1.3.0](../../docs/history/entries/2026-10-27-08-release-1.3.0.json)；版本：1.3.0。

- 版本由1.2.2提升到兼容新增功能的1.3.0，更新说明拆分正式版本，保留历史发行记录。
- 对照当前源码审校README、开发与模块规范、工具清单、两份教程、第三方来源及组件说明；修正旧版本和仅本地交付的过期说明。
- 应用关于页补充本版组件源码与许可直达入口；保留原MIT版权、Recordly/OpenScreen的AGPLv3及完整对应源码。
- 沿用现有Windows x64发布工作流、安装身份与更新源，不覆盖既有发行，不重置用户资料。
- 供应商许可与原生源文件保留原始字节，对相关原文件声明Git空白属性，其他文件继续接受提交空白检查。
- 补核分发目录时发现DM Sans的完整OFL仅位于对应源码，补充随程序分发的LICENSE.DMSans.txt并修正随包第三方告知的相对链接。

- 验证：已核对Git状态并保留全部既有改动；fetch后main与origin/main一致，远端最新v1.2.2，v1.3.0尚不存在，Git hooks路径为.githooks。
- 验证：发布前已审校维护流程、项目定位、发布指南与工作流，确认仅手动触发一次Release TabDo工作流，由其创建标签与正式Release。
- 验证：前轮当前功能源码全量106文件738项单测、相关源码Electron E2E、完整构建及预览资源核验均通过，详细证据与人工边界保留在本日01至07条记录。
- 验证：本轮使用仓库规定的pnpm9.15.9重新全量单测，106文件738项通过，归档.artifacts/runs/2026-10-27T14-05-14-294Z-unit；此前默认pnpm11自动安装和沙箱Vitest缓存重命名受限的失败已保留，不计为通过。
- 验证：暂存源码、静态资源、测试与记录，检查无本机数据、日志和构建输出；492项新增文本未发现凭据模式，单文件均低于GitHub限制。文档30页、201项本地链接、39功能码、14分类、30普通入口和两份12章77步教程一致性检查通过。
- 验证：最终1.3.0的pnpm build通过，包含主进程、宿主渲染器和设置页类型检查及全部生产构建，日志.artifacts/work/presentation-release/build.log；关于页新增源码与许可按钮ESLint通过。
- 验证：源码presentation-import、settings-cleanup两项通过，归档.artifacts/runs/2026-10-27T14-08-55-954Z-e2e；同轮all-commands-pinning仍假设演示录屏未默认固定而失败，已修正隔离夹具并重跑，不修改生产固定逻辑。
- 验证：用户确认退出后pnpm preview:sync成功，1.3.0资源同步完成，336个已有资料和插件文件逐文件保留，101项程序文件核对通过；回退资源.artifacts/backups/preview-sync/update-1793110249095/previous-resources。
- 验证：all-commands-pinning修正隔离夹具后通过，归档.artifacts/runs/2026-10-27T14-11-44-260Z-e2e；只搜索不点击新来源即可固定、取消固定并保留原列表。该测试ESLint通过。
- 验证：pnpm test:preview:resources通过，100项程序、357项内置资源与1687项媒体运行文件布局完整。
- 验证：初始功能候选9204497f通过提交及推送hooks并已推送main，随后补齐字体随包许可；最终发行候选以工作流收据中的SHA为准。
- 验证：补充许可后build:tools通过。再次整目录同步因Windows重命名受限自动回退，确认原1.3.0程序资源恢复；随后在退出状态仅复制LICENSE.DMSans.txt和THIRD_PARTY.Recordly.md两个外部许可文件并核对内容，保留原告知副本，未操作资料目录。最终资源核验100项程序、358项内置资源与1687项媒体运行文件通过。
- 验证：最终候选a0bf1a0ced4c6cf8d3b2edb2785cf678c7b11136通过提交、推送hooks后已推送main；重新审校文档并通过docs:check和maintain:check，仅手动触发一次Release TabDo工作流。
- 验证：云端工作流https://github.com/DwenChen/TabDo/actions/runs/40520076310构建和发布作业均成功，运行SHA与候选一致；已下载verification归档核对106个测试文件、738项单测通过，退出码0。正式Release https://github.com/DwenChen/TabDo/releases/tag/v1.3.0已发布。
- 验证：确认Release非草稿、非预发行并为latest，v1.3.0标签指向a0bf1a0ced4c6cf8d3b2edb2785cf678c7b11136；四项正式资产全部下载并在流式下载中一次核对GitHub SHA-256，latest.yml的1.3.0版本、安装文件名、大小及SHA-512均匹配。收据.artifacts/work/presentation-release/release-verification.json。
- 验证：正式ZIP包含644项、应用ASAR含3650项，版本1.3.0、更新源DwenChen/TabDo正确，无本地data、legacy、测试、文档或临时工件。核对演示页面、桥接、预加载、四项Windows原生运行文件及manifest；MIT、AGPLv3、字体OFL及第三方告知与候选源码一致，应用包含源码与许可入口。12章77步187段教程及插图与候选一致。收据.artifacts/work/presentation-release/package-verification.json。
- 验证：预览仅将TabDo.exe从1.2.2替换为正式ZIP中的1.3.0，原exe备份.artifacts/backups/presentation-release-executable/1793111635113，未启动程序或修改资料。最终pnpm test:preview:resources通过100项程序、358项内置资源及1687项媒体运行文件，文件版本1.3.0；数据与插件沿用此前已核对保留的336项。

## 2026-10-27 · 改进自动缩放覆盖、摄像头设置说明与演示录屏默认固定

记录：[presentation-zoom-camera-defaults](../../docs/history/entries/2026-10-27-07-presentation-zoom-camera-defaults.json)；版本：未发布。

- 自动识别加入连续移动候选，降低有效停留位移门槛并缩短重复抑制范围；局部重叠保留可用时间，裁剪、变速和重复素材映射源轨迹，默认时长约两秒。
- 主动自动添加不再被新录制自动应用开关拦截；新录制准备任务取消后允许相同轨迹数量重新调度。
- 手动及自动新增缩放默认1.5倍，已有片段倍率保留；摄像头侧栏补充就地和读屏关联说明，九宫格改中文，自动匹配的高度改说明，明确反向缩放行为。
- 新资料空间默认追加演示录屏为第六项固定；已有固定、显式空列表和自定义顺序不覆盖。

- 验证：context-mode核对当前维护规则、设置规范及模块，保留前轮和用户未提交内容。
- 验证：专项18项单测通过，归档.artifacts/runs/2026-10-27T13-23-32-877Z-unit；覆盖连续移动、小位移、抖动排除、局部重叠、剪辑变速重复映射、1.5倍和默认固定保留。
- 验证：源码presentation-import和presentation-recorder两项通过，归档.artifacts/runs/2026-10-27T13-34-07-927Z-e2e；真实关闭自动应用后，从只有移动无点击的轨迹主动添加1.5倍缩放，摄像头说明、无障碍关联和中文九宫格检查、可见区域截图及完整录制编辑导出回收通过。
- 验证：settings-cleanup源码专项通过，归档.artifacts/runs/2026-10-27T13-28-04-871Z-e2e：六项新配置固定、快捷键默认关闭及资料迁移重启保留通过；该轮另外两个专项失败已修正后单独重跑通过。
- 验证：回归中修正HeroUI开关和导航的键盘/无障碍定位，以及测试仅写偏好而未更新当前控制条倒计时的设置方式；生产录制链未因此改动。修改测试与宿主默认代码ESLint、文档校验和回归分组--list通过。
- 验证：最终全量pnpm test --maxWorkers=2通过106文件738项，归档.artifacts/runs/2026-10-27T13-37-54-974Z-unit；修改文件ESLint、pnpm docs:check、pnpm maintain、pnpm maintain:check和git diff --check通过。
- 验证：pnpm build完整通过：主进程与渲染器类型检查、设置页类型检查、演示桥接、设置/工具/宿主生产构建；日志.artifacts/presentation-zoom-defaults-build.log。首次同步因预览仍运行而按保护规则中止，未替换程序或资料；用户确认退出后继续同步。
- 验证：pnpm preview:sync完成，316个既有配置、资料和插件文件逐文件保留，101项程序文件核对通过；回退资源.artifacts/backups/preview-sync/update-1793108556357/previous-resources。
- 验证：pnpm test:preview:resources通过100项程序、357项内置资源和1687项媒体运行文件布局校验；最终维护、文档及差异检查通过。

## 2026-10-27 · 演示录屏来源菜单、自动缩放与光标同步和渲染链路优化

记录：[presentation-render-pipeline](../../docs/history/entries/2026-10-27-06-presentation-render-pipeline.json)；版本：未发布。

- 来源选择复用控制条菜单，按屏幕和窗口单列缩略图显示，支持选中状态、再次点击、Esc、取消及失焦收起，不再为普通选择创建原生窗口；缩略图降低为160×90，避免无用应用图标传输。
- 缩放按操作时间、空间与最长聚合时长分段，采用配置的持续时间；真实点击外补充移动后有效停留，长停留不丢弃，采样断层和静止轨迹不误判，已有片段保持。
- Windows捕获就绪即采集轨迹，重复状态通知幂等；视频暂停恢复与轨迹共用边界，浏览器传入启动时间；视频提交帧时间统一驱动预览相机与光标，阻止React旧状态回写时钟。
- 预览及导出共用以帧时间为中心的光标平滑，点击处保留真实位置；稀疏点击和形状建立可回收弱引用索引，局部交互识别二分定位，时间轴热路径不再复制排序。
- 视频纹理与叠加层共同提交，暂停或重复帧不重复GPU重绘；界面进度更新限制到30Hz，帧合成继续跟随视频。补充同机性能及源码E2E断言。

- 验证：context-mode完成当前代码、维护流程及历史边界核对，保留原有未提交内容。
- 验证：首次单测因沙箱临时缓存重命名EPERM失败，原生环境专项10项通过，归档.artifacts/runs/2026-10-27T12-29-54-441Z-unit；120000采样、3600次事件查询43.1ms，索引建立后无完整轨迹读取。
- 验证：源码E2E期间修正测试语法、预加载桥接对引号格式的脆弱替换、播放按钮中文无障碍名称和控制条关闭后读取测试状态的时机；一次手动关闭窗口的运行未计入通过。视频首帧回归测出85.49ms偏差，新增等待首个提交帧门禁后复测归零。
- 验证：pnpm test --maxWorkers=2阶段性106文件733项通过，归档.artifacts/runs/2026-10-27T12-35-39-356Z-unit；新增时间轴重叠优先级后待最终全量复核。
- 验证：源码导入布局与相邻工具专项通过，归档.artifacts/runs/2026-10-27T12-47-29-475Z-e2e；完整录制编辑导出回收已通过一轮，归档.artifacts/runs/2026-10-27T12-43-51-424Z-e2e。
- 验证：pnpm docs:check、修改测试与构建脚本ESLint、presentation-recorder分组--list、pnpm maintain及pnpm maintain:check通过；工具生产构建已通过，待最终整包构建与预览同步。
- 验证：最终pnpm test --maxWorkers=2通过106文件734项，归档.artifacts/runs/2026-10-27T12-52-11-169Z-unit；120000点轨迹3600次索引查询49.25ms，索引建立后无完整轨迹读取。
- 验证：最终源码录制编辑导出与会话回收通过，归档.artifacts/runs/2026-10-27T12-50-00-824Z-e2e；模拟900ms准备延迟后轨迹末端与视频时长差-16.65ms，42个播放采样的提交帧与光标时间戳最大偏差0ms，暂停稳定后250ms观察窗口新增GPU绘制0次。该结果不代表所有硬件的端到端输入延迟。
- 验证：pnpm build完整通过，包含主进程/渲染器和设置类型检查、演示桥接、设置/工具/宿主生产构建；日志.artifacts/presentation-render-build.log。
- 验证：pnpm preview:sync完成固定免安装预览更新，303个既有配置、资料和插件文件逐文件保留，101项程序文件验证通过；回退资源.artifacts/backups/preview-sync/update-1793105686760/previous-resources。
- 验证：pnpm test:preview:resources通过：100项程序资源、357项内置资源及1687项媒体运行文件布局检查；最终文档、维护索引与差异检查通过。

## 2026-10-27 · 修复所有指令搜索结果固定到超级面板无反应

记录：[command-search-pinning](../../docs/history/entries/2026-10-27-05-command-search-pinning.json)；版本：未发布。

- 菜单快照随实际展示来源及本页规范指令数据同步，使用同一份已加载数据，覆盖搜索自动来源与清空后返回原来源，不额外发起异步刷新。
- 新增源码Electron回归，验证从设置来源搜索演示录屏后直接固定与取消固定，原有固定项和顺序保持不变。

- 验证：已通过context-mode核对设置规范、指令页、共享菜单和现有差异。
- 验证：新增源码Electron专项通过，实际从设置来源输入搜索词自动展示演示录屏，固定及取消固定成功，已有固定项目和顺序保持一致，清空搜索回到原来源；归档.artifacts/runs/2026-10-27T11-49-40-379Z-e2e。
- 验证：pnpm test --maxWorkers=2通过106文件727项，归档.artifacts/runs/2026-10-27T11-51-36-675Z-unit。设置页及测试ESLint、pnpm docs:check和settings-defaults分组--list通过。
- 验证：pnpm build完整通过，日志.artifacts/presentation-ui-build.log；pnpm maintain和pnpm maintain:check通过。
- 验证：pnpm preview:sync同步固定免安装预览成功，280个原有配置、资料和插件文件保持一致；pnpm test:preview:resources通过，程序回退副本.artifacts/backups/preview-sync/update-1793102078699/previous-resources。

## 2026-10-27 · 恢复演示录屏来源列表与流动边缘，精简编辑器图标和设置入口

记录：[presentation-ui-refinement](../../docs/history/entries/2026-10-27-04-presentation-ui-refinement.json)；版本：未发布。

- 控制条采用原创六点拖动手柄和无内部横线的麦克风；编辑工具栏采用左右回转的撤销、恢复箭头。首次显示前及再次显示时应用演示录屏原生图标和独立任务栏身份，来源列表窗口同样使用工具身份。
- 参考保留的Recordly来源列表源码，点击控制条弹出屏幕与应用窗口缩略图列表；选中后关闭列表并前置窗口，显示透明中心的绿色流动边缘，短时结束或会话退出释放。
- 撤下编辑区的设置齿轮、主页权限分类和手动保存按钮；动态效果等设置保留在项目主页，项目及编辑改动继续自动保存。
- 移除主页侧栏致谢，集中到已有的应用设置关于页；移除文件页英文重复说明，并修正截图审校发现的导出提示英文按钮，更新教程、模块说明与回归验收。

- 验证：已通过context-mode盘点流程、源码和既有差异，保留此前未提交内容；桥接构建及pnpm docs:check通过。
- 验证：首轮导入专项通过；扩展回归暴露观察器只枚举普通BrowserWindow而遗漏派生窗口，已改为保留真实创建事件中的原生实例，再检查图标像素、原生句柄和AppUserModelID。高亮验证改为显示事件观察，窗口可见框与Electron调整边框分别处理。初轮失败归档保留。
- 验证：本轮源码E2E中导入、工具目录与原生窗口身份、本地图文教程及重启资料保留通过，归档.artifacts/runs/2026-10-27T11-46-03-375Z-e2e；该次运动预设用例点到了隐藏原生radio，改为点击可见标签后验证选中态。
- 验证：完整演示录屏源码E2E通过：列表取消与真实选窗、中心alpha为0的高亮及短时销毁、控制条实际图标像素与原生句柄及独立AppID、无重复入口、未命名项目自动保存、运动预设立即改变当前项目并自动落盘、实际窗口视频和点击遥测、MP4导出、导入重开及资源回收；归档.artifacts/runs/2026-10-27T11-49-40-379Z-e2e。
- 验证：pnpm test --maxWorkers=2通过106文件727项，归档.artifacts/runs/2026-10-27T11-51-36-675Z-unit。宿主、设置页和测试改动范围ESLint零错误零警告；文档检查及两个回归分组--list通过。
- 验证：pnpm build完整通过，包含node/web及设置类型检查、演示桥接、设置与工具生产构建；导出提示中文按钮由最终构建包含。保留已有chunk体积、循环依赖和混合导入提示，日志.artifacts/presentation-ui-build.log。pnpm maintain及pnpm maintain:check通过。
- 验证：pnpm preview:sync同步固定免安装预览成功，280个已有配置、资料和已安装插件文件逐文件保持一致，程序回退副本.artifacts/backups/preview-sync/update-1793102078699/previous-resources。pnpm test:preview:resources核对100项程序、359项内置资源和1687项媒体依赖通过。

## 2026-10-27 · 优化演示录屏的窗口识别、自动缩放、布局与启动响应

记录：[presentation-capture-usability](../../docs/history/entries/2026-10-27-03-presentation-capture-usability.json)；版本：未发布。

- 保留原版按原生窗口前后层级与Electron可捕获来源取交集的识别逻辑；选择器等真实窗口边界和正文就绪后显示，支持悬停识别并选择已打开应用。
- Windows窗口枚举、前置和边界跟踪共用当前操作链的隐藏原生查询进程，空闲及会话退出回收；跟踪限制单请求并拒绝迟到结果，避免250ms一次重复编译和启动PowerShell。
- 控制条摄像头关闭使用相同摄像头轮廓加斜线；编辑页及原生标题栏使用演示编辑器名称和图标。
- 自动缩放优先真实点击，缺失点击时识别移动后的有效停留；修正缓慢位移停留判断，静止画面不生成兜底缩放，现有缩放区域不覆盖。
- 录屏入口使用mainHide和隐藏独立宿主准备，创建收尾与标题栏延迟聚焦均遵守show:false，控制条首显前不展示项目或编辑窗口；编辑正文按视口伸缩，首次编辑窗口适配工作区并预留时间轴。
- 录制准备并行读取独立元数据，Windows不重复执行macOS权限IPC；已满足原有分辨率/帧率范围的浏览器轨道不重复协商，控制条即时显示准备反馈并禁用重复启动。
- 空时间轴加号接入统一视频/项目导入，支持点击及Enter；取消保留空状态。补齐中文消息、直接显示文本和无障碍标签，撤下空高级分类。

- 验证：通过context-mode检查维护流程、改动与Bug索引、相关工具及设置规范，保留前两轮所有未提交内容。
- 验证：初轮真实窗口来源与原生边界枚举通过；补充用例发现关闭选择器的CDP确认时机和正文未稳定的指针操作，保留失败归档并改为等待原生选择器可见。
- 验证：pnpm test tests/main/presentationBehavior.test.ts tests/main/detachedWindowUpgrade.test.ts --maxWorkers=2通过2文件8项；含真实Windows窗口边界重复查询及进程回收，归档.artifacts/runs/2026-10-27T10-37-29-168Z-unit。
- 验证：扩展源码E2E发现创建收尾仍无条件show，已修正并用原生窗口show事件验证无闪窗；导入用例按正确模态对话框关闭、正确窗口ID定位标题栏。失败证据保留于10-27-25、10-32-11、10-40-59、10-42-56、10-45-16对应的自动归档。
- 验证：本轮四个源码专项全部通过：演示录制、空轨道导入、普通工具图标及生命周期、本地教程升级保留资料；归档.artifacts/runs/2026-10-27T10-51-33-691Z-e2e。
- 验证：新增实际应用窗口录制，FFprobe核对原始视频宽高比接近所选窗口，证明未退化为整屏；实体系统鼠标点击进入遥测并自动生成缩放，保存导入/MP4编码/重开与端口清理通过；归档.artifacts/runs/2026-10-27T10-54-44-713Z-e2e。
- 验证：去除合格轨道重复协商后，实际窗口录制及完整编辑导出链再次通过，归档.artifacts/runs/2026-10-27T10-56-48-410Z-e2e。源码计时受开发服务器缓存、自动化动作和桌面负载影响，仅作诊断，不用其单次值代表正式预览性能。
- 验证：空轨道加号点击取消、Enter导入实际MP4、中文标题及1180×754和980×580窗口下时间轴几何边界通过；归档.artifacts/runs/2026-10-27T10-48-07-258Z-e2e和四专项归档。截图直接捕获所属WebContents可见区域，无拼接。
- 验证：中文静态语法树审校补齐94个缺失词条，修正正文、工具提示、无障碍名称及录制回退/错误提示；后续仅文案改动由生产构建校验。
- 验证：pnpm test --maxWorkers=2：106文件727项全部通过，归档.artifacts/runs/2026-10-27T10-59-29-897Z-unit。宿主与测试修改范围ESLint零错误零警告；上游来源按现有配置排除，生产构建校验。
- 验证：pnpm build完整通过，含宿主node/web、设置类型检查和工具构建；保留已有chunk、循环依赖与混合导入提示，日志.artifacts/presentation-usability-build.log。pnpm docs:check及回归分组--list通过。
- 验证：最终中文静态键审校未发现未解析键；Git diff --check、pnpm maintain和pnpm maintain:check通过。根目录未留下临时文件。
- 验证：pnpm preview:sync成功同步固定免安装预览，262个既有配置、插件和资料文件逐文件保持一致；程序回退副本.artifacts/backups/preview-sync/update-1793098973088/previous-resources。pnpm test:preview:resources核对100项程序资源、361项内置资源和1687项媒体依赖通过。

## 2026-10-27 · 演示录屏指令直达控制条并修复失焦交接

记录：[presentation-control-entry](../../docs/history/entries/2026-10-27-02-presentation-control-entry.json)；版本：未发布。

- 保留上一轮未提交集成，普通指令直接显示原生浮动控制条；控制条提供演示编辑器入口，编辑页管理项目、最近项目与导入。
- 先分离所属工具会话，再在可见控制条和编辑宿主间交接；录制入口卸载编辑正文，避免主搜索窗口失焦清理控制条。不自动开启临时常驻。
- 可见辅助窗口按当前前台处理；全部窗口退出前台及明确关闭仍回收所属会话，不删除配置、项目或插件。
- 同步工具清单、开发规范、组件说明、README、更新说明、应用内及仓库教程和回归分组。

- 验证：通过 context-mode 阅读维护流程、改动索引、Bug 台账和相关模块规范，检查并保留工作区已有改动。
- 验证：pnpm typecheck:node 通过。
- 验证：首轮 pnpm test:e2e tests/e2e/presentation-recorder.spec.ts --workers=1 通过：无失焦抑制，原生控制条可见、编辑交接、真实录制、保存导入、MP4编码、文件重开、端口释放和临时常驻；归档 .artifacts/runs/2026-10-27T09-25-44-631Z-e2e。
- 验证：补充回归初轮因同名项目按钮选择器不唯一失败，证据归档 .artifacts/runs/2026-10-27T09-29-43-015Z-e2e；限定项目导航区域后通过。
- 验证：最终演示源码专项通过：编辑页项目与最近时间筛选入口、控制条关闭及最小化后的视图和媒体端口回收；归档 .artifacts/runs/2026-10-27T09-30-51-566Z-e2e。直接检查原生窗口可见性并捕获控制条、编辑主页和编辑正文，未拼接截图。
- 验证：新增辅助前台交接边界测试；生命周期专项3文件14项通过，归档 .artifacts/runs/2026-10-27T09-30-51-329Z-unit；pnpm test --maxWorkers=2 全部105文件723项通过，归档 .artifacts/runs/2026-10-27T09-32-10-695Z-unit。
- 验证：相邻 tools-catalog、local-tutorial 两个源码E2E通过，验证普通工具回收、图标、真实关于入口、离线教程及升级保留配置插件；归档 .artifacts/runs/2026-10-27T09-33-54-934Z-e2e。
- 验证：pnpm build 完整通过，含宿主node/web及设置类型检查、设置和工具构建；仅有已有依赖循环、大chunk和动态静态混合导入提示。
- 验证：宿主与测试修改范围ESLint零错误零警告；上游来源目录按现有配置排除，由构建校验。pnpm docs:check通过30份文档、200链接、39功能、14分类、30普通指令及12章77步教程；pnpm test:regressions presentation-recorder --list通过。Git diff --check通过。
- 验证：pnpm maintain 与 pnpm maintain:check通过；同步前确认免安装预览已退出。pnpm preview:sync成功替换程序资源，216个既有配置、插件和资料文件逐文件保持一致，程序回退副本位于 .artifacts/backups/preview-sync/update-1793093768407/previous-resources。
- 验证：pnpm test:preview:resources通过：100项程序资源、361项内置资源与1687项媒体依赖。最终测试文件导入方式经自动归档入口--list加载确认，未将发现用例计为重新执行断言。

## 2026-10-27 · 集成演示录屏与演示编辑器，完善 OCR 和公式默认设置

记录：[presentation-recorder-and-formula-defaults](../../docs/history/entries/2026-10-27-01-presentation-recorder.json)；版本：未发布。

- 文字提供商改为离线OCR引擎；离线公式与AI公式增加设为默认，使用独立defaultId.formula，保留已有OCR默认、开关与模型参数。
- 研究并固定Recordly 109ca3a13c362e969d9add25d1f93406c36dba2a（上游1.4.0）；复用实际录制、编辑、项目和导出源码及Windows x64原生组件，保留完整AGPLv3与依赖许可、UI致谢和改动说明。
- 新增演示录屏；单个.recordly文件匹配演示编辑器；原有录屏独立。编辑器显式提供保存项目与导入项目，项目继续引用原始视频等素材。
- 仅提供中文，补齐主页、录制、编辑、导出及设置文案；主题跟随宿主；取消上游更新、账户、共享、反馈、Discord与插件入口；解释循环光标。
- 六项可配置编辑动作移入TabDo快捷键页，缺失配置全部关闭；保留其他明确选择。通过宿主标题栏声明临时常驻，不自动开启或落库。
- 每个WebContents持有独立服务闭包、前缀IPC、辅助窗口、端口和进程；保存、录制收尾和导出按完整链登记任务。普通退出回收，常驻隐藏保留，取消常驻立即关闭。Windows只订阅宿主uiohook，不停止全局采集。
- 源码预览和E2E只构建服务桥接；正式工具构建包含React编辑器、WASM和静态素材；FFprobe纳入生产依赖、物理展开和免安装资源验证。
- 同步README、提供商说明、工具清单、设置与工具规范、许可、更新说明及两份12章77步本地图文教程。

- 验证：初始Git工作区干净；已依次阅读维护、改动、Bug和工具、设置、提供商、插件相关规范；全程使用context-mode盘点分析。
- 验证：pnpm test --maxWorkers=2：105个文件、720项通过；归档.artifacts/runs/2026-10-27T07-53-44-948Z-unit。
- 验证：pnpm typecheck:setting、宿主node/web类型检查、完整pnpm build与最终build:tools通过；保留已有大体积chunk/PostCSS警告。
- 验证：builtin-providers源码专项通过：新标签、公式默认按钮、AI启用/设默认和OCR原选择保留；.artifacts/runs/2026-10-27T07-58-58-667Z-e2e。
- 验证：演示源码专项已通过真实屏幕录制、视频解码、保存/导入、MP4实际编码（FFprobe核对视频轨和时长）、文件指令重新打开、旧服务端口释放、常驻隐藏与取消回收；证据见.artifacts/runs/2026-10-27T08-26-31-558Z-e2e。
- 验证：local-tutorial源码专项通过真实关于入口、离线资源和升级重启保留配置插件；.artifacts/runs/2026-10-27T08-26-31-558Z-e2e。
- 验证：tools-catalog源码专项通过分类、匹配入口及原有工具图标/退出回收；.artifacts/runs/2026-10-27T08-32-39-220Z-e2e。
- 验证：实施中失败均归档：修复预加载晚require、独立账户门禁、窗口适配与WASM资源路径；测试改为等待真实媒体、编码结果和新会话就绪，修正工具清单数量及普通/匹配分类断言。
- 验证：最终演示源码专项通过：主题明暗同步、循环光标实际说明、宿主配置启用后的真实快捷键播放、录制/导出/文件重开、端口回收与常驻隐藏/取消；.artifacts/runs/2026-10-27T08-50-41-904Z-e2e。
- 验证：新增实际plugin.json文件入口回归：单个大写.recordly可匹配，空输入、目录、其他扩展名与多文件拒绝；commandContextShared 18项通过，.artifacts/runs/2026-10-27T08-54-35-580Z-unit。
- 验证：相关15个适配文件ESLint零错误零警告；最终新增桥接与服务复核通过，Git diff --check通过；docs:check核对30份文档、200链接、39功能、14分类、30普通指令与12章77步教程。
- 验证：最终预览资源核对通过：100项程序资源、361项内置资源、1687项媒体运行依赖；保存完整可回退程序副本，189个既有配置/插件/资料文件保持一致。

## 2026-10-26 · 发布语言方向图标与中文选区自动翻译优化

记录：[release-tabdo-1.2.2-selection-translation](../../docs/history/entries/2026-10-26-02-release-1.2.2.json)；版本：1.2.2。

- 当前用户明确授权本轮push、云端构建与Release；版本递增为1.2.2，不覆盖已发布的1.2.1。
- 发布细线方向箭头和中文选文默认跳过自动翻译，取消旧请求并阻止迟到结果；所有指令保持原有搜索实现。
- 对照最终源码审校README、设置/提供商/发布及开发规范、应用内和仓库教程、更新说明及当轮记录，补充中文选文跳过规则；教程保持12章77步。
- 保留并随维护文档纳入此前本地清理事实记录，不提交备份、测试日志、截图、下载或个人资料。

- 验证：已读取当前AGENTS、维护流程、改动索引、Bug台账及发布规范；Git fetch确认main与origin/main一致，HEAD为a3dc461e，hooks保持启用。
- 验证：GitHub API确认latest为v1.2.1，v1.2.2尚不存在，近期发布工作流已完成；收据.artifacts/work/selection-release/remote-before.json。
- 验证：本轮完整pnpm test --maxWorkers=2通过105文件719项，自动归档.artifacts/runs/2026-10-26T02-31-51-984Z-unit；非历史通过记录。
- 验证：本轮selection-translation、builtin-providers与local-tutorial三个源码Electron专项全部通过，自动归档.artifacts/runs/2026-10-26T02-32-36-184Z-e2e；直接加载scripts/preview-main.cjs，显式隔离data/legacy，不为E2E打包。
- 验证：pnpm build通过，包含Node/Web/设置类型检查、两份内置插件及宿主编译；相关7个JS/TS/Vue文件ESLint零错误零警告。既有Rollup跨chunk循环依赖、静态/动态导入与pnpm配置警告保留。
- 验证：已人工核对README、开发/发布/设置/工具/Provider规范、应用内与仓库教程、更新说明和当轮记录。README与package版本更新为1.2.2，两份教程第2章选文步骤同步加入中文跳过说明；工具清单、快捷键、数据路径及生命周期行为仍准确。
- 验证：候选提交前再次审校受影响文档，通过pnpm maintain、maintain:check、docs:check和git diff --check；文档门禁核对30文件、196链接、37功能/13分类/29普通指令、12章77步。
- 验证：本地1.2.2免安装预览同步成功，189个data/legacy文件逐项保持，96项暂存程序核验；收据.artifacts/backups/preview-sync/update-1792982093287/preservation.json。test:preview:resources核对95程序、246内置和1676媒体资源通过。
- 验证：候选经pre-commit提交966a26f34dd76b05b875be7cba6dd27ba7d924a1，pre-push文档与维护门禁实际通过后推送main；触发前再次确认文档准确并通过docs:check、maintain:check，仅workflow_dispatch触发一次Release TabDo运行40260011964。
- 验证：云端build作业121370136075与publish作业121371332321全部成功，构建前和发布前文档门禁均通过；verification制品12623713545核实105文件719项单测全通过，win-x64制品12623682691归属候选SHA。证据.artifacts/work/selection-release/cloud-status.json和cloud-verification.json。
- 验证：v1.2.2正式Release ID423809720，非草稿、非预发布且为latest，发布时间2026-10-26T02:42:46Z；标签解引用和target_commitish均为966a26f34dd76b05b875be7cba6dd27ba7d924a1，地址https://github.com/DwenChen/TabDo/releases/tag/v1.2.2。
- 验证：四项资产全部实际下载并核对GitHub SHA-256及大小：latest.yml 8420字节、TabDo-1.2.2-win-x64-setup.exe 129168752字节、setup.exe.blockmap 135662字节、TabDo-1.2.2-win-x64.zip 176095879字节；更新清单版本、文件名、大小与安装包SHA-512一致。收据.artifacts/work/selection-release/release-verification.json。
- 验证：首次下载Actions验证压缩包因Accept头返回415；改用GitHub连接工具成功下载10628字节验证制品。四项发行文件沿用首次已完成的摘要校验，不重复下载或重算SHA-256；失败及恢复日志均保留，未重新构建或覆盖Release。
- 验证：正式ZIP 497条目、ASAR 3621条目：核对应用1.2.2、更新仓库、许可、中文跳过与取消判断、方向SVG及CSS、通用设置说明；编译教程逐段匹配12章77步187段正文与插图，排除本机data/legacy和开发工件。收据.artifacts/work/selection-release/package-verification.json。
- 验证：云端TabDo.exe仅替换已退出预览的主程序，FileVersion由1.2.1更新为1.2.2，原exe备份.artifacts/backups/selection-release-executable/1792982921961；此步不操作data/legacy、配置或插件，前述189文件保留检查来自程序资源同步。再次test:preview:resources通过95程序、246内置与1676媒体资源，未启动成品。收据.artifacts/work/selection-release/preview-executable.json。

## 2026-10-26 · 优化语言方向箭头，中文选文默认跳过自动翻译

记录：[selection-translation-and-language-direction](../../docs/history/entries/2026-10-26-01-selection-translation.json)；版本：未发布。

- 翻译服务配置以20px细线SVG替代文字箭头，对齐两侧语言下拉框中心。
- 超级面板自动翻译先判断文字，中文占主要部分、空白及仅数字标点时跳过；包含少量英文缩写的中文仍跳过，含假名日文继续翻译。切换到中文先取消旧请求并抑制迟到结果，主动翻译不变。
- 按用户最新指示撤回所有指令搜索相关改动，原有搜索实现保持原样。
- 同步提供商说明和TX-87/TX-88回归分组；保留此前历史清理条目和生成索引的未提交改动。

- 验证：开始时仅有此前历史清理记录及生成索引的未提交改动，完整保留；按用户补充撤回搜索实现与相关文档，git diff确认所有指令、共享指令操作、设置规范和两份教程均无差异。
- 验证：pnpm test tests/main/selectionTranslation.test.ts tests/main/superPanelClipboardTrigger.test.ts tests/main/builtinProviderService.test.ts --maxWorkers=2通过，3文件39项，归档.artifacts/runs/2026-10-26T02-18-43-355Z-unit。
- 验证：pnpm test:e2e selection-translation与builtin-providers两个源码专项通过，归档.artifacts/runs/2026-10-26T02-19-44-357Z-e2e；真实宿主自动翻译入口验证中文不调用、英文及日文调用、中文替换后取消旧请求和迟到结果、控制器回收，提供商使用替身不请求外网。builtin-providers覆盖主动翻译中文、配置语言、识别与资源释放。
- 验证：截图复核发现仅emulateMedia会与Electron主题不一致；增强普通材质背景断言后的首次运行失败，保留.artifacts/runs/2026-10-26T02-22-46-117Z-e2e。最终联合nativeTheme和页面配色覆盖重跑通过，归档.artifacts/runs/2026-10-26T02-24-00-745Z-e2e，明暗截图已直接查看，20px箭头居中误差不超过2px且无横向溢出。该失败属于测试主题驱动不完整，未扩展改动产品主题系统。
- 验证：pnpm build通过：Node/Web/设置类型检查、设置及工具插件和Electron宿主编译。保留既有两个设置跨chunk循环依赖、宿主静态/动态导入分块和pnpm配置警告，未为E2E打包或运行electron-builder/build:unpack。
- 验证：修改范围ESLint零错误零警告，git diff --check通过；pnpm test:regressions selection-translation --list确认3个单测和2个源码专项。未运行全量单测或全量E2E。
- 验证：pnpm maintain、maintain:check、docs:check通过；文档检查30文件、195链接和12章教程无错误。最终专项测试文件ESLint零错误零警告，git diff --check通过。
- 验证：pnpm preview:sync成功同步本地1.2.1程序，核对96项暂存程序文件，189个既有data/legacy文件逐文件保持；收据.artifacts/backups/preview-sync/update-1792981511718/preservation.json。未启动成品、重置资料或更改已安装插件。
- 验证：pnpm test:preview:resources通过，核对95项程序资源、246个内置插件文件与1676项媒体依赖。搜索相关源码和教程最终无差异，未提交、push、云端构建或release。

## 2026-10-25 · 清理历史程序备份、旧下载与可重建缓存，逐文件保留当前资料及原始证据

记录：[cleanup-historical-artifacts-2026-10-25](../../docs/history/entries/2026-10-25-06-artifact-cleanup.json)；版本：未发布。

- 按当前用户明确授权清理已确认的历史备份及临时材料，不重置资料、不启动预览、不强制结束应用，不提交或执行远端操作。
- 删除9次预览同步的程序暂存/回退载荷及3组旧主exe备份，保留9份preservation.json和发布核验收据。
- 删除v1.1.1/v1.2.0的8个过期发行下载文件、6个重复解包副本、39个已完成任务的一次性脚本/补丁，以及7个有相同SHA-256保留原件的游离测试/验证输出。
- 在相关程序退出后清理74个Chromium可重建缓存文件及40个Vite/ESLint缓存文件；不触及Cookies、Local/Session Storage、LMDB、剪贴板、收藏、插件及插件资料。
- 保留当前1.2.1四项原始发行文件、全部原始测试归档、发布核验JSON/日志/必要核验工具、原生构建来源、开发依赖和out/内置插件dist。仅保存路径/大小/摘要清单，未为本轮生成完整资料备份。

- 验证：开始时main工作区干净，HEAD为a3dc461e；依次读取AGENTS、维护流程、改动索引、Bug台账及数据/开发文档。相关进程通过Win32_Process确认已退出，未终止用户程序。
- 验证：删除前将105个目标解析为当前仓库内的绝对路径，逐层检查祖先和递归子项的ReparsePoint，未发现目录链接；核对文件数与逻辑大小后使用PowerShell原生Remove-Item和LiteralPath删除。计划、进程结果及逐目标日志位于.artifacts/cleanup-2026-10-25/。
- 验证：实际删除48649个文件，逻辑大小4795686485字节（约4.80GB、4.47GiB）；不是实测释放的磁盘空间。分类明细见.artifacts/cleanup-2026-10-25/verification.json。
- 验证：清理前后8925个受保护文件的路径、大小和SHA-256逐项完全一致，含2022个当前预览程序文件、99个预览持久资料文件、54个源码预览资料文件和5979个原始测试归档文件；完整预览文件差异仅为已批准的74个Chromium缓存文件。
- 验证：保留用途不明确的data/temp、旧data/usage-guide及可能包含持久会话的浏览器目录，不因名称含临时、缓存或旧教程而推断可删。原有配置、数据库、历史、收藏、已安装插件及私有资料未丢失或变化。
- 验证：pnpm test:preview:resources通过，核对95项程序资源、246个内置插件文件与1676项媒体依赖；pnpm docs:check、maintain、maintain:check及git diff --check通过。清理后相关项目进程仍为0，未启动预览或为清理重建程序/完整备份。
- 验证：最终Git差异仅为本轮维护条目和自动生成的改动索引；没有提交、push、云端构建或发布。详细计划、删除日志及前后SHA-256清单保留在.artifacts/cleanup-2026-10-25/，属于本轮审计材料。

## 2026-10-25 · 发布文档与本地教程修订，并强制发布前文档校验

记录：[release-tabdo-1.2.1-documentation-gate](../../docs/history/entries/2026-10-25-05-release-1.2.1.json)；版本：1.2.1。

- 当前用户授权本轮push、云端构建和Release，并要求将远端操作前的文档检查更新列为必须规范；保留前一轮尚未提交的文档与教程修改。
- 版本更新为1.2.1，不覆盖已发布1.2.0；发布重写后的README、开发规范和12章77步本地教程。
- AGENTS及维护/发布/开发/贡献规范明确文档人工审校与必要更新为强制前置条件；新增docs:check检查当前本地链接/锚点、工具统计/功能码/分类及教程正文/插图，推送hook、云端构建和发布作业均接入。
- 补充隔离单测覆盖文档门禁的正常、失效链接/锚点、清单漂移、过期教程和缺失插图，加入documentation回归分组；自动门禁不替代人工行为与语言审校。

- 验证：已依次阅读维护、变更索引、Bug台账与发布规范；git fetch后本地main和origin/main一致，原有文档修改保留，hooks保持启用，未获得或执行数据重置。
- 验证：已对照当前源码人工审校README、开发/插件/设置/悬浮规范、两份教程、更新说明和本轮记录。pnpm docs:check通过30份文档195个本地链接与锚点、37功能码/13分类/29普通指令、12章77步及插图一致性；自动检查不代替行为及语言审校。
- 验证：本轮完整pnpm test --maxWorkers=2通过104文件704项，含文档门禁5个隔离场景，归档.artifacts/runs/2026-10-25T05-06-38-038Z-unit。
- 验证：本轮local-tutorial源码E2E通过，归档.artifacts/runs/2026-10-25T05-08-13-442Z-e2e；检查真实关于入口、所有章节与插图、搜索、离线阅读及重启后资料保留，不为E2E打包。
- 验证：首次ESLint发现直接执行的ESM脚本被要求写TypeScript返回类型；按仓库同类ESM约定保留JSDoc签名并说明规则适用边界，复查pnpm lint零错误。设置页类型、Prettier和差异检查通过；documentation分组确认1个单测文件与1个源码专项。
- 验证：pnpm build通过，包含宿主Node/Web类型检查、设置/工具插件及宿主编译，仅用于预览交付；既有设置跨chunk循环依赖警告保留。第一次preview:sync因预览仍在运行而拒绝替换，用户明确回复已退出后重试，未强制结束进程或在线替换资源。
- 验证：preview:sync已同步1.2.1资源，原有173个data/legacy文件路径和SHA-256完全一致；收据.artifacts/backups/preview-sync/update-1792905118862/preservation.json，原资源回退位于同目录previous-resources。test:preview:resources通过95程序、246内置和1676媒体资源，未启动成品或重置资料。
- 验证：候选推送前再次审校最终文档并通过docs:check、maintain:check及差异检查；只暂存本轮文档、教程、门禁脚本/测试、hooks/工作流和版本说明，不包含日志、备份、下载、个人资料或凭据。
- 验证：正式ZIP内编译教程已按候选源码逐段检查187段文字，包含12章77步及问题解答，不仅检查章节标题。
- 验证：推送hook实际执行文档门禁并通过；云端Verify documentation before cloud build和Verify documentation before release两项均成功。发布前文档审校与必要更新已作为强制规范和实际流程生效。
- 验证：本轮已审阅文件通过pre-commit提交073902ec3998db1a7b7a7d01e67214471d635d56，经pre-push推送main；仅以workflow_dispatch触发一次Release TabDo工作流40164802020，没有另推标签或覆盖旧版。
- 验证：云端build作业121083556732与publish作业121084143456首次成功；verification制品12587409547已下载，核对104文件704项单测全部通过，win-x64制品12587304701归属候选SHA。收据.artifacts/work/docs-release/cloud-verification.json。
- 验证：v1.2.1正式Release ID423163831，非草稿、非预发布且为latest，发布时间2026-10-25T05:18:20Z；标签解引用及target_commitish均为候选提交。
- 验证：四项资产全部实际下载并核对GitHub SHA-256及大小：latest.yml 7653字节；TabDo-1.2.1-win-x64-setup.exe 129168406字节；TabDo-1.2.1-win-x64-setup.exe.blockmap 135653字节；TabDo-1.2.1-win-x64.zip 176095615字节。latest.yml版本、所引用安装包文件名、大小及SHA-512一致，收据.artifacts/work/docs-release/release-verification.json。
- 验证：ZIP共497条目、ASAR共3621条目，核对版本、更新仓库、许可及55项源文件/内置资源；中转UI、preload、图标和编译后的勾选/排序/自动提示教程均存在，无本机资料或旧全屏资源。收据.artifacts/work/docs-release/package-verification.json。
- 验证：云端TabDo.exe已同步固定预览，FileVersion为1.2.1；原exe备份位于.artifacts/backups/docs-release-executable/1792905712491，data/legacy共173文件前后路径和SHA-256完全一致。再次pnpm test:preview:resources通过95程序、246内置及1676媒体资源核对，未启动成品或重置资料。收据.artifacts/work/docs-release/preview-executable.json。
- 验证：发布核验记录经pnpm maintain、maintain:check和差异检查后以独立文档提交推送；发布标签保持指向已构建的候选提交。

## 2026-10-25 · 按1.2.0审校README、开发规范与本地图文教程

记录：[docs-review-and-local-tutorial-rewrite](../../docs/history/entries/2026-10-25-04-docs-review.json)；版本：未发布。

- 重写产品入口、运行与交付说明，区分普通免安装与仓库隔离预览；补充忽略安装脚本后需要显式安装FFmpeg运行文件的环境步骤。
- 对照清单纠正37个功能码、13分类、29个普通指令，删除现行文档中仍描述全屏自动引导和文本转入便签的过期说明。
- 明确临时常驻会话与独立内容窗口的生命周期边界，新增悬浮内容模块规范，拆分重复长段并保留资源、数据和许可约束。
- 审校全部12章应用内教程，拆分中转操作、补充常驻/置顶区别与批量类型规则，同步77步仓库教程；保留原章标识与插图。
- 整理文档导航、贡献、维护、设置、数据迁移和发布说明，统一术语、代码路径、Markdown与验证表述；历史记录和旧版发布事实保留原样。

- 验证：开始时工作区干净，保留已发布1.2.0的版本与标签；本轮没有获得新的远端发布指示，不推送、不触发云端构建或Release。
- 验证：已依次读取维护流程、变更索引、Bug台账与相关规范，对照当前清单、临时常驻API、中转宿主、预览入口、依赖安装器与本地教程源码审校。
- 验证：本轮检查29份当前文档的192个本地链接和锚点，全部存在；对照清单核对37功能码、13分类、29普通指令，逐条核对12章77步及所有问题解答与仓库教程一致，12张插图均存在。收据.artifacts/work/docs-review/docs-check.json。外部网址未作网络可达性承诺。
- 验证：pnpm test:e2e tests/e2e/local-tutorial.spec.ts --workers=1通过，归档.artifacts/runs/2026-10-25T04-51-00-341Z-e2e。从源码真实关于入口检查全部章节、插图、搜索、离线阅读和重启后配置及插件保持，保留明暗截图。未为E2E打包。
- 验证：修改教程源的ESLint、设置页类型检查及Markdown/TS/JSON的Prettier检查通过。pnpm build完成宿主Node/Web类型检查、设置/工具插件与宿主编译，仅用于预览交付；既有设置跨chunk循环依赖警告保留。本轮未重跑完整单测，不将1.2.0发布时的699项结果算作本轮执行。
- 验证：pnpm preview:sync已同步重写教程，173个原有data/legacy文件前后路径与SHA-256完全一致，收据.artifacts/backups/preview-sync/update-1792903992305/preservation.json；回退程序位于同目录previous-resources。未启动成品或重置资料。
- 验证：pnpm test:preview:resources通过，核对95程序、246内置插件及1676媒体资源；预览UsageGuide-Dxy6vLOl.js中的整列勾选、手动排序、禁止提示时长、常驻/置顶区别和备份说明逐项存在。pnpm maintain、maintain:check和git diff --check通过。

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
- 验证：72个已审阅文件通过pre-commit提交30103ded159be05e32939a3455ae3a7268e60d1f，经pre-push推送main；仅以workflow_dispatch触发一次Release TabDo工作流40161913915，没有另推标签或覆盖旧版。
- 验证：云端build作业121075078609与publish作业121075924042首次成功；verification制品12586527844已下载，核对103文件699项单测全部通过，win-x64制品12586574696归属候选SHA。收据.artifacts/work/relay-release/cloud-verification.json。
- 验证：v1.2.0正式Release ID423147855，非草稿、非预发布且为latest，发布时间2026-10-25T04:32:11Z；标签解引用及target_commitish均为候选提交。
- 验证：四项资产全部实际下载并核对GitHub SHA-256及大小：latest.yml 6717字节；TabDo-1.2.0-win-x64-setup.exe 129168211字节；TabDo-1.2.0-win-x64-setup.exe.blockmap 135741字节；TabDo-1.2.0-win-x64.zip 176095300字节。latest.yml版本、所引用安装包文件名、大小及SHA-512一致，收据.artifacts/work/relay-release/release-verification.json。
- 验证：ZIP共497条目、ASAR共3621条目，核对版本、更新仓库、许可及55项源文件/内置资源；中转UI、preload、图标和编译后的勾选/排序/自动提示教程均存在，无本机资料或旧全屏资源。收据.artifacts/work/relay-release/package-verification.json。
- 验证：云端TabDo.exe已同步固定预览，FileVersion为1.2.0；原exe备份位于.artifacts/backups/relay-release-executable/1792902846367，data/legacy共173文件前后路径和SHA-256完全一致。再次pnpm test:preview:resources通过95程序、246内置及1676媒体资源核对，未启动成品或重置资料。收据.artifacts/work/relay-release/preview-executable.json。
- 验证：发布核验记录经pnpm maintain、maintain:check和差异检查后以独立文档提交推送；发布标签保持指向已构建的候选提交。

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
