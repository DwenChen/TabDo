export interface SearchWebsite {
  id: string
  name: string
  url: string
  enabled: boolean
}
export type ImageSearchEngine = 'bing' | 'google-lens'
export interface WebQuickOpenConfig {
  sites: SearchWebsite[]
  imageEngines: ImageSearchEngine[]
}
export const imageSearchEngines = [
  { id: 'bing' as const, name: 'Bing 识图' },
  { id: 'google-lens' as const, name: 'Google Lens' }
]
export const defaultSearchWebsites: SearchWebsite[] = [
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={query}', enabled: true },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={query}', enabled: true },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={query}', enabled: false }
]

/**
 * 检查文本搜索模板，仅允许 HTTP(S) 并要求明确的关键词占位符。
 * @param template 用户配置的搜索地址。
 * @returns 校验通过的模板。
 * @throws {Error} 协议、长度或占位符不符合要求时抛出错误。
 */
export function validateSearchTemplate(template: string): string {
  const value = String(template || '').trim()
  if (value.length > 2048 || !value.includes('{query}')) throw new Error('搜索地址需包含 {query}')
  const url = new URL(value.replaceAll('{query}', 'test'))
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('搜索地址仅支持 HTTP(S)，不能包含账号密码')
  return value
}

/**
 * 将用户文本编码为关键词，防止空格、中文或 & 等字符改变搜索参数。
 * @param template 已配置的搜索地址。
 * @param text 当前匹配文本。
 * @returns 交给默认浏览器的完整地址。
 * @throws {Error} 文本为空、过长或模板无效时抛出错误。
 */
export function buildTextSearchUrl(template: string, text: string): string {
  if (typeof text !== 'string' || !text.trim() || text.length > 10000)
    throw new Error('请输入 1–10000 个字符的搜索文本')
  return validateSearchTemplate(template).replaceAll('{query}', encodeURIComponent(text.trim()))
}

/**
 * 读取工具私有配置，限制规模并保持用户显式禁用或清空的选择。
 * @param value 持久化配置，首次进入可为空。
 * @returns 可独立编辑的配置副本。
 */
export function normalizeWebQuickOpenConfig(
  value?: Partial<WebQuickOpenConfig> | null
): WebQuickOpenConfig {
  const sites = Array.isArray(value?.sites) ? value.sites : defaultSearchWebsites
  const engines = Array.isArray(value?.imageEngines) ? value.imageEngines : ['bing', 'google-lens']
  return {
    sites: sites
      .slice(0, 30)
      .filter((site) => site && typeof site.url === 'string')
      .map((site, index) => ({
        id: String(site.id || `site-${index}`).slice(0, 80),
        name: String(site.name || '未命名网站').slice(0, 40),
        url: site.url.slice(0, 2048),
        enabled: site.enabled !== false
      })),
    imageEngines: [
      ...new Set(
        engines.filter((id): id is ImageSearchEngine => id === 'bing' || id === 'google-lens')
      )
    ]
  }
}
