# TabDo

<img src="resources/icons/icon.png" width="96" alt="TabDo 浅绿色鼠标图标" />

**把常用操作带到鼠标旁。**

TabDo 是一款面向 Windows 的桌面工具箱，以鼠标驱动的超级面板为主要入口。选中文字、图片、文件或窗口后，呼出面板即可执行匹配的操作；没有选区时，可以快速打开固定的常用工具。

本仓库由 DwenChen 独立维护，正式版本从 **1.0.0** 开始计数。TabDo 源自 ZTools，持续保留原项目与插件作者的署名和许可，详见 [致谢](#许可与致谢)。

[下载](https://github.com/DwenChen/TabDo/releases/latest) · [快速开始](#快速开始) · [内置工具](#内置工具) · [插件市场](https://github.com/DwenChen/TabDo-plugins) · [文档](docs/README.md) · [问题反馈](https://github.com/DwenChen/TabDo/issues)

## 主要功能

- **超级面板**：支持鼠标中键、侧键及长按触发，根据文本、图片、文件和窗口上下文匹配指令；可固定、排序和分组常用入口。
- **日常工具**：集成剪贴板历史、截图取色、文字与公式识别、文件搜索、重命名、便签、图片标记及录屏。
- **媒体处理**：提供图片和视频批量处理、常驻预览、可视裁剪、尺寸预选与视频片段选择，按队列执行并保留源文件。
- **提供商配置**：集中管理离线识别、翻译、在线服务和 AI 连接，按实际需要启用。
- **按需运行**：工具与插件退出后释放临时资源；已登记的必要保存、文件事务或编码任务完成后结束。
- **本机数据管理**：配置、收藏、剪贴板历史和插件数据保存在本机，支持完整备份、恢复及退出后目录迁移。

## 下载与安装

目前提供 **Windows 10 / 11 x64** 版本。录屏要求 Windows 10 1903 或更高版本，部分原生捕获效果取决于系统和设备。

| 文件                             | 使用方式                                 |
| -------------------------------- | ---------------------------------------- |
| `TabDo-<版本>-win-x64-setup.exe` | 安装程序，适合日常使用                   |
| `TabDo-<版本>-win-x64.zip`       | 完整解压后运行 `TabDo.exe`，保留配套资源 |

前往 [Releases](https://github.com/DwenChen/TabDo/releases/latest)下载，版本内容见 [更新说明](changelog.md)。旧 fork 仓库的 `2.x` 用户需手动安装首版并保留原数据；具体步骤见 [升级说明](docs/release.md#从旧仓库版本迁移)。

## 快速开始

1. 启动 TabDo，左键点击托盘图标打开设置。
2. 在“通用设置 → 超级面板”选择鼠标触发方式和长按时间。
3. 呼出面板，试用首次固定的“截图、剪贴板、便签、文件搜索、录屏”；再尝试选中文字或文件后呼出。
4. 在“快捷键”中启用所需按键，在“提供商”中配置识别与翻译，在“插件市场”中安装扩展。

首次启动时，应用级快捷键全部关闭，“设置”来源指令默认关闭。已有配置、显式空列表和用户选择继续保留。录屏可通过独立控制条停止，F10 仅在启用对应快捷键后生效。

## 内置工具

| 分类           | 功能                                                            |
| -------------- | --------------------------------------------------------------- |
| 剪贴板         | 搜索文字、图片与文件历史，管理收藏，复制或粘贴历史内容          |
| 截图与取色     | 屏幕截图、屏幕取色                                              |
| 文字与公式识别 | 图片文字识别、行框与局部选文、译文、LaTeX 预览及复制            |
| 文件搜索       | 本地文件查询与预览，可接入 Everything                           |
| 文件整理       | 批量重命名、解散文件夹、复制路径或名称、打开目录和终端          |
| 便签与悬浮内容 | 创建便签、悬浮文字或图片、图片标记及贴边色签整理                |
| 录屏           | 全屏、窗口或区域录制，系统声音、麦克风、倒计时和操作效果        |
| 图片处理       | 压缩、格式转换、尺寸、裁剪、水印、旋转，以及图片、PDF、GIF 合并 |
| 视频处理       | 压缩、截取、裁剪、格式转换、倍速、水印、合并、音频和帧提取      |
| 网页与系统     | 网页快开、文本搜索、以图搜图、窗口信息及系统操作                |

普通入口采用唯一中文名称；匹配入口按输入类型出现。完整功能码、分类和图标见 [工具清单](docs/tools-catalog.md)。

离线识别和翻译需要先下载资源，离线翻译目前支持英译中。在线能力需要网络及对应服务配置；OCR 行框取决于提供商是否返回坐标。便签内容属于当前窗口，关闭后结束。格式、设备及资源限制见 [识别与翻译](docs/builtin-providers.md)、[媒体工具](docs/media-tools.md)。

## 插件扩展

[TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 独立管理插件源码、索引、图标和发布包。应用支持从市场或本地 `.zpx` 文件安装。

插件采用 `session-v1` 生命周期：退出时取消前台活动，释放页面、模型与工作进程；必要任务必须有明确时限和完整清理链。旧市场插件需适配并验证后收录。开发入口见 [插件规范](docs/plugin-development.md)、[Provider 指南](docs/provider-development-guide.md)和[市场规范](docs/plugin-market.md)。

## 数据与网络

默认数据目录为用户主目录下的 `.tabdo`，可在设置中调整。配置、剪贴板历史、收藏及插件资料在本机保存；选择在线翻译、AI、网页或图片搜索时，相应输入会发送给所选服务。

完整备份包含插件私有资料、服务密钥及会话，当前格式不加密，应保存在可信位置。目录迁移在退出后逐文件校验，保留原件。范围、恢复与回滚见 [数据备份与迁移](docs/backup-and-migration.md)。

## 开发与贡献

技术栈为 Electron、Vue 3 和 TypeScript，使用 Node.js 22、pnpm 9.15.9。

```powershell
git clone https://github.com/DwenChen/TabDo.git
cd TabDo
pnpm install --frozen-lockfile --ignore-scripts
pnpm --dir internal-plugins/setting install --ignore-workspace --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm hooks:install
pnpm preview:local
```

源码预览与 Electron E2E 直接加载源码并隔离数据，无需为测试打包应用。完整环境和验证命令见 [开发指南](docs/development.md)。

- 开发人员：[贡献指南](CONTRIBUTING.md)、[架构](docs/architecture.md)、[维护流程](docs/maintenance.md)。
- 自动化 Agent：[AGENTS.md](AGENTS.md)、[执行指南](docs/agent-guide.md)。
- 文档与状态：[文档总览](docs/README.md)、[改动记录](docs/generated/CHANGES.md)、[Bug 台账](docs/generated/BUGS.md)。
- 版本与交付：[项目定位](docs/project.md)、[发布指南](docs/release.md)。

## 许可与致谢

项目源码遵循 [MIT 许可证](LICENSE)。原项目、第三方库、模型和原生组件的版权及许可分别保留。

感谢 [ZToolsCenter/ZTools](https://github.com/ZToolsCenter/ZTools) 原作者 Zing、版权持有人 lzx8589561 及社区贡献者。TabDo 基于上游提交 `6c9dee8` 发展；同时感谢 [原插件市场](https://github.com/ZToolsCenter/ZTools-plugins)、[插件开发项目](https://github.com/ZToolsCenter/ztools-plugin-cli)与 [API 类型项目](https://github.com/ZToolsCenter/ztools-api-types)。

感谢以下原插件作者和团队提供的实现、界面与交互参考：

| 作者或团队               | 原插件                                                |
| ------------------------ | ----------------------------------------------------- |
| Zing                     | clipboard、web-quick-open                             |
| nichijoux                | file-renamer                                          |
| yyxxd                    | batch-rename                                          |
| meidlinger               | dir-break                                             |
| 福州猿力信息科技有限公司 | qrcode-helper                                         |
| leco                     | clipboard-image-paintbrush                            |
| 麦兜                     | sticky-note                                           |
| the_tree                 | local-search-neo                                      |
| kaineooo                 | f-provider                                            |
| ScottLim                 | web-search                                            |
| uTools 团队              | screen-recorder、录频助手、图片批量处理、视频批量处理 |

各原插件链接、固定版本、复用范围和许可位置见 [第三方来源与致谢](docs/third-party.md)。独立维护及版本重定位不改变这些来源与署名。
