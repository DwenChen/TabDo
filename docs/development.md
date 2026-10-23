# TabDo 开发指南

本文面向维护宿主、内置工具和设置界面的开发人员。贡献前阅读 [贡献指南](../CONTRIBUTING.md)与[维护流程](maintenance.md)；自动化 Agent 另读 [执行指南](agent-guide.md)。

## 环境准备

正式验证环境为 Windows x64，使用 Node.js 22、pnpm 9.15.9 和仓库锁定的 Electron。根项目与设置插件分别维护锁文件，二者都需要安装依赖。

```powershell
git clone https://github.com/DwenChen/TabDo.git
cd TabDo
pnpm install --frozen-lockfile --ignore-scripts
pnpm --dir internal-plugins/setting install --ignore-workspace --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm hooks:install
pnpm preview:local
```

该准备方式下载预编译 Electron，避免默认重编译原生模块。若需要重建原生能力，按相应资源的来源说明单独执行，并将中间文件放入 `.artifacts/native/`。不要更新依赖版本或锁文件来掩盖环境问题。

## 源码预览

`pnpm preview:local` 或 `Preview.cmd` 通过 `scripts/preview-main.cjs` 直接加载源码。主进程 TypeScript 在内存中转换，Vue 页面由本机 Vite 服务提供；无需生成 `out`、`dist` 或应用安装包。

| 服务       | 回环地址          |
| ---------- | ----------------- |
| 宿主渲染器 | `127.0.0.1:5174`  |
| 设置插件   | `127.0.0.1:15177` |
| 工具插件   | `127.0.0.1:15178` |

源码预览使用 `.local/source-preview-data/` 与 `.local/source-preview-legacy/` 隔离数据。窗口退出后，预览服务器保持运行以支持恢复操作后的自动重启；在终端按 Ctrl+C 结束整个预览。直接启动设置页面无法提供完整宿主桥接。

## 选择修改入口

先在 [架构](architecture.md)和[项目索引](generated/PROJECT_INDEX.md)定位模块。纯规则放入共享模块；系统调用、进程和文件发布由主进程或工作进程承担；渲染器维护页面状态和交互。

- 内置工具：遵守 [工具开发规范](tools-development.md)，同步功能清单、路由、首帧尺寸、原生图标与任务栏身份。
- 设置、快捷键或数据路径：遵守 [设置开发规范](settings-development.md)，保留已有明确选择。
- 第三方插件：从 [插件开发规范](plugin-development.md)开始，使用独立 [插件市场](plugin-market.md)。
- 翻译和 OCR：遵守 [Provider 契约](provider-development-guide.md)，避免在常驻宿主中加载模型。

新增或实质修改的函数必须在声明正上方使用多行 JSDoc，包含所有 `@param` 和 `@returns`；主动抛错时补充 `@throws`。关键校验、状态切换、发布、回滚和清理步骤添加说明目的或失败边界的注释。

## 验证与证据

```powershell
pnpm typecheck
pnpm typecheck:setting
pnpm test
pnpm test:regressions --list
pnpm test:e2e
pnpm maintain
pnpm maintain:check
```

按改动范围选择相关测试；首版或发行候选执行完整单元测试及受影响的源码 E2E。`pnpm test` 与 `pnpm test:e2e` 自动归档输出、参数、时间和真实退出状态。具体命令、结果、失败修正及未执行项写入本轮 `docs/history/entries/*.json`。

Electron E2E 自动启动源码服务和临时实例，并显式隔离数据与旧数据目录。不执行 `electron-builder`、`pnpm build:unpack`，也不使用 `dist/*.app` 作为 E2E 入口；Electron 自带 Chromium，无需另行安装 Playwright 浏览器。专项测试同样传入源码项目，并设置 `TABDO_SETTING_DEV_SERVER_URL=http://127.0.0.1:15177`。

界面截图等待实际结果、文件行等稳定正文，再直接捕获插件 WebContentsView 的当前可见区域。截图和 trace 写入 `test-results/playwright/`，测试入口另存到当次归档。设备、DPI、声音和原生材质的未覆盖部分据实记录，不能从一次截图推导完整设备兼容性。

## 本地免安装交付

`.local/portable-preview/` 是固定的手动测试目录，通过 `PreviewPortable.cmd` 启动并使用隔离资料。交付时运行 `pnpm build` 准备程序资源，再运行 `pnpm preview:sync` 与 `pnpm test:preview:resources`。此处编译用于交付，与源码 E2E 分开。

同步只替换程序资源，对 `data` 和 `legacy` 逐文件比较并保留回滚副本。不要通过直接启动 exe、重置配置或重新安装插件来验证资源更新。重置数据、push、云端构建和 release 均遵守当前用户的明确授权；发布步骤见 [发布指南](release.md)。
