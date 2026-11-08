import type { ZoomFocus, ZoomRegion } from '../types'
import { getZoomScale } from '../zoomCamera'
import { canConnectZoomRegions } from '../zoomConnection'
import {
  TRANSITION_WINDOW_MS,
  ZOOM_IN_TRANSITION_WINDOW_MS,
  ZOOM_OUT_EARLY_START_MS
} from './constants'
import { clampFocusToScale } from './focusUtils'
import { clamp01, easeOutZoom } from './mathUtils'

const CONNECTED_ZOOM_PAN_DURATION_MS = 1000
const ZOOM_IN_OVERLAP_MS = 1000
// Playback offset relative to timeline blocks; positive values delay the animation.
const ZOOM_ANIMATION_DELAY_MS = 500

type DominantRegionOptions = {
  connectZooms?: boolean
  connectedZoomGapMs?: number
  zoomInDurationMs?: number
  zoomOutDurationMs?: number
}

type ConnectedRegionPair = {
  currentRegion: ZoomRegion
  nextRegion: ZoomRegion
  transitionStart: number
  transitionEnd: number
}

type ConnectedPanTransition = {
  progress: number
  startFocus: ZoomFocus
  endFocus: ZoomFocus
  startScale: number
  endScale: number
}

export function computeRegionStrength(
  region: ZoomRegion,
  timeMs: number,
  options: Pick<DominantRegionOptions, 'zoomInDurationMs' | 'zoomOutDurationMs'> = {}
) {
  const zoomInDurationMs = Math.max(1, options.zoomInDurationMs ?? ZOOM_IN_TRANSITION_WINDOW_MS)
  const zoomOutDurationMs = Math.max(1, options.zoomOutDurationMs ?? TRANSITION_WINDOW_MS)
  const adjustedTimeMs = timeMs - ZOOM_ANIMATION_DELAY_MS
  const leadInStart = region.startMs + ZOOM_IN_OVERLAP_MS - ZOOM_IN_TRANSITION_WINDOW_MS
  let zoomOutStart = region.endMs - ZOOM_OUT_EARLY_START_MS
  let zoomInEnd = leadInStart + zoomInDurationMs

  if (zoomInEnd > zoomOutStart) {
    const midpoint = (zoomInEnd + zoomOutStart) / 2
    zoomInEnd = midpoint
    zoomOutStart = midpoint
  }

  const leadOutEnd = zoomOutStart + zoomOutDurationMs

  if (adjustedTimeMs < leadInStart || adjustedTimeMs > leadOutEnd) {
    return 0
  }

  if (adjustedTimeMs < zoomInEnd) {
    const progress = (adjustedTimeMs - leadInStart) / zoomInDurationMs
    return easeOutZoom(progress)
  }

  if (adjustedTimeMs <= zoomOutStart) {
    return 1
  }

  const progress = clamp01((adjustedTimeMs - zoomOutStart) / zoomOutDurationMs)
  return 1 - easeOutZoom(progress)
}

function getResolvedFocus(region: ZoomRegion, zoomScale: number): ZoomFocus {
  return clampFocusToScale(region.focus, zoomScale)
}

/**
 * 按用户最大间隔建立连接窗口，二维与三维采用同一边界规则。
 * @param regions 当前变焦片段。
 * @param gapMs 项目中设置的最大空白间隔。
 * @returns 已按时间排序的相邻连接对。
 */
function getConnectedRegionPairs(regions: ZoomRegion[], gapMs?: number) {
  const sortedRegions = [...regions].sort((a, b) => a.startMs - b.startMs)
  const pairs: ConnectedRegionPair[] = []

  for (let index = 0; index < sortedRegions.length - 1; index += 1) {
    const currentRegion = sortedRegions[index]
    const nextRegion = sortedRegions[index + 1]
    if (!canConnectZoomRegions(currentRegion, nextRegion, gapMs)) {
      continue
    }

    pairs.push({
      currentRegion,
      nextRegion,
      transitionStart: currentRegion.endMs + ZOOM_ANIMATION_DELAY_MS,
      transitionEnd: currentRegion.endMs + ZOOM_ANIMATION_DELAY_MS + CONNECTED_ZOOM_PAN_DURATION_MS
    })
  }

  return pairs
}

