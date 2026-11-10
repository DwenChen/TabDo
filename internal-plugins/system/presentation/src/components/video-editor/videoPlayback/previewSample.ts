import type { ClipRegion } from '../types'

/**
 * 为预览全部图层统一取样；全片终点进入末片内部，切口与空隙保持原时间。
 * @param sourceTime 已解码或由时间轴映射的源时间，单位秒。
 * @param timelineTime 请求或已呈现的时间轴时间，单位秒。
 * @param clips 当前录屏片段，不修改片段边界。
 * @returns 画面、镜头、鼠标、字幕、注释和相机共用的源时间与时间轴时间。
 */
export function resolvePreviewFrameSample(
  sourceTime: number,
  timelineTime: number,
  clips: ClipRegion[]
): { sourceTime: number; timelineTime: number } {
  let last: ClipRegion | undefined
  for (const clip of clips) if (!last || clip.endMs > last.endMs) last = clip
  if (!last || last.endMs <= last.startMs || Math.abs(timelineTime * 1000 - last.endMs) >= 1e-7) {
    return { sourceTime, timelineTime }
  }
  // 仅调整最终端点，不能延长短效果，也不能把内部切口归回前一片段。
  const insetMs = Math.min(0.001, (last.endMs - last.startMs) / 2)
  const speed = Number.isFinite(last.speed) && last.speed > 0 ? last.speed : 1
  return {
    sourceTime: Math.max(0, sourceTime - (insetMs * speed) / 1000),
    timelineTime: (last.endMs - insetMs) / 1000
  }
}
