import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isProxy } from 'vue'
import { useCommandDataStore } from '../../src/renderer/src/stores/commandDataStore'

afterEach(() => vi.unstubAllGlobals())

describe('command index resource ownership', () => {
  it('searches and rebuilds immutable command tables without deep reactive proxies', async () => {
    const getApps = vi.fn(async () =>
      Array.from({ length: 2000 }, (_, index) => ({
        name: `Performance ${index}`,
        path: `/performance/${index}`,
        type: 'direct'
      }))
    )
    vi.stubGlobal('window', {
      tabdo: {
        getApps,
        getAllPlugins: async () => [],
        getDisabledPlugins: async () => [],
        dbGet: async () => null,
        getPlatform: () => 'win32',
        getSystemSettings: async () => [],
        localShortcuts: { getAll: async () => [] },
        getUsageStats: async () => []
      }
    })
    setActivePinia(createPinia())
    const store = useCommandDataStore()
    await store.loadCommands()
    expect(isProxy(store.commands)).toBe(false)
    expect(isProxy(store.commands[0])).toBe(false)
    expect(
      store.search('Performance 1999').bestMatches.some((item) => item.path === '/performance/1999')
    ).toBe(true)
    getApps.mockResolvedValueOnce([{ name: 'Replacement', path: '/replacement', type: 'direct' }])
    await store.loadCommands()
    expect(
      store.search('Replacement').bestMatches.some((item) => item.path === '/replacement')
    ).toBe(true)
    expect(store.search('Performance 1999').bestMatches).toEqual([])
  })
})
