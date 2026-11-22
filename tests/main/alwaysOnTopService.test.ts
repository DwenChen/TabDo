import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shortcuts = vi.hoisted(() => {
  const registered = new Set<string>()
  return {
    registered,
    register: vi.fn((accelerator: string) => {
      registered.add(accelerator)
      return true
    }),
    unregister: vi.fn((accelerator: string) => registered.delete(accelerator)),
    isRegistered: vi.fn((accelerator: string) => registered.has(accelerator))
  }
})

const state = vi.hoisted(() => new Map<string, any>())

const border = vi.hoisted(() => ({
  pin: vi.fn(),
  unpin: vi.fn(),
  applyStyle: vi.fn(),
  stop: vi.fn(),
  getTrackedHandles: vi.fn(() => [])
}))

vi.mock('electron', () => ({
  globalShortcut: {
    register: shortcuts.register,
    unregister: shortcuts.unregister,
    isRegistered: shortcuts.isRegistered
  }
}))

vi.mock('../../src/main/core/alwaysOnTopBorder.js', () => ({ default: border }))

vi.mock('../../src/main/api/shared/database', () => ({
  default: {
    dbGet: (key: string) => state.get(key),
    dbPut: (key: string, value: any) => state.set(key, value)
  }
}))

vi.mock('../../src/main/core/native/index.js', () => ({
  WindowManager: { getActiveWindow: () => ({ hwnd: 1, pid: 2 }) }
}))

vi.mock('../../src/main/core/dndManager.js', () => ({
  default: { shouldIgnoreHotkeys: () => false }
}))

import alwaysOnTopService, {
  ALWAYS_ON_TOP_ACCELERATOR,
  DEFAULT_ALWAYS_ON_TOP_SHORTCUT,
  readAlwaysOnTopConfig
} from '../../src/main/core/alwaysOnTopService'

beforeEach(() => {
  state.clear()
  shortcuts.registered.clear()
  shortcuts.register.mockClear()
  shortcuts.unregister.mockClear()
  shortcuts.isRegistered.mockClear()
  shortcuts.register.mockImplementation((accelerator: string) => {
    shortcuts.registered.add(accelerator)
    return true
  })
  border.pin.mockClear()
  border.unpin.mockClear()
  border.applyStyle.mockClear()
  border.stop.mockClear()
  alwaysOnTopService.stop()
  // 清空跨用例的配置残留，确保每个用例都从默认快捷键和关闭状态开始。
  alwaysOnTopService.syncFromSettings({ alwaysOnTopEnabled: false })
})

afterEach(() => {
  alwaysOnTopService.stop()
})

