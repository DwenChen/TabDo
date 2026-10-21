import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenCaptureResult } from '../../src/main/core/native'

const mocks = vi.hoisted(() => ({ start: vi.fn(), readImage: vi.fn() }))
vi.mock('electron', () => ({ clipboard: { readImage: mocks.readImage } }))
vi.mock('../../src/main/core/native', () => ({ ScreenCapture: { start: mocks.start } }))
vi.mock('../../src/main/managers/windowManager', () => ({ default: { showWindow: vi.fn() } }))
import { screenWindow } from '../../src/main/core/screenCapture'

describe('native screenshot result delivery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the native PNG directly without decoding and re-encoding a long clipboard image', () => {
    const result: ScreenCaptureResult = {
      success: true,
      x: 1,
      y: 2,
      width: 900,
      height: 40000,
      base64: 'data:image/png;base64,native'
    }
    mocks.start.mockImplementation((_options, callback) => callback(result))
    const callback = vi.fn()
    screenWindow(callback, { autoConfirm: false })
    expect(callback).toHaveBeenCalledWith(result.base64, { x: 1, y: 2, width: 900, height: 40000 })
    expect(mocks.readImage).not.toHaveBeenCalled()
  })

  it('delivers a native saved image even when the clipboard still contains a different image', () => {
    mocks.start.mockImplementation((_options, callback) =>
      callback({ success: true, base64: 'data:image/png;base64,saved' })
    )
    const callback = vi.fn()
    screenWindow(callback)
    expect(callback.mock.calls[0][0]).toBe('data:image/png;base64,saved')
    expect(mocks.readImage).not.toHaveBeenCalled()
  })

  it('retains the clipboard fallback for older native modules without a PNG payload', () => {
    mocks.start.mockImplementation((_options, callback) => callback({ success: true }))
    mocks.readImage.mockReturnValue({
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,legacy'
    })
    const callback = vi.fn()
    screenWindow(callback)
    expect(callback.mock.calls[0][0]).toBe('data:image/png;base64,legacy')
  })

  it('returns an empty image on cancellation without touching the existing clipboard', () => {
    mocks.start.mockImplementation((_options, callback) => callback({ success: false }))
    const callback = vi.fn()
    screenWindow(callback)
    expect(callback).toHaveBeenCalledWith('')
    expect(mocks.readImage).not.toHaveBeenCalled()
  })
})
