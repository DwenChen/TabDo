const dependency = require('./dependencies.cjs')
const sharp = dependency('sharp')
const fs = require('node:fs/promises')
const path = require('node:path')
const { number, dimension, canvasSize, ffmpeg } = require('./engine.cjs')
const { pixelCrop } = require('./crop.cjs')
sharp.cache(false)
sharp.concurrency(2)
const formats = ['png', 'jpeg', 'webp', 'tiff', 'avif', 'gif', 'bmp', 'ico', 'svg']

/**
 * 校验并读取图片元数据，自动纠正 EXIF 朝向。
 * @param {string|Buffer} source 图片路径或内存数据。
 * @returns {Promise<object>} 实际显示尺寸与格式。
 * @throws {Error} 图像无法解码或尺寸超限时抛出。
 */
async function imageInfo(source) {
  const meta = await sharp(source, { limitInputPixels: 64_000_000 }).metadata()
  const rotate = [5, 6, 7, 8].includes(meta.orientation)
  const width = rotate ? meta.height : meta.width,
    height = rotate ? meta.width : meta.pageHeight || meta.height
  canvasSize(width, height)
  return { width, height, format: meta.format, pages: meta.pages || 1 }
}
/**
 * 从前端栅格水印读取有界 PNG，不加载任意外部资源。
 * @param {object} params 操作参数。
 * @returns {Buffer} 水印 PNG。
 * @throws {Error} 水印为空或过大时抛出。
 */
function watermark(params) {
  if (
    typeof params.watermark !== 'string' ||
    !params.watermark.startsWith('data:image/png;base64,') ||
    params.watermark.length > 8_000_000
  )
    throw new Error('请选择或填写有效水印')
  return Buffer.from(params.watermark.slice(22), 'base64')
}
/**
 * 生成图片处理结果，只写本次暂存目录。
 * @param {object} item 源文件和尺寸。
 * @param {string} mode 允许的图片操作。
 * @param {object} p 有界操作参数。
 * @param {string} folder 本次暂存目录。
 * @param {AbortSignal} signal 任务取消信号。
 * @returns {Promise<string>} 完整结果的暂存路径。
 * @throws {Error} 参数、编码或取消失败时抛出。
 */
