import { app, BrowserWindow, webContents, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

const IDLE_DELAY_MS = 10_000
const IDLE_WORKING_SET_TARGET_BYTES = 100_000_000
let requestReclaim: (() => void) | undefined

/**
 * 运行时资源创建或最终关闭后重新判定闲置；未安装策略时无需处理。
 * @returns 无返回值；不会停止工作进程或清理持久数据。
 */
export function requestIdleMemoryReclaim(): void {
  requestReclaim?.()
}

/**
 * 合并闲置事件，只在稳定闲置后归还冷工作集；活动恢复立即撤销未执行的回收。
 */
export class IdleMemoryReclaimer {
  private timer: ReturnType<typeof setTimeout> | undefined
  private cancel: (() => void) | undefined
  private stopped = false
  private generation = 0

  /**
   * 注入实时闲置判定和一次性回收操作，不持有工具页面、模型或业务资料。
   * @param isIdle 当前窗口、页面及任务是否均已退出。
   * @param reclaim 启动一次回收并返回取消器，结束时通知策略解除引用。
   * @param delayMs 连续闲置等待时间。
   * @returns 新的事件驱动回收控制器。
   */
  constructor(
    private readonly isIdle: () => boolean,
    private readonly reclaim: (finished: () => void) => () => void,
    private readonly delayMs = IDLE_DELAY_MS
  ) {}

  /**
   * 新活动取消旧回收，最后一次退出事件开始新的等待；不进行周期性内存压缩。
   * @returns 无返回值。
   */
  request(): void {
    const generation = ++this.generation
    clearTimeout(this.timer)
    this.timer = undefined
    this.cancel?.()
    this.cancel = undefined
    if (this.stopped || !this.isIdle()) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      // 等待期间的窗口、必要任务及原生进程状态必须重新核对。
      if (!this.stopped && this.isIdle()) {
        let completed = false
        const cancel = this.reclaim(() => {
          completed = true
          if (this.generation === generation) this.cancel = undefined
        })
        if (!completed) this.cancel = cancel
      }
    }, this.delayMs)
    this.timer.unref()
  }

  /**
   * 应用退出时撤销等待及所属辅助进程，禁止异步回调重新安排回收。
   * @returns 无返回值。
   */
  stop(): void {
    this.stopped = true
    this.generation++
    clearTimeout(this.timer)
    this.timer = undefined
    this.cancel?.()
    this.cancel = undefined
  }
}

/**
 * 稳定闲置时先解除临时输入引用，Windows仅在超过目标时归还冷工作集。
 * @param host 宿主常驻页面，只有它仍存活时才允许进入闲置。
 * @param hasRuntimeTasks 原生工具、媒体、录屏和提供商运行时是否仍有任务或收尾。
 * @param releaseIdleResources 释放已结束会话的宿主引用，不删除持久数据。
 * @returns 解除全部订阅并停止回收的清理器；工作集处理仅用于Windows。
 */
