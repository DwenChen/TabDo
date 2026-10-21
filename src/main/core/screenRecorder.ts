import { app, BrowserWindow, desktopCapturer, ipcMain, Notification, screen, shell } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { UiohookKey } from 'uiohook-napi'
import globalInputManager from './globalInputManager'
import { placeRecorderControl } from '../../shared/recorderLayout'
import { applyToolsWindowIdentity, getToolsWindowIcon } from './toolsWindowIdentity'
import databaseAPI from '../api/shared/database'

interface RecorderOptions {
  id: string
  mode: 'screen' | 'window' | 'region'
  source: string
  systemAudio?: boolean
  microphone?: boolean
  cursor?: boolean
  countdown?: number
  quality?: 'standard' | 'high'
  outputDirectory?: string
  clicks?: boolean
  keys?: boolean
  clickColor?: string
  rightColor?: string
  clickStyle?: string
  clickEmoji?: string
  rightEmoji?: string
  keyStyle?: string
  keyPosition?: string
  theme?: string
  primaryColor?: string
}
type RegionPreferences = Pick<
  RecorderOptions,
  'systemAudio' | 'microphone' | 'cursor' | 'clicks' | 'keys'
>
type RegionChoice = Electron.Rectangle & { preferences?: RegionPreferences }
interface Session {
  control: BrowserWindow
  controller: AbortController
  worker?: ChildProcess
  closed?: Promise<void>
  result?: number
  error?: string
  output: string
  folder: string
  file: string
  phase: string
  message: string
  started: number
  finishing?: Promise<void>
  effects?: BrowserWindow
  countdown?: BrowserWindow
  reveal: boolean
}
let session: Session | null = null,
  pending: {
    owner: number
    id: string
    controller: AbortController
    closed: Promise<void>
  } | null = null
let region: {
  window: BrowserWindow
  options: RecorderOptions
  resolve: (rect: RegionChoice | null) => void
} | null = null
let registered = false

/**
 * 按原插件自动保存到设置目录，不在每次录制前插入保存对话框。
 * @param directory 用户设置的默认保存目录。
 * @returns 可写入的目标文件路径，最终发布仍排他创建。
 */
