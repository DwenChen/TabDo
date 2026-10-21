import { net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { getTabDoRoot } from '../appData/appDataPaths'

export type DownloadableEngine = 'wechat' | 'latex'
export interface ModelState {
  status: 'idle' | 'downloading' | 'ready' | 'error'
  installed: boolean
  percent?: number
  error?: string
}
const RELEASE = 'https://github.com/kaineooo/f-provider/releases/download/v1.1.1/'
const ARCHIVES = {
  wechat: [
    {
      file: 'native-win.zip',
      digest: 'd11d4a5d41a3154371a8126955803283f3784e6fb4613101e972b1afa6e1f84b'
    }
  ],
  latex: [
    {
      file: 'latex-ort-win.zip',
      digest: '4e9571a2b8cdacd05110e8c9e174f379af6d5a589d20bd6cf3fa05f985f05476'
    },
    {
      file: 'latex-models.zip',
      digest: '17bf075ba4ef65c29e105bafbc9c11d6796954e6bf9d19003404d03f3c3f468c'
    }
  ]
}
const REQUIRED = {
  wechat: [
    'index.js',
    'build/Release/wechat_ocr.node',
    'wco_data/WeChatOCR.exe',
    'wco_data/mmmojo_64.dll'
  ],
  latex: [
    'onnxruntime-node/package.json',
    'models/encoder.onnx',
    'models/decoder.onnx',
    'models/image_resizer.onnx',
    'models/tokenizer.json'
  ]
}

/**
 * 返回内置模型的私有数据目录，遵循 E2E 与免安装数据隔离。
 * @returns 模型数据根目录。
 */
export function getBuiltinModelsRoot(): string {
  return path.join(getTabDoRoot(), 'builtin-providers')
}

/**
 * 校验模型清单中的每个必需文件存在且非空。
 * @param engine 引擎标识。
 * @param directory 待检查的引擎目录。
 * @returns 所有必需文件是否存在。
 */
export function hasModelFiles(
  engine: DownloadableEngine,
  directory = path.join(getBuiltinModelsRoot(), engine)
): boolean {
  return REQUIRED[engine].every((file) => {
    try {
      const stat = fs.statSync(path.join(directory, file))
      return stat.isFile() && stat.size > 0
    } catch {
      return false
    }
  })
}

/**
 * 校验 ZIP 条目不会越出本次安装目录。
 * @param zip ZIP 归档。
 * @returns 无返回值。
 * @throws 归档含绝对路径、父目录逃逸或符号链接时抛出。
 */
export function validateModelArchive(zip: AdmZip): void {
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replaceAll('\\', '/')
    if (
      /^\/|^[a-z]:/i.test(name) ||
      name.split('/').includes('..') ||
      ((entry.header.attr >>> 16) & 0o170000) === 0o120000
    )
      throw new Error('模型归档包含不安全路径')
  }
}

/** 管理可取消、带校验和的事务式离线引擎安装。 */
export class ModelAssets {
  private states = new Map<DownloadableEngine, ModelState>()
  private jobs = new Map<
    DownloadableEngine,
    { controller: AbortController; promise: Promise<void> }
  >()

  /**
   * 创建资源管理器，允许隔离测试提供带真实摘要的微型归档。
   * @param archives 固定版本资源清单，默认使用经核验的官方 release。
   * @returns 新的模型资源管理器。
   */
  constructor(private archives = ARCHIVES) {}

  /**
   * 读取安装与下载状态，不装载模型。
   * @param engine 引擎标识。
   * @returns 磁盘真实状态及当前任务进度。
   */
  status(engine: DownloadableEngine): ModelState {
    const installed = hasModelFiles(engine)
    return { status: installed ? 'ready' : 'idle', ...this.states.get(engine), installed }
  }

