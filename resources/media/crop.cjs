/**
 * 将相对框选映射到每个源文件，固定比例在不同尺寸文件中也保持一致。
 * @param {number} width 源宽度。
 * @param {number} height 源高度。
 * @param {object} params 框选和比例。
 * @param {number} unit 编码器要求的像素对齐单位。
 * @returns {object} 有界的像素裁剪矩形。
 * @throws {Error} 相对范围或源尺寸无效时抛出。
 */
function pixelCrop(width, height, params, unit = 1) {
  const r = params.region
  if (
    !r ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(r[key])) ||
    r.x < 0 ||
    r.y < 0 ||
    r.width <= 0 ||
    r.height <= 0 ||
    r.x + r.width > 1.000001 ||
    r.y + r.height > 1.000001 ||
    width < unit ||
    height < unit
  )
    throw new Error('裁剪范围无效')
  let w = r.width * width,
    h = r.height * height
  const ratio = String(params.cropRatio || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (ratio) {
    const value = +ratio[1] / +ratio[2]
    if (!Number.isFinite(value) || value <= 0) throw new Error('裁剪比例无效')
    w = Math.min(w, h * value)
    h = w / value
  }
  // 中心保持在同一相对构图位置；视频输出按偶数对齐，且不越过源边界。
  w = Math.max(unit, Math.floor(w / unit) * unit)
  h = Math.max(unit, Math.floor(h / unit) * unit)
  const left = Math.max(
    0,
    Math.floor(Math.min(width - w, (r.x + r.width / 2) * width - w / 2) / unit) * unit
  )
  const top = Math.max(
    0,
    Math.floor(Math.min(height - h, (r.y + r.height / 2) * height - h / 2) / unit) * unit
  )
  return { left, top, width: w, height: h }
}
module.exports = { pixelCrop }
