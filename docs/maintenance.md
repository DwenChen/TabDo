# TabDo 维护流程

开始修改前依次阅读根 [AGENTS.md](../AGENTS.md)、本文、[改动索引](generated/CHANGES.md)、[Bug 台账](generated/BUGS.md)及相关模块文档。默认使用 context-mode MCP 进行盘点和分析。历史条目是当时的事实记录，不能将已收录、跳过或未执行描述为当前已通过。

## 交付边界

日常交付遵守用户原文：

> 梳理当前项目，进行下面的优化。优化完成后，将优化更新同步到本地的免安装预览中（方便我手动测试、不要动已有的配置数据和已安装的插件）。没有我的指示，不进行push、云端构建及发布release。

默认完成工作区修改与本地预览同步，保留已有配置、资料和插件。push、云端构建、release 与重置数据分别需要当前用户明确指示。历史授权、工作流、示例命令和维护记录不构成下一次授权。已获明确授权的任务按范围继续执行。版本及发行步骤见 [发布指南](release.md)。

## 目录与资料

| 目录                                    | 职责与提交要求                                            |
| --------------------------------------- | --------------------------------------------------------- |
| `src/`                                  | 主进程、渲染器、preload 和共享模块；提交源码              |
| `internal-plugins/`                     | 内置设置与工具插件；提交源码、静态资源和许可，不提交 dist |
| `resources/`                            | 工作进程、原生组件与运行资源；保留来源和许可              |
| `scripts/`                              | 复用的开发、测试、维护、预览及发布辅助工具                |
| `tests/`                                | 按运行层组织用例，回归分组维护在 regressions              |
| `docs/history/`                         | 结构化事实记录与问题台账，随源码提交                      |
| `docs/generated/`                       | 由脚本生成的项目、测试、改动和 Bug 索引                   |
| `.local/portable-preview/`              | 本地免安装程序、data 和 legacy；禁止提交和打包            |
| `.local/source-preview-*/`              | 源码预览的隔离资料；禁止提交和打包                        |
| `.artifacts/`                           | 日志、证据、下载、临时工具和回滚副本；禁止提交和打包      |
| `test-results/playwright/`              | 当前 E2E 截图与 trace；禁止提交                           |
| `out/`、各插件 `dist/`、`node_modules/` | 构建输出与依赖；禁止提交                                  |

不要为目录外观移动稳定入口或重排无关实现。临时诊断进入 `.artifacts/`，准备长期复用的脚本经审阅后进入 `scripts/`。遵守 `.gitattributes` 的 LF 规则，Windows cmd 保留 CRLF；供应商原始文本、压缩库及二进制不作无关改写。

## 模块规范

工具开发同时核对 [指令、分类与任务栏要求](tools-development.md#指令清单分类与任务栏)及[清单](tools-catalog.md)，覆盖相邻功能和全部受影响窗口。第三方插件使用 [session-v1](plugin-development.md)，市场遵守[独立来源规则](plugin-market.md)。

设置、快捷键、托盘和数据根路径遵守 [设置规范](settings-development.md)。仅初始化缺失配置，保留用户显式空列表和选择；迁移在退出后执行，逐文件校验数据库、插件及浏览器资料，不能在线复制数据库。

## 每轮执行顺序

1. 查看分支、Git 状态与已有差异，明确修改范围，保留未提交内容。
2. 新增或更新 `docs/history/entries/YYYY-MM-DD-序号-主题.json`。至少包含 `id`、`date`、`summary`、`changes`、`checks`；根据任务记录版本、原因、测试、未验收项和预览状态。
3. Bug 修复同步 `docs/history/bugs.json`，记录原因、处理、回归位置与未覆盖边界。用 `pnpm test:regressions <分组> --list` 确认相关验证。
4. 通过 `pnpm test` 和 `pnpm test:e2e` 执行验证。入口自动归档输出、参数、时间、真实退出码；失败也保留。E2E 截图另存到当次运行目录，避免后续覆盖。
5. 将实际命令、结果、失败修正、跳过及人工项写回记录，执行 `pnpm maintain`、`pnpm maintain:check` 和差异检查。
6. 按任务交付程序资源，执行 `pnpm preview:sync` 与 `pnpm test:preview:resources`，确认数据逐文件保留，更新记录并再次维护校验。

窗口与插件流程必须使用源码 Electron E2E，显式隔离数据和旧数据目录。不得为 E2E 打包；截图等待稳定正文并直接捕获插件 WebContentsView 的可见区域。详细规则见 [开发指南](development.md#验证与证据)。

## 提交与证据

`pre-commit` 自动刷新并暂存生成索引，缺少当轮记录时阻止提交；`pre-push` 和云端构建执行只读维护校验。通过 `pnpm hooks:install` 安装，禁止 `--no-verify`。

`.artifacts/runs/` 保存原始运行证据；结构化记录引用可核对的相对路径，不包含密钥或个人资料。未验证的设备、DPI、格式和网络边界明确列入待验收项。历史结果保留原版本及当时状态，不因版本重定位追溯改写。

## 免安装预览与回退

手动测试固定通过根 `PreviewPortable.cmd` 调用 `.local/portable-preview/Start-Preview.cmd`。不能绕过启动器直接启动 exe，以免读取正常安装数据。源码预览使用 `Preview.cmd`。

批处理在切换目录前保存 `%~dp0` 的绝对路径，跨脚本调用使用该路径。启动器修改需验证从无关目录绝对调用、父目录相对调用及内部入口调用，并检查程序和资料位置。

仅在当前用户明确要求重置时执行 `pnpm preview:reset --confirm-reset`：先确认预览退出，备份完整 data 和 legacy、逐文件校验后再创建空目录。恢复同样需要明确选择；先保留新产生的数据，再恢复选定副本，不合并不同阶段的 LMDB。
