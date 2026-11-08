import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const state = vi.hoisted(() => ({
  app: null as any,
  windows: [] as any[],
  contents: [] as any[],
  spawn: vi.fn()
}))
vi.mock('electron', () => ({
  get app() {
    return state.app
  },
  BrowserWindow: { getAllWindows: () => state.windows },
  webContents: { getAllWebContents: () => state.contents }
}))
vi.mock('node:child_process', () => ({ spawn: state.spawn }))
import {
  IdleMemoryReclaimer,
  startIdleMemoryReclaimer
} from '../../src/main/core/idleMemoryReclaimer'

beforeEach(() => {
  vi.useFakeTimers()
  state.app = Object.assign(new EventEmitter(), {
    getAppPath: () => process.cwd(),
    getAppMetrics: vi.fn(() => [
      { pid: 42, creationTime: 123456, memory: { workingSetSize: 200_000 } }
    ])
  })
  state.windows = []
  state.contents = []
  state.spawn.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('idle memory policy', () => {
  it('does not retain a synchronously completed no-op reclaimer', async () => {
    const cancel = vi.fn()
    const policy = new IdleMemoryReclaimer(
      () => true,
      (finished) => {
        finished()
        return cancel
      },
      100
    )
    policy.request()
    await vi.advanceTimersByTimeAsync(100)
    policy.stop()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('releases idle inputs below the working set target without spawning a trimming helper', async () => {
    const host = Object.assign(new EventEmitter(), { isDestroyed: () => false })
    state.contents = [host]
    state.app.getAppMetrics.mockReturnValue([{ memory: { workingSetSize: 50_000 } }])
    const release = vi.fn()
    const stop = startIdleMemoryReclaimer(host as any, () => false, release)
    await vi.advanceTimersByTimeAsync(10000)
    expect(release).toHaveBeenCalledOnce()
    expect(state.spawn).not.toHaveBeenCalled()
    stop()
  })
  it('drops a completed helper reference without letting an old completion cancel a newer pass', async () => {
    const finished: Array<() => void> = []
    const cancel = vi.fn()
    const reclaim = vi.fn((done: () => void) => {
      finished.push(done)
      return cancel
    })
    const policy = new IdleMemoryReclaimer(() => true, reclaim, 100)
    policy.request()
    await vi.advanceTimersByTimeAsync(100)
    finished[0]()
    policy.request()
    expect(cancel).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    finished[0]()
    policy.stop()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('coalesces exit events, rechecks activity and performs no recurring compression', async () => {
    let idle = true
    const reclaim = vi.fn(() => vi.fn())
    const policy = new IdleMemoryReclaimer(() => idle, reclaim, 100)
    policy.request()
    await vi.advanceTimersByTimeAsync(60)
    policy.request()
    await vi.advanceTimersByTimeAsync(60)
    expect(reclaim).not.toHaveBeenCalled()
    idle = false
    await vi.advanceTimersByTimeAsync(60)
    expect(reclaim).not.toHaveBeenCalled()
    idle = true
    policy.request()
    await vi.advanceTimersByTimeAsync(100)
    expect(reclaim).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(10000)
    expect(reclaim).toHaveBeenCalledOnce()
    policy.stop()
  })

  it('cancels pending helpers on renewed activity and permanently stops at shutdown', async () => {
    let idle = true
    const cancel = vi.fn()
    const reclaim = vi.fn(() => cancel)
    const policy = new IdleMemoryReclaimer(() => idle, reclaim, 100)
    policy.request()
    await vi.advanceTimersByTimeAsync(100)
    idle = false
    policy.request()
    expect(cancel).toHaveBeenCalledOnce()
    idle = true
    policy.request()
    policy.stop()
    policy.request()
    await vi.advanceTimersByTimeAsync(1000)
    expect(reclaim).toHaveBeenCalledOnce()
  })

  it.skipIf(process.platform !== 'win32')(
    'waits for hidden task pages and native processes, then validates readiness again',
    async () => {
      const host = Object.assign(new EventEmitter(), { isDestroyed: () => false })
      const window = Object.assign(new EventEmitter(), {
        isVisible: () => false,
        isMinimized: () => false
      })
      state.contents = [host, new EventEmitter()]
      state.windows = [window]
      let nativeBusy = true
      const stop = startIdleMemoryReclaimer(host as any, () => nativeBusy)
      await vi.advanceTimersByTimeAsync(20000)
      expect(state.spawn).not.toHaveBeenCalled()
      const taskPage = state.contents.pop()
      taskPage.emit('destroyed')
      await vi.advanceTimersByTimeAsync(20000)
      expect(state.spawn).not.toHaveBeenCalled()
      nativeBusy = false
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
        kill: vi.fn(),
        exitCode: null,
        signalCode: null
      })
      state.spawn.mockReturnValue(child)
      window.emit('hide')
      await vi.advanceTimersByTimeAsync(10000)
      expect(state.spawn).toHaveBeenCalledOnce()
      // 辅助进程准备期间重新打开页面，旧快照不得提交给原生回收器。
      state.contents.push(new EventEmitter())
      child.stdout.emit('data', Buffer.from('ready\n'))
      expect(child.kill).toHaveBeenCalled()
      expect(child.stdin.end).not.toHaveBeenCalled()
      stop()
      expect(window.listenerCount('hide')).toBe(0)
      expect(host.listenerCount('destroyed')).toBe(0)
      expect(state.app.listenerCount('web-contents-created')).toBe(0)
    }
  )

  it.skipIf(process.platform !== 'win32')(
    'sends only fresh owned process identities after a complete ready line and bounds helper lifetime',
    async () => {
      const host = Object.assign(new EventEmitter(), { isDestroyed: () => false })
      state.contents = [host]
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
        kill: vi.fn(),
        exitCode: null,
        signalCode: null
      })
      state.spawn.mockReturnValue(child)
      const stop = startIdleMemoryReclaimer(host as any, () => false)
      // 被宿主拒绝或取消的退出不能永久停掉闲置回收。
      state.app.emit('before-quit', { defaultPrevented: true })
      await vi.advanceTimersByTimeAsync(10000)
      child.stdout.emit('data', Buffer.from('rea'))
      expect(child.stdin.end).not.toHaveBeenCalled()
      child.stdout.emit('data', Buffer.from('dy\r\n'))
      expect(JSON.parse(child.stdin.end.mock.calls[0][0])).toEqual([
        { pid: 42, creationTime: 123456 }
      ])
      await vi.advanceTimersByTimeAsync(15000)
      expect(child.kill).toHaveBeenCalledOnce()
      state.app.emit('will-quit')
      expect(state.app.listenerCount('web-contents-created')).toBe(0)
      stop()
    }
  )
})
