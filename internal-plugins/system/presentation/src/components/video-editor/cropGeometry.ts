import type { CropRegion } from './types'

export type CropHandle = 'move' | 'draw' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
/**
 * 将裁剪坐标限制在可用范围。
 * @param value 待限制的数值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 限制后的数值。
 */
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/**
 * 根据归一化位移移动、框选或缩放裁剪区，限制最小尺寸和素材边界。
 * @param crop 拖动开始时的裁剪区域。
 * @param handle 移动、框选或八个边角手柄。
 * @param dx 相对素材宽度的指针位移。
 * @param dy 相对素材高度的指针位移。
 * @param ratio 锁定的归一化宽高比，空值表示自由裁剪。
 * @param origin 框选起点。
 * @returns 不反转、不超出素材的裁剪区域。
 */
export function transformCrop(
  crop: CropRegion,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio?: number,
  origin = { x: crop.x, y: crop.y }
): CropRegion {
  if (handle === 'move')
    return {
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height)
    }
  const draw = handle === 'draw'
  const west = draw ? dx < 0 : handle.includes('w')
  const north = draw ? dy < 0 : handle.includes('n')
  const anchorX = draw ? origin.x : west ? crop.x + crop.width : crop.x
  const anchorY = draw ? origin.y : north ? crop.y + crop.height : crop.y
  let width = draw
    ? Math.abs(dx)
    : clamp(crop.width + (west ? -dx : handle.includes('e') ? dx : 0), 0.02, 1)
  let height = draw
    ? Math.abs(dy)
    : clamp(crop.height + (north ? -dy : handle.includes('s') ? dy : 0), 0.02, 1)
  const maxWidth = west ? anchorX : 1 - anchorX
  const maxHeight = north ? anchorY : 1 - anchorY
  if (ratio && ratio > 0) {
    if (handle === 'n' || handle === 's' || (draw && height * ratio > width)) width = height * ratio
    else height = width / ratio
    const scale = Math.min(
      1,
      maxWidth / Math.max(0.001, width),
      maxHeight / Math.max(0.001, height)
    )
    width *= scale
    height *= scale
  }
  width = clamp(width, Math.min(0.02, maxWidth), maxWidth)
  height = clamp(height, Math.min(0.02, maxHeight), maxHeight)
  return {
    x: west ? anchorX - width : anchorX,
    y: north ? anchorY - height : anchorY,
    width,
    height
  }
}
