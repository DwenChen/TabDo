import { app, webContents } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const jobs = new Map<string, { controller: AbortController; closed: Promise<void> }>()
const modes = {
  image: [
    'compress',
    'convert',
    'resize',
    'watermark',
    'corner',
    'border',
    'pad',
    'crop',
    'rotate',
    'flip',
    'merge',
    'pdf',
    'gif',
    'manual'
  ],
  video: [
    'compress',
    'cut',
    'crop',
    'convert',
    'gif',
    'watermark',
    'resize',
    'thumbnail',
    'speed',
    'flip',
    'rotate',
    'merge',
    'audio',
    'frame'
  ]
}
interface Request {
  id: string
  media: 'image' | 'video'
  action: 'inspect' | 'process'
  files: string[]
  mode?: string
  params?: Record<string, unknown>
  output?: string
  outputMode?: 'source' | 'custom'
  image?: string
  preview?: boolean
}

/**
 * 运行独立媒体任务，仅接受工具的有界选项，等待进程退出后释放暂存资源。
 * @param owner 发起页面身份。
 * @param request 媒体来源与处理选项。
 * @param progress 向所属页面发布进度。
 * @returns 完成的文件行或处理结果。
 * @throws 参数、读取、编码、取消或超时失败时抛出。
 */
export async function runMedia(
  owner: number,
  request: Request,
  progress: (value: object) => void
): Promise<object[]> {
  if (
    !request ||
    !/^[\w-]{1,80}$/.test(request.id) ||
    !['image', 'video'].includes(request.media) ||
    !['inspect', 'process'].includes(request.action) ||
    !Array.isArray(request.files) ||
    request.files.length > 1000 ||
    request.files.some(
      (file) =>
        typeof file !== 'string' ||
        (file !== '@clipboard' && (!path.isAbsolute(file) || /[\r\n\0]/.test(file)))
    )
  )
    throw new Error('媒体任务参数无效')
  if (
    request.action === 'process' &&
    (!modes[request.media].includes(request.mode || '') ||
      (request.output && !path.isAbsolute(request.output)) ||
      (request.outputMode && !['source', 'custom'].includes(request.outputMode)))
  )
    throw new Error('处理类型或输出目录无效')
  const key = `${owner}:${request.id}`
  if (jobs.has(key) || jobs.size >= 4) throw new Error('请等待当前媒体任务结束')
  // 在首次异步操作前登记，取消和真正退出也覆盖目录准备阶段。
  const controller = new AbortController()
  let finishJob!: () => void
  const done = new Promise<void>((resolve) => {
    finishJob = resolve
  })
  jobs.set(key, { controller, closed: done })
  let folder = '',
    child: ChildProcess | undefined,
    childClosed: Promise<void> | undefined
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const outputStages = new Map<string, Promise<string>>()
  const sender = webContents.fromId(owner)
  /**
   * 取消本请求的整个准备、编码和发布链。
   * @returns 无返回值。
   */
  const cancel = (): void => {
    controller.abort()
  }
  /**
   * 先请求编码器停止，兜底仅回收当前仍存活的工作进程树。
   * @returns 无返回值。
   */
  const stopChild = (): void => {
    const current = child
    if (!current || current.exitCode !== null || current.signalCode !== null) return
    if (current.connected) current.send({ type: 'cancel' }, () => {})
    if (killTimer) return
    killTimer = setTimeout(() => {
      if (current.exitCode !== null || current.signalCode !== null) return
      if (process.platform === 'win32' && current.pid)
        execFile(
          'taskkill.exe',
          ['/PID', String(current.pid), '/T', '/F'],
          { windowsHide: true },
          () => {}
        )
      else current.kill('SIGKILL')
    }, 1800)
  }
  sender?.once('destroyed', cancel)
  controller.signal.addEventListener('abort', stopChild, { once: true })
  const deadline = setTimeout(cancel, request.action === 'inspect' ? 120000 : 600000)
  try {
    const output =
      request.action === 'process'
        ? request.outputMode === 'source'
          ? app.getPath('downloads')
          : request.output || app.getPath('downloads')
        : app.getPath('temp')
    const temporaryBase = request.outputMode === 'source' ? app.getPath('temp') : output
    if (!(await fs.stat(temporaryBase)).isDirectory()) throw new Error('输出目录不存在')
    folder = await fs.mkdtemp(path.join(temporaryBase, '.tabdo-media-'))
    if (controller.signal.aborted) throw new Error('媒体任务已取消')
    const files = request.files.filter((file) => file !== '@clipboard')
    let clipboardPath = ''
    if (request.image) {
      if (
        request.media !== 'image' ||
        request.image.length > 40 * 1024 * 1024 ||
        !/^data:image\/(png|jpe?g|webp|bmp|gif);base64,/i.test(request.image)
      )
        throw new Error('匹配图片无效或超过 30MB')
      const file = path.join(folder, '剪贴板图片.png')
      await fs.writeFile(
        file,
        Buffer.from(request.image.slice(request.image.indexOf(',') + 1), 'base64')
      )
      files.push(file)
      clipboardPath = file
    }
    if (controller.signal.aborted) throw new Error('媒体任务已取消')
    const worker = path.join(
      app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
      'resources/media-worker.cjs'
    )
    child = spawn(process.execPath, [worker], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TABDO_MEDIA_APP_ROOT: app.getAppPath() },
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    })
    const current = child
    childClosed = new Promise<void>((resolve) => current.once('close', () => resolve()))
    /**
     * 为源目录输出创建宿主持有的暂存区，跨磁盘也先完整编码再发布。
     * @param value 工作进程请求的源文件与回复标识。
     * @returns 暂存区回复完成后的 Promise。
     */
    const prepareOutput = async (value: { id?: number; source?: string }): Promise<void> => {
      try {
        const source = value.source
        if (
          request.outputMode !== 'source' ||
          typeof source !== 'string' ||
          !path.isAbsolute(source) ||
          !files.some(
            (input) =>
              source === input ||
              (!path.relative(input, source).startsWith('..') &&
                path.relative(input, source) !== '' &&
                !path.isAbsolute(path.relative(input, source)))
          )
        )
          throw new Error('输出来源无效')
        if (controller.signal.aborted) throw new Error('处理已取消')
        const directory = source === clipboardPath ? output : path.dirname(source)
        let preparing = outputStages.get(directory)
        if (!preparing) {
          preparing = fs.mkdtemp(path.join(directory, '.tabdo-media-'))
          outputStages.set(directory, preparing)
        }
        const staged = await preparing
        if (current.connected)
          current.send(
            { type: 'output-stage', id: value.id, folder: staged, output: directory },
            () => {}
          )
      } catch (error) {
        if (current.connected)
          current.send(
            {
              type: 'output-stage',
              id: value.id,
              error: error instanceof Error ? error.message : String(error)
            },
            () => {}
          )
      }
    }
    let result: object[] | undefined,
      failure = '',
      diagnostic = ''
    /**
     * 把临时匹配图路径转换为会话标识，不向页面暴露已清理的暂存路径。
     * @param item 文件或结果记录。
     * @returns 可供当前页面使用的纯数据。
     */
    const normalize = (item: Record<string, unknown>): Record<string, unknown> => {
      const value = { ...item }
      for (const key of ['path', 'source'])
        if (typeof value[key] === 'string' && value[key].startsWith(folder + path.sep))
          value[key] = '@clipboard'
      return value
    }
    current.stderr?.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk).slice(-3000)
    })
    current.once('error', (error) => {
      failure = error.message
    })
    current.on(
      'message',
      (value: {
        type?: string
        id?: number
        source?: string
        items?: Record<string, unknown>[]
        item?: Record<string, unknown>
        message?: string
      }) => {
        if (value.type === 'output-stage') void prepareOutput(value)
        else if (value.type === 'result') result = value.items?.map(normalize)
        else if (value.type === 'error') failure = value.message || '处理失败'
        else if (!controller.signal.aborted)
          progress(value.item ? { ...value, item: normalize(value.item) } : value)
      }
    )
    current.send(
      {
        type: 'start',
        request: { ...request, files, folder, output, clipboardPath, image: undefined }
      },
      (error) => {
        if (error) {
          failure = error.message
          cancel()
        }
      }
    )
    if (controller.signal.aborted) stopChild()
    await childClosed
    if (controller.signal.aborted) throw new Error('媒体任务已取消或超时，已完成的输出保留')
    if (failure || !result) throw new Error(failure || diagnostic || '媒体进程意外结束')
    return result
  } finally {
    // 只有进程链结束后才清理本次 mkdtemp 目录，永不清理用户输出目录或源文件。
    stopChild()
    if (childClosed) await childClosed
    clearTimeout(deadline)
    clearTimeout(killTimer)
    sender?.removeListener('destroyed', cancel)
    controller.signal.removeEventListener('abort', stopChild)
    try {
      // 目录准备即使晚于取消返回，也由宿主等待并清理，不留跨盘临时目录。
      const staged = await Promise.allSettled(outputStages.values())
      const cleanup = await Promise.allSettled(
        [
          folder,
          ...staged
            .filter(
              (entry): entry is PromiseFulfilledResult<string> => entry.status === 'fulfilled'
            )
            .map((entry) => entry.value)
        ]
          .filter(Boolean)
          .map((directory) => fs.rm(directory, { recursive: true, force: true, maxRetries: 3 }))
      )
      const failure = cleanup.find(
        (entry): entry is PromiseRejectedResult => entry.status === 'rejected'
      )
      if (failure) console.warn('[Media] 本次临时目录清理失败:', failure.reason)
    } finally {
      jobs.delete(key)
      finishJob()
    }
  }
}
/**
 * 取消所属页面的某个任务，不跨会话结束其他工作。
 * @param owner 页面身份。
 * @param id 请求身份。
 * @returns 无返回值。
 */
export function cancelMedia(owner: number, id: string): void {
  jobs.get(`${owner}:${id}`)?.controller.abort()
}
/**
 * 真正退出宿主时等待全部媒体进程和暂存资源清理。
 * @returns 清理完成后的 Promise。
 */
export async function stopMedia(): Promise<void> {
  const active = [...jobs.values()]
  for (const job of active) job.controller.abort()
  await Promise.all(active.map((job) => job.closed))
}
