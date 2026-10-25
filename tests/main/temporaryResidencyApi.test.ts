import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ handlers: new Map(), getWindow: vi.fn(), getPlugin: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: unknown) => mocks.handlers.set(name, handler) }
}))
vi.mock('../../src/main/managers/windowManager', () => ({ default: {} }))
vi.mock('../../src/main/core/detachedWindowManager', () => ({
  default: { getWindowByPluginWebContents: mocks.getWindow, getPluginForTitlebar: mocks.getPlugin }
}))
import { PluginLifecycleAPI } from '../../src/main/api/plugin/lifecycle'
import { isTemporaryResident } from '../../src/main/core/temporaryResidency'

describe('host-owned temporary window residency', () => {
  let sender: any, host: any, titlebar: any, manager: any, owner: any
  let declare: (value?: unknown) => Promise<boolean>
  let toggle: (source?: any) => Promise<any>
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.getWindow.mockReset()
    mocks.getPlugin.mockReset()
    sender = { id: 12, isDestroyed: vi.fn(() => false) }
    host = { id: 1, send: vi.fn() }
    titlebar = { id: 2, send: vi.fn() }
    owner = {
      webContents: titlebar,
      isVisible: () => true,
      isMinimized: () => false,
      isDestroyed: () => false,
      close: vi.fn()
    }
    mocks.getPlugin.mockImplementation((source) => (source === titlebar ? sender : null))
    manager = {
      getPluginInfoByWebContents: vi.fn(() => ({ name: 'third-party', path: '/plugin' })),
      getCurrentPluginView: () => ({ webContents: sender }),
      detachCurrentPlugin: vi.fn(async () => {
        mocks.getWindow.mockReturnValue(owner)
        return { success: true }
      })
    }
    new PluginLifecycleAPI().init({ webContents: host } as any, manager)
    declare = async (value) => mocks.handlers.get('plugin:temporary-resident')({ sender }, value)
    toggle = async (source = host) =>
      mocks.handlers.get('host:temporary-resident')({ sender: source }, true)
  })
  it('declaration exposes the host switch without enabling or detaching', async () => {
    expect(await declare(true)).toBe(false)
    expect(manager.detachCurrentPlugin).not.toHaveBeenCalled()
    expect(await mocks.handlers.get('host:temporary-resident')({ sender: host })).toEqual({
      supported: true,
      enabled: false
    })
    expect(await declare()).toBe(false)
  })
  it('only host click detaches; titlebar can turn retention off without changing session identity', async () => {
    await declare(true)
    expect(await toggle()).toEqual({ supported: true, enabled: true })
    expect(manager.detachCurrentPlugin).toHaveBeenCalledOnce()
    expect(isTemporaryResident(sender)).toBe(true)
    expect(isTemporaryResident({ id: 12, isDestroyed: () => false } as any)).toBe(false)
    expect(await toggle(titlebar)).toEqual({ supported: true, enabled: false })
    await new Promise((resolve) => setImmediate(resolve))
    expect(owner.close).toHaveBeenCalledOnce()
    expect(manager.detachCurrentPlugin).toHaveBeenCalledOnce()
  })
  it('rejects unsupported activation and cannot activate through a plugin or unrelated sender', async () => {
    await expect(toggle()).rejects.toThrow('未启用')
    await declare(true)
    expect(await toggle(sender)).toEqual({ supported: false, enabled: false })
    expect(manager.detachCurrentPlugin).not.toHaveBeenCalled()
  })
  it('failed detachment never enables retention', async () => {
    await declare(true)
    manager.detachCurrentPlugin.mockResolvedValue({ success: false, error: 'cannot detach' })
    await expect(toggle()).rejects.toThrow('cannot detach')
    expect(isTemporaryResident(sender)).toBe(false)
    expect(owner.close).not.toHaveBeenCalled()
  })
  it('rejects obsolete declarations and malformed property writes', async () => {
    await expect(declare('true')).rejects.toThrow('布尔值')
    manager.getPluginInfoByWebContents.mockReturnValue(null)
    await expect(declare(true)).rejects.toThrow('不可用')
  })
  it('revocation while hidden closes only the owning window; destroyed pages cannot retain state', async () => {
    await declare(true)
    await toggle()
    owner.isVisible = () => false
    await declare(false)
    expect(owner.close).toHaveBeenCalledOnce()
    sender.isDestroyed.mockReturnValue(true)
    expect(isTemporaryResident(sender)).toBe(false)
  })
})