async function chooseOutput(directory?: string): Promise<string> {
  const target =
    directory &&
    path.isAbsolute(directory) &&
    (await fs.stat(directory).catch(() => null))?.isDirectory()
      ? directory
      : app.getPath('videos') || app.getPath('downloads')
  await fs.mkdir(target, { recursive: true })
  const stamp = new Intl.DateTimeFormat('zh-Hans-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
    .format(new Date())
    .replaceAll('/', '')
    .replace(/[ :]/g, '')
  return path.join(target, `录屏助手_${stamp}.mp4`)
}

/**
 * 定位开发源码或免安装预览中解包的录屏资源。
 * @param file 资源相对路径。
 * @returns 资源绝对路径。
 */
function resource(file: string): string {
  return path.join(
    app.isPackaged && /\.(cjs|node|exe)$/.test(file)
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : app.getAppPath(),
    'resources',
    file
  )
}
/**
 * 判断上游 Windows 原生录屏引擎是否受当前系统支持。
 * @returns 是否支持硬件录屏。
 */
function supported(): boolean {
  return (
    process.platform === 'win32' &&
    process.arch === 'x64' &&
    Number(os.release().split('.')[2]) >= 18362
  )
}
/**
 * 按模式读取屏幕大图或窗口应用图标，不持有捕获流。
 * @param mode 当前来源类型，省略时为全屏。
 * @returns 来源列表及录制状态。
 */
export async function recorderSources(mode = 'screen'): Promise<object> {
  if (!supported()) return { supported: false, sources: [], recording: !!session }
  const own = new Set(
    BrowserWindow.getAllWindows().map(
      (window) => `window:${window.getNativeWindowHandle().readBigUInt64LE()}:0`
    )
  )
  const sources = await desktopCapturer.getSources({
    types: [mode === 'window' ? 'window' : 'screen'],
    thumbnailSize: mode === 'window' ? { width: 0, height: 0 } : { width: 400, height: 400 },
    fetchWindowIcons: mode === 'window'
  })
  return {
    supported: true,
    recording: !!session,
    started: session?.started || 0,
    sources: sources
      .filter((source) => !own.has(source.id))
      .map((source) => ({
        id: source.id,
        name: source.name,
        displayId: source.display_id,
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon?.toDataURL() || ''
      }))
  }
}
/**
 * 向当前控制条发布状态，不持有入口工具页面。
 * @param current 独立录制会话。
 * @returns 无返回值。
 */
function publish(current: Session): void {
  for (const target of [current.control, current.countdown])
    if (target && !target.isDestroyed())
      target.webContents.send('recorder:state', {
        phase: current.phase,
        message: current.message,
        started: current.started
      })
}

/**
 * 超时仅终止本会话的工作进程树，避免原生异常留下捕获进程。
 * @param worker 本会话直接创建且仍在运行的工作进程。
 * @returns 无返回值。
 */
function killWorkerTree(worker: ChildProcess): void {
  if (worker.exitCode !== null || worker.signalCode !== null || !worker.pid) return
  if (process.platform === 'win32')
    execFile(
      'taskkill.exe',
      ['/PID', String(worker.pid), '/T', '/F'],
      { windowsHide: true },
      (error) => {
        if (error && worker.exitCode === null) worker.kill()
      }
    )
  else worker.kill()
}
/**
 * 注册严格按所属窗口鉴权的控制条和区域选择通道。
 * @returns 无返回值。
 */
function registerIPC(): void {
  if (registered) return
  registered = true
  ipcMain.on('recorder:ready', (event) => {
    if (
      session &&
      (session.control.webContents === event.sender ||
        session.countdown?.webContents === event.sender)
    )
      publish(session)
  })
  ipcMain.on('recorder:stop', (event) => {
    if (
      session &&
      (session.control.webContents === event.sender ||
        session.countdown?.webContents === event.sender)
    )
      void finish(session)
  })
  ipcMain.on('recorder:region-ready', (event) => {
    if (region?.window.webContents === event.sender)
      event.sender.send('recorder:region-options', { options: region.options })
  })
  ipcMain.on('recorder:region', (event, value) => {
    if (!region || region.window.webContents !== event.sender) return
    const { width, height } = region.window.getBounds()
    const valid =
      value &&
      ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])) &&
      value.x >= 0 &&
      value.y >= 0 &&
      value.width >= 16 &&
      value.height >= 16 &&
      value.x + value.width <= width &&
      value.y + value.height <= height
    const preferences: RegionPreferences = {}
    for (const key of ['systemAudio', 'microphone', 'cursor', 'clicks', 'keys'] as const)
      if (typeof value?.preferences?.[key] === 'boolean') preferences[key] = value.preferences[key]
    region.resolve(
      valid
        ? { x: value.x, y: value.y, width: value.width, height: value.height, preferences }
        : null
    )
  })
}
/**
 * 在目标显示器上选择区域，取消、关闭或超时后销毁选择窗口。
 * @param display 所属显示器。
 * @param signal 启动任务取消信号。
 * @param options 声音与操作录制默认选项。
 * @returns 以显示器左上角为原点的 DIP 矩形，取消返回空值。
 */
