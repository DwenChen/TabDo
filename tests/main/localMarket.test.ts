import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/main/utils/httpRequest', () => ({ httpRequest: vi.fn() }))
import { httpRequest } from '../../src/main/utils/httpRequest'
import {
  DEFAULT_PLUGIN_MARKET_API_BASE,
  requestPluginMarket
} from '../../src/main/api/renderer/pluginMarketConfig'

const plugin = {
  name: 'hello-tabdo',
  version: '1.0.0',
  lifecycle: 'session-v1',
  platform: ['win32'],
  downloadUrl: 'https://github.com/DwenChen/TabDo-plugins/releases/download/v1.0.0/example.zpx'
}
beforeEach(() => {
  vi.mocked(httpRequest)
    .mockReset()
    .mockResolvedValue({ data: { schemaVersion: 1, plugins: [plugin] } } as any)
})
describe('independent TabDo plugin market', () => {
  it('reads the independent index and maps list/latest/download without account headers', async () => {
    const result = await requestPluginMarket('/plugins?platform=win32')
    expect(result.data.latest).toEqual([plugin])
    expect(httpRequest).toHaveBeenCalledWith(DEFAULT_PLUGIN_MARKET_API_BASE + '/index.json', {
      maxResponseBytes: 2 * 1024 * 1024,
      timeoutMs: 15_000
    })
    expect(
      (await requestPluginMarket('/plugins/latest?name=hello-tabdo&platform=win32')).data
    ).toEqual({ available: true, plugin })
    expect(
      (await requestPluginMarket('/plugins/download?name=hello-tabdo&platform=win32')).data
    ).toEqual({ downloadUrl: plugin.downloadUrl })
    expect((await requestPluginMarket('/plugins?platform=darwin')).data.latest).toEqual([])
  })
  it('merges concurrent storefront queries and does not retain completed catalogs', async () => {
    await Promise.all(
      ['/plugins', '/plugins/recommendations', '/plugins/rankings?type=popular'].map((path) =>
        requestPluginMarket(path)
      )
    )
    expect(httpRequest).toHaveBeenCalledTimes(1)
    await requestPluginMarket('/plugins')
    expect(httpRequest).toHaveBeenCalledTimes(2)
  })
  it('rejects old sources and account mutations before issuing requests', async () => {
    await expect(requestPluginMarket('https://z-tools.top/api/market/plugins')).rejects.toThrow(
      '来源'
    )
    await expect(requestPluginMarket('/comments', {}, 'required')).rejects.toThrow('TabDo-plugins')
    expect(httpRequest).not.toHaveBeenCalled()
  })
  it('rejects invalid lifecycle and insecure download metadata and allows retry after failure', async () => {
    for (const invalid of [
      { ...plugin, lifecycle: 'legacy' },
      { ...plugin, downloadUrl: 'http://example.com/plugin.zpx' }
    ]) {
      vi.mocked(httpRequest).mockResolvedValueOnce({
        data: { schemaVersion: 1, plugins: [invalid] }
      } as any)
      await expect(requestPluginMarket('/plugins')).rejects.toThrow()
    }
    expect((await requestPluginMarket('/plugins')).data.latest).toEqual([plugin])
  })
})
