import { findClipAtTimelineTime, type ClipRegion, type ZoomRegion } from './types'
import { getPreviewPlaybackRateRange } from './videoPlayback/playbackRate'

export const MIN_ZOOM_RATE = 0.25
export const MAX_ZOOM_RATE = 4

/**
 * Normalize an authored video or camera speed from the inspector or a project file.
 * @param value Stored multiplier.
 * @returns A supported rate, defaulting to 1× for older projects.
 */
export function normalizeZoomRate(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.max(MIN_ZOOM_RATE, Math.min(MAX_ZOOM_RATE, value))
}

type SpeedSpan = { editMs: number; outputMs: number; rate: number }

/**
 * Find the active span on either clock using the same inclusive start rule.
 * @param spans Ordered speed spans.
 * @param field Clock coordinate to compare.
 * @param timeMs Position on that clock.
 * @returns Active span, including the first span at the start.
 */
function findSpeedSpan(spans: SpeedSpan[], field: 'editMs' | 'outputMs', timeMs: number): SpeedSpan {
  let low = 0
  let high = spans.length
  while (high - low > 1) {
    const middle = (low + high) >>> 1
    if (spans[middle][field] <= timeMs) low = middle
    else high = middle
  }
  return spans[low]
}

/**
 * Build a shared clock for playback and export from edited zoom bounds.
 * @param regions Zoom regions in the project's edit timeline.
 * @param clips Base clips, including existing clip speeds.
 * @returns Rate and timestamp mapping, or undefined for an entirely normal-speed project.
 */
export function createZoomPlaybackClock(regions: ZoomRegion[], clips: ClipRegion[] = []) {
  const edited = regions.filter((region) =>
    region.endMs > region.startMs && normalizeZoomRate(region.playbackRate) !== 1
  ).sort((left, right) => right.startMs - left.startMs)
  if (!edited.length) return undefined

  // Zoom edits usually have disjoint spans. For imported overlaps the latest start wins.
  const changedClips = clips.filter(({ speed }) => speed !== 1)
  const limits = changedClips.length && typeof document !== 'undefined'
    ? getPreviewPlaybackRateRange()
    : undefined
  const boundaries = [...new Set([
    0,
    ...edited.flatMap(({ startMs, endMs }) => [startMs, endMs]),
    ...changedClips.flatMap(({ startMs, endMs }) => [startMs, endMs])
  ])]
    .sort((left, right) => left - right)
  const spans: SpeedSpan[] = []
  for (const editMs of boundaries) {
    let rate = normalizeZoomRate(
      edited.find((region) => region.startMs <= editMs && editMs < region.endMs)?.playbackRate
    )
    // Respect the media element's supported combined clip and zoom rate.
    if (limits && rate !== 1) {
      const clipRate = findClipAtTimelineTime(editMs, clips)?.speed ?? 1
      rate = Math.max(limits.min / clipRate, Math.min(limits.max / clipRate, rate))
    }
    const previous = spans[spans.length - 1]
    if (previous?.rate === rate) continue
    const outputMs = previous ? previous.outputMs + (editMs - previous.editMs) / previous.rate : 0
    spans.push({ editMs, outputMs, rate })
  }

  return {
    spans,
    /**
     * Read the additional zoom-region speed at an edit position.
     * @param editMs Edit-timeline time in milliseconds.
     * @returns The playback multiplier at that position.
     */
    rateAt: (editMs: number) => findSpeedSpan(spans, 'editMs', editMs).rate,
    /**
     * Convert an edit position to elapsed playback time.
     * @param editMs Edit-timeline time in milliseconds.
     * @returns Elapsed output milliseconds.
     */
    toOutputMs: (editMs: number) => {
      const span = findSpeedSpan(spans, 'editMs', editMs)
      return span.outputMs + (editMs - span.editMs) / span.rate
    },
    /**
     * Convert elapsed playback time to an edit position.
     * @param outputMs Elapsed output time in milliseconds.
     * @returns Edit-timeline milliseconds.
     */
    toEditMs: (outputMs: number) => {
      const span = findSpeedSpan(spans, 'outputMs', outputMs)
      return span.editMs + (outputMs - span.outputMs) * span.rate
    }
  }
}

export type ZoomPlaybackClock = NonNullable<ReturnType<typeof createZoomPlaybackClock>>
