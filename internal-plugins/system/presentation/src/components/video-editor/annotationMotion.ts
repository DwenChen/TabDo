import type { AnnotationRegion, AnnotationTextStyle } from './types'

export const ANNOTATION_ANIMATIONS = {
  none: '无',
  fade: '淡入淡出',
  pop: '弹性缩放',
  slide: '浮入浮出',
  wipe: '擦除'
} as const

/**
 * 按媒体时间计算进出场，暂停、拖动时间尺和逐帧导出得到相同结果。
 * @param annotation 片段及其动画选项。
 * @param timeMs 当前媒体时间。
 * @returns 透明度、缩放、相对垂直位移和擦除比例。
 */
export function getAnnotationMotion(annotation: AnnotationRegion, timeMs: number) {
  const style = annotation.style
  const duration = Math.max(
    1,
    Math.min(
      Number.isFinite(style.animationDurationMs) ? style.animationDurationMs! : 280,
      (annotation.endMs - annotation.startMs) / 2
    )
  )
  const incoming = Math.max(0, Math.min(1, (timeMs - annotation.startMs) / duration))
  const outgoing = Math.max(0, Math.min(1, (annotation.endMs - timeMs) / duration))
  const result = { opacity: 1, scale: 1, y: 0, reveal: 1 }
  /**
   * 合成一个阶段；弹性只发生在进入阶段，离场保持单调。
   * @param effect 当前阶段效果。
   * @param progress 当前阶段可见比例。
   * @param entering 是否进入阶段。
   * @returns 无返回值；更新本帧几何。
   */
  function apply(
    effect: AnnotationTextStyle['enterAnimation'],
    progress: number,
    entering: boolean
  ): void {
    const eased = 1 - Math.pow(1 - progress, 3)
    if (!effect || effect === 'none') return
    if (effect !== 'wipe') result.opacity *= eased
    if (effect === 'slide') result.y += (1 - eased) * (entering ? 0.35 : -0.25)
    if (effect === 'pop') {
      const spring = entering
        ? 1 + 2.70158 * Math.pow(progress - 1, 3) + 1.70158 * Math.pow(progress - 1, 2)
        : eased
      result.scale *= 0.72 + 0.28 * spring
    }
    if (effect === 'wipe') result.reveal *= eased
  }
  apply(style.enterAnimation ?? 'none', incoming, true)
  apply(style.exitAnimation ?? 'none', outgoing, false)
  return result
}
