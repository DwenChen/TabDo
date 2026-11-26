import { app, BrowserWindow, ipcMain, WebContentsView } from 'electron'
import { fileURLToPath, pathToFileURL } from 'url'
import { v4 as uuidv4 } from 'uuid'
import databaseAPI from '../api/shared/database'
import { applyWindowMaterial, getDefaultWindowMaterial } from '../utils/windowUtils'
import { GLOBAL_SCROLLBAR_CSS } from './globalStyles.js'
import lmdbInstance from './lmdb/lmdbInstance'
import devToolsShortcut, { getDevToolsMode } from '../utils/devToolsShortcut'
import { WINDOW_WIDTH } from '../common/constants'
import { registerExternalLinkInterceptor } from '../managers/pluginManager'
import pluginWindowManager from './pluginWindowManager'
import { getDetachedWindowSizeKey } from '../../shared/pluginRuntimeNamespace'
import { getPreloadPath, getRendererPath } from '../utils/appBundlePath'
import type { AiRequestStatus } from '../../shared/aiRequestStatus'
import { isToolsPluginPath, releaseToolsView } from './toolsLifecycle'
import { isTemporaryResident, setTemporaryResident } from './temporaryResidency'
import { applyToolsWindowIdentity, getToolsWindowIcon } from './toolsWindowIdentity'
import {
  STANDARD_DETACHED_WINDOW_TITLEBAR_HEIGHT,
  normalizeCompactMainWindowHeader,
  resolveDetachedWindowTitlebarHeight
} from '../../shared/mainWindowLayout'
import type { PluginWindowPosition } from '../../shared/pluginWindowConfig'
import type { CursorPoint } from '../../shared/windowPlacement'
import { placeWindowForOpen } from '../utils/windowPlacement'
import { writeRememberedWindowSize } from './windowSizeMemory'

export const DETACHED_TITLEBAR_HEIGHT = STANDARD_DETACHED_WINDOW_TITLEBAR_HEIGHT
const MIN_WINDOW_WIDTH = 400
const CALL_AI_MIN_WINDOW_WIDTH = 520
const MIN_WINDOW_HEIGHT = 300
const MIN_VIEW_HEIGHT = MIN_WINDOW_HEIGHT - DETACHED_TITLEBAR_HEIGHT
const MAC_TRAFFIC_LIGHT_X = 15

/**
 * 分离窗口信息
 */
interface DetachedWindowInfo {
  window: BrowserWindow
  view: WebContentsView
  pluginPath: string
  pluginName: string
  pluginLogo?: string
  toolFeatureCode?: string
  toggleDevTools?: (
    webContents: Electron.WebContents,
    pluginPath: string
  ) => { success: boolean; error?: string }
  isAlwaysOnTop: boolean
  lastFocusTarget: 'titlebar' | 'plugin' // 记录最后一次焦点位置，用于窗口恢复
  savedFocusTarget: 'titlebar' | 'plugin' // 窗口失焦时快照的焦点状态
  foregroundWindow?: BrowserWindow
  keepsHiddenSession: boolean
  releaseHiddenTools?: (force?: boolean) => void
  previewFullscreen?: boolean
  /** 标题栏子输入框的当前可见性与占位文字，标题栏晚加载时按此恢复。 */
  subInputVisible?: boolean
  subInputPlaceholder?: string
  /** 标题栏尚未加载时收到的聚焦请求，初始化完成后执行一次。 */
  subInputFocusPending?: boolean
  /** 标题栏是否已完成首次加载，未完成时只保存状态等待初始化回填。 */
  titlebarReady?: boolean
}

export interface DetachedPluginUpgradeSnapshot {
  windowId: string
  pluginName: string
  pluginPath: string
  width: number
  viewHeight: number
}

/**
 * 分离窗口管理器 - 专门管理从主窗口分离出来的插件窗口
 */
class DetachedWindowManager {
  private detachedWindowMap: Map<string, DetachedWindowInfo> = new Map()
  private resizeSaveTimers: Map<string, NodeJS.Timeout> = new Map()
  private lastSavedSizeByPlugin: Map<string, { width: number; height: number }> = new Map()
  private suppressedSizePersistenceWindows = new Set<string>()
  // 使用历史尺寸恢复的会话语义：首次显示后忽略插件按内容请求的高度，保留用户选择。
  private restoredSizeViews = new Set<number>()
  private compactWindowHeader = false

  /**
   * 获取当前分离插件窗口的标题栏高度。
   * @returns 当前标题栏高度，单位为像素。
   */
  public getTitlebarHeight(): number {
    return resolveDetachedWindowTitlebarHeight(this.compactWindowHeader)
  }

  /**
   * 计算 macOS 系统交通灯在当前标题栏中的垂直居中位置。
   * @param titlebarHeight 当前分离窗口标题栏高度，单位为像素。
   * @returns Electron 交通灯左上角坐标。
   */
  private resolveTrafficLightPosition(titlebarHeight: number): Electron.Point {
    return {
      x: MAC_TRAFFIC_LIGHT_X,
      y: Math.max(8, Math.round((titlebarHeight - 16) / 2))
    }
  }

  /**
   * 更新所有分离插件窗口的标题栏密度，并保持插件正文高度不变。
   * @param enabled 是否启用紧凑顶部栏。
   * @returns 无返回值。
   */
  public setCompactWindowHeader(enabled: boolean): void {
    const compactWindowHeader = normalizeCompactMainWindowHeader(enabled)
    if (this.compactWindowHeader === compactWindowHeader) return

    // 先切换共享状态，确保 resize 回调使用新的标题栏高度。
    this.compactWindowHeader = compactWindowHeader
    const titlebarHeight = this.getTitlebarHeight()

    for (const info of this.detachedWindowMap.values()) {
      if (info.window.isDestroyed()) continue

      // 使用视图真实高度，避免覆盖插件主动设置或用户保存的正文尺寸。
      const windowBounds = info.window.getContentBounds()
      const viewBounds = info.view.getBounds()
      info.window.webContents.send('update-compact-main-window-header', compactWindowHeader)
      // 预览占满正文期间只更新标题栏偏好，退出预览时再恢复其实际高度。
      if (info.previewFullscreen) continue
      if (process.platform === 'darwin') {
        info.window.setWindowButtonPosition(this.resolveTrafficLightPosition(titlebarHeight))
      }
      info.window.setMinimumSize(
        info.toolFeatureCode === 'call-ai' ? CALL_AI_MIN_WINDOW_WIDTH : WINDOW_WIDTH,
        titlebarHeight
      )
      info.window.setContentSize(windowBounds.width, viewBounds.height + titlebarHeight)
      info.view.setBounds({
        x: 0,
        y: titlebarHeight,
        width: windowBounds.width,
        height: viewBounds.height
      })
    }
  }

