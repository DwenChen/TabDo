import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fromPartition: vi.fn() }))
vi.mock('electron', () => ({ session: { fromPartition: mocks.fromPartition } }))

beforeEach(() => {
  vi.resetModules()
  mocks.fromPartition.mockReset().mockImplementation(() => ({
    setPermissionRequestHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    closeAllConnections: vi.fn().mockResolvedValue(undefined),
    clearStorageData: vi.fn().mockResolvedValue(undefined)
  }))
})

describe('presentation capture partition ownership', () => {
  it('bounds serial launches while keeping concurrent captures isolated', async () => {
    const { acquirePresentationCaptureSession } =
      await import('../../src/main/core/presentationCaptureSession')
    const first = acquirePresentationCaptureSession()
    const concurrent = acquirePresentationCaptureSession()
    expect(first.capture).not.toBe(concurrent.capture)
    await first.release()
    for (let round = 0; round < 20; round++) {
      const next = acquirePresentationCaptureSession()
      expect(next.capture).toBe(first.capture)
      await next.release()
    }
    expect(mocks.fromPartition).toHaveBeenCalledTimes(2)
    expect(
      mocks.fromPartition.mock.calls.every(
        ([name, options]) => !name.startsWith('persist:') && options.cache === false
      )
    ).toBe(true)
    expect(concurrent.capture.clearStorageData).not.toHaveBeenCalled()
    await concurrent.release()
  })

  it('does not reuse a partition until cleanup completes and releases only once', async () => {
    const { acquirePresentationCaptureSession } =
      await import('../../src/main/core/presentationCaptureSession')
    const first = acquirePresentationCaptureSession()
    let finish!: () => void
    vi.mocked(first.capture.clearStorageData).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const cleanup = first.release()
    expect(first.release()).toBe(cleanup)
    await Promise.resolve()
    const next = acquirePresentationCaptureSession()
    expect(next.capture).not.toBe(first.capture)
    expect(first.capture.setPermissionRequestHandler).toHaveBeenCalledWith(null)
    expect(first.capture.setDisplayMediaRequestHandler).toHaveBeenCalledWith(null)
    finish()
    await cleanup
    expect(acquirePresentationCaptureSession().capture).toBe(first.capture)
    expect(first.capture.clearStorageData).toHaveBeenCalledOnce()
    await next.release()
  })

  it('quarantines a partition whose temporary data cannot be cleaned', async () => {
    const { acquirePresentationCaptureSession } =
      await import('../../src/main/core/presentationCaptureSession')
    const first = acquirePresentationCaptureSession()
    vi.mocked(first.capture.clearStorageData).mockRejectedValue(new Error('storage unavailable'))
    await expect(first.release()).rejects.toThrow('storage unavailable')
    expect(acquirePresentationCaptureSession().capture).not.toBe(first.capture)
  })
})
