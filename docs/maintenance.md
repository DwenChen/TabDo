# 项目维护必读

所有 Agent 开始修改前必须依次阅读根目录 `AGENTS.md`、本文、[当前变更](generated/CHANGES.md)、[Bug 台账](generated/BUGS.md)和相关模块文档。内置工具另读 [tools-development.md](tools-development.md)。历史状态不代表当前工作区已验证，不能把“清单已收录”“测试被跳过”写成“已通过”。默认使用 context-mode MCP 盘点与分析。

## 用户长期要求

以下原文作为日常修改的默认交付约束：

> 梳理当前项目，进行下面的优化。优化完成后，将优化更新同步到本地的免安装预览中（方便我手动测试、不要动已有的配置数据和已安装的插件）。没有我的指示，不进行push、云端构建及发布release。

默认只改进工作区并同步本地预览，保留用户配置、数据和已安装插件。**每次 push、触发云端构建、发布 release 或重置数据都必须有当前用户的明确指示。** 历史发布记录、脚本、本文的流程示例、Git hook、CI 与自动整理均不构成下一轮授权。2026-10-18 的 v1.1.0 是一次明确授权的发布；预览重置也仅限该轮用户确认，之后重新恢复默认保留数据。

## 目录规则

| 目录                                           | 职责                                                          | 提交 / 打包                                                |
| ---------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/`                                         | Electron 主进程、共享模块、宿主渲染器和预加载                 | 提交源码；发布使用编译输出                                 |
| `internal-plugins/setting`、`system`           | 随包设置与工具插件；`public` 放静态运行资源，`src` 放界面逻辑 | 源码与许可提交；`dist` 不提交                              |
| `resources/`                                   | 宿主 preload、worker、原生二进制和来源许可                    | 必需资源提交并随程序发布                                   |
| `scripts/`                                     | 稳定开发、维护、测试、预览、构建辅助入口                      | 提交；脚本职责见 [scripts/README.md](../scripts/README.md) |
| `tests/main`、`renderer`、`scripts`、`e2e`     | 按运行层归集自动化测试，保持路径稳定                          | 提交；实际执行由入口统一归档                               |
| `tests/regressions/`                           | 按历史故障编排交叉回归集、人工边界                            | 提交，增改用例时同步清单                                   |
| `docs/history/entries/`、`bugs.json`           | 每轮可审阅的事实记录和问题状态                                | 提交；禁止凭猜测补造历史结果                               |
| `docs/generated/`                              | 全量测试、改动和 Bug 自动索引                                 | 提交；由脚本生成，禁止直接编辑                             |
| `.local/portable-preview/`                     | 最新免安装程序与隔离的 `data`、`legacy`                       | 本机私有，不提交、不打包                                   |
| `.local/source-preview-data/`                  | 源码手动预览的隔离数据                                        | 本机私有，不提交、不打包                                   |
| `.artifacts/runs/`                             | 每次测试的日志、命令参数、时间和真实退出码                    | 本机证据，不提交、不打包                                   |
| `.artifacts/history/`                          | 历次根目录日志、一次性脚本和迁移清单                          | 本机归档，保留原件                                         |
| `.artifacts/backups/`、`downloads/`、`native/` | 程序回退、用户数据备份、下载与原生构建中间文件                | 本机私有，不提交、不打包                                   |
| `test-results/playwright/`                     | 当前源码 E2E 截图和失败 trace                                 | 不提交，按根 AGENTS.md 的截图规范                          |
| `out/`、各插件 `dist/`、`node_modules/`        | 编译产物和依赖                                                | 不提交；不要用来替代源码 E2E                               |

不要为视觉上的“整齐”移动稳定源码入口、合并不同职责测试或改变 import。不得把日志、截图、安装包、个人配置或脚本草稿重新散落到项目根目录；一次性工作使用 `.artifacts/` 子目录，准备复用的脚本经审阅后进入 `scripts/`。

维护文本遵循 `.gitattributes` 的 LF 约定，Windows `.cmd` 保留 CRLF；自动整理只统一 CRLF 换行，不重排业务实现，不修改二进制或供应商副本。第三方压缩库保留原始许可证并排除源码 lint。

## 每轮修改的自动收尾

1. 开始前查看 Git 状态、现有变更与相关回归组，保留用户未提交内容；为本轮新增 `docs/history/entries/YYYY-MM-DD-序号-主题.json`。
2. 记录至少包含 `id`、`date`、`summary`、`changes`、`checks`，可补 `version`、`tests`。Bug 修复同步 `docs/history/bugs.json` 的原因、处理、覆盖位置和未验收边界。
3. 用 `pnpm test:regressions <分组> --list` 选择相关验证；必要时全量单测。修改宿主和插件窗口流程必须使用源码 Electron E2E，数据与旧数据目录都隔离；不为 E2E 本地打包。
4. `pnpm test` 和 `pnpm test:e2e` 经 `scripts/run-tests.cjs` 运行，自动把输出和真实退出状态存入 `.artifacts/runs/`；E2E 还会复制本轮截图和 trace 到对应运行目录的 `playwright/`，避免下一轮覆盖失败证据。成功或失败都会刷新索引与整理旧根目录临时材料。指定文件时参数原样转发，不能把包管理器 `--` 误当筛选而意外跑全量。
5. 将本轮实际命令、通过/失败/跳过、未执行项、人工验证与预览状态写回记录，然后运行 `pnpm maintain`、`pnpm maintain:check`。不要仅复制上一轮的通过数。
6. 按授权同步预览：为交付编译资源后执行 `pnpm preview:sync` 和 `pnpm test:preview:resources`。日常同步只切换程序资源，逐文件比较用户数据并保留回滚。完成后更新本轮记录并再次 `pnpm maintain`。

本仓库 `pre-commit` 自动整理并暂存生成索引；缺少本轮变更记录会阻止提交。`pre-push` 与云端构建执行只读索引/路径检查。安装 hooks 使用 `pnpm hooks:install`；不得为绕过维护要求使用 `--no-verify`。这些机制自动归集文件与证据，Bug 根因和人工结论仍由执行修改的 Agent 据实填写。

## 本地预览和数据回退

手动测试免安装程序使用根目录 **PreviewPortable.cmd**，它调用 `.local/portable-preview/Start-Preview.cmd`，显式设置隔离数据目录。不要绕过启动器直接启动 exe 而读到正常安装目录的数据。源码预览仍用 **Preview.cmd**。

只有用户明确要求重置时才运行 `pnpm preview:reset --confirm-reset`。该命令先检查目标程序退出，把完整 `data` 和 `legacy` 移入 `.artifacts/backups/portable-profile/<时间>/`，逐文件校验后创建空目录，不改程序。恢复也需要用户明确选择：退出预览，保留重置后新产生的数据，再把对应备份目录移回；不要覆盖或合并不同阶段的 LMDB 文件。

## 有明确授权时的一次发布

先完成本轮记录、版本与 changelog、本地类型检查、相关测试、源码 E2E、维护检查及预览核验；发布前检查暂存清单，确认 `.local`、`.artifacts` 和用户数据均不在 Git 中。版本 tag 与 `package.json` 必须一致，不覆盖已发布 tag，不强推。

随后提交并推送，在确认远端提交 SHA 后手动触发 `.github/workflows/release.yml`，由 GitHub 托管 Windows x64 runner 构建；发布步骤在构建通过后为该提交创建与版本一致的 tag。已有流程也支持明确授权后推送新 tag 触发，两种入口仅选其一，避免重复发布。跟踪到构建和发布完成，检查运行的提交 SHA、release tag、安装包、免安装 ZIP、blockmap、`latest.yml` 及版本；失败应修复明确原因并重新验证，不能把“已触发”写成“已发布”。本地 E2E 不运行打包器，云端发布构建与源码验证分属不同步骤。下一轮再次恢复“未经指示不 push、不云端构建、不 release”。
