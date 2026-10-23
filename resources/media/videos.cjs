const fs = require('node:fs/promises')
const path = require('node:path')
const { number, ffmpeg, videoInfo } = require('./engine.cjs')
const { watermark } = require('./images.cjs')
const sharp = require('./dependencies.cjs')('sharp')
const { pixelCrop } = require('./crop.cjs')

/**
 * 将任意有界倍速拆为兼容的 atempo 链。
 * @param {number} value 播放倍速。
 * @returns {string} 音频滤镜。
 */
function tempo(value) {
  const factors = []
  while (value > 2) {
    factors.push(2)
    value /= 2
  }
  while (value < 0.5) {
    factors.push(0.5)
    value *= 2
  }
  factors.push(value)
  return factors.map((x) => `atempo=${x}`).join(',')
}
/**
 * 校验九宫格位置并产生受控 overlay 坐标。
 * @param {string} position 用户选择的位置。
 * @returns {string} 仅包含固定表达式的位置参数。
 */
function overlayPosition(position) {
  return (
    {
      center: '(W-w)/2:(H-h)/2',
      top: '(W-w)/2:20',
      bottom: '(W-w)/2:H-h-20',
      left: '20:(H-h)/2',
      right: 'W-w-20:(H-h)/2',
      'left-top': '20:20',
      'right-top': 'W-w-20:20',
      'left-bottom': '20:H-h-20',
      'right-bottom': 'W-w-20:H-h-20'
    }[position] || 'W-w-20:H-h-20'
  )
}
/**
 * 校验图片或音频辅助输入，禁止把 URL 交给编码器。
 * @param {string} file 用户选择的绝对路径。
 * @param {RegExp} allowed 支持的扩展名。
 * @returns {Promise<string>} 本地普通文件路径。
 * @throws {Error} 路径、类型或文件无效时抛出。
 */
async function auxiliary(file, allowed) {
  if (
    typeof file !== 'string' ||
    !path.isAbsolute(file) ||
    !allowed.test(file) ||
    /[\r\n\0]/.test(file)
  )
    throw new Error('请选择有效的辅助文件')
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('辅助输入必须是普通文件')
  return file
}
/**
 * 执行有界视频变换，参数由功能类型构造，不接收任意命令。
 * @param {object} item 源视频和已读取的元数据。
 * @param {string} mode 处理类型。
 * @param {object} p 参数。
 * @param {string} folder 本次暂存目录。
 * @param {AbortSignal} signal 取消信号。
 * @param {boolean} preview 是否仅渲染当前操作的一帧效果图。
 * @returns {Promise<string>} 完整结果或帧目录。
 * @throws {Error} 参数、编码或取消失败时抛出。
 */
