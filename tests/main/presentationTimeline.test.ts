import { resolvePreviewFrameSample } from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/previewSample'
import { describe, it, expect } from 'vitest'
import {
  editMediaSegment,
  splitMediaSegment,
  getWebcamTimelineSegments,
  hasWebcamFootage,
  removeWebcamSegment
} from '../../internal-plugins/system/presentation/src/components/video-editor/mediaSegments'
import { DEFAULT_WEBCAM_OVERLAY } from '../../internal-plugins/system/presentation/src/components/video-editor/types'
import { selectWebcamRecordingMimeType } from '../../internal-plugins/system/presentation/src/hooks/recordingMimeType'
import { buildKeyboardAnnotations } from '../../internal-plugins/system/presentation/src/components/video-editor/keyboardDisplay'
import {
  getWebcamMediaTargetTimeSeconds,
  isWebcamVisibleAtSourceTime
} from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/webcamSync'
import { normalizeProjectEditor } from '../../internal-plugins/system/presentation/src/components/video-editor/projectPersistence'
import { normalizeEditorPreferences } from '../../internal-plugins/system/presentation/src/components/video-editor/editorPreferences'
import { materializeSourceAudio } from '../../internal-plugins/system/presentation/src/components/video-editor/audio/independentSourceAudio'

describe('independent presentation tracks', () => {
  it('预览终点保留相机末帧，内部切口与较短相机片段仍按原边界隐藏', () => {
    const clips = [{ id: 'screen', startMs: 0, endMs: 3233, speed: 1 }]
    const camera = { segments: [{ id: 'camera', startMs: 0, endMs: 3233, sourceStartMs: 0 }] }
    const sample = resolvePreviewFrameSample(3.233, 3.233, clips)
    expect(sample.timelineTime).toBeLessThan(3.233)
    expect(isWebcamVisibleAtSourceTime(camera, sample.sourceTime, sample.timelineTime)).toBe(true)
    expect(
      getWebcamMediaTargetTimeSeconds({
        currentTime: sample.sourceTime,
        timelineTime: sample.timelineTime,
        segments: camera.segments
      })
    ).toBeCloseTo(3.233 - 0.000001, 8)
    const cut = resolvePreviewFrameSample(1, 1, clips)
    expect(cut).toEqual({ sourceTime: 1, timelineTime: 1 })
    expect(
      isWebcamVisibleAtSourceTime(
        { segments: [{ ...camera.segments[0], endMs: 1000 }] },
        cut.sourceTime,
        cut.timelineTime
      )
    ).toBe(false)
    expect(
      isWebcamVisibleAtSourceTime(
        { segments: [{ ...camera.segments[0], endMs: 3200 }] },
        sample.sourceTime,
        sample.timelineTime
      )
    ).toBe(false)
    expect(
      isWebcamVisibleAtSourceTime({ segments: [] }, sample.sourceTime, sample.timelineTime)
    ).toBe(false)
    expect(resolvePreviewFrameSample(4, 4, clips)).toEqual({ sourceTime: 4, timelineTime: 4 })
  })
  it('终点取样兼容源偏移、倍速和旧项目，且不移动非终点取样', () => {
    const clips = [{ id: 'screen', startMs: 0, endMs: 1000, sourceStartMs: 2000, speed: 2 }]
    const sample = resolvePreviewFrameSample(4, 1, clips)
    expect(sample.sourceTime).toBeCloseTo(4 - 0.000002, 8)
    expect(
      isWebcamVisibleAtSourceTime(
        { sourceDurationMs: 4000 },
        sample.sourceTime,
        sample.timelineTime
      )
    ).toBe(true)
    expect(resolvePreviewFrameSample(3, 0.5, clips)).toEqual({ sourceTime: 3, timelineTime: 0.5 })
    expect(resolvePreviewFrameSample(0, 0, [])).toEqual({ sourceTime: 0, timelineTime: 0 })
  })
  it('显式摄像头片段优先于旧空可见范围，删空后粘贴可以恢复编辑', () => {
    const webcam = {
      ...DEFAULT_WEBCAM_OVERLAY,
      sourcePath: 'camera.mp4',
      visibleRanges: [],
      segments: [{ id: 'pasted', startMs: 0, endMs: 2000, sourceStartMs: 300 }]
    }
    expect(hasWebcamFootage(webcam)).toBe(true)
    expect(hasWebcamFootage({ ...webcam, segments: [] })).toBe(false)
    expect(hasWebcamFootage({ ...webcam, sourcePath: null })).toBe(false)
    expect(hasWebcamFootage(undefined)).toBe(false)
  })
  it('删除摄像头片段保留其余源偏移，删空后解除引用且重开不补轨', () => {
    const webcam = {
      ...DEFAULT_WEBCAM_OVERLAY,
      enabled: true,
      sourcePath: 'camera.mp4',
      sourceDurationMs: 6000,
      segments: [
        { id: 'one', startMs: 0, endMs: 2000, sourceStartMs: 300 },
        { id: 'two', startMs: 3000, endMs: 5000, sourceStartMs: 2300 }
      ]
    }
    const partial = removeWebcamSegment(webcam, 'one', 6000)
    expect(partial.sourcePath).toBe('camera.mp4')
    expect(partial.segments).toEqual([webcam.segments[1]])
    const removed = removeWebcamSegment(partial, 'two', 6000)
    expect(removed).toMatchObject({
      enabled: false,
      sourcePath: null,
      segments: [],
      visibleRanges: []
    })
    expect(
      getWebcamTimelineSegments(normalizeProjectEditor({ webcam: removed }).webcam, 6000)
    ).toEqual([])
    expect(webcam.segments).toHaveLength(2)
    expect(removeWebcamSegment(webcam, 'missing', 6000)).toBe(webcam)
  })
  it('修复旧重置遗留的虚拟音频可见值，不改变独立音频及手动静音选择', () => {
    for (const version of [undefined, 1]) {
      const editor = normalizeProjectEditor({
        sourceAudioVisibilityVersion: version,
        clipRegions: [
          {
            id: 'screen',
            startMs: 0,
            endMs: 3000,
            speed: 1,
            muted: true,
            showSourceAudio: true,
            detachedAudioPaths: ['screen.system.wav', 'screen.mic.wav']
          }
        ],
        audioRegions: [
          { id: 'sound', audioPath: 'screen.system.wav', startMs: 0, endMs: 3000, volume: 0.4 }
        ]
      })
      expect(editor.clipRegions[0]).toMatchObject({ showSourceAudio: false, muted: true })
      expect(editor.audioRegions).toHaveLength(1)
      expect(editor.audioRegions[0].volume).toBe(0.4)
    }
  })
  it('loads separate sounds immediately and never recreates deleted audio on reopening or late companion publication', () => {
    const clips = [{ id: 'screen', startMs: 0, endMs: 2000, sourceStartMs: 400, speed: 2 }]
    const system = 'recording.system.webm'
    const mic = 'recording.mic.webm'
    /**
     * Supply persisted source settings for late companion publication.
     * @returns The system audio volume and normalization preference.
     */
    const settings = (): { system: { volume: number; normalize: boolean } } => ({
      system: { volume: 0.4, normalize: true }
    })
    const initial = materializeSourceAudio(clips, [], [system], {}, settings)
    expect(initial.regions).toHaveLength(1)
    expect(initial.regions[0]).toMatchObject({
      label: '系统音频',
      volume: 0.4,
      normalize: true,
      sourceStartMs: 400,
      playbackRate: 2
    })
    const late = materializeSourceAudio(initial.clips, [], [system, mic], { [mic]: 600 }, settings)
    expect(late.regions).toHaveLength(1)
    expect(late.regions[0]).toMatchObject({ label: '麦克风', startMs: 100, sourceStartMs: 0 })
    const reopened = normalizeProjectEditor({
      clipRegions: late.clips,
      audioRegions: late.regions,
      sourceAudioVisibilityVersion: 1
    })
    const repeated = materializeSourceAudio(
      reopened.clipRegions,
      reopened.audioRegions,
      [system, mic],
      {},
      settings
    )
    expect(repeated.regions).toEqual(reopened.audioRegions)
    expect(repeated.clips[0]).toMatchObject({
      muted: true,
      showSourceAudio: false,
      detachedAudioPaths: [system, mic]
    })
    expect(
      materializeSourceAudio([{ ...clips[0], muted: true }], [], [system], {}, settings).regions
    ).toHaveLength(0)
  })
  it('keeps camera timing in projects without applying it to the next recording through global preferences', () => {
    const webcam = {
      ...DEFAULT_WEBCAM_OVERLAY,
      width: 42,
      sourceDurationMs: 1500,
      segments: [{ id: 'camera', startMs: 200, endMs: 1200, sourceStartMs: 100 }]
    }
    const project = normalizeProjectEditor({ webcam })
    expect(project.webcam.sourceDurationMs).toBe(1500)
    expect(project.webcam.segments).toHaveLength(1)
    const preferences = normalizeEditorPreferences({ webcam })
    expect(preferences.webcam.width).toBe(42)
    expect(preferences.webcam).not.toHaveProperty('sourceDurationMs')
    expect(preferences.webcam).not.toHaveProperty('segments')
  })
  it('finalizes camera containers with duration metadata and fits tracks to actual source time', () => {
    expect(
      selectWebcamRecordingMimeType({ isTypeSupported: () => true, canPlayType: () => 'probably' })
    ).toBe('video/webm;codecs=vp8')
    const webcam = { ...DEFAULT_WEBCAM_OVERLAY, sourceDurationMs: 1800, timeOffsetMs: 200 }
    expect(getWebcamTimelineSegments(webcam, 5000)).toEqual([
      { id: 'webcam-original', startMs: 200, endMs: 2000, sourceStartMs: 0 }
    ])
    expect(getWebcamTimelineSegments({ ...webcam, timeOffsetMs: -200 }, 5000)[0]).toMatchObject({
      startMs: 0,
      endMs: 1600,
      sourceStartMs: 200
    })
    expect(getWebcamTimelineSegments(webcam, 1000)[0].endMs).toBe(1000)
    expect(isWebcamVisibleAtSourceTime(webcam, 2.1)).toBe(false)
    expect(normalizeProjectEditor({ webcam }).webcam.sourceDurationMs).toBe(1800)
  })
  it('trims and splits camera source offsets without changing video positions', () => {
    const segment = { id: 'camera', startMs: 1000, endMs: 5000, sourceStartMs: 2000 }
    const trimmed = editMediaSegment(segment, 1500, 5000, true)
    expect(trimmed.sourceStartMs).toBe(2500)
    expect(editMediaSegment(segment, 3000, 7000).sourceStartMs).toBe(2000)
    const parts = splitMediaSegment(trimmed, 3000)
    expect(parts[1].sourceStartMs).toBe(4000)
    expect(
      getWebcamMediaTargetTimeSeconds({
        currentTime: 9,
        timelineTime: 3.5,
        segments: parts,
        webcamDuration: 20
      })
    ).toBe(4.5)
    expect(isWebcamVisibleAtSourceTime({ segments: parts }, 9, 1)).toBe(false)
    expect(isWebcamVisibleAtSourceTime({ segments: parts }, 9, 3.5)).toBe(true)
    expect(isWebcamVisibleAtSourceTime({ segments: [] }, 0, 0)).toBe(false)
  })
  it('keeps physical key overlays timed and editable without baking connection choices into text', () => {
    const keys = buildKeyboardAnnotations(
      [
        { timeMs: 100, cx: 0, cy: 0, keyText: 'Ctrl + S' },
        { timeMs: 500, cx: 0, cy: 0, keyText: 'h' },
        { timeMs: 600, cx: 0, cy: 0, keyText: 'i' }
      ],
      2000,
      2
    )
    expect(keys.map((key) => key.content)).toEqual(['Ctrl + S', 'h', 'i'])
    expect(keys[0].endMs).toBe(500)
    expect(keys.every((key) => key.trackIndex === 2)).toBe(true)
    const reopened = normalizeProjectEditor({ annotationRegions: keys })
    expect(reopened.annotationRegions.map((key) => key.type)).toEqual([
      'keystroke',
      'keystroke',
      'keystroke'
    ])
  })
  it('reopens independent media timing and new scene effects', () => {
    const saved = normalizeProjectEditor({
      sourceAudioVisibilityVersion: 1,
      audioRegions: [
        {
          id: 'sound',
          audioPath: 'test.wav',
          startMs: 100,
          endMs: 2000,
          sourceStartMs: 400,
          playbackRate: 1.5,
          fadeInMs: 100,
          fadeOutMs: 300,
          volume: 0.5
        }
      ],
      webcam: {
        sourcePath: 'camera.mp4',
        segments: [{ id: 'camera', startMs: 1000, endMs: 2000, sourceStartMs: 500 }]
      },
      annotationRegions: ['focus', 'mosaic'].map((type, index) => ({
        id: String(index),
        type,
        startMs: 0,
        endMs: 1000
      }))
    })
    expect(saved.audioRegions[0]).toMatchObject({
      sourceStartMs: 400,
      playbackRate: 1.5,
      fadeInMs: 100,
      fadeOutMs: 300
    })
    expect(saved.webcam.segments?.[0].sourceStartMs).toBe(500)
    expect(saved.annotationRegions.map((region) => region.type)).toEqual(['focus', 'mosaic'])
  })
})
