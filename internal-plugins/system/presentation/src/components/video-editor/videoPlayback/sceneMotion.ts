import type { CursorTelemetryPoint, ZoomFocus, ZoomRegion } from '../types'
import { getZoomScale } from '../zoomCamera'
import { DEFAULT_FOCUS } from './constants'
import {
  type CursorFollowCameraState,
  computeCursorFollowFocus,
  SNAP_TO_EDGES_RATIO_AUTO
} from './cursorFollowCamera'
import { findDominantRegion } from './zoomRegionUtils'

export type SceneZoomTarget = {
  scale: number
  focus: ZoomFocus
  progress: number
}

export type PreviewMotionMode = 'spring' | 'snap' | 'preserve'

/**
 * Decide how the preview camera should react to the current transport state.
 * A plain pause must preserve the last composed frame; recomputing the projected
 * target there causes the image to jump as soon as the user presses Space.
 */
export function resolvePreviewMotionMode({
  isPlaying,
  isSeeking,
  shouldSnapPausedFrame,
  zoomClassicMode
}: {
  isPlaying: boolean
  isSeeking: boolean
  shouldSnapPausedFrame: boolean
  zoomClassicMode: boolean
}): PreviewMotionMode {
  if (isSeeking || shouldSnapPausedFrame || (isPlaying && zoomClassicMode)) {
    return 'snap'
  }

  return isPlaying ? 'spring' : 'preserve'
}

/** Match export's one-composition-per-media-frame behavior. */
export function shouldComposePreviewFrame({
  motionMode,
  isSeeking = false,
  contentTimeChanged,
  shouldSnapPausedFrame
}: {
  motionMode: PreviewMotionMode
  isSeeking?: boolean
  contentTimeChanged: boolean
  shouldSnapPausedFrame: boolean
}): boolean {
  // Do not consume the pending composition against the old decoded image.
  if (isSeeking || motionMode === 'preserve') {
    return false
  }

  return contentTimeChanged || shouldSnapPausedFrame
}

/**
 * 按媒体时间读取连续倍率及取景焦点，供预览和导出共用。
 * @param params 片段、时间、转场设置及光标跟随状态。
 * @returns 当前帧的目标倍率、焦点和变焦权重。
 */
export function resolveSceneZoomTarget({
  zoomRegions,
  timeMs,
  cursorTimeMs = timeMs,
  connectZooms,
  connectedZoomGapMs,
  zoomInDurationMs,
  zoomOutDurationMs,
  zoomClassicMode,
  cursorTelemetry,
  cursorFollowCamera
}: {
  zoomRegions: ZoomRegion[]
  timeMs: number
  cursorTimeMs?: number
  connectZooms?: boolean
  connectedZoomGapMs?: number
  zoomInDurationMs?: number
  zoomOutDurationMs?: number
  zoomClassicMode?: boolean
  cursorTelemetry?: CursorTelemetryPoint[]
  cursorFollowCamera: CursorFollowCameraState
}): SceneZoomTarget {
  const { region, strength, blendedScale } = findDominantRegion(zoomRegions, timeMs, {
    connectZooms,
    connectedZoomGapMs,
    zoomInDurationMs,
    zoomOutDurationMs
  })

  if (!region || strength <= 0) {
    return { scale: 1, focus: DEFAULT_FOCUS, progress: 0 }
  }

  const scale = blendedScale ?? getZoomScale(region)
  let focus = region.focus
  if (
    !zoomClassicMode &&
    region.mode !== 'manual' &&
    cursorTelemetry &&
    cursorTelemetry.length > 0
  ) {
    focus = computeCursorFollowFocus(
      cursorFollowCamera,
      cursorTelemetry,
      cursorTimeMs,
      scale,
      strength,
      region.focus,
      { snapToEdgesRatio: SNAP_TO_EDGES_RATIO_AUTO }
    )
  }

  return { scale, focus, progress: strength }
}
