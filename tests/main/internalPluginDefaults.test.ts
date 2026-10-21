import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: new Map<string, unknown>() }))
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../src/main/api/index', () => ({
  default: {
    dbGet: (key: string) => state.data.get(key),
    dbPut: (key: string, value: unknown) => state.data.set(key, value)
  }
}))
vi.mock('fs', () => ({
  default: {
    existsSync: () => true,
    readFileSync: (file: string) =>
      JSON.stringify({ name: file.includes('setting') ? 'setting' : 'system', version: '1' })
  }
}))
import { loadInternalPlugins } from '../../src/main/core/internalPluginLoader'

describe('builtin tool window defaults', () => {
  beforeEach(() => state.data.clear())

  it('keeps tools embedded and leaves resource release to its own lifecycle', () => {
    loadInternalPlugins()
    expect(state.data.get('auto-detach-plugin')).toEqual(['setting'])
    expect(state.data.get('out-kill-plugin')).toEqual(['setting'])
  })

  it('migrates the old tools defaults while preserving unrelated plugins and config forms', () => {
    state.data.set('builtin-window-defaults-v1', true)
    state.data.set('auto-detach-plugin', ['setting', 'system', 'vendor', { pluginName: 'another' }])
    state.data.set('out-kill-plugin', ['vendor', { pluginName: 'system' }, 'setting'])
    loadInternalPlugins()
    expect(state.data.get('auto-detach-plugin')).toEqual([
      'setting',
      'vendor',
      { pluginName: 'another' }
    ])
    expect(state.data.get('out-kill-plugin')).toEqual(['vendor', 'setting'])
  })

  it('only retracts old defaults once, without undoing later explicit choices', () => {
    loadInternalPlugins()
    state.data.set('auto-detach-plugin', ['vendor', 'system'])
    loadInternalPlugins()
    expect(state.data.get('auto-detach-plugin')).toEqual(['vendor', 'system'])
  })
})
