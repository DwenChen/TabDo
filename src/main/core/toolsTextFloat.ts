import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage } from 'electron'
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { clipboardEvents } from './clipboardEvents'
import { readClipboardFilePaths, writeClipboardFiles } from '../utils/clipboardFiles'
import { applyToolsWindowIdentity, getToolsWindowIcon } from './toolsWindowIdentity'
import { buildPluginThemeCSS, getCurrentPluginThemeState } from './pluginTheme'
import { getClipboardTransferError } from '../../shared/clipboardTransfer'

export interface RelayInput {
  type: 'text' | 'image' | 'file'
  text?: string
  image?: string
  files?: string[]
}
interface RelayRow extends RelayInput {
  id: string
  preview?: string
  sizeBytes?: number
}
interface RelaySession {
  window: BrowserWindow
  directory: string
  rows: RelayRow[]
  pending: RelayRow[]
  ready: boolean
  closing: boolean
  bytes: number
  openedAt: number
  ignoreHash?: string
  initialHashes?: Set<string>
}
let session: RelaySession | undefined
let registered = false
const limit = 64 * 1024 * 1024

/**
 * 记录打开时已有的系统剪贴板内容，防止采集器延迟通知把旧复制导入新中转。
 * @returns 当前可用文本、图片及文件的摘要，不持有正文或图片副本。
 */
function snapshotClipboardHashes(): Set<string> {
  const hashes = new Set<string>()
  try {
    const text = clipboard.readText()
    if (text) hashes.add(createHash('md5').update(text).digest('hex'))
    const files = readClipboardFilePaths()
    if (files.length) hashes.add(createHash('md5').update(files.join('|')).digest('hex'))
    const image = clipboard.readImage()
    if (!image.isEmpty()) hashes.add(createHash('md5').update(image.toPNG()).digest('hex'))
  } catch {
    /* 不支持某种格式时保留已获取的摘要，窗口仍可正常打开。 */
  }
  return hashes
}

/**
 * 校验并保存临时内容，图片使用本会话私有PNG，不依赖剪贴板历史文件。
 * @param entry 当前窗口会话。
 * @param inputs 按追加时间排列的纯内容。
 * @returns 已接收且可显示的条目。
 * @throws 输入无效或容量不足时抛错，不发布半批条目。
 */
