import { BrowserWindow, ipcMain, screen } from './tabdo-electron'
import { currentProjectPath, currentVideoPath, isCursorCaptureActive } from './ipc/state'
const host = __TABDO_PRESENTATION_HOST__
let hud: any = null
let selector: any = null
let countdown: any = null
let pickers: any[] = []
let protection = true
let preparing = false
let ignoringMouse = true

/**
 * 创建只属于当前演示录屏会话的辅助窗口。
 * @param type 页面用途。
 * @param options 原生尺寸及覆盖层选项。
 * @param query 当前覆盖层需要的显示器等参数。
 * @returns 已开始加载的辅助窗口。
 */
function create(type: string, options: any = {}, query: Record<string, string> = {}) {
  const window = new BrowserWindow({
    width: 760,
    height: 500,
    frame: false,
    show: false,
    backgroundColor: '#00000000',
    transparent: true,
    title: type === 'hud-overlay' ? '演示录屏' : '演示录屏 · 选择来源',
    icon: host.icon,
    ...options,
    webPreferences: {
      preload: host.overlayPreload,
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
      backgroundThrottling: false,
      additionalArguments: [`--tabdo-presentation=${host.id}`]
    }
  })
  window.setMenu(null)
  // 选择器必须先拿到窗口层级和边界，避免首帧把未准备好的应用窗口误判为整屏。
  if (type !== 'capture-picker') window.once('ready-to-show', () => window.show())
  void window.loadURL(host.rendererUrl + '?' + new URLSearchParams({ windowType: type, ...query }))
  return window
}

/**
 * 让当前宿主视图加载编辑器，录制后的项目状态继续属于同一会话。
 * @returns 无返回值。
 */
export function openEditor() {
  preparing = false
  hud?.webContents.send('editor-mode-changed', true)
  host.showEditor()
  // 先恢复编辑窗口再收起控制条；录制进行中仍保留停止和暂停入口。
  if (!isCursorCaptureActive) hud?.hide()
}
export const createEditorWindow = openEditor

/**
 * 打开带原生捕获排除的录制控制条，不创建新的后台应用。
 * @returns 本次会话的控制条窗口。
 */
export function createHudOverlayWindow() {
  if (hud && !hud.isDestroyed()) {
    hud.show()
    hud.focus()
    host.showHud(hud)
    return hud
  }
  const bounds = screen.getPrimaryDisplay().workArea
  preparing = true
  hud = create('hud-overlay', {
    ...bounds,
    alwaysOnTop: true,
    skipTaskbar: false
  })
  hud.setContentProtection(protection)
  hud.setIgnoreMouseEvents(true, { forward: true })
  hud.on('show', () => host.showHud(hud))
  hud.once('closed', () => {
    hud = null
  })
  return hud
}
/**
 * 取得当前会话的录制控制条。
 * @returns 控制条窗口或空值。
 */
export const getHudOverlayWindow = () => hud
/**
 * 取得当前会话的来源列表。
 * @returns 来源列表窗口或空值。
 */
export const getSourceSelectorWindow = () => selector
/**
 * 读取本次会话的捕获排除选择。
 * @returns 是否排除控制条。
 */
export const getHudOverlayCaptureProtectionEnabled = () => protection
/**
 * 声明当前 Windows 控制条允许透明区域鼠标穿透。
 * @returns 支持状态。
 */
export const isHudOverlayMousePassthroughSupported = () => true
/**
 * 在开始捕获前应用控制条排除选择。
 * @returns 无返回值。
 */
export const beginHudCaptureProtection = () => hud?.setContentProtection(protection)
/**
 * 更新录制准备状态，避免误把摄像头预览当作编辑器。
 * @param active 当前录制准备状态。
 * @returns 无返回值。
 */
export const setHudRecordingPreparationActive = (active: boolean) => {
  preparing = active
}
/**
 * 保留上游录制状态通知接口；实际状态由所属录制模块维护。
 * @param _active 上游兼容状态。
 * @returns 无返回值。
 */
export const setHudOverlayRecordingActive = (_active: boolean) => {}
/**
 * 恢复当前控制条的捕获排除状态。
 * @returns 是否应用成功。
 */
export const reassertHudOverlayCaptureProtection = () => {
  beginHudCaptureProtection()
  return true
}
/**
 * 恢复当前控制条透明区域的鼠标穿透。
 * @returns 无返回值。
 */
export const reassertHudOverlayMousePassthrough = () =>
  hud?.setIgnoreMouseEvents(ignoringMouse, { forward: true })

/**
 * 创建屏幕和窗口列表，关闭后立即释放该窗口。
 * @returns 来源选择窗口。
 */
export function createSourceSelectorWindow() {
  if (selector && !selector.isDestroyed()) return selector
  selector = create('source-selector', {
    width: 680,
    height: 560,
    frame: true,
    transparent: false,
    skipTaskbar: false
  })
  selector.once('closed', () => {
    selector = null
  })
  return selector
}

