import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'
vi.mock('electron', () => ({ session: {} }))

beforeEach(() => vi.resetModules())

describe('session proxy initialization', () => {
  it('coalesces repeated view setup, applies changed settings in order and retries failures', async () => {
    const manager = (await import('../../src/main/managers/proxyManager')).default
    const setProxy = vi.fn(async () => {})
    const sess = { setProxy } as unknown as Session
    await Promise.all(Array.from({ length: 20 }, () => manager.applyProxyToSession(sess)))
    expect(setProxy).not.toHaveBeenCalled()
    manager.setProxyConfig({ enabled: true, url: 'http://127.0.0.1:1234' })
    const custom = manager.applyProxyToSession(sess)
    manager.setProxyConfig({ enabled: false, url: '' })
    const system = manager.applyProxyToSession(sess)
    await Promise.all([custom, system])
    expect(setProxy.mock.calls.map(([config]) => config)).toEqual([
      { proxyRules: '127.0.0.1:1234', proxyBypassRules: 'localhost,127.0.0.1,::1,<local>' },
      { mode: 'system' }
    ])
    manager.setProxyConfig({ enabled: true, url: 'http://127.0.0.1:4567' })
    setProxy.mockRejectedValueOnce(new Error('proxy failed'))
    await expect(manager.applyProxyToSession(sess)).rejects.toThrow('proxy failed')
    await manager.applyProxyToSession(sess)
    expect(setProxy).toHaveBeenCalledTimes(4)
  })
})