function prepare(entry: RelaySession, inputs: RelayInput[]): RelayRow[] {
  if (!Array.isArray(inputs) || entry.rows.length + inputs.length > 1000)
    throw new Error('悬浮中转最多容纳1000条，请关闭后重新开始')
  const created: string[] = []
  let bytes = 0
  try {
    const rows = inputs.map((input): RelayRow => {
      const id = randomUUID()
      if (
        input.type === 'text' &&
        typeof input.text === 'string' &&
        input.text.length <= 1_000_000
      ) {
        bytes += Buffer.byteLength(input.text)
        return { id, type: 'text', text: input.text }
      }
      if (
        input.type === 'file' &&
        Array.isArray(input.files) &&
        input.files.length &&
        input.files.length <= 1000 &&
        input.files.every((file) => typeof file === 'string' && path.isAbsolute(file))
      ) {
        bytes += input.files.reduce((sum, file) => sum + Buffer.byteLength(file), 0)
        const row: RelayRow = { id, type: 'file', files: [...input.files] }
        // 单个图片文件保留文件语义，同时提供小缩略图；失效文件仍显示名称供用户识别。
        const file = input.files[0]
        if (input.files.length === 1 && /\.(png|jpe?g|gif|bmp|webp)$/i.test(file)) {
          try {
            if (statSync(file).size <= 16 * 1024 * 1024) {
              const image = nativeImage.createFromPath(file)
              const size = image.getSize()
              if (!image.isEmpty() && size.width * size.height <= 40_000_000) {
                row.preview = image.resize({ width: Math.min(96, size.width) }).toDataURL()
                row.image = pathToFileURL(file).href
              }
            }
          } catch {
            /* 文件不可读不影响其余条目，复制或拖出时再次检查。 */
          }
        }
        return row
      }
      if (input.type === 'image' && typeof input.image === 'string') {
        const source = input.image
        if (
          source.length > limit ||
          (!source.startsWith('data:image/') &&
            (!path.isAbsolute(source) || statSync(source).size > limit))
        )
          throw new Error('图片过大或路径无效')
        const image = source.startsWith('data:image/')
          ? nativeImage.createFromDataURL(source)
          : nativeImage.createFromPath(source)
        const size = image.getSize()
        if (image.isEmpty() || size.width * size.height > 40_000_000)
          throw new Error('图片无效或分辨率过大')
        const png = image.toPNG()
        bytes += png.length
        if (entry.bytes + bytes > limit) throw new Error('悬浮中转内容超过64MB，请关闭后重新开始')
        const file = path.join(entry.directory, id + '.png')
        created.push(file)
        writeFileSync(file, png)
        return {
          id,
          type: 'image',
          image: pathToFileURL(file).href,
          files: [file],
          preview: image.resize({ width: Math.min(96, size.width) }).toDataURL()
        }
      }
      throw new Error('不支持的悬浮中转内容')
    })
    if (entry.bytes + bytes > limit) throw new Error('悬浮中转内容超过64MB，请关闭后重新开始')
    rows.forEach((row) => {
      row.sizeBytes =
        row.type === 'text'
          ? Buffer.byteLength(row.text!)
          : row.type === 'image'
            ? statSync(row.files![0]).size
            : row.files!.reduce((sum, file) => sum + Buffer.byteLength(file), 0)
    })
    entry.bytes += bytes
    return rows
  } catch (error) {
    // 只回滚本批图片，不触碰用户原文件或已显示内容。
    for (const file of created) rmSync(file, { force: true })
    throw error
  }
}

/**
 * 只删除所属会话条目和宿主生成的图片副本，释放容量并剔除未发出的初始化载荷。
 * @param entry 当前独立窗口会话。
 * @param ids 用户明确删除的条目标识。
 * @returns 实际移除的标识，不包括删除期间后来追加的条目。
 * @throws 私有图片删除失败时抛错；不触碰用户文件或剪贴板历史。
 */
function discardRows(entry: RelaySession, ids: string[]): string[] {
  const targets = new Set(ids)
  const removed = entry.rows.filter((row) => targets.has(row.id))
  // 文件条目仅解除引用；只有当前私有目录中由宿主生成的PNG允许删除。
  for (const row of removed) {
    if (row.type === 'image') {
      for (const file of row.files || []) {
        if (path.dirname(file) !== entry.directory) throw new Error('临时图片归属无效')
        rmSync(file, { force: true })
      }
    }
  }
  entry.rows = entry.rows.filter((row) => !targets.has(row.id))
  entry.pending = entry.pending.filter((row) => !targets.has(row.id))
  entry.bytes = Math.max(
    0,
    entry.bytes - removed.reduce((sum, row) => sum + (row.sizeBytes || 0), 0)
  )
  return removed.map((row) => row.id)
}

/**
 * 追加条目，初始化期间排队，自动追加不抢夺外部应用焦点。
 * @param entry 当前存活会话。
 * @param inputs 明确固定或新复制的内容。
 * @returns 无返回值。
 * @throws 输入或容量检查失败时抛错。
 */
function append(entry: RelaySession, inputs: RelayInput[]): void {
  if (entry.closing || entry.window.isDestroyed()) return
  const rows = prepare(entry, inputs)
  entry.rows.push(...rows)
  if (entry.ready) entry.window.webContents.send('tools-text-float-append', rows)
  else entry.pending.push(...rows)
}

/**
 * 接收窗口打开后的新复制，不查询全部历史。
 * @param entry 当前订阅所属会话。
 * @param item 宿主全局采集器新捕获的记录。
 * @returns 无返回值；超限时显示原因并保留已有内容。
 */
