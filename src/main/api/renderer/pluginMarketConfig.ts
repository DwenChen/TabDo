import { httpRequest, type HttpRequestOptions, type HttpResponse } from '../../utils/httpRequest'
export const DEFAULT_PLUGIN_MARKET_API_BASE = 'https://z-tools.top/api/market'
export const PluginMarketAuthMode = { OPTIONAL: 'optional', REQUIRED: 'required' } as const
export type PluginMarketAuthMode = (typeof PluginMarketAuthMode)[keyof typeof PluginMarketAuthMode]
export class PluginMarketAuthRequiredError extends Error {}
/** 返回公共插件市场地址。
+ * @returns 市场地址。
+ */
export function getPluginMarketApiBase(): string {
  return DEFAULT_PLUGIN_MARKET_API_BASE
}
/** 使用匿名请求访问公共市场。
+ * @param resource 资源路径或 URL。
+ * @param options HTTP 请求选项。
+ * @param mode 是否依赖账户。
+ * @returns HTTP 响应。
+ * @throws 需要账户的操作或网络请求失败。
+ */
export async function requestPluginMarket(
  resource: string,
  options: HttpRequestOptions = {},
  mode: PluginMarketAuthMode = 'optional'
): Promise<HttpResponse> {
  if (mode === 'required') throw new PluginMarketAuthRequiredError('本地版仅支持浏览评论')
  return httpRequest(
    resource.startsWith('http') ? resource : DEFAULT_PLUGIN_MARKET_API_BASE + resource,
    options
  )
}
