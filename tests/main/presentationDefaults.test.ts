import { describe, expect, it } from 'vitest'
import {
  createDefaultProjectEditor,
  resetProjectEditorSection
} from '../../internal-plugins/system/presentation/src/components/video-editor/editorDefaults'
import {
  buildKeyboardAnnotations,
  DEFAULT_KEYBOARD_STYLE
} from '../../internal-plugins/system/presentation/src/components/video-editor/keyboardDisplay'

describe('演示项目默认值及分类重置边界', () => {
  it('新项目有独立的外观、裁剪与空轨道，不会携带上个模型的编辑', () => {
    const first = createDefaultProjectEditor()
    first.padding.top = 75
    first.webcam.sourcePath = 'old.mp4'
    first.trackOrder.push('old')
    const next = createDefaultProjectEditor()
    expect(next.padding.top).toBe(20)
    expect(next.webcam.sourcePath).toBeNull()
    expect(next.trackOrder).toEqual([])
    expect(next.cropRegion).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(next.autoCaptionSettings.enabled).toBe(false)
  })

  it('场景和光标恢复固定出厂值，保留裁剪及其他分类', () => {
    const defaults = createDefaultProjectEditor()
    const current = {
      ...defaults,
      wallpaper: '#000000',
      padding: { top: 10, bottom: 20, left: 30, right: 40, linked: false },
      cursorSize: 5,
      showCursor: false,
      cursorClickEffect: 'ripple' as const,
      cropRegion: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }
    }
    const scene = resetProjectEditorSection(current, 'scene', null)
    expect(scene.padding).toEqual(defaults.padding)
    expect(scene.wallpaper).toBe(defaults.wallpaper)
    expect(scene.cursorSize).toBe(5)
    expect(scene.cropRegion).toEqual(current.cropRegion)
    const cursor = resetProjectEditorSection(current, 'cursor', null)
    expect(cursor.showCursor).toBe(true)
    expect(cursor.cursorSize).toBe(defaults.cursorSize)
    expect(cursor.cursorClickEffect).toBe(defaults.cursorClickEffect)
    expect(cursor.padding).toEqual(current.padding)
    expect(current.showCursor).toBe(false)
  })

  it('摄像头重置恢复显示与外观，完整保留素材、时长、偏移及剪辑', () => {
    const defaults = createDefaultProjectEditor()
    const webcam = {
      ...defaults.webcam,
      enabled: false,
      width: 25,
      height: 70,
      mirror: false,
      sourcePath: 'camera.mp4',
      sourceDurationMs: 5000,
      timeOffsetMs: 300,
      segments: [{ id: 'camera-1', startMs: 500, endMs: 3000, sourceStartMs: 700 }]
    }
    const reset = resetProjectEditorSection({ ...defaults, webcam }, 'webcam', null).webcam
    expect(reset).toEqual({
      ...defaults.webcam,
      enabled: true,
      sourcePath: webcam.sourcePath,
      timeOffsetMs: 300,
      sourceDurationMs: 5000,
      segments: webcam.segments,
      visibleRanges: undefined
    })
    expect(resetProjectEditorSection(defaults, 'webcam', null).webcam.enabled).toBe(false)
    expect(
      resetProjectEditorSection(
        { ...defaults, webcam: { ...webcam, visibleRanges: [] } },
        'webcam',
        null
      ).webcam.enabled
    ).toBe(true)
    expect(
      resetProjectEditorSection(
        { ...defaults, webcam: { ...webcam, segments: [] } },
        'webcam',
        null
      ).webcam.enabled
    ).toBe(false)
  })

  it('缩放重置包含全部通用参数，仅改动选中片段的模式和倍率', () => {
    const defaults = createDefaultProjectEditor()
    const zoomRegions = [0, 1].map((index) => ({
      id: `zoom-${index}`,
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
      depth: 6 as const,
      mode: 'manual' as const,
      focus: { cx: 0.2, cy: 0.8 }
    }))
    const current = {
      ...defaults,
      connectZooms: false,
      zoomInOverlapMs: 20,
      connectedZoomGapMs: 80,
      zoomInEasing: 'linear' as const,
      cameraSpringMassMultiplier: 2,
      zoomRegions
    }
    const reset = resetProjectEditorSection(current, 'zoom', 'zoom-0')
    expect(reset.connectZooms).toBe(true)
    expect(reset.zoomInOverlapMs).toBe(defaults.zoomInOverlapMs)
    expect(reset.connectedZoomGapMs).toBe(defaults.connectedZoomGapMs)
    expect(reset.zoomInEasing).toBe(defaults.zoomInEasing)
    expect(reset.cameraSpringMassMultiplier).toBe(defaults.cameraSpringMassMultiplier)
    expect(reset.zoomRegions).toEqual([
      { ...zoomRegions[0], depth: 2, mode: 'auto' },
      zoomRegions[1]
    ])
  })

  it('字幕重置不清空正文，按键新建与重置使用同一完整外观', () => {
    const defaults = createDefaultProjectEditor()
    const captions = [{ id: 'caption', startMs: 0, endMs: 1000, text: '保留字幕' }]
    const reset = resetProjectEditorSection(
      {
        ...defaults,
        autoCaptions: captions,
        autoCaptionSettings: {
          ...defaults.autoCaptionSettings,
          enabled: true,
          language: 'zh',
          fontSize: 80
        }
      },
      'captions',
      null
    )
    expect(reset.autoCaptions).toEqual(captions)
    expect(reset.autoCaptionSettings).toEqual(defaults.autoCaptionSettings)
    expect(
      buildKeyboardAnnotations([{ timeMs: 100, cx: 0.5, cy: 0.5, keyText: 'A' }], 2000, 0)[0].style
    ).toEqual(DEFAULT_KEYBOARD_STYLE)
  })

  it('音频重置只恢复当前片段的声音选项，其他片段与素材起点保留', () => {
    const defaults = createDefaultProjectEditor()
    const audioRegions = ['one', 'two'].map((id) => ({
      id,
      audioPath: 'source.wav',
      startMs: 500,
      endMs: 2000,
      sourceStartMs: 700,
      volume: 0.4,
      normalize: true,
      fadeInMs: 200,
      fadeOutMs: 300,
      trackIndex: 1
    }))
    const reset = resetProjectEditorSection({ ...defaults, audioRegions }, 'audio', 'one')
    expect(reset.audioRegions).toEqual([
      { ...audioRegions[0], volume: 1, normalize: false, fadeInMs: 0, fadeOutMs: 0 },
      audioRegions[1]
    ])
  })
})