async function transformVideo(item, mode, p, folder, signal, preview = false) {
  // 静态预览复用真实视频滤镜，只输出一帧且限制显示尺寸。
  if (preview) {
    if (['crop', 'resize', 'rotate', 'flip', 'watermark'].includes(mode)) {
      // 几何与水印继续复用下方的生产参数构造。
    } else {
      const output = path.join(folder, 'preview.png')
      const time = number(p.previewTime ?? p.start, 0, 0, Math.max(0, item.duration - 0.01))
      await ffmpeg(
        ['-ss', String(time), '-i', item.path, '-frames:v', '1', '-vf', 'scale=960:-2', output],
        signal
      )
      return output
    }
  }
  const args = [],
    filters = []
  let ext = 'mp4',
    audio = item.audio
  if (['cut', 'gif', 'frame', 'audio'].includes(mode)) {
    const start = number(p.start, 0, 0, item.duration)
    if (start) args.push('-ss', String(start))
  }
  if (preview)
    args.push('-ss', String(number(p.previewTime, 0, 0, Math.max(0, item.duration - 0.01))))
  args.push('-i', item.path)
  if (['cut', 'gif', 'audio'].includes(mode) && p.duration !== '' && p.duration != null)
    args.push('-t', String(number(p.duration, item.duration, 0.01, item.duration)))
  if (mode === 'compress')
    args.push(
      '-c:v',
      p.codec === 'hevc' ? 'libx265' : 'libx264',
      '-crf',
      String(Math.round(number(p.crf, 25, 0, 51))),
      '-preset',
      'veryfast'
    )
  else if (mode === 'cut') args.push('-c:v', 'libx264', '-preset', 'veryfast')
  else if (mode === 'crop') {
    if (p.region) {
      const rect = pixelCrop(item.width, item.height, p, 2)
      filters.push(`crop=${rect.width}:${rect.height}:${rect.left}:${rect.top}`)
    } else {
      const ratio = String(p.ratio || '16:9').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
      if (!ratio) throw new Error('请填写宽高比，例如 16:9')
      const value = number(ratio[1], 16, 0.01, 1000) / number(ratio[2], 9, 0.01, 1000)
      filters.push(
        item.width / item.height > value
          ? `crop=trunc(ih*${value}/2)*2:ih`
          : `crop=iw:trunc(iw/${value}/2)*2`
      )
    }
  } else if (mode === 'convert') {
    ext = ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'wmv'].includes(p.format) ? p.format : 'mp4'
    args.push(
      '-c:v',
      ext === 'webm' ? 'libvpx-vp9' : ext === 'wmv' ? 'wmv2' : ext === 'avi' ? 'mpeg4' : 'libx264'
    )
  } else if (mode === 'resize') {
    const width = p.width === '' ? -2 : Math.round(number(p.width, -2, 2, 8192) / 2) * 2,
      height = p.height === '' ? -2 : Math.round(number(p.height, -2, 2, 8192) / 2) * 2
    if (width === -2 && height === -2) throw new Error('至少填写宽度或高度')
    if (width > 0 && height > 0 && p.fit !== 'fill') {
      const background = /^#[\da-f]{6}$/i.test(p.background || '')
        ? '0x' + p.background.slice(1)
        : 'white'
      if (p.fit === 'cover')
        filters.push(
          `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
        )
      else if (p.fit === 'contain')
        filters.push(
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${background}`
        )
      else filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`)
    } else filters.push(`scale=${width}:${height}`)
  } else if (mode === 'speed') {
    const speed = number(p.speed, 2, 0.1, 16)
    filters.push(`setpts=PTS/${speed}`)
    if (audio && p.speedAudio !== false) args.push('-af', tempo(speed))
  } else if (mode === 'flip') filters.push(p.direction === 'vertical' ? 'vflip' : 'hflip')
  else if (mode === 'rotate') {
    const angle = number(p.angle, 90, -360, 360)
    filters.push(
      angle === 90
        ? 'transpose=1'
        : angle === -90 || angle === 270
          ? 'transpose=2'
          : angle === 180
            ? 'hflip,vflip'
            : `rotate=${angle}*PI/180:ow=rotw(${angle}*PI/180):oh=roth(${angle}*PI/180)`
    )
  } else if (mode === 'gif') {
    ext = p.format === 'webp' ? 'webp' : 'gif'
    audio = false
    const fps = number(p.fps, 10, 1, 60),
      width = Math.round(number(p.width, Math.min(item.width, 800), 2, 4096))
    if (ext === 'gif')
      args.push(
        '-filter_complex',
        `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen[c];[b][c]paletteuse`,
        '-loop',
        p.loop === false ? '-1' : '0'
      )
    else
      args.push(
        '-vf',
        `fps=${fps},scale=${width}:-1`,
        '-c:v',
        'libwebp_anim',
        '-loop',
        p.loop === false ? '1' : '0'
      )
  } else if (mode === 'watermark') {
    let bytes = watermark(p)
    if (p.tile)
      bytes = await sharp({
        create: { width: item.width, height: item.height, channels: 4, background: '#00000000' }
      })
        .composite([{ input: bytes, tile: true }])
        .png()
        .toBuffer()
    else
      bytes = await sharp(bytes)
        .resize(item.width, item.height, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
    const file = path.join(folder, 'watermark.png')
    await fs.writeFile(file, bytes)
    args.push(
      '-i',
      file,
      '-filter_complex',
      `[0:v][1:v]overlay=${p.tile ? '0:0' : overlayPosition(p.position)}[v]`,
      '-map',
      '[v]',
      '-map',
      '0:a?'
    )
  } else if (mode === 'thumbnail') {
    if (!/\.(mp4|mov)$/i.test(item.path)) throw new Error('封面嵌入仅支持 MP4 / MOV')
    const cover = await auxiliary(p.cover, /\.(png|jpe?g)$/i)
    args.push(
      '-i',
      cover,
      '-map',
      '0',
      '-map',
      '1:v:0',
      '-c',
      'copy',
      '-disposition:v:1',
      'attached_pic'
    )
  } else if (mode === 'audio') {
    if (p.audioMode === 'mute') {
      audio = false
      args.push('-c:v', 'copy')
    } else if (p.audioMode === 'volume') {
      if (!audio) throw new Error('视频没有音轨')
      args.push('-c:v', 'copy', '-af', `volume=${number(p.volume, 1.5, 0, 10)}`)
    } else if (p.audioMode === 'replace') {
      const music = await auxiliary(p.audioFile, /\.(mp3|wav|aac|m4a|flac|ogg)$/i)
      args.push('-i', music, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-shortest')
      audio = true
    } else {
      if (!audio) throw new Error('视频没有可提取的音轨')
      ext = ['mp3', 'aac', 'wav', 'flac', 'm4a'].includes(p.format) ? p.format : 'mp3'
      args.push(
        '-vn',
        '-c:a',
        { mp3: 'libmp3lame', aac: 'aac', wav: 'pcm_s16le', flac: 'flac', m4a: 'aac' }[ext]
      )
      const output = path.join(folder, 'result.' + ext)
      await ffmpeg([...args, output], signal)
      return output
    }
  } else if (mode === 'frame') {
    const output = path.join(folder, 'frames')
    await fs.mkdir(output)
    args.push(
      '-vf',
      `fps=1/${number(p.interval, 1, 0.01, 86400)}${p.width ? ',scale=' + Math.round(number(p.width, 800, 2, 4096)) + ':-1' : ''}`,
      '-frames:v',
      String(Math.round(number(p.count, 10, 1, 500))),
      path.join(output, 'frame_%04d.jpg')
    )
    await ffmpeg(args, signal)
    return output
  } else throw new Error('不支持的视频操作')
  if (filters.length) args.push('-vf', filters.join(','))
  if (preview) {
    const output = path.join(folder, 'preview.png')
    // 预览沿用几何和 overlay 滤镜，移除音轨输出以免额外编码。
    const mapAudio = args.indexOf('0:a?')
    if (mapAudio >= 0) args.splice(mapAudio - 1, 2)
    await ffmpeg([...args, '-frames:v', '1', '-an', output], signal)
    return output
  }
  if (!['gif', 'thumbnail'].includes(mode) && !args.includes('-c:v'))
    args.push('-c:v', 'libx264', '-preset', 'veryfast')
  if (!audio) args.push('-an')
  else if (mode !== 'thumbnail')
    args.push('-c:a', ext === 'webm' ? 'libvorbis' : ext === 'wmv' ? 'wmav2' : 'aac')
  if (['mp4', 'mov'].includes(ext)) args.push('-movflags', '+faststart')
  if (!['gif', 'thumbnail'].includes(mode) && !args.includes('copy'))
    args.push('-pix_fmt', 'yuv420p')
  const output = path.join(folder, 'result.' + ext)
  await ffmpeg([...args, output], signal)
  return output
}
/**
 * 顺序合并视频，默认统一尺寸、帧率与缺失音轨，兼容不同来源。
 * @param {object[]} items 有序视频队列。
 * @param {object} p 合并选项。
 * @param {string} folder 暂存目录。
 * @param {AbortSignal} signal 取消信号。
 * @returns {Promise<string>} 合并后的完整 MP4。
 * @throws {Error} 来源不足、参数不一致或编码失败时抛出。
 */
async function mergeVideos(items, p, folder, signal) {
  if (items.length < 2 || items.length > 50) throw new Error('视频合并需 2–50 个文件')
  const output = path.join(folder, 'result.mp4')
  if (p.reencode === false) {
    if (
      items.some(
        (x) =>
          x.width !== items[0].width ||
          x.height !== items[0].height ||
          x.codec !== items[0].codec ||
          x.audio !== items[0].audio ||
          Math.abs(x.fps - items[0].fps) > 0.01
      )
    )
      throw new Error('快速合并要求尺寸、编码、音轨和帧率一致；请启用重新编码')
    const list = path.join(folder, 'concat.txt')
    await fs.writeFile(
      list,
      items.map((x) => `file '${x.path.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`).join('\n')
    )
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output], signal)
  } else {
    const args = items.flatMap((x) => ['-i', x.path]),
      filters = [],
      width = Math.floor(items[0].width / 2) * 2,
      height = Math.floor(items[0].height / 2) * 2
    const audio = items.some((x) => x.audio)
    items.forEach((item, i) => {
      filters.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,setpts=PTS-STARTPTS[v${i}]`
      )
      if (audio)
        filters.push(
          item.audio
            ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`
            : `anullsrc=r=48000:cl=stereo,atrim=duration=${item.duration},asetpts=PTS-STARTPTS[a${i}]`
        )
    })
    filters.push(
      items.map((_, i) => `[v${i}]${audio ? `[a${i}]` : ''}`).join('') +
        `concat=n=${items.length}:v=1:a=${audio ? 1 : 0}[v]${audio ? '[a]' : ''}`
    )
    args.push(
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[v]',
      ...(audio ? ['-map', '[a]', '-c:a', 'aac'] : []),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      output
    )
    await ffmpeg(args, signal)
  }
  return output
}
module.exports = { transformVideo, mergeVideos, tempo, videoInfo }
