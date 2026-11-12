import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from '@presentation/components/ui/toast'
import type { useI18n } from '@presentation/contexts/I18nContext'
import type { useShortcuts } from '@presentation/contexts/ShortcutsContext'
import { useVideoEditorAudio } from '../audio/useVideoEditorAudio'
import type { useAppearanceState } from '../state/useAppearanceState'
import type { useTimelineState } from '../state/useTimelineState'
import type { TimelineEditorHandle } from '../timeline/TimelineEditor'
import type { EditorEffectSection } from '../types'
import type { VideoPlaybackRef } from '../VideoPlayback'
import { getErrorMessage, summarizeErrorMessage } from '../videoEditorUtils'
import { useAnnotationRegionCommands } from './useAnnotationRegionCommands'
import { useAudioRegionCommands } from './useAudioRegionCommands'
import { useCaptionCommands } from './useCaptionCommands'
import { useClipRegionCommands } from './useClipRegionCommands'
import { useCursorTelemetry } from './useCursorTelemetry'
import { useRecordedKeyboard } from './useRecordedKeyboard'
import { useEditorGlobalInteractions } from './useEditorGlobalInteractions'
import { useEditorPlaybackControls } from './useEditorPlaybackControls'
import { useFreshRecordingAutoZoom } from './useFreshRecordingAutoZoom'
import { useTimelineProjection } from './useTimelineProjection'
import { useZoomRegionCommands } from './useZoomRegionCommands'

type Input = {
  t: ReturnType<typeof useI18n>['t']
  shortcuts: ReturnType<typeof useShortcuts>['shortcuts']
  isMac: boolean
  appPlatform: string
  timeline: ReturnType<typeof useTimelineState>
  appearance: ReturnType<typeof useAppearanceState>
  videoPath: string | null
  videoSourcePath: string | null
  currentSourcePath: string | null
  duration: number
  currentTime: number
  isPlaying: boolean
  previewVolume: number
  loading: boolean
  isPreviewReady: boolean
  setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>
  setAutoSuggestZoomsTrigger: Dispatch<SetStateAction<number>>
  videoPlaybackRef: RefObject<VideoPlaybackRef | null>
  timelineRef: RefObject<TimelineEditorHandle | null>
  nextZoomIdRef: MutableRefObject<number>
  nextClipIdRef: MutableRefObject<number>
  nextAudioIdRef: MutableRefObject<number>
  nextAnnotationIdRef: MutableRefObject<number>
  nextAnnotationZIndexRef: MutableRefObject<number>
  clipInitializedRef: MutableRefObject<boolean>
  autoFullTrackClipIdRef: MutableRefObject<string | null>
  autoFullTrackClipEndMsRef: MutableRefObject<number | null>
  autoSuggestedVideoPathRef: MutableRefObject<string | null>
  pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>
  pendingFreshRecordingAutoSuggestTimeoutRef: MutableRefObject<number | null>
  pendingFreshRecordingAutoSuggestTelemetryCountRef: MutableRefObject<number>
  handleUndo: () => void
  handleRedo: () => void
}

/**
 * 组织播放、片段命令与录制轨道初始化，按素材身份载入鼠标和按键。
 * @param input 当前素材、编辑状态与宿主命令。
 * @returns 编辑器播放、选择和轨道操作控制器。
 */
