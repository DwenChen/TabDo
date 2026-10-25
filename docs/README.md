# TabDo 文档

这里汇总 TabDo 的现行使用说明与开发规范。当前内容按 1.2.1 审校；逐版变化和当时的验证结果分别保存在更新说明与维护记录中。

- 初次使用：从 [README](../README.md) 和 [本地图文教程](usage-guide.md) 开始。
- 修改代码：先读 [开发指南](development.md) 和 [维护流程](maintenance.md)，再查对应模块规范。
- 自动化任务：遵守 [AGENTS.md](../AGENTS.md) 与 [Agent 执行指南](agent-guide.md)。

## 使用与数据

| 文档                                      | 内容                               |
| ----------------------------------------- | ---------------------------------- |
| [产品说明](../README.md)                  | 下载、首次启动、超级面板与内置工具 |
| [本地图文教程](usage-guide.md)            | 与应用内教程对应的 12 章操作说明   |
| [工具清单](tools-catalog.md)              | 功能分类、指令身份和图标来源       |
| [识别与翻译](builtin-providers.md)        | 内置提供商配置、离线资源和服务边界 |
| [媒体工具](media-tools.md)                | 图片、视频、录屏及格式限制         |
| [数据备份与迁移](backup-and-migration.md) | 完整备份、恢复、目录迁移与回滚     |
| [版本发布与升级](release.md)              | 发布产物、版本规则及旧版本迁移     |

## 开发人员

从 [贡献指南](../CONTRIBUTING.md) 和 [开发指南](development.md) 开始，再根据修改范围查阅对应规范。

| 文档                                        | 内容                               |
| ------------------------------------------- | ---------------------------------- |
| [架构](architecture.md)                     | 进程、模块职责、数据流和资源所有权 |
| [维护流程](maintenance.md)                  | 记录、验证、提交和预览交付要求     |
| [工具开发](tools-development.md)            | 子组件入口、界面、任务与退出清理   |
| [悬浮内容与会话](floating-content.md)       | 中转、便签、图片窗口与临时常驻边界 |
| [设置开发](settings-development.md)         | 设置归类、默认值、快捷键和数据路径 |
| [插件开发](plugin-development.md)           | 清单、`session-v1`、API 与验收     |
| [插件市场](plugin-market.md)                | 索引、收录、校验与独立发布         |
| [提供商开发](provider-development-guide.md) | 翻译及 OCR 契约与调用方式          |
| [HTTP API](http-api.md)                     | 本机控制接口与认证                 |
| [测试指南](../tests/README.md)              | 测试入口、数据隔离和证据归档       |
| [脚本清单](../scripts/README.md)            | 稳定维护、预览和发布辅助入口       |

## 如何判断文档的时效

README、教程和模块规范描述当前行为；`changelog.md` 描述各版本变化；`docs/history/` 与生成索引保留当时的原因、实现和验证事实。历史中的功能名称、单选规则、引导流程或版本号可能已经被后续改动替代，不能据此覆盖现行规范。

涉及行为差异时，核对当前源码、清单与最新维护记录；修改教程时，同时维护应用内正文和仓库教程。项目定位、兼容承诺和版本规则见 [项目说明](project.md)。

## 维护证据与来源

- [项目和测试索引](generated/PROJECT_INDEX.md)、[改动记录](generated/CHANGES.md)、[Bug 台账](generated/BUGS.md)由结构化记录生成，不直接编辑。
- [回归分组](../tests/regressions/README.md)组织历史故障的自动化覆盖和人工验收边界。
- [性能审查](performance-audit.md)与[交互表面审查](interaction-surfaces.md)保留测量条件和已知限制，历史结果不能替代当前验证。
- [第三方来源与致谢](third-party.md)记录原项目、插件作者、依赖和许可位置。

本机日志、截图、下载文件、配置和备份保存在忽略目录 `.artifacts/` 或 `.local/`，不纳入源码提交与发行包。