  /**
   * 应用窗口材质（Windows 11）
   * @param win 当前分离窗口。
   * @returns 材质应用结束后的Promise，读取失败使用系统默认值。
   */
  private async applyWindowMaterial(win: BrowserWindow): Promise<void> {
    try {
      const settings = await lmdbInstance.promises.get('ZTOOLS/settings-general')
      const material =
        (settings?.data?.windowMaterial as 'mica' | 'acrylic' | 'none') ||
        getDefaultWindowMaterial()

      console.log('[DetachedWindow] 分离窗口应用材质:', material)
      applyWindowMaterial(win, material)
    } catch (error) {
      console.error('[DetachedWindow] 读取窗口材质配置失败，使用系统默认值:', error)
      applyWindowMaterial(win, getDefaultWindowMaterial())
    }
  }

  /**
   * 按分离窗口设置键持久化正文尺寸。
   * @param pluginName 插件有效名称。
   * @param toolFeatureCode 内置工具功能码；第三方插件省略。
   * @param width 窗口宽度。
   * @param viewHeight 正文高度。
   * @returns 无返回值。
   */
  private persistWindowSize(
    pluginName: string,
    toolFeatureCode: string | undefined,
    width: number,
    viewHeight: number
  ): void {
    try {
      const normalizedWidth = Math.max(MIN_WINDOW_WIDTH, Math.round(width))
      const normalizedHeight = Math.max(MIN_VIEW_HEIGHT, Math.round(viewHeight))
      const sizeKey = getDetachedWindowSizeKey(pluginName, toolFeatureCode)
      const lastSaved = this.lastSavedSizeByPlugin.get(sizeKey)
      if (
        lastSaved &&
        lastSaved.width === normalizedWidth &&
        lastSaved.height === normalizedHeight
      ) {
        return
      }

      writeRememberedWindowSize(pluginName, toolFeatureCode, normalizedWidth, normalizedHeight)
      this.lastSavedSizeByPlugin.set(sizeKey, {
        width: normalizedWidth,
        height: normalizedHeight
      })
    } catch (error) {
      console.error('[DetachedWindow] 保存分离窗口尺寸失败:', error)
    }
  }

  /**
   * 防抖保存尺寸，避免频繁写入。
   * @param windowId 分离窗口标识。
   * @param pluginName 插件有效名称。
   * @param toolFeatureCode 内置工具功能码；第三方插件省略。
   * @param width 窗口宽度。
   * @param viewHeight 正文高度。
   * @returns 无返回值。
   */
  private schedulePersistWindowSize(
    windowId: string,
    pluginName: string,
    toolFeatureCode: string | undefined,
    width: number,
    viewHeight: number
  ): void {
    const existingTimer = this.resizeSaveTimers.get(windowId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      this.persistWindowSize(pluginName, toolFeatureCode, width, viewHeight)
      this.resizeSaveTimers.delete(windowId)
    }, 300)

