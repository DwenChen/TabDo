# TabDo

<img src="resources/icons/icon.png" width="96" alt="TabDo" />

**v2.0.0** · Windows 10/11 x64。本地工具箱：通过鼠标中键等触发超级面板，使用剪贴板、截图、识别、文件搜索、便签、录屏与媒体处理。

从 [Releases](https://github.com/DwenChen/TabDo/releases/latest) 下载安装包或免安装 ZIP。首次从托盘打开设置，选择并开启超级面板触发键。应用快捷键初始关闭，常用工具默认固定；需要联网或模型的能力在“提供商”中配置。

插件由 [TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 独立管理。第三方插件按需创建会话，退出立即释放前台资源，仅已登记且有时限的必要任务可以继续；无需配置退出保活或跟随主程序启动。旧插件可继续本地安装，旧 API 桥接用于迁移兼容，但必须按新规范适配后才能进入新市场。

本地数据不上传到账户。新安装默认使用 `.tabdo`；检测到已有 `.ztools` 资料时继续原地使用，包含配置、插件、历史与迁移位置记录。切换目录必须经设置页退出后复制校验，完整备份见 [备份与迁移](docs/backup-and-migration.md)。

开发与维护入口：

- [文档总览](docs/README.md)、[开发与源码预览](docs/development.md)
- [第三方插件开发规范](docs/plugin-development.md)、[独立市场维护](docs/plugin-market.md)
- [工具子组件原则](docs/tools-development.md)、[性能与内存审查](docs/performance-audit.md)
- [测试与回归](tests/README.md)、[维护记录](docs/generated/CHANGES.md)、[Bug 台账](docs/generated/BUGS.md)

`pnpm test:e2e` 直接运行源码 Electron，使用隔离数据，不为测试打包。手动免安装预览固定通过 `PreviewPortable.cmd` 启动。日常更新保留预览数据；重置、push、云端构建与 release 仅在每轮用户明确授权后执行。

感谢 [ZToolsCenter/ZTools](https://github.com/ZToolsCenter/ZTools)、原作者 Zing 与社区贡献者。本项目基于上游提交 `6c9dee8` 独立维护。感谢 [原插件市场](https://github.com/ZToolsCenter/ZTools-plugins)、[原插件开发项目](https://github.com/ZToolsCenter/ztools-plugin-cli)和 [API 类型项目](https://github.com/ZToolsCenter/ztools-api-types)提供的基础。保留 [MIT 许可证](LICENSE)及第三方资源各自的版权与许可。