/**
 * 创建有界倒计时覆盖层。
 * @returns 当前倒计时窗口。
 */
export function createCountdownWindow() {
  const bounds = screen.getPrimaryDisplay().bounds
  countdown = create('countdown', { ...bounds, alwaysOnTop: true, skipTaskbar: true })
  countdown.setContentProtection(true)
  return countdown
}
/**
 * 读取本次会话的倒计时覆盖层。
 * @returns 倒计时窗口或空值。
 */
export const getCountdownWindow = () => countdown
/**
 * 立即释放本次倒计时覆盖层。
 * @returns 无返回值。
 */
export const closeCountdownWindow = () => {
  countdown?.destroy()
  countdown = null
}

/**
 * 为各显示器创建区域选择覆盖层。
 * @param onClosed 选择器结束通知。
 * @returns 当前选择器窗口集合。
 */
export function createCapturePickerWindows(onClosed: () => void) {
  pickers = screen.getAllDisplays().map((display: any) => {
    const window = create(
      'capture-picker',
      { ...display.bounds, alwaysOnTop: true, skipTaskbar: true },
      { displayId: String(display.id) }
    )
    window.setContentProtection(true)
    window.once('closed', onClosed)
    return window
  })
  return pickers
}
/**
 * 读取当前显示器的来源选择覆盖层。
 * @returns 本次会话的覆盖层集合。
 */
export const getCapturePickerWindows = () => pickers
/**
 * 撤销所有来源选择覆盖层并清空所属引用。
 * @returns 无返回值。
 */
export const closeCapturePickerWindows = () => {
  const old = pickers
  pickers = []
  old.forEach((w) => !w.isDestroyed() && w.destroy())
}
/**
 * 核对请求是否来自当前来源选择覆盖层。
 * @param contents 待验证页面。
 * @returns 请求页面属于当前选择器时为真。
 */
export const isCapturePickerWebContents = (contents: any) =>
  pickers.some((w) => w.webContents === contents)
let areaBorder: any = null
/**
 * 显示非交互的录制区域边框，边框不进入捕获画面。
 * @param area 使用屏幕坐标的录制区域。
 * @returns 无返回值。
 */
export function showAreaRecordingBorder(area: {
  x: number
  y: number
  width: number
  height: number
}) {
  hideAreaRecordingBorder()
  areaBorder = new BrowserWindow({
    x: Math.round(area.x) - 3,
    y: Math.round(area.y) - 3,
    width: Math.round(area.width) + 6,
    height: Math.round(area.height) + 6,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    focusable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  areaBorder.setIgnoreMouseEvents(true)
  areaBorder.setContentProtection(true)
  const window = areaBorder
  void window
    .loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}body{box-sizing:border-box;border:2px dashed white;box-shadow:inset 0 0 0 1px #222}</style>'
        )
    )
    .then(() => {
      if (!window.isDestroyed()) window.showInactive()
    })
}
/**
 * 立即销毁当前会话的区域边框。
 * @returns 无返回值。
 */
export function hideAreaRecordingBorder() {
  if (areaBorder && !areaBorder.isDestroyed()) areaBorder.destroy()
  areaBorder = null
}

ipcMain.on('get-editor-startup-view', (event: any) => {
  event.returnValue = host.file || currentVideoPath || currentProjectPath ? 'editor' : 'home'
})
ipcMain.handle('get-editor-mode', () =>
  Boolean((currentProjectPath || currentVideoPath) && !preparing && !isCursorCaptureActive)
)
ipcMain.handle('get-hud-overlay-capture-protection', () => ({ success: true, enabled: protection }))
ipcMain.handle('set-hud-overlay-capture-protection', (_event: any, enabled: boolean) => {
  protection = enabled
  beginHudCaptureProtection()
  return { success: true, enabled }
})
ipcMain.handle('get-hud-overlay-mouse-passthrough-supported', () => ({ supported: true }))
ipcMain.handle('finish-recording-startup', () => ({ success: true }))
ipcMain.on('hud-overlay-close', () => hud?.close())
ipcMain.on('hud-overlay-hide', () => hud?.minimize())
ipcMain.on('hud-overlay-renderer-ready', () => hud?.show())
ipcMain.on('hud-overlay-set-ignore-mouse', (_event: any, ignore: boolean) => {
  ignoringMouse = Boolean(ignore)
  reassertHudOverlayMousePassthrough()
})
ipcMain.on('hud-overlay-set-source-selection-active', () => {})
ipcMain.on('hud-overlay-set-webcam-preview-visible', () => {})
ipcMain.on('capture-picker-ready', (event: any) => {
  const picker = pickers.find(
    (window) => !window.isDestroyed() && window.webContents === event.sender
  )
  picker?.show()
  picker?.focus()
})
ipcMain.on('hud-overlay-drag', (_event: any, phase: string, x: number, y: number) => {
  if (phase === 'move' && hud) hud.setPosition(Math.round(x), Math.round(y))
})
