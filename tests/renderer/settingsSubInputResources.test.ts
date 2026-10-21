import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const lifecycle = vi.hoisted(() => ({
  mounted: [] as (() => void)[],
  unmounted: [] as (() => void)[]
}))
vi.mock('../../internal-plugins/setting/node_modules/vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  onMounted: (callback: () => void) => lifecycle.mounted.push(callback),
  onUnmounted: (callback: () => void) => lifecycle.unmounted.push(callback)
}))
vi.mock('../../internal-plugins/setting/node_modules/@vueuse/core', () => ({
  createEventHook: () => ({ trigger: vi.fn(), on: vi.fn() }),
  useEventListener: vi.fn()
}))
import { useTabDoSubInput } from '../../internal-plugins/setting/src/composables/useTabDoSubInput'

beforeEach(() => {
  vi.useFakeTimers()
  lifecycle.mounted.length = 0
  lifecycle.unmounted.length = 0
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('settings input scheduling', () => {
  it('registers immediately and leaves no retry timers after repeated route exits', async () => {
    const setSubInput = vi.fn(() => true)
    vi.stubGlobal('tabdo', { setSubInput, removeSubInput: vi.fn(), setSubInputValue: vi.fn() })
    for (let index = 0; index < 20; index++) {
      const input = useTabDoSubInput()
      lifecycle.mounted[index]()
      expect(setSubInput).toHaveBeenCalledTimes(index + 1)
      const oldCallback = setSubInput.mock.calls.at(-1)![0] as (value: { text: string }) => void
      lifecycle.unmounted[index]()
      oldCallback({ text: 'late result' })
      expect(input.value.value).toBe('')
    }
    await vi.advanceTimersByTimeAsync(5000)
    expect(setSubInput).toHaveBeenCalledTimes(20)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds failed registration and cancels retries when the route exits', async () => {
    const setSubInput = vi.fn(() => false)
    vi.stubGlobal('tabdo', { setSubInput, removeSubInput: vi.fn(), setSubInputValue: vi.fn() })
    useTabDoSubInput()
    lifecycle.mounted[0]()
    await vi.advanceTimersByTimeAsync(5000)
    expect(setSubInput).toHaveBeenCalledTimes(10)
    expect(vi.getTimerCount()).toBe(0)
    useTabDoSubInput()
    lifecycle.mounted[1]()
    lifecycle.unmounted[1]()
    await vi.advanceTimersByTimeAsync(5000)
    expect(setSubInput).toHaveBeenCalledTimes(11)
    expect(vi.getTimerCount()).toBe(0)
  })
})
