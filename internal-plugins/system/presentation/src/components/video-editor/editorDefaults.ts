import { normalizeProjectEditor, type ProjectEditorState } from './projectPersistence'
import { DEFAULT_ZOOM_DEPTH, type EditorEffectSection } from './types'
import { hasWebcamFootage } from './mediaSegments'

const sectionFields = {
  scene: [
    'wallpaper',
    'shadowIntensity',
    'backgroundBlur',
    'backgroundBorderRadius',
    'borderRadius',
    'padding',
    'aspectRatio'
  ],
  cursor: [
    'showCursor',
    'loopCursor',
    'cursorStyle',
    'cursorSize',
    'cursorSmoothing',
    'cursorSpringStiffnessMultiplier',
    'cursorSpringDampingMultiplier',
    'cursorSpringMassMultiplier',
    'cursorMotionBlur',
    'cursorClickEffect',
    'cursorClickEffectColor',
    'cursorClickEffectScale',
    'cursorClickEffectOpacity',
    'cursorClickEffectDurationMs',
    'cursorClickBounce',
    'cursorClickBounceDuration',
    'cursorSway'
  ],
  zoom: [
    'connectZooms',
    'zoomInDurationMs',
    'zoomInOverlapMs',
    'zoomOutDurationMs',
    'connectedZoomGapMs',
    'connectedZoomDurationMs',
    'zoomInEasing',
    'zoomOutEasing',
    'connectedZoomEasing',
    'zoomMotionBlur',
    'zoomMotionBlurTuning',
    'zoomSmoothness',
    'zoomClassicMode',
    'cameraSpringStiffnessMultiplier',
    'cameraSpringDampingMultiplier',
    'cameraSpringMassMultiplier'
  ],
  captions: ['autoCaptionSettings']
} satisfies Record<string, (keyof ProjectEditorState)[]>

/**
 * 为新录制、导入及重置创建独立的出厂编辑模型，不读取其他项目的偏好。
 * @returns 外观、轨道、字幕及裁剪均为默认值的独立模型。
 */
export function createDefaultProjectEditor(): ProjectEditorState {
  return normalizeProjectEditor({})
}

/**
 * 按当前检查器恢复出厂选项，保留其他分类、素材身份与片段时间。
 * @param editor 当前项目的完整编辑模型。
 * @param section 用户点击重置的检查器分类。
 * @param selectedId 当前选中缩放或音频；片段独立选项仅作用于该片段。
 * @returns 一份应用指定重置的新模型；未支持的分类原样返回。
 */
export function resetProjectEditorSection(
  editor: ProjectEditorState,
  section: EditorEffectSection,
  selectedId: string | null
): ProjectEditorState {
  const defaults = createDefaultProjectEditor()
  if (section === 'audio')
    return {
      ...editor,
      audioRegions: editor.audioRegions.map((region) =>
        region.id === selectedId
          ? { ...region, volume: 1, normalize: false, fadeInMs: 0, fadeOutMs: 0 }
          : region
      )
    }
  if (section === 'webcam') {
    // 摄像头重置外观和显示，保留素材时长、同步偏移及用户剪辑。
    const { sourcePath, timeOffsetMs, sourceDurationMs, segments, visibleRanges } = editor.webcam
    return {
      ...editor,
      webcam: {
        ...defaults.webcam,
        enabled: hasWebcamFootage(editor.webcam),
        sourcePath,
        timeOffsetMs,
        sourceDurationMs,
        segments,
        visibleRanges
      }
    }
  }
  const category = section === 'frame' || section === 'crop' ? 'scene' : section
  if (!(category in sectionFields)) return editor
  const fields = sectionFields[category as keyof typeof sectionFields]
  const patch = Object.fromEntries(fields.map((key) => [key, defaults[key]]))
  return {
    ...editor,
    ...patch,
    ...(category === 'zoom'
      ? {
          zoomRegions: editor.zoomRegions.map((region) =>
            region.id === selectedId
              ? {
                  ...region,
                  depth: DEFAULT_ZOOM_DEPTH,
                  scale: undefined,
                  playbackRate: undefined,
                  animationRate: undefined,
                  camera: undefined,
                  mode: 'auto' as const
                }
              : region
          )
        }
      : {})
  }
}