function captured(
  entry: RelaySession,
  item: {
    type?: string
    hash?: string
    capturedAt?: number
    content?: string
    imagePath?: string
    files?: { path: string }[]
  }
): void {
  if (entry.closing) return
  // 已在打开前开始处理的复制不能因磁盘保存迟到而混入新会话。
  if (item.capturedAt !== undefined && item.capturedAt < entry.openedAt) return
  if (entry.initialHashes) {
    const baseline = entry.initialHashes
    entry.initialHashes = undefined
    if (item.hash && baseline.has(item.hash)) return
  }
  const ownCopy = entry.ignoreHash && entry.ignoreHash === item.hash
  entry.ignoreHash = undefined
  if (ownCopy) return
  try {
    append(entry, [
      {
        type: item.type as RelayInput['type'],
        text: item.content,
        image: item.imagePath,
        files: item.files?.map((file) => file.path)
      }
    ])
  } catch (error) {
    if (!entry.window.isDestroyed())
      entry.window.webContents.send('tools-text-float-error', (error as Error).message)
  }
}

/**
 * 按所属窗口验证复制、拖放和关闭，页面只能引用本会话条目。
 * @param senderId 发起IPC的页面标识。
 * @param action 用户操作名。
 * @param value 选中标识或置顶状态。
 * @returns 操作结果或初始化条目。
 * @throws 非所属页面、无效选择或不支持的混合复制时抛错。
 */
async function operate(senderId: number, action: string, value: unknown): Promise<unknown> {
  const entry = session
  if (
    !entry ||
    entry.closing ||
    entry.window.isDestroyed() ||
    entry.window.webContents.id !== senderId
  )
    throw new Error('悬浮中转已关闭')
  if (action === 'ready') {
    entry.ready = true
    return entry.pending.splice(0)
  }
  if (action === 'close') return entry.window.close()
  if (action === 'top') {
    entry.window.setAlwaysOnTop(value === true)
    return entry.window.isAlwaysOnTop()
  }
  if (action === 'clear') {
    const removed = discardRows(
      entry,
      entry.rows.map((row) => row.id)
    )
    // 清空前已开始或延迟到达的旧复制不能把条目复活；新的复制仍正常追加。
    entry.openedAt = Date.now()
    entry.initialHashes = snapshotClipboardHashes()
    return removed
  }
  const ids = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  if (ids.length > 1000 || new Set(ids).size !== ids.length) throw new Error('选择数量无效')
  const rows = ids.map((id) => entry.rows.find((row) => row.id === id))
  if (!rows.length || rows.some((row) => !row)) throw new Error('请选择有效条目')
  const chosen = rows as RelayRow[]
  // 删除只解除条目与私有副本，不受内容合并规则限制。
  if (action === 'remove') return discardRows(entry, ids as string[])
  const mixedError = getClipboardTransferError(chosen.map((row) => row.type))
  if (mixedError) throw new Error(mixedError)
  if (action === 'drag') {
    const files = chosen.flatMap((row) => row.files || [])
    if (chosen.some((row) => row.type === 'text') || files.some((file) => !existsSync(file)))
      throw new Error('请选择图片或仍存在的文件一起拖出')
    // 原生拖放只使用宿主已登记的文件，不接受页面提交的任意路径。
    // 必须在鼠标释放前发起原生拖放，不等待可能延迟的系统文件图标查询。
    const icon = getToolsWindowIcon('floating-relay')
    if (!entry.closing && !entry.window.isDestroyed())
      entry.window.webContents.startDrag({ file: files[0], files, icon })
    return true
  }
  if (action !== 'copy') throw new Error('不支持的中转操作')
  // 精确忽略自身写入的下一条相同内容，不暂停采集，紧接着的外部复制仍能追加。
  if (chosen.every((row) => row.type === 'text')) {
    const text = chosen.map((row) => row.text).join('\n\n')
    entry.ignoreHash = createHash('md5').update(text).digest('hex')
    clipboard.writeText(text)
  } else if (chosen.length === 1 && chosen[0].type === 'image') {
    const image = nativeImage.createFromPath(chosen[0].files![0])
    entry.ignoreHash = createHash('md5').update(image.toPNG()).digest('hex')
    clipboard.writeImage(image)
  } else if (chosen.every((row) => row.type !== 'text')) {
    const files = chosen.flatMap((row) => row.files || [])
    if (files.some((file) => !existsSync(file))) throw new Error('文件已失效，无法复制')
    entry.ignoreHash = createHash('md5').update(files.join('|')).digest('hex')
    if (!writeClipboardFiles(files)) {
      entry.ignoreHash = undefined
      throw new Error('文件无法复制')
    }
  } else throw new Error('请分别选择文本或图片/文件进行复制')
  return true
}

