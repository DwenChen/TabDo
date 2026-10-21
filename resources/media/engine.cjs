const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs/promises')

/**
 * 校验有界数值，拒绝无效参数而不把字符串拼接进媒体表达式。
 * @param {unknown} value 输入值。
 * @param {number} fallback 空值时默认值。
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 有效数值。
 * @throws {Error} 数值越界时抛出。
 */
function number(value, fallback, min = 0, max = 16384) {
  const result = value === '' || value == null ? fallback : Number(value)
  if (!Number.isFinite(result) || result < min || result > max)
    throw new Error(`参数须在 ${min}–${max} 之间`)
  return result
}
/**
 * 把像素或百分比转换成有界整数尺寸。
 * @param {unknown} value 用户尺寸。
 * @param {number} original 原尺寸。
 * @returns {number|undefined} 目标尺寸，未填写时自动计算。
 * @throws {Error} 尺寸非法时抛出。
 */
function dimension(value, original) {
  if (value === '' || value == null) return undefined
  const text = String(value).trim()
  return Math.round(
    text.endsWith('%')
      ? (original * number(text.slice(0, -1), 100, 1, 1000)) / 100
      : number(text, original, 1, 16384)
  )
}
/**
 * 限制解码与合成画布，避免超大尺寸耗尽内存。
 * @param {number} width 宽度。
 * @param {number} height 高度。
 * @returns {void} 无返回值。
 * @throws {Error} 画布超限时抛出。
 */
function canvasSize(width, height) {
  if (!width || !height || width * height > 64_000_000 || width > 32768 || height > 32768)
    throw new Error('画布超过 6400 万像素或最大边长限制')
}
/**
 * 按次运行所属 FFmpeg，取消仅结束此子进程，等待关闭后才结算。
 * @param {string[]} args 已校验的媒体参数。
 * @param {AbortSignal} signal 本任务取消信号。
 * @param {boolean} probe 是否允许探测的非零退出码。
 * @returns {Promise<string>} 有界的诊断输出。
 * @throws {Error} 执行失败或取消时抛出。
 */
function ffmpeg(args, signal, probe = false) {
  if (signal.aborted) return Promise.reject(new Error('处理已取消'))
  const executable = require('./dependencies.cjs')('ffmpeg-static').replace(
    /app\.asar([\\/])/,
    'app.asar.unpacked$1'
  )
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-hide_banner', '-nostdin', '-n', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let diagnostic = '',
      failure
    /**
     * 中止本次编码器，不按进程名清理其他应用。
     * @returns {void} 无返回值。
     */
    const cancel = () => child.kill()
    signal.addEventListener('abort', cancel, { once: true })
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + String(chunk)).slice(-16000)
    })
    child.once('error', (error) => {
      failure = error
    })
    child.once('close', (code) => {
      signal.removeEventListener('abort', cancel)
      if (signal.aborted) reject(new Error('处理已取消'))
      else if (failure) reject(failure)
      else if (code && !probe) reject(new Error(diagnostic.slice(-1800) || `编码器退出 ${code}`))
      else resolve(diagnostic)
    })
    if (signal.aborted) cancel()
  })
}
/**
 * 通过引擎读取视频元数据，不保留媒体流。
 * @param {string} file 本地媒体文件。
 * @param {AbortSignal} signal 取消信号。
 * @returns {Promise<object>} 时长、尺寸、帧率和音轨状态。
 * @throws {Error} 文件没有可识别的视频流时抛出。
 */
async function videoInfo(file, signal) {
  const text = await ffmpeg(['-i', file], signal, true)
  const duration = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/),
    video = text.match(/Video:\s*([^,]+).*?\b(\d{2,5})x(\d{2,5})\b/)
  if (!video || !duration) throw new Error('文件没有可识别的视频流或时长')
  return {
    width: +video[2],
    height: +video[3],
    codec: video[1],
    audio: /Audio:/.test(text),
    duration: +duration[1] * 3600 + +duration[2] * 60 + +duration[3],
    fps: Number(text.match(/(\d+(?:\.\d+)?) fps/)?.[1] || 30)
  }
}
/**
 * 以排他硬链接发布完整文件，遇到同名自动追加序号，始终保留源文件。
 * @param {string} source 本次暂存文件或目录。
 * @param {string} directory 用户输出目录。
 * @param {string} name 建议输出名称。
 * @param {boolean} folder 是否发布帧目录。
 * @returns {Promise<string>} 实际发布路径。
 * @throws {Error} 输出失败时抛出，不覆盖任何既有文件。
 */
async function publish(source, directory, name, folder = false) {
  const parsed = path.parse(name)
  for (let i = 0; i < 10000; i++) {
    const target = path.join(directory, i ? `${parsed.name} (${i})${parsed.ext}` : name)
    try {
      if (folder) {
        // 先排他创建目录，再逐个发布自有帧；异常只移除本次新建目录。
        await fs.mkdir(target)
        try {
          for (const entry of await fs.readdir(source))
            await publishFile(path.join(source, entry), path.join(target, entry))
        } catch (error) {
          await fs.rm(target, { recursive: true, force: true })
          throw error
        }
      } else await publishFile(source, target)
      return target
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
  throw new Error('同名输出过多，请选择其他目录')
}
/**
 * 同卷优先硬链接；不支持硬链接的输出文件系统使用排他复制，始终拒绝覆盖。
 * @param {string} source 完整暂存文件。
 * @param {string} target 本次发布路径。
 * @returns {Promise<void>} 发布完成后的 Promise。
 * @throws {Error} 输出失败或目标已存在时抛出。
 */
async function publishFile(source, target) {
  try {
    await fs.link(source, target)
  } catch (error) {
    if (!['EXDEV', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP', 'EPERM'].includes(error.code)) throw error
    await fs.copyFile(source, target, require('node:fs').constants.COPYFILE_EXCL)
  }
}
module.exports = { number, dimension, canvasSize, ffmpeg, videoInfo, publish }