export function startIdleMemoryReclaimer(
  host: WebContents,
  hasRuntimeTasks: () => boolean,
  releaseIdleResources: () => void = () => {}
): () => void {
  let helper: ChildProcess | undefined
  const subscriptions = new Set<() => void>()
  /**
   * 必要任务持有的隐藏页面也阻止回收；临时常驻会话不会被当作已经退出。
   * @returns 当前是否仅有隐藏宿主且没有原生工具任务。
   */
  const isIdle = (): boolean =>
    !host.isDestroyed() &&
    !hasRuntimeTasks() &&
    BrowserWindow.getAllWindows().every((window) => !window.isVisible() || window.isMinimized()) &&
    webContents.getAllWebContents().every((contents) => contents === host)

  /**
   * 启动有超时的私有辅助进程，准备完成后才发送当前所属PID与创建时间。
   * @param finished 辅助进程结束后解除控制器引用的回调。
   * @returns 取消本次辅助进程的幂等清理器。
   */
  const reclaim = (finished: () => void): (() => void) => {
    // 先解除临时输入引用；已达预算时保留热页，减少下一次打开的调入。
    releaseIdleResources()
    const workingSetBytes =
      process.platform === 'win32'
        ? app.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize * 1024, 0)
        : 0
    if (
      process.platform !== 'win32' ||
      workingSetBytes < IDLE_WORKING_SET_TARGET_BYTES ||
      !isIdle()
    ) {
      finished()
      return () => {}
    }
    const reclaimScript = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked/resources/reclaim-idle-memory.ps1')
      : path.join(app.getAppPath(), 'resources/reclaim-idle-memory.ps1')
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-File', reclaimScript],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore']
      }
    )
    helper = child
    const timeout = setTimeout(() => child.kill(), 15_000)
    timeout.unref()
    let ready = false
    let output = ''
    let cancelled = false
    child.stdout?.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4096)
      if (ready || (!output.includes('ready\n') && !output.includes('ready\r\n'))) return
      ready = true
      // PowerShell准备期间可能重新打开工具；禁止使用启动时的旧PID快照。
      if (!isIdle() || helper !== child) {
        child.kill()
        return
      }
      const targets = app.getAppMetrics().map(({ pid, creationTime }) => ({ pid, creationTime }))
      child.stdin?.end(JSON.stringify(targets) + '\n')
    })
    child.stdin?.on('error', () => {})
    child.once('error', (error) => console.warn('[IdleMemory] 无法归还冷工作集:', error.message))
    child.once('close', () => {
      clearTimeout(timeout)
      if (helper === child) helper = undefined
      finished()
      // 保留是否成功的诊断，权限或系统策略失败不能伪报内存已经回收。
      if (!cancelled) {
        const released = output.match(/released:(\d+)\/(\d+)/)
        if (released) console.log(`[IdleMemory] 已归还冷工作集 ${released[1]}/${released[2]}`)
        else console.warn('[IdleMemory] 冷工作集回收未完成')
      }
    })
    return () => {
      cancelled = true
      clearTimeout(timeout)
      if (helper === child) helper = undefined
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }
  }
  const policy = new IdleMemoryReclaimer(isIdle, reclaim)
  /**
   * 资源活动事件复用同一个策略入口。
   * @returns 无返回值。
   */
  const request = (): void => policy.request()
  requestReclaim = request

  /**
   * 跟踪单个窗口活动，关闭时立即解除引用，避免策略自身积累旧窗口。
   * @param window 当前应用新建或已经存在的窗口。
   * @returns 无返回值。
   */
  const watchWindow = (window: BrowserWindow): void => {
    /**
     * 窗口关闭或策略停止后撤销所属订阅，再重新核对闲置。
     * @returns 无返回值。
     */
    const cleanup = (): void => {
      window.removeListener('show', request)
      window.removeListener('hide', request)
      window.removeListener('minimize', request)
      window.removeListener('restore', request)
      window.removeListener('closed', cleanup)
      subscriptions.delete(cleanup)
      request()
    }
    window.on('show', request)
    window.on('hide', request)
    window.on('minimize', request)
    window.on('restore', request)
    window.once('closed', cleanup)
    subscriptions.add(cleanup)
    request()
  }
  /**
   * 将新窗口纳入活动判定。
   * @param _event Electron窗口创建事件。
   * @param window 新建的所属窗口。
   * @returns 无返回值。
   */
  const onWindow = (_event: Electron.Event, window: BrowserWindow): void => watchWindow(window)
  /**
   * 隐藏页面和必要任务也阻止闲置，销毁后再安排回收。
   * @param _event Electron页面创建事件。
   * @param contents 新建的所属页面。
   * @returns 无返回值。
   */
  const onContents = (_event: Electron.Event, contents: WebContents): void => {
    /**
     * 销毁或停止时移除页面引用与事件订阅。
     * @returns 无返回值。
     */
    const cleanup = (): void => {
      contents.removeListener('destroyed', cleanup)
      subscriptions.delete(cleanup)
      request()
    }
    contents.once('destroyed', cleanup)
    subscriptions.add(cleanup)
    request()
  }
  app.on('browser-window-created', onWindow)
  app.on('web-contents-created', onContents)
  for (const window of BrowserWindow.getAllWindows()) watchWindow(window)
  for (const contents of webContents.getAllWebContents()) onContents({} as Electron.Event, contents)

  /**
   * 退出时先停策略，再撤销监听；清理自身不能触发新辅助进程。
   * @returns 无返回值。
   */
  const stop = (): void => {
    policy.stop()
    if (requestReclaim === request) requestReclaim = undefined
    app.removeListener('browser-window-created', onWindow)
    app.removeListener('web-contents-created', onContents)
    app.removeListener('will-quit', stop)
    for (const cleanup of subscriptions) cleanup()
    subscriptions.clear()
  }
  // before-quit可能被用户取消；仅真正退出时永久停止策略。
  app.once('will-quit', stop)
  return stop
}
