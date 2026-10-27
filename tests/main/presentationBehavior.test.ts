import { afterEach, describe, expect, it } from 'vitest'
import {
  buildInteractionZoomSuggestions,
  detectZoomDwellCandidates,
  mapZoomTelemetryToTimeline,
  shouldAutoApplyFreshRecordingZoomsForSource
} from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/zoomSuggestionUtils'
import {
  queryWindowsCapture,
  releaseWindowsCaptureWorker
} from '../../internal-plugins/system/presentation/electron/ipc/windowsCaptureWorker'
import { sampleSmoothedCursorPosition } from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/cursorPosition'
import {
  cursorSampleIndexAt,
  indexCursorTelemetry
} from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/cursorTelemetryIndex'
import {
  DEFAULT_ZOOM_DEPTH,
  DEFAULT_AUTO_ZOOM_DEPTH,
  ZOOM_DEPTH_SCALES,
  findClipAtTimelineTime
} from '../../internal-plugins/system/presentation/src/components/video-editor/types'

describe('presentation cursor zoom suggestions', () => {
  it('defaults both manual and automatic zoom to 1.5x', () => {
    expect(ZOOM_DEPTH_SCALES[DEFAULT_ZOOM_DEPTH]).toBe(1.5)
    expect(ZOOM_DEPTH_SCALES[DEFAULT_AUTO_ZOOM_DEPTH]).toBe(1.5)
  })

  it('adds focus regions for continuous movement without clicks and for smaller meaningful moves', () => {
    const continuous = Array.from({ length: 101 }, (_, i) => ({
      timeMs: i * 80,
      cx: 0.1 + i * 0.006,
      cy: 0.4
    }))
    expect(
      buildInteractionZoomSuggestions({
        cursorTelemetry: continuous,
        totalMs: 8500,
        defaultDurationMs: 2000
      }).suggestions.length
    ).toBeGreaterThanOrEqual(2)
    const short = buildInteractionZoomSuggestions({
      cursorTelemetry: continuous.filter((p) => p.timeMs <= 2000),
      totalMs: 2000,
      defaultDurationMs: 2000
    })
    expect(short.suggestions[0].end - short.suggestions[0].start).toBeGreaterThan(1000)
    const smallMove = [
      { timeMs: 0, cx: 0.3, cy: 0.5 },
      { timeMs: 200, cx: 0.32, cy: 0.5 },
      { timeMs: 700, cx: 0.32, cy: 0.5 }
    ]
    expect(
      buildInteractionZoomSuggestions({
        cursorTelemetry: smallMove,
        totalMs: 1600,
        defaultDurationMs: 2000
      }).status
    ).toBe('ok')
    expect(
      buildInteractionZoomSuggestions({
        cursorTelemetry: continuous.map((p) => ({ ...p, cx: 0.4 + (p.timeMs % 3) * 0.001 })),
        totalMs: 8500,
        defaultDurationMs: 2000
      }).suggestions
    ).toEqual([])
  })

  it('keeps usable focus around an occupied boundary rather than dropping the entire suggestion', () => {
    const result = buildInteractionZoomSuggestions({
      cursorTelemetry: [{ timeMs: 2500, cx: 0.7, cy: 0.6, interactionType: 'click' }],
      totalMs: 6000,
      defaultDurationMs: 2000,
      reservedSpans: [{ start: 0, end: 2300 }]
    })
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].start).toBe(2300)
    expect(result.suggestions[0].end).toBeGreaterThan(3000)
  })

  it('maps clicks after trim, speed changes and repeated footage without moving or rewriting source samples', () => {
    const samples = [
      { timeMs: 800, cx: 0.2, cy: 0.2, interactionType: 'click' as const },
      { timeMs: 5000, cx: 0.7, cy: 0.6, interactionType: 'click' as const }
    ]
    const clipRegions = [
      { id: 'fast', startMs: 0, endMs: 2000, sourceStartMs: 4000, speed: 2 },
      { id: 'repeat', startMs: 3000, endMs: 5000, sourceStartMs: 4000, speed: 1 }
    ]
    expect(mapZoomTelemetryToTimeline(samples, clipRegions).map((p) => p.timeMs)).toEqual([
      500, 4000
    ])
    const result = buildInteractionZoomSuggestions({
      cursorTelemetry: samples,
      totalMs: 5000,
      defaultDurationMs: 2000,
      clipRegions
    })
    expect(result.suggestions).toHaveLength(2)
    expect(result.suggestions.every((p) => p.end > p.start)).toBe(true)
    expect(samples[1].timeMs).toBe(5000)
  })
  it('uses explicit clicks first and respects existing regions', () => {
    const cursorTelemetry = [
      { timeMs: 0, cx: 0.2, cy: 0.3 },
      { timeMs: 700, cx: 0.2, cy: 0.3 },
      { timeMs: 1800, cx: 0.7, cy: 0.6, interactionType: 'click' as const },
      { timeMs: 2400, cx: 0.7, cy: 0.6 }
    ]
    const result = buildInteractionZoomSuggestions({
      cursorTelemetry,
      totalMs: 3000,
      defaultDurationMs: 1500
    })
    expect(result.status).toBe('ok')
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].focus).toEqual({ cx: 0.7, cy: 0.6 })
    expect(
      buildInteractionZoomSuggestions({
        cursorTelemetry,
        totalMs: 3000,
        defaultDurationMs: 1500,
        reservedSpans: [{ start: 1200, end: 2500 }]
      }).suggestions
    ).toEqual([])
  })

  it('uses stable focus after movement when clicks are unavailable, but ignores a static recording', () => {
    const cursorTelemetry = [
      { timeMs: 0, cx: 0.1, cy: 0.2 },
      { timeMs: 700, cx: 0.1, cy: 0.2 },
      { timeMs: 1100, cx: 0.7, cy: 0.6 },
      { timeMs: 1800, cx: 0.7, cy: 0.6 }
    ]
    expect(
      buildInteractionZoomSuggestions({ cursorTelemetry, totalMs: 2500, defaultDurationMs: 1200 })
        .status
    ).toBe('ok')
    expect(
      buildInteractionZoomSuggestions({
        cursorTelemetry: cursorTelemetry.map((point) => ({ ...point, cx: 0.4, cy: 0.5 })),
        totalMs: 2500,
        defaultDurationMs: 1200
      }).suggestions
    ).toEqual([])
  })

  it('does not mistake continuous slow movement for an unmoving focus', () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      timeMs: index * 90,
      cx: 0.1 + index * 0.01,
      cy: 0.4
    }))
    expect(detectZoomDwellCandidates(samples)).toEqual([])
    expect(shouldAutoApplyFreshRecordingZoomsForSource(500, 900, 'win32')).toBe(true)
  })

  it('splits rapid operations at distant positions, honors duration and leaves manual zooms intact', () => {
    const cursorTelemetry = [
      { timeMs: 1500, cx: 0.1, cy: 0.2, interactionType: 'click' as const },
      { timeMs: 2200, cx: 0.9, cy: 0.8, interactionType: 'click' as const }
    ]
    const result = buildInteractionZoomSuggestions({
      cursorTelemetry,
      totalMs: 7000,
      defaultDurationMs: 2400
    })
    expect(result.suggestions).toHaveLength(2)
    expect(result.suggestions[0].focus).toEqual({ cx: 0.1, cy: 0.2 })
    expect(result.suggestions[1].focus).toEqual({ cx: 0.9, cy: 0.8 })
    expect(result.suggestions[0].end).toBeLessThanOrEqual(result.suggestions[1].start)
    expect(result.suggestions[1].end - result.suggestions[1].start).toBeGreaterThan(2000)
    const remaining = buildInteractionZoomSuggestions({
      cursorTelemetry,
      totalMs: 7000,
      defaultDurationMs: 2400,
      reservedSpans: [{ start: 1800, end: 6000 }]
    }).suggestions
    expect(remaining).toHaveLength(1)
    expect(remaining[0].end).toBe(1800)
  })

  it('finds a long reading dwell even when a different part of the recording has clicks', () => {
    const cursorTelemetry = [
      { timeMs: 0, cx: 0.1, cy: 0.2, interactionType: 'click' as const },
      { timeMs: 500, cx: 0.1, cy: 0.2 },
      ...Array.from({ length: 60 }, (_, i) => ({ timeMs: 4000 + i * 100, cx: 0.75, cy: 0.65 }))
    ]
    const result = buildInteractionZoomSuggestions({
      cursorTelemetry,
      totalMs: 12000,
      defaultDurationMs: 2000
    })
    expect(result.suggestions).toHaveLength(2)
    expect(result.suggestions[1].focus.cx).toBeCloseTo(0.75)
    expect(result.suggestions[1].end - result.suggestions[1].start).toBeLessThan(3000)
  })

  it('does not infer a focus across a telemetry outage', () => {
    expect(
      buildInteractionZoomSuggestions({
        cursorTelemetry: [
          { timeMs: 0, cx: 0.1, cy: 0.1 },
          { timeMs: 100, cx: 0.8, cy: 0.8 },
          { timeMs: 8000, cx: 0.8, cy: 0.8 }
        ],
        totalMs: 9000,
        defaultDurationMs: 2000
      }).suggestions
    ).toEqual([])
  })
})

