import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { ConsoleTransport } from 'electron-log'
import { installConsolePipeGuard } from '../../src/main/core/consolePipeGuard'

describe('console output after its parent pipe closes', () => {
  it('disables only console on asynchronous EPIPE and removes both stream listeners', () => {
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const write = vi.fn()
    const transport = { level: 'debug', writeFn: write } as unknown as ConsoleTransport
    const cleanup = installConsolePipeGuard(transport, [stdout, stderr] as NodeJS.WriteStream[])
    stdout.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
    expect(transport.level).toBe(false)
    stderr.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
    cleanup()
    expect(stdout.listenerCount('error')).toBe(0)
    expect(stderr.listenerCount('error')).toBe(0)
    expect(transport.writeFn).toBe(write)
  })

  it('handles a synchronous console EPIPE without swallowing unrelated errors', () => {
    const stdout = new EventEmitter()
    const failure = Object.assign(new Error('broken pipe'), { code: 'EPIPE' })
    const transport = {
      level: 'debug',
      writeFn: vi.fn(() => {
        throw failure
      })
    } as unknown as ConsoleTransport
    const cleanup = installConsolePipeGuard(transport, [stdout] as NodeJS.WriteStream[])
    expect(() => transport.writeFn({ message: {} } as any)).not.toThrow()
    expect(transport.level).toBe(false)
    expect(() => stdout.emit('error', Object.assign(new Error('other'), { code: 'EIO' }))).toThrow(
      'other'
    )
    cleanup()
  })
})
