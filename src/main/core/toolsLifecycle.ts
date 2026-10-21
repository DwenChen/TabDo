import { app, type WebContents } from 'electron'
import path from 'node:path'
import { getInternalPluginPath } from './internalPlugins'

interface ToolsOwner {
  name: string
  path: string
  logo?: string
}
const retiringViews = new Map<WebContents, { owner: ToolsOwner; finish: () => void }>()
const RELEASE_TIMEOUT_MS = 615_000

/**
 * 只对随包内置工具启用强制资源回收，避免按名称误处理外部插件。
 * @param pluginPath 插件实际目录。
 * @returns 是否为当前运行环境中的内置工具目录。
 */
export function isToolsPluginPath(pluginPath: string | null | undefined): boolean {
  if (!pluginPath) return false
  const actual = path.resolve(pluginPath)
  const expected = path.resolve(getInternalPluginPath('system'), app.isPackaged ? '' : 'public')
  return process.platform === 'win32'
    ? actual.toLowerCase() === expected.toLowerCase()
    : actual === expected
}

/**
 * 在工具退出缓存后保留必要任务的 IPC 身份，防止保存到宿主或其他插件的命名空间。
 * @param contents 发起 IPC 的旧会话。
 * @returns 仍在收束的工具身份，未登记时返回 undefined。
 */
export function getRetiringToolsOwner(contents: WebContents): ToolsOwner | undefined {
  return retiringViews.get(contents)?.owner
}

/**
 * 用户强制结束插件时关闭仍在收束的工具任务。
 * @param pluginPath 可选的工具路径，省略时关闭全部旧会话。
 * @returns 本次强制关闭的旧会话数量。
 */
export function stopRetiringToolsViews(pluginPath?: string): number {
  const entries = [...retiringViews.values()].filter(
    (entry) => !pluginPath || entry.owner.path === pluginPath
  )
  for (const entry of entries) entry.finish()
  return entries.length
}

/**
 * 收束已退出的工具会话，等待必要任务后关闭其独立 WebContents，释放整个页面运行时。
 * @param contents 需要释放的旧会话，不能按插件路径查找后续新会话。
 * @param onReleased 销毁后清除宿主生命周期标记的回调。
 * @param owner 必要任务继续调用持久化 API 时使用的插件身份。
 * @returns 无返回值。
 */
export function releaseToolsView(
  contents: WebContents,
  onReleased: () => void,
  owner: ToolsOwner
): void {
  if (retiringViews.has(contents) || contents.isDestroyed()) return
  let released = false
  /**
   * 关闭当前旧视图，防止重复退出或迟到任务销毁新打开的工具。
   * @returns 无返回值。
   */
  const finish = (): void => {
    if (released) return
    released = true
    retiringViews.delete(contents)
    clearTimeout(timer)
    contents.removeListener('destroyed', finish)
    if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false })
    onReleased()
  }
  const timer = setTimeout(finish, RELEASE_TIMEOUT_MS)
  timer.unref()
  // 身份记录不属于可复用视图缓存，旧会话只允许完成自己的已登记任务。
  retiringViews.set(contents, { owner, finish })
  contents.once('destroyed', finish)
  // 后台清理和保存必须及时执行；页面销毁后其计时器和 JS 堆一并回收。
  contents.setBackgroundThrottling(false)
  void contents
    .executeJavaScript('(window.tabdo?.lifecycle || window.toolsLifecycle)?.dispose()')
    .catch((error) => console.warn('[PluginLifecycle] 旧会话清理失败:', error))
    .finally(finish)
}