describe('presentation timestamp-based cursor rendering', () => {
  it('keeps earliest-start overlap priority without sorting or changing input clip order', () => {
    const clips = [
      { id: 'later', startMs: 1500, endMs: 3000, speed: 2 },
      { id: 'earlier', startMs: 0, endMs: 2000, speed: 1 }
    ]
    expect(findClipAtTimelineTime(1700, clips)?.id).toBe('earlier')
    expect(findClipAtTimelineTime(2000, clips)?.id).toBe('later')
    expect(findClipAtTimelineTime(3000, clips)).toBeNull()
    expect(clips.map((clip) => clip.id)).toEqual(['later', 'earlier'])
  })

  it('preserves constant velocity with no phase lag and is independent of dropped frames or seeks', () => {
    const samples = Array.from({ length: 1201 }, (_, i) => ({
      timeMs: i * 10,
      cx: i / 1200,
      cy: 0.4
    }))
    for (const time of [5000, 2200, 10000, 5000]) {
      expect(sampleSmoothedCursorPosition(samples, time, 2)!.cx).toBeCloseTo(time / 12000, 10)
    }
    const noisy = Array.from({ length: 101 }, (_, i) => ({
      timeMs: i * 10,
      cx: 0.5 + (i % 2 ? 0.01 : -0.01),
      cy: 0.5
    }))
    expect(Math.abs(sampleSmoothedCursorPosition(noisy, 500, 1)!.cx - 0.5)).toBeLessThan(0.005)
  })

  it('hits click coordinates exactly and supports duplicate timestamps', () => {
    const samples = [
      { timeMs: 0, cx: 0.1, cy: 0.1 },
      { timeMs: 100, cx: 0.8, cy: 0.7, interactionType: 'click' as const },
      { timeMs: 100, cx: 0.8, cy: 0.7 },
      { timeMs: 130, cx: 0.1, cy: 0.2 }
    ]
    expect(sampleSmoothedCursorPosition(samples, 100, 2)).toEqual({ cx: 0.8, cy: 0.7 })
    expect(cursorSampleIndexAt(samples, 100)).toBe(2)
    expect(cursorSampleIndexAt(samples, -1)).toBe(-1)
  })

  it('indexes a long recording once and queries sparse events without scanning all positions per frame', () => {
    let reads = 0
    const data = Array.from({ length: 120000 }, (_, i) => ({
      timeMs: i * 16,
      cx: 0.3,
      cy: 0.6,
      interactionType: i % 10000 === 0 ? ('click' as const) : ('move' as const),
      cursorType: 'arrow' as const
    }))
    const samples = new Proxy(data, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++
        return Reflect.get(target, key, receiver)
      }
    })
    indexCursorTelemetry(samples)
    reads = 0
    const started = performance.now()
    for (let i = 0; i < 3600; i++) {
      const index = indexCursorTelemetry(samples)
      expect(index.clicks[cursorSampleIndexAt(index.clicks, i * 400)]?.interactionType).toBe(
        'click'
      )
    }
    console.log('cursor-index: 120000 samples / 3600 frames', {
      elapsedMs: performance.now() - started,
      fullTrajectoryReads: reads
    })
    expect(reads).toBe(0)
  })
})

describe.runIf(process.platform === 'win32')('presentation native window query lifecycle', () => {
  afterEach(releaseWindowsCaptureWorker)
  it('queries actual window positions repeatedly and releases the session worker', async () => {
    const windows = await queryWindowsCapture('list')
    expect(Array.isArray(windows)).toBe(true)
    expect(windows.length).toBeGreaterThan(0)
    const started = performance.now()
    for (let index = 0; index < 6; index++) {
      const bounds = await queryWindowsCapture('bounds', windows[0].id)
      expect(bounds?.width).toBeGreaterThan(0)
    }
    // 热查询不再为每次250ms跟踪重新编译 PowerShell 原生接口。
    expect(performance.now() - started).toBeLessThan(1500)
    await releaseWindowsCaptureWorker()
    expect(Array.isArray(await queryWindowsCapture('list'))).toBe(true)
  }, 20000)
})
