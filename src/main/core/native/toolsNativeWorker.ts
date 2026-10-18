import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import workerPath from '../../../../resources/tools-native-worker.cjs?asset'
import screenshotPath from '../../../../resources/lib/win/ztools_screenshot.node?asset'
import nativePath from '../../../../resources/lib/win/ztools_native.node?asset'
import type { ScreenCaptureOptions, ScreenCaptureResult } from './index'

type NativeToolResult = ScreenCaptureResult & { hex?: string | null; error?: string }
const workers = new Set<NativeToolWorker>()
let primedScreenshot: NativeToolWorker | null = null
let activeScreenshot: NativeToolWorker | null = null
let primeTimer: ReturnType<typeof setTimeout> | undefined
let colorPicker: NativeToolWorker | null = null

/**
 * 持有单次原生工具进程，结果只在该进程退出、原生资源已由系统回收后发布。
 */
class NativeToolWorker {
  private child: ChildProcess
  private result: NativeToolResult = { success: false }
  private callback: ((result: NativeToolResult) => void) | null = null

  /**
   * 启动独立 Node 模式 Electron 进程，工具资源不会装载到宿主进程。
   * @param modulePath 本次工具所需的原生模块绝对路径。
   * @returns 新建的进程会话。
   * @throws 启动进程失败时抛出。
   */
  constructor(modulePath: string) {
    this.child = spawn(process.execPath, [workerPath, modulePath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      windowsHide: true
    })
    workers.add(this)
    this.child.on('message', (message: { type?: string; result?: NativeToolResult }) => {
      if (message.type !== 'result' || !message.result) return
      this.result = message.result
      this.stop()
    })
    this.child.on('error', (error) => {
      this.result = { success: false, error: error.message }
      this.stop()
    })
    this.child.once('close', () => {
      // 先释放宿主引用，再交付结果，回调可以安全地立即开始下一次操作。
      workers.delete(this)
      if (primedScreenshot === this) primedScreenshot = null
      if (activeScreenshot === this) activeScreenshot = null
      if (colorPicker === this) colorPicker = null
      const callback = this.callback
      this.callback = null
      callback?.(this.result)
    })
  }

  /**
   * 向工具进程发送操作；通信失败时结束进程，避免等待永不抵达的回调。
   * @param type 工具操作种类。
   * @param options 截图选项。
   * @param callback 最终结果回调；预抓帧时可以省略。
   * @returns 无返回值。
   */
  request(
    type: 'prime' | 'capture' | 'color-picker',
    options?: ScreenCaptureOptions,
    callback?: (result: NativeToolResult) => void
  ): void {
    if (callback) this.callback = callback
    try {
      this.child.send({ type, options }, (error) => {
        if (!error) return
        this.result = { success: false, error: error.message }
        this.stop()
      })
    } catch (error) {
      // 发送与进程退出可能交错，失败也必须通过关闭事件交付结果。
      this.result = { success: false, error: String(error) }
      this.stop()
    }
  }

  /**
   * 强制停止本会话的独立进程，系统负责回收全部原生资源。
   * @returns 无返回值。
   */
  stop(): void {
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill()
  }
}

/**
 * 预抓截图帧，最多保留两秒；超期直接退出进程释放整帧缓存。
 * @returns 预抓帧请求是否成功排入独立进程。
 * @throws 工作进程或 IPC 无法启动时抛出。
 */
export function primeToolsScreenshot(): boolean {
  if (activeScreenshot) return false
  clearTimeout(primeTimer)
  primedScreenshot?.stop()
  const worker = new NativeToolWorker(screenshotPath)
  primedScreenshot = worker
  worker.request('prime')
  primeTimer = setTimeout(() => {
    if (primedScreenshot === worker) primedScreenshot = null
    worker.stop()
  }, 2_000)
  primeTimer.unref()
  return true
}

/**
 * 执行原生截图，复用尚有效的预抓帧进程，确认或取消后立即释放进程。
 * @param options 原生截图选项。
 * @param callback 进程退出后的结果回调。
 * @returns 无返回值。
 * @throws 工作进程或 IPC 无法启动时抛出。
 */
export function startToolsScreenshot(
  options: ScreenCaptureOptions,
  callback: (result: ScreenCaptureResult) => void
): void {
  // 截图覆盖层保持单会话，重复快捷键不能创建重叠的原生进程。
  if (activeScreenshot) {
    callback({ success: false })
    return
  }
  clearTimeout(primeTimer)
  const worker = primedScreenshot || new NativeToolWorker(screenshotPath)
  primedScreenshot = null
  activeScreenshot = worker
  worker.request('capture', options, callback)
}

/**
 * 执行独立进程取色，完成或取消后释放模块、覆盖层和监听线程。
 * @param callback 进程退出后的取色结果回调。
 * @returns 无返回值。
 * @throws 工作进程或 IPC 无法启动时抛出。
 */
export function startToolsColorPicker(
  callback: (result: { success: boolean; hex: string | null }) => void
): void {
  const worker = new NativeToolWorker(nativePath)
  colorPicker = worker
  worker.request('color-picker', undefined, (result) =>
    callback({ success: result.success, hex: result.hex || null })
  )
}

/**
 * 取消当前取色任务，进程退出后以取消结果收束等待者。
 * @returns 无返回值。
 */
export function stopToolsColorPicker(): void {
  colorPicker?.stop()
}

// 应用退出时无需等待用户操作原生工具，所有按次任务一并结束。
app.on('before-quit', () => {
  clearTimeout(primeTimer)
  for (const worker of workers) worker.stop()
})
