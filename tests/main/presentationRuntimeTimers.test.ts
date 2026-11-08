import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPresentationRuntimeTimers } from '../../src/main/core/presentationRuntimeTimers'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('presentation backend timer ownership', () => {
  it('releases cancelled handles immediately and clears only live work on retirement', () => {
    vi.useFakeTimers()
    const scope = createPresentationRuntimeTimers()
    const callback = vi.fn()
    for (let index = 0; index < 1000; index++) {
      scope.clearTimeout(scope.setTimeout(callback, 1000))
      scope.clearInterval(scope.setInterval(callback, 1000))
    }
    scope.setTimeout(callback, 1000)
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    scope.clearAll()
    scope.clearAll()
    expect(clear).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(2000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('preserves timer arguments and drops completed timeout handles', () => {
    vi.useFakeTimers()
    const scope = createPresentationRuntimeTimers()
    const callback = vi.fn()
    scope.setTimeout(callback, 10, 'timeout', 2)
    const interval = scope.setInterval(callback, 10, 'interval', 3)
    vi.advanceTimersByTime(10)
    expect(callback.mock.calls).toEqual([
      ['timeout', 2],
      ['interval', 3]
    ])
    scope.clearInterval(interval)
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    scope.clearAll()
    expect(clear).not.toHaveBeenCalled()
  })
})
