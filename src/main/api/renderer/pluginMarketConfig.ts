import { httpRequest, type HttpRequestOptions, type HttpResponse } from '../../utils/httpRequest'

export const PLUGIN_MARKET_REPOSITORY = 'DwenChen/TabDo-plugins'
export const DEFAULT_PLUGIN_MARKET_API_BASE = `https://raw.githubusercontent.com/${PLUGIN_MARKET_REPOSITORY}/main`
export const PluginMarketAuthMode = { OPTIONAL: 'optional', REQUIRED: 'required' } as const
export type PluginMarketAuthMode = (typeof PluginMarketAuthMode)[keyof typeof PluginMarketAuthMode]
export class PluginMarketAuthRequiredError extends Error {}

interface CatalogPlugin {
  name: string
  version: string
  lifecycle: string
  platform?: string[]
  downloadUrl: string
  [key: string]: unknown
}
let pendingCatalog: Promise<CatalogPlugin[]> | undefined

/**
 * 返回由维护者独立管理的静态插件市场根地址。
 * @returns GitHub 原始内容根地址。
 */
export function getPluginMarketApiBase(): string {
  return DEFAULT_PLUGIN_MARKET_API_BASE
}

/**
 * 合并同轮市场请求，仅在请求期间持有经过协议校验的索引。
 * @returns 支持 TabDo 生命周期的插件元数据。
 * @throws 网络、索引结构或插件元数据校验失败时抛出错误。
 */
async function loadCatalog(): Promise<CatalogPlugin[]> {
  if (pendingCatalog) return pendingCatalog
  pendingCatalog = (async () => {
    const response = await httpRequest(`${DEFAULT_PLUGIN_MARKET_API_BASE}/index.json`, {
      maxResponseBytes: 2 * 1024 * 1024,
      timeoutMs: 15_000
    })
    const value = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    if (value?.schemaVersion !== 1 || !Array.isArray(value.plugins) || value.plugins.length > 1000)
      throw new Error('TabDo 插件市场索引无效')
    return value.plugins.map((plugin: CatalogPlugin) => {
      if (!plugin?.name || !plugin.version || plugin.lifecycle !== 'session-v1')
        throw new Error('市场插件未声明受支持的生命周期')
      const download = new URL(plugin.downloadUrl)
      if (download.protocol !== 'https:') throw new Error('市场插件下载地址必须使用 HTTPS')
      return plugin
    })
  })()
  try {
    return await pendingCatalog
  } finally {
    pendingCatalog = undefined
  }
}

/**
 * 将宿主市场查询映射到独立仓库索引，不请求原市场服务。
 * @param resource 逻辑查询路径或当前市场的绝对查询地址。
 * @param options HTTP 请求选项，只支持读取。
 * @param mode 需要账户写入的旧操作会被拒绝。
 * @returns 与宿主市场界面兼容的只读查询结果。
 * @throws 地址不属于当前市场、写入操作、网络或索引校验失败时抛错。
 */
export async function requestPluginMarket(
  resource: string,
  options: HttpRequestOptions = {},
  mode: PluginMarketAuthMode = 'optional'
): Promise<HttpResponse> {
  if (mode === 'required' || (options.method && options.method !== 'GET'))
    throw new PluginMarketAuthRequiredError('插件讨论与提交请前往 TabDo-plugins 仓库')
  // 绝对地址同样必须属于当前索引源，禁止静默回退到其他市场。
  if (resource.startsWith('http') && !resource.startsWith(DEFAULT_PLUGIN_MARKET_API_BASE + '/'))
    throw new Error('不支持的插件市场来源')
  const query = new URL(
    resource.replace(DEFAULT_PLUGIN_MARKET_API_BASE, ''),
    'https://market.local'
  )
  const catalog = await loadCatalog()
  const platform = query.searchParams.get('platform') || process.platform
  const plugins = catalog.filter((plugin) => !plugin.platform || plugin.platform.includes(platform))
  const plugin = plugins.find((item) => item.name === query.searchParams.get('name'))
  let data: unknown
  switch (query.pathname) {
    case '/plugins':
      data = { latest: plugins, categories: [] }
      break
    case '/plugins/recommendations':
      data = { items: plugins.slice(0, 12) }
      break
    case '/plugins/rankings':
      data = { type: query.searchParams.get('type'), items: plugins.slice(0, 50) }
      break
    case '/plugins/latest':
      data = plugin
        ? { available: true, plugin }
        : { available: false, reason: '当前市场未收录该插件' }
      break
    case '/plugins/download':
      if (!plugin) throw new Error('当前市场未收录该插件')
      data = { downloadUrl: plugin.downloadUrl }
      break
    case '/plugins/readme':
      data = { content: plugin?.readme || plugin?.description || '当前市场未收录该插件' }
      break
    case '/plugins/releases':
      data = {
        items: plugin?.releases || [],
        currentVersion: plugin?.version || '',
        hasMore: false
      }
      break
    default:
      throw new Error('TabDo 插件市场不支持该操作')
  }
  return { data, status: 200, statusMessage: 'OK', headers: {} }
}
