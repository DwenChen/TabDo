import { BrowserWindow, BrowserWindowConstructorOptions, session } from 'electron'
import path from 'path'
import mainPreload from '../../../resources/preload.js?asset'
import proxyManager from '../managers/proxyManager'
import { GLOBAL_SCROLLBAR_CSS } from './globalStyles'
import { buildPluginThemeCSS, getCurrentPluginThemeState } from './pluginTheme'
import { resolvePluginWindowUrl } from '../utils/pluginUrl'
import { ensurePluginSessionPreload } from './pluginSessionPreload'
import { releaseToolsView } from './toolsLifecycle'

/**
 * 插件可用的 BrowserWindow / WebContents 方法白名单
 *
 * 严格对齐 utools Fe 常量，不增不减。
 * 计数：windowMethods(94) + windowInvokes(1) + webContentsMethods(59) + webContentsInvokes(11) = 165
 */
export const winIpc = {
  windowMethods: [
    'destroy',
    'close',
    'focus',
    'blur',
    'isFocused',
    'isDestroyed',
    'show',
    'showInactive',
    'hide',
    'isVisible',
    'maximize',
    'unmaximize',
    'isMaximized',
    'minimize',
    'restore',
    'isMinimized',
    'setFullScreen',
    'isFullScreen',
    'setSimpleFullScreen',
    'isSimpleFullScreen',
    'isNormal',
    'setAspectRatio',
    'setBackgroundColor',
    'previewFile',
    'closeFilePreview',
    'setBounds',
    'getBounds',
    'getBackgroundColor',
    'setContentBounds',
    'getContentBounds',
    'getNormalBounds',
    'setEnabled',
    'isEnabled',
    'setSize',
    'getSize',
    'setContentSize',
    'getContentSize',
    'setMinimumSize',
    'getMinimumSize',
    'setMaximumSize',
    'getMaximumSize',
    'setResizable',
    'isResizable',
    'setMovable',
    'isMovable',
    'setMinimizable',
    'isMinimizable',
    'setMaximizable',
    'isMaximizable',
    'setFullScreenable',
    'isFullScreenable',
    'setClosable',
    'isClosable',
    'setAlwaysOnTop',
    'isAlwaysOnTop',
    'moveAbove',
    'moveTop',
    'center',
    'setPosition',
    'getPosition',
    'setTitle',
    'getTitle',
    'setSheetOffset',
    'flashFrame',
    'setSkipTaskbar',
    'setKiosk',
    'isKiosk',
    'isTabletMode',
    'getMediaSourceId',
    'getNativeWindowHandle',
    'setRepresentedFilename',
    'getRepresentedFilename',
    'setDocumentEdited',
    'isDocumentEdited',
    'focusOnWebView',
    'blurWebView',
    'setProgressBar',
    'setHasShadow',
    'hasShadow',
    'setOpacity',
    'getOpacity',
    'setShape',
    'showDefinitionForSelection',
    'setIcon',
    'setWindowButtonVisibility',
    'setVisibleOnAllWorkspaces',
    'isVisibleOnAllWorkspaces',
    'setIgnoreMouseEvents',
    'setContentProtection',
    'setFocusable',
    'setAutoHideCursor',
    'setVibrancy',
    'setTrafficLightPosition',
    'getTrafficLightPosition'
  ] as const,

  windowInvokes: ['capturePage'] as const,

  webContentsMethods: [
    'isDestroyed',
    'focus',
    'isFocused',
    'isLoading',
    'isLoadingMainFrame',
    'isWaitingForResponse',
    'isCrashed',
    'setUserAgent',
    'getUserAgent',
    'setIgnoreMenuShortcuts',
    'setAudioMuted',
    'isAudioMuted',
    'isCurrentlyAudible',
    'setZoomFactor',
    'getZoomFactor',
    'setZoomLevel',
    'getZoomLevel',
    'undo',
    'redo',
    'cut',
    'copy',
    'copyImageAt',
    'paste',
    'pasteAndMatchStyle',
    'delete',
    'selectAll',
    'unselect',
    'replace',
    'replaceMisspelling',
    'findInPage',
    'stopFindInPage',
    'isBeingCaptured',
    'incrementCapturerCount',
    'decrementCapturerCount',
    'getPrinters',
    'openDevTools',
    'closeDevTools',
    'isDevToolsOpened',
    'isDevToolsFocused',
    'toggleDevTools',
    'send',
    'sendToFrame',
    'enableDeviceEmulation',
    'disableDeviceEmulation',
    'sendInputEvent',
    'showDefinitionForSelection',
    'isOffscreen',
    'startPainting',
    'stopPainting',
    'isPainting',
    'setFrameRate',
    'getFrameRate',
    'invalidate',
    'getWebRTCIPHandlingPolicy',
    'setWebRTCIPHandlingPolicy',
    'getOSProcessId',
    'getProcessId',
    'getBackgroundThrottling',
    'setBackgroundThrottling'
  ] as const,

  webContentsInvokes: [
    'insertCSS',
    'removeInsertedCSS',
    'executeJavaScript',
    'executeJavaScriptInIsolatedWorld',
    'setVisualZoomLevelLimits',
    'insertText',
    'capturePage',
    'print', // 特殊处理：callback→Promise 包装
    'printToPDF',
    'savePage',
    'takeHeapSnapshot'
  ] as const
} as const