/**
 * 从当前活动片段读取连续倍率并约束焦点。
 * @param regions 项目变焦片段。
 * @param timeMs 当前剪辑时间。
 * @param connectedPairs 相邻连接窗口。
 * @param options 进出场设置。
 * @returns 主导片段及其权重，没有活动片段时为空。
 */
function getActiveRegion(
  regions: ZoomRegion[],
  timeMs: number,
  connectedPairs: ConnectedRegionPair[],
  options: DominantRegionOptions
) {
  const activeRegions = regions
    .map((region) => {
      const outgoingPair = connectedPairs.find((pair) => pair.currentRegion.id === region.id)
      if (outgoingPair) {
        if (timeMs >= outgoingPair.transitionStart) {
          return { region, strength: 0 }
        }

        const zoomOutStart =
          outgoingPair.currentRegion.endMs - ZOOM_OUT_EARLY_START_MS + ZOOM_ANIMATION_DELAY_MS
        if (timeMs >= zoomOutStart) {
          return { region, strength: 1 }
        }
      }

      const incomingPair = connectedPairs.find((pair) => pair.nextRegion.id === region.id)
      if (incomingPair) {
        if (timeMs < incomingPair.transitionStart) {
          return { region, strength: 0 }
        }

        const nextRegionZoomOutStart =
          incomingPair.nextRegion.endMs - ZOOM_OUT_EARLY_START_MS + ZOOM_ANIMATION_DELAY_MS
        if (timeMs < nextRegionZoomOutStart) {
          return { region, strength: 1 }
        }
      }

      return { region, strength: computeRegionStrength(region, timeMs, options) }
    })
    .filter((entry) => entry.strength > 0)
    .sort((left, right) => {
      if (right.strength !== left.strength) {
        return right.strength - left.strength
      }

      return right.region.startMs - left.region.startMs
    })

  if (activeRegions.length === 0) {
    return null
  }

  const activeRegion = activeRegions[0].region
  const activeScale = getZoomScale(activeRegion)

  return {
    region: {
      ...activeRegion,
      focus: getResolvedFocus(activeRegion, activeScale)
    },
    strength: activeRegions[0].strength,
    blendedScale: null
  }
}

/**
 * 连接结束后保持下一镜头的连续倍率与焦点。
 * @param timeMs 当前剪辑时间。
 * @param connectedPairs 已计算的相邻片段连接。
 * @returns 保持状态，当前不在保持区间时为空。
 */
function getConnectedRegionHold(timeMs: number, connectedPairs: ConnectedRegionPair[]) {
  for (const pair of connectedPairs) {
    if (timeMs >= pair.transitionEnd && timeMs < pair.nextRegion.startMs) {
      const nextScale = getZoomScale(pair.nextRegion)
      return {
        region: {
          ...pair.nextRegion,
          focus: getResolvedFocus(pair.nextRegion, nextScale)
        },
        strength: 1,
        blendedScale: null
      }
    }
  }

  return null
}

/**
 * 按项目阈值和媒体时间确定主导镜头，连接开关关闭时保留独立进出场。
 * @param regions 当前变焦片段。
 * @param timeMs 编辑时间轴毫秒。
 * @param options 进出场及连接阈值。
 * @returns 主导片段、权重、混合倍率及连接状态。
 */
export function findDominantRegion(
  regions: ZoomRegion[],
  timeMs: number,
  options: DominantRegionOptions = {}
): {
  region: ZoomRegion | null
  strength: number
  blendedScale: number | null
  transition: ConnectedPanTransition | null
} {
  const connectedPairs = options.connectZooms
    ? getConnectedRegionPairs(regions, options.connectedZoomGapMs)
    : []

  if (options.connectZooms) {
    const connectedHold = getConnectedRegionHold(timeMs, connectedPairs)
    if (connectedHold) {
      return { ...connectedHold, transition: null }
    }
  }

  const activeRegion = getActiveRegion(regions, timeMs, connectedPairs, options)
  return activeRegion
    ? { ...activeRegion, transition: null }
    : { region: null, strength: 0, blendedScale: null, transition: null }
}
