import { DEFAULT_CONNECTED_ZOOM_GAP_MS, type ZoomRegion } from './types'

/**
 * 将项目连接阈值约束到界面允许范围，缺失时使用统一出厂值。
 * @param gapMs 已保存的最大间隔毫秒数。
 * @returns 0至5000毫秒的连接阈值。
 */
export function getZoomConnectionGap(gapMs?: number): number {
  return Number.isFinite(gapMs)
    ? Math.max(0, Math.min(5000, gapMs!))
    : DEFAULT_CONNECTED_ZOOM_GAP_MS
}

/**
 * 以两段变焦之间的空白时长判断连接，重叠和相接视作零间隔。
 * @param current 按时间排列的前一段。
 * @param next 后一段。
 * @param gapMs 最大允许空白时长。
 * @returns 空白时长小于或等于阈值时返回 true。
 */
export function canConnectZoomRegions(
  current: ZoomRegion,
  next: ZoomRegion,
  gapMs?: number
): boolean {
  return Math.max(0, next.startMs - current.endMs) <= getZoomConnectionGap(gapMs)
}
