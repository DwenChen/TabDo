const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn, execFile } = require('node:child_process')
const { imageInfo, transformImage, mergeImages } = require('./media/images.cjs')
const { videoInfo, transformVideo, mergeVideos } = require('./media/videos.cjs')
const { publish, ffmpeg, canvasSize } = require('./media/engine.cjs')
const controller = new AbortController()
let started = false
let stageId = 0
/**
 * 等待 IPC 写入完成，避免大批缩略图尚未送达就断开通道。
 * @param {object} value 发送给所属父进程的消息。
 * @returns {Promise<void>} 消息发送后的 Promise。
 */
function send(value) {
  return new Promise((resolve, reject) => {
    if (!process.connected) return reject(new Error('媒体会话已结束'))
    process.send(value, (error) => (error ? reject(error) : resolve()))
  })
}
/**
 * 在独立的短期进程读取单个图片，原生解码崩溃仅影响该行。
 * @param {string} file 本地图片。
 * @param {object} request 所属读取任务。
 * @returns {Promise<object>} 元数据、缩略图或该行错误。
 * @throws {Error} 暂存目录创建失败时抛出。
 */
async function inspectIsolated(file, request) {
  const folder = await fs.mkdtemp(path.join(request.folder, 'inspect-'))
  const child = spawn(process.execPath, [__filename], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  })
  let result,
    diagnostic = ''
  // 子进程与当前任务共同结束，超时只回收当前解码器。
  /**
   * 只结束本次解码器及它创建的转码子进程。
   * @returns {void} 无返回值。
   */
  const cancel = () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    if (process.platform === 'win32' && child.pid)
      execFile(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true },
        () => {}
      )
    else child.kill('SIGKILL')
  }
  controller.signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, 20000)
  child.stderr.on('data', (data) => {
    diagnostic = (diagnostic + data).slice(-500)
  })
  child.on('message', (value) => {
    if (value.type === 'result') result = value.items?.[0]
    if (value.type === 'error') diagnostic = value.message
  })
  child.on('error', (error) => {
    diagnostic = error.message
  })
  const closed = new Promise((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal }))
  )
  child.send(
    {
      type: 'start',
      request: {
        ...request,
        action: 'inspect',
        includeDecoded: request.action !== 'inspect',
        folder,
        files: [file],
        isolated: true
      }
    },
    (error) => {
      if (error) {
        diagnostic = error.message
        cancel()
      }
    }
  )
  if (controller.signal.aborted) cancel()
  const exit = await closed
  clearTimeout(timer)
  controller.signal.removeEventListener('abort', cancel)
  return (
    result || {
      path: file,
      name: path.basename(file),
      size: 0,
      error: `此图片读取失败（退出 ${exit.code ?? exit.signal ?? '未知'}）${diagnostic ? '：' + diagnostic : '，请检查图片格式或重新添加'}`
    }
  )
}
/**
 * 在自有临时目录生成单张效果图；不会发布文件到用户目录。
 * @param {object} request 当前选中文件与操作参数。
 * @returns {Promise<object[]>} 有界效果图与真实结果尺寸。
 * @throws {Error} 读取或参数无效时抛出。
 */
