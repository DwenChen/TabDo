import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

const mocks = vi.hoisted(() => ({
  settings: {
    enabled: {} as Record<string, string[]>,
    defaultId: {},
    params: {} as Record<string, Record<string, any>>
  },
  complete: vi.fn(),
  ensure: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  status: vi.fn(),
  choices: [] as any[],
  resolve: vi.fn(),
  legacy: new Map<string, any>(),
  db: new Map<string, any>()
}))
vi.mock('electron', () => ({ app: { on: vi.fn() }, net: {}, nativeImage: {} }))
vi.mock('../../src/main/core/provider/providerManager', () => ({
  default: {
    registerBuiltinProvider: vi.fn(),
    getSettings: () => mocks.settings,
    getParams: (id: string) => mocks.settings.params[id] || {},
    setParams: (id: string, params: any) => {
      mocks.settings.params[id] = params
      return mocks.settings
    },
    setEnabled: (id: string, value: boolean) => {
      const group = id.includes('ocr') ? 'ocr' : 'translation'
      mocks.settings.enabled[group] = value
        ? [...new Set([...(mocks.settings.enabled[group] || []), id])]
        : (mocks.settings.enabled[group] || []).filter((item) => item !== id)
      return mocks.settings
    }
  }
}))
vi.mock('../../src/main/core/provider/modelAssets', () => ({
  default: {
    ensure: mocks.ensure,
    cancel: mocks.cancel,
    remove: mocks.remove,
    status: mocks.status
  },
  getBuiltinModelsRoot: () => '/isolated'
}))
vi.mock('../../src/main/core/aiProviderService', () => ({
  default: { getModelChoices: () => mocks.choices, resolveModel: mocks.resolve }
}))
vi.mock('../../src/main/api/plugin/aiProtocol/adapters', () => ({
  createAdapter: () => ({ complete: mocks.complete })
}))
vi.mock('../../src/main/core/translationManager', () => ({
  default: { getStatus: () => ({ enabled: false }), updateEnabled: vi.fn() }
}))
vi.mock('../../src/main/api/shared/database', () => ({
  default: {
    dbGet: (key: string) => mocks.db.get(key),
    dbPut: (key: string, value: any) => mocks.db.set(key, value)
  }
}))
vi.mock('../../src/main/core/lmdb/lmdbInstance', () => ({
  default: { get: (key: string) => mocks.legacy.get(key) }
}))
import service from '../../src/main/core/provider/builtinProviderService'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settings.enabled = {}
  mocks.settings.params = {}
  mocks.settings.defaultId = {}
  mocks.choices = [{ value: 'current-vision', inputModalities: ['text', 'image'] }]
  mocks.resolve.mockImplementation((reference) =>
    reference === 'current-vision'
      ? {
          provider: { id: 'host-ai' },
          model: { modelId: 'vision', inputModalities: ['text', 'image'] }
        }
      : null
  )
  mocks.complete.mockResolvedValue({ content: '识别结果' })
  mocks.ensure.mockResolvedValue(undefined)
  mocks.cancel.mockResolvedValue(undefined)
  mocks.remove.mockResolvedValue(undefined)
  mocks.status.mockReturnValue({ installed: false, status: 'idle' })
  mocks.legacy.clear()
  mocks.db.clear()
})

