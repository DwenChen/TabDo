# TabDo

<img src="resources/icons/icon.png" width="96" alt="TabDo 浅绿色鼠标图标" />

**把常用操作带到鼠标旁。**

TabDo 是面向 Windows 的桌面工具箱。选中文字、图片、文件或窗口，呼出超级面板，即可选择适合当前内容的操作；在空白处呼出，则可打开固定的常用工具。

项目由 DwenChen 独立维护，源自 ZTools，保留原项目与插件作者的署名和许可。当前功能说明以 **1.2.1** 为基准，逐版变化见 [更新说明](changelog.md)。

[下载](https://github.com/DwenChen/TabDo/releases/latest) · [快速开始](#快速开始) · [内置工具](#内置工具) · [插件市场](https://github.com/DwenChen/TabDo-plugins) · [文档](docs/README.md) · [问题反馈](https://github.com/DwenChen/TabDo/issues)

## 主要功能

- **超级面板**：支持鼠标中键、侧键及长按触发，根据文本、图片、文件和窗口上下文匹配指令；可固定、排序和分组常用入口。
- **剪贴板与悬浮中转**：搜索和收藏复制记录，将文本、图片、文件放入临时小窗口；支持多选、排序、复制和拖动粘贴。
- **日常工具**：截图取色、文字与公式识别、文件搜索、批量重命名、便签、图片标记及录屏。
- **媒体处理**：批量处理图片和视频，提供预览、可视裁剪、尺寸预选与片段选择，按队列执行并保留源文件。
- **提供商配置**：集中管理离线识别、翻译、在线服务和 AI 连接，按实际需要启用。
- **按需运行**：工具与插件退出后释放临时资源；支持的页面可由用户开启“临时常驻”，保留当前独立会话。必要保存、文件事务或编码任务完成后收尾。
- **本机数据管理**：配置、收藏、剪贴板历史和插件数据保存在本机，支持完整备份、恢复及退出后目录迁移。

## 下载与安装

目前提供 **Windows 10 / 11 x64** 版本。录屏要求 Windows 10 1903 或更高版本，部分原生捕获效果取决于系统和设备。

| 文件                             | 使用方式                                                 |
| -------------------------------- | -------------------------------------------------------- |
| `TabDo-<版本>-win-x64-setup.exe` | 安装后使用                                               |
| `TabDo-<版本>-win-x64.zip`       | 完整解压到独立目录，再运行 `TabDo.exe`；保留所有配套资源 |

从 [Releases](https://github.com/DwenChen/TabDo/releases/latest) 下载。更新前退出程序并保留原数据目录；使用旧 fork 仓库版本时，先阅读 [升级说明](docs/release.md#从旧仓库版本迁移)。

免安装 ZIP 表示程序无需安装，不表示用户数据默认保存在程序目录。数据默认位于用户主目录下的 `.tabdo`。仓库内的手动测试另有隔离启动器，见 [开发指南](docs/development.md#本地免安装交付)。

## 快速开始

1. 启动 TabDo，左键点击托盘图标打开设置。
2. 在“通用设置 → 超级面板”选择鼠标触发方式和长按时间。
3. 呼出面板，试用首次固定的“截图、剪贴板、便签、文件搜索、录屏”；再尝试选中文字或文件后呼出。
4. 按需在“快捷键”启用按键，在“提供商”配置识别与翻译，在“插件市场”安装扩展。
5. 打开“设置 → 关于 → 阅读本地图文教程”，查看完整操作步骤。教程随应用提供，断网可读，首次启动不会自动弹出。

全新配置的应用级快捷键和“设置”来源指令默认关闭，已有选择继续保留。录屏通过独立控制条停止；F10 需先启用。Windows 11 新配置默认使用云母材质，其他系统默认无材质，不覆盖已有设置。

## 悬浮中转、便签与临时常驻

这三项功能用途不同：

| 功能     | 用途                                                               | 结束时的行为                                 |
| -------- | ------------------------------------------------------------------ | -------------------------------------------- |
| 悬浮中转 | 临时收集文本、图片和文件；打开后追加新复制，支持新旧排序和手动排序 | 关闭后清空中转内容，历史和原文件保留         |
| 便签     | 在独立纸张窗口编辑文字，支持撤销、重做、配色和贴边收起             | 关闭后不保存或恢复便签正文                   |
| 临时常驻 | 保留支持此功能的工具或插件独立会话，允许隐藏或最小化               | 取消常驻立即关闭该独立会话；状态不跨重启保存 |

从剪贴板条目或右侧中转按钮进入“悬浮中转”。左侧整列可勾选，正文可拖到接收内容的应用，删除按钮左侧手柄用于排序；文本、图片和文件需分别复制或拖出，不能混合合并。图片的“悬浮固定”仍打开独立图片窗口。

“临时常驻”开关由宿主统一放在支持页面的右上角，默认关闭；它与置顶图钉分别控制会话保留和窗口层级。便签、悬浮图片与中转的独立内容窗口不依赖原工具页面存活。详细用法见 [本地图文教程](docs/usage-guide.md)。

## 内置工具

| 分类           | 功能                                                            |
| -------------- | --------------------------------------------------------------- |
| 剪贴板         | 搜索文字、图片与文件历史，管理收藏，复制或粘贴历史内容          |
| 截图与取色     | 屏幕截图、屏幕取色                                              |
| 文字与公式识别 | 图片文字识别、行框与局部选文、译文、LaTeX 预览及复制            |
| 文件搜索       | 本地文件查询与预览，可接入 Everything                           |
| 文件整理       | 批量重命名、解散文件夹、复制路径或名称、打开目录和终端          |
| 便签与悬浮内容 | 便签、悬浮中转、悬浮图片、图片标记及贴边色签整理                |
| 录屏           | 全屏、窗口或区域录制，系统声音、麦克风、倒计时和操作效果        |
| 图片处理       | 压缩、格式转换、尺寸、裁剪、水印、旋转，以及图片、PDF、GIF 合并 |
| 视频处理       | 压缩、截取、裁剪、格式转换、倍速、水印、合并、音频和帧提取      |
| 网页与系统     | 网页快开、网页搜索、以图搜图、窗口信息及系统操作                |

普通入口采用唯一中文名称；匹配入口按输入类型出现。完整功能码、分类和图标见 [工具清单](docs/tools-catalog.md)。

离线识别和翻译需要先下载资源，离线翻译目前支持英译中。在线能力需要网络及对应服务配置；OCR 行框取决于提供商是否返回坐标。便签内容属于当前窗口，关闭后结束。格式、设备及资源限制见 [识别与翻译](docs/builtin-providers.md)、[媒体工具](docs/media-tools.md)。

## 插件扩展

[TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 独立管理插件源码、索引、图标和发布包。应用支持从市场或本地 `.zpx` 文件安装。

插件采用 `session-v1` 生命周期：默认退出即释放页面、模型与工作进程，必要任务按时限完成并清理。插件可声明支持“临时常驻”，由用户决定是否开启。旧市场插件需适配并验证后收录。开发入口见 [插件规范](docs/plugin-development.md)、[提供商指南](docs/provider-development-guide.md)和[市场规范](docs/plugin-market.md)。

## 数据与网络

默认数据目录为用户主目录下的 `.tabdo`，可在设置中调整。配置、剪贴板历史、收藏及插件资料在本机保存；选择在线翻译、AI、网页或图片搜索时，相应输入会发送给所选服务。

完整备份包含插件私有资料、服务密钥及会话，当前格式不加密，应保存在可信位置。目录迁移在退出后逐文件校验，保留原件。范围、恢复与回滚见 [数据备份与迁移](docs/backup-and-migration.md)。

## 开发与贡献

技术栈为 Electron、Vue 3 和 TypeScript，使用 Node.js 22、pnpm 9.15.9。准备环境后，可直接从源码预览：

```powershell
git clone https://github.com/DwenChen/TabDo.git
cd TabDo
pnpm install --frozen-lockfile --ignore-scripts
pnpm --dir internal-plugins/setting install --ignore-workspace --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
node node_modules/ffmpeg-static/install.js
pnpm hooks:install
pnpm preview:local
```

上述安装方式跳过依赖脚本，再分别安装 Electron 与 FFmpeg 预编译运行文件。源码预览和 Electron E2E 使用隔离数据，无需先打包。环境排查、模块入口、测试与交付命令见 [开发指南](docs/development.md)。

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