/**
 * 插件窗口信息
 */
interface PluginWindowInfo {
  window: BrowserWindow
  parentWebContents: Electron.WebContents | null
  pluginPath: string
  pluginName: string
  sessionPartition: string
}

class PluginWindowManager {
  /** win.id → 窗口信息 */
  private windowInfoMap: Map<number, PluginWindowInfo> = new Map()

  /**
   * 创建插件独立窗口，复用所属 Session 的公共 preload 注册。
   * @param pluginPath 插件实际路径。
   * @param pluginName 插件有效名称。
   * @param sessionPartition 插件 Session 隔离标识。
   * @param url 待打开的页面地址。
   * @param options 原生窗口选项。
   * @param senderWebContents 发起创建的插件页面。
   * @returns 新建的独立窗口实例。
   * @throws 窗口配置或创建失败时抛出。
   */
  public createWindow(
    pluginPath: string,
    pluginName: string,
    sessionPartition: string,
    url: string,
    options: BrowserWindowConstructorOptions = {},
    senderWebContents: Electron.WebContents
  ): BrowserWindow {
    // 处理 preload 路径（如果是相对路径）
    let preloadPath = options?.webPreferences?.preload
    if (preloadPath && !path.isAbsolute(preloadPath)) {
      preloadPath = path.join(pluginPath, preloadPath)
    }

    // 使用插件名称创建 session，确保和插件主视图共享同一个 session
    const sess = session.fromPartition(sessionPartition)
    ensurePluginSessionPreload(sess, mainPreload)

    // 应用代理配置到插件 session
    proxyManager
      .applyProxyToSession(sess, `插件窗口 ${pluginName} (${sessionPartition})`)
      .catch((error) => {
        console.error(
          `[pluginWindow:create] 插件窗口 ${pluginName} (${sessionPartition}) 应用代理配置失败:`,
          error
        )
      })

    const win = new BrowserWindow({
      ...options,
      webPreferences: {
        ...options?.webPreferences,
        preload: preloadPath,
        session: sess,
        contextIsolation: false,
        nodeIntegration: false,
        webSecurity: false,
        sandbox: false
      }
    })

    // 保存窗口信息（以 win.id 为键）
    this.windowInfoMap.set(win.id, {
      window: win,
      parentWebContents: senderWebContents,
      pluginPath,
      pluginName,
      sessionPartition
    })

    let retiring = false
    /**
     * 结束此独立窗口自己的会话；必要任务收束前保留受限的旧 IPC 身份。
     * @returns 无返回值。
     */
    const retireWindow = (): void => {
      if (retiring || win.isDestroyed()) return
      retiring = true
      this.windowInfoMap.delete(win.id)
      releaseToolsView(
        win.webContents,
        () => {
          if (!win.isDestroyed()) win.destroy()
        },
        { name: pluginName, path: pluginPath }
      )
    }
    win.on('hide', retireWindow)
    win.on('minimize', retireWindow)
    win.on('close', (event) => {
      if (!retiring) {
        event.preventDefault()
        win.hide()
        retireWindow()
      }
    })

    // 加载 URL（支持 `index.html?id=1#/route` 形式的 query 与 hash）
    const loadUrl = resolvePluginWindowUrl(pluginPath, url)
    win.loadURL(loadUrl)

    // 子窗口 dom-ready 时触发父窗口 callback（与 utools 一致）
    win.webContents.on('dom-ready', () => {
      if (senderWebContents.isDestroyed()) return

      // 子窗口 DOM 就绪后注入全局样式、主题色和默认字体。
      void win.webContents.insertCSS(GLOBAL_SCROLLBAR_CSS)
      void win.webContents.insertCSS(buildPluginThemeCSS(getCurrentPluginThemeState()))
      win.webContents.insertCSS(
        'body { font-family: system-ui, "PingFang SC", "Helvetica Neue", "Microsoft Yahei", sans-serif; }'
      )

      // 在父窗口触发 callback（与 utools executeJavaScript 方式一致）
      senderWebContents.executeJavaScript(
        `if (window.tabdo && window.tabdo.__event__ && typeof window.tabdo.__event__.createBrowserWindowCallback === 'function') {
          try { window.tabdo.__event__.createBrowserWindowCallback() } catch(e) {}
          delete window.tabdo.__event__.createBrowserWindowCallback
        }`
      )
      console.debug(`[pluginWindow:callback] dom-ready → trigger parent callback, winId=${win.id}`)
    })

    win.webContents.on('render-process-gone', (_event, details) => {
      if (win.isDestroyed()) return
      console.warn(
        `[pluginWindow:render-process-gone] winId=${win.id} plugin=${pluginName} reason=${details.reason} exitCode=${details.exitCode}`
      )
      win.destroy()
    })

    // 监听窗口关闭
    win.on('closed', () => {
      console.info(
        `[pluginWindow:destroy] winId=${win.id} unregistered from plugin=${pluginName} partition=${sessionPartition}`
      )
      this.windowInfoMap.delete(win.id)
    })

    console.info(
      `[pluginWindow:create] plugin=${pluginName} partition=${sessionPartition} winId=${win.id} url=${url} → ${loadUrl}`
    )

    return win
  }

