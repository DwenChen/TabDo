# TabDo 开发指南

本文介绍环境准备、代码入口、验证和本地交付。产品用法见 [README](../README.md)与[本地教程](usage-guide.md)，提交要求见 [贡献指南](../CONTRIBUTING.md)。自动化 Agent 还需遵守 [AGENTS.md](../AGENTS.md)和[执行指南](agent-guide.md)。

## 环境准备

正式验证与发行平台为 Windows x64。使用 Node.js 22、pnpm 9.15.9，以及锁文件指定的 Electron；根项目和设置插件分别安装依赖。其他平台的脚本可供开发参考，不能据此宣称已正式支持。

```powershell
git clone https://github.com/DwenChen/TabDo.git
cd TabDo
pnpm install --frozen-lockfile --ignore-scripts
pnpm --dir internal-plugins/setting install --ignore-workspace --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
node node_modules/ffmpeg-static/install.js
pnpm hooks:install
pnpm preview:local
```

上面的命令先跳过依赖安装脚本，再显式下载 Electron 和媒体工具需要的 FFmpeg 预编译文件。仅安装 Electron 无法补齐 `ffmpeg-static` 的可执行文件。下载失败时先检查网络、代理和对应安装器的错误，不通过更改依赖版本或锁文件绕过问题。

仓库随附的原生组件保留各自来源和许可。确需重建时，按对应资源说明操作，中间文件放入 `.artifacts/native/`，不要默认重编译全部原生模块。

开发产物遵守[项目空间规范](workspace-storage.md)：下载、解包和构建暂存随任务结束回收，已安装工具链及开发依赖继续保留；预览更新核验成功后只保留最近一次程序回退。单轮可重建材料净增长达到 500 MiB 或 `.artifacts/` 达到 5 GiB 时分类复核，不清空配置、插件、独有测试证据或其他任务工作目录。

## 运行方式与数据隔离

`pnpm preview:local` 或 `Preview.cmd` 通过 `scripts/preview-main.cjs` 加载源码。主进程 TypeScript 在内存中转换，Vue 页面由 Vite 提供；不要求先生成 `out`、`dist` 或安装包。

| 用途           | 入口                                 | 数据位置                                                         |
| -------------- | ------------------------------------ | ---------------------------------------------------------------- |
| 日常开发       | `pnpm preview:local` / `Preview.cmd` | `.local/source-preview-data/` 与 `.local/source-preview-legacy/` |
| 自动化窗口测试 | `pnpm test:e2e <测试文件>`           | 各用例显式配置的临时 data 和 legacy 目录                         |
| 成品手动测试   | `PreviewPortable.cmd`                | `.local/portable-preview/` 下的隔离资料                          |

三者用途和资料目录不同。测试不能读写真实 `~/.tabdo`；成品预览使用启动器，避免直接运行 exe 后误读正常安装资料。

| 服务       | 回环地址          |
| ---------- | ----------------- |
| 宿主渲染器 | `127.0.0.1:5174`  |
| 设置插件   | `127.0.0.1:15177` |
| 工具插件   | `127.0.0.1:15178` |

源码预览窗口退出后，服务继续运行，以支持恢复资料后的重启；在终端按 Ctrl+C 结束整个预览。直接打开设置页或工具页的 URL，不能获得完整的宿主桥接。

源码E2E通过工具服务的 `/__tabdo_source_preview_ready` 等待宿主渲染、设置和工具三项服务全部监听，启动Electron前还校验JSON就绪响应和三个来源的HTTP状态，防止复用只返回SPA页面的旧服务。不能只用设置端口或窗口创建回执作为就绪依据。控制条冷启动回归还检查真实可操作正文，并从页面创建起留存加载、脚本与崩溃诊断。

## 选择修改入口

先在 [架构](architecture.md)和[项目索引](generated/PROJECT_INDEX.md)定位模块，再沿真实调用链修改。纯逻辑放入共享模块；系统调用、进程管理和文件发布由主进程或工作进程承担；渲染器负责页面状态与交互。

- 内置工具：遵守 [工具开发规范](tools-development.md)，同步功能清单、路由、首帧尺寸、原生图标与任务栏身份。
- 设置、快捷键或数据路径：遵守 [设置开发规范](settings-development.md)，保留已有明确选择。
- 第三方插件：从 [插件开发规范](plugin-development.md)开始，使用独立 [插件市场](plugin-market.md)。
- 翻译和 OCR：遵守 [Provider 契约](provider-development-guide.md)，避免在常驻宿主中加载模型。
- 呼叫AI：会话、审批与 MCP 连接由 `src/main/core/callAiService.ts` 管理。`pnpm build:call-ai` 生成 agent 与 Windows 内置运行时。设置和运行约束见 [呼叫AI](call-ai.md)，默认固定由 `localEditionDefaults.ts` 初始化。
- 演示录屏：宿主入口为 `src/main/core/presentationRecorder.ts`，编辑器和桥接位于 `internal-plugins/system/presentation/`，构建前自动运行 `scripts/build-presentation.cjs`；源码、原生资源与组合分发许可见[组件说明](../internal-plugins/system/presentation/README.md)。

  1.2.0 的会话与中转入口：

