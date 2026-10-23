import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebContentsView } from 'electron'
import { forceRepaintView } from '../../src/main/core/viewRepaint'

afterEach(() => vi.useRealTimers())

/**
 * 模拟 Electron 视图释放后清空 webContents 的行为。
 * @returns 带可观测尺寸和释放状态的最小视图。
 */
function createView(): {
  view: WebContentsView
  release: () => void
  setBounds: ReturnType<typeof vi.fn>
} {
  let destroyed = false
  let bounds = { x: 1, y: 2, width: 600, height: 400 }
  const contents = { isDestroyed: () => destroyed }
  const setBounds = vi.fn((value) => {
    if (destroyed) throw new Error('Object has been destroyed')
    bounds = { ...value }
  })
  const view = {
    webContents: contents,
    getBounds: () => ({ ...bounds }),
    setBounds
  }
  return {
    view: view as unknown as WebContentsView,
    setBounds,
    release: () => {
      destroyed = true
      view.webContents = undefined as never
    }
  }
}

describe('delayed view repaint lifecycle', () => {
  it('restores the one pixel adjustment on a later tick for a live view', async () => {
    vi.useFakeTimers()
    const { view, setBounds } = createView()
    forceRepaintView(view)
    expect(view.getBounds().height).toBe(401)
    await vi.runAllTimersAsync()
    expect(view.getBounds().height).toBe(400)
    expect(setBounds).toHaveBeenCalledTimes(2)
  })

  it('does not crash when a released tool clears webContents before the callback', async () => {
    vi.useFakeTimers()
    const { view, release, setBounds } = createView()
    forceRepaintView(view)
    release()
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow()
    expect(setBounds).toHaveBeenCalledTimes(1)
    // 已释放视图被其他唤醒回调再次调用时也应直接返回。
    expect(() => forceRepaintView(view)).not.toThrow()
  })

  it('does not overwrite a newer layout after switching tools', async () => {
    vi.useFakeTimers()
    const { view, setBounds } = createView()
    forceRepaintView(view)
    const updated = { x: 20, y: 30, width: 800, height: 500 }
    view.setBounds(updated)
    await vi.runAllTimersAsync()
    expect(view.getBounds()).toEqual(updated)
    expect(setBounds).toHaveBeenCalledTimes(2)
  })
})
