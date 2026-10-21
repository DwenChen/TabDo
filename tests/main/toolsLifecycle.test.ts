import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ToolLifecycle } = require('../../internal-plugins/system/public/tool-lifecycle.cjs')

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('built-in tool resource ownership', () => {
  it('releases foreground resources immediately and keeps only necessary tasks until completion', async () => {
    const lifecycle = new ToolLifecycle()
    const foreground = vi.fn()
    const taskCleanup = vi.fn()
    let finish!: () => void
    lifecycle.addCleanup(foreground)
    const task = lifecycle.runTask(async (scope) => {
      scope.addCleanup(taskCleanup)
      await new Promise<void>((resolve) => (finish = resolve))
      return 'saved'
    })
    await Promise.resolve()
    const disposal = lifecycle.dispose()
    expect(lifecycle.signal.aborted).toBe(true)
    expect(foreground).toHaveBeenCalledTimes(1)
    expect(taskCleanup).not.toHaveBeenCalled()
    await expect(lifecycle.runTask(vi.fn())).rejects.toThrow('session has ended')
    finish()
    await expect(task).resolves.toBe('saved')
    await disposal
    expect(taskCleanup).toHaveBeenCalledTimes(1)
    expect(lifecycle.dispose()).toBe(disposal)
    expect(lifecycle.tasks.size).toBe(0)
  })

  it('releases late models and isolates a failed cleanup from the remaining resources', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const lifecycle = new ToolLifecycle()
    const first = vi.fn()
    const lateModel = vi.fn()
    lifecycle.addCleanup(first)
    lifecycle.addCleanup(() => {
      throw new Error('failed disposer')
    })
    await lifecycle.dispose()
    lifecycle.addCleanup(lateModel)
    expect(first).toHaveBeenCalledOnce()
    expect(lateModel).toHaveBeenCalledOnce()
  })

  it('cleans failed and timed out task resources without keeping the session alive', async () => {
    vi.useFakeTimers()
    const lifecycle = new ToolLifecycle()
    const failedCleanup = vi.fn()
    await expect(
      lifecycle.runTask((scope) => {
        scope.addCleanup(failedCleanup)
        throw new Error('failed job')
      })
    ).rejects.toThrow('failed job')
    const timedCleanup = vi.fn()
    let signal: AbortSignal | undefined
    const task = lifecycle.runTask(async (scope) => {
      signal = scope.signal
      scope.addCleanup(timedCleanup)
      await new Promise(() => {})
    }, 100)
    const result = expect(task).rejects.toThrow('timed out')
    const disposal = lifecycle.dispose()
    await vi.advanceTimersByTimeAsync(100)
    await result
    await disposal
    expect(failedCleanup).toHaveBeenCalledOnce()
    expect(timedCleanup).toHaveBeenCalledOnce()
    expect(signal?.aborted).toBe(true)
  })
})

describe('early session resource release', () => {
  it('removes completed resource closures during a long visible session', async () => {
    const scope = new ToolLifecycle()
    const cleanup = vi.fn()
    for (let index = 0; index < 1000; index++) {
      const release = scope.addCleanup(cleanup)
      await release()
      await release()
    }
    expect(cleanup).toHaveBeenCalledTimes(1000)
    expect(scope.cleanups.size).toBe(0)
    await scope.dispose()
    expect(cleanup).toHaveBeenCalledTimes(1000)
  })
})
