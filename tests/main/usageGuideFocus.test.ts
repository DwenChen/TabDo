import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuideOverlayFocusGate } from '../../src/main/core/usageGuideFocus'

/**
 * 创建可独立改变焦点状态的窗口身份，测试不能靠 URL 或标题伪装所属覆盖层。
 * @param focused 窗口是否初始聚焦。
 * @returns 窗口身份与可观测状态方法。
 */
function windowIdentity(focused = false): {
  isDestroyed: ReturnType<typeof vi.fn<() => boolean>>
  isVisible: ReturnType<typeof vi.fn<() => boolean>>
  isFocused: ReturnType<typeof vi.fn<() => boolean>>
  url: string
} {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isFocused: vi.fn(() => focused),
    url: 'file:///same/usage-guide.html'
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('owned Windows guide overlay focus', () => {
  it('keeps the tool for its exact coach window and hides after that coach loses focus externally', () => {
    const gate = new GuideOverlayFocusGate()
    const main = windowIdentity(),
      overlay = windowIdentity(true)
    const hide = vi.fn()
    gate.register(overlay)
    expect(
      gate.defer(
        main,
        () => overlay,
        () => false,
        hide
      )
    ).toBe(true)
    vi.advanceTimersByTime(30)
    expect(hide).not.toHaveBeenCalled()
    overlay.isFocused.mockReturnValue(false)
    gate.defer(
      main,
      () => null,
      () => false,
      hide
    )
    vi.advanceTimersByTime(30)
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('does not exempt unrelated windows even with the same URL and title', () => {
    const gate = new GuideOverlayFocusGate()
    const main = windowIdentity(),
      owned = windowIdentity(),
      impostor = windowIdentity(true)
    const hide = vi.fn()
    gate.register(owned)
    expect(impostor.url).toBe(owned.url)
    gate.defer(
      main,
      () => impostor,
      () => false,
      hide
    )
    vi.advanceTimersByTime(30)
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('leaves normal focus handling unchanged when there is no registered teaching window', () => {
    const gate = new GuideOverlayFocusGate()
    const hide = vi.fn()
    expect(
      gate.defer(
        windowIdentity(),
        () => null,
        () => false,
        hide
      )
    ).toBe(false)
    vi.advanceTimersByTime(30)
    expect(hide).not.toHaveBeenCalled()
  })

  it('does not let an older run unregister a newer overlay identity', () => {
    const gate = new GuideOverlayFocusGate()
    const old = windowIdentity(),
      current = windowIdentity(true),
      main = windowIdentity()
    const hide = vi.fn()
    const releaseOld = gate.register(old)
    const releaseCurrent = gate.register(current)
    releaseOld()
    expect(
      gate.defer(
        main,
        () => current,
        () => false,
        hide
      )
    ).toBe(true)
    vi.advanceTimersByTime(30)
    expect(hide).not.toHaveBeenCalled()
    releaseCurrent()
    expect(
      gate.defer(
        main,
        () => old,
        () => false,
        hide
      )
    ).toBe(false)
  })

  it('cancels a pending focus decision when its owning guide exits', () => {
    const gate = new GuideOverlayFocusGate()
    const hide = vi.fn()
    const release = gate.register(windowIdentity())
    gate.defer(
      windowIdentity(),
      () => null,
      () => false,
      hide
    )
    release()
    vi.advanceTimersByTime(30)
    expect(hide).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves the existing native modal suppression without extending it to later external focus', () => {
    const gate = new GuideOverlayFocusGate()
    const main = windowIdentity(),
      overlay = windowIdentity()
    const hide = vi.fn()
    gate.register(overlay)
    gate.defer(
      main,
      () => null,
      () => true,
      hide
    )
    vi.advanceTimersByTime(30)
    expect(hide).not.toHaveBeenCalled()
    gate.defer(
      main,
      () => null,
      () => false,
      hide
    )
    vi.advanceTimersByTime(30)
    expect(hide).toHaveBeenCalledTimes(1)
  })
})
