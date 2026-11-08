import { describe, expect, it } from 'vitest'
import {
  canSplitRegion,
  splitTimelineRegion
} from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/regionSplit'
import {
  formatPlayheadTime,
  formatTimeLabel,
  calculateAxisScale
} from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/core/time'
import {
  getClipDisplaySpan,
  getPlayheadDisplayTime,
  getTimeAtClipSeam
} from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/core/clipPresentation'
import { resizeTimelineViewport } from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/hooks/useTimelineRange'
import {
  filmstripSampleTimes,
  buildFilmstripTiles
} from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/core/filmstrip'
import { moveTrack } from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/TrackOrder'
import { resolveDragEnd } from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/dnd/engine'
import { reorderTimedRegions } from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/core/trackArrangement'
import { normalizeProjectEditor } from '../../internal-plugins/system/presentation/src/components/video-editor/projectPersistence'
import { resolveZoomPlacement } from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/zoomPlacement'

describe('presentation timeline interactions', () => {
  it('places zooms at the requested millisecond and shortens at the next zoom and clip edge', () => {
    const clips = [{ id: 'clip', startMs: 0, endMs: 5000, speed: 1 }]
    const zooms = [{ id: 'zoom', startMs: 2500, endMs: 3000, depth: 1.5, focus: { cx: .5, cy: .5 } }]
    expect(resolveZoomPlacement(1234.3, 5000, clips, zooms)).toEqual({ start: 1234, end: 2500 })
    expect(resolveZoomPlacement(4990, 5000, clips, zooms)).toEqual({ start: 4990, end: 5000 })
    expect(resolveZoomPlacement(3000, 5000, clips, zooms)).toEqual({ start: 3000, end: 5000 })
    expect(resolveZoomPlacement(2500, 5000, clips, zooms)).toBeNull()
    expect(resolveZoomPlacement(5000, 5000, clips, zooms)).toBeNull()
    expect(resolveZoomPlacement(0, 0, [], [])).toBeNull()
    expect(resolveZoomPlacement(NaN, 5000, clips, [])).toBeNull()
    expect(resolveZoomPlacement(3500, 5000, [{ ...clips[0], endMs: 3000 }], [])).toBeNull()
    expect(resolveZoomPlacement(2800, 5000, [{ ...clips[0], endMs: 3000 }, { ...clips[0], id: 'next', startMs: 3000 }], [])).toEqual({ start: 2800, end: 3000 })
  })

  it('preserves the keyboard visibility choice while older projects remain eligible for automatic loading', () => {
    expect(normalizeProjectEditor({ keyboardDisplayEnabled: false }).keyboardDisplayEnabled).toBe(false)
    expect(normalizeProjectEditor({ keyboardDisplayEnabled: true }).keyboardDisplayEnabled).toBe(true)
    expect(normalizeProjectEditor({}).keyboardDisplayEnabled).toBeNull()
  })
  it('keeps source samples stable during panning and reuses half the samples at a doubled zoom', () => {
    const span = { start: 1000, end: 11000 }
    const source = { start: 700, end: 20700 }
    const first = buildFilmstripTiles(span, source, { start: 2000, end: 4000 }, 5)
    const panned = buildFilmstripTiles(span, source, { start: 2100, end: 4100 }, 5)
    expect(
      panned.filter((tile) => first.some((old) => old.timeMs === tile.timeMs)).length
    ).toBeGreaterThanOrEqual(first.length - 1)
    const zoomed = buildFilmstripTiles(span, source, { start: 2000, end: 4000 }, 2.5)
    expect(
      first
        .filter((tile) => tile.start >= 2000)
        .every((tile) => zoomed.some((next) => next.timeMs === tile.timeMs))
    ).toBe(true)
    expect(first[0].start).toBeLessThanOrEqual(2000)
    expect(first.at(-1)!.end).toBeGreaterThanOrEqual(4000)
    expect(first.every((tile) => Math.abs(tile.timeMs - (700 + (tile.start - 1000) * 2)) < 1)).toBe(
      true
    )
    expect(buildFilmstripTiles(span, source, { start: 12000, end: 13000 }, 5)).toEqual([])
  })

  it('uses the indicated before/after edge for track insertion in either direction', () => {
    const order = ['screen', 'camera', 'audio']
    expect(moveTrack(order, 'screen', 'camera', 'before')).toEqual(order)
    expect(moveTrack(order, 'screen', 'camera', 'after')).toEqual(['camera', 'screen', 'audio'])
    expect(moveTrack(order, 'audio', 'camera', 'before')).toEqual(['screen', 'audio', 'camera'])
    expect(moveTrack(order, 'audio', 'camera', 'after')).toEqual(order)
  })
  it('samples changed viewport windows in trimmed and sped source coordinates', () => {
    const span = { start: 1000, end: 5000 }
    const source = { start: 2000, end: 10000 }
    expect(filmstripSampleTimes(span, source, span, 2)).toEqual([4000, 8000])
    expect(filmstripSampleTimes(span, source, { start: 2000, end: 3000 }, 2)).toEqual([4500, 5500])
    expect(filmstripSampleTimes(span, source, { start: 5000, end: 6000 }, 2)).toEqual([])
  })

  it('inserts packed camera/audio clips in either direction without changing their sources', () => {
    const regions = [
      { id: 'a', startMs: 100, endMs: 1100, sourceStartMs: 300, trackIndex: 0 },
      { id: 'b', startMs: 1100, endMs: 1600, sourceStartMs: 700, trackIndex: 0 },
      { id: 'c', startMs: 2000, endMs: 3000, sourceStartMs: 800, trackIndex: 0 },
      { id: 'other', startMs: 100, endMs: 900, sourceStartMs: 0, trackIndex: 1 }
    ]
    const allRegionSpans = regions
      .filter((r) => r.trackIndex === 0)
      .map((r) => ({ id: r.id, rowId: 'camera', start: r.startMs, end: r.endMs }))
    const config = { totalMs: 4000, minItemDurationMs: 50, allRegionSpans, hasOverlap: () => true }
    const drop = resolveDragEnd('a', { start: 1800, end: 2800 }, 'camera', config)!
    expect(drop.span.sequenceIndex).toBe(1)
    const reordered = reorderTimedRegions(regions, 'a', drop.span.sequenceIndex!)
    expect(reordered.find((r) => r.id === 'b')).toMatchObject({
      startMs: 100,
      endMs: 600,
      sourceStartMs: 700
    })
    expect(reordered.find((r) => r.id === 'a')).toMatchObject({
      startMs: 600,
      endMs: 1600,
      sourceStartMs: 300
    })
    expect(reordered.find((r) => r.id === 'c')).toEqual(regions[2])
    expect(reordered[3]).toBe(regions[3])
    expect(reorderTimedRegions(reordered, 'a', 0)).toEqual(regions)
  })

  it('normalizes saved track ordering while leaving legacy projects in default order', () => {
    expect(normalizeProjectEditor({}).trackOrder).toEqual([])
    expect(
      normalizeProjectEditor({ trackOrder: ['clip-row', 'webcam-row', 'clip-row', '', 3] as any })
        .trackOrder
    ).toEqual(['clip-row', 'webcam-row'])
  })
  it('splits sped audio at its source offset and retains only exterior fades', () => {
    const audio = {
      id: 'sound',
      startMs: 100,
      endMs: 2100,
      sourceStartMs: 700,
      playbackRate: 2,
      volume: 0.4,
      audioPath: 'mic.wav',
      fadeInMs: 500,
      fadeOutMs: 400
    }
    const [left, right] = splitTimelineRegion(audio, 900, () => 'right')
    expect(left).toEqual({ ...audio, endMs: 900, fadeOutMs: 0 })
    expect(right).toEqual({ ...audio, id: 'right', startMs: 900, sourceStartMs: 2300, fadeInMs: 0 })
    expect(audio.endMs).toBe(2100)
  })

  it('rejects cuts outside the selected region and at its edges', () => {
    const selected = { id: 'selected', startMs: 1500, endMs: 2500 }
    for (const cut of [1000, 1500, 1550, 2500, NaN]) {
      expect(canSplitRegion(selected, cut)).toBe(false)
      expect(splitTimelineRegion(selected, cut, () => 'unused')).toEqual([selected])
    }
    expect(canSplitRegion(undefined, 2000)).toBe(false)
    expect(canSplitRegion(selected, 2000)).toBe(true)
  })

  it('keeps camera source continuity and adjacent cuts at every display scale', () => {
    const halves = splitTimelineRegion(
      { id: 'camera', startMs: 200, endMs: 2200, sourceStartMs: 300 },
      1200,
      () => 'right'
    )
    expect(halves[1].sourceStartMs).toBe(1300)
    const spans = halves.map((part) => ({ start: part.startMs, end: part.endMs }))
    for (const msPerPixel of [0.3, 10, 1000]) {
      const displayed = spans.map((span) => ({
        span,
        displaySpan: getClipDisplaySpan(span, spans, msPerPixel)
      }))
      expect(displayed[0].displaySpan.end).toBe(displayed[1].displaySpan.start)
      expect(getPlayheadDisplayTime(1200, displayed)).toBe(1200)
      expect(getTimeAtClipSeam(1250, displayed)).toBe(1250)
    }
  })

  it('formats exact milliseconds and carries seconds, minutes and hours', () => {
    expect(formatPlayheadTime(1)).toBe('0:00.001')
    expect(formatPlayheadTime(1234)).toBe('0:01.234')
    expect(formatPlayheadTime(59999.6)).toBe('1:00.000')
    expect(formatPlayheadTime(3600001)).toBe('1:00:00.001')
    expect(formatPlayheadTime(NaN)).toBe('0:00.000')
    expect(formatTimeLabel(250, 250)).toBe('0:00.25')
    expect(formatTimeLabel(750, 250)).toBe('0:00.75')
  })

  it('zooms about the visible playhead, keeps the end reachable and clamps short projects', () => {
    expect(resizeTimelineViewport({ start: 0, end: 10000 }, 2000, 10000, 5000)).toEqual({
      start: 4000,
      end: 6000
    })
    expect(resizeTimelineViewport({ start: 8000, end: 10000 }, 4000, 10000, 10000)).toEqual({
      start: 6000,
      end: 10000
    })
    expect(resizeTimelineViewport({ start: 4000, end: 6000 }, 2000, 3000, 5000)).toEqual({
      start: 1000,
      end: 3000
    })
    expect(resizeTimelineViewport({ start: 0, end: 100 }, 1, 100, 0)).toEqual({
      start: 0,
      end: 100
    })
    const fine = calculateAxisScale(300, 800)
    expect(fine.gridMs).toBeLessThan(100)
    expect(300 / fine.intervalMs).toBeLessThanOrEqual(10)
  })
})
