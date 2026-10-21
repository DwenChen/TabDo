const fs = require('node:fs/promises')
const path = require('node:path')
const { imageInfo, transformImage, mergeImages } = require('./media/images.cjs')
const { videoInfo, transformVideo, mergeVideos } = require('./media/videos.cjs')
const { publish, ffmpeg, canvasSize } = require('./media/engine.cjs')
const controller = new AbortController()
let started = false
let stageId = 0
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
    const base = { path: file, name: path.basename(file), size: (await fs.stat(file)).size }
    try {
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
      const thumbnail =
        request.media === 'image' && request.action === 'inspect'
          ? 'data:image/png;base64,' +
            (
              await require('./media/dependencies.cjs')('sharp')(decoded)
                .rotate()
                .resize(request.preview ? 1000 : 144, request.preview ? 800 : 96, { fit: 'inside' })
                .png()
                .toBuffer()
            ).toString('base64')
          : ''
      result.push({
        ...base,
        ...info,
        thumbnail,
        ...(request.action === 'process' ? { decoded } : {})
      })
    } catch (error) {
      result.push({ ...base, error: error.message })
    }
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
      message.request.action === 'inspect'
        ? await inspect(message.request)
        : await execute(message.request)
    process.send?.({ type: 'result', items })
  } catch (error) {
    process.send?.({ type: 'error', message: error.message })
  } finally {
    process.disconnect?.()
  }
})
process.once('disconnect', () => controller.abort())
