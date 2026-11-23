import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import {
  applyToolsWindowIdentity,
  getToolsWindowIcon,
  getToolsWindowTitle
} from './toolsWindowIdentity'
import { buildPluginThemeCSS, getCurrentPluginThemeState } from './pluginTheme'
import { resolveWindowOpenBounds } from '../utils/windowPlacement'
import { splitWords } from '../utils/wordSegments'

/** 当前选词窗口；同一时间只保留一个，重复触发直接替换正文。 */
let pickerWindow: BrowserWindow | null = null
let registered = false

/** 选词窗口正文内容。 */
export interface WordPickerPayload {
  /** 尚未分词的原始文本。 */
  text: string
  /** 按原文顺序排列的词语。 */
  words: string[]
  /** 是否因超过上限而截断。 */
  truncated: boolean
}

/**
 * 生成一次选词窗口的数据快照。
 * @param text 用户提供的原始文本。
 * @returns 供页面渲染的词语与截断标记。
 */
function buildPayload(text: string): WordPickerPayload {
  const result = splitWords(text)
  return { text, words: result.words, truncated: result.truncated }
}

/**
 * 把正文推送给选词窗口；加载完成前不发送，避免丢失首次数据。
 * @param win 目标选词窗口。
 * @param payload 当前文本快照。
 * @returns 无返回值。
 */
function pushPayload(win: BrowserWindow, payload: WordPickerPayload): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send('word-picker-data', payload)
}

/**
 * 注册选词窗口的复制与关闭通道，只接受所属窗口的调用。
 * @returns 无返回值。
 */
function registerIpc(): void {
  if (registered) return
  registered = true
  ipcMain.handle('word-picker-copy', async (event, text: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win !== pickerWindow) return { success: false, error: '无权操作选词窗口' }
    const value = typeof text === 'string' ? text : ''
    if (!value) return { success: false, error: '没有可复制的词语' }
    // 复制登记复用宿主剪贴板管理器，延迟加载避免工具模块与管理器互相引用。
    const { default: clipboardManager } = await import('../managers/clipboardManager')
    await clipboardManager.writeTextEntry(value)
    return { success: true }
  })
  ipcMain.on('word-picker-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win === pickerWindow && !win.isDestroyed()) win.close()
  })
}

/**
 * 打开拆分选词窗口；已有窗口时更新正文并重新显示。
 * @param text 用户从剪贴板、中转或选中文字提供的原始文本。
 * @returns 选词窗口标识。
 * @throws 正文为空或窗口创建失败时抛错。
 */
export async function openWordPicker(text: string): Promise<number> {
  const source = typeof text === 'string' ? text : ''
  if (!source.trim()) throw new Error('没有可拆分的文字')
  registerIpc()
  const payload = buildPayload(source)
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pushPayload(pickerWindow, payload)
    pickerWindow.show()
    pickerWindow.focus()
    return pickerWindow.id
  }
  const bounds = resolveWindowOpenBounds('cursor', { width: 420, height: 420 })
  const win = new BrowserWindow({
    ...bounds,
    title: getToolsWindowTitle('split-words'),
    icon: getToolsWindowIcon('split-words'),
    minWidth: 320,
    minHeight: 260,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    frame: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'resources/word-picker-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  pickerWindow = win
  applyToolsWindowIdentity(win, 'split-words')
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.destroy()
  })
  win.on('page-title-updated', (event) => event.preventDefault())
  // 隐藏或最小化即结束本次选词，不保留后台页面。
  win.on('hide', () => {
    if (!win.isDestroyed()) win.close()
  })
  win.on('minimize', () => {
    if (!win.isDestroyed()) win.close()
  })
  win.on('closed', () => {
    if (pickerWindow === win) pickerWindow = null
  })
  win.webContents.on('did-finish-load', () => {
    if (pickerWindow === win) pushPayload(win, payload)
  })
  try {
    await win.loadFile(path.join(app.getAppPath(), 'resources/word-picker.html'))
    if (!win.isDestroyed())
      await win.webContents.insertCSS(buildPluginThemeCSS(getCurrentPluginThemeState()))
    if (!win.isDestroyed()) {
      win.show()
      win.focus()
    }
    return win.id
  } catch (error) {
    if (!win.isDestroyed()) win.destroy()
    throw error
  }
}