async function transformImage(item, mode, p, folder, signal) {
  let image = sharp(item.decoded || item.path, { limitInputPixels: 64_000_000 }).autoOrient(),
    ext =
      mode === 'convert'
        ? String(p.format)
        : ['watermark', 'corner', 'pad', 'border'].includes(mode)
          ? 'png'
          : item.format
  if (ext === 'jpg') ext = 'jpeg'
  if (!formats.includes(ext)) ext = 'png'
  if (mode === 'resize') {
    const width = dimension(p.width, item.width),
      height = dimension(p.height, item.height)
    if (!width && !height) throw new Error('至少填写宽度或高度')
    canvasSize(
      width || Math.round((item.width * height) / item.height),
      height || Math.round((item.height * width) / item.width)
    )
    image = image.resize(width, height, {
      fit: ['cover', 'contain', 'fill', 'inside', 'outside'].includes(p.fit) ? p.fit : 'inside',
      background: p.background || '#ffffff'
    })
  } else if (mode === 'crop' || mode === 'manual') {
    // 框选以相对坐标传递，批量处理不同尺寸时保留相同构图。
    if (p.region) {
      p = { ...p, ...pixelCrop(item.width, item.height, p) }
    }
    const left = Math.round(number(p.left, 0, 0, item.width - 1)),
      top = Math.round(number(p.top, 0, 0, item.height - 1))
    const width = Math.round(number(p.width, item.width - left, 1, item.width - left)),
      height = Math.round(number(p.height, item.height - top, 1, item.height - top))
    image = image.extract({ left, top, width, height })
  } else if (mode === 'rotate')
    image = image.rotate(number(p.angle, 90, -360, 360), {
      background: p.background || '#00000000'
    })
  else if (mode === 'flip') image = p.direction === 'vertical' ? image.flip() : image.flop()
  else if (mode === 'pad' || mode === 'border') {
    const sides = Object.fromEntries(
      ['top', 'bottom', 'left', 'right'].map((key) => [
        key,
        Math.round(
          number(mode === 'border' ? p.border : p[key], mode === 'border' ? 4 : 20, 0, 4096)
        )
      ])
    )
    canvasSize(item.width + sides.left + sides.right, item.height + sides.top + sides.bottom)
    image = image.extend({ ...sides, background: p.background || '#ffffff' })
  } else if (mode === 'corner') {
    const radius = number(p.radius, 20, 0, Math.min(item.width, item.height) / 2)
    const mask = Buffer.from(
      `<svg width="${item.width}" height="${item.height}"><rect width="100%" height="100%" rx="${radius}" fill="white"/></svg>`
    )
    image = image.ensureAlpha().composite([{ input: mask, blend: 'dest-in' }])
  } else if (mode === 'watermark') {
    let input = watermark(p)
    const meta = await sharp(input).metadata()
    if (meta.width > item.width || meta.height > item.height)
      input = await sharp(input).resize(item.width, item.height, { fit: 'inside' }).png().toBuffer()
    const gravity =
      {
        center: 'centre',
        top: 'north',
        bottom: 'south',
        left: 'west',
        right: 'east',
        'left-top': 'northwest',
        'right-top': 'northeast',
        'left-bottom': 'southwest',
        'right-bottom': 'southeast'
      }[p.position] || 'southeast'
    image = image.composite([{ input, gravity, tile: !!p.tile }])
  } else if (!['compress', 'convert'].includes(mode)) throw new Error('不支持的图片操作')
  if (signal.aborted) throw new Error('处理已取消')
  const target = path.join(folder, 'result.' + ext)
  // 动画压缩与转换保留所有帧，几何操作遵循明确的首帧提示。
  if (item.pages > 1 && ['compress', 'convert'].includes(mode))
    image = sharp(item.path, { animated: true, limitInputPixels: 64_000_000 })
  const quality = Math.round(number(p.quality, 80, 1, 100))
  if (ext === 'svg') {
    const png = await image.png().toBuffer(),
      meta = await sharp(png).metadata()
    await fs.writeFile(
      target,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><image width="100%" height="100%" href="data:image/png;base64,${png.toString('base64')}"/></svg>`
    )
  } else if (ext === 'bmp' || ext === 'ico') {
    const png = path.join(folder, 'decoded.png')
    await image.png().toFile(png)
    await ffmpeg(
      [
        '-i',
        png,
        ...(ext === 'ico' ? ['-vf', 'scale=256:256:force_original_aspect_ratio=decrease'] : []),
        target
      ],
      signal
    )
  } else {
    const palette = mode === 'compress' && ext === 'png'
    /**
     * 以当前质量编码独立管线，PNG 压缩使用调色板。
     * @param {number} q 当前质量。
     * @returns {Promise<Buffer>} 编码字节。
     */
    const encode = (q) =>
      image
        .clone()
        .toFormat(ext, { quality: q, ...(palette ? { palette: true } : {}) })
        .toBuffer()
    let bytes = await encode(quality)
    const max = number(p.maxSize, 0, 0, 1_000_000) * 1024
    if (
      mode === 'compress' &&
      max &&
      bytes.length > max &&
      ['jpeg', 'webp', 'avif', 'png'].includes(ext)
    ) {
      for (let q = quality - 10; q >= 10 && bytes.length > max; q -= 10) bytes = await encode(q)
    }
    if (mode === 'compress' && max && bytes.length > max)
      throw new Error('当前格式和质量下仍超过目标大小，请调整尺寸、格式或大小限制')
    await fs.writeFile(target, bytes)
  }
  return target
}
/**
 * 按队列顺序合并图片、PDF 或 GIF，约束画布和累计帧内存。
 * @param {object[]} items 源图片队列。
 * @param {string} mode 合并类型。
 * @param {object} p 合并参数。
 * @param {string} folder 本次暂存目录。
 * @param {AbortSignal} signal 取消信号。
 * @returns {Promise<string>} 完整暂存文件。
 * @throws {Error} 参数、内存、编码或取消失败时抛出。
 */
async function mergeImages(items, mode, p, folder, signal) {
  if (!items.length) throw new Error('请添加图片')
  if (mode === 'pdf') {
    const PDF = dependency('pdfkit'),
      doc = new PDF({ autoFirstPage: false }),
      output = path.join(folder, 'result.pdf')
    const stream = require('node:fs').createWriteStream(output)
    const completed = new Promise((resolve, reject) => {
      stream.once('finish', resolve)
      stream.once('error', reject)
      doc.once('error', reject)
    })
    // 完整结算流的错误，避免退出时留下未处理的拒绝。
    completed.catch(() => {})
    doc.pipe(stream)
    try {
      for (const item of items) {
        if (signal.aborted) throw new Error('处理已取消')
        const margin = number(p.margin, 20, 0, 500),
          size =
            p.pageSize === 'auto'
              ? [item.width + margin * 2, item.height + margin * 2]
              : ['A4', 'A3', 'LETTER'].includes(p.pageSize)
                ? p.pageSize
                : 'A4'
        doc.addPage({ size, margin: 0 })
        const image = await sharp(item.decoded || item.path)
          .autoOrient()
          .png()
          .toBuffer()
        doc.image(image, margin, margin, {
          fit: [doc.page.width - 2 * margin, doc.page.height - 2 * margin],
          align: 'center',
          valign: 'center'
        })
      }
      doc.end()
      await completed
    } catch (error) {
      doc.destroy()
      stream.destroy()
      throw error
    }
    return output
  }
  const width = Math.round(number(p.width, 800, 1, 16384)),
    height = Math.round(number(p.height, 600, 1, 16384)),
    gap = Math.round(number(p.gap, 8, 0, 1000)),
    margin = Math.round(number(p.margin, 12, 0, 1000))
  if (mode === 'gif') {
    if (width * height * items.length > 32_000_000)
      throw new Error('动图累计超过 3200 万像素，请降低尺寸或图片数量')
    const frames = []
    for (const item of items) {
      if (signal.aborted) throw new Error('处理已取消')
      frames.push(
        await sharp(item.decoded || item.path)
          .autoOrient()
          .resize(width, height, { fit: 'contain', background: p.background || '#ffffff' })
          .ensureAlpha()
          .raw()
          .toBuffer()
      )
    }
    const output = path.join(folder, 'result.gif')
    require('./gif-win32-x64.node').gifGenerateForUTools(
      output,
      width,
      height,
      Math.round(number(p.delay, 300, 20, 60000)),
      ...frames
    )
    return output
  }
  const horizontal = p.direction === 'horizontal',
    layers = []
  let offset = margin,
    cross = horizontal ? height : width
  for (const item of items) {
    if (signal.aborted) throw new Error('处理已取消')
    const image = await sharp(item.decoded || item.path)
      .autoOrient()
      .resize(
        horizontal ? undefined : Math.max(1, cross - 2 * margin),
        horizontal ? Math.max(1, cross - 2 * margin) : undefined,
        { fit: 'inside', withoutEnlargement: true }
      )
      .png()
      .toBuffer({ resolveWithObject: true })
    layers.push({
      input: image.data,
      left: horizontal ? offset : Math.round((cross - image.info.width) / 2),
      top: horizontal ? Math.round((cross - image.info.height) / 2) : offset
    })
    offset += (horizontal ? image.info.width : image.info.height) + gap
    canvasSize(horizontal ? offset : cross, horizontal ? cross : offset)
  }
  offset = offset - gap + margin
  const output = path.join(folder, 'result.png')
  await sharp({
    create: {
      width: horizontal ? offset : cross,
      height: horizontal ? cross : offset,
      channels: 4,
      background: p.background || '#ffffff'
    }
  })
    .composite(layers)
    .png()
    .toFile(output)
  return output
}
module.exports = { imageInfo, transformImage, mergeImages, watermark }
