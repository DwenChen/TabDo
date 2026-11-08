import type { ClipRegion, MediaSegment } from '../types'
import { clampMediaTimeToDuration } from '@presentation/lib/mediaTiming'

const HAVE_CURRENT_DATA_READY_STATE = 2
/**
 * 在预览全片终点取末片内部的画面，与屏幕保留最后一帧的行为一致。
 * @param sourceTime 当前屏幕源时间，单位秒。
 * @param timelineTime 当前时间轴时间，单位秒。
 * @param clips 当前屏幕片段，内部切口仍保持左闭右开的规则。
 * @returns 相机可见性及媒体同步共用的源时间和时间轴取样点，不改变游标或素材长度。
 */
export function resolveWebcamPreviewSample(
  sourceTime: number,
  timelineTime: number,
  clips: ClipRegion[]
): { sourceTime: number; timelineTime: number } {
  let last: ClipRegion | undefined
  for (const clip of clips) if (!last || clip.endMs > last.endMs) last = clip
  if (!last || last.endMs <= last.startMs || Math.abs(timelineTime * 1000 - last.endMs) >= 1e-7) {
    return { sourceTime, timelineTime }
  }
  // 仅将最终端点移入末帧，不能把内部切口、间隙或较短相机片段延长。
  const insetMs = Math.min(0.001, (last.endMs - last.startMs) / 2)
  const speed = Number.isFinite(last.speed) && last.speed > 0 ? last.speed : 1
  return {
    sourceTime: Math.max(0, sourceTime - (insetMs * speed) / 1000),
    timelineTime: (last.endMs - insetMs) / 1000
  }
}

/**
 * Maps the editor timeline time to the corresponding webcam media timestamp,
 * accounting for independent segments, recording offsets and media duration clamps.
 * @param options - Source clock, independent timeline clock, camera segments and duration.
 * @returns Camera media time in seconds.
 */
export function getWebcamMediaTargetTimeSeconds({
  currentTime,
  webcamDuration,
  timeOffsetMs,
  segments,
  timelineTime
}: {
  currentTime: number
  webcamDuration?: number | null
  timeOffsetMs?: number | null
  segments?: MediaSegment[]
  timelineTime?: number
}): number {
  const safeOffsetMs = Number.isFinite(timeOffsetMs) ? (timeOffsetMs ?? 0) : 0
  const segment = segments?.find(
    (item) =>
      (timelineTime ?? currentTime) * 1000 >= item.startMs &&
      (timelineTime ?? currentTime) * 1000 < item.endMs
  )
  const shiftedTime = segment
    ? (segment.sourceStartMs + (timelineTime ?? currentTime) * 1000 - segment.startMs) / 1000
    : currentTime - safeOffsetMs / 1000
  return clampMediaTimeToDuration(shiftedTime, webcamDuration)
}

export const getWebcamPreviewTargetTimeSeconds = getWebcamMediaTargetTimeSeconds

/**
 * Validate camera readiness against the same output-frame tolerance used for corrective seeks.
 * @param options Current decoded position, target and decoder state.
 * @returns Whether the camera is ready at the requested output frame.
 */
export function isWebcamMediaSynchronized({
  currentTime,
  targetTime,
  readyState,
  isSeeking,
  toleranceSeconds = 1 / 60
}: {
  currentTime: number
  targetTime: number
  readyState: number
  isSeeking: boolean
  toleranceSeconds?: number
}): boolean {
  return (
    readyState >= HAVE_CURRENT_DATA_READY_STATE &&
    !isSeeking &&
    Math.abs(currentTime - targetTime) <= toleranceSeconds
  )
}

/**
 * Decides whether the webcam media element needs a corrective seek for the
 * current preview frame, while avoiding repeated seeks during active media seeks.
 * @param options Current target, playback state and last synchronized media position.
 * @returns Whether drift exceeds one output frame or a discontinuity requires a seek.
 */
export function shouldSeekWebcamMedia({
  desiredTime,
  isPlaying,
  isSeeking,
  previousTimelineTime,
  timelineTime,
  webcamCurrentTime
}: {
  desiredTime: number
  isPlaying: boolean
  isSeeking: boolean
  previousTimelineTime: number | null
  timelineTime: number
  webcamCurrentTime: number
}): boolean {
  if (isSeeking) {
    return false
  }

  const timelineJumped =
    previousTimelineTime === null || Math.abs(timelineTime - previousTimelineTime) > 0.25
  const driftThreshold = isPlaying ? 1 / 60 : 0.001

  return timelineJumped || Math.abs(webcamCurrentTime - desiredTime) > driftThreshold
}

/**
 * Resolve camera visibility without coupling independent segments to the video source clock.
 * @param webcam - Saved camera ranges or independent segments.
 * @param sourceTimeSeconds - Source video time for legacy projects.
 * @param timelineTimeSeconds - Current project timeline time.
 * @returns Whether camera footage is visible.
 */
export function isWebcamVisibleAtSourceTime(
  webcam:
    | {
        segments?: MediaSegment[]
        visibleRanges?: { startMs: number; endMs: number }[]
        sourceDurationMs?: number
        timeOffsetMs?: number
      }
    | undefined,
  sourceTimeSeconds: number,
  timelineTimeSeconds = sourceTimeSeconds
): boolean {
  if (webcam?.segments)
    return webcam.segments.some(
      ({ startMs, endMs }) =>
        timelineTimeSeconds * 1000 >= startMs && timelineTimeSeconds * 1000 < endMs
    )
  const mediaTimeMs = sourceTimeSeconds * 1000 - (webcam?.timeOffsetMs ?? 0)
  if (
    webcam?.sourceDurationMs != null &&
    (mediaTimeMs < 0 || mediaTimeMs >= webcam.sourceDurationMs)
  )
    return false
  return (
    !webcam?.visibleRanges ||
    webcam.visibleRanges.some(
      ({ startMs, endMs }) =>
        sourceTimeSeconds * 1000 >= startMs && sourceTimeSeconds * 1000 < endMs
    )
  )
}