  /**
   * 根据 win.id 获取窗口所属的插件名称（用于所有权校验）
   */
  public getPluginNameByWindowId(winId: number): string | null {
    return this.windowInfoMap.get(winId)?.pluginName ?? null
  }

  /**
   * 根据 win.id 获取窗口所属的插件路径，用于同名变体之间的权限校验。
   */
  public getPluginPathByWindowId(winId: number): string | null {
    return this.windowInfoMap.get(winId)?.pluginPath ?? null
  }

  /**
   * 发送消息到父窗口
   */
  public sendToParent(senderWebContents: Electron.WebContents, channel: string, args: any[]): void {
    const senderId = senderWebContents.id
    for (const windowInfo of this.windowInfoMap.values()) {
      if (windowInfo.window.webContents === senderWebContents) {
        const parent = windowInfo.parentWebContents
        if (parent && !parent.isDestroyed()) {
          parent.send('__ipc_sendto_relay__', { senderId, channel, args })
          return
        }
        break
      }
    }
    console.warn('[pluginWindow:method] 父窗口不存在或已销毁')
  }

  /**
   * 根据 webContentsId 获取插件路径
   */
  public getPluginPathByWebContentsId(webContentsId: number): string | null {
    for (const windowInfo of this.windowInfoMap.values()) {
      if (!windowInfo.window.isDestroyed() && windowInfo.window.webContents.id === webContentsId) {
        return windowInfo.pluginPath
      }
    }
    return null
  }

