import type { Span } from 'dnd-timeline'
import type { ClipRegion, ZoomRegion } from '../types'

/**
 * 从鼠标落点解析真实可用的缩放区间；短空隙自动缩短，不移动落点或覆盖已有片段。
 * @param timeMs 鼠标或快捷键指定的时间。
 * @param totalMs 时间轴总时长。
 * @param clips 录屏片段及其边界。
 * @param zooms 已有缩放区间。
 * @returns 最长两秒的可用区间；已有缩放、片段外或无有效时长时返回空值。
 */
export function resolveZoomPlacement(timeMs: number, totalMs: number, clips: ClipRegion[], zooms: ZoomRegion[]): Span | null {
  if (!Number.isFinite(timeMs) || totalMs <= 0) return null
  const start = Math.max(0, Math.round(timeMs))
  const clip = clips.length ? clips.find((item) => start >= item.startMs && start < item.endMs) : { endMs: totalMs }
  if (!clip || start >= totalMs || zooms.some((item) => start >= item.startMs && start < item.endMs)) return null
  // 预览与提交共用同一边界，允许不足默认两秒的剩余空间。
  const next = zooms.reduce((edge, item) => item.startMs > start ? Math.min(edge, item.startMs) : edge, totalMs)
  const end = Math.floor(Math.min(start + 2000, totalMs, clip.endMs, next))
  return end > start ? { start, end } : null
}
