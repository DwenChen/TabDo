import { app, nativeImage, net, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_CAPABILITIES, findBuiltinCapability } from '../../../shared/builtinProviders'
import { normalizeAiModelCapabilities } from '../../../shared/aiProviderShared'
import type { ProviderType } from '../../../shared/providerShared'
import providerManager from './providerManager'
import modelAssets, { getBuiltinModelsRoot } from './modelAssets'
import aiProviderService from '../aiProviderService'
import { createAdapter } from '../../api/plugin/aiProtocol/adapters'
import translationManager from '../translationManager'
import databaseAPI from '../../api/shared/database'
import lmdbInstance from '../lmdb/lmdbInstance'

/** 内置能力的输入，不接受任意方法名或执行路径。 */
export interface BuiltinInput {
  text?: string
  image?: string
  from?: string
  to?: string
  lang?: string
}
const active = new Map<
  string,
  { owner?: WebContents; controller: AbortController; promise: Promise<unknown>; id: string }
>()
const mutations = new Map<string, Promise<unknown>>()

/**
 * 终止本次进程创建的整个进程树，等待关闭后再发布结果。
 * @param child 当前请求的独立进程。
 * @returns 无返回值。
 */
function stopWorker(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    killer.once('error', () => child.kill())
  } else child.kill()
}

/** 将内置能力连接到统一 provider 与工具调用，不保留常驻模型。 */
class BuiltinProviderService {
  /**
   * 注册内置翻译和 OCR，公式与上传通道保留为工具专用配置。
   * @returns 无返回值。
   */
  init(): void {
    for (const capability of BUILTIN_CAPABILITIES) {
      if (
        capability.id === 'builtin-bergamot' ||
        !['translation', 'ocr'].includes(capability.group)
      )
        continue
      providerManager.registerBuiltinProvider({
        name: capability.id.slice('builtin-'.length),
        type: capability.group as ProviderType,
        label: capability.label,
        description: capability.description,
        isReady: () =>
          !capability.engine || modelAssets.status(capability.engine as 'wechat').installed,
        invoke: (input, signal) => this.invoke(capability.id, input, undefined, undefined, signal)
      })
    }
    this.migrateExistingConfiguration()
    // 重启后只恢复缺失资源的下载，不预先装载模型或原生进程。
    for (const capability of BUILTIN_CAPABILITIES) {
      if (capability.engine && capability.engine !== 'bergamot' && this.isEnabled(capability.id)) {
        void modelAssets
          .ensure(capability.engine)
          .catch((error) => console.warn('[BuiltinProvider] 恢复模型下载失败:', error.message))
      }
    }
    app.on('before-quit', () => {
      for (const request of active.values()) request.controller.abort()
      void modelAssets.cancel('wechat')
      void modelAssets.cancel('latex')
    })
  }

  /**
   * 复制原提供商配置到内置能力，保留原插件与数据并避免重复覆盖。
   * @returns 无返回值。
   */
  private migrateExistingConfiguration(): void {
    if (databaseAPI.dbGet('builtin-providers-migrated-v1')) return
    const aliases: Record<string, string> = {
      ocr: 'wechat-ocr',
      baidu: 'baidu',
      google: 'google',
      youdao: 'youdao',
      microsoft: 'microsoft',
      'ai-translation': 'ai-translation',
      'ai-ocr': 'ai-ocr'
    }
    const settings = providerManager.getSettings()
    for (const [key, name] of Object.entries(aliases)) {
      const previous = `plugin:f-provider:${key}`
      const id = 'builtin-' + name
      const type = ['ocr', 'ai-ocr'].includes(key) ? 'ocr' : 'translation'
      if (settings.enabled[type]?.includes(previous))
        settings.enabled[type] = [
          ...new Set(settings.enabled[type]!.map((value) => (value === previous ? id : value)))
        ]
      if (settings.defaultId[type] === previous) settings.defaultId[type] = id
      const stored = lmdbInstance.get(
        'PLUGIN/f-provider/' + (type === 'translation' ? 'translate.' : 'ocr.') + key
      )?.value
      if (stored && typeof stored === 'object' && !settings.params[id] && key !== 'ai-ocr')
        settings.params[id] = { ...stored }
    }
    const formula = lmdbInstance.get('PLUGIN/f-provider/ocr.ai-latex-ocr')?.value
    if (formula && typeof formula === 'object' && !settings.params['builtin-ai-latex'])
      settings.params['builtin-ai-latex'] = { ...formula }
    if (translationManager.getStatus().enabled)
      settings.enabled.translation = [
        ...new Set([...(settings.enabled.translation || []), 'builtin-bergamot'])
      ]
    databaseAPI.dbPut('provider-settings', settings)
    databaseAPI.dbPut('builtin-providers-migrated-v1', true)
  }

