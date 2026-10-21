# 贡献指南

本仓库维护 TabDo 本地精简版，功能边界见 [架构说明](docs/architecture.md)。请先阅读 [开发与测试](docs/development.md) 及 AGENTS.md。

所有修改还必须遵守 [维护必读](docs/maintenance.md)：为本轮留下结构化改动与验证记录，使用自动测试归档和 `pnpm maintain` 收尾；提交前自动整理，默认保留预览数据且不 push、云端构建或发布。

第三方插件按 [TabDo 开发规范](docs/plugin-development.md) 实现，并通过 [独立市场](https://github.com/DwenChen/TabDo-plugins) 提交。旧保活/随宿主启动设置不再支持。

涉及内置“工具”插件时，必须先阅读并遵守 [工具子组件开发原则](docs/tools-development.md)，按会话登记资源及必要任务，并验证退出后的实际资源回收。

修改前后运行类型检查和相关单元测试；插件与窗口流程通过源码 Electron E2E 验证。测试不得使用真实用户数据目录。无需为验证执行本地打包。新增/实质修改函数按 AGENTS.md 补充 JSDoc。

问题反馈请提交到 [本仓库 Issues](https://github.com/DwenChen/TabDo/issues)。版本从 1.0.0 起独立计数，遵循语义化版本规则。
