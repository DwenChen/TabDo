import type { Span } from 'dnd-timeline'
import { normalizeZoomCamera } from '../zoomCamera'
import { normalizeZoomRate } from '../zoomPlayback'
import type { ZoomCameraPatch } from '../ZoomCameraControls'
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react'
import {
  clampFocusToDepth,
  DEFAULT_AUTO_ZOOM_DEPTH,
  DEFAULT_ZOOM_DEPTH,
  type EditorEffectSection,
  type ZoomDepth,
  type ZoomFocus,
  type ZoomMode,
  type ZoomRegion
} from '../types'

interface UseZoomRegionCommandsParams {
  zoomRegions: ZoomRegion[]
  handleSeek: (time: number, options: { pause: boolean }) => void
  setSelectedClipId: Dispatch<SetStateAction<string | null>>
  videoPath: string | null
  setZoomRegions: Dispatch<SetStateAction<ZoomRegion[]>>
  selectedZoomId: string | null
  setSelectedZoomId: Dispatch<SetStateAction<string | null>>
  setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>
  setSelectedAudioId: Dispatch<SetStateAction<string | null>>
  setSelectedCaptionId: Dispatch<SetStateAction<string | null>>
  setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>
  nextZoomIdRef: MutableRefObject<number>
  autoSuggestedVideoPathRef: MutableRefObject<string | null>
  pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>
}

/**
 * 管理变焦片段的创建、选择与参数，选中时定位有效时间并进入变焦检查器。
 * @param params 当前视频、片段状态和选区更新入口。
 * @returns 所属变焦编辑命令。
 */
