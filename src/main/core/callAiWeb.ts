import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'

const bodyLimit = 512 * 1024
export const deepSeekOrigin = 'https://api.deepseek.com'
// 服务端点由代码登记，搜索词和待抓取 URL 只进入参数，不能改变服务地址。
const webApiEndpoints = {
  'bocha-search': 'https://api.bocha.cn/v1/web-search',
  'brave-search': 'https://api.search.brave.com/res/v1/web/search',
  'deepseek-search': `${deepSeekOrigin}/v1/tools/search`,
  'deepseek-fetch': `${deepSeekOrigin}/v1/tools/fetch`
} as const

type FixedWebApiRequest = {
  endpoint: keyof typeof webApiEndpoints
  headers: Record<string, string>
  query?: URLSearchParams
  body?: string
}

/**
 * 检查 IPv4 地址是否允许用来读取公网资料。
 * @param address DNS 或 URL 给出的目标地址。
 * @returns 是否为可连接的公网 IPv4 地址。
 */
function isPublicAddress(address: string): boolean {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  )
}

/**
 * 发起一次只读 HTTPS 请求。固定 API 使用系统 DNS，任意网页地址在连接时校验公网解析。
 * @param target 公网网页 URL，或带有参数与凭据的已登记 API 请求。
 * @param signal 会话取消和总超时信号。
 * @returns HTTP 状态、头部及有界正文。
 * @throws 地址无效、API 返回重定向、连接失败、取消或超时时拒绝。
 */
async function requestWebResponse(
  target: URL | FixedWebApiRequest,
  signal: AbortSignal
): Promise<{
  status: number
  headers: IncomingMessage['headers']
  body: Buffer
  truncated: boolean
}> {
  // 只有从固定端点表构造的请求能携带凭据并使用系统 DNS。
  const publicPage = target instanceof URL
  const url = publicPage ? target : new URL(webApiEndpoints[target.endpoint])
  const headers = publicPage ? { accept: 'text/html,text/plain' } : target.headers
  const body = publicPage ? undefined : target.body
  if (!publicPage && target.query) url.search = target.query.toString()
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new Error('只支持无凭据的公网 HTTPS 地址')
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    // 官方端点仍验证 HTTPS 证书。动态地址在连接时筛选 DNS，防止 DNS 重绑定。
    const connection = request(
      url,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'accept-encoding': 'identity', 'user-agent': 'TabDo-CallAI/1.0', ...headers },
        signal,
        agent: false,
        rejectUnauthorized: true,
        family: publicPage ? 4 : undefined,
        lookup: publicPage
          ? (hostname, options, callback) => {
              void lookup(hostname, { family: 4, all: true }).then(
                (addresses) => {
                  const allowed = addresses.filter(({ address }) => isPublicAddress(address))
                  if (!allowed.length) callback(new Error('目标解析为内网或保留地址'), '', 4)
                  else if (options.all) callback(null, allowed)
                  else callback(null, allowed[0].address, 4)
                },
                (error: NodeJS.ErrnoException) => callback(error, '', 4)
              )
            }
          : undefined
      },
      resolve
    )
    connection.once('error', reject)
    connection.end(body)
  })
  const status = response.statusCode ?? 0
  // 重定向和错误页只需要状态及头部，不读取正文。
  if (status < 200 || status >= 300) {
    response.destroy()
    // 固定 API 的凭据不随重定向传递，跳转信息只交给通用网页读取。
    if (!publicPage && status >= 300 && status < 400)
      throw new Error(`网页 API 拒绝重定向（HTTP ${status}）`)
    return { status, headers: response.headers, body: Buffer.alloc(0), truncated: false }
  }
  let size = 0
  const buffers: Buffer[] = []
  for await (const chunk of response as AsyncIterable<Buffer>) {
    const next = chunk.subarray(0, bodyLimit - size)
    buffers.push(next)
    size += next.length
    if (chunk.length > next.length)
      return {
        status,
        headers: response.headers,
        body: Buffer.concat(buffers, size),
        truncated: true
      }
  }
  return { status, headers: response.headers, body: Buffer.concat(buffers, size), truncated: false }
}

/**
 * 将 HTML 片段转换成有限的文字，丢弃脚本与样式内容。
 * @param html 待提取的网页正文或摘要。
 * @returns 可交给模型的非执行性文字。
 */
function htmlText(html: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  }
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|svg|noscript|template)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<\/?(?:p|div|li|br|section|article|h[1-6]|tr)\b[^<>]*>/gi, '\n')
    .replace(/<[^<>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
      if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity
      const value =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity
    })
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

/**
 * 读取已知公网网页，跟随有限的公网重定向。
 * @param address 用户或检索结果提供的 HTTPS 地址。
 * @param task 本轮取消信号。
 * @returns 最终 URL、页面标题、可读正文及截断状态。
 * @throws 地址、响应格式或网络错误时拒绝。
 */
