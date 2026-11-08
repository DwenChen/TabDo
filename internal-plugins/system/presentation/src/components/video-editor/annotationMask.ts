import type { AnnotationTextStyle } from './types'

/**
 * 构造输出像素中的统一遮罩，手绘笔画使用圆头；调用者负责裁剪对象边界。
 * @param style 遮罩形状、笔宽和归一化笔画。
 * @param width 对象宽度。
 * @param height 对象高度。
 * @param radius 矩形圆角。
 * @returns 可供画布填充或裁剪的遮罩路径。
 */
export function getAnnotationMaskPath(
  style: AnnotationTextStyle,
  width: number,
  height: number,
  radius: number
): Path2D {
  const path = new Path2D()
  if (style.maskShape === 'ellipse')
    path.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
  else if (style.maskShape === 'brush') {
    const r = Math.max(1, ((style.maskBrushSize ?? 16) * Math.min(width, height)) / 200)
    // 将笔画细分为相交圆与四边形，填充和裁剪都使用同一实心轮廓。
    for (const stroke of style.maskStrokes ?? []) {
      const points = stroke
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .slice(0, 2000)
      for (let i = 0; i < points.length; i++) {
        const x = (points[i].x * width) / 100,
          y = (points[i].y * height) / 100
        path.moveTo(x + r, y)
        path.arc(x, y, r, 0, Math.PI * 2)
        if (!i) continue
        const a = points[i - 1],
          ax = (a.x * width) / 100,
          ay = (a.y * height) / 100
        const angle = Math.atan2(y - ay, x - ax),
          dx = Math.sin(angle) * r,
          dy = -Math.cos(angle) * r
        path.moveTo(ax + dx, ay + dy)
        path.lineTo(x + dx, y + dy)
        path.lineTo(x - dx, y - dy)
        path.lineTo(ax - dx, ay - dy)
        path.closePath()
      }
    }
  } else path.roundRect(0, 0, width, height, Math.min(radius, width / 2, height / 2))
  return path
}

/**
 * 将统一画布遮罩编码为 DOM 的 alpha 遮罩，避免预览与导出形状分叉。
 * @param style 遮罩设置。
 * @param width 当前对象宽度。
 * @param height 当前对象高度。
 * @param radius 当前圆角。
 * @returns 可用于 mask-image 的数据 URL。
 */
export function getAnnotationMaskUrl(
  style: AnnotationTextStyle,
  width: number,
  height: number,
  radius: number
): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width))
  canvas.height = Math.max(1, Math.ceil(height))
  const ctx = canvas.getContext('2d')!
  ctx.fill(getAnnotationMaskPath(style, canvas.width, canvas.height, radius))
  const url = canvas.toDataURL()
  canvas.width = 0
  canvas.height = 0
  return url
}
