import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: fake.lookup }))
vi.mock('node:https', () => ({ request: fake.request }))
import {
  fetchCallAiPage,
  fetchDeepSeekPage,
  searchCallAiWeb,
  searchDeepSeekWeb
} from '../../src/main/core/callAiWeb'

/**
 * Stub an HTTPS exchange and exercise a custom DNS callback when present.
 * @param status HTTP status.
 * @param headers Response headers.
 * @param content Response text.
 * @param captureBody Optional observer for the outgoing request body.
 * @returns A mock request implementation.
 */
function response(
  status: number,
  headers: Record<string, string>,
  content: string,
  captureBody?: (body: string) => void
) {
  return (url: URL, options: any, receive: (stream: Readable) => void) => {
    const socket = new EventEmitter()
    return Object.assign(socket, {
      end: (body: string) => {
        captureBody?.(body)
        const complete = (error?: Error | null) => {
          if (error) socket.emit('error', error)
          else
            receive(
              Object.assign(Readable.from([Buffer.from(content)]), { statusCode: status, headers })
            )
        }
        if (options.lookup) options.lookup(url.hostname, { family: 4 }, complete)
        else complete()
      }
    })
  }
}

const signal = new AbortController().signal
beforeEach(() => {
  fake.request.mockReset()
  fake.lookup.mockReset().mockResolvedValue([{ address: '93.184.215.14', family: 4 }])
})

describe('Call AI public web tools', () => {
  it('rejects local literals and checks a redirected host at connection time', async () => {
    await expect(fetchCallAiPage('https://127.0.0.1/private', signal)).rejects.toThrow('公网 HTTPS')
    expect(fake.request).not.toHaveBeenCalled()
    fake.request
      .mockImplementationOnce(response(302, { location: 'https://private.example/metadata' }, ''))
      .mockImplementationOnce(response(200, { 'content-type': 'text/plain' }, 'blocked'))
    fake.lookup
      .mockResolvedValueOnce([{ address: '93.184.215.14', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
    await expect(fetchCallAiPage('https://public.example/start', signal)).rejects.toThrow('内网')
    expect(fake.lookup).toHaveBeenCalledTimes(2)
  })

  it('returns bounded page text with script contents removed', async () => {
    fake.request.mockImplementation(
      response(
        200,
        { 'content-type': 'text/html; charset=utf-8' },
        '<html><head><title>示例 &amp; 来源</title></head><body><script>secret()</script><p>正文</p></body></html>'
      )
    )
    await expect(fetchCallAiPage('https://public.example/page', signal)).resolves.toEqual({
      url: 'https://public.example/page',
      title: '示例 & 来源',
      text: '正文',
      truncated: false
    })
  })

  it('queries the official search endpoint and never forwards the key to a redirect', async () => {
    fake.lookup.mockResolvedValue([{ address: '198.18.0.42', family: 4 }])
    fake.request.mockImplementationOnce(
      response(
        200,
        { 'content-type': 'application/json' },
        '{"web":{"results":[{"title":"<b>页面</b>","url":"https://public.example","description":"摘要"}]}}'
      )
    )
    await expect(searchCallAiWeb('网页搜索', 'test-token', signal)).resolves.toEqual([
      { title: '页面', url: 'https://public.example', snippet: '摘要' }
    ])
    const [url, options] = fake.request.mock.calls[0]
    expect(url.hostname).toBe('api.search.brave.com')
    expect(url.pathname).toBe('/res/v1/web/search')
    expect(url.searchParams.get('q')).toBe('网页搜索')
    expect(options.headers['x-subscription-token']).toBe('test-token')
    expect(options.lookup).toBeUndefined()
    expect(options.rejectUnauthorized).toBe(true)
    fake.request.mockImplementationOnce(response(302, { location: 'https://public.example' }, ''))
    await expect(searchCallAiWeb('redirect', 'test-token', signal)).rejects.toThrow('HTTP 302')
    expect(fake.request).toHaveBeenCalledTimes(2)
    expect(fake.lookup).not.toHaveBeenCalled()
  })

  it('posts searches and Markdown fetches to the fixed DeepSeek tools endpoints', async () => {
    const requestBody = vi.fn()
    // A proxy can resolve even the official hostname to a benchmark-range virtual IP.
    fake.lookup.mockResolvedValue([{ address: '198.18.0.42', family: 4 }])
    fake.request
      .mockImplementationOnce(
        response(
          200,
          {},
          JSON.stringify({
            results: [
              { title: '页面', url: 'https://public.example', summary: '长摘要', snippet: '短摘要' }
            ]
          }),
          requestBody
        )
      )
      .mockImplementationOnce(
        response(200, {}, '{"title":"页面","content":"# 标题\\n正文"}', requestBody)
      )
    await expect(searchDeepSeekWeb(' 网页搜索 ', 'fixture-key', signal)).resolves.toEqual([
      { title: '页面', url: 'https://public.example', snippet: '长摘要' }
    ])
    await expect(
      fetchDeepSeekPage('http://public.example/page', 'fixture-key', signal)
    ).resolves.toEqual({
      url: 'http://public.example/page',
      title: '页面',
      text: '# 标题\n正文',
      truncated: false
    })
    expect(requestBody.mock.calls.map(([body]) => JSON.parse(body))).toEqual([
      { query: '网页搜索', count: 8, need_content: false },
      { url: 'http://public.example/page' }
    ])
    expect(fake.request.mock.calls.map(([url]) => url.href)).toEqual([
      'https://api.deepseek.com/v1/tools/search',
      'https://api.deepseek.com/v1/tools/fetch'
    ])
    for (const [, options] of fake.request.mock.calls) {
      expect(options.method).toBe('POST')
      expect(options.headers.authorization).toBe('Bearer fixture-key')
      expect(options.signal.aborted).toBe(false)
      expect(options.lookup).toBeUndefined()
      expect(options.rejectUnauthorized).toBe(true)
    }
    expect(fake.lookup).not.toHaveBeenCalled()
    fake.request.mockImplementationOnce(response(200, { 'content-type': 'text/plain' }, 'blocked'))
    await expect(fetchCallAiPage('https://api.deepseek.com/v1/tools/fetch', signal)).rejects.toThrow(
      '目标解析为内网或保留地址'
    )
  })

  it('reports a malformed DeepSeek response without exposing the raw response body', async () => {
    fake.request.mockImplementationOnce(
      response(200, {}, '{"results":[{"summary": DNS 解析测试}]}')
    )
    await expect(searchDeepSeekWeb('测试', 'fixture-key', signal)).rejects.toThrow(
      /^DeepSeek 网页搜索返回了无效的 JSON$/
    )
  })

  it('rejects invalid DeepSeek input and keeps credentials away from redirected hosts', async () => {
    await expect(searchDeepSeekWeb('😀'.repeat(129), 'fixture-key', signal)).rejects.toThrow('128')
    await expect(
      fetchDeepSeekPage('https://user:password@public.example', 'fixture-key', signal)
    ).rejects.toThrow('凭据')
    expect(fake.request).not.toHaveBeenCalled()
    fake.request.mockImplementationOnce(response(302, { location: 'https://public.example' }, ''))
    await expect(
      fetchDeepSeekPage('https://public.example', 'fixture-key', signal)
    ).rejects.toThrow('HTTP 302')
    expect(fake.request).toHaveBeenCalledTimes(1)
  })
})
