import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ open: vi.fn<(...args: any[]) => Promise<void>>() }))
vi.mock('electron', () => ({ shell: { openExternal: mocks.open } }))
import { openLensInBrowser } from '../../src/main/core/lensBrowserUpload'

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})
describe('Lens browser upload handoff', () => {
  it('serves JPEG bytes once with an opaque origin and closes the loopback listener', async () => {
    let link = '',
      body = '',
      headers!: Headers
    mocks.open.mockImplementation(async (url) => {
      link = url
      expect(new URL(url).hostname).toBe('127.0.0.1')
      expect(new URL(url).pathname).toMatch(/^\/[a-f0-9]{48}$/)
      // 无效路径和非 GET 请求不能领取图片，也不能提前终结本次会话。
      expect((await fetch(new URL('/favicon.ico', url))).status).toBe(404)
      expect((await fetch(url, { method: 'POST' })).status).toBe(404)
      const response = await fetch(url)
      headers = response.headers
      body = await response.text()
    })
    await openLensInBrowser(
      Buffer.from('jpeg-private-bytes'),
      { width: 123, height: 45 },
      new AbortController().signal
    )
    await vi.waitFor(() => expect(body).not.toBe(''))
    expect(body).toContain(Buffer.from('jpeg-private-bytes').toString('base64'))
    expect(body).toContain('action="https://lens.google.com/v3/upload"')
    expect(body).toContain('name="processed_image_dimensions" value="123,45"')
    expect(headers.get('cache-control')).toBe('no-store')
    expect(headers.get('referrer-policy')).toBe('no-referrer')
    expect(headers.get('content-security-policy')).toContain('sandbox allow-forms allow-scripts;')
    expect(headers.get('content-security-policy')).not.toContain('allow-same-origin')
    expect(headers.get('content-security-policy')).toContain(
      'form-action https://lens.google.com https://www.google.com;'
    )
    await expect(fetch(link)).rejects.toThrow()
  })
  it('rejects an already cancelled task without opening a browser', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      openLensInBrowser(Buffer.from('jpeg'), { width: 1, height: 1 }, controller.signal)
    ).rejects.toThrow('取消')
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('closes its listener when the browser cannot start', async () => {
    let link = ''
    mocks.open.mockImplementation(async (url) => {
      link = url
      throw new Error('browser unavailable')
    })
    await expect(
      openLensInBrowser(Buffer.from('jpeg'), { width: 1, height: 1 }, new AbortController().signal)
    ).rejects.toThrow('browser unavailable')
    await expect(fetch(link)).rejects.toThrow()
  })
  it('aborts a browser handoff that has not fetched the image', async () => {
    const controller = new AbortController()
    let link = ''
    mocks.open.mockImplementation(async (url) => {
      link = url
      controller.abort()
    })
    await expect(
      openLensInBrowser(Buffer.from('jpeg'), { width: 1, height: 1 }, controller.signal)
    ).rejects.toThrow('取消')
    await expect(fetch(link)).rejects.toThrow()
  })
  it('expires an unclaimed handoff after 60 seconds and releases the listener', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let link = ''
    mocks.open.mockImplementation(async (url) => {
      link = url
    })
    const operation = openLensInBrowser(
      Buffer.from('jpeg'),
      { width: 1, height: 1 },
      new AbortController().signal
    )
    const rejection = expect(operation).rejects.toThrow('未领取')
    await vi.waitFor(() => expect(link).not.toBe(''))
    await vi.advanceTimersByTimeAsync(60000)
    await rejection
    vi.useRealTimers()
    await expect(fetch(link)).rejects.toThrow()
  })
})
