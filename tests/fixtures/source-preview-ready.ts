/**
 * 在启动隔离Electron之前核验共同就绪响应，防止复用只返回SPA页面的旧服务。
 * @returns 三项源码来源均可访问后完成，不创建窗口或触碰应用资料。
 * @throws {Error} 就绪接口不兼容或任何源码来源不可访问时抛出明确错误。
 */
export default async function ensureSourcePreviewReady(): Promise<void> {
  const health = await fetch('http://127.0.0.1:15178/__tabdo_source_preview_ready', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  })
  const state = health.ok ? await health.json().catch(() => null) : null
  if (state?.ready !== true) {
    throw new Error('源码服务未共同就绪或仍在使用旧服务；请重启源码预览服务后重试。')
  }
  // HTTP状态正常的设置页不能替代其他来源，逐一核对且不加载用户资料。
  const urls = [
    'http://127.0.0.1:5174',
    'http://127.0.0.1:15177',
    'http://127.0.0.1:15178/presentation.html'
  ]
  const responses = await Promise.all(
    urls.map((url) => fetch(url, { signal: AbortSignal.timeout(10000) }))
  )
  for (let index = 0; index < responses.length; index++) {
    if (!responses[index].ok)
      throw new Error(`源码来源未就绪：${urls[index]} (${responses[index].status})`)
  }
}
