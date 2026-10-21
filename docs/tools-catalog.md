# 工具指令与图标清单

清单保留 36 个功能码，按 13 类展示。普通文字指令保留 28 个，每个功能只有一个中文名称；其余功能由文本、图片、文件或窗口匹配进入。同一功能的不同输入类型仍是独立匹配规则，例如扫码保留图片与图片文件两种入口。悬浮内容统一文字入口，匹配文字和图片时仍明确显示对应内容。2026-10-21 设置精简移除了“添加唤醒黑名单”及其运行时拦截；历史去重前有 57 个普通文字指令。

“设置 → 所有指令 → 工具”的功能与匹配页都按清单的 `group` 归类，可搜索分类名；详情页使用同一分组函数。分类只改变展示，成员指令保留原功能码、匹配约束和菜单身份，打开、快捷键、固定、别名及禁用继续作用于该条指令。旧配置、固定项和已安装插件不做批量重写或清空，保留原功能码以支持旧入口。

## 分类与来源

| 分类       | 中文名称       | 功能码                   | Lucide 原始图标      |
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
| 悬浮与便签 | 悬浮内容       | `float-content`          | picture-in-picture-2 |
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

图标来自免费开源的 [Lucide](https://lucide.dev/license)，固定上游提交 [`c29c276f16590cf017126671535ad8c792be64d8`](https://github.com/lucide-icons/lucide/tree/c29c276f16590cf017126671535ad8c792be64d8)。原始 SVG 位于 `internal-plugins/system/public/icons/lucide/`，完整 ISC / Feather 许可保留在 `public/LICENSE.lucide`，逐项映射与配色见 `public/icons/sources.json`。衍生 PNG 为 128×128 白色线条与按类别配色的圆角底，每个功能独立文件和图形，工具总图标为扳手。渲染器与原生窗口均使用本地 PNG，运行时不联网。

## 任务栏与生命周期

嵌入主窗口的可见工具进入正文时更新窗口标题、原生图标及任务栏身份；返回搜索、切换、隐藏、终止或分离时撤回宿主任务栏入口。分离和直接独立打开均使用当前子组件图标；便签、悬浮图片、图片标记、窗口信息与录屏控制条各自持有图标和任务栏入口。选择区域、倒计时、录屏输入效果和网页二级选择菜单属于临时覆盖层，继续跟随其任务结束，不单独占据任务栏。

任务栏显示不改变已有退出规则：后台立即释放前台资源，必要任务收束后销毁旧页面；独立便签/图片隐藏、最小化和关闭后销毁。全局剪贴板采集、配置、收藏、历史及插件不属于清理范围。

## 验证

`pnpm test:regressions tools-catalog --list` 查看专项。源码 `tools-catalog` E2E 从真实宿主逐项打开全部 14 个嵌入正文及媒体直达入口，检查分组内单条禁用、匹配规则、旧页面关闭、分离及独立内容窗口；Windows 同时通过 WM_GETICON 检查实际原生图标句柄。`tools-recorder-web` 实际录制并检查控制条任务栏与图标。跨 DPI、多屏、任务栏合并策略与用户观感仍保留人工验收；本轮实际执行结果见历史记录。