describe('窗口置顶宿主服务', () => {
  it('默认快捷键为 Shift+T，启用时注册全局快捷键', () => {
    expect(DEFAULT_ALWAYS_ON_TOP_SHORTCUT).toBe('Shift+T')
    expect(ALWAYS_ON_TOP_ACCELERATOR).toBe(DEFAULT_ALWAYS_ON_TOP_SHORTCUT)

    const result = alwaysOnTopService.setEnabled(true)

    expect(result.success).toBe(true)
    expect(shortcuts.register).toHaveBeenCalledWith(ALWAYS_ON_TOP_ACCELERATOR, expect.any(Function))
    expect(alwaysOnTopService.getConfig().enabled).toBe(true)
    expect(state.get('settings-general').alwaysOnTopEnabled).toBe(true)
  })

  it('快捷键被占用时回报错误且可再次启用', () => {
    shortcuts.register.mockReturnValueOnce(false)

    expect(alwaysOnTopService.setEnabled(true)).toMatchObject({
      success: false,
      error: expect.stringContaining('已被占用')
    })

    expect(alwaysOnTopService.getConfig().enabled).toBe(false)
    expect(shortcuts.register).toHaveBeenCalledTimes(1)
    expect(alwaysOnTopService.setEnabled(true).success).toBe(true)
  })

  it('关闭时注销快捷键并释放所有边框', () => {
    alwaysOnTopService.setEnabled(true)
    shortcuts.unregister.mockClear()

    expect(alwaysOnTopService.setEnabled(false).success).toBe(true)
    expect(shortcuts.unregister).toHaveBeenCalledWith(ALWAYS_ON_TOP_ACCELERATOR)
    expect(border.stop).toHaveBeenCalled()
  })

  it('启用后可修改快捷键并立即重新注册', () => {
    alwaysOnTopService.setEnabled(true)
    shortcuts.unregister.mockClear()
    shortcuts.register.mockClear()

    const result = alwaysOnTopService.updateConfig({ shortcut: 'Ctrl+Shift+P' })

    expect(result.success).toBe(true)
    expect(shortcuts.unregister).toHaveBeenCalledWith(ALWAYS_ON_TOP_ACCELERATOR)
    expect(shortcuts.register).toHaveBeenCalledWith('Ctrl+Shift+P', expect.any(Function))
    expect(state.get('settings-general').alwaysOnTopShortcut).toBe('Ctrl+Shift+P')
  })

  it('新快捷键被占用时恢复原组合且不落库', () => {
    alwaysOnTopService.setEnabled(true)
    shortcuts.register.mockReturnValueOnce(false)

    const result = alwaysOnTopService.updateConfig({ shortcut: 'Ctrl+Shift+P' })

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Ctrl+Shift+P')
    })
    expect(shortcuts.registered.has(ALWAYS_ON_TOP_ACCELERATOR)).toBe(true)
    expect(state.get('settings-general').alwaysOnTopShortcut).toBe(ALWAYS_ON_TOP_ACCELERATOR)
  })

  it('外观设置会同步到边框并持久化', () => {
    alwaysOnTopService.setEnabled(true)
    border.applyStyle.mockClear()

    alwaysOnTopService.updateConfig({
      colorMode: 'custom',
      borderColor: '#ff8800',
      opacity: 55,
      thickness: 7,
      roundedCorners: false,
      playSound: false
    })

    expect(border.applyStyle).toHaveBeenLastCalledWith({
      colorMode: 'custom',
      color: '#ff8800',
      opacity: 55,
      thickness: 7,
      roundedCorners: false
    })
    expect(state.get('settings-general')).toMatchObject({
      alwaysOnTopBorderColorMode: 'custom',
      alwaysOnTopBorderColor: '#ff8800',
      alwaysOnTopBorderOpacity: 55,
      alwaysOnTopBorderThickness: 7,
      alwaysOnTopRoundedCorners: false,
      alwaysOnTopPlaySound: false
    })
  })

  it('读取配置时回退非法值并保留明确关闭的外观项', () => {
    const config = readAlwaysOnTopConfig({
      alwaysOnTopEnabled: true,
      alwaysOnTopShortcut: '  ',
      alwaysOnTopBorderEnabled: false,
      alwaysOnTopBorderColor: 'red',
      alwaysOnTopBorderOpacity: 999,
      alwaysOnTopBorderThickness: 0,
      alwaysOnTopRoundedCorners: false,
      alwaysOnTopPlaySound: false
    })

    expect(config).toMatchObject({
      enabled: true,
      shortcut: DEFAULT_ALWAYS_ON_TOP_SHORTCUT,
      borderEnabled: false,
      borderColor: '#1A73E8',
      opacity: 100,
      thickness: 1,
      roundedCorners: false,
      playSound: false
    })
  })

  it('默认开启边框，关闭边框时释放辅助进程并持久化', () => {
    expect(readAlwaysOnTopConfig({}).borderEnabled).toBe(true)
    alwaysOnTopService.setEnabled(true)
    border.stop.mockClear()

    expect(alwaysOnTopService.updateConfig({ borderEnabled: false }).success).toBe(true)

    expect(border.stop).toHaveBeenCalled()
    expect(alwaysOnTopService.getConfig().borderEnabled).toBe(false)
    expect(state.get('settings-general').alwaysOnTopBorderEnabled).toBe(false)
  })
})
