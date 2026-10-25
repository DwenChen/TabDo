# TabDo 贡献指南

欢迎改进功能、修复问题、补充测试和完善文档。开始前阅读 [项目定位](docs/project.md)、[开发指南](docs/development.md)和[维护流程](docs/maintenance.md)；自动化 Agent 还需遵守 [AGENTS.md](AGENTS.md)。

## 提交问题或建议

通过 [GitHub Issues](https://github.com/DwenChen/TabDo/issues) 提供以下信息：应用版本、Windows 版本、安装方式、最小复现步骤、预期结果和实际结果。界面问题补充缩放比例与截图；日志去除令牌、密钥、私人正文和个人路径。功能建议说明要完成的任务，以及当前流程遇到的困难。

## 实现与验证

1. 检查现有改动及相关历史问题，明确受影响模块，保留工作区中的未提交内容。
2. 按模块规范实现：内置工具遵守 [工具规范](docs/tools-development.md)，设置遵守 [设置规范](docs/settings-development.md)，插件遵守 [插件规范](docs/plugin-development.md)。
3. 新增或实质修改函数时提供完整 JSDoc，并说明关键状态、失败边界和资源清理。
4. 运行类型检查及相关测试；窗口和插件流程使用源码 Electron E2E，所有数据均隔离。不要为 E2E 打包应用。
5. 为修改新增或更新 `docs/history/entries/*.json`，记录原因、行为变化、实际验证、未验收项和预览状态；修复 Bug 时同步台账与回归分组。
6. 执行 `pnpm maintain`、`pnpm maintain:check` 和差异检查，使用仓库 hooks 提交，不使用 `--no-verify`。

## 文档修改

先核对当前代码和清单，再调整措辞。产品说明使用用户能在界面找到的名称；开发规范写清入口、状态和资源归属；历史记录保留当时事实，不追溯改成当前结论。

教程正文维护在 `internal-plugins/setting/src/views/UsageGuide/tutorialChapters.ts`，修改时同步 [仓库教程](docs/usage-guide.md)。一步尽量只完成一个主要操作，长说明拆为步骤或问题解答。保留有效锚点、相对链接、来源和许可；不要手改 `docs/generated/`。

仅修改仓库文档时检查内容、链接、格式和维护索引即可；修改随应用分发的教程或资源时，还需验证源码页面并同步本地预览。测试和人工审校分别记录，不把历史通过数量重复算成本轮结果。

push、云端构建、Release 前的文档审校与必要更新是强制要求。检查当前改动涉及的 README、开发规范、两份教程、更新说明和维护记录，并通过 `pnpm docs:check`、`pnpm maintain:check`；自动检查不能替代人工语言与行为审校，不能跳过 hook 或云端校验。

## 审阅要求

PR 说明具体问题、最终行为、验证证据和已知限制。兼容现有配置、快捷键、固定项、插件数据和数据库；临时资源清理不得删除持久资料或停止全局剪贴板采集。第三方资源保留原始许可并补充 [来源记录](docs/third-party.md)。

插件市场在 [TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 独立收录与发布。历史 CLI、类型资料和旧 API 名称用于兼容，不能作为恢复旧市场、保活或上游服务的依据。

版本遵循语义化版本规则，本仓库从 `1.0.0` 起独立计数。日常修改默认交付到本地预览；push、云端构建、release 和数据重置各自需要当前用户明确指示。