export async function fetchCallAiPage(address: string, task: AbortSignal) {
  if (address.length > 2048) throw new Error('网页地址过长')
  const signal = AbortSignal.any([task, AbortSignal.timeout(25_000)])
  let url = new URL(address)
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await requestWebResponse(url, signal)
    const location = response.headers.location
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      url = new URL(location, url)
      continue
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`网页访问失败（HTTP ${response.status}）`)
    const type = response.headers['content-type'] ?? ''
    if (!/^(text\/html|text\/plain|application\/xhtml\+xml)(?:;|$)/i.test(type))
      throw new Error('网页读取支持 HTML 与纯文本')
    const charset = /charset\s*=\s*["']?([a-z0-9_-]+)/i.exec(type)?.[1]
    let source: string
    try {
      source = new TextDecoder(charset ?? 'utf-8').decode(response.body)
    } catch {
      source = response.body.toString('utf8')
    }
    const plain = /^text\/plain/i.test(type)
    const title = plain
      ? ''
      : htmlText(/<title\b[^<>]*>([^<]*)<\/title>/i.exec(source)?.[1] ?? '').slice(0, 200)
    const content = plain
      ? source
      : htmlText(source.replace(/<head\b[^<>]*>[\s\S]*?(?:<\/head>|$)/i, ''))
    return {
      url: url.href,
      title,
      text: content.slice(0, 24_000),
      truncated: response.truncated || content.length > 24_000
    }
  }
  throw new Error('网页重定向次数超限')
}

/**
 * 通过已配置的 Brave Search API 查询网页，凭据仅随固定域名的请求发送。
 * @param query 用户批准的搜索词。
 * @param key 本机解密的 Brave 密钥。
 * @param task 本轮取消信号。
 * @returns 可供引用的标题、链接和摘要。
 * @throws 查询、密钥、网络或响应数据无效时拒绝。
 */
export async function searchCallAiWeb(query: string, key: string, task: AbortSignal) {
  if (!query.trim() || query.length > 600 || query.trim().split(/\s+/).length > 75)
    throw new Error('请输入不超过 600 字符、75 个词的查询')
  const response = await requestWebResponse(
    {
      endpoint: 'brave-search',
      headers: { accept: 'application/json', 'x-subscription-token': key },
      query: new URLSearchParams({
        q: query.trim(),
        count: '8',
        text_decorations: 'false',
        search_lang: /\p{Script=Han}/u.test(query) ? 'zh' : 'en'
      })
    },
    AbortSignal.any([task, AbortSignal.timeout(25_000)])
  )
  if (response.status === 401 || response.status === 403)
    throw new Error('Brave Search 密钥或服务权限无效')
  if (response.status === 429) throw new Error('Brave Search 请求达到频率或额度限制')
  if (response.status !== 200 || response.truncated)
    throw new Error(`搜索服务响应异常（HTTP ${response.status}）`)
  const payload = JSON.parse(response.body.toString('utf8'))
  if (!Array.isArray(payload.web?.results)) return []
  return payload.web.results
    .slice(0, 8)
    .flatMap((item: { url?: unknown; title?: unknown; description?: unknown } | null) =>
      item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)
        ? [
            {
              url: item.url.slice(0, 2048),
              title: typeof item.title === 'string' ? htmlText(item.title).slice(0, 240) : '',
              snippet:
                typeof item.description === 'string' ? htmlText(item.description).slice(0, 600) : ''
            }
          ]
        : []
    )
}

/**
 * 通过博查 Web Search 检索网页并整理标题、链接和摘要。
 * @param query 用户授权发送的搜索词。
 * @param key 本机解密的博查密钥。
 * @param task 本轮取消信号。
 * @returns 可供引用的网页结果。
 * @throws 搜索词、凭据、网络或响应无效时拒绝。
 */
