import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
const request = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ net: { request }, session: { defaultSession: {} } }))
import { httpRequest } from '../../src/main/utils/httpRequest'
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
/**
 * 创建可控的网络请求与响应，不访问真实网络。
 * @returns 包含事件边界和取消探针的请求夹具。
 */
function fixture(): { client: any; response: any } {
  const client = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    abort: vi.fn()
  })
  const response = Object.assign(new EventEmitter(), {
    headers: { 'content-type': 'application/json' },
    statusCode: 200,
    statusMessage: 'OK'
  })
  request.mockReturnValue(client)
  return { client, response }
}
describe('metadata request memory limits', () => {
  it('rejects oversized chunks and aborts its own request without parsing late end', async () => {
    const { client, response } = fixture()
    const pending = httpRequest('https://example.com/index', { maxResponseBytes: 4 })
    client.emit('response', response)
    response.emit('data', Buffer.from('12345'))
    response.emit('end')
    await expect(pending).rejects.toThrow('size limit')
    expect(client.abort).toHaveBeenCalledOnce()
  })
  it('cancels a stalled request and releases the deadline on normal completion', async () => {
    vi.useFakeTimers()
    const { client } = fixture()
    const pending = httpRequest('https://example.com/index', { timeoutMs: 100 })
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    expect(client.abort).toHaveBeenCalledOnce()
    const next = fixture()
    const success = httpRequest('https://example.com/index', { timeoutMs: 100 })
    next.client.emit('response', next.response)
    next.response.emit('data', Buffer.from('{}'))
    next.response.emit('end')
    expect((await success).data).toEqual({})
    expect(vi.getTimerCount()).toBe(0)
  })
})
