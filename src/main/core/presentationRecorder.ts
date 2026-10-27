import * as electron from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import databaseAPI from '../api/shared/database'
import { getInternalPluginPath } from './internalPlugins'
import detachedWindowManager from './detachedWindowManager'
import { applyToolsWindowIdentity } from './toolsWindowIdentity'

const sessions = new Map<number, { dispose: () => Promise<void> }>()

/**
 * 创建按 WebContents 隔离的演示录屏服务，上游不注册全局应用、托盘或更新器。
 * @param owner 所属工具视图。
 * @param file 用户匹配的项目文件，可为空。
 * @returns IPC 前缀和服务就绪状态。
 * @throws 服务加载失败或项目路径无效时抛出。
 */
export async function openPresentation(
  owner: Electron.WebContents,
  file?: string
): Promise<{ prefix: string; file: string }> {
  await sessions.get(owner.id)?.dispose()
  if (file && (!path.isAbsolute(file) || !/\.recordly$/i.test(file)))
    throw new Error('请选择 .recordly 项目文件')
  const root = electron.app.getAppPath()
  const publicRoot = path.join(
    getInternalPluginPath('system'),
    electron.app.isPackaged ? '' : 'public'
  )
  const bundle = path.join(publicRoot, 'presentation-backend.cjs')
  const prefix = `presentation:${owner.id}:`
  const windows = new Set<Electron.BrowserWindow>()
  const channels = new Map<string, (...args: any[]) => any>()
  const listeners: Array<[string, (...args: any[]) => any, (...args: any[]) => any]> = []
  const children = new Set<any>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false
  let disposal: Promise<void> | undefined
  let runtime: any
  let editorShown = false
  const localRequire = createRequire(bundle)
  const nativeChildProcess = localRequire('node:child_process')
  /**
   * 验证请求页面属于当前工具或所属覆盖层。
   * @param sender 请求来源页面。
   * @returns 是否属于当前会话。
   */
  const allowed = (sender: Electron.WebContents): boolean =>
    sender === owner ||
    [...windows].some((window) => !window.isDestroyed() && window.webContents === sender)
  // 所有上游请求限定会话来源；同名接口不会覆盖宿主或其他会话。
  const scopedIpc = {
    /**
     * 注册带会话身份校验的异步请求。
     * @param channel 上游通道名称。
     * @param handler 当前会话处理器。
     * @returns 注册完成，无返回值。
     */
    handle(channel: string, handler: (...args: any[]) => any) {
      if (disposed) throw new Error('演示会话已结束')
      channels.set(channel, handler)
      electron.ipcMain.handle(prefix + channel, async (event, ...args) => {
        if (disposed || !allowed(event.sender)) throw new Error('演示会话已结束')
        if (channel === 'start-native-screen-recording')
          await owner.executeJavaScript('window.toolsPresentation.beginCapture()')
        try {
          const result = await handler(event, ...args)
          if (channel === 'start-native-screen-recording' && !result?.success)
            await owner.executeJavaScript('window.toolsPresentation.endCapture()')
          return result
        } catch (error) {
          if (channel === 'start-native-screen-recording')
            await owner.executeJavaScript('window.toolsPresentation.endCapture()').catch(() => {})
          throw error
        }
      })
    },
    /**
     * 注册只接受所属窗口的通知。
     * @param channel 上游通道名称。
     * @param handler 当前会话处理器。
     * @returns 当前会话 IPC 适配器。
     */
    on(channel: string, handler: (...args: any[]) => any) {
      if (disposed) throw new Error('演示会话已结束')
      const guarded = (event: Electron.IpcMainEvent, ...args: any[]): void => {
        if (!disposed && allowed(event.sender)) {
          handler(event, ...args)
          if (channel === 'hud-overlay-close' && !owner.isDestroyed())
            void owner.executeJavaScript('window.toolsPresentation.endCapture()').catch(() => {})
        }
      }
      listeners.push([channel, guarded, handler])
      electron.ipcMain.on(prefix + channel, guarded)
      return scopedIpc
    },
    /**
     * 按上游原监听身份解除对应的受限监听。
     * @param channel 上游通道名称。
     * @param handler 当前会话处理器。
     * @returns 无返回值。
     */
    removeListener(channel: string, handler: (...args: any[]) => any) {
      for (let index = listeners.length - 1; index >= 0; index--) {
        const pair = listeners[index]
        if (pair[0] !== channel || pair[2] !== handler) continue
        electron.ipcMain.removeListener(prefix + channel, pair[1])
        listeners.splice(index, 1)
      }
    }
  }
  const partition = `presentation-${owner.id}-${Date.now()}`
  const captureSession = electron.session.fromPartition(partition)
  class SessionWindow extends electron.BrowserWindow {
    /**
     * 建立当前会话的辅助窗口并拒绝页面自行新开窗口。
     * @param options 原生窗口及页面选项。
     * @returns 创建完成的所属窗口。
     * @throws 会话已退出时拒绝异步查询迟到后再创建窗口。
     */
    constructor(options: Electron.BrowserWindowConstructorOptions) {
      // 校验会话仍有效，避免来源边界查询完成时重新创建已退出的覆盖层。
      if (disposed || owner.isDestroyed()) throw new Error('演示会话已结束')
      super({ ...options, webPreferences: { ...options.webPreferences, partition } })
      windows.add(this)
      // 辅助窗口不继承宿主 TabDo 的任务栏身份；覆盖层继续保持无任务栏。
      if (options.skipTaskbar === false) applyToolsWindowIdentity(this, 'presentation-recorder')
      this.once('closed', () => windows.delete(this))
      this.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    }
    /**
     * 取得当前会话仍有效的辅助窗口。
     * @returns 当前会话的窗口集合。
     */
    static getAllWindows(): Electron.BrowserWindow[] {
      return [...windows].filter((window) => !window.isDestroyed())
    }
    /**
     * 按所属页面查找本次会话辅助窗口。
     * @param contents 待验证页面。
     * @returns 对应窗口或空值。
     */
    static fromWebContents(contents: Electron.WebContents): Electron.BrowserWindow | null {
      return (
        [...windows].find((window) => !window.isDestroyed() && window.webContents === contents) ||
        null
      )
    }
  }
  const dataRoot = path.join(electron.app.getPath('userData'), 'presentation-recorder')
  fs.mkdirSync(dataRoot, { recursive: true })
  const rendererUrl = owner.getURL().replace(/(?:index\.html)?(?:\?.*)?$/, 'presentation.html')
  const host = {
    id: owner.id,
    prefix,
    file,
    owner,
    dataRoot,
    rendererUrl,
    assetRoot: path.join(publicRoot, 'presentation-assets'),
    moduleUrl: pathToFileURL(bundle).href,
    nativeRoot: path
      .join(root, 'resources/presentation')
      .replace(/\.asar([/\\])/, '.asar.unpacked$1'),
    overlayPreload: path.join(publicRoot, 'presentation-overlay.cjs'),
    icon: path.join(publicRoot, 'icons/presentation-recorder.png'),
    /**
     * 把可见前台交给控制条，撤下编辑正文但保留当前录制会话。
     * @param window 本会话可见控制条。
     * @returns 无返回值。
     */
    showHud(window: Electron.BrowserWindow): void {
      if (disposed || owner.isDestroyed()) return
      applyToolsWindowIdentity(window, 'presentation-recorder')
      if (detachedWindowManager.showAuxiliaryForegroundWindow(owner.id, window))
        owner.send(prefix + 'navigate', 'hud')
    },
    /**
     * 恢复当前会话的编辑窗口，控制条无需借用隐藏的主搜索窗口。
     * @returns 无返回值。
     */
    showEditor(): void {
      if (disposed || owner.isDestroyed()) return
      const window = detachedWindowManager.getWindowByPluginWebContents(owner.id)
      if (!window || window.isDestroyed()) return
      /**
       * 同步原生任务栏与自定义标题栏的编辑器身份，晚加载标题栏也能收到更新。
       * @returns 无返回值。
       */
      const updateTitle = (): void => {
        if (window.isDestroyed()) return
        applyToolsWindowIdentity(window, 'presentation-editor')
        window.webContents.send('update-tool-title', '演示编辑器')
      }
      updateTitle()
      if (window.webContents.isLoadingMainFrame())
        window.webContents.once('did-finish-load', updateTitle)
      if (!editorShown) {
        // 首次显示按当前显示器工作区布局，预留时间轴并避免沿用其他工具的窄窗口。
        const area = electron.screen.getDisplayMatching(window.getBounds()).workArea
        const width = Math.min(1180, area.width - 32)
        const height = Math.min(820, area.height - 32)
        window.setMinimumSize(Math.min(960, width), Math.min(560, height))
        window.setBounds({
          x: area.x + Math.round((area.width - width) / 2),
          y: area.y + Math.round((area.height - height) / 2),
          width,
          height
        })
        editorShown = true
      }
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
      owner.send(prefix + 'navigate', 'editor')
    },
    electron: {
      app: electron.app,
      ipcMain: scopedIpc,
      BrowserWindow: SessionWindow,
      shell: electron.shell,
      dialog: electron.dialog,
      screen: electron.screen,
      desktopCapturer: electron.desktopCapturer,
      nativeImage: electron.nativeImage,
      systemPreferences: electron.systemPreferences,
      clipboard: electron.clipboard,
      nativeTheme: electron.nativeTheme,
      session: electron.session,
      webContents: electron.webContents,
      powerSaveBlocker: electron.powerSaveBlocker
    }
  }

  /**
   * 释放当前服务的端口、监听、覆盖层和所属进程；不删除任何持久资料。
   * @returns 全部释放完成后的 Promise。
   */
  function dispose(): Promise<void> {
    if (disposal) return disposal
    disposed = true
    disposal = release()
    return disposal
  }

  /**
   * 等待所属进程退出，保证清理完成后才移除会话登记。
   * @returns 当前会话资源已释放。
   */
  async function release(): Promise<void> {
    // 先阻止迟到请求和回调，再结束当前会话持有的工作。
    for (const name of channels.keys()) electron.ipcMain.removeHandler(prefix + name)
    for (const [name, handler] of listeners) electron.ipcMain.removeListener(prefix + name, handler)
    captureSession.setPermissionRequestHandler(null)
    captureSession.setDisplayMediaRequestHandler(null)
    for (const timer of timers) {
      clearTimeout(timer)
      clearInterval(timer)
    }
    await runtime?.dispose?.().catch((error: unknown) => console.warn('[演示录屏] 清理失败', error))
    for (const window of windows) if (!window.isDestroyed()) window.destroy()
    await Promise.all(
      [...children].map(async (child) => {
        if (child.exitCode !== null || !child.pid) return
        // 只结束当前服务创建的进程树，不接触用户主动打开的外部程序。
        const closed = new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 5000)
          child.once('close', () => {
            clearTimeout(timeout)
            resolve()
          })
        })
        if (process.platform === 'win32') {
          const killer = nativeChildProcess.spawn(
            'taskkill',
            ['/PID', String(child.pid), '/T', '/F'],
            {
              windowsHide: true,
              stdio: 'ignore'
            }
          )
          killer.on('error', () => child.kill())
        } else child.kill()
        await closed
      })
    )
    children.clear()
    sessions.delete(owner.id)
  }
  sessions.set(owner.id, { dispose })
  owner.once('destroyed', () => void dispose())
  /**
   * 为上游模块提供依赖，并追踪其自行启动的进程。
   * @param name 依赖模块名称。
   * @returns 普通依赖或受限子进程接口。
   */
  const scopedRequire = (name: string): any => {
    if (name !== 'node:child_process' && name !== 'child_process') return localRequire(name)
    return new Proxy(nativeChildProcess, {
      get(target, key) {
        if (!['spawn', 'execFile', 'fork', 'exec'].includes(String(key))) return target[key]
        return new Proxy(target[key], {
          apply(fn, _receiver, args) {
            if (disposed) throw new Error('演示会话已结束')
            const child = Reflect.apply(fn, target, args) as any
            children.add(child)
            child.once('close', () => children.delete(child))
            return child
          },
          get(fn, property) {
            if (property !== promisify.custom || !fn[property]) return fn[property]
            return (...args: any[]) => {
              if (disposed) throw new Error('演示会话已结束')
              const pending = fn[property](...args)
              if (pending.child) {
                children.add(pending.child)
                pending.child.once('close', () => children.delete(pending.child))
              }
              return pending
            }
          }
        })
      }
    })
  }
  try {
    // 每次执行独立模块闭包，退出后不保留上一个编辑器或工程模型。
    const module = { exports: {} }
    new Function(
      'module',
      'exports',
      'require',
      '__filename',
      '__dirname',
      '__TABDO_PRESENTATION_HOST__',
      'setTimeout',
      'setInterval',
      fs.readFileSync(bundle, 'utf8')
    )(
      module,
      module.exports,
      scopedRequire,
      bundle,
      path.dirname(bundle),
      host,
      (fn: () => void, ms: number) => {
        const timer = setTimeout(() => {
          timers.delete(timer)
          fn()
        }, ms)
        timers.add(timer)
        return timer
      },
      (fn: () => void, ms: number) => {
        const timer = setInterval(fn, ms)
        timers.add(timer)
        return timer
      }
    )
    runtime = module.exports
    await runtime.initialize()
    scopedIpc.handle('tabdo-settings', () => databaseAPI.dbGet('settings-general') || {})
    scopedIpc.handle('tabdo-shortcuts', () => databaseAPI.dbGet('presentation-shortcuts') || {})
    scopedIpc.handle('tabdo-dispose', dispose)
    scopedIpc.handle('tabdo-stop-capture', () => {
      const hud = [...windows].find(
        (window) =>
          !window.isDestroyed() && window.webContents.getURL().includes('windowType=hud-overlay')
      )
      if (!hud) return false
      // 使用录制器原有停止链收束麦克风、摄像头及封装，不提前销毁其页面。
      hud.webContents.send('stop-recording-from-tray')
      return true
    })
    // 功能裁剪在服务端同步生效，不留下更新、登录或市场服务。
    for (const [name, result] of Object.entries({
      'announcements:get': { success: true, announcements: [] },
      'get-cloud-share-status': { configured: false },
      'get-experimental-updates-enabled': false,
      'get-current-update-toast-payload': null
    }))
      if (!channels.has(name)) scopedIpc.handle(name, () => result)
    captureSession.setPermissionRequestHandler((contents, permission, callback) =>
      callback(allowed(contents) && ['media', 'display-capture'].includes(permission))
    )
    captureSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      const source = await channels.get('get-selected-source')?.({ sender: owner })
      callback(
        source?.id
          ? { video: { id: source.id, name: source.name } as Electron.DesktopCapturerSource }
          : {}
      )
    })
    if (file) host.showEditor()
    return { prefix, file: file || '' }
  } catch (error) {
    console.error('[演示录屏] 初始化失败', error)
    await dispose()
    throw error
  }
}

/**
 * 主动释放指定工具会话的演示服务。
 * @param owner 所属视图。
 * @returns 资源释放完成后的 Promise。
 */
export async function closePresentation(owner: Electron.WebContents): Promise<void> {
  await sessions.get(owner.id)?.dispose()
}