  /**
   * 返回完整的能力配置与磁盘状态，不包含 AI 连接凭据。
   * @returns 设置页使用的状态快照。
   */
  getState(): Record<string, unknown> {
    return {
      capabilities: BUILTIN_CAPABILITIES,
      engines: {
        wechat: modelAssets.status('wechat'),
        latex: modelAssets.status('latex'),
        bergamot: translationManager.getStatus()
      },
      models: aiProviderService.getModelChoices()
    }
  }

  /**
   * 检查能力是否已由用户启用，扩展项的开关存于同一提供商文档。
   * @param id 能力标识。
   * @returns 是否启用。
   */
  isEnabled(id: string): boolean {
    const capability = findBuiltinCapability(id)
    if (capability?.group === 'translation' || capability?.group === 'ocr') {
      return providerManager.getSettings().enabled[capability.group]?.includes(id) === true
    }
    return providerManager.getParams(id).enabled === true
  }

  /**
   * 串行处理同一能力的启停，自动安装离线资源且不装载推理会话。
   * @param id 内置能力标识。
   * @param enabled 目标开关状态。
   * @returns 最新提供商设置。
   * @throws 未知能力或必需配置缺失时抛出。
   */
  async setEnabled(
    id: string,
    enabled: boolean
  ): Promise<ReturnType<typeof providerManager.getSettings>> {
    return this.mutate(id, () => this.applyEnabled(id, enabled))
  }