export async function searchBochaWeb(query: string, key: string, task: AbortSignal) {
  const search = query.trim()
  if (!search || search.length > 600) throw new Error('请输入不超过 600 字符的查询')
  // 凭据只发给固定端点，请求正文使用官方 Web Search 参数。
  const response = await requestWebResponse(
    {
      endpoint: 'bocha-search',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${key}`
      },
      body: JSON.stringify({ query: search, freshness: 'noLimit', summary: true, count: 8 })
    },
    AbortSignal.any([task, AbortSignal.timeout(25_000)])
  )
  if ([401, 403].includes(response.status)) throw new Error('博查搜索密钥或服务权限无效')
  if ([402, 429].includes(response.status)) throw new Error('博查搜索请求达到频率或额度限制')
  if (response.status !== 200 || response.truncated)
    throw new Error(`博查搜索响应异常（HTTP ${response.status}）`)
  const payload = JSON.parse(response.body.toString('utf8'))
  if (payload?.code !== 200 || !payload.data)
    throw new Error('博查搜索未返回有效结果，请检查密钥和服务额度')
  const results = payload.data.webPages?.value
  if (!Array.isArray(results)) return []
  return results.slice(0, 8).flatMap(
    (
      item: {
        url?: unknown
        name?: unknown
        summary?: unknown
        snippet?: unknown
      } | null
    ) => {
      if (!item || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) return []
      const description =
        typeof item.summary === 'string' && item.summary.trim() ? item.summary : item.snippet
      return [
        {
          url: item.url.slice(0, 2048),
          title: typeof item.name === 'string' ? htmlText(item.name).slice(0, 240) : '',
          snippet: typeof description === 'string' ? htmlText(description).slice(0, 600) : ''
        }
      ]
    }
  )
}

/**
 * 向 DeepSeek 官方只读工具接口发送单次请求，凭据始终留在固定来源。
 * @param operation DeepSeek 工具接口名称。
 * @param fields 本次 API 请求字段。
 * @param key 当前官方提供商的密钥。
 * @param task 本轮取消信号。
 * @returns 官方工具的 JSON 响应。
 * @throws 请求超时、被取消或服务未返回有效响应时拒绝。
 */
async function requestDeepSeekTool(
  operation: 'search' | 'fetch',
  fields: Record<string, string | number | boolean>,
  key: string,
  task: AbortSignal
) {
  const body = JSON.stringify(fields)
  // 固定官方来源且拒绝重定向，目标网页地址只作为 Fetch 的 JSON 参数。
  const response = await requestWebResponse(
    {
      endpoint: `deepseek-${operation}`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body))
      },
      body
    },
    AbortSignal.any([task, AbortSignal.timeout(60_000)])
  )
  const action = operation === 'search' ? '搜索' : '抓取'
  if (response.status === 401) throw new Error('DeepSeek API 密钥无效')
  if (response.status === 402) throw new Error('DeepSeek 账号余额不足')
  if (response.status === 429) throw new Error(`DeepSeek 网页${action}达到频率限制`)
  if (response.status !== 200)
    throw new Error(`DeepSeek 网页${action}失败（HTTP ${response.status}）`)
  if (response.truncated) throw new Error(`DeepSeek 网页${action}响应过大`)
  // 服务返回格式异常时给出可归因的工具错误，避免把原始响应片段带入聊天。
  try {
    return JSON.parse(new TextDecoder().decode(response.body))
  } catch {
    throw new Error(`DeepSeek 网页${action}返回了无效的 JSON`)
  }
}

/**
 * 通过 DeepSeek Search 查询网页并保留可引用的链接和摘要。
 * @param query 本轮授权范围内的搜索词。
 * @param key 当前官方提供商的密钥。
 * @param task 本轮取消信号。
 * @returns 有界的标题、链接和摘要列表。
 * @throws 查询或服务响应无效时拒绝。
 */
export async function searchDeepSeekWeb(query: string, key: string, task: AbortSignal) {
  const trimmed = query.trim()
  if (!trimmed || Array.from(trimmed).length > 128) throw new Error('请输入 1～128 个字符的搜索词')
  const payload = await requestDeepSeekTool(
    'search',
    { query: trimmed, count: 8, need_content: false },
    key,
    task
  )
  if (!Array.isArray(payload?.results)) throw new Error('DeepSeek 网页搜索响应格式无效')
  return payload.results.slice(0, 8).flatMap((item) => {
    if (!item || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) return []
    const snippet = item.summary || item.snippet
    return [
      {
        url: item.url,
        title: typeof item.title === 'string' ? item.title.slice(0, 240) : '',
        snippet: typeof snippet === 'string' ? snippet.slice(0, 800) : ''
      }
    ]
  })
}

/**
 * 通过 DeepSeek Fetch 获取网页的 Markdown 正文。
 * @param address 待抓取的无凭据 HTTP 或 HTTPS 地址。
 * @param key 当前官方提供商的密钥。
 * @param task 本轮取消信号。
 * @returns 请求地址、页面标题、有界正文及截断状态。
 * @throws 地址无效、服务拒绝或缺少正文时拒绝。
 */
export async function fetchDeepSeekPage(address: string, key: string, task: AbortSignal) {
  const url = address.trim()
  const parsed = url.length <= 8192 && URL.canParse(url) ? new URL(url) : null
  if (
    !parsed?.hostname ||
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new Error('请输入不超过 8192 个字符且不含凭据的 HTTP 或 HTTPS 地址')
  const payload = await requestDeepSeekTool('fetch', { url }, key, task)
  if (typeof payload?.content !== 'string' || !payload.content.trim())
    throw new Error('DeepSeek 网页抓取未返回正文')
  return {
    url,
    title: typeof payload.title === 'string' ? payload.title.slice(0, 240) : '',
    text: payload.content.slice(0, 18_000),
    truncated: payload.content.length > 18_000
  }
}
