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

“使用引导”位于“设置 → 关于”，标题与其他分节左对齐，不增加工具同义指令或改变36个功能码。首次全新资料直接显示可拒绝的全屏欢迎，关于入口可重进。50个小步骤按11章组织，手动复制和中键面板、剪贴板搜索收藏悬浮、便签样式新建收展分别教学；连续步骤保留当前工具现场，真实控件、菜单选项和宿主搜索框动态聚焦，由实际操作与结果自动判定。模型识别、翻译和 Everything 使用明确标注的隔离教学接口，无须安装或配置账号；无系统指令课程。详见[使用引导](usage-guide.md)。

图标来自免费开源的 [Lucide](https://lucide.dev/license)，固定上游提交 [`c29c276f16590cf017126671535ad8c792be64d8`](https://github.com/lucide-icons/lucide/tree/c29c276f16590cf017126671535ad8c792be64d8)。原始 SVG 位于 `internal-plugins/system/public/icons/lucide/`，完整 ISC / Feather 许可保留在 `public/LICENSE.lucide`，逐项映射与配色见 `public/icons/sources.json`。衍生 PNG 为 128×128 白色线条与按类别配色的圆角底，每个功能独立文件和图形，工具总图标为扳手。渲染器与原生窗口均使用本地 PNG，运行时不联网。

## 任务栏与生命周期

嵌入主窗口的可见工具进入正文时更新窗口标题、原生图标及任务栏身份；返回搜索、切换、隐藏、终止或分离时撤回宿主任务栏入口。分离和直接独立打开均使用当前子组件图标；便签、文本条目浮窗、悬浮图片、图片标记、窗口信息与录屏控制条各自持有图标和任务栏入口。选择区域、倒计时、录屏输入效果和网页二级选择菜单属于临时覆盖层，继续跟随其任务结束，不单独占据任务栏。

任务栏显示不改变已有退出规则：后台立即释放前台资源，必要任务收束后销毁旧页面；独立便签/图片隐藏、最小化和关闭后销毁。全局剪贴板采集、配置、收藏、历史及插件不属于清理范围。

## 验证

`pnpm test:regressions tools-catalog --list` 查看专项。源码 `tools-catalog` E2E 从真实宿主逐项打开全部 14 个嵌入正文及媒体直达入口，检查分组内单条禁用、匹配规则、旧页面关闭、分离及独立内容窗口；Windows 同时通过 WM_GETICON 检查实际原生图标句柄。`tools-recorder-web` 实际录制并检查控制条任务栏与图标。跨 DPI、多屏、任务栏合并策略与用户观感仍保留人工验收；实际执行结果按日期保存在维护历史中。

悬浮中转是独立的小窗口临时剪贴板，接收明确转入的文本、图片和文件以及窗口打开后的新复制，不导入全部历史。支持从新到旧/从旧到新、缩略图点击放大、左侧整列勾选多选、同类型批量复制和正文拖出、删除/清空；删除按钮左侧提供排序手柄，也支持Alt拖动正文和上移/下移。手动排序后新复制追加末尾，混合内容合并操作给出禁止反馈，不提供分类；结果提示约3秒、禁止提示约4秒后自动消失，重复操作重新计时。关闭销毁中转内容与临时图片，剪贴板历史不受影响。剪贴板右侧“复制并粘贴”下方及条目提供入口，侧栏按钮随多选显示数量、选中样式与转交状态。剪贴板与中转的左侧勾选区域覆盖条目高度，不能触发拖出。图片“悬浮固定”仍打开独立图片窗口，“标记图片”保持独立。

`floating-relay` 匹配文本、图片与任意文件；原“悬浮文字”由中转实现。`float-content` 保留图片及图片文件匹配。便签右上角提供撤销/重做，右键只保留剪切、复制、粘贴。临时常驻开关由宿主固定在标题栏右上角，开发者只声明支持；用户默认关闭，启用先分离，取消立即关闭所属独立会话并回收，关闭/宿主退出同样释放，状态不落库。