async function selectRegion(
  display: Electron.Display,
  signal: AbortSignal,
  options: RecorderOptions
): Promise<RegionChoice | null> {
  const window = new BrowserWindow({
    ...display.bounds,
    frame: false,
    thickFrame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: true,
    fullscreen: process.platform === 'win32',
    show: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    webPreferences: {
      preload: resource('recorder-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  return await new Promise((resolve, reject) => {
    let settled = false
    /**
     * 撤销选择窗口及监听，只结算一次。
     * @param rect 最终矩形或取消标记。
     * @returns 无返回值。
     */
    const complete = (rect: RegionChoice | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      region = null
      if (!window.isDestroyed()) window.destroy()
      resolve(rect)
    }
    /**
     * 取消选区并释放所属遮罩。
     * @returns 无返回值。
     */
    const cancel = (): void => complete(null)
    const timer = setTimeout(cancel, 120000)
    region = { window, options, resolve: complete }
    signal.addEventListener('abort', cancel, { once: true })
    window.once('closed', cancel)
    window.once('blur', cancel)
    void window
      .loadFile(resource('recorder-region.html'))
      .then(() => {
        if (!settled) {
          window.show()
          window.focus()
        }
      })
      .catch((error) => {
        complete(null)
        reject(error)
      })
    if (signal.aborted) cancel()
  })
}
/**
 * 启动独立 Node 工作进程，让原生模块与捕获进程随本次录制一起结束。
 * @param current 当前录制会话。
 * @param args 上游原生录制参数。
 * @returns 原生捕获进程启动后的 Promise。
 * @throws 原生启动失败或编码器未在时限内产生输出时抛出。
 */
async function launchWorker(current: Session, args: string[]): Promise<void> {
  const worker = spawn(process.execPath, [resource('recorder-worker.cjs')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc']
  })
  current.worker = worker
  current.closed = new Promise((resolve) => worker.once('close', () => resolve()))
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('录制器启动超时')), 12000)
    worker.on(
      'message',
      (message: { type?: string; message?: string; code?: number; diagnostic?: string }) => {
        if (message.type === 'ready') {
          clearTimeout(timer)
          resolve()
        }
        if (message.type === 'error') {
          current.error = message.message || '录制器启动失败'
          clearTimeout(timer)
          reject(new Error(current.error))
        }
        if (message.type === 'finished') {
          current.result = message.code ?? 1
          if (current.result !== 0)
            current.error = `原生录制器退出（${current.result}）${message.diagnostic ? '：' + message.diagnostic : ''}`
        }
      }
    )
    worker.once('error', (error) => {
      current.error = error.message
      clearTimeout(timer)
      reject(error)
    })
    worker.once('close', () => {
      clearTimeout(timer)
      reject(new Error(current.error || '录制器提前退出'))
      if (!current.finishing) {
        if (!current.started && !current.error) current.error = '录制来源在开始前已结束'
        void finish(current)
      }
    })
    worker.send({
      type: 'start',
      executable: resource('recorder/win32/capture-x64.exe'),
      addon: resource('recorder/win32/addon-x64.node'),
      args
    })
  })
  // 进程已创建不代表编码器已就绪；收到首个输出后才开始计时和转交页面。
  const deadline = Date.now() + 15000
  while (!current.controller.signal.aborted) {
    const stat = await fs.stat(current.file).catch(() => null)
    if (stat?.size) return
    if (Date.now() >= deadline) throw new Error('编码器未能开始写入视频，请检查录制来源或显卡驱动')
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
}
/**
 * 停止捕获并等待封装，再写入用户选择的目标；异常保留可恢复的录制文件。
 * @param current 当前录制会话。
 * @returns 全部进程与窗口清理完成后的 Promise。
 */
