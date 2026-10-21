import { app, BrowserWindow, ipcMain, nativeImage, net, screen, shell } from 'electron'
import path from 'node:path'
import { openLensInBrowser } from './lensBrowserUpload'
import {
  buildTextSearchUrl,
  imageSearchEngines,
  normalizeWebQuickOpenConfig,
  type WebQuickOpenConfig
} from '../../shared/webQuickOpen'

const operations = new Map<string, { controller: AbortController; menu?: BrowserWindow }>()
interface QuickSearchRequest {
  id: string
  kind: 'text' | 'image'
  text?: string
  image?: string
  config: WebQuickOpenConfig
}

/**
 * 使用 Electron 请求捕获上传重定向；net.fetch 的 manual 模式会拒绝该跳转。
 * @param endpoint 引擎上传地址。
 * @param form 图片表单。
 * @param signal 本次上传取消信号。
 * @returns 引擎返回的跳转状态和地址。
 * @throws 请求失败、取消或没有收到重定向时抛出。
 */
async function postImageForm(
  endpoint: string,
  form: FormData,
  signal: AbortSignal
): Promise<{ status: number; location: string }> {
  // 用标准 Request 编码 multipart 边界，仅编码，不通过全局 fetch 发起网络请求。
  const encoded = new Request(endpoint, { method: 'POST', body: form })
  const body = Buffer.from(await encoded.arrayBuffer())
  if (signal.aborted) throw new Error('识图上传已取消')
  return await new Promise((resolve, reject) => {
    const request = net.request({ url: endpoint, method: 'POST', redirect: 'manual' })
    let settled = false
    /**
     * 结算并中止所属请求，收到结果后不继续下载结果页面。
     * @param error 请求失败原因。
     * @param result 已收到的重定向。
     * @returns 无返回值。
     */
    const complete = (error?: Error, result?: { status: number; location: string }): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', cancel)
      request.abort()
      if (error) reject(error)
      else resolve(result!)
    }
    /**
     * 任务取消时只中断本次图片上传。
     * @returns 无返回值。
     */
    const cancel = (): void => complete(new Error('识图上传已取消'))
    request.on('redirect', (status, _method, location) => complete(undefined, { status, location }))
    request.on('response', (response) =>
      complete(new Error(`识图引擎未返回结果地址（HTTP ${response.statusCode}），请稍后重试`))
    )
    request.on('error', (error) => complete(error))
    signal.addEventListener('abort', cancel, { once: true })
    request.setHeader('Content-Type', encoded.headers.get('content-type')!)
    request.end(body)
    if (signal.aborted) cancel()
  })
}

/**
 * 在用户点击匹配指令后提供紧凑二级菜单；只有一项时直接选中。
 * @param items 已启用的网站或引擎。
 * @param operation 本次操作的取消资源。
 * @returns 用户选中项的标识，取消菜单返回空串。
 */
function chooseWebsite(
  items: { id: string; name: string }[],
  operation: { controller: AbortController; menu?: BrowserWindow }
): Promise<string> {
  if (items.length === 1) return Promise.resolve(items[0].id)
  return new Promise((resolve, reject) => {
    const cursor = screen.getCursorScreenPoint(),
      area = screen.getDisplayNearestPoint(cursor).workArea
    const width = 250,
      height = Math.min(400, items.length * 36 + 46)
    const menu = new BrowserWindow({
      width,
      height,
      x: Math.max(area.x, Math.min(cursor.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(cursor.y, area.y + area.height - height)),
      frame: false,
      useContentSize: true,
      thickFrame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(
          app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
          'resources/quick-menu-preload.cjs'
        ),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      }
    })
    let settled = false
    /**
     * 结算本次选择，撤销所属 IPC 和窗口，不保留工具页面。
     * @param selected 所选网站 ID，空串表示取消。
     * @param error 菜单资源加载错误。
     * @returns 无返回值。
     */
    const complete = (selected: string, error?: Error): void => {
      if (settled) return
      settled = true
      operation.menu = undefined
      ipcMain.removeListener('tools-web:ready', ready)
      ipcMain.removeListener('tools-web:selection', select)
      operation.controller.signal.removeEventListener('abort', cancel)
      if (!menu.isDestroyed()) menu.destroy()
      if (error) reject(error)
      else resolve(selected)
    }
    /**
     * 仅向当前选择窗口发送可显示的纯网站列表。
     * @param event 菜单就绪事件。
     * @returns 无返回值。
     */
    const ready = (event: Electron.IpcMainEvent): void => {
      if (event.sender === menu.webContents) menu.webContents.send('tools-web:items', items)
    }
    /**
     * 按所属窗口和启用列表校验选择结果。
     * @param event 选择事件。
     * @param id 网站标识，空串表示取消。
     * @returns 无返回值。
     */
    const select = (event: Electron.IpcMainEvent, id: string): void => {
      if (event.sender === menu.webContents && (id === '' || items.some((item) => item.id === id)))
        complete(id)
    }
    /**
     * 取消本次选择，不打开浏览器。
     * @returns 无返回值。
     */
    const cancel = (): void => complete('')
    operation.menu = menu
    ipcMain.on('tools-web:ready', ready)
    ipcMain.on('tools-web:selection', select)
    operation.controller.signal.addEventListener('abort', cancel, { once: true })
    menu.once('blur', cancel)
    menu.once('closed', cancel)
    menu.once('hide', cancel)
    menu.once('minimize', cancel)
    menu.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    menu.webContents.on('will-navigate', (event) => event.preventDefault())
    menu.webContents.once('render-process-gone', cancel)
    void menu
      .loadFile(path.join(app.getAppPath(), 'resources/quick-menu.html'))
      .then(() => {
        if (!settled) {
          menu.show()
          menu.focus()
        }
      })
      .catch((error) => {
        complete('', error)
      })
    if (operation.controller.signal.aborted) cancel()
  })
}