  /**
   * 根据 webContentsId 获取插件名称
   */
  public getPluginNameByWebContentsId(webContentsId: number): string | null {
    for (const windowInfo of this.windowInfoMap.values()) {
      if (!windowInfo.window.isDestroyed() && windowInfo.window.webContents.id === webContentsId) {
        return windowInfo.pluginName
      }
    }
    return null
  }

  /**
   * 父页面退出时解除独立可见窗口的父引用，只回收已隐藏的子窗口。
   * @param parent 退出的父 WebContents，不能按插件路径影响新会话。
   * @returns 无返回值。
   */
  public releaseParent(parent: Electron.WebContents): void {
    for (const info of this.windowInfoMap.values()) {
      if (info.parentWebContents !== parent) continue
      // 可见窗口持有独立会话，不保留父页面模型或失效 IPC 回调。
      info.parentWebContents = null
      if (!info.window.isVisible() || info.window.isMinimized()) info.window.close()
    }
  }

  /**
   * 关闭指定插件的所有窗口
   */
  public closeByPlugin(pluginPath: string): void {
    const windowIdsToClose: number[] = []

    for (const [winId, windowInfo] of this.windowInfoMap.entries()) {
      if (windowInfo.pluginPath === pluginPath) {
        windowIdsToClose.push(winId)
      }
    }

    for (const winId of windowIdsToClose) {
      const windowInfo = this.windowInfoMap.get(winId)
      if (windowInfo && !windowInfo.window.isDestroyed()) {
        windowInfo.window.destroy()
      }
      this.windowInfoMap.delete(winId)
    }

    console.log(
      `[pluginWindow:destroy] 已关闭插件 ${pluginPath} 的 ${windowIdsToClose.length} 个窗口`
    )
  }

  /**
   * 检查指定插件是否有打开的窗口
   */
  public hasWindowsByPlugin(pluginPath: string): boolean {
    for (const windowInfo of this.windowInfoMap.values()) {
      if (windowInfo.pluginPath === pluginPath && !windowInfo.window.isDestroyed()) {
        return true
      }
    }
    return false
  }

  /**
   * 检查 WebContents 是否属于 browser 窗口
   */
  public isBrowserWindow(webContents: Electron.WebContents): boolean {
    for (const windowInfo of this.windowInfoMap.values()) {
      if (!windowInfo.window.isDestroyed() && windowInfo.window.webContents.id === webContents.id) {
        return true
      }
    }
    return false
  }

  /**
   * 关闭所有窗口
   */
  public closeAll(): void {
    for (const windowInfo of this.windowInfoMap.values()) {
      if (!windowInfo.window.isDestroyed()) {
        windowInfo.window.close()
      }
    }
    this.windowInfoMap.clear()
  }

  /**
   * 广播消息到所有插件窗口
   */
  public broadcastToAll(channel: string, ...args: any[]): void {
    for (const windowInfo of this.windowInfoMap.values()) {
      if (!windowInfo.window.isDestroyed()) {
        windowInfo.window.webContents.send(channel, ...args)
      }
    }
  }

  /**
   * 在所有插件自建窗口中执行主题更新脚本。
   * @param script 要在插件页面主世界执行的 JavaScript。
   * @returns 所有窗口完成执行后的 Promise。
   */
  public async executeJavaScriptOnAllWindows(script: string): Promise<void> {
    const tasks: Promise<unknown>[] = []
    // 快照窗口集合，避免执行期间窗口关闭导致遍历状态变化。
    for (const windowInfo of this.windowInfoMap.values()) {
      if (!windowInfo.window.isDestroyed() && !windowInfo.window.webContents.isDestroyed()) {
        // 捕获窗口销毁竞态导致的同步异常，避免主题广播被单个窗口中断。
        tasks.push(
          Promise.resolve().then(() =>
            windowInfo.window.webContents.executeJavaScript(script, true)
          )
        )
      }
    }
    await Promise.allSettled(tasks)
  }
}

export default new PluginWindowManager()
