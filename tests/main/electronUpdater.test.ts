import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import type { CancellationToken } from 'builder-util-runtime'
import type { PlatformUpdaterCallbacks } from '../../src/main/api/platformUpdater/types'

const updaterMocks = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  setFeedURL: vi.fn(),
  on: vi.fn()
}))

// 保存构造时注册的事件回调，模拟 electron-updater 下载完成事件。
const updaterHandlers = vi.hoisted(() => ({}) as Record<string, (info: unknown) => void>)

vi.mock('electron', () => ({
  app: { isPackaged: true, getAppPath: () => '/test/app' }
}))

vi.mock('electron-log', () => ({
  default: {}
}))

vi.mock('electron-updater', () => ({
  NsisUpdater: class {},
  autoUpdater: {
    currentVersion: { prerelease: [], version: '3.0.2' },
    downloadUpdate: updaterMocks.downloadUpdate,
    checkForUpdates: updaterMocks.checkForUpdates,
    quitAndInstall: updaterMocks.quitAndInstall,
    setFeedURL: updaterMocks.setFeedURL,
    on: updaterMocks.on
  }
}))

import { ElectronUpdaterService } from '../../src/main/api/electronUpdater'
import { isPathInside } from '../../src/main/utils/appBundlePath'

const createCallbacks = (): PlatformUpdaterCallbacks => ({
  onDownloadStart: vi.fn(),
  onDownloadProgress: vi.fn(),
  onDownloadCancelled: vi.fn(),
  onDownloaded: vi.fn(),
  onDownloadFailed: vi.fn(),
  onBeforeInstall: vi.fn()
})

describe('ElectronUpdaterService install directory protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(updaterHandlers)) delete updaterHandlers[key]
    updaterMocks.on.mockImplementation((event: string, handler: (info: unknown) => void) => {
      updaterHandlers[event] = handler
    })
    updaterMocks.checkForUpdates.mockResolvedValue({
      updateInfo: { version: '3.1.0', releaseNotes: 'New version' }
    })
    updaterMocks.downloadUpdate.mockResolvedValue(['/update'])
  })
  afterEach(() => {
    delete process.env.TABDO_DATA_ROOT
    delete process.env.TABDO_DATA_LOCATION_ROOT
  })

  it('blocks downloading and installing when the data root is inside the install directory', async () => {
    // 程序安装目录在覆盖安装时会被整体删除，位于其中的资料必须先迁移。
    process.env.TABDO_DATA_ROOT = path.join(path.dirname(process.execPath), 'tabdo-data-inside')
    const service = new ElectronUpdaterService(createCallbacks())
    await service.checkForUpdates()

    const result = await service.downloadAndInstall()

    expect(result.success).toBe(false)
    expect(result.error).toContain('程序安装目录')
    expect(updaterMocks.downloadUpdate).not.toHaveBeenCalled()
    expect(updaterMocks.quitAndInstall).not.toHaveBeenCalled()
  })

  it('blocks installing an already downloaded update when the data root is inside the install directory', async () => {
    process.env.TABDO_DATA_ROOT = path.join(path.dirname(process.execPath), 'tabdo-data-inside')
    const service = new ElectronUpdaterService(createCallbacks())
    await service.checkForUpdates()
    await service.downloadUpdate(false)
    updaterHandlers['update-downloaded']({ version: '3.1.0', releaseNotes: '' })

    const result = service.installDownloadedUpdate()

    expect(result.success).toBe(false)
    expect(result.error).toContain('程序安装目录')
    expect(updaterMocks.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installs normally when the data root is outside the install directory', async () => {
    process.env.TABDO_DATA_ROOT = path.join(os.tmpdir(), `tabdo-update-outside-${process.pid}`)
    const service = new ElectronUpdaterService(createCallbacks())
    await service.checkForUpdates()
    await service.downloadUpdate(false)
    updaterHandlers['update-downloaded']({ version: '3.1.0', releaseNotes: '' })

    expect(service.installDownloadedUpdate()).toEqual({ success: true })
    expect(updaterMocks.quitAndInstall).toHaveBeenCalled()
  })

  it('does not treat sibling directories sharing the install directory name as inside it', () => {
    expect(isPathInside(path.join('C:', 'TabDo'), path.join('C:', 'TabDoData'))).toBe(false)
    expect(isPathInside(path.join('C:', 'TabDo'), path.join('C:', 'TabDo', 'data'))).toBe(true)
  })
})

describe('ElectronUpdaterService cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updaterMocks.checkForUpdates.mockResolvedValue({
      updateInfo: { version: '3.1.0', releaseNotes: 'New version' }
    })
    updaterMocks.downloadUpdate.mockImplementation(
      (cancellationToken: CancellationToken) =>
        new Promise((_resolve, reject) => {
          cancellationToken.once('cancel', () => reject(new Error('cancelled')))
        })
    )
  })

  it('cancels an active download without installing and allows a new download', async () => {
    const callbacks: PlatformUpdaterCallbacks = {
      onDownloadStart: vi.fn(),
      onDownloadProgress: vi.fn(),
      onDownloadCancelled: vi.fn(),
      onDownloaded: vi.fn(),
      onDownloadFailed: vi.fn(),
      onBeforeInstall: vi.fn()
    }
    const service = new ElectronUpdaterService(callbacks)
    await service.checkForUpdates()

    // 启动下载后立即取消，验证安装流程不会继续执行。
    const firstDownload = service.downloadAndInstall()
    const cancelResult = await service.cancelUpdate()

    expect(cancelResult).toEqual({ success: true, cancelled: true })
    await expect(firstDownload).resolves.toEqual({ success: false, cancelled: true })
    expect(service.getDownloadStatus().status).toBe('available')
    expect(callbacks.onDownloadCancelled).toHaveBeenCalledOnce()
    expect(callbacks.onDownloadFailed).not.toHaveBeenCalled()
    expect(updaterMocks.quitAndInstall).not.toHaveBeenCalled()

    // 模拟底层下载进入无法中断的收尾阶段，完成后仍不得继续安装。
    let finishSecondDownload: (() => void) | null = null
    updaterMocks.downloadUpdate.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          finishSecondDownload = () => resolve(['/update'])
        })
    )
    const secondDownload = service.downloadUpdate(false)
    expect(updaterMocks.downloadUpdate).toHaveBeenCalledTimes(2)
    const secondCancellation = service.cancelUpdate()
    finishSecondDownload?.()

    await expect(secondCancellation).resolves.toEqual({ success: true, cancelled: true })
    await expect(secondDownload).resolves.toEqual({ success: false, cancelled: true })
    expect(callbacks.onDownloadCancelled).toHaveBeenCalledTimes(2)
    expect(updaterMocks.quitAndInstall).not.toHaveBeenCalled()
  })
})
