import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { shell } from 'electron'

/**
 * 在用户默认浏览器内提交 Lens 图片，使上传、Cookie 与结果页属于同一浏览器会话。
 * @param bytes 已压缩的 JPEG 图片，只在本次内存会话中保留。
 * @param dimensions 上传图片的实际宽高。
 * @param signal 必要任务的取消信号。
 * @returns 浏览器收到一次性上传表单且本地服务清理后的 Promise。
 * @throws 启动浏览器失败、任务取消或浏览器未领取表单时抛出。
 */
export async function openLensInBrowser(
  bytes: Buffer,
  dimensions: { width: number; height: number },
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) throw new Error('识图上传已取消')
  const token = randomBytes(24).toString('hex'),
    nonce = randomBytes(18).toString('base64')
  // 默认浏览器建立完整上传会话，仅使用上传入口，不复用应用会话的结果参数。
  const action = 'https://lens.google.com/v3/upload'
  let html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>正在打开 Google Lens</title><body><p>正在向 Google Lens 提交图片…</p><form method="post" enctype="multipart/form-data" action="${action.replaceAll('&', '&amp;')}"><input id="image" type="file" name="encoded_image" hidden><input type="hidden" name="processed_image_dimensions" value="${dimensions.width},${dimensions.height}"></form><script nonce="${nonce}">const data=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0));const files=new DataTransfer();files.items.add(new File([data],"tabdo-image.jpg",{type:"image/jpeg"}));document.getElementById("image").files=files.files;document.querySelector("form").submit();</script></body></html>`
  let complete!: (error?: Error) => void,
    served = false,
    transferred = false,
    closing = false
  const server = createServer((request, response) => {
    if (served || request.method !== 'GET' || request.url !== `/${token}`) {
      response.writeHead(404)
      response.end()
      return
    }
    served = true
    // 隔离为不透明来源，避免把本地地址作为上传来源；放行 Google 的结果重定向。
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'close',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `sandbox allow-forms allow-scripts; default-src 'none'; script-src 'nonce-${nonce}'; form-action https://lens.google.com https://www.google.com; base-uri 'none'; frame-ancestors 'none'`
    })
    response.once('finish', () => complete())
    response.once('close', () => {
      if (!response.writableFinished) complete(new Error('浏览器未完整接收识图图片，请重试'))
    })
    response.end(html)
    html = ''
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  /**
   * 取消当前一次性表单，终止属于本任务的连接。
   * @returns 无返回值。
   */
  const cancel = (): void => complete(new Error('识图上传已取消'))
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      /**
       * 只结算一次领取结果，后续网络或取消事件由统一清理处理。
       * @param error 领取失败原因，省略表示完整送达。
       * @returns 无返回值。
       */
      complete = (error?: Error): void => {
        if (settled) return
        settled = true
        if (error) reject(error)
        else resolve()
      }
      server.once('error', (error) => complete(error))
      signal.addEventListener('abort', cancel, { once: true })
      timer = setTimeout(() => complete(new Error('默认浏览器未领取识图图片，请重试')), 60000)
      // 仅监听回环地址、随机端口和一次性随机路径，不落盘图片或开放通用服务。
      server.listen(0, '127.0.0.1', () => {
        if (closing || signal.aborted) {
          cancel()
          server.closeAllConnections()
          server.close()
          return
        }
        const address = server.address()
        if (!address || typeof address === 'string') {
          complete(new Error('无法启动识图上传'))
          return
        }
        void shell
          .openExternal(`http://127.0.0.1:${address.port}/${token}`)
          .catch((error) => complete(error))
      })
      if (signal.aborted) cancel()
    })
    transferred = true
  } finally {
    closing = true
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    html = ''
    // 成功时等待响应自然发完；强制断开会使浏览器丢失图片，只有取消或失败才中止连接。
    if (!transferred) server.closeAllConnections()
    server.closeIdleConnections()
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
