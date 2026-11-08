import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from 'react'
import './preview-fullscreen.css'
import type { AspectRatio } from '@presentation/utils/aspectRatioUtils'
import type { useVideoEditorAudio } from '../audio/useVideoEditorAudio'
import type { useAppearanceState } from '../state/useAppearanceState'
import type { useTimelineState } from '../state/useTimelineState'
import type { CursorTelemetryPoint, ZoomRegion } from '../types'
import VideoPlayback, { type VideoPlaybackRef } from '../VideoPlayback'
import { PreviewTransport, type PreviewTransportState } from './PreviewTransport'

export type PreviewFullscreenHandle = { toggle: () => Promise<void> }

type PlaybackProps = ComponentProps<typeof VideoPlayback>
type Handlers = Pick<
  PlaybackProps,
  | 'onSelectZoom'
  | 'onZoomFocusChange'
  | 'onEditAutoCaption'
  | 'onSelectAnnotation'
  | 'onAnnotationPositionChange'
  | 'onAnnotationSizeChange'
  | 'onAnnotationRotationChange'
>

type Props = {
  videoPath: string | null
  previewVersion: number
  aspectRatio: AspectRatio
  playbackRef: RefObject<VideoPlaybackRef | null>
  currentTime: number
  isPlaying: boolean
  previewVolume: number
  suspendRendering: boolean
  appearance: ReturnType<typeof useAppearanceState>
  timeline: ReturnType<typeof useTimelineState>
  audio: ReturnType<typeof useVideoEditorAudio>
  effectiveZoomRegions: ZoomRegion[]
  effectiveCursorTelemetry: CursorTelemetryPoint[]
  effectiveShowCursor: boolean
  setDuration: Dispatch<SetStateAction<number>>
  setIsPreviewReady: Dispatch<SetStateAction<boolean>>
  setCurrentTime: Dispatch<SetStateAction<number>>
  setIsPlaying: Dispatch<SetStateAction<boolean>>
  setError: (message: string | null) => void
  handlers: Handlers
  controlRef: RefObject<PreviewFullscreenHandle | null>
  transport: PreviewTransportState
}

/**
 * 将编辑状态接入预览，并让人像拖放沿项目外观保存链更新。
 * @param props 当前素材、时间轴、外观状态及预览控制。
 * @returns 编辑器视频预览。
 */
