import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  buildTextSearchUrl,
  normalizeWebQuickOpenConfig,
  validateSearchTemplate
} from '../../src/shared/webQuickOpen'
const mocks = vi.hoisted(() => ({
  open: vi.fn(async () => {}),
  request: vi.fn(),
  body: Buffer.alloc(0),
  location: '',
  popup: vi.fn(),
  lens: vi.fn(async () => {}),
  image: {
    getSize: () => ({ width: 1, height: 1 }),
    isEmpty: () => false,
    toJPEG: () => Buffer.from('synthetic-jpeg')
  }
}))
vi.mock('../../src/main/core/lensBrowserUpload', () => ({ openLensInBrowser: mocks.lens }))
vi.mock('electron', () => ({
  shell: { openExternal: mocks.open },
  nativeImage: { createFromDataURL: () => mocks.image },
  net: {
    request: mocks.request.mockImplementation(() => {
      const request = new EventEmitter() as any
      request.setHeader = vi.fn()
      request.abort = vi.fn()
      request.end = (body) => {
        mocks.body = body
        queueMicrotask(() => request.emit('redirect', 303, 'GET', mocks.location))
      }
      return request
    })
  },
  Menu: {
    buildFromTemplate: (items) => ({
      popup: mocks.popup.mockImplementation(({ callback }) => {
        items[1].click()
        callback()
      }),
      closePopup: vi.fn()
    })
  }
}))
import {
  launchWebQuickOpen,
  uploadSearchImage,
  stopWebQuickOpen
} from '../../src/main/core/webQuickOpen'
afterEach(() => {
  stopWebQuickOpen()
  vi.clearAllMocks()
})
describe('web quick open', () => {
  it('encodes search text as one URL value and rejects executable or credential URLs', () => {
    expect(buildTextSearchUrl('https://example.org/?q={query}', '中文 &?#')).toBe(
      'https://example.org/?q=%E4%B8%AD%E6%96%87%20%26%3F%23'
    )
    for (const value of [
      'javascript:alert({query})',
      'file:///C:/{query}',
      'https://u:p@example.org/?q={query}',
      'https://example.org'
    ])
      expect(() => validateSearchTemplate(value)).toThrow()
    expect(normalizeWebQuickOpenConfig({ sites: [], imageEngines: [] })).toEqual({
      sites: [],
      imageEngines: []
    })
  })
  it('opens one enabled website and releases the operation', async () => {
    const result = await launchWebQuickOpen(7, {
      id: 'text-test',
      kind: 'text',
      text: 'hello',
      config: normalizeWebQuickOpenConfig({
        sites: [
          { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={query}', enabled: true }
        ]
      })
    })
    expect(result.url).toBe('https://www.bing.com/search?q=hello')
    expect(mocks.open).toHaveBeenCalledWith(result.url)
    expect(mocks.popup).not.toHaveBeenCalled()
    await expect(
      launchWebQuickOpen(7, {
        id: 'text-test',
        kind: 'text',
        text: 'again',
        config: normalizeWebQuickOpenConfig({ sites: [], imageEngines: [] })
      })
    ).rejects.toThrow('启用')
  })
  it('uploads an actual multipart body to Bing and accepts only its HTTPS result', async () => {
    const engine = 'bing'
    const url = 'https://www.bing.com/images/search?insightsToken=test'
    mocks.location = url
    expect(
      await uploadSearchImage(
        engine,
        'data:image/png;base64,dGVzdA==',
        new AbortController().signal
      )
    ).toBe(url)
    expect(mocks.body.toString()).toContain('name="imageBin"')
    expect(mocks.request.mock.results[0].value.abort).toHaveBeenCalled()
    mocks.location = 'https://unexpected.example/'
    await expect(
      uploadSearchImage(engine, 'data:image/png;base64,dGVzdA==', new AbortController().signal)
    ).rejects.toThrow('地址异常')
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('hands Lens JPEG bytes to the default browser flow instead of uploading in the app', async () => {
    await launchWebQuickOpen(7, {
      id: 'lens-browser',
      kind: 'image',
      image: 'data:image/png;base64,dGVzdA==',
      config: { sites: [], imageEngines: ['google-lens'] }
    })
    expect(mocks.lens).toHaveBeenCalledWith(
      Buffer.from('synthetic-jpeg'),
      { width: 1, height: 1 },
      expect.any(AbortSignal)
    )
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
  })
})