  /**
   * 将同一能力的启停与删除排成一个事务队列。
   * @param id 能力标识。
   * @param action 需要串行执行的完整操作。
   * @returns 操作结果。
   */
  private async mutate<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = mutations.get(id) || Promise.resolve()
    const operation = previous.catch(() => {}).then(action)
    mutations.set(id, operation)
    try {
      return await operation
    } finally {
      if (mutations.get(id) === operation) mutations.delete(id)
    }
  }

  /**
   * 在已持有能力事务队列时应用启停状态。
   * @param id 能力标识。
   * @param enabled 新启用状态。
   * @returns 最新提供商配置。
   * @throws 未知能力或配置缺失时抛出。
   */
  private async applyEnabled(
    id: string,
    enabled: boolean
  ): Promise<ReturnType<typeof providerManager.getSettings>> {
    const capability = findBuiltinCapability(id)
    if (!capability) throw new Error('未知内置能力')
    if (enabled) this.validateConfiguration(id)
    if (!enabled)
      for (const request of active.values()) if (request.id === id) request.controller.abort()
    if (capability.engine === 'bergamot') translationManager.updateEnabled(enabled)
    else if (capability.engine) {
      if (enabled)
        void modelAssets
          .ensure(capability.engine)
          .catch((error) => console.warn('[BuiltinProvider] 模型安装失败:', error.message))
      else await modelAssets.cancel(capability.engine)
    }
    if (capability.group === 'translation' || capability.group === 'ocr')
      return providerManager.setEnabled(id, enabled)
    return providerManager.setParams(id, { ...providerManager.getParams(id), enabled })
  }

  /**
   * 删除离线资源前停用并结束关联请求，保留配置和安装插件。
   * @param id 内置离线能力标识。
   * @returns 删除完成后的 Promise。
   * @throws 目标不是离线引擎时抛出。
   */
  async removeModel(id: string): Promise<void> {
    const capability = findBuiltinCapability(id)
    if (!capability?.engine) throw new Error('该能力没有离线资源')
    const engine = capability.engine
    return this.mutate(id, async () => {
      await this.applyEnabled(id, false)
      await Promise.allSettled(
        [...active.values()]
          .filter((request) => request.id === id)
          .map((request) => request.promise)
      )
      if (engine === 'bergamot') await translationManager.removeResources()
      else await modelAssets.remove(engine)
    })
  }

  /**
   * 校验即将启用的服务必需配置，AI OCR 仅使用宿主 AI 配置。
   * @param id 内置能力标识。
   * @returns 无返回值。
   * @throws 凭据或合适的 AI 模型缺失时抛出。
   */
  private validateConfiguration(id: string): void {
    const capability = findBuiltinCapability(id)
    if (
      capability?.engine &&
      capability.engine !== 'bergamot' &&
      (process.platform !== 'win32' || process.arch !== 'x64')
    )
      throw new Error('离线引擎当前支持 Windows x64')
    const params = providerManager.getParams(id)
    if (id === 'builtin-baidu' && (!params.appID || !params.appKey))
      throw new Error('请先保存百度翻译 AppID 和 AppKey')
    if (id === 'builtin-youdao' && (!params.appKey || !params.appSecret))
      throw new Error('请先保存有道翻译 AppKey 和 AppSecret')
    if (id.startsWith('builtin-ai-')) this.resolveAiModel(id)
  }

  /**
   * 解析可用 AI 模型；OCR 自动使用宿主首个支持图片输入的模型。
   * @param id AI 能力标识。
   * @returns 带真实连接配置的模型，仅保留在宿主内。
   * @throws 无可用模型或所选模型不支持图片时抛出。
   */
  private resolveAiModel(
    id: string
  ): NonNullable<ReturnType<typeof aiProviderService.resolveModel>> {
    const vision = id !== 'builtin-ai-translation'
    const params = providerManager.getParams(id)
    const selected = id === 'builtin-ai-ocr' ? undefined : String(params.model || '') || undefined
    const reference =
      selected ||
      (vision
        ? aiProviderService
            .getModelChoices()
            .find((model) => model.inputModalities.includes('image'))?.value
        : undefined)
    const resolved = aiProviderService.resolveModel(reference)
    if (
      !resolved ||
      (vision && !normalizeAiModelCapabilities(resolved.model).inputModalities.includes('image'))
    )
      throw new Error(
        '请在“提供商 → AI”配置并启用支持' + (vision ? '图片输入' : '文本输入') + '的模型'
      )
    return resolved
  }

  /**
   * 以受控超时和所有者身份执行一次能力，结束后删除全部请求引用。
   * @param id 内置能力标识。
   * @param input 文本或图像输入。
   * @param owner 发起操作的工具页面，可选。
   * @param requestId 页面生成的取消标识，可选。
   * @param signal 宿主调用方的取消信号，可选。
   * @returns 归一化翻译、OCR 或公式结果。
   * @throws 未启用、未就绪、取消或执行失败时抛出。
   */
  async invoke(
    id: string,
    input: BuiltinInput,
    owner?: WebContents,
    requestId: string = crypto.randomUUID(),
    signal?: AbortSignal
  ): Promise<any> {
    signal?.throwIfAborted()
    if (!findBuiltinCapability(id) || !this.isEnabled(id))
      throw new Error('请先在“提供商”页启用该能力')
    if (active.has(requestId)) throw new Error('请求标识已在使用')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    /**
     * 页面销毁时中止其所属调用。
     * @returns 无返回值。
     */
    const destroyed = (): void => controller.abort()
    owner?.once('destroyed', destroyed)
    signal?.addEventListener('abort', destroyed, { once: true })
    const promise = this.execute(id, input, controller.signal)
    active.set(requestId, { owner, controller, promise, id })
    try {
      return await promise
    } finally {
      clearTimeout(timer)
      owner?.removeListener('destroyed', destroyed)
      signal?.removeEventListener('abort', destroyed)
      active.delete(requestId)
    }
  }

  /**
   * 仅允许原页面取消自己的调用，避免跨工具会话互相中断。
   * @param requestId 调用标识。
   * @param owner 调用取消接口的页面。
   * @returns 是否找到并取消原调用。
   */
  cancel(requestId: string, owner: WebContents): boolean {
    const request = active.get(requestId)
    if (request?.owner !== owner) return false
    request.controller.abort()
    return true
  }

  /**
   * 路由一次计算；AI 直接复用宿主适配器，原生与在线翻译进入独立进程。
   * @param id 已启用的能力。
   * @param input 用户输入。
   * @param signal 本次取消信号。
   * @returns 能力结果。
   * @throws 输入、模型或计算错误时抛出。
   */
  private async execute(id: string, input: BuiltinInput, signal: AbortSignal): Promise<any> {
    signal.throwIfAborted()
    const capability = findBuiltinCapability(id)!
    if (
      capability.engine &&
      capability.engine !== 'bergamot' &&
      !modelAssets.status(capability.engine).installed
    )
      throw new Error('离线资源尚未就绪，请查看提供商页的下载状态')
    if (id === 'builtin-bergamot')
      return { text: (await translationManager.translate(input.text || '', signal)) || '' }
    if (capability.group === 'translation') {
      // 显式调用语言优先；未指定时使用当前服务设置，默认始终译为中文。
      const preferences = providerManager.getParams(id)
      input = {
        ...input,
        from: input.from || (typeof preferences.from === 'string' && preferences.from) || 'auto',
        to: input.to || (typeof preferences.to === 'string' && preferences.to) || 'zh-CN'
      }
    }
    if (!id.startsWith('builtin-ai-')) return this.runWorker(id.slice(8), input, signal)
    const resolved = this.resolveAiModel(id)
    const params = providerManager.getParams(id)
    const vision = id !== 'builtin-ai-translation'
    const target = input.to || 'zh-CN'
    const prompt =
      id === 'builtin-ai-ocr'
        ? '识别图片中的全部文字，保留原文换行。只输出识别结果。'
        : String(
            params.systemPrompt ||
              (vision
                ? '将图片中的数学公式转换为 LaTeX，只输出 LaTeX 源码。'
                : '将用户输入从 {from} 翻译成 {to}，只输出译文。')
          )
            .replaceAll('{from}', input.from || '自动检测')
            .replaceAll('{to}', target)
    let image = input.image || ''
    if (vision) {
      if (!image) throw new Error('请提供需要识别的图片')
      if (this.isEnabled('builtin-image-host'))
        image = (await this.runWorker('upload', { image }, signal)) || image
      signal.throwIfAborted()
      if (!/^data:|^https?:/i.test(image)) image = nativeImage.createFromPath(image).toDataURL()
    }
    const response = await createAdapter(resolved.provider, 120_000).complete(
      {
        model: resolved.model.modelId,
        messages: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: vision
              ? [
                  { type: 'text', text: '请识别图片。' },
                  { type: 'image_url', image_url: { url: image } }
                ]
              : input.text || ''
          }
        ]
      },
      signal
    )
    signal.throwIfAborted()
    const text = response.content?.trim()
    if (!text) throw new Error('AI 返回内容为空')
    return {
      text:
        id === 'builtin-ai-latex'
          ? text
              .replace(/^```\w*\s*|\s*```$/g, '')
              .replace(/^\$+|\$+$/g, '')
              .trim()
          : text
    }
  }

  /**
   * 按次启动原生/网络工作进程，关闭整个进程树并清理临时目录后交付结果。
   * @param operation 受控操作标识。
   * @param input 能力输入。
   * @param signal 请求取消信号。
   * @returns 工作进程结果。
   * @throws 进程、输入或计算失败时抛出。
   */
  private async runWorker(
    operation: string,
    input: BuiltinInput,
    signal: AbortSignal
  ): Promise<any> {
    const root = getBuiltinModelsRoot()
    await fs.promises.mkdir(root, { recursive: true })
    const temporary = await fs.promises.mkdtemp(path.join(root, '.request-'))
    try {
      let pixels: { width: number; height: number; bitmap: string } | undefined
      if (operation === 'latex') {
        let image = input.image || ''
        if (/^https?:/i.test(image)) {
          const response = await net.fetch(image, { signal })
          if (!response.ok) throw new Error('无法读取图片')
          image =
            'data:image/png;base64,' + Buffer.from(await response.arrayBuffer()).toString('base64')
        }
        const decoded = /^data:/i.test(image)
          ? nativeImage.createFromDataURL(image)
          : nativeImage.createFromPath(image)
        if (decoded.isEmpty()) throw new Error('无法解码图片')
        pixels = { ...decoded.getSize(), bitmap: decoded.toBitmap().toString('base64') }
      }
      signal.throwIfAborted()
      return await new Promise((resolve, reject) => {
        const workerPath = path.join(
          app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
          'resources/provider-worker.cjs'
        )
        const child = spawn(process.execPath, [workerPath], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'ignore', 'ipc']
        })
        let result: unknown
        let failure: Error | undefined
        /**
         * 取消本次工作进程及其后代。
         * @returns 无返回值。
         */
        const stop = (): void => {
          failure = new Error('操作已取消')
          stopWorker(child)
        }
        signal.addEventListener('abort', stop, { once: true })
        child.once('message', (message: { result?: unknown; error?: string }) => {
          result = message.result
          if (message.error) failure = new Error(message.error)
          stopWorker(child)
        })
        child.once('error', (error) => {
          failure = error
          stopWorker(child)
        })
        child.once('close', () => {
          signal.removeEventListener('abort', stop)
          if (signal.aborted) failure = new Error('操作已取消')
          if (failure) reject(failure)
          else if (result === undefined) reject(new Error('能力进程未返回结果'))
          else resolve(result)
        })
        const settings = Object.fromEntries(
          ['baidu', 'google', 'youdao', 'microsoft'].map((key) => [
            'translate.' + key,
            providerManager.getParams('builtin-' + key)
          ])
        )
        settings['ocr.image-host'] = {
          enabled: this.isEnabled('builtin-image-host'),
          type: 'img-scdn'
        }
        child.send(
          { operation, input, settings, dataRoot: root, tempRoot: temporary, pixels },
          (error) => {
            if (error) {
              failure = error
              stopWorker(child)
            }
          }
        )
        if (signal.aborted) stop()
      })
    } finally {
      await fs.promises.rm(temporary, { recursive: true, force: true })
    }
  }
}

export default new BuiltinProviderService()