export function useTimelineEditingController(input: Input) {
  const { timeline } = input
  const handleSourceFallbackLoadError = useCallback((error: unknown) => {
    toast.warning(`无法加载关联音频：${summarizeErrorMessage(getErrorMessage(error))}`, {
      duration: 10000
    })
  }, [])
  const cursor = useCursorTelemetry({
    videoPath: input.videoPath,
    videoSourcePath: input.videoSourcePath,
    duration: input.duration,
    loopCursor: input.appearance.loopCursor,
    timeline,
    pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
    autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef
  })
  const projection = useTimelineProjection({
    timeline,
    duration: input.duration,
    currentTime: input.currentTime,
    nextClipIdRef: input.nextClipIdRef,
    initializedRef: input.clipInitializedRef,
    autoFullTrackIdRef: input.autoFullTrackClipIdRef,
    autoFullTrackEndRef: input.autoFullTrackClipEndMsRef
  })
  // 项目恢复期间不生成轨道，避免覆盖正在装载的显示选择与按键内容。
  useRecordedKeyboard(
    timeline,
    input.loading ? null : input.videoSourcePath,
    projection.timelineDuration * 1000
  )
  const audio = useVideoEditorAudio({
    currentSourcePath: input.currentSourcePath,
    selectedClipId: timeline.selectedClipId,
    clipRegions: timeline.clipRegions,
    zoomPlayback: projection.zoomPlayback,
    audioRegions: timeline.audioRegions,
    sourceAudioTrackSettingsByClip: timeline.sourceAudioTrackSettingsByClip,
    setSourceAudioTrackSettingsByClip: timeline.setSourceAudioTrackSettingsByClip,
    defaultSourceAudioTrackSettings: timeline.defaultSourceAudioTrackSettings,
    setDefaultSourceAudioTrackSettings: timeline.setDefaultSourceAudioTrackSettings,
    timelineTime: projection.timelinePlayheadTime,
    currentTime: projection.mapTimelineTimeToSourceTime(input.currentTime * 1000) / 1000,
    duration: input.duration,
    isPlaying: input.isPlaying,
    previewVolume: input.previewVolume,
    sourceAudioFallbackRefreshKey: timeline.sourceAudioFallbackRefreshKey,
    summarizeErrorMessage,
    onSourceFallbackLoadError: handleSourceFallbackLoadError
  })
  const playback = useEditorPlaybackControls({
    videoPlaybackRef: input.videoPlaybackRef,
    timelineRef: input.timelineRef,
    playSourceAudioPreview: audio.playSourceAudioPreview,
    timelinePlayheadTime: projection.timelinePlayheadTime,
    timelineDuration: projection.timelineDuration
  })
  const captionCommands = useCaptionCommands({
    clipRegions: timeline.clipRegions,
    autoCaptions: timeline.autoCaptions,
    setAutoCaptions: timeline.setAutoCaptions,
    setAutoCaptionSettings: timeline.setAutoCaptionSettings,
    setSelectedCaptionId: timeline.setSelectedCaptionId,
    setSelectedZoomId: timeline.setSelectedZoomId,
    setSelectedClipId: timeline.setSelectedClipId,
    setSelectedAnnotationId: timeline.setSelectedAnnotationId,
    setSelectedAudioId: timeline.setSelectedAudioId,
    setActiveEffectSection: input.setActiveEffectSection,
    videoPlaybackRef: input.videoPlaybackRef,
    mapSourceTimeToTimelineTime: projection.mapSourceTimeToTimelineTime,
    handleSeek: playback.handleSeek
  })
  const zoomCommands = useZoomRegionCommands({
    zoomRegions: timeline.zoomRegions,
    handleSeek: playback.handleSeek,
    setSelectedClipId: timeline.setSelectedClipId,
    videoPath: input.videoPath,
    setZoomRegions: timeline.setZoomRegions,
    selectedZoomId: timeline.selectedZoomId,
    setSelectedZoomId: timeline.setSelectedZoomId,
    setSelectedAnnotationId: timeline.setSelectedAnnotationId,
    setSelectedAudioId: timeline.setSelectedAudioId,
    setSelectedCaptionId: timeline.setSelectedCaptionId,
    setActiveEffectSection: input.setActiveEffectSection,
    nextZoomIdRef: input.nextZoomIdRef,
    autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
    pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef
  })
  /**
   * 选择注释并定位到起点，使同一片段在浏览其他时间后仍可重新编辑。
   * @param id 目标注释身份；空值清除选区。
   * @returns 无返回值；同步侧栏、选区和必要的预览定位。
   */
  const handleSelectAnnotation = useCallback(
    (id: string | null) => {
      timeline.setSelectedAnnotationId(id)
      if (id) {
        const region = timeline.annotationRegions.find((item) => item.id === id)
        if (region) playback.handleSeek(region.startMs / 1000, { pause: true })
        input.setActiveEffectSection(
          timeline.annotationRegions.find((region) => region.id === id)?.type === 'keystroke'
            ? 'keyboard'
            : 'scene'
        )
        timeline.setSelectedClipId(null)
        timeline.setSelectedZoomId(null)
        timeline.setSelectedAudioId(null)
        timeline.setSelectedCaptionId(null)
      }
    },
    [
      playback.handleSeek,
      timeline.annotationRegions,
      input.setActiveEffectSection,
      timeline.setSelectedAnnotationId,
      timeline.setSelectedClipId,
      timeline.setSelectedZoomId,
      timeline.setSelectedAudioId,
      timeline.setSelectedCaptionId
    ]
  )
  const selectedEffect =
    timeline.annotationRegions.find((region) => region.id === timeline.selectedAnnotationId) ??
    timeline.zoomRegions.find((region) => region.id === timeline.selectedZoomId) ??
    timeline.clipRegions.find((region) => region.id === timeline.selectedClipId) ??
    timeline.audioRegions.find((region) => region.id === timeline.selectedAudioId)
  const previewPositionRef = useRef(input.currentTime)
  previewPositionRef.current = input.currentTime
  useEffect(() => {
    // 只响应选区或片段边界变化；手动拖动游标时允许浏览其他时间。
    if (!selectedEffect) return
    const timeMs = previewPositionRef.current * 1000
    if (timeMs < selectedEffect.startMs || timeMs >= selectedEffect.endMs)
      playback.handleSeek(selectedEffect.startMs / 1000, { pause: true })
  }, [selectedEffect?.id, selectedEffect?.startMs, selectedEffect?.endMs, playback.handleSeek])
  const freshZoom = useFreshRecordingAutoZoom({
    appPlatform: input.appPlatform,
    videoPath: input.videoPath,
    loading: input.loading,
    isPreviewReady: input.isPreviewReady,
    duration: input.duration,
    cursorTelemetryCount: timeline.cursorTelemetry.length,
    normalizedCursorTelemetry: cursor.normalizedCursorTelemetry,
    zoomRegions: timeline.zoomRegions,
    setZoomRegions: timeline.setZoomRegions,
    setAutoSuggestZoomsTrigger: input.setAutoSuggestZoomsTrigger,
    videoPlaybackRef: input.videoPlaybackRef,
    autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
    pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
    pendingFreshRecordingAutoSuggestTimeoutRef: input.pendingFreshRecordingAutoSuggestTimeoutRef,
    pendingFreshRecordingAutoSuggestTelemetryCountRef:
      input.pendingFreshRecordingAutoSuggestTelemetryCountRef
  })
  const clipCommands = useClipRegionCommands({
    handleSeek: playback.handleSeek,
    setSourceAudioTrackSettingsByClip: timeline.setSourceAudioTrackSettingsByClip,
    setAnnotationRegions: timeline.setAnnotationRegions,
    setAudioRegions: timeline.setAudioRegions,
    sourceDurationMs: input.duration * 1000,
    clipRegions: timeline.clipRegions,
    setClipRegions: timeline.setClipRegions,
    zoomRegions: timeline.zoomRegions,
    setZoomRegions: timeline.setZoomRegions,
    selectedClipId: timeline.selectedClipId,
    setSelectedClipId: timeline.setSelectedClipId,
    setSelectedZoomId: timeline.setSelectedZoomId,
    setSelectedAnnotationId: timeline.setSelectedAnnotationId,
    setSelectedAudioId: timeline.setSelectedAudioId,
    setSelectedCaptionId: timeline.setSelectedCaptionId,
    setActiveEffectSection: input.setActiveEffectSection,
    nextClipIdRef: input.nextClipIdRef,
    t: input.t
  })
  const audioCommands = useAudioRegionCommands({
    audioRegions: timeline.audioRegions,
    handleSeek: playback.handleSeek,
    setSelectedClipId: timeline.setSelectedClipId,
    setAudioRegions: timeline.setAudioRegions,
    selectedAudioId: timeline.selectedAudioId,
    setSelectedAudioId: timeline.setSelectedAudioId,
    setSelectedZoomId: timeline.setSelectedZoomId,
    setSelectedAnnotationId: timeline.setSelectedAnnotationId,
    setSelectedCaptionId: timeline.setSelectedCaptionId,
    setActiveEffectSection: input.setActiveEffectSection,
    nextAudioIdRef: input.nextAudioIdRef
  })
  const annotationCommands = useAnnotationRegionCommands({
    onSelectAnnotation: handleSelectAnnotation,
    setAnnotationRegions: timeline.setAnnotationRegions,
    selectedAnnotationId: timeline.selectedAnnotationId,
    setSelectedAnnotationId: timeline.setSelectedAnnotationId,
    setSelectedZoomId: timeline.setSelectedZoomId,
    nextAnnotationIdRef: input.nextAnnotationIdRef,
    nextAnnotationZIndexRef: input.nextAnnotationZIndexRef
  })

  useEditorGlobalInteractions({
    timeline,
    videoPlaybackRef: input.videoPlaybackRef,
    shortcuts: input.shortcuts,
    isMac: input.isMac,
    handleUndo: input.handleUndo,
    handleRedo: input.handleRedo,
    startPlayback: playback.startPlayback
  })

  return {
    cursor,
    projection,
    audio,
    playback,
    captionCommands,
    zoomCommands,
    clipCommands,
    audioCommands,
    annotationCommands,
    handleSelectAnnotation,
    handleAutoSuggestZoomsConsumed: freshZoom.handleAutoSuggestZoomsConsumed
  }
}
