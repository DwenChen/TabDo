# TabDo 第三方插件开发规范

本文规定 TabDo 1.0 第三方插件的清单、会话、任务、持久化与验收要求。市场仅收录声明并实现 `session-v1` 的插件，新代码统一使用 `window.tabdo`。历史 API 别名保留迁移兼容，不能作为恢复旧服务或常驻页面的依据。宿主资源原则见 [工具开发规范](tools-development.md)，性能证据见 [审查记录](performance-audit.md)。

## 清单与入口

插件根目录包含 `plugin.json`、本地入口、图标、必要 preload 和许可证。清单声明 `name`（稳定唯一）、`title`、语义版本、`main`、`logo`、功能 `features`，并加入：

```json
{
  "name": "hello-tabdo",
  "title": "会话示例",
  "version": "1.0.0",
  "main": "index.html",
  "logo": "logo.png",
  "lifecycle": "session-v1",
  "features": [{ "code": "hello", "cmds": ["会话示例"] }]
}
```

每个功能只保留最简单明确的中文普通入口；匹配输入按类型声明，不把同义词堆成多个入口。相关操作归同一功能分类，不同功能有可区分的本地图标。可见窗口提供对应图标。样例源码与市场提交流程见 [TabDo-plugins](https://github.com/DwenChen/TabDo-plugins)。开发时从设置“插件”添加本地 `plugin.json`，不依赖原开发助手或旧发布服务。

## 会话与前台资源

返回搜索、切换功能/插件、隐藏或最小化宿主、刷新正文，以及独立窗口关闭/隐藏/最小化，都会结束对应会话。仅失焦仍可见不算退出。再次进入创建新页面，不缓存旧模型、视图或工作进程。相同文本入口无操作重入可保持当前前台。

宿主提供 `tabdo.lifecycle`：

- `signal: AbortSignal`：退出立即取消前台操作。每次 `await` 后检查 `signal.aborted` 或请求编号，拒绝迟到结果回填、抢焦点、重新显示窗口。
- `addCleanup(callback)`：创建资源后立即登记幂等释放器。包括计时器、事件订阅、请求、Worker、子进程树、模型、张量、画布、对象 URL 和临时缓存；迟到登记会立即释放。可保存返回的释放器，在资源提前不再需要时主动释放。
- `runTask(operation, timeoutMs = 60000)`：登记用户确认的必要任务；最长 600000ms。必须包含完整的计算、写入、发布、回滚和清理链。退出后拒绝新任务。

```js
const scope = window.tabdo.lifecycle
const worker = new Worker('./query.js')
scope.addCleanup(() => worker.terminate())
const stop = setInterval(refreshVisibleContent, 1000)
scope.addCleanup(() => clearInterval(stop))

/** 保存一次已由用户确认的结果。
 * @param {string} value 待持久化内容。
 * @returns {Promise<void>} 保存结束后的 Promise。
 */
async function save(value) {
  await scope.runTask(async (task) => {
    task.signal.throwIfAborted()
    window.tabdo.dbStorage.setItem('saved', value)
  }, 30_000)
}
```

清理器默认五秒上限，单项失败不阻断其他释放。重型模型优先独立进程按次运行；关闭 IPC 并等待所属进程树实际退出。丢弃变量、删除 require 缓存不能代替模型释放或进程退出。不得按进程名称批量结束用户的浏览器、终端、Everything 等外部应用。

TypeScript 作用域接口见 [plugin-lifecycle.d.ts](examples/plugin-lifecycle.d.ts)。可将 `PluginScope` 作为现有 API 类型中 `lifecycle` 的类型；该类型文件随协议维护，不依赖原 CLI 或新的 npm 发布。

## 必要任务与独立窗口

保存、导出、复制/粘贴、文件事务和必要计算，可以在退出前登记后继续。只读刷新、动画、轮询、预加载不能作为保活任务。任务应只捕获纯输入与必要资源，不捕获整个 Vue 页面、DOM 或大列表。队列在排队时登记完整链；失败或取消先回滚，不覆盖已有文件。完成、失败或超时立即释放，最后一个任务结束后宿主销毁旧页面。旧任务只能使用自己的 WebContents 身份，不能按路径关闭随后新会话。

用户主动创建且仍可见的独立子窗口拥有自己的会话，只接收纯内容，不持有父页面模型。窗口隐藏、最小化或关闭即清理；不要用隐藏窗口、音频、悬空 Promise 或无限重试常驻。需要长时用户操作的录制等应有独立可见控制窗口、明确停止入口与完整收尾链。

宿主忽略旧的 `pluginSetting.backgroundRunning` 与“跟随主程序启动”“退出即结束”配置；插件不能要求用户打开这些选项。Provider 和动态指令仅在实际调用时装载，最后一次调用结束后释放隐藏页；Provider 计算由有限任务持有。动态结果应为可序列化纯数据，选择时允许宿主在新会话中重新装载实现。

## 性能、界面与持久化

只在真实进入/请求时初始化重型依赖。列表分页或虚拟化，图像限制尺寸，I/O 与进程并发有上限；串行替换前台请求时先取消并等待旧工作收束。缓存同时限制条数、字节和有效期，不保存全文副本。不得主动 GC 轮询或启动预热常驻页。

界面继承宿主字体、主题与强调色，使用紧凑中文操作名。固定导航与滚动正文分区，真实叠放的菜单/提示/对话框使用不透明主题底色，避免透字；留白继续跟随宿主材质。使用本地图标和许可允许的资源，不依赖在线字体。插件的 Node preload 是可信代码，市场审查不能代替权限隔离或完整代码审计。

配置、收藏、历史和用户文件属于持久数据，使用插件私有 `dbStorage`、`db` 或 `getPath('pluginData')`，不得在退出清理器中删除。不要读取宿主私有数据或其他插件目录。日志和临时文件不得包含令牌、正文或个人数据。

## 提交与验收

提交至 [TabDo-plugins](https://github.com/DwenChen/TabDo-plugins) 的插件目录；发布包和索引由该仓库独立管理。必须包含来源许可、变更说明、协议声明、校验过的下载地址及回归证据；不自动搬运旧市场插件。

至少验证：连续进入/退出后页面和子进程数量恢复基线；必要任务成功/失败/超时清理；退出期间重进不会被旧任务关闭；异步迟到不复活；独立窗口隐藏/最小化/关闭；配置和私有数据保留；Provider 并发调用最后一个完成后回收。使用源码 Electron 和隔离数据，不为 E2E 打包。截图直接截取稳定正文的 WebContentsView。报告工作集/私有内存、测试条件和未覆盖设备，不把一次数值下降当作所有环境的承诺。