    this.resizeSaveTimers.set(windowId, timer)
  }

  /**
   * 创建承载指定插件视图的独立窗口，并初始化自定义标题栏状态。
   * @param pluginPath 插件物理路径
   * @param pluginName 插件运行时名称
   * @param pluginView 待迁移的插件 WebContentsView
   * @param options 独立窗口尺寸、标题栏和焦点配置
   * @returns 创建成功的独立窗口；创建失败时返回 null
   */
  public createDetachedWindow(
    pluginPath: string,
    pluginName: string,
    pluginView: WebContentsView,
    options: {
      width: number
      height: number
      show?: boolean
      title: string
      logo?: string
      toolFeatureCode?: string
      /** 开发者声明的打开位置，默认跟随光标。 */
      position?: PluginWindowPosition
      /** 触发超级面板时的光标位置，优先于窗口创建时的实时指针。 */
      cursorPoint?: CursorPoint
      /** 开发者是否允许用户调整窗口大小。 */
      resizable?: boolean
      /** 用户是否允许记住可调整窗口的上次尺寸。 */
      rememberSize?: boolean
      /** 本次是否已按历史尺寸恢复，需要忽略插件首次请求的自动高度。 */
      restoredSize?: boolean
      searchQuery?: string // 搜索框当前值
      searchPlaceholder?: string // 搜索框占位符
      subInputVisible?: boolean // 子输入框是否可见
      autoFocusSubInput?: boolean // 是否自动聚焦子输入框
      /** 等待插件正文完成首次加载后再显示窗口，避免首帧亮出空白正文。 */
      awaitContentReady?: boolean
      aiRequestStatus?: AiRequestStatus // 分离前该插件已有的 AI 请求状态
      toggleDevTools?: (
        webContents: Electron.WebContents,
        pluginPath: string
      ) => { success: boolean; error?: string }
    }
  ): BrowserWindow | null {
    try {
      const windowId = uuidv4()
      const keepsHiddenSession =
        pluginName === 'setting' ||
        options.toolFeatureCode === 'call-ai' ||
        options.toolFeatureCode === 'presentation-editor'

      // 新窗口直接使用持久化密度，避免标题栏首次显示后再跳变。
      const settings = databaseAPI.dbGet('settings-general')
      this.compactWindowHeader = normalizeCompactMainWindowHeader(settings?.compactMainWindowHeader)
      const titlebarHeight = this.getTitlebarHeight()

      // 创建窗口（macOS 和 Windows 都使用无边框，macOS 保留交通灯）
      const isMac = process.platform === 'darwin'
      const isWindows = process.platform === 'win32'
      const isCallAi = options.toolFeatureCode === 'call-ai'
      const resizable = options.resizable !== false
      // 不可调整的窗口不写入用户尺寸，避免下一次打开继承本次自动尺寸。
      const rememberSize = resizable && options.rememberSize !== false
      const toolIcon = isToolsPluginPath(pluginPath) ? getToolsWindowIcon(options.toolFeatureCode) : undefined
      // 内置子组件在标题栏、原生窗口和任务栏统一使用功能自身图标，不继承工具插件总图标。
      const pluginLogo =
        isToolsPluginPath(pluginPath) && toolIcon && !toolIcon.isEmpty()
          ? toolIcon.toDataURL()
          : options.logo

      const windowConfig: Electron.BrowserWindowConstructorOptions = {
        width: options.width,
        height: options.height + titlebarHeight,
        // 始终先隐藏创建，避免标题栏或正文尚未就绪时先亮出搜索条和空白区域。
        show: false,
        title: options.title,
        ...(toolIcon && {
          icon: toolIcon,
          skipTaskbar: false
        }),
        frame: false, // 两个平台都无边框
        titleBarStyle: isMac ? 'hiddenInset' : undefined, // macOS 保留交通灯按钮
        ...(isMac && {
          trafficLightPosition: this.resolveTrafficLightPosition(titlebarHeight)
        }),
        resizable: resizable,
        maximizable: resizable,
        minWidth: isCallAi ? CALL_AI_MIN_WINDOW_WIDTH : WINDOW_WIDTH,
        minHeight: titlebarHeight,
        hasShadow: true, // 启用窗口阴影（可调整为 false 来移除阴影）
        webPreferences: {
          preload: getPreloadPath(),
          sandbox: process.env.TABDO_SOURCE_PREVIEW !== '1',
          backgroundThrottling: false, // 窗口最小化时是否继续动画和定时器
          contextIsolation: true, // 启用上下文隔离
          nodeIntegration: false, // 渲染进程禁止直接使用 Node
          spellcheck: false, // 禁用拼写检查
          webSecurity: false
        }
      }

      // macOS 系统配置：设置透明度和毛玻璃效果（与主窗口一致）
      if (isMac) {
        windowConfig.transparent = true
        windowConfig.vibrancy = 'fullscreen-ui'
      }
      // Windows 系统配置（与主窗口保持一致）
      else if (isWindows) {
        windowConfig.backgroundColor = '#00000000' // 完全透明，让 Mica 材质显示
        // 设置插件窗口独立图标
        if (options.logo && !isToolsPluginPath(pluginPath)) {
          try {
            windowConfig.icon = options.logo.startsWith('file:')
              ? fileURLToPath(options.logo)
              : options.logo
          } catch (error) {
            console.warn('[DetachedWindow] 设置窗口图标失败:', error)
          }
        }
      }

      const win = new BrowserWindow(windowConfig)
      if (isToolsPluginPath(pluginPath))
        applyToolsWindowIdentity(win, options.toolFeatureCode || 'tools')

      // Windows 11 应用窗口材质（与主窗口保持一致）
      if (isWindows) {
        this.applyWindowMaterial(win)
        // 设置插件窗口ID，避免任务栏窗口合并
        if (!isToolsPluginPath(pluginPath)) {
          win.setAppDetails({ appId: 'TabDo.' + pluginName })
        }
      }

      // 首次显示前完成定位：跟随光标时贴近触发位置，固定窗口在当前显示器居中。
      placeWindowForOpen(win, options.position ?? 'cursor', options.cursorPoint)

      // 历史尺寸已恢复到首次显示，后续插件按内容请求的高度不能覆盖用户选择。
      const restoredSize = rememberSize && options.restoredSize === true
      const pluginContentsId = pluginView.webContents.id
      if (restoredSize) this.restoredSizeViews.add(pluginContentsId)

      // 正文迁移独立于标题栏加载；标题栏初始化较慢时也不能出现整个空白窗口。
      const initialBounds = win.getContentBounds()
      pluginView.setBounds({
        x: 0,
        y: titlebarHeight,
        width: initialBounds.width,
        height: Math.max(1, initialBounds.height - titlebarHeight)
      })
      win.contentView.addChildView(pluginView)

      // 源码预览直接读取同一渲染服务器，不依赖上一次编译留下的 out 文件。
      const titlebarUrl =
        !app.isPackaged && process.env.ELECTRON_RENDERER_URL
          ? new URL('detached-titlebar.html', process.env.ELECTRON_RENDERER_URL).href
          : pathToFileURL(getRendererPath('detached-titlebar.html')).href

      // 延迟焦点只属于这份正文；关闭窗口后取消，不能读取 Electron 已清空的 view 属性。
      const contents = pluginView.webContents
      let focusTimer: ReturnType<typeof setTimeout> | undefined
      let revealFallbackTimer: ReturnType<typeof setTimeout> | undefined
      let titlebarReady = false
      let contentReady = options.awaitContentReady !== true

      /**
       * 在窗口实际显示后恢复焦点，隐藏期间的初始化焦点请求保留到显示时执行。
       * @returns 无返回值。
       */
      const focusAfterShown = (): void => {
        if (options.show === false) return
        clearTimeout(focusTimer)
        focusTimer = setTimeout(() => {
          // 隐藏、最小化或退役后的页面不抢焦点，也不再访问原视图。
          if (win.isDestroyed() || contents.isDestroyed() || !win.isVisible() || win.isMinimized())
            return
          const currentInfo = this.detachedWindowMap.get(windowId)
          const pendingFocus = currentInfo?.subInputFocusPending === true
          if (currentInfo) currentInfo.subInputFocusPending = false
          if (pendingFocus || options.autoFocusSubInput === true) {
            win.webContents.focus()
            win.webContents.send('focus-sub-input')
          } else contents.focus()
        }, 100)
      }

      /**
       * 标题栏和所需正文就绪后再显示，避免首帧先亮出搜索条或空白正文。
       * @param force 加载失败或超时兜底时忽略尚未完成的就绪条件。
       * @returns 无返回值。
       */
      const revealWindow = (force = false): void => {
        if (options.show === false || win.isDestroyed() || win.isVisible()) return
        if (!force && (!titlebarReady || !contentReady)) return
        if (revealFallbackTimer) {
          clearTimeout(revealFallbackTimer)
          revealFallbackTimer = undefined
        }
        win.show()
        focusAfterShown()
      }

      win.once('closed', () => {
        clearTimeout(focusTimer)
        if (revealFallbackTimer) clearTimeout(revealFallbackTimer)
      })

      // 正文可能由调用方提前开始加载；先判定是否已结束，避免错过就绪事件。
      const markContentReady = (): void => {
        if (contentReady) return
        contentReady = true
        revealWindow()
      }
      if (options.awaitContentReady && options.show !== false) {
        if (!contents.isLoading() && contents.getURL()) markContentReady()
        else contents.once('did-finish-load', markContentReady)
        contents.once('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
          if (isMainFrame) revealWindow(true)
        })
      }

      win.webContents.once('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
        if (isMainFrame) revealWindow(true)
      })

      // 标题栏加载完成后发送插件信息，并添加插件视图
      win.webContents.on('did-finish-load', () => {
        if (win.isDestroyed() || contents.isDestroyed()) return
        console.log('[DetachedWindow] 标题栏加载完成，发送插件信息', {
          pluginName,
          options
        })
        const currentInfo = this.detachedWindowMap.get(windowId)
        if (currentInfo) currentInfo.titlebarReady = true
        titlebarReady = true
        win.webContents.send('init-titlebar', {
          pluginName,
          pluginPath,
          pluginLogo,
          showDevTools: !keepsHiddenSession && options.toolFeatureCode !== 'presentation-recorder',
          platform: process.platform,
          title: options.title, // 窗口标题
          searchQuery: options.searchQuery || '', // 搜索框初始值
          searchPlaceholder: currentInfo?.subInputPlaceholder || options.searchPlaceholder || '搜索...', // 搜索框占位符
          subInputVisible: currentInfo?.subInputVisible === true, // 子输入框可见性
          aiRequestStatus: options.aiRequestStatus ?? 'idle',
          resizable,
          compactWindowHeader: this.compactWindowHeader
        })

        // 注入全局滚动条样式到独立窗口的标题栏
        win.webContents.insertCSS(GLOBAL_SCROLLBAR_CSS)

        // 添加插件视图（在标题栏下方）
        const bounds = win.getContentBounds()
        const currentTitlebarHeight = this.detachedWindowMap.get(windowId)?.previewFullscreen ? 0 : this.getTitlebarHeight()
        pluginView.setBounds({
          x: 0,
          y: currentTitlebarHeight,
          width: bounds.width,
          height: bounds.height - currentTitlebarHeight
        })

        revealWindow()
      })

      if (options.show !== false) {
        // 兜底：标题栏或正文加载失败时仍显示窗口，不能把会话永久留在隐藏状态。
        revealFallbackTimer = setTimeout(() => revealWindow(true), 1500)
        revealFallbackTimer.unref?.()
      }

      win.loadURL(titlebarUrl)

      // 用户拖动边缘后结束历史尺寸保护，后续尺寸即新的用户选择。
      win.on('will-resize', () => {
        this.restoredSizeViews.delete(pluginContentsId)
      })

      // 监听窗口大小变化
      win.on('resize', () => {
        if (!win.isDestroyed()) {
          const newBounds = win.getContentBounds()
          const previewFullscreen = this.detachedWindowMap.get(windowId)?.previewFullscreen
          const currentTitlebarHeight = previewFullscreen ? 0 : this.getTitlebarHeight()
          // 只需要更新插件视图大小（标题栏由窗口自动处理）
          pluginView.setBounds({
            x: 0,
            y: currentTitlebarHeight,
            width: newBounds.width,
            height: newBounds.height - currentTitlebarHeight
          })

          // 升级期间的 0 高度是临时状态，不得覆盖用户保存的窗口尺寸。
          if (
            rememberSize &&
            !previewFullscreen &&
            !win.isFullScreen() &&
            !this.suppressedSizePersistenceWindows.has(windowId)
          ) {
            this.schedulePersistWindowSize(
              windowId,
              pluginName,
              options.toolFeatureCode,
              newBounds.width,
              newBounds.height - currentTitlebarHeight
            )
          }
        }
      })

      // 保存窗口信息
      const windowInfo: DetachedWindowInfo = {
        window: win,
        view: pluginView,
        pluginPath,
        pluginName,
        pluginLogo,
        toolFeatureCode: options.toolFeatureCode,
        keepsHiddenSession,
        toggleDevTools: options.toggleDevTools,
        isAlwaysOnTop: false,
        lastFocusTarget: options.autoFocusSubInput ? 'titlebar' : 'plugin',
        savedFocusTarget: options.autoFocusSubInput ? 'titlebar' : 'plugin',
        subInputVisible: options.subInputVisible === true,
        subInputPlaceholder: options.searchPlaceholder || '搜索...'
      }
      this.detachedWindowMap.set(windowId, windowInfo)

      /**
       * 所属窗口全部退出前台时退役；特权窗口和用户临时常驻的会话可以保留。
       * @param force 明确关闭时忽略辅助前台及会话保留策略。
       * @returns 无返回值。
       */
      const releaseHiddenTools = (force = false): void => {
        if (!force && (windowInfo.keepsHiddenSession || isTemporaryResident(pluginView.webContents)))
          return
        // 所属辅助窗口仍在前台时，隐藏编辑窗口只是同一会话的界面交接。
        const foreground = windowInfo.foregroundWindow
        if (
          !force &&
          foreground &&
          !foreground.isDestroyed() &&
          foreground.isVisible() &&
          !foreground.isMinimized()
        )
          return
        // 立即从可复用窗口中移除，旧任务不能污染随后新打开的工具。
        this.detachedWindowMap.delete(windowId)
        pluginWindowManager.releaseParent(pluginView.webContents)
        if (!win.isDestroyed()) win.contentView.removeChildView(pluginView)
        releaseToolsView(
          pluginView.webContents,
          () => {
            if (!win.isDestroyed()) win.destroy()
          },
          { name: pluginName, path: pluginPath, logo: options.logo }
        )
      }
      windowInfo.releaseHiddenTools = releaseHiddenTools
      win.on('hide', () => releaseHiddenTools())
      win.on('minimize', () => releaseHiddenTools())

      // 关闭仅卸下工具页面，必要任务仍可在独立运行时内完成保存。
      win.on('close', () => {
        // 用户关闭和宿主退出总是释放，临时常驻不能阻止明确退出。
        setTemporaryResident(pluginView.webContents, false)
        releaseHiddenTools(true)
      })

      // 监听窗口关闭
      win.on('closed', () => {
        this.detachedWindowMap.delete(windowId)
        this.suppressedSizePersistenceWindows.delete(windowId)
        this.restoredSizeViews.delete(pluginContentsId)
        const timer = this.resizeSaveTimers.get(windowId)
        if (timer) {
          clearTimeout(timer)
          this.resizeSaveTimers.delete(windowId)
        }
        // 工具子窗口已在退役时关闭；迟到的旧窗口销毁不能按路径关闭新会话的子窗口。
        // 子窗口已经在退役时关闭，迟到回调不再按路径影响新会话。
        // 销毁插件视图的 webContents

        console.log(`[DetachedWindow] 分离窗口已关闭: ${pluginName}`)
        // 更新 Dock 图标显示状态
        this.updateDockVisibility()
      })

      // 设置 IPC 通信（标题栏控制窗口）
      this.setupTitlebarIPC(windowId)

      // 首次显示统一交给标题栏和正文就绪回调，创建收尾不再无条件亮出半成品窗口。

      // 焦点跟踪：实时记录焦点在标题栏还是插件视图
      win.webContents.on('focus', () => {
        windowInfo.lastFocusTarget = 'titlebar'
      })

      pluginView.webContents.on('focus', () => {
        windowInfo.lastFocusTarget = 'plugin'
        if (!pluginView.webContents.isDestroyed()) {
          devToolsShortcut.register(pluginView.webContents, () => {
            if (windowInfo.toggleDevTools) {
              const result = windowInfo.toggleDevTools(pluginView.webContents, pluginPath)
              if (!result.success && result.error) {
                win.webContents.send('show-plugin-error', result.error)
              }
              return
            }

            if (pluginView.webContents.isDevToolsOpened()) {
              pluginView.webContents.closeDevTools()
            } else {
              pluginView.webContents.openDevTools({ mode: getDevToolsMode() })
            }
          })
        }
      })

      pluginView.webContents.on('blur', () => {
        devToolsShortcut.unregister()
      })

      // 拦截外部链接跳转，使用系统默认浏览器打开
      registerExternalLinkInterceptor(pluginView.webContents)

      // 窗口失焦时快照焦点状态（此时 lastFocusTarget 还是正确的）
      win.on('blur', () => {
        windowInfo.savedFocusTarget = windowInfo.lastFocusTarget
      })

      // 窗口从后台恢复时，用快照状态恢复焦点
      // （此时 webContents focus 事件已经把 lastFocusTarget 覆盖成 titlebar 了）
      win.on('focus', () => {
        if (windowInfo.savedFocusTarget === 'plugin') {
          if (!pluginView.webContents.isDestroyed()) {
            pluginView.webContents.focus()
          }
        }
      })

      // 更新 Dock 图标显示状态
      this.updateDockVisibility()

      console.log(`[DetachedWindow] 创建分离窗口成功: ${pluginName}`)
      return win
    } catch (error) {
      console.error('[DetachedWindow] 创建分离窗口失败:', error)
      return null
    }
  }

  /**
   * 等待分离窗口完成首次显示，供宿主在隐藏来源窗口前完成可见交接。
   * @param win 由本管理器创建的分离窗口。
   * @param timeoutMs 兜底等待时长，超时后不再阻塞调用方。
   * @returns 窗口已显示、已关闭或等待超时后结束的 Promise。
   */
  public waitForWindowVisible(win: BrowserWindow, timeoutMs = 1600): Promise<void> {
    if (win.isDestroyed() || win.isVisible()) return Promise.resolve()
    return new Promise((resolve) => {
      /**
       * 结束等待并撤销全部监听，避免同一窗口后续显示时重复回调。
       * @returns 无返回值。
       */
      const finish = (): void => {
        clearTimeout(timer)
        win.removeListener('show', finish)
        win.removeListener('closed', finish)
        resolve()
      }
      win.once('show', finish)
      win.once('closed', finish)
      const timer = setTimeout(finish, timeoutMs)
      timer.unref?.()
    })
  }

  /**
   * 将演示前台交给录屏控制条；编辑器卸载后按普通会话规则回收。
   * @param webContentsId 所属独立工具视图身份。
   * @param foreground 本次会话已经显示的辅助窗口。
   * @returns 是否成功交接；不支持的视图不会隐藏。
   */
  public showAuxiliaryForegroundWindow(webContentsId: number, foreground: BrowserWindow): boolean {
    const info = [...this.detachedWindowMap.values()].find(
      (entry) => entry.view.webContents.id === webContentsId
    )
    if (
      !info ||
      !isToolsPluginPath(info.pluginPath) ||
      info.window.isDestroyed() ||
      foreground.isDestroyed() ||
      !foreground.isVisible() ||
      foreground.isMinimized()
    )
      return false
    // 先撤销编辑器的独立保留策略，再隐藏正文并交给可见控制条。
    info.keepsHiddenSession = false
    if (info.foregroundWindow !== foreground) {
      info.foregroundWindow = foreground
      /**
       * 辅助窗口退出前台后，按当前正文的窗口策略决定是否保留会话。
       * @returns 无返回值。
       */
      const release = (): void => {
        if (info.foregroundWindow !== foreground || info.window.isDestroyed()) return
        if (!info.window.isVisible() || info.window.isMinimized()) info.releaseHiddenTools?.()
      }
      foreground.on('hide', release)
      foreground.on('minimize', release)
      foreground.once('closed', release)
      info.window.once('closed', () => {
        foreground.removeListener('hide', release)
        foreground.removeListener('minimize', release)
        foreground.removeListener('closed', release)
      })
    }
    // 只在辅助窗口可见后隐藏正文，避免加载失败留下不可访问的会话。
    info.window.hide()
    return true
  }

  /**
   * 在恢复演示编辑器前启用其独立窗口的保留策略。
   * @param webContentsId 演示工具正文的身份。
   * @returns 编辑器所属窗口；会话已结束时返回空值。
   */
  public retainPresentationEditor(webContentsId: number): BrowserWindow | undefined {
    const info = [...this.detachedWindowMap.values()].find(
      (entry) =>
        (entry.toolFeatureCode === 'presentation-recorder' ||
          entry.toolFeatureCode === 'presentation-editor') &&
        entry.view.webContents.id === webContentsId &&
        !entry.window.isDestroyed()
    )
    if (!info) return undefined
    // 控制条随后隐藏时仍保留编辑会话，包括编辑器最小化的情况。
    info.keepsHiddenSession = true
    return info.window
  }

  /**
   * 设置标题栏 IPC 通信
   */
  private setupTitlebarIPC(windowId: string): void {
    const windowInfo = this.detachedWindowMap.get(windowId)
    if (!windowInfo) return

    const { window: win, view: pluginView } = windowInfo

    // 使用闭包保存 windowInfo，避免后续查找
    const handleTitlebarAction = (_event: Electron.IpcMainEvent, action: string): void => {
      // 验证事件来自这个窗口
      if (_event.sender.id !== win.webContents.id) return
      if (win.isDestroyed()) return

      switch (action) {
        case 'minimize':
          win.minimize()
          break
        case 'maximize':
          // 非可调整窗口由开发者固定尺寸，标题栏双击和按钮都不能绕过。
          if (!win.isMaximizable()) break
          if (win.isMaximized()) {
            win.unmaximize()
          } else {
            win.maximize()
          }
          break
        case 'close':
          win.close()
          break
        case 'toggle-pin':
          windowInfo.isAlwaysOnTop = !windowInfo.isAlwaysOnTop
          win.setAlwaysOnTop(windowInfo.isAlwaysOnTop)
          win.webContents.send('pin-state-changed', windowInfo.isAlwaysOnTop)
          break
        case 'open-devtools':
          if (!pluginView.webContents.isDestroyed()) {
            if (windowInfo.toggleDevTools) {
              const result = windowInfo.toggleDevTools(
                pluginView.webContents,
                windowInfo.pluginPath
              )
              if (!result.success && result.error) {
                win.webContents.send('show-plugin-error', result.error)
              }
            } else if (pluginView.webContents.isDevToolsOpened()) {
              pluginView.webContents.closeDevTools()
            } else {
              pluginView.webContents.openDevTools({ mode: getDevToolsMode() })
            }
          }
          break
      }
    }

    const handleSearchInput = (_event: Electron.IpcMainEvent, value: string): void => {
      // 验证事件来自这个窗口
      if (_event.sender.id !== win.webContents.id) return
      if (!pluginView.webContents.isDestroyed()) {
        // 发送对象格式，和主窗口保持一致
        pluginView.webContents.send('sub-input-change', { text: value })
      }
    }

    const handleTitlebarDblClick = (_event: Electron.IpcMainEvent): void => {
      // 验证事件来自这个窗口
      if (_event.sender.id !== win.webContents.id) return
      if (!win.isMaximizable()) return
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }

    const handleSendArrowKey = (_event: Electron.IpcMainEvent, keyEvent: any): void => {
      // 验证事件来自这个窗口
      if (_event.sender.id !== win.webContents.id) return
      if (!pluginView.webContents.isDestroyed()) {
        // 发送方向键到插件
        pluginView.webContents.sendInputEvent(keyEvent)
      }
    }

    // 监听标题栏发送的窗口控制命令
    ipcMain.on('titlebar-action', handleTitlebarAction)

    // 监听搜索框输入
    ipcMain.on('search-input', handleSearchInput)

    // 监听双击标题栏（macOS 行为：最大化/还原）
    if (process.platform === 'darwin') {
      ipcMain.on('titlebar-dblclick', handleTitlebarDblClick)
    }

    // 监听方向键事件
    ipcMain.on('send-arrow-key', handleSendArrowKey)

    // 窗口关闭时移除监听器
    win.once('closed', () => {
      ipcMain.off('titlebar-action', handleTitlebarAction)
      ipcMain.off('search-input', handleSearchInput)
      ipcMain.off('send-arrow-key', handleSendArrowKey)
      if (process.platform === 'darwin') {
        ipcMain.off('titlebar-dblclick', handleTitlebarDblClick)
      }
    })
  }

  /**
   * 恢复并聚焦指定插件及可选工具功能的独立窗口。
   * @param pluginPath 插件物理路径。
   * @param toolFeatureCode 内置工具功能码，省略时按插件匹配。
   * @returns 是否找到并恢复窗口。
   */
  public focusByPlugin(pluginPath: string, toolFeatureCode?: string): boolean {
    for (const windowInfo of this.detachedWindowMap.values()) {
      if (
        windowInfo.pluginPath === pluginPath &&
        (toolFeatureCode === undefined || windowInfo.toolFeatureCode === toolFeatureCode) &&
        !windowInfo.window.isDestroyed()
      ) {
        if (windowInfo.window.isMinimized()) windowInfo.window.restore()
        // 隐藏的临时常驻窗口也必须先显示，单独 focus 在 Windows 不会恢复可见性。
        windowInfo.window.show()
        windowInfo.window.focus()
        return true
      }
    }
    return false
  }

  /**
   * 获取指定插件及可选工具功能的独立正文，避免其他子组件接管常驻页面。
   * @param pluginPath 插件物理路径。
   * @param toolFeatureCode 内置工具功能码，省略时按插件匹配。
   * @returns 匹配的存活正文，没有匹配时返回 null。
   */
  public getViewByPlugin(pluginPath: string, toolFeatureCode?: string): WebContentsView | null {
    for (const windowInfo of this.detachedWindowMap.values()) {
      if (
        windowInfo.pluginPath === pluginPath &&
        (toolFeatureCode === undefined || windowInfo.toolFeatureCode === toolFeatureCode) &&
        !windowInfo.window.isDestroyed() &&
        !windowInfo.view.webContents.isDestroyed()
      ) {
        return windowInfo.view
      }
    }
    return null
  }

  /**
   * 保存指定独立窗口的尺寸，并将插件内容区收起到 0 高度等待升级。
   * @param pluginName 需要升级的插件名称
   * @param pluginPath 当前插件物理路径
   * @param webContents 发起升级的独立标题栏 WebContents
   * @returns 独立窗口升级快照；调用来源或插件不匹配时返回 null
   */
  public collapsePluginForUpgrade(
    pluginName: string,
    pluginPath: string,
    webContents: Electron.WebContents
  ): DetachedPluginUpgradeSnapshot | null {
    for (const [windowId, info] of this.detachedWindowMap.entries()) {
      if (
        info.window.isDestroyed() ||
        info.window.webContents.id !== webContents.id ||
        info.pluginName !== pluginName ||
        info.pluginPath !== pluginPath
      ) {
        continue
      }

      // 先保存真实内容尺寸，再抑制升级收起动作触发的尺寸持久化。
      const bounds = info.window.getContentBounds()
      const titlebarHeight = this.getTitlebarHeight()
      const snapshot: DetachedPluginUpgradeSnapshot = {
        windowId,
        pluginName,
        pluginPath,
        width: bounds.width,
        viewHeight: Math.max(0, bounds.height - titlebarHeight)
      }
      this.suppressedSizePersistenceWindows.add(windowId)

      // 保留标题栏及升级进度，隐藏即将被替换的插件内容。
      info.view.setBounds({
        x: 0,
        y: titlebarHeight,
        width: bounds.width,
        height: 0
      })
      info.window.setContentSize(bounds.width, titlebarHeight)
      return snapshot
    }

    return null
  }

  /**
   * 在升级失败且旧独立窗口仍存活时恢复原插件内容高度。
   * @param snapshot 升级开始前保存的独立窗口快照
   * @returns 是否成功恢复原独立窗口
   */
  public restorePluginAfterFailedUpgrade(snapshot: DetachedPluginUpgradeSnapshot): boolean {
    const info = this.detachedWindowMap.get(snapshot.windowId)
    if (
      !info ||
      info.window.isDestroyed() ||
      info.pluginName !== snapshot.pluginName ||
      info.pluginPath !== snapshot.pluginPath
    ) {
      return false
    }

    // 恢复前解除持久化抑制，让原始尺寸继续作为用户窗口尺寸保存。
    this.suppressedSizePersistenceWindows.delete(snapshot.windowId)
    const titlebarHeight = this.getTitlebarHeight()
    info.window.setContentSize(snapshot.width, snapshot.viewHeight + titlebarHeight)
    info.view.setBounds({
      x: 0,
      y: titlebarHeight,
      width: snapshot.width,
      height: snapshot.viewHeight
    })
    info.window.show()
    info.window.focus()
    return true
  }

  /**
   * 关闭指定插件的所有分离窗口
   */
  public closeByPlugin(pluginPath: string): void {
    const windowIdsToClose: string[] = []

    for (const [windowId, windowInfo] of this.detachedWindowMap.entries()) {
      if (windowInfo.pluginPath === pluginPath) {
        windowIdsToClose.push(windowId)
      }
    }

    for (const windowId of windowIdsToClose) {
      const windowInfo = this.detachedWindowMap.get(windowId)
      if (windowInfo && !windowInfo.window.isDestroyed()) {
        windowInfo.window.destroy()
      }
      this.detachedWindowMap.delete(windowId)
    }

    console.log(
      `[DetachedWindow] 已关闭插件 ${pluginPath} 的 ${windowIdsToClose.length} 个分离窗口`
    )
  }

  /**
   * 关闭所有分离窗口
   */
  public closeAll(): void {
    for (const windowInfo of this.detachedWindowMap.values()) {
      if (!windowInfo.window.isDestroyed()) {
        windowInfo.window.close()
      }
    }
    this.detachedWindowMap.clear()
    // 更新 Dock 图标显示状态
    this.updateDockVisibility()
  }

  /**
   * 获取所有分离窗口
   */
  public getAllWindows(): DetachedWindowInfo[] {
    return Array.from(this.detachedWindowMap.values())
  }

  /**
   * 检查是否有分离窗口
   */
  public hasDetachedWindows(): boolean {
    return this.detachedWindowMap.size > 0
  }

  /**
   * 根据插件 webContents ID 查找对应的分离窗口
   */
  public getWindowByPluginWebContents(webContentsId: number): BrowserWindow | null {
    for (const windowInfo of this.detachedWindowMap.values()) {
      if (windowInfo.view.webContents.id === webContentsId) {
        return windowInfo.window
      }
    }
    return null
  }

  /**
   * 将所属插件预览铺满窗口并隔离临时全屏尺寸，退出后恢复宿主标题栏。
   * @param webContentsId 当前预览所属正文的身份。
   * @param enabled 是否由预览临时接管整个窗口正文。
   * @returns 已找到且更新当前会话窗口时返回 true，否则返回 false。
   */
  public setPreviewFullscreen(webContentsId: number, enabled: boolean): boolean {
    for (const info of this.detachedWindowMap.values()) {
      if (info.view.webContents.id !== webContentsId || info.window.isDestroyed() || info.view.webContents.isDestroyed()) continue
      // 先切换所有权，保证后续原生 resize 不保存临时全屏尺寸。
      info.previewFullscreen = enabled
      const bounds = info.window.getContentBounds()
      const titlebarHeight = enabled ? 0 : this.getTitlebarHeight()
      info.view.setBounds({ x: 0, y: titlebarHeight, width: bounds.width, height: Math.max(1, bounds.height - titlebarHeight) })
      return true
    }
    return false
  }

  /**
   * 将宿主标题栏映射到所属正文，拒绝插件页面冒充标题栏操作。
   * @param sender 发起宿主操作的页面。
   * @returns 同窗口的插件正文，身份不匹配时为空。
   */
  public getPluginForTitlebar(sender: Electron.WebContents): Electron.WebContents | null {
    for (const info of this.detachedWindowMap.values()) {
      if (
        !info.window.isDestroyed() &&
        info.window.webContents === sender &&
        !info.view.webContents.isDestroyed()
      )
        return info.view.webContents
    }
    return null
  }

  /**
   * 更新 macOS Dock 图标显示状态
   * 如果有分离窗口，显示 Dock 图标；否则隐藏
   */
  private updateDockVisibility(): void {
    if (process.platform === 'darwin') {
      if (this.hasDetachedWindows()) {
        app.dock?.show()
      } else {
        app.dock?.hide()
      }
    }
  }

  /**
   * 更新所有分离窗口的材质
   */
  public updateAllWindowsMaterial(material: 'mica' | 'acrylic' | 'none'): void {
    for (const [windowId, info] of this.detachedWindowMap.entries()) {
      try {
        // 更新主进程窗口材质
        applyWindowMaterial(info.window, material)
        console.log(`[DetachedWindow] 分离窗口 ${windowId} 材质已更新为 ${material}`)

        // 通知渲染进程更新样式
        info.window.webContents.send('update-window-material', material)
      } catch (error) {
        console.error(`[DetachedWindow] 更新分离窗口 ${windowId} 材质失败:`, error)
      }
    }
  }

  /**
   * 设置分离窗口中插件视图的高度
   */
  public setExpendHeight(webContentsId: number, height: number): void {
    // 历史尺寸恢复期间，插件挂载时的默认高度请求不能覆盖用户上次选择。
    if (this.restoredSizeViews.has(webContentsId)) return
    for (const info of this.detachedWindowMap.values()) {
      if (info.view.webContents.id === webContentsId) {
        if (info.window.isDestroyed()) return

        const bounds = info.window.getContentBounds()
        const titlebarHeight = this.getTitlebarHeight()
        const newWindowHeight = height + titlebarHeight

        // 调整窗口大小
        info.window.setContentSize(bounds.width, newWindowHeight)

        // 调整插件视图大小
        info.view.setBounds({
          x: 0,
          y: titlebarHeight,
          width: bounds.width,
          height: height
        })

        console.log('[DetachedWindow] 设置分离窗口插件高度:', height)
        return
      }
    }
  }

  /**
   * 更新独立窗口标题栏的子输入框状态；标题栏晚加载时先保存，初始化时回填。
   * @param webContentsId 插件正文的 WebContents 标识。
   * @param visible 子输入框是否显示。
   * @param placeholder 可选的占位文字。
   * @param focus 显示后是否聚焦子输入框。
   * @returns 无返回值。
   */
  public updateSubInputState(
    webContentsId: number,
    visible: boolean,
    placeholder?: string,
    focus = false
  ): void {
    for (const info of this.detachedWindowMap.values()) {
      if (info.view.webContents.id !== webContentsId || info.window.isDestroyed()) continue
      info.subInputVisible = visible
      if (placeholder) info.subInputPlaceholder = placeholder
      if (focus && visible && !info.titlebarReady) info.subInputFocusPending = true
      if (!info.titlebarReady || info.window.webContents.isDestroyed()) return
      info.window.webContents.send('update-sub-input-visible', visible)
      if (placeholder)
        info.window.webContents.send('update-sub-input-placeholder', { placeholder })
      if (focus && visible) {
        info.window.webContents.focus()
        info.window.webContents.send('focus-sub-input')
      }
      return
    }
  }

  /**
   * 检查 WebContents 是否属于分离窗口
   */
  public isDetachedWindow(webContents: Electron.WebContents): boolean {
    for (const info of Array.from(this.detachedWindowMap.values())) {
      // 检查窗口的主 WebContents
      if (!info.window.isDestroyed() && info.window.webContents.id === webContents.id) {
        return true
      }
      // 检查插件视图的 WebContents
      if (!info.view.webContents.isDestroyed() && info.view.webContents.id === webContents.id) {
        return true
      }
    }
    return false
  }

  /**
   * 广播消息到所有分离窗口
   */
  public broadcastToAllWindows(channel: string, ...args: any[]): void {
    for (const [windowId, info] of this.detachedWindowMap.entries()) {
      try {
        if (!info.window.isDestroyed()) {
          // 向标题栏页面发送
          info.window.webContents.send(channel, ...args)
        }
        if (!info.view.webContents.isDestroyed()) {
          // 向插件内容页面发送
          info.view.webContents.send(channel, ...args)
        }
      } catch (error) {
        console.error(`[DetachedWindow] 广播消息到分离窗口 ${windowId} 失败:`, error)
      }
    }
  }

  /**
   * 在所有分离窗口的插件内容页面中执行主题更新脚本。
   * @param script 要在插件页面主世界执行的 JavaScript。
   * @returns 所有插件页面完成执行后的 Promise。
   */
  public async executeJavaScriptOnPluginViews(script: string): Promise<void> {
    const tasks: Promise<unknown>[] = []
    // 只操作插件内容视图，不修改分离窗口的宿主标题栏页面。
    for (const info of this.detachedWindowMap.values()) {
      if (!info.view.webContents.isDestroyed()) {
        // 捕获窗口销毁竞态导致的同步异常，避免主题广播被单个窗口中断。
        tasks.push(
          Promise.resolve().then(() => info.view.webContents.executeJavaScript(script, true))
        )
      }
    }
    await Promise.allSettled(tasks)
  }
}

export default new DetachedWindowManager()
