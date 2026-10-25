# 工具指令与图标清单

本文对应 1.2.0 的内置工具清单，以 `internal-plugins/system/public/plugin.json` 为准：共 37 个功能码、13 个分类、29 个普通文字指令。每个功能最多保留一个中文普通入口，其余入口按文本、图片、文件或窗口匹配。

同一功能可以包含不同输入规则。例如扫码分别接收图片内容和图片文件；悬浮中转接收文本、图片和任意文件，悬浮图片保留独立的图片匹配。普通入口数量不等于功能码数量，也不包含类型匹配规则。

“设置 → 所有指令 → 工具”的功能与匹配页都按清单的 `group` 归类，可搜索分类名；详情页使用同一分组函数。分类只改变展示，成员指令保留原功能码、匹配约束和菜单身份，打开、快捷键、固定、别名及禁用继续作用于该条指令。旧配置、固定项和已安装插件不做批量重写或清空，保留原功能码以支持旧入口。

## 分类与来源

| 分类       | 中文名称       | 功能码                   | 图标来源或原始名称   |
| ---------- | -------------- | ------------------------ | -------------------- |
| 插件管理   | 停止所有插件   | `clear`                  | blocks               |
| 插件管理   | 清除使用记录   | `clear-history`          | rotate-ccw-clock     |
| 电源       | 重启           | `reboot`                 | rotate-cw            |
| 电源       | 关机           | `shutdown`               | power                |
| 电源       | 注销           | `logoff`                 | log-out              |
| 电源       | 睡眠           | `sleep`                  | moon                 |
| 电源       | 锁屏           | `lock-screen`            | lock-keyhole         |
| 网页快开   | 打开网址       | `open-url`               | external-link        |
| 文件操作   | 打开文件夹     | `open-folder`            | folder-open          |
| 窗口工具   | 窗口信息       | `window-info`            | panels-top-left      |
| 文件操作   | 复制路径       | `copy-path`              | folder-symlink       |
| 文件操作   | 复制名称       | `copy-name`              | copy                 |
| 文件操作   | 打开终端       | `open-terminal`          | terminal             |
| 屏幕工具   | 屏幕取色       | `color-picker`           | pipette              |
| 屏幕工具   | 截图           | `screenshot`             | scan-line            |
| 剪贴板     | 剪贴板         | `clipboard`              | clipboard-list       |
| 文件操作   | 重命名         | `file-renamer`           | text-cursor-input    |
| 文件操作   | 解散文件夹     | `folder-break`           | folder-output        |
| 图片识别   | 扫码           | `qrcode-scan`            | qr-code              |
| 图片处理   | 图片标记       | `image-annotate`         | pencil-line          |
| 悬浮与便签 | 悬浮图片       | `float-content`          | picture-in-picture-2 |
| 悬浮与便签 | 悬浮中转       | `floating-relay`         | 原创窗口双向箭头     |
| 悬浮与便签 | 便签           | `sticky-note`            | sticky-note          |
| 文件搜索   | 文件搜索       | `local-search`           | folder-search        |
| 录屏       | 录屏           | `screen-recorder`        | video                |
| 录屏       | 区域录屏       | `screen-recorder-region` | scan                 |
| 录屏       | 停止录屏       | `screen-recorder-stop`   | circle-stop          |
| 图片处理   | 图片处理       | `image-batch`            | images               |
| 图片处理   | 读取图片文件夹 | `image-batch-folder`     | image-plus           |
| 图片处理   | 裁剪图片       | `image-manual-crop`      | crop                 |
| 图片处理   | 合并图片       | `image-merge`            | combine              |
| 视频处理   | 视频处理       | `video-batch`            | clapperboard         |
| 网页快开   | 网页快开       | `web-quick-open`         | globe                |
| 网页快开   | 网页搜索       | `web-search-text`        | search               |
| 网页快开   | 以图搜图       | `web-search-image`       | scan-search          |
| 图片识别   | 文字识别       | `recognize`              | scan-text            |
| 图片识别   | 公式识别       | `latex-recognize`        | sigma                |

媒体页面内部统一为一个“裁剪”操作，支持比例预选和画面框选；`image-manual-crop` 保留原功能身份并直接进入该操作，没有新增同义普通指令。图片和视频沿用各自专属图标和原生任务栏身份。便签相邻色签整理只改变独立窗口的位置，不增加入口或修改配置。