export function EditorVideoPreview({
  videoPath,
  previewVersion,
  aspectRatio,
  playbackRef,
  currentTime,
  isPlaying,
  previewVolume,
  suspendRendering,
  appearance,
  timeline,
  audio,
  effectiveZoomRegions,
  effectiveCursorTelemetry,
  effectiveShowCursor,
  setDuration,
  setIsPreviewReady,
  setCurrentTime,
  setIsPlaying,
  setError,
  handlers,
  controlRef,
  transport
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [switchingFullscreen, setSwitchingFullscreen] = useState(false)
  const nativeFullscreen = useRef(false)
  const fullscreenRequest = useRef(0)
  useEffect(() => {
    const node = frameRef.current
    setFullscreen(false)
    setFullscreenError(null)
    setSwitchingFullscreen(false)
    /**
     * 同步浏览器全屏状态，Esc 退出后恢复原有编辑布局。
     * @returns 无返回值；仅更新会话 UI。
     */
    function sync(): void {
      if (!nativeFullscreen.current) setFullscreen(document.fullscreenElement === node)
    }
    /**
     * 原生回退全屏在提示层之前处理 Esc，保留模态对话框和菜单的关闭优先级。
     * @param event 当前按键事件。
     * @returns 无返回值；浏览器全屏由 Chromium 自身处理 Esc。
     */
    function escape(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || !nativeFullscreen.current) return
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')
      )
        return
      // 提示层可消费冒泡的Esc；全屏控制从捕获阶段完成同一次退出。
      event.preventDefault()
      event.stopPropagation()
      void window.electronAPI
        .setPreviewFullscreen?.(false)
        .then(() => {
          nativeFullscreen.current = false
          setFullscreen(false)
        })
        .catch(() => setFullscreenError('无法退出全屏预览，请重试。'))
    }
    const unsubscribe = window.electronAPI.onPreviewFullscreenChanged?.((active) => {
      nativeFullscreen.current = active
      setFullscreen(active || document.fullscreenElement === node)
    })
    document.addEventListener('fullscreenchange', sync)
    window.addEventListener('keydown', escape, true)
    return () => {
      // 换项目和卸载使未完成请求失效，恢复所属窗口并解除所有监听。
      fullscreenRequest.current++
      document.removeEventListener('fullscreenchange', sync)
      window.removeEventListener('keydown', escape, true)
      unsubscribe?.()
      if (document.fullscreenElement === node) void document.exitFullscreen().catch(() => {})
      if (nativeFullscreen.current)
        void window.electronAPI.setPreviewFullscreen?.(false).catch(() => {})
      nativeFullscreen.current = false
    }
  }, [videoPath, previewVersion])
  useEffect(() => {
    if (!fullscreenError) return
    // 提示只属于预览操作，自动消失且不污染媒体加载错误。
    const timer = window.setTimeout(() => setFullscreenError(null), 6000)
    return () => window.clearTimeout(timer)
  }, [fullscreenError])
  /**
   * 将当前预览节点切换到全屏，不重建播放器、素材或播放时钟。
   * @returns 完成切换；两条全屏路径均失败时只显示可关闭的局部提示。
   */
  async function toggleFullscreen(): Promise<void> {
    const request = ++fullscreenRequest.current
    setSwitchingFullscreen(true)
    setFullscreenError(null)
    try {
      if (nativeFullscreen.current) {
        await window.electronAPI.setPreviewFullscreen?.(false)
        nativeFullscreen.current = false
        if (request === fullscreenRequest.current) setFullscreen(false)
      } else if (document.fullscreenElement === frameRef.current) await document.exitFullscreen()
      else {
        const node = frameRef.current
        const rect = node?.querySelector('[data-preview-frame]')?.getBoundingClientRect()
        if (!node || !rect) return
        node.style.setProperty('--fullscreen-ratio', String(rect.width / Math.max(1, rect.height)))
        try {
          await node.requestFullscreen()
        } catch (error) {
          // 本地 file 页面或宿主限制 DOM 全屏时，使用有会话所有权的原生窗口。
          if (request !== fullscreenRequest.current) return
          if (!window.electronAPI.setPreviewFullscreen) throw error
          nativeFullscreen.current = true
          await window.electronAPI.setPreviewFullscreen(true)
          if (request === fullscreenRequest.current) setFullscreen(true)
          else {
            nativeFullscreen.current = false
            await window.electronAPI.setPreviewFullscreen(false)
          }
        }
      }
    } catch {
      nativeFullscreen.current = false
      if (request === fullscreenRequest.current) setFullscreenError('无法切换全屏预览，请重试。')
    } finally {
      if (request === fullscreenRequest.current) setSwitchingFullscreen(false)
    }
  }
  useImperativeHandle(controlRef, () => ({ toggle: toggleFullscreen }))
  return (
    <div
      ref={frameRef}
      className="presentation-preview-fullscreen relative w-full"
      data-fullscreen-preview={fullscreen}
    >
      <VideoPlayback
        clipRegions={timeline.clipRegions}
        key={`${videoPath || 'no-video'}:${previewVersion}:inline`}
        aspectRatio={aspectRatio}
        ref={playbackRef}
        videoPath={videoPath || ''}
        onDurationChange={setDuration}
        onPreviewReadyChange={setIsPreviewReady}
        onTimeUpdate={setCurrentTime}
        onFrameTime={audio.syncPreviewFrame}
        currentTime={currentTime}
        onPlayStateChange={setIsPlaying}
        onError={setError}
        wallpaper={appearance.wallpaper}
        zoomRegions={effectiveZoomRegions}
        selectedZoomId={timeline.selectedZoomId}
        isPlaying={isPlaying}
        showShadow={appearance.shadowIntensity > 0}
        shadowIntensity={appearance.shadowIntensity}
        backgroundBlur={appearance.backgroundBlur}
        connectZooms={appearance.connectZooms}
        zoomInDurationMs={appearance.zoomInDurationMs}
        zoomInOverlapMs={appearance.zoomInOverlapMs}
        zoomOutDurationMs={appearance.zoomOutDurationMs}
        connectedZoomGapMs={appearance.connectedZoomGapMs}
        connectedZoomDurationMs={appearance.connectedZoomDurationMs}
        zoomInEasing={appearance.zoomInEasing}
        zoomOutEasing={appearance.zoomOutEasing}
        connectedZoomEasing={appearance.connectedZoomEasing}
        borderRadius={appearance.borderRadius}
        backgroundBorderRadius={appearance.backgroundBorderRadius}
        padding={appearance.padding}
        cropRegion={appearance.cropRegion}
        webcam={appearance.webcam}
        onWebcamChange={appearance.setWebcam}
        webcamVideoPath={appearance.webcam.sourcePath ? appearance.resolvedWebcamVideoUrl : null}
        annotationRegions={timeline.visibleAnnotationRegions}
        autoCaptions={timeline.autoCaptions}
        autoCaptionSettings={timeline.autoCaptionSettings}
        selectedAnnotationId={timeline.selectedAnnotationId}
        cursorTelemetry={effectiveCursorTelemetry}
        showCursor={effectiveShowCursor}
        cursorStyle={appearance.cursorStyle}
        cursorSize={appearance.cursorSize}
        cursorSmoothing={appearance.cursorSmoothing}
        cursorSpringStiffnessMultiplier={appearance.cursorSpringStiffnessMultiplier}
        cursorSpringDampingMultiplier={appearance.cursorSpringDampingMultiplier}
        cursorSpringMassMultiplier={appearance.cursorSpringMassMultiplier}
        cameraSpringStiffnessMultiplier={appearance.cameraSpringStiffnessMultiplier}
        cameraSpringDampingMultiplier={appearance.cameraSpringDampingMultiplier}
        cameraSpringMassMultiplier={appearance.cameraSpringMassMultiplier}
        zoomSmoothness={appearance.zoomSmoothness}
        zoomClassicMode={appearance.zoomClassicMode}
        zoomMotionBlur={appearance.zoomMotionBlur}
        zoomMotionBlurTuning={appearance.zoomMotionBlurTuning}
        cursorMotionBlur={appearance.cursorMotionBlur}
        cursorClickEffect={appearance.cursorClickEffect}
        cursorClickEffectColor={appearance.cursorClickEffectColor}
        cursorClickEffectScale={appearance.cursorClickEffectScale}
        cursorClickEffectOpacity={appearance.cursorClickEffectOpacity}
        cursorClickEffectDurationMs={appearance.cursorClickEffectDurationMs}
        cursorClickBounce={appearance.cursorClickBounce}
        cursorClickBounceDuration={appearance.cursorClickBounceDuration}
        cursorSway={appearance.cursorSway}
        volume={
          audio.shouldMutePreviewVideo || audio.isCurrentClipMuted
            ? 0
            : Math.max(0, Math.min(1, previewVolume * audio.embeddedSourcePreviewGain))
        }
        suspendRendering={suspendRendering}
        onAnnotationMaskChange={(id, maskStrokes) =>
          timeline.setAnnotationRegions((regions) =>
            regions.map((region) =>
              region.id === id ? { ...region, style: { ...region.style, maskStrokes } } : region
            )
          )
        }
        {...handlers}
      />
      {fullscreenError && (
        <div
          role="status"
          className="absolute left-3 top-3 z-[3001] flex items-center gap-3 rounded-lg bg-black/85 px-3 py-2 text-sm text-white"
        >
          {fullscreenError}
          <button type="button" aria-label="关闭全屏提示" onClick={() => setFullscreenError(null)}>
            关闭
          </button>
        </div>
      )}
      {fullscreen && (
        <div className="absolute bottom-3 left-1/2 z-[3000] w-[min(90vw,960px)] -translate-x-1/2">
          <PreviewTransport
            {...transport}
            fullscreen
            switchingFullscreen={switchingFullscreen}
            onToggleFullscreen={() => void toggleFullscreen()}
          />
        </div>
      )}
    </div>
  )
}
