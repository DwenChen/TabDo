import { EventEmitter } from 'node:events'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
import {
  getRetiringToolsOwner,
  isToolsPluginPath,
  releaseToolsView,
  stopRetiringToolsViews
} from '../../src/main/core/toolsLifecycle'

afterEach(() => stopRetiringToolsViews())

/**
 * 创建可控的旧工具 WebContents，模拟后台保存完成前仍保持 IPC 连接。
 * @param disposal 该会话资源收束的 Promise。
 * @returns 可追踪关闭动作的模拟视图。
 */
function createContents(disposal: Promise<void>): WebContents {
  const events = new EventEmitter()
  let destroyed = false
  return Object.assign(events, {
    isDestroyed: () => destroyed,
    setBackgroundThrottling: vi.fn(),
    executeJavaScript: vi.fn(() => disposal),
    close: vi.fn(() => {
      destroyed = true
      events.emit('destroyed')
    })
  }) as unknown as WebContents
}

describe('tools host retirement', () => {
  it('recognizes the real source public directory and rejects an external namesake', () => {
    expect(isToolsPluginPath(path.resolve('internal-plugins/system/public'))).toBe(true)
    expect(isToolsPluginPath(path.resolve('plugins/system'))).toBe(false)
  })

  it('preserves old IPC ownership until task completion without closing the new session', async () => {
    let complete!: () => void
    const first = createContents(new Promise<void>((resolve) => (complete = resolve)))
    const second = createContents(new Promise(() => {}))
    const owner = { name: 'system', path: path.resolve('internal-plugins/system/public') }
    const released = vi.fn()
    releaseToolsView(first, released, owner)
    releaseToolsView(second, vi.fn(), owner)
    expect(getRetiringToolsOwner(first)).toEqual(owner)
    expect(first.close).not.toHaveBeenCalled()
    complete()
    await vi.waitFor(() => expect(first.close).toHaveBeenCalledOnce())
    expect(getRetiringToolsOwner(first)).toBeUndefined()
    expect(getRetiringToolsOwner(second)).toEqual(owner)
    expect(second.close).not.toHaveBeenCalled()
    expect(released).toHaveBeenCalledOnce()
  })

  it('force stop closes retired tasks and repeated release does not close twice', () => {
    const contents = createContents(new Promise(() => {}))
    const released = vi.fn()
    const owner = { name: 'system', path: path.resolve('internal-plugins/system/public') }
    releaseToolsView(contents, released, owner)
    releaseToolsView(contents, released, owner)
    expect(stopRetiringToolsViews(owner.path)).toBe(1)
    expect(stopRetiringToolsViews(owner.path)).toBe(0)
    expect(contents.close).toHaveBeenCalledOnce()
    expect(released).toHaveBeenCalledOnce()
  })
})
