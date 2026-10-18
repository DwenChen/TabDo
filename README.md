# ZTools 本地版

基于 ZTools 的个人精简版。当前为第一版维护补丁 **v1.0.1**，面向超级面板、插件工作流和完整本地数据备份。

## 下载与使用

从 [本仓库 Releases](https://github.com/DwenChen/ZTools/releases/latest) 下载。本版仅发布 Windows 10/11 x64 安装包和免安装 ZIP。首次使用可从托盘进入设置，开启超级面板并选择鼠标触发方式。

## 本版变化

- 移除账户注册/登录、云同步、MCP 服务、官方模型、插件市场顶部 Banner、主搜索框及相关设置、悬浮球。
- 保留超级面板的指令固定与排序、文本/图片/文件/窗口匹配、插件及系统应用启动、翻译和 OCR。
- 保留插件宿主、插件子输入框、插件市场匿名浏览安装、自定义模型、本地启动、剪贴板、HTTP 服务和插件开发能力。
- 使用「数据备份与迁移」导出和恢复设置、配置、插件文件、插件数据库及附件、插件专属数据和本地会话。
- 关于页标记第一版并致谢上游，更新只查询本仓库 GitHub Releases。

账户依赖功能（评论发布、官方令牌与支付等）随账户系统移除。已存在的插件继续复用原 SDK 和运行时模块。

## 本地预览

已准备依赖的工作区中双击 **Preview.cmd**，或执行 「pnpm preview:local」。不执行本地构建、原生编译或打包；复用预编译 Electron 和原生模块，按需加载源码。预览数据使用仓库内的 「\_preview-data」。

首次准备与测试说明见 [开发、预览与发布](docs/development.md)。独立免安装成品使用云端 Release 的 Windows ZIP。

## 文档

- [项目结构与裁剪边界](docs/architecture.md)
- [数据备份与迁移](docs/backup-and-migration.md)
- [开发、验证与云端发布](docs/development.md)
- [HTTP API](docs/http-api.md)
- [提供商开发](docs/provider-development-guide.md)
- [版本记录](changelog.md)

备份包含私密设置与密钥，请妥善保存；恢复会退出应用并保留旧数据回滚副本。具体范围和跨平台限制见备份文档。

## 致谢与许可

感谢 [ZToolsCenter/ZTools](https://github.com/ZToolsCenter/ZTools)、原作者 Zing 及社区贡献者。本版基于上游提交 「6c9dee8」，独立维护与发布。保留 [MIT 许可证](LICENSE) 和原版权声明。
