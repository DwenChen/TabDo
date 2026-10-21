import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session, WebContents } from 'electron'
import { ensurePluginSessionPreload } from '../../src/main/core/pluginSessionPreload'
import { requestPluginResponse } from '../../src/main/core/pluginRpc'
import { PluginAssemblyCoordinator } from '../../src/main/managers/pluginAssemblyCoordinator'

afterEach(() => vi.useRealTimers())

describe('plugin runtime resource bounds', () => {
  it('removes DOM readiness listeners on timeout and destruction', async () => {
    vi.useFakeTimers()
    const coordinator = new PluginAssemblyCoordinator()
    const contents = Object.assign(new EventEmitter(), { id: 123, isDestroyed: () => false })
    const waiting = coordinator.waitForDomReady({ webContents: contents } as never, 100)
    await vi.advanceTimersByTimeAsync(100)
    await waiting
    expect(contents.eventNames()).toEqual([])
    const destroyed = coordinator.waitForDomReady({ webContents: contents } as never, 100)
    contents.emit('destroyed')
    await destroyed
    expect(contents.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('registers a shared frame preload once across 100 view/window creations and restores an unregistered script', () => {
    const scripts: { type: string; filePath: string }[] = []
    const sess = {
      getPreloadScripts: () => scripts,
      registerPreloadScript: vi.fn((script) => scripts.push(script))
    } as unknown as Session
    for (let i = 0; i < 100; i++) ensurePluginSessionPreload(sess, '/common/preload.js')
    expect(sess.registerPreloadScript).toHaveBeenCalledOnce()
    scripts.length = 0
    ensurePluginSessionPreload(sess, '/common/preload.js')
    expect(sess.registerPreloadScript).toHaveBeenCalledTimes(2)
  })

  it('cleans successful, timed out, destroyed and failed IPC requests', async () => {
    vi.useFakeTimers()
    const ipc = new EventEmitter()
    const contents = Object.assign(new EventEmitter(), {
      ipc,
      isDestroyed: () => false,
      send: vi.fn()
    }) as unknown as WebContents
    contents.setMaxListeners(0)
    const success = requestPluginResponse(contents, 'query', 'reply', {}, 1000)
    ipc.emit('reply', {}, 'ok')
    await expect(success).resolves.toBe('ok')
    expect(ipc.listenerCount('reply')).toBe(0)
    const pending = Array.from({ length: 100 }, (_, index) =>
      requestPluginResponse(contents, 'query', `reply-${index}`, {}, 1000)
    )
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.all(pending)
    expect(ipc.eventNames()).toEqual([])
    expect(contents.listenerCount('destroyed')).toBe(0)
    const destroyed = requestPluginResponse(contents, 'query', 'reply', {}, 1000)
    contents.emit('destroyed')
    await expect(destroyed).resolves.toBeUndefined()
    vi.mocked(contents.send).mockImplementation(() => {
      throw new Error('send failed')
    })
    await expect(requestPluginResponse(contents, 'query', 'reply', {}, 1000)).rejects.toThrow(
      'send failed'
    )
    expect(ipc.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