/**
 * 创建或追加到当前悬浮中转，空入口不读取历史；关闭后销毁全部条目和临时图片。
 * @param inputs 用户明确转交的文本、图片与文件。
 * @returns 接收内容的独立窗口标识。
 * @throws 输入、容量、临时目录或窗口加载失败时抛错。
 */
export async function openRelay(inputs: RelayInput[] = []): Promise<number> {
  if (!registered) {
    // 原生拖放使用单向消息，避免在系统拖动循环中等待IPC响应。
    ipcMain.on('tools-text-float-drag', (event, ids) => {
      void operate(event.sender.id, 'drag', ids).catch((error) => {
        if (!event.sender.isDestroyed())
          event.sender.send('tools-text-float-error', (error as Error).message)
      })
    })
    ipcMain.handle('tools-text-float', (event, action, value) =>
      operate(event.sender.id, action, value)
    )
    registered = true
  }
  if (session && !session.closing && !session.window.isDestroyed()) {
    append(session, inputs)
    session.window.show()
    session.window.focus()
    return session.window.id
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tabdo-relay-'))
  let window: BrowserWindow
  try {
    window = new BrowserWindow({
      title: '悬浮中转',
      width: 380,
      height: 340,
      minWidth: 320,
      minHeight: 200,
      icon: getToolsWindowIcon('floating-relay'),
      skipTaskbar: false,
      frame: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), 'resources/tools-text-float-preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    })
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
  const entry: RelaySession = {
    window,
    directory,
    rows: [],
    pending: [],
    ready: false,
    closing: false,
    bytes: 0,
    openedAt: Date.now(),
    initialHashes: snapshotClipboardHashes()
  }
  session = entry
  /**
   * 将采集事件绑定到准确的窗口，旧窗口清理不能移除新会话订阅。
   * @param item 新复制记录。
   * @returns 无返回值。
   */
  const onCapture = (item: Parameters<typeof captured>[1]): void => captured(entry, item)
  applyToolsWindowIdentity(window, 'floating-relay')
  // 先登记清理再接收内容，加载失败与关闭遵循相同释放边界。
  window.once('close', () => {
    entry.closing = true
    clipboardEvents.off('captured', onCapture)
  })
  window.once('closed', () => {
    entry.closing = true
    clipboardEvents.off('captured', onCapture)
    if (session === entry) session = undefined
    entry.rows.length = 0
    entry.pending.length = 0
    rmSync(directory, { recursive: true, force: true })
  })
  window.on('hide', () => {
    if (!window.isDestroyed()) window.close()
  })
  window.on('minimize', () => {
    if (!window.isDestroyed()) window.close()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('render-process-gone', () => {
    if (!window.isDestroyed()) window.destroy()
  })
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('context-menu', (_event, params) =>
    Menu.buildFromTemplate([
      { role: 'copy', label: '复制选中文字', enabled: !!params.selectionText }
    ]).popup({ window })
  )
  try {
    append(entry, inputs)
    clipboardEvents.on('captured', onCapture)
    await window.loadFile(path.join(app.getAppPath(), 'resources/tools-text-float.html'))
    if (!window.isDestroyed())
      await window.webContents.insertCSS(buildPluginThemeCSS(getCurrentPluginThemeState()))
    if (!window.isDestroyed() && !entry.closing) window.show()
    return window.id
  } catch (error) {
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
}