describe('built-in provider coordination', () => {
  it('keeps formula and text OCR defaults independent and rejects disabled or unrelated engines', () => {
    mocks.settings.defaultId = { ocr: 'builtin-wechat-ocr' }
    mocks.settings.params['builtin-ai-latex'] = { enabled: true, model: 'current-vision' }
    const saved = service.setFormulaDefault('builtin-ai-latex')
    expect(saved.defaultId).toEqual({ ocr: 'builtin-wechat-ocr', formula: 'builtin-ai-latex' })
    expect(saved.params['builtin-ai-latex']).toEqual({ enabled: true, model: 'current-vision' })
    expect(mocks.db.get('provider-settings')).toBe(saved)
    expect(() => service.setFormulaDefault('builtin-latex')).toThrow('启用')
    expect(() => service.setFormulaDefault('builtin-wechat-ocr')).toThrow('启用')
    expect(saved.defaultId.formula).toBe('builtin-ai-latex')
  })
  it('cancels a host-owned computation when its panel signal aborts', async () => {
    mocks.settings.enabled.translation = ['builtin-google']
    let observed: AbortSignal | undefined
    const worker = vi
      .spyOn(service as any, 'runWorker')
      .mockImplementation(async (_id, _input, signal) => {
        observed = signal
        return new Promise((resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
        )
      })
    const controller = new AbortController()
    const pending = service.invoke(
      'builtin-google',
      { text: 'selected text' },
      undefined,
      'panel-cancellation',
      controller.signal
    )
    const rejected = expect(pending).rejects.toThrow('cancelled')
    controller.abort()
    await rejected
    expect(observed?.aborted).toBe(true)
    worker.mockRestore()
  })

  it('uses saved online languages, defaults Chinese input to Chinese and respects explicit callers', async () => {
    const worker = vi
      .spyOn(service as any, 'runWorker')
      .mockImplementation(async (_id, input) => input)
    try {
      for (const id of ['builtin-google', 'builtin-baidu', 'builtin-youdao', 'builtin-microsoft']) {
        mocks.settings.enabled.translation = [id]
        expect(await service.invoke(id, { text: '中文内容' })).toMatchObject({
          from: 'auto',
          to: 'zh-CN'
        })
        mocks.settings.params[id] = { from: 'ja', to: 'en' }
        expect(await service.invoke(id, { text: 'こんにちは' })).toMatchObject({
          from: 'ja',
          to: 'en'
        })
        expect(
          await service.invoke(id, { text: 'bonjour', from: 'fr', to: 'zh-TW' })
        ).toMatchObject({ from: 'fr', to: 'zh-TW' })
      }
    } finally {
      worker.mockRestore()
    }
  })
  it('only lets the originating page cancel and removes the completed request identity', async () => {
    const owner = new EventEmitter() as any
    const other = new EventEmitter() as any
    await service.setEnabled('builtin-ai-ocr', true)
    mocks.complete.mockImplementationOnce(
      (_input, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )
    const operation = service.invoke(
      'builtin-ai-ocr',
      { image: 'data:image/png;base64,AA==' },
      owner,
      'same-id'
    )
    expect(service.cancel('same-id', other)).toBe(false)
    expect(service.cancel('same-id', owner)).toBe(true)
    await expect(operation).rejects.toThrow('aborted')
    expect(owner.listenerCount('destroyed')).toBe(0)
    expect(
      await service.invoke(
        'builtin-ai-ocr',
        { image: 'data:image/png;base64,AA==' },
        owner,
        'same-id'
      )
    ).toEqual({ text: '识别结果' })
  })
  it('AI OCR uses current host vision configuration and ignores old independent settings', async () => {
    mocks.settings.params['builtin-ai-ocr'] = {
      model: 'obsolete-model',
      systemPrompt: 'obsolete-prompt'
    }
    await service.setEnabled('builtin-ai-ocr', true)
    expect(await service.invoke('builtin-ai-ocr', { image: 'data:image/png;base64,AA==' })).toEqual(
      { text: '识别结果' }
    )
    expect(mocks.resolve).toHaveBeenLastCalledWith('current-vision')
    expect(mocks.complete.mock.calls[0][0]).toMatchObject({
      model: 'vision',
      messages: [
        { role: 'system', content: expect.not.stringContaining('obsolete') },
        { role: 'user', content: [{ type: 'text' }, { type: 'image_url' }] }
      ]
    })
    await service.setEnabled('builtin-ai-ocr', false)
    await expect(
      service.invoke('builtin-ai-ocr', { image: 'data:image/png;base64,AA==' })
    ).rejects.toThrow('启用')
  })

  it('rejects enabling OCR when no host model supports images', async () => {
    mocks.choices = []
    mocks.resolve.mockReturnValue(null)
    await expect(service.setEnabled('builtin-ai-ocr', true)).rejects.toThrow('图片输入')
    expect(mocks.settings.enabled.ocr).toBeUndefined()
  })

  it('serializes removal and re-enabling so deletion cannot erase a newer download', async () => {
    let release!: () => void
    const removing = new Promise<void>((resolve) => {
      release = resolve
    })
    mocks.remove.mockReturnValue(removing)
    const deleted = service.removeModel('builtin-wechat-ocr')
    const enabled = service.setEnabled('builtin-wechat-ocr', true)
    await vi.waitFor(() => expect(mocks.remove).toHaveBeenCalled())
    expect(mocks.ensure).not.toHaveBeenCalled()
    release()
    await Promise.all([deleted, enabled])
    expect(mocks.ensure).toHaveBeenCalledWith('wechat')
    expect(mocks.settings.enabled.ocr).toContain('builtin-wechat-ocr')
  })

  it('copies legacy configuration once while preserving installed-plugin data', () => {
    mocks.settings.enabled.translation = ['plugin:f-provider:baidu']
    mocks.settings.defaultId = { translation: 'plugin:f-provider:baidu' }
    mocks.legacy.set('PLUGIN/f-provider/translate.baidu', {
      value: { appID: 'old-app', appKey: 'old-key' }
    })
    service.init()
    const saved = mocks.db.get('provider-settings')
    expect(saved.enabled.translation).toEqual(['builtin-baidu'])
    expect(saved.defaultId.translation).toBe('builtin-baidu')
    expect(saved.params['builtin-baidu']).toEqual({ appID: 'old-app', appKey: 'old-key' })
    expect(mocks.legacy.get('PLUGIN/f-provider/translate.baidu').value.appKey).toBe('old-key')
    mocks.settings.params['builtin-baidu'].appKey = 'new-key'
    service.init()
    expect(mocks.settings.params['builtin-baidu'].appKey).toBe('new-key')
  })
})
