import { describe, expect, it } from 'vitest'
import { normalizeProjectEditor } from '../../internal-plugins/system/presentation/src/components/video-editor/projectPersistence'
import { CURSOR_MOTION_PRESETS } from '../../internal-plugins/system/presentation/src/components/video-editor/cursorMotionPresets'
import { buildExportRenderOptions } from '../../internal-plugins/system/presentation/src/components/video-editor/export/buildExportRenderOptions'
import { getWebcamOverlayPosition } from '../../internal-plugins/system/presentation/src/components/video-editor/webcamOverlay'
import { normalizeEditorPreferences } from '../../internal-plugins/system/presentation/src/components/video-editor/editorPreferences'
import { transformCrop } from '../../internal-plugins/system/presentation/src/components/video-editor/cropGeometry'

describe('presentation settings persistence', () => {
  it('migrates old focused defaults once while keeping explicit new choices and saved project timing', () => {
    expect(
      normalizeEditorPreferences({ zoomInDurationMs: 200, zoomOutDurationMs: 200 }).zoomInDurationMs
    ).toBe(CURSOR_MOTION_PRESETS.smooth.zoomInDurationMs)
    expect(
      normalizeEditorPreferences({
        motionDefaultsVersion: 1,
        zoomInDurationMs: 200,
        zoomOutDurationMs: 200
      }).zoomInDurationMs
    ).toBe(200)
    expect(
      normalizeProjectEditor({ zoomInDurationMs: 200, zoomOutDurationMs: 200 }).zoomInDurationMs
    ).toBe(200)
  })

  it('keeps background and video corners independent and source audio visible by default', () => {
    const editor = normalizeProjectEditor({
      sourceAudioVisibilityVersion: 1,
      backgroundBorderRadius: 12,
      borderRadius: 24,
      clipRegions: [
        { id: 'clip-1', startMs: 0, endMs: 2000 },
        { id: 'clip-2', startMs: 2000, endMs: 4000, showSourceAudio: false }
      ]
    })
    expect(editor.backgroundBorderRadius).toBe(12)
    expect(editor.borderRadius).toBe(24)
    expect(editor.clipRegions.map((c) => c.showSourceAudio)).toEqual([true, false])
    expect(
      normalizeProjectEditor({
        clipRegions: [{ id: 'old', startMs: 0, endMs: 1000, showSourceAudio: false }]
      }).clipRegions[0].showSourceAudio
    ).toBe(true)
  })
  it('fills fresh projects with smooth motion, connected zoom and full webcam roundness', () => {
    const state = normalizeProjectEditor({})
    expect(state.connectZooms).toBe(true)
    expect(state.zoomInDurationMs).toBe(CURSOR_MOTION_PRESETS.smooth.zoomInDurationMs)
    expect(state.zoomOutDurationMs).toBe(CURSOR_MOTION_PRESETS.smooth.zoomOutDurationMs)
    expect(state.webcam.roundness).toBe(100)
  })

  it('preserves focused zoom when independent cursor values differ from a bundled preset', () => {
    const state = normalizeProjectEditor({
      zoomInDurationMs: 200,
      zoomOutDurationMs: 200,
      connectZooms: false,
      cursorSize: 4.5,
      cursorSmoothing: 0.4,
      cursorClickBounce: 0,
      cursorSpringStiffnessMultiplier: 1.7
    })
    expect(normalizeProjectEditor(JSON.parse(JSON.stringify(state)))).toMatchObject({
      zoomInDurationMs: 200,
      zoomOutDurationMs: 200,
      connectZooms: false,
      cursorSize: 4.5,
      cursorSmoothing: 0.4,
      cursorClickBounce: 0,
      cursorSpringStiffnessMultiplier: 1.7
    })
  })

  it('retires a saved classic switch while keeping explicit zoom timing', () => {
    const state = normalizeProjectEditor({
      zoomClassicMode: true,
      zoomInDurationMs: 200,
      zoomOutDurationMs: 200
    })
    expect(state.zoomClassicMode).toBe(false)
    expect(state.zoomInDurationMs).toBe(200)
    expect(state.zoomOutDurationMs).toBe(200)
  })

  it('keeps saved custom camera position and explicit zero roundness through export preparation', () => {
    const state = normalizeProjectEditor({
      webcam: {
        enabled: true,
        sourcePath: 'C:/sample/camera.mp4',
        positionPreset: 'custom',
        positionX: 0.34,
        positionY: 0.27,
        roundness: 0
      } as any
    })
    const restored = normalizeProjectEditor(JSON.parse(JSON.stringify(state)))
    const render = buildExportRenderOptions({
      appearance: restored,
      timeline: restored,
      effectiveSpeedRegions: [],
      effectiveZoomRegions: [],
      effectiveCursorTelemetry: [],
      effectiveShowCursor: false,
      previewWidth: 640,
      previewHeight: 360,
      shadowIntensity: 0,
      onProgress: () => {}
    } as any)
    expect(render.webcam).toMatchObject({
      positionPreset: 'custom',
      positionX: 0.34,
      positionY: 0.27,
      roundness: 0
    })
    const positions = [1, 3].map((scale) =>
      getWebcamOverlayPosition({
        containerWidth: 640 * scale,
        containerHeight: 360 * scale,
        width: 100 * scale,
        height: 100 * scale,
        margin: 8 * scale,
        positionPreset: restored.webcam.positionPreset,
        positionX: restored.webcam.positionX,
        positionY: restored.webcam.positionY,
        legacyCorner: restored.webcam.corner
      })
    )
    expect(positions[1].x).toBeCloseTo(positions[0].x * 3)
    expect(positions[1].y).toBeCloseTo(positions[0].y * 3)
  })
})

describe('crop editing geometry', () => {
  const crop = { x: 0.2, y: 0.2, width: 0.5, height: 0.4 }
  it('moves the entire selection without changing its shape and clamps edges', () => {
    expect(transformCrop(crop, 'move', 10, -10)).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.4 })
  })
  it('resizes from every corner without crossing the opposite anchor', () => {
    for (const handle of ['nw', 'ne', 'sw', 'se'] as const) {
      const result = transformCrop(crop, handle, 0.07, -0.06)
      expect(result.width).toBeGreaterThan(0)
      expect(result.height).toBeGreaterThan(0)
      expect(result.x + result.width).toBeLessThanOrEqual(1)
      expect(result.y + result.height).toBeLessThanOrEqual(1)
    }
    expect(transformCrop(crop, 'nw', 0.1, 0.1).x).toBeCloseTo(0.3)
  })
  it('draws in reverse and preserves locked aspect ratios at boundaries', () => {
    const draw = transformCrop(crop, 'draw', -0.4, -0.3, undefined, { x: 0.8, y: 0.7 })
    expect(draw.x).toBeCloseTo(0.4)
    expect(draw.y).toBeCloseTo(0.4)
    const fixed = transformCrop(crop, 'se', 2, 2, 1)
    expect(fixed.width / fixed.height).toBeCloseTo(1)
    expect(fixed.x + fixed.width).toBeCloseTo(1)
  })
})