function finish(current: Session): Promise<void> {
  if (current.finishing) return current.finishing
  current.finishing = Promise.resolve().then(async () => {
    current.controller.abort()
    current.phase = 'saving'
    current.message = '正在保存…'
    publish(current)
    globalInputManager.release('tools-recorder')
    if (current.countdown && !current.countdown.isDestroyed()) current.countdown.destroy()
    current.countdown = undefined
    if (current.effects && !current.effects.isDestroyed()) current.effects.destroy()
    current.effects = undefined
    let published = false
    try {
      if (current.worker) {
        if (current.worker.connected) current.worker.send({ type: 'stop' })
        // 工作进程先停止其唯一的捕获子进程；此超时只兜底回收该工作进程。
        const worker = current.worker
        const timer = setTimeout(() => killWorkerTree(worker), 10000)
        await current.closed
        clearTimeout(timer)
        const stat = await fs.stat(current.file).catch(() => null)
        if (!stat?.size && !current.started && !current.error) return
        if (current.result !== 0 || !stat?.size || current.error)
          throw new Error(current.error || '录制未正常结束')
        // 与批处理共用排他发布，重名只追加序号，不覆盖已有录屏。
        const runtimeRequire = createRequire(path.join(app.getAppPath(), 'package.json'))
        const { publish: publishMedia } = runtimeRequire(resource('media/engine.cjs'))
        current.output = await publishMedia(
          current.file,
          path.dirname(current.output),
          path.basename(current.output)
        )
        published = true
        if (!app.isReady()) return
        if (current.reveal) shell.showItemInFolder(current.output)
      }
    } catch (error) {
      console.error('[Recorder] 保存失败:', error)
      const stat = await fs.stat(current.file).catch(() => null)
      const body = `${error instanceof Error ? error.message : String(error)}${stat?.size ? `；恢复文件：${current.file}` : ''}`
      new Notification({ title: '录屏保存失败', body }).show()
    } finally {
      if (published || !(await fs.stat(current.file).catch(() => null))?.size)
        await fs
          .rm(current.folder, { recursive: true, force: true })
          .catch((error) => console.warn('[Recorder] 临时文件清理失败:', error))
      if (!current.control.isDestroyed()) current.control.destroy()
      if (session === current) session = null
      current.worker = undefined
    }
  })
  return current.finishing
}
/**
 * 完成来源校验、区域确认与倒计时，自动保存并将录制转交独立控制条。
 * @param owner 发起工具会话的 WebContents ID。
 * @param options 用户确认的录制选项。
 * @returns 是否开始录制或已取消。
 * @throws 不支持、来源失效、资源创建或原生引擎启动失败时抛出。
 */
