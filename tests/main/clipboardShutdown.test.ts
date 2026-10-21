import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  put: vi.fn(),
  stopClipboard: vi.fn(),
  stopWindow: vi.fn(),
  readText: vi.fn(() => '退出时待保存的记录'),
  capture: null as null | (() => void)
}))
vi.mock('electron', () => ({
  clipboard: { readText: mocks.readText, readImage: () => ({ isEmpty: () => true }) },
  nativeImage: {}
}))
vi.mock('fs', () => ({ existsSync: vi.fn(), promises: { mkdir: mocks.mkdir } }))
vi.mock('../../src/main/core/lmdb/lmdbInstance', () => ({
  default: { promises: { put: mocks.put, allDocs: async () => [] }, get: vi.fn() }
}))
vi.mock('../../src/main/core/appData/appDataPaths', () => ({ getClipboardPath: () => '/isolated' }))
vi.mock('../../src/main/utils/clipboardFiles', () => ({ hasClipboardFiles: () => false }))
vi.mock('../../src/main/api', () => ({ default: { dbGet: () => ({}) } }))
vi.mock('../../src/main/managers/pluginManager', () => ({
  default: { sendPluginMessage: vi.fn() }
}))
vi.mock('../../src/main/core/native', () => ({
  default: class {
    /**
     * 保存原生剪贴板回调，供测试模拟待保存的采集。
     * @param callback 采集事件回调。
     * @returns 无返回值。
     */
    start(callback: () => void): void {
      mocks.capture = callback
    }
    stop = mocks.stopClipboard
  },
  WindowMonitor: class {
    /**
     * 提供不产生窗口事件的测试监听。
     * @returns 无返回值。
     */
    start(): void {
      // 本用例不产生窗口切换事件，仅检查此监听的停止时机。
    }
    stop = mocks.stopWindow
  },
  WindowManager: {}
}))

describe('global clipboard shutdown', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.capture = null
    mocks.mkdir.mockResolvedValue(undefined)
    mocks.put.mockResolvedValue(undefined)
  })

  it('stops both native monitors once and waits for an accepted history write', async () => {
    let finishWrite!: () => void
    mocks.put.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        })
    )
    const manager = (await import('../../src/main/managers/clipboardManager')).default
    await vi.waitFor(() => expect(mocks.capture).toBeTypeOf('function'))
    mocks.capture!()
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledOnce())
    const waiting = manager.waitForNextCopiedContent(Number.MAX_SAFE_INTEGER, 60000)
    let completed = false
    const stopped = manager.stop()
    expect(manager.stop()).toBe(stopped)
    void stopped.then(() => {
      completed = true
    })
    expect(mocks.stopClipboard).toHaveBeenCalledOnce()
    expect(mocks.stopWindow).toHaveBeenCalledOnce()
    await expect(waiting).resolves.toBeNull()
    await Promise.resolve()
    expect(completed).toBe(false)
    mocks.capture!()
    expect(mocks.readText).toHaveBeenCalledOnce()
    finishWrite()
    await stopped
    expect(completed).toBe(true)
  })

  it('does not start native threads after a delayed directory initialization finishes during quit', async () => {
    let finishDirectory!: () => void
    mocks.mkdir.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDirectory = resolve
        })
    )
    const manager = (await import('../../src/main/managers/clipboardManager')).default
    await manager.stop()
    finishDirectory()
    await Promise.resolve()
    expect(mocks.capture).toBeNull()
    await expect(manager.waitForNextCopiedContent(0)).resolves.toBeNull()
  })
})
