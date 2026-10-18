import { describe, expect, it, vi } from 'vitest'
vi.mock('../../src/main/utils/httpRequest', () => ({ httpRequest: vi.fn() }))
import { httpRequest } from '../../src/main/utils/httpRequest'
import { requestPluginMarket } from '../../src/main/api/renderer/pluginMarketConfig'
describe('anonymous plugin market', () => {
  it('reads public catalogs without account headers', async () => {
    vi.mocked(httpRequest).mockResolvedValue({ data: [] } as any)
    await requestPluginMarket('/plugins')
    expect(httpRequest).toHaveBeenCalledWith('https://z-tools.top/api/market/plugins', {})
  })
  it('rejects account-only mutations before sending a network request', async () => {
    vi.mocked(httpRequest).mockClear()
    await expect(requestPluginMarket('/comments', {}, 'required')).rejects.toThrow('仅支持浏览评论')
    expect(httpRequest).not.toHaveBeenCalled()
  })
})