export async function startRecorder(owner: number, options: RecorderOptions): Promise<object> {
  if (!supported()) throw new Error('录屏需要 Windows 10 1903 或更高版本（x64）')
  if (session || pending) throw new Error('已有录屏正在运行，请先通过控制条停止')
  if (
    !options ||
    !/^[\w-]{1,80}$/.test(options.id) ||
    !['screen', 'window', 'region'].includes(options.mode)
  )
    throw new Error('录制选项无效')
  registerIPC()
  const controller = new AbortController(),
    operation = { owner, id: options.id, controller, closed: Promise.resolve() }
  let completeStart!: () => void
  operation.closed = new Promise<void>((resolve) => {
    completeStart = resolve
  })
  pending = operation
  let current: Session | null = null
  let preparedFolder = ''
  try {
    const sources = await desktopCapturer.getSources({
      types: [options.mode === 'window' ? 'window' : 'screen'],
      thumbnailSize: { width: 0, height: 0 }
    })
    const nearest = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const source =
      options.mode === 'region'
        ? sources.find((item) => item.display_id === String(nearest.id)) || sources[0]
        : sources.find((item) => item.id === options.source)
    if (!source) throw new Error('录制来源已关闭，请刷新后重新选择')
    const display =
      screen.getAllDisplays().find((item) => String(item.id) === source.display_id) ||
      screen.getPrimaryDisplay()
    const chosen =
      options.mode === 'region' ? await selectRegion(display, controller.signal, options) : null
    if (controller.signal.aborted || (options.mode === 'region' && !chosen))
      return { cancelled: true }
    if (chosen?.preferences) options = { ...options, ...chosen.preferences }
    const output = await chooseOutput(options.outputDirectory)
    if (!output || controller.signal.aborted) return { cancelled: true }
    const folder = await fs.mkdtemp(path.join(path.dirname(output), '.tabdo-recorder-'))
    preparedFolder = folder
    // 录屏选区使用显示器相对坐标，控制条避让使用桌面全局 DIP 坐标。
    const capture = chosen
      ? { ...chosen, x: display.bounds.x + chosen.x, y: display.bounds.y + chosen.y }
      : display.bounds
    const placement = placeRecorderControl(
      capture,
      [
        display.workArea,
        ...screen
          .getAllDisplays()
          .filter((item) => item.id !== display.id)
          .map((item) => item.workArea)
      ],
      { width: 300, height: 66 }
    )
    const control = new BrowserWindow({
      ...placement,
      title: '录屏',
      icon: getToolsWindowIcon('screen-recorder'),
      frame: false,
      thickFrame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: false,
      webPreferences: {
        preload: resource('recorder-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    applyToolsWindowIdentity(control, 'screen-recorder')
    // 在第一次显示前设置系统捕获排除；全屏录制或用户拖入选区时仍不录入控制条。
    control.setContentProtection(true)
    current = {
      control,
      controller,
      output,
      folder,
      file: path.join(folder, 'capture.mp4'),
      phase: 'countdown',
      message: '准备录制',
      started: 0,
      reveal: true
    }
    session = current
    control.on('close', (event) => {
      event.preventDefault()
      if (current) void finish(current)
    })
    control.on('hide', () => {
      if (current) void finish(current)
    })
    control.on('minimize', () => {
      if (current) void finish(current)
    })
    control.webContents.on('render-process-gone', () => {
      if (current) void finish(current)
    })
    control.webContents.on('will-navigate', (event) => event.preventDefault())
    control.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await control.loadFile(resource('recorder-control.html'))
    if (controller.signal.aborted) return { cancelled: true }
    // 全屏才播放原版中心倒计时；窗口及区域确认后直接启动。
    const seconds =
      options.mode === 'screen' && [0, 3, 4, 5, 6, 7, 8, 9].includes(options.countdown ?? 3)
        ? (options.countdown ?? 3)
        : 0
    globalInputManager.on('tools-recorder', 'keydown', (event) => {
      if (
        current &&
        session === current &&
        ((event.keycode === UiohookKey.F10 &&
          databaseAPI.dbGet('settings-general')?.builtinAppShortcutsEnabled?.recorderStop ===
            true) ||
          (event.keycode === UiohookKey.Escape && current.phase === 'countdown'))
      )
        void finish(current)
    })
    globalInputManager.acquire('tools-recorder')
    if (seconds) {
      const countdown = new BrowserWindow({
        x: Math.round(display.bounds.x + (display.bounds.width - 300) / 2),
        y: Math.round(display.bounds.y + (display.bounds.height - 300) / 2),
        width: 300,
        height: 300,
        frame: false,
        thickFrame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        show: false,
        webPreferences: {
          preload: resource('recorder-preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      })
      current.countdown = countdown
      countdown.setContentProtection(true)
      countdown.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      countdown.webContents.on('will-navigate', (event) => event.preventDefault())
      await countdown.loadFile(resource('recorder-countdown.html'))
      if (controller.signal.aborted) return { cancelled: true }
      countdown.showInactive()
    }
    for (let remaining = seconds; remaining > 0 && !controller.signal.aborted; remaining--) {
      current.message = `${remaining} 秒后开始`
      publish(current)
      await new Promise<void>((resolve) => {
        /**
         * 完成本次倒计时间隔并撤销取消监听。
         * @returns 无返回值。
         */
        const done = (): void => {
          clearTimeout(timer)
          controller.signal.removeEventListener('abort', done)
          resolve()
        }
        const timer = setTimeout(done, 1000)
        controller.signal.addEventListener('abort', done, { once: true })
      })
    }
    if (current.countdown && !current.countdown.isDestroyed()) current.countdown.destroy()
    current.countdown = undefined
    if (controller.signal.aborted) return { cancelled: true }
    // 上游引擎接收物理像素坐标，区域坐标相对于所选显示器。
    const physical = screen.dipToScreenRect(null, display.bounds)
    const center = [
      physical.x + Math.round(physical.width / 2),
      physical.y + Math.round(physical.height / 2)
    ]
    const crop = chosen
      ? [chosen.x, chosen.y, chosen.x + chosen.width, chosen.y + chosen.height].map(
          (value) => Math.round((value * display.scaleFactor) / 2) * 2
        )
      : []
    const mode = options.mode === 'window' ? 2 : options.mode === 'region' ? 3 : 1
    const target = mode === 2 ? source.id.split(':')[1] : [...center, ...crop].join(',')
    current.phase = 'preparing'
    current.message = '正在启动录制…'
    publish(current)
    control.showInactive()
    // 效果只属于当前可见录制会话，不复用入口页面或启动第二套全局原生钩子。
    if ((options.clicks || options.keys) && options.mode !== 'window') {
      const effects = new BrowserWindow({
        ...capture,
        frame: false,
        thickFrame: false,
        transparent: true,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        resizable: false,
        webPreferences: {
          preload: resource('recorder-effects-preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      current.effects = effects
      effects.setIgnoreMouseEvents(true)
      effects.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      effects.webContents.on('will-navigate', (event) => event.preventDefault())
      await effects.loadFile(resource('recorder-effects.html'))
      if (controller.signal.aborted) return { cancelled: true }
      effects.showInactive()
      if (options.clicks)
        globalInputManager.on('tools-recorder', 'mousedown', (event) => {
          if (effects.isDestroyed()) return
          const point = screen.screenToDipPoint({ x: event.x, y: event.y })
          if (
            point.x < capture.x ||
            point.y < capture.y ||
            point.x > capture.x + capture.width ||
            point.y > capture.y + capture.height
          )
            return
          const color = event.button === 2 ? options.rightColor : options.clickColor
          effects.webContents.send('recorder:effect', {
            type: 'click',
            x: point.x - capture.x,
            y: point.y - capture.y,
            color: /^#[a-f0-9]{6}$/i.test(color || '') ? color : '#34d399',
            emoji:
              options.clickStyle === 'emoji'
                ? String(
                    (event.button === 2 ? options.rightEmoji : options.clickEmoji) ||
                      (event.button === 2 ? '🤣' : '😎')
                  ).slice(0, 16)
                : ''
          })
        })
      if (options.keys)
        globalInputManager.on('tools-recorder', 'keydown', (event) => {
          if (effects.isDestroyed()) return
          const key = Object.keys(UiohookKey).find((name) => UiohookKey[name] === event.keycode)
          if (!key || key === 'F10') return
          const keys = [
            event.ctrlKey ? 'Ctrl' : '',
            event.altKey ? 'Alt' : '',
            event.shiftKey ? 'Shift' : '',
            event.metaKey ? 'Win' : '',
            key
          ].filter(Boolean)
          effects.webContents.send('recorder:effect', {
            type: 'key',
            keys: [...new Set(keys)].join(' + '),
            style: ['default', 'apple-wireless', 'claymorphism', 'mechanical', 'rgb'].includes(
              options.keyStyle || ''
            )
              ? options.keyStyle
              : 'default',
            position: options.keyPosition
          })
        })
    }
    await launchWorker(current, [
      String(mode),
      target,
      options.systemAudio && options.microphone
        ? '3'
        : options.systemAudio
          ? '1'
          : options.microphone
            ? '2'
            : '0',
      options.cursor === false ? '0' : '1',
      options.quality === 'high' ? '1' : '0',
      current.file
    ])
    if (controller.signal.aborted) return { cancelled: true }
    current.phase = 'recording'
    current.started = Date.now()
    publish(current)
    return { recording: true, ...(chosen?.preferences ? { preferences: chosen.preferences } : {}) }
  } catch (error) {
    if (current) {
      current.error = error instanceof Error ? error.message : String(error)
      await finish(current)
    }
    throw error
  } finally {
    try {
      if (controller.signal.aborted && current) await finish(current)
      if (!current && preparedFolder)
        await fs.rm(preparedFolder, { recursive: true, force: true, maxRetries: 3 })
    } finally {
      if (pending === operation) pending = null
      completeStart()
    }
  }
}
/**
 * 只取消指定旧会话尚未转交的启动操作。
 * @param owner 调用页面 ID。
 * @param id 启动请求 ID。
 * @returns 无返回值。
 */
export function cancelRecorderStart(owner: number, id: string): void {
  if (pending?.owner === owner && pending.id === id) pending.controller.abort()
}
/**
 * 宿主真正退出时收束录屏，不影响其他工具或全局剪贴板采集。
 * @param reveal 用户主动停止时是否定位保存文件，宿主退出时关闭此行为。
 * @returns 录制资源清理完成后的 Promise。
 */
export async function stopRecorder(reveal = true): Promise<void> {
  const starting = pending
  starting?.controller.abort()
  region?.resolve(null)
  if (session) {
    session.reveal = reveal
    await finish(session)
  }
  if (starting) await starting.closed
}
