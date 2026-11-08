import type { MediaSegment, WebcamOverlaySettings } from './types'

/**
 * 判断摄像头是否还有可编辑素材，显式片段优先于旧项目可见范围。
 * @param webcam 当前摄像头模型，缺失或解除来源时为空状态。
 * @returns 存在来源且未被显式删空时为真；粘贴片段不受旧空范围干扰。
 */
export function hasWebcamFootage(webcam?: WebcamOverlaySettings | null): boolean {
  if (!webcam?.sourcePath) return false
  if (webcam.segments) return webcam.segments.length > 0
  return webcam.visibleRanges ? webcam.visibleRanges.length > 0 : true
}

/**
 * Fit the default camera track to both the media duration and the edited screen timeline.
 * @param webcam Saved camera settings and measured media duration.
 * @param durationMs End of the project timeline.
 * @returns Existing explicit segments or the correctly offset default camera span.
 */
export function getWebcamTimelineSegments(
  webcam: WebcamOverlaySettings,
  durationMs: number
): MediaSegment[] {
  if (webcam.segments) return webcam.segments
  const startMs = Math.max(0, webcam.timeOffsetMs)
  const sourceStartMs = Math.max(0, -webcam.timeOffsetMs)
  const endMs = Math.min(
    durationMs,
    webcam.sourceDurationMs == null ? durationMs : webcam.timeOffsetMs + webcam.sourceDurationMs
  )
  // 升级旧项目时保留导入序列已保存的可见区间，不能补回被剪掉的镜头。
  if (webcam.visibleRanges)
    return webcam.visibleRanges.flatMap((range, index) => {
      const start = Math.max(startMs, range.startMs)
      const end = Math.min(endMs, range.endMs)
      return end > start
        ? [
            {
              id: `webcam-original-${index}`,
              startMs: start,
              endMs: end,
              sourceStartMs: sourceStartMs + start - startMs
            }
          ]
        : []
    })
  return endMs > startMs ? [{ id: 'webcam-original', startMs, endMs, sourceStartMs }] : []
}

/**
 * 删除摄像头片段，删空后解除当前项目的素材引用，使轨道、侧栏和预览同时退场。
 * @param webcam 当前项目摄像头模型。
 * @param id 待删除片段的稳定身份。
 * @param durationMs 项目时间轴总时长。
 * @returns 保留其他片段及外观的新模型；不删除磁盘素材，完整模型可由撤销恢复。
 */
export function removeWebcamSegment(
  webcam: WebcamOverlaySettings,
  id: string,
  durationMs: number
): WebcamOverlaySettings {
  const current = getWebcamTimelineSegments(webcam, durationMs)
  const segments = current.filter((segment) => segment.id !== id)
  if (segments.length === current.length) return webcam
  // 保留剩余片段的源偏移；最后一段退出时不能留下可重新补轨的来源身份。
  return segments.length
    ? { ...webcam, segments }
    : {
        ...webcam,
        enabled: false,
        sourcePath: null,
        sourceDurationMs: undefined,
        timeOffsetMs: 0,
        segments: [],
        visibleRanges: []
      }
}

/**
 * Move or trim a segment while keeping its source start aligned with the left edge.
 * @param segment - Original segment.
 * @param startMs - New timeline start.
 * @param endMs - New timeline end.
 * @param trimLeft - Whether the left edge was trimmed rather than moved.
 * @returns A bounded segment with a valid source offset.
 */
export function editMediaSegment(
  segment: MediaSegment,
  startMs: number,
  endMs: number,
  trimLeft = false
): MediaSegment {
  const start = Math.max(0, startMs)
  const sourceStartMs = trimLeft
    ? Math.max(0, segment.sourceStartMs + start - segment.startMs)
    : segment.sourceStartMs
  return {
    ...segment,
    startMs: Math.round(start),
    endMs: Math.round(Math.max(start + 100, endMs)),
    sourceStartMs
  }
}

/**
 * Split an independent segment without restarting its source on the second part.
 * @param segment - Segment to split.
 * @param timeMs - Timeline cut position.
 * @returns Two contiguous segments, or the unchanged segment for an invalid cut.
 */
export function splitMediaSegment(segment: MediaSegment, timeMs: number): MediaSegment[] {
  if (timeMs <= segment.startMs + 100 || timeMs >= segment.endMs - 100) return [segment]
  return [
    { ...segment, endMs: timeMs },
    {
      ...segment,
      id: `${segment.id}-${Date.now()}`,
      startMs: timeMs,
      sourceStartMs: segment.sourceStartMs + timeMs - segment.startMs
    }
  ]
}