| 入口                                  | 职责                                       |
| ------------------------------------- | ------------------------------------------ |
| `src/main/core/temporaryResidency.ts` | 当前 WebContents 的支持能力和临时常驻状态  |
| `src/main/api/plugin/lifecycle.ts`    | 插件能力声明、宿主开关验证与分离/关闭链    |
| `src/main/core/toolsTextFloat.ts`     | 悬浮中转会话、复制追加、容量和临时图片清理 |
| `resources/tools-text-float*`         | 中转窗口界面、受控 preload 和拖放交互      |

临时常驻是默认退出规则中的显式例外：开发者声明支持，用户从宿主右上角开启，嵌入页面先分离；取消时关闭该独立会话。独立便签、图片和中转内容窗口仍按各自规则释放。完整状态说明见 [架构](architecture.md#会话与任务)。

新增或实质修改的函数必须在声明正上方使用多行 JSDoc，包含所有 `@param` 和 `@returns`；主动抛错时补充 `@throws`。关键校验、状态切换、发布、回滚和清理步骤添加说明目的或失败边界的注释。

## 验证与证据

内存相关变更先读 [内存与重开体验规范](memory-development.md)：分别报告工作集、私有提交量和资源存活情况，验证无任务/无临时常驻时的闲置目标，并与同机重开正文耗时联合验收。

根据改动选择检查，不把全部命令当作每次都要执行的清单：

```powershell
pnpm typecheck
pnpm typecheck:setting
pnpm lint

# 单测或相关回归分组
pnpm test tests/main/clipboardSelectionState.test.ts
pnpm test:regressions floating-relay --list

# 需要验证真实窗口流程时
pnpm test:e2e tests/e2e/floating-relay.spec.ts --workers=1

# 完整单测用于发行候选或确有必要的广泛验证
pnpm test --maxWorkers=2

# 收尾维护
pnpm docs:check
pnpm maintain
pnpm maintain:check
git diff --check
```

`pnpm test` 和 `pnpm test:e2e` 自动归档命令、输出、时间与真实退出状态。发行候选在推送前完成完整单测和受影响的源码 E2E，单元回归证据归档在本地。云端执行维护与文档校验、类型检查及打包。纯文档审校主要核对内容、链接和格式；修改随应用分发的教程时，还需验证实际教程页面及构建资源。

Electron E2E 自动启动源码服务和临时实例，并显式隔离数据与旧数据目录。不执行 `electron-builder`、`pnpm build:unpack`，也不使用 `dist/*.app` 作为 E2E 入口；Electron 自带 Chromium，无需另行安装 Playwright 浏览器。专项测试同样传入源码项目，并设置 `TABDO_SETTING_DEV_SERVER_URL=http://127.0.0.1:15177`。

界面验证必须从真实宿主入口进入。等待结果、文件行等正文稳定后，直接截取插件 WebContentsView 的可见区域，不与宿主截图拼接。截图和 trace 写入 `test-results/playwright/`，并由测试入口存入当次归档。设备、DPI、声音和原生材质的边界单独记录。

每轮在 `docs/history/entries/*.json` 记录原因、最终行为、实际命令与结果、失败修正、未验收项和预览状态。历史通过数量是当时的证据，不能直接写作本轮通过。Bug 台账及回归分组的维护要求见 [维护流程](maintenance.md)。

## 本地免安装交付

固定预览位于 `.local/portable-preview/`。需要交付程序资源时，先结束源码验证，再执行：

```powershell
pnpm build
pnpm preview:sync
pnpm test:preview:resources
```

同步前退出预览。脚本只替换程序资源，逐文件核对 `data` 和 `legacy`，并保留回滚副本。同步后通过 `PreviewPortable.cmd` 手动测试，不通过重置配置或重新安装插件验证更新。

核验通过后按[空间收尾规则](workspace-storage.md#预览同步后的收尾)清理已消费的程序暂存及更旧回退，保留最近一次回退与全部 `preservation.json`。当前同步脚本不会自动淘汰这些目录，执行者需同轮完成并记录结果；只修改仓库文档时不运行上述构建和同步命令。

这里只为交付编译资源，不能反过来把打包程序作为源码 E2E 入口。仅修改未打包的仓库文档时，无需重建应用。push、云端构建、Release 前必须先按当前源码审校并更新受影响文档，通过 `pnpm docs:check` 和维护校验。数据重置及这些远端操作分别需要当前用户明确指示；完整流程见 [发布指南](release.md)。
