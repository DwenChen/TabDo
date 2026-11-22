import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => new Map<string, any>())
const power = vi.hoisted(() => {
  let nextId = 1
  return {
    start: vi.fn(() => nextId++),
    stop: vi.fn(),
    isStarted: vi.fn(() => true)
  }
})

vi.mock('electron', () => ({
  powerSaveBlocker: {
    start: power.start,
    stop: power.stop,
    isStarted: power.isStarted
  }
}))

vi.mock('../../src/main/api/shared/database', () => ({
  default: {
    dbGet: (key: string) => state.get(key),
    dbPut: (key: string, value: any) => state.set(key, value)
  }
}))

import awakeService from '../../src/main/core/awakeService'

beforeEach(() => {
  vi.useFakeTimers()
  state.clear()
  power.start.mockClear()
  power.stop.mockClear()
  power.isStarted.mockClear()
  // 每次从关闭状态开始，避免单例状态跨用例残留。
  awakeService.syncFromSettings({ awakeEnabled: false })
})

afterEach(() => {
  awakeService.stop()
  vi.useRealTimers()
})

describe('宿主唤醒服务', () => {
  it('开启时默认只阻止应用挂起', () => {
    const result = awakeService.syncFromSettings({
      awakeEnabled: true,
      awakeKeepDisplayOn: false,
      awakeDurationMinutes: 0
    })

    expect(result.enabled).toBe(true)
    expect(power.start).toHaveBeenLastCalledWith('prevent-app-suspension')
    expect(power.start).toHaveBeenCalledTimes(1)
  })

  it('设置保持屏幕点亮时切换为显示器阻塞', () => {
    awakeService.syncFromSettings({ awakeEnabled: true, awakeKeepDisplayOn: false })
    const result = awakeService.setKeepDisplayOn(true)

    expect(result.keepDisplayOn).toBe(true)
    expect(power.start).toHaveBeenLastCalledWith('prevent-display-sleep')
    expect(power.stop).toHaveBeenCalled()
    expect(state.get('settings-general').awakeKeepDisplayOn).toBe(true)
  })

  it('有限时长结束后自动关闭并持久化', () => {
    awakeService.syncFromSettings({ awakeEnabled: true, awakeDurationMinutes: 0 })
    const timed = awakeService.setDuration(1)

    expect(timed.durationMinutes).toBe(1)
    expect(timed.remainingMs).toBe(60_000)

    vi.advanceTimersByTime(60_000)

    expect(awakeService.getState().enabled).toBe(false)
    expect(state.get('settings-general').awakeEnabled).toBe(false)
    expect(power.stop).toHaveBeenCalled()
  })

  it('关闭时释放电源阻塞和计时器', () => {
    awakeService.syncFromSettings({ awakeEnabled: true, awakeDurationMinutes: 30 })
    const result = awakeService.setEnabled(false)

    expect(result.enabled).toBe(false)
    expect(power.stop).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