  /**
   * 启用引擎时共享同一安装任务；完整模型不重复下载。
   * @param engine 引擎标识。
   * @returns 安装并校验完成后的 Promise。
   */
  ensure(engine: DownloadableEngine): Promise<void> {
    if (this.jobs.has(engine)) return this.jobs.get(engine)!.promise
    if (hasModelFiles(engine)) return Promise.resolve()
    const controller = new AbortController()
    const promise = this.install(engine, controller.signal).finally(() => this.jobs.delete(engine))
    this.jobs.set(engine, { controller, promise })
    return promise
  }

  /**
   * 中止下载并等待文件清理完成。
   * @param engine 引擎标识。
   * @returns 当前安装任务完全停止后的 Promise。
   */
  async cancel(engine: DownloadableEngine): Promise<void> {
    const job = this.jobs.get(engine)
    job?.controller.abort()
    await job?.promise.catch(() => {})
  }

  /**
   * 删除指定引擎资源，保留全部用户配置及插件。
   * @param engine 引擎标识。
   * @returns 删除结束后的 Promise。
   */
  async remove(engine: DownloadableEngine): Promise<void> {
    await this.cancel(engine)
    // engine 来自固定联合类型，删除范围始终限制在私有模型目录。
    await fs.promises.rm(path.join(getBuiltinModelsRoot(), engine), {
      recursive: true,
      force: true
    })
    this.states.delete(engine)
  }

  /**
   * 下载到独立暂存目录，验证摘要与清单后发布整份资源。
   * @param engine 引擎标识。
   * @param signal 本次安装的取消信号。
   * @returns 安装完成后的 Promise。
   * @throws 下载、校验或发布失败时抛出。
   */
  private async install(engine: DownloadableEngine, signal: AbortSignal): Promise<void> {
    if (process.platform !== 'win32' || process.arch !== 'x64')
      throw new Error('离线引擎当前支持 Windows x64')
    const root = getBuiltinModelsRoot()
    await fs.promises.mkdir(root, { recursive: true })
    const stage = await fs.promises.mkdtemp(path.join(root, '.install-'))
    const timer = setTimeout(() => this.jobs.get(engine)?.controller.abort(), 600_000)
    this.states.set(engine, { status: 'downloading', installed: false, percent: 0 })
    try {
      const archives = this.archives[engine]
      for (const [index, archive] of archives.entries()) {
        signal.throwIfAborted()
        const response = await net.fetch(RELEASE + archive.file, { signal })
        if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
        const destination = path.join(stage, archive.file)
        const handle = await fs.promises.open(destination, 'w')
        const hash = createHash('sha256')
        let received = 0
        const total = Number(response.headers.get('content-length'))
        try {
          for await (const chunk of response.body as any) {
            signal.throwIfAborted()
            hash.update(chunk)
            await handle.writeFile(chunk)
            received += chunk.length
            this.states.set(engine, {
              status: 'downloading',
              installed: false,
              percent: Math.floor(
                ((index + (total ? received / total : 0)) / archives.length) * 100
              )
            })
          }
        } finally {
          await handle.close()
        }
        if (hash.digest('hex') !== archive.digest)
          throw new Error('模型下载校验失败，请重新启用以重试')
        const zip = new AdmZip(destination)
        validateModelArchive(zip)
        zip.extractAllTo(path.join(stage, 'content'), true)
      }
      signal.throwIfAborted()
      const content = path.join(stage, 'content')
      const source = engine === 'wechat' ? path.join(content, 'native') : content
      if (!hasModelFiles(engine, source)) throw new Error('模型归档缺少必需的运行文件')
      // 完整资源发布前再次校验取消状态，避免停用后迟到安装。
      const destination = path.join(root, engine)
      await fs.promises.rm(destination, { recursive: true, force: true })
      signal.throwIfAborted()
      await fs.promises.rename(source, destination)
      this.states.set(engine, { status: 'ready', installed: true, percent: 100 })
    } catch (error) {
      this.states.set(engine, {
        status: signal.aborted ? 'idle' : 'error',
        installed: false,
        error: signal.aborted ? undefined : String(error instanceof Error ? error.message : error)
      })
      throw error
    } finally {
      clearTimeout(timer)
      await fs.promises.rm(stage, { recursive: true, force: true })
    }
  }
}

export default new ModelAssets()