async function renderPreview(request) {
  const partial = request.media === 'image' && request.mode === 'merge' && request.files.length > 12
  request = {
    ...request,
    files: request.files.slice(0, request.mode === 'merge' && request.media === 'image' ? 12 : 1)
  }
  const items = await inspect(request),
    item = items[0]
  if (!item || item.error) throw new Error(item?.error || '请选择可预览的文件')
  const p = request.params || {}
  const aggregate = ['merge', 'pdf', 'gif'].includes(request.mode) && request.media === 'image'
  let file
  // 合并预览约束队列与尺寸；PDF 显示首页，动图显示第一帧。
  if (aggregate && request.mode === 'merge') {
    file = await mergeImages(items.slice(0, 12), 'merge', p, request.folder, controller.signal)
  } else if (request.media === 'image') {
    file = aggregate
      ? item.decoded || item.path
      : await transformImage(item, request.mode, p, request.folder, controller.signal)
  } else {
    file = await transformVideo(item, request.mode, p, request.folder, controller.signal, true)
  }
  const sharp = require('./media/dependencies.cjs')('sharp')
  const info = await imageInfo(file)
  const thumbnail =
    'data:image/png;base64,' +
    (
      await sharp(file)
        .autoOrient()
        .resize(1000, 700, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
    ).toString('base64')
  return [{ ...info, thumbnail, partial }]
}
/**
 * 向宿主申请源目录下的自有暂存区，宿主负责取消和退出后的最终清理。
 * @param {string} source 本批次首个源文件。
 * @returns {Promise<{folder:string,output:string}>} 同卷暂存区与发布目录。
 */
function sourceStage(source) {
  return new Promise((resolve, reject) => {
    const id = ++stageId
    /**
     * 结算目录准备并撤销本次消息和取消监听。
     * @param {object} value 宿主回复。
     * @returns {void} 无返回值。
     */
    const complete = (value) => {
      if (value.type !== 'output-stage' || value.id !== id) return
      process.removeListener('message', complete)
      controller.signal.removeEventListener('abort', cancel)
      if (value.error) reject(new Error(value.error))
      else resolve({ folder: value.folder, output: value.output })
    }
    /**
     * 取消等待，拒绝编码到未登记的目录。
     * @returns {void} 无返回值。
     */
    const cancel = () => complete({ type: 'output-stage', id, error: '处理已取消' })
    process.on('message', complete)
    controller.signal.addEventListener('abort', cancel, { once: true })
    if (controller.signal.aborted) cancel()
    else
      process.send({ type: 'output-stage', id, source }, (error) => {
        if (error) complete({ type: 'output-stage', id, error: error.message })
      })
  })
}
/**
 * 检查源文件类型并读取轻量元数据；目录扫描跳过符号链接并限制数量。
 * @param {object} request 图片或视频来源。
 * @returns {Promise<object[]>} 可用文件与逐项错误。
 * @throws {Error} 批次数量或目录深度超限时抛出。
 */
async function inspect(request) {
  const files = [],
    result = [],
    extensions =
      request.media === 'image'
        ? /\.(png|jpe?g|webp|gif|svg|tiff?|avif|heic|heif|bmp|ico)$/i
        : /\.(mp4|mkv|mov|webm|avi|flv|wmv|m4v|mpeg|mpg|ts)$/i
  /**
   * 递归收集用户选中的媒体，不跟随链接或无界目录树。
   * @param {string} file 绝对路径。
   * @param {number} depth 当前目录层数。
   * @returns {Promise<void>} 收集结束后的 Promise。
   */
  async function collect(file, depth) {
    if (controller.signal.aborted) throw new Error('处理已取消')
    if (files.length >= 1000 || depth > 20) throw new Error('最多读取 1000 个文件和 20 层目录')
    if (!path.isAbsolute(file) || /[\r\n\0]/.test(file)) return
    const stat = await fs.lstat(file).catch(() => null)
    if (!stat || stat.isSymbolicLink()) return
    if (stat.isDirectory() && request.media === 'image')
      for (const entry of await fs.readdir(file)) await collect(path.join(file, entry), depth + 1)
    else if (stat.isFile() && extensions.test(file) && !files.includes(file)) files.push(file)
  }
  for (const file of request.files) await collect(file, 0)
  for (const file of files) {
    if (controller.signal.aborted) throw new Error('处理已取消')
    if (request.media === 'image' && !request.isolated) {
      const item = await inspectIsolated(file, request)
      result.push(item)
      if (request.action === 'inspect') await send({ type: 'inspected', item })
      continue
    }
    const base = { path: file, name: path.basename(file), size: 0 }
    try {
      base.size = (await fs.stat(file)).size
      let decoded = file
      if (request.media === 'image' && /\.(bmp|ico|heic|heif)$/i.test(file)) {
        // Sharp 未编入对应解码器时，使用所属编码器读取首帧，仍先检查尺寸。
        try {
          await imageInfo(file)
        } catch {
          const diagnostic = await ffmpeg(['-i', file], controller.signal, true)
          const match = diagnostic.match(/Video:.*?\b(\d{1,5})x(\d{1,5})\b/)
          if (!match) throw new Error('当前引擎无法解码此图片格式')
          canvasSize(+match[1], +match[2])
          decoded = path.join(request.folder, 'decoded-' + result.length + '.png')
          await ffmpeg(['-i', file, '-frames:v', '1', decoded], controller.signal)
        }
      }
      const info =
        request.media === 'image'
          ? await imageInfo(decoded)
          : await videoInfo(file, controller.signal)
      let thumbnail =
        request.media === 'image' && request.action === 'inspect' && !request.includeDecoded
          ? 'data:image/png;base64,' +
            (
              await require('./media/dependencies.cjs')('sharp')(decoded)
                .rotate()
                .resize(request.preview ? 1000 : 144, request.preview ? 800 : 96, { fit: 'inside' })
                .png()
                .toBuffer()
            ).toString('base64')
          : ''
      if (request.media === 'video' && request.action === 'inspect') {
        const frame = path.join(request.folder, `poster-${result.length}.png`)
        await ffmpeg(
          ['-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', frame],
          controller.signal
        )
        thumbnail = 'data:image/png;base64,' + (await fs.readFile(frame)).toString('base64')
      }
      result.push({
        ...base,
        ...info,
        thumbnail,
        ...(request.action !== 'inspect' || request.includeDecoded ? { decoded } : {})
      })
    } catch (error) {
      result.push({ ...base, error: error.message })
    }
    if (request.action === 'inspect' && !request.isolated)
      await send({ type: 'inspected', item: result.at(-1) })
  }
  return result
}
/**
 * 顺序处理批次，逐项发布完整结果；失败行不会阻断其余文件。
 * @param {object} request 操作、参数和来源。
 * @returns {Promise<object[]>} 成功输出和错误记录。
 * @throws {Error} 批次、取消或合并错误时抛出。
 */
async function execute(request) {
  const items = await inspect(request),
    p = request.params || {},
    result = [],
    merge =
      ['merge', 'pdf', 'gif'].includes(request.mode) &&
      (request.media === 'image' || request.mode === 'merge')
  if (!items.length) throw new Error('没有可处理的文件')
  if (merge && items.some((x) => x.error)) throw new Error('请移除无法读取的文件后再合并')
  const batches = merge ? [items] : items.map((x) => [x])
  for (let i = 0; i < batches.length; i++) {
    if (controller.signal.aborted) throw new Error('处理已取消，已完成的输出已保留')
    const group = batches[i],
      item = group[0]
    let folder = ''
    process.send?.({ type: 'progress', index: i, total: batches.length, name: item.name })
    try {
      if (item.error) throw new Error(item.error)
      const stage =
        request.outputMode === 'source'
          ? await sourceStage(item.path)
          : { folder: request.folder, output: request.output }
      folder = path.join(stage.folder, String(i))
      await fs.mkdir(folder)
      const staged =
        request.media === 'image'
          ? merge
            ? await mergeImages(group, request.mode, p, folder, controller.signal)
            : await transformImage(item, request.mode, p, folder, controller.signal)
          : merge
            ? await mergeVideos(group, p, folder, controller.signal)
            : await transformVideo(item, request.mode, p, folder, controller.signal)
      if (controller.signal.aborted) throw new Error('处理已取消')
      const isDirectory = (await fs.stat(staged)).isDirectory(),
        name = merge ? '合并结果' : path.parse(item.name).name
      const output = await publish(
        staged,
        stage.output,
        `${name}-${request.mode}${isDirectory ? '' : path.extname(staged)}`,
        isDirectory
      )
      const value = {
        source: item.path,
        path: output,
        name: path.basename(output),
        size: isDirectory ? 0 : (await fs.stat(output)).size
      }
      result.push(value)
      process.send?.({ type: 'item', item: value })
    } catch (error) {
      if (controller.signal.aborted) throw error
      const value = { source: item.path, error: error.message }
      result.push(value)
      process.send?.({ type: 'item', item: value })
    }
    if (folder) await fs.rm(folder, { recursive: true, force: true })
  }
  return result
}
process.on('message', async (message) => {
  if (message?.type === 'cancel') {
    controller.abort()
    return
  }
  if (message?.type !== 'start' || started) return
  started = true
  try {
    const items =
      message.request.action === 'preview'
        ? await renderPreview(message.request)
        : message.request.action === 'inspect'
          ? await inspect(message.request)
          : await execute(message.request)
    await send({
      type: 'result',
      items: message.request.action === 'inspect' && !message.request.isolated ? [] : items
    })
  } catch (error) {
    if (process.connected) await send({ type: 'error', message: error.message }).catch(() => {})
  } finally {
    process.disconnect?.()
  }
})
process.once('disconnect', () => controller.abort())