本地图文教程位于“设置 → 关于 → 阅读本地图文教程”，共 12 章，支持目录、搜索和翻页。正文与插图随应用分发，首次启动不自动打开；阅读不会运行练习进程、创建样例文件或调用模拟服务。教程不增加工具功能码，详见 [使用教程](usage-guide.md)。

除表内注明的原创图形外，工具图标来自 [Lucide](https://lucide.dev/license)，固定上游提交 [`c29c276f16590cf017126671535ad8c792be64d8`](https://github.com/lucide-icons/lucide/tree/c29c276f16590cf017126671535ad8c792be64d8)。原始 SVG 位于 `internal-plugins/system/public/icons/lucide/`，ISC / Feather 完整许可保留在 `public/LICENSE.lucide`；逐项映射与配色见 `public/icons/sources.json`。PNG 为 128 × 128 像素，采用白色线条和分类配色，各功能保留独立图形。工具集合使用扳手图标，应用与超级面板使用 TabDo 图标。渲染器与原生窗口均加载本地资源。

## 任务栏与生命周期

嵌入主窗口的可见工具进入正文时，更新窗口标题、原生图标及任务栏身份；返回搜索、切换、隐藏、终止或分离时，撤回宿主工具入口。分离和直接独立打开均使用当前子组件图标。便签、悬浮中转、悬浮图片、图片标记、窗口信息与录屏控制条各自持有图标和任务栏入口。选区、倒计时、录屏输入效果和网页二级菜单属于临时覆盖层，不单独占据任务栏。

任务栏身份不决定会话是否保留。工具和插件默认退出即清理，已登记必要任务完成后销毁旧页面；只有用户开启的临时常驻会话可在隐藏或最小化后保留。便签、悬浮图片和中转内容窗口隐藏、最小化或关闭后销毁。全局剪贴板采集和持久资料不属于会话清理范围。

## 悬浮中转与临时常驻

悬浮中转是临时剪贴板小窗口，只接收明确转入的内容和窗口打开后的新复制，不导入全部历史，也不提供分类。入口位于剪贴板条目及右侧“复制并粘贴”按钮下方；多选时显示数量和转交状态。

| 操作       | 当前行为                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------- |
| 选择       | 左侧整列勾选，支持 Ctrl 切换、Shift 范围选择；Ctrl+A 再按一次取消全选                             |
| 复制与拖出 | 按显示顺序处理同类型条目；混合文本、图片、文件时禁止合并，正文拖出用于粘贴                        |
| 排序       | 新旧排序控制追加位置；删除按钮左侧手柄、Alt 拖动正文、上移/下移按钮可手动排序，之后新复制追加末尾 |
| 图片预览   | 列表显示小缩略图，点击放大；“悬浮固定”和“标记图片”仍使用各自独立窗口                              |
| 删除与清空 | 释放中转条目及所属临时图片，保留历史和原文件；关闭后新开为空窗口                                  |
| 反馈       | 结果提示约 3 秒、禁止提示约 4 秒后自动消失，重复触发重新计时                                      |

`floating-relay` 承接原“悬浮文字”功能；`float-content` 继续匹配图片和图片文件。便签用于独立编辑，右上角提供撤销、重做，正文右键保留剪切、复制、粘贴。

临时常驻属于工具或插件会话的宿主能力，开关固定在标题栏右上角，开发者只声明支持。用户启用时先分离，取消时立即关闭该独立会话；状态不写入配置。它与悬浮中转、便签的内容窗口是不同机制，详见 [插件规范](plugin-development.md#用户临时常驻)。

## 验证

通过 `pnpm test:regressions tools-catalog --list`、`pnpm test:regressions floating-relay --list` 查看覆盖范围。源码 E2E 从真实宿主进入，核对功能身份、匹配、禁用、旧页面释放、分离窗口和原生图标；中转专项另验勾选、排序、限时反馈与实际系统拖放。录屏专项检查控制条及实际视频结果。

列入测试清单不等于本轮通过。执行结果见 [维护记录](generated/CHANGES.md)，跨 DPI、多屏、任务栏合并策略和最终观感单独验收。
