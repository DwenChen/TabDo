# AGENTS.md

## 所有修改必须遵守

- 默认使用 context-mode MCP；先阅读 [维护必读](docs/maintenance.md)、[改动索引](docs/generated/CHANGES.md)、[Bug 台账](docs/generated/BUGS.md)和相关模块文档。
- 每轮修改新增或更新 `docs/history/entries/*.json`，据实记录原因、改动、测试、未验收项和预览状态，修复 Bug 时同步台账与回归分组。
- 收尾执行 `pnpm maintain` 和 `pnpm maintain:check`；测试入口自动归档日志与退出状态，提交前自动刷新索引。不得把日志、临时脚本和下载产物留在根目录，或绕过 hook。
- 日常交付按以下用户原文执行；历史或当前发布记录不构成下一轮授权：

> 梳理当前项目，进行下面的优化。优化完成后，将优化更新同步到本地的免安装预览中（方便我手动测试、不要动已有的配置数据和已安装的插件）。没有我的指示，不进行push、云端构建及发布release。

- 本地预览固定在 `.local/portable-preview/`，通过 `PreviewPortable.cmd` 使用隔离数据；配置、插件和备份不得提交或发布。重置、push、云端构建及 release 各自需要用户明确指示。

## 内置“工具”插件开发必读

- 新增或修改内置“工具”子组件及宿主能力前，必须阅读并遵守 [工具子组件开发原则](docs/tools-development.md)。
- 子组件退到后台后立即停止前台活动并释放临时资源；必要任务必须登记完整操作链，任务完成、失败或取消后立即清理。禁止把工具视图、模型或工作进程长期留在缓存中。
- 清理仅针对会话运行时资源，不得删除配置、剪贴板历史、收藏或已安装插件，也不得停止宿主的全局剪贴板采集。

## 注释规范

- 新增或实质修改的方法、函数，必须在声明正上方使用多行 JSDoc，简要说明职责。
- JSDoc 必须为每个参数提供 `@param`，并提供 `@returns`；方法可能主动抛错时补充 `@throws`。
- `void`、`Promise<void>` 方法也需要写明 `@returns`，例如“无返回值”或“操作完成后结束的 Promise”。
- 方法内部应在准备、校验、状态切换、资源发布、回滚、清理等关键步骤前添加单行注释。
- 单行注释应解释步骤目的、约束或失败边界，不要逐行复述代码行为。
- 修改实现时同步更新相关注释，禁止保留与当前行为不一致的旧注释。

## E2E 验证

- 使用 Playwright Electron 运行端到端测试：`pnpm test:e2e`。
- 修改 ZTools 后必须直接使用开发方式进行 E2E，不要为了 E2E 打包应用，不要执行 `electron-builder`、`pnpm build:unpack` 或使用 `dist/*.app`。
- 命令直接使用 scripts/preview-main.cjs 加载源码，再由 Playwright 自动启动源码服务器和设置插件开发服务器（`127.0.0.1:15177`）和隔离的 Electron 测试实例；不会生成 out/dist，也不会本地构建或打包，无需手动启动服务。
- 专项 E2E 同样使用源码项目作为 Electron 启动参数，并通过 `ZTOOLS_SETTING_DEV_SERVER_URL=http://127.0.0.1:15177` 加载设置插件开发页面。
- E2E 使用临时数据目录，不得读写真实的 `~/.ztools`；新增用例必须继续传入隔离的数据与旧数据目录。
- 排查插件界面时直接截取插件 WebContentsView，不要与宿主窗口截图拼接。
- 默认只截取当前可见区域；只有测试明确要求时才增加全页面或滚动截图逻辑。
- 截图前必须等待页面正文中的稳定特征出现，不能只等待侧栏、标题等可能提前渲染的内容。
- 测试截图和 trace 输出到 `test-results/playwright`，该目录不提交版本库。
- Electron E2E 使用 Electron 自带的 Chromium，不需要执行 `playwright install chromium`。
