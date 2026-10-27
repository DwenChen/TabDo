# 第三方来源与致谢

TabDo 由 DwenChen 独立维护，源自 ZTools 及其社区插件生态。独立仓库和版本编号不改变原始作品的版权、署名与许可范围。项目级 [MIT 许可证](../LICENSE)保留原作者版权，第三方组件继续适用各自许可。

## 原项目与开发基础

感谢 [ZToolsCenter/ZTools](https://github.com/ZToolsCenter/ZTools) 原作者 Zing、版权持有人 lzx8589561 及社区贡献者。TabDo 基于上游提交 `6c9dee8` 发展，并保留可追溯的 Git 历史。

同时感谢 [ZTools-plugins](https://github.com/ZToolsCenter/ZTools-plugins)、[ztools-plugin-cli](https://github.com/ZToolsCenter/ztools-plugin-cli)和 [ztools-api-types](https://github.com/ZToolsCenter/ztools-api-types)。本仓库中的历史 CLI 与类型资料用于迁移参考，新的插件开发以 TabDo 文档和 `session-v1` 协议为准。

## 演示录屏来源

[Recordly](https://github.com/webadderallorg/Recordly/tree/109ca3a13c362e969d9add25d1f93406c36dba2a)（webadderall，源自 Siddharth Vaddem 的 OpenScreen），固定提交 `109ca3a13c362e969d9add25d1f93406c36dba2a`，1.4.0。2026-10-27 移植编辑、捕获、光标与项目能力，并改为中文和 TabDo 会话、主题、快捷键。完整 AGPLv3、依赖声明与修改范围见 [组件说明](../internal-plugins/system/presentation/README.md)。来源与许可告知集中在应用“设置 → 关于”，不使用上游名称作为产品名。组合分发须同时满足 AGPLv3，不以项目原 MIT 说明覆盖上游许可。

## 插件作者与适配来源

下表作者依据原始插件清单记录。链接指向原始项目；实际复用范围和固定版本以本仓库资源说明及许可文件为准。

| 原插件                                                                                                                                                                        | 原作者或团队             | TabDo 中的参考或适配范围             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------ |
| [clipboard](https://github.com/ZToolsCenter/ZTools-plugins/tree/02cc9ea00801da59c492c509e6d78a347e7d9df0/plugins/clipboard)                                                   | Zing                     | 剪贴板列表、分类和交互               |
| [file-renamer](https://github.com/ZToolsCenter/ZTools-plugins/tree/c8475ad7944ffdb78843cc5f56886d1443d0a724/plugins/file-renamer)                                             | nichijoux                | 文件重命名规则与功能参考             |
| [batch-rename](https://github.com/ZToolsCenter/ZTools-plugins/tree/af6dc6df9bae6dc61022dabeb3a1d0c54e6de8f2/plugins/batch-rename)                                             | yyxxd                    | 重命名面板、图标与操作栏             |
| [dir-break](https://github.com/ZToolsCenter/ZTools-plugins/tree/c8475ad7944ffdb78843cc5f56886d1443d0a724/plugins/dir-break)                                                   | meidlinger               | 解散文件夹与冲突处理交互             |
| [qrcode-helper](https://github.com/ZToolsCenter/ZTools-plugins/tree/c8475ad7944ffdb78843cc5f56886d1443d0a724/plugins/qrcode-helper)                                           | 福州猿力信息科技有限公司 | 二维码识别交互参考                   |
| [clipboard-image-paintbrush](https://github.com/ZToolsCenter/ZTools-plugins/tree/c8475ad7944ffdb78843cc5f56886d1443d0a724/plugins/clipboard-image-paintbrush)                 | leco                     | 悬浮图片和标记窗口界面               |
| [sticky-note](https://github.com/ZToolsCenter/ZTools-plugins/tree/c8475ad7944ffdb78843cc5f56886d1443d0a724/plugins/sticky-note)                                               | 麦兜                     | 便签纸色与窗口界面                   |
| [local-search-neo](https://github.com/ZToolsCenter/ZTools-plugins/tree/691870b5b45a209f34b3626b162efeb00f177601/plugins/local-search-neo)                                     | the_tree                 | 文件搜索分类、分栏和设置界面         |
| [f-provider](https://github.com/ZToolsCenter/ZTools-plugins/tree/ae2bd2cc678b743f7683c3fb40b6606940acc3d1/plugins/f-provider)                                                 | kaineooo                 | 翻译协议、OCR、公式识别与资源适配    |
| [web-quick-open](https://github.com/ZToolsCenter/ZTools-plugins/tree/af6dc6df9bae6dc61022dabeb3a1d0c54e6de8f2/plugins/web-quick-open)                                         | Zing                     | 网页快开功能参考                     |
| [web-search](https://github.com/ZToolsCenter/ZTools-plugins/tree/af6dc6df9bae6dc61022dabeb3a1d0c54e6de8f2/plugins/web-search)                                                 | ScottLim                 | 网页搜索功能参考                     |
| [screen-recorder](https://github.com/ZToolsCenter/ZTools-plugins/tree/af6dc6df9bae6dc61022dabeb3a1d0c54e6de8f2/plugins/screen-recorder)、录频助手、图片批量处理、视频批量处理 | uTools 团队              | 录屏原生引擎及媒体处理界面、交互参考 |

媒体参考包的版本与 SHA-256 见 [媒体来源](media-tools.md#来源)；这些包的来源记录不将闭源文件重新许可为 MIT。未将原插件完整功能、账号或会员服务作为 TabDo 能力提供。

## 许可位置

| 资源                                       | 说明与许可                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 剪贴板                                     | `internal-plugins/system/LICENSE.clipboard`                                                              |
| 重命名、文件搜索、二维码解码、图标与高亮库 | `internal-plugins/system/public/LICENSE.*`、`internal-plugins/system/public/vendor/LICENSE.*`            |
| 悬浮窗口                                   | [来源说明](../resources/tools-floating-ui.md)、`resources/LICENSE.floating-ui`                           |
| 翻译与识别适配                             | [来源说明](../resources/providers/README.md)、`resources/providers/LICENSE`                              |
| 录屏引擎                                   | [来源与参数](../resources/recorder/README.md)、`resources/recorder/LICENSE`                              |
| 截图原生组件                               | [构建与来源](../resources/lib/win/SCREENSHOT.md)、`resources/lib/win/LICENSE.screenshot`                 |
| Lucide 图标                                | [图标清单](tools-catalog.md)、`public/icons/sources.json` 与 `public/LICENSE.lucide`（相对工具插件目录） |

Electron、Vue、TypeScript、LMDB、Sharp、PDFKit、FFmpeg、jsQR、KaTeX、Lucide 及其他依赖共同构成本项目的技术基础。依赖版本以锁文件为准；分发时保留生产依赖的完整许可。FFmpeg 可执行文件的许可与其 npm 包许可分别记录，不能相互替代。下载的模型及原生资源按各自说明使用和校验。

新增或替换第三方资源时，应同时记录准确来源、版本或提交、复用范围、修改情况与许可位置；供应商原始声明保留原文。
