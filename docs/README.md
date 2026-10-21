# 项目文档入口

Agent 和贡献者先读 [维护必读](maintenance.md)及根 [AGENTS.md](../AGENTS.md)。

- [项目与全部测试索引](generated/PROJECT_INDEX.md)：目录职责、所有自动化文件及历史回归分组。
- [历次改动与验证](generated/CHANGES.md)：版本化事实记录；[原始条目](history/entries/)。
- [Bug 台账与待验收边界](generated/BUGS.md)：已修复原因、处理及未覆盖项。
- [历史故障回归集](../tests/regressions/README.md)：自动化场景和人工验收。
- [架构说明](architecture.md)、[开发与预览](development.md)、[备份迁移](backup-and-migration.md)。
- [第三方插件开发规范](plugin-development.md)、[独立插件市场](plugin-market.md)：session-v1 资源归属、提交流程和索引协议。
- [设置开发约定](settings-development.md)：页面归类、快捷键默认值、托盘与数据目录迁移边界。
- [内置工具开发必读](tools-development.md)：会话资源、必要任务和原生进程退出。
- [性能审查与资源预算](performance-audit.md)：宿主、面板、插件与 37 个工具功能的逐组件审查、优化和实测边界。
- [图片、视频与录屏移植](media-tools.md)：参考来源、三栏布局、功能与依赖、任务和格式边界。
- [内置提供商与工具](builtin-providers.md)：集中配置、离线资源、旧插件兼容与验证边界。
- [脚本入口索引](../scripts/README.md)。

原始本机日志、截图、数据、插件和回退资源只在 `.artifacts/`、`.local/` 留存，不放入本仓库的可提交文档。