export function useZoomRegionCommands({
  zoomRegions,
  handleSeek,
  setSelectedClipId,
  videoPath,
  setZoomRegions,
  selectedZoomId,
  setSelectedZoomId,
  setSelectedAnnotationId,
  setSelectedAudioId,
  setSelectedCaptionId,
  setActiveEffectSection,
  nextZoomIdRef,
  autoSuggestedVideoPathRef,
  pendingFreshRecordingAutoZoomPathRef
}: UseZoomRegionCommandsParams) {
  /**
   * 选择变焦片段，暂停并定位到起点，重复选择也重新定位。
   * @param id 目标变焦身份；空值仅清除选区。
   * @returns 无返回值；选择不创建编辑历史，手动浏览仍可离开当前片段。
   */
  const handleSelectZoom = useCallback(
    (id: string | null) => {
      setSelectedZoomId(id)
      if (id) {
        // 先定位有效预览时间，再同步互斥选区；选择本身不修改片段模型。
        const region = zoomRegions.find((item) => item.id === id)
        if (region) handleSeek(region.startMs / 1000, { pause: true })
        setActiveEffectSection('zoom')
        setSelectedAnnotationId(null)
        setSelectedClipId(null)
        setSelectedAudioId(null)
        setSelectedCaptionId(null)
      }
    },
    [
      zoomRegions,
      handleSeek,
      setActiveEffectSection,
      setSelectedAnnotationId,
      setSelectedClipId,
      setSelectedAudioId,
      setSelectedCaptionId,
      setSelectedZoomId
    ]
  )

  const markFreshRecordingSuggestion = useCallback(() => {
    if (videoPath && pendingFreshRecordingAutoZoomPathRef.current === videoPath) {
      autoSuggestedVideoPathRef.current = videoPath
      pendingFreshRecordingAutoZoomPathRef.current = null
    }
  }, [autoSuggestedVideoPathRef, pendingFreshRecordingAutoZoomPathRef, videoPath])

  /**
   * 创建默认缩放并同步互斥选区和侧栏。
   * @param span 用户确认的可用毫秒区间。
   * @returns 无返回值；发布新缩放并进入其设置。
   */
  const handleZoomAdded = useCallback(
    (span: Span) => {
      const id = `zoom-${nextZoomIdRef.current++}`
      const depth = DEFAULT_ZOOM_DEPTH
      const newRegion: ZoomRegion = {
        id,
        startMs: Math.round(span.start),
        endMs: Math.round(span.end),
        depth,
        focus: clampFocusToDepth({ cx: 0.5, cy: 0.5 }, depth),
        // Mode describes camera tracking behavior, not how the region was created.
        mode: 'auto'
      }
      markFreshRecordingSuggestion()
      setZoomRegions((current) => [...current, newRegion])
      setSelectedZoomId(id)
      setSelectedAnnotationId(null)
      setSelectedClipId(null)
      setSelectedCaptionId(null)
      setSelectedAudioId(null)
      setActiveEffectSection('zoom')
    },
    [
      markFreshRecordingSuggestion,
      nextZoomIdRef,
      setActiveEffectSection,
      setSelectedAudioId,
      setSelectedAnnotationId,
      setSelectedClipId,
      setSelectedCaptionId,
      setSelectedZoomId,
      setZoomRegions
    ]
  )

  const handleZoomSuggested = useCallback(
    (span: Span, focus: ZoomFocus) => {
      const newRegion: ZoomRegion = {
        id: `zoom-${nextZoomIdRef.current++}`,
        startMs: Math.round(span.start),
        endMs: Math.round(span.end),
        depth: DEFAULT_AUTO_ZOOM_DEPTH,
        focus: clampFocusToDepth(focus, DEFAULT_AUTO_ZOOM_DEPTH),
        mode: 'auto'
      }
      markFreshRecordingSuggestion()
      setZoomRegions((current) => [...current, newRegion])
    },
    [markFreshRecordingSuggestion, nextZoomIdRef, setZoomRegions]
  )

  const handleZoomSpanChange = useCallback(
    (id: string, span: Span) => {
      setZoomRegions((current) =>
        current.map((region) =>
          region.id === id
            ? {
                ...region,
                startMs: Math.round(span.start),
                endMs: Math.round(span.end)
              }
            : region
        )
      )
    },
    [setZoomRegions]
  )
  const handleZoomFocusChange = useCallback(
    (id: string, focus: ZoomFocus) => {
      setZoomRegions((current) =>
        current.map((region) =>
          region.id === id ? { ...region, focus: clampFocusToDepth(focus, region.depth) } : region
        )
      )
    },
    [setZoomRegions]
  )
  /**
   * 兼容旧档位命令，并清除连续倍率覆盖。
   * @param depth 原六档倍率身份。
   * @returns 无返回值；当前片段继续保留镜头和取景坐标。
   */
  const handleZoomDepthChange = useCallback(
    (depth: ZoomDepth) => {
      if (!selectedZoomId) return
      setZoomRegions((current) =>
        current.map((region) =>
          region.id === selectedZoomId
            ? { ...region, depth, scale: undefined, focus: clampFocusToDepth(region.focus, depth) }
            : region
        )
      )
    },
    [selectedZoomId, setZoomRegions]
  )
  const handleZoomModeChange = useCallback(
    (mode: ZoomMode) => {
      if (!selectedZoomId) return
      setZoomRegions((current) =>
        current.map((region) => (region.id === selectedZoomId ? { ...region, mode } : region))
      )
    },
    [selectedZoomId, setZoomRegions]
  )
  /**
   * 一次发布当前变焦片段的参数，沿既有历史与保存链生效。
   * @param patch 用户本次修改的倍率、倍速或镜头字段。
   * @returns 无返回值；没有选中片段时保持原状。
   */
  const handleZoomCameraChange = useCallback(
    (patch: ZoomCameraPatch) => {
      if (!selectedZoomId) return
      setZoomRegions((current) =>
        current.map((region) =>
          region.id === selectedZoomId
            ? {
                ...region,
                ...(patch.scale !== undefined
                  ? { scale: Math.min(5, Math.max(1, patch.scale)) }
                  : {}),
                ...(patch.playbackRate !== undefined
                  ? { playbackRate: normalizeZoomRate(patch.playbackRate) }
                  : {}),
                ...(patch.animationRate !== undefined
                  ? { animationRate: normalizeZoomRate(patch.animationRate) }
                  : {}),
                ...(patch.camera
                  ? {
                      camera: normalizeZoomCamera({
                        ...normalizeZoomCamera(region.camera),
                        ...patch.camera
                      })
                    }
                  : {})
              }
            : region
        )
      )
    },
    [selectedZoomId, setZoomRegions]
  )
  const handleZoomDelete = useCallback(
    (id: string) => {
      setZoomRegions((current) => current.filter((region) => region.id !== id))
      if (selectedZoomId === id) setSelectedZoomId(null)
    },
    [selectedZoomId, setSelectedZoomId, setZoomRegions]
  )

  return {
    handleSelectZoom,
    handleZoomAdded,
    handleZoomSuggested,
    handleZoomSpanChange,
    handleZoomFocusChange,
    handleZoomDepthChange,
    handleZoomModeChange,
    handleZoomCameraChange,
    handleZoomDelete
  }
}
