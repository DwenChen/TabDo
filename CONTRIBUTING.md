# 为 TabDo 贡献

TabDo 独立维护 Windows 桌面工具箱、超级面板与按需插件能力。提交修改前，请阅读 [项目定位](docs/project.md)、[开发指南](docs/development.md)和[维护流程](docs/maintenance.md)。自动化 Agent 必须同时遵守 [AGENTS.md](AGENTS.md)。

## 提交问题或建议

通过 [GitHub Issues](https://github.com/DwenChen/TabDo/issues)提供版本、Windows 版本、安装方式、最小复现步骤、预期和实际结果。界面问题补充缩放比例及相关截图；日志应去除令牌、服务密钥、正文和个人路径。功能建议说明具体任务与现有流程的不足。

## 实现与验证

1. 检查现有改动及相关历史问题，明确受影响模块，保留工作区中的未提交内容。
2. 按模块规范实现：内置工具遵守 [工具规范](docs/tools-development.md)，设置遵守 [设置规范](docs/settings-development.md)，插件遵守 [插件规范](docs/plugin-development.md)。
3. 新增或实质修改函数时提供完整 JSDoc，并说明关键状态、失败边界和资源清理。
4. 运行类型检查及相关测试；窗口和插件流程使用源码 Electron E2E，所有数据均隔离。不要为 E2E 打包应用。
5. 为修改新增或更新 `docs/history/entries/*.json`，记录原因、行为变化、实际验证、未验收项和预览状态；修复 Bug 时同步台账与回归分组。
6. 执行 `pnpm maintain`、`pnpm maintain:check` 和差异检查，使用仓库 hooks 提交，不使用 `--no-verify`。

## 审阅要求

PR 说明具体问题、最终行为、验证证据和已知限制。兼容现有配置、快捷键、固定项、插件数据和数据库；临时资源清理不得删除持久资料或停止全局剪贴板采集。第三方资源保留原始许可并补充 [来源记录](docs/third-party.md)。

插件市场在 [TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 独立收录与发布。历史 CLI、类型资料和旧 API 名称用于兼容，不能作为恢复旧市场、保活或上游服务的依据。

版本遵循语义化版本规则，本仓库从 `1.0.0` 起独立计数。日常修改默认交付到本地预览；push、云端构建、release 和数据重置各自需要当前用户明确指示。
