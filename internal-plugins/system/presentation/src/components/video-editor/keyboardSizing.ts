import type { AnnotationRegion, AnnotationTextStyle } from './types'

export const KEYCAP_REFERENCE_FONT_SIZE = 52

/**
 * 把旧字号与键帽倍率合成为唯一的用户大小值，读取时不修改旧项目。
 * @param style 当前按键外观。
 * @returns 相对标准键帽的倍率。
 */
export function getKeycapScale(style: AnnotationTextStyle): number {
  return Math.max(0.1, (style.fontSize / KEYCAP_REFERENCE_FONT_SIZE) * (style.keycapScale ?? 1))
}

/**
 * 统一缩放文字、键帽和显示框，保留组中心并限制在画面内。
 * @param region 当前按键片段。
 * @param scale 目标键帽倍率。
 * @returns 更新后的片段；不改变内容、时间、图层和其他外观。
 */
export function resizeKeycaps(region: AnnotationRegion, scale: number): AnnotationRegion {
  const nextScale = Math.max(0.25, Math.min(3, scale))
  const ratio = nextScale / getKeycapScale(region.style)
  const width = Math.max(1, Math.min(100, region.size.width * ratio))
  const height = Math.max(1, Math.min(100, region.size.height * ratio))
  // 框与字体一起变化，避免字号增大后又被旧的固定高度缩回原尺寸。
  return {
    ...region,
    size: { width, height },
    position: {
      x: Math.max(0, Math.min(100 - width, region.position.x + (region.size.width - width) / 2)),
      y: Math.max(0, Math.min(100 - height, region.position.y + (region.size.height - height) / 2))
    },
    style: { ...region.style, fontSize: KEYCAP_REFERENCE_FONT_SIZE, keycapScale: nextScale }
  }
}