/**
 * 将用户图片转为有界 JPEG，不保留临时图片。
 * @param source 用户图片的 data URI。
 * @returns 图片字节与实际宽高。
 * @throws 图片超限、无效或尺寸过大时抛出。
 */
function prepareSearchImage(source: string): {
  bytes: Buffer
  dimensions: { width: number; height: number }
} {
  if (
    typeof source !== 'string' ||
    source.length > 40 * 1024 * 1024 ||
    !/^data:image\/(png|jpeg|webp|gif|bmp);base64,/i.test(source)
  )
    throw new Error('请选择小于 30MB 的普通图片')
  const original = nativeImage.createFromDataURL(source),
    size = original.getSize()
  if (original.isEmpty() || size.width * size.height > 64_000_000)
    throw new Error('图片无效或尺寸过大')
  const scale = Math.min(1, 4096 / Math.max(size.width, size.height))
  const image =
    scale < 1 ? original.resize({ width: Math.max(1, Math.round(size.width * scale)) }) : original
  return { bytes: image.toJPEG(92), dimensions: image.getSize() }
}

/**
 * 仅把用户本次匹配图片上传到 Bing，读取结果跳转；Lens 在默认浏览器内完成上传。
 * @param engine 用户选定的 Bing 引擎。
 * @param source 用户图片的 data URI。
 * @param signal 操作超时或取消信号。
 * @returns 默认浏览器可直接打开的识图结果地址。
 * @throws {Error} 图片超限、上传失败或结果地址异常时抛出错误。
 */
export async function uploadSearchImage(
  engine: 'bing',
  source: string,
  signal: AbortSignal
): Promise<string> {
  const { bytes } = prepareSearchImage(source)
  const form = new FormData()
  let endpoint: string
  if (engine === 'bing') {
    form.set('imageBin', bytes.toString('base64'))
    endpoint =
      'https://www.bing.com/images/search?view=detailv2&iss=sbiupload&FORM=SBIHMP&sbifnm=tabdo-image.jpg'
  } else throw new Error('不支持的识图引擎')
  const { status, location } = await postImageForm(endpoint, form, signal)
  if (![301, 302, 303, 307, 308].includes(status) || !location)
    throw new Error(`识图引擎未返回结果地址（HTTP ${status}），请稍后重试`)
  const url = new URL(location, endpoint)
  const allowed = ['www.bing.com', 'bing.com']
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname))
    throw new Error('识图结果地址异常')
  return url.href
}

/**
 * 为一次文本搜索或识图创建有界操作，菜单和网络请求结束后立即释放。
 * @param owner 发起操作的工具 WebContents 标识。
 * @param request 纯内容与工具私有网站配置。
 * @returns 操作结果，取消时返回 cancelled。
 * @throws {Error} 参数无效、没有启用项或网络搜索失败时抛出错误。
 */
export async function launchWebQuickOpen(
  owner: number,
  request: QuickSearchRequest
): Promise<{ cancelled?: boolean; url?: string }> {
  if (!request || !['text', 'image'].includes(request.kind) || !/^[\w-]{1,80}$/.test(request.id))
    throw new Error('搜索参数无效')
  const key = `${owner}:${request.id}`
  if (operations.has(key) || operations.size >= 8) throw new Error('请等待当前搜索结束')
  const config = normalizeWebQuickOpenConfig(request.config)
  const operation = {
    controller: new AbortController(),
    menu: undefined as BrowserWindow | undefined
  }
  operations.set(key, operation)
  const deadline = setTimeout(() => cancelWebQuickOpen(owner, request.id), 90000)
  try {
    const items =
      request.kind === 'text'
        ? config.sites.filter((site) => site.enabled)
        : imageSearchEngines.filter((engine) => config.imageEngines.includes(engine.id))
    if (!items.length) throw new Error('请先在“网页快开”启用至少一个网站或识图引擎')
    const selected = await chooseWebsite(items, operation)
    if (!selected || operation.controller.signal.aborted) return { cancelled: true }
    if (request.kind === 'image' && selected === 'google-lens') {
      // 上传和结果页在默认浏览器中延续，避免把应用会话的临时 Lens 地址跨浏览器复用。
      const image = prepareSearchImage(request.image || '')
      await openLensInBrowser(image.bytes, image.dimensions, operation.controller.signal)
      return { url: 'https://lens.google.com/' }
    }
    const url =
      request.kind === 'text'
        ? buildTextSearchUrl(
            config.sites.find((site) => site.id === selected)!.url,
            request.text || ''
          )
        : await uploadSearchImage('bing', request.image || '', operation.controller.signal)
    if (operation.controller.signal.aborted) return { cancelled: true }
    await shell.openExternal(url)
    return { url }
  } finally {
    clearTimeout(deadline)
    operation.menu?.close()
    operation.controller.abort()
    operations.delete(key)
  }
}

/**
 * 取消指定工具自己的菜单和上传，不影响用户的默认浏览器。
 * @param owner 工具会话标识。
 * @param id 该会话创建的操作标识。
 * @returns 无返回值。
 */
export function cancelWebQuickOpen(owner: number, id: string): void {
  const operation = operations.get(`${owner}:${id}`)
  operation?.controller.abort()
  operation?.menu?.close()
}

/**
 * 宿主真正退出时清理剩余操作，不结束已由用户打开的浏览器。
 * @returns 无返回值。
 */
export function stopWebQuickOpen(): void {
  for (const operation of operations.values()) {
    operation.controller.abort()
    operation.menu?.close()
  }
}
