import { PlaybackAction } from './PlaybackAction'
import { Skeleton } from '@presentation/components/ui/skeleton'
import {
  CaretDown,
  Check,
  Crop,
  MagicWand,
  Plus,
  Scissors
} from '@presentation/components/ui/icons'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useRef } from 'react'
import { Button } from '@presentation/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@presentation/components/ui/dropdown-menu'
import type { useI18n } from '@presentation/contexts/I18nContext'
import {
  ASPECT_RATIOS,
  type AspectRatio,
  getAspectRatioLabel
} from '@presentation/utils/aspectRatioUtils'
import type { useVideoEditorAudio } from '../audio/useVideoEditorAudio'
import type { CaptionEditTarget } from '../captionEditing'
import type { useAnnotationRegionCommands } from '../hooks/useAnnotationRegionCommands'
import type { useEditorPlaybackControls } from '../hooks/useEditorPlaybackControls'
import type { useTimelineProjection } from '../hooks/useTimelineProjection'
import type { useZoomRegionCommands } from '../hooks/useZoomRegionCommands'
import type { useAppearanceState } from '../state/useAppearanceState'
import type { useTimelineState } from '../state/useTimelineState'
import type { TimelineEditorHandle } from '../timeline/TimelineEditor'
import type { VideoPlaybackRef } from '../VideoPlayback'
import { EditorVideoPreview, type PreviewFullscreenHandle } from './EditorVideoPreview'
import { PreviewTransport, type PreviewTransportState } from './PreviewTransport'

type Props = {
  canSplitSelected: boolean
  t: ReturnType<typeof useI18n>['t']
  videoPath: string | null
  previewVersion: number
  aspectRatio: AspectRatio
  setAspectRatio: Dispatch<SetStateAction<AspectRatio>>
  previewAspectRatioValue: number
  videoPlaybackRef: RefObject<VideoPlaybackRef | null>
  timelineRef: RefObject<TimelineEditorHandle | null>
  currentTime: number
  isPlaying: boolean
  previewVolume: number
  setPreviewVolume: Dispatch<SetStateAction<number>>
  suspendRendering: boolean
  appearance: ReturnType<typeof useAppearanceState>
  timeline: ReturnType<typeof useTimelineState>
  audio: ReturnType<typeof useVideoEditorAudio>
  projection: ReturnType<typeof useTimelineProjection>
  playback: ReturnType<typeof useEditorPlaybackControls>
  zoomCommands: ReturnType<typeof useZoomRegionCommands>
  annotationCommands: ReturnType<typeof useAnnotationRegionCommands>
  effectiveCursorTelemetry: ReturnType<typeof useTimelineState>['cursorTelemetry']
  effectiveShowCursor: boolean
  isCropped: boolean
  handleOpenCropEditor: () => void
  handleSaveAutoCaptionEdit: (target: CaptionEditTarget, text: string) => void
  handleSelectAnnotation: (id: string | null) => void
  setDuration: Dispatch<SetStateAction<number>>
  isPreviewReady: boolean
  setIsPreviewReady: Dispatch<SetStateAction<boolean>>
  setCurrentTime: Dispatch<SetStateAction<number>>
  setIsPlaying: Dispatch<SetStateAction<boolean>>
  setError: (message: string | null) => void
}

/**
 * 显示媒体预览和播放工具栏，剪刀仅在选中片段有有效切点时可用。
 * @param props 当前素材、片段选择、播放和外观设置。
 * @returns 预览区域及操作工具栏。
 */
export function EditorPreviewPanel(props: Props) {
  const {
    t,
    videoPath,
    previewVersion,
    aspectRatio,
    setAspectRatio,
    previewAspectRatioValue,
    videoPlaybackRef,
    timelineRef,
    currentTime,
    isPlaying,
    previewVolume,
    setPreviewVolume,
    suspendRendering,
    appearance,
    timeline,
    audio,
    projection,
    playback,
    zoomCommands,
    annotationCommands,
    effectiveCursorTelemetry,
    effectiveShowCursor,
    isCropped,
    handleOpenCropEditor,
    handleSaveAutoCaptionEdit,
    handleSelectAnnotation,
    setDuration,
    isPreviewReady,
    setIsPreviewReady,
    setCurrentTime,
    setIsPlaying,
    setError
  } = props

  const previewControl = useRef<PreviewFullscreenHandle | null>(null)
  const { zoomPlayback } = projection
  const transport: PreviewTransportState = {
    currentTime: zoomPlayback
      ? zoomPlayback.toOutputMs(projection.timelinePlayheadTime * 1000) / 1000
      : projection.timelinePlayheadTime,
    duration: zoomPlayback
      ? zoomPlayback.toOutputMs(projection.timelineDuration * 1000) / 1000
      : projection.timelineDuration,
    isPlaying,
    volume: previewVolume,
    disabled: !videoPath || !isPreviewReady,
    onSeek: zoomPlayback
      ? (seconds) => playback.handleTimelineSeek(zoomPlayback.toEditMs(seconds * 1000) / 1000)
      : playback.handleTimelineSeek,
    onTogglePlayback: playback.togglePlayPause,
    onSkipBack: playback.handlePreviewSkipBack,
    onSkipForward: playback.handlePreviewSkipForward,
    onVolumeChange: setPreviewVolume
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-10 shrink-0 items-center justify-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                  <span className="font-medium">{getAspectRatioLabel(aspectRatio)}</span>
                  <CaretDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {ASPECT_RATIOS.map((ratio) => (
                  <DropdownMenuItem
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className="flex cursor-pointer items-center justify-between gap-3 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  >
                    <span>{getAspectRatioLabel(ratio)}</span>
                    {aspectRatio === ratio ? <Check className="h-3 w-3 text-accent" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="h-4 w-px bg-foreground/20" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenCropEditor}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <Crop className="h-3.5 w-3.5" />
              <span className="font-medium">{t('settings.crop.title')}</span>
              {isCropped ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
            </Button>
          </div>
          <div
            className="flex min-h-0 w-full flex-1 items-stretch px-4 py-3"
            style={{ flex: '1 1 auto', margin: 0 }}
          >
            <div
              className="editor-preview-stage flex min-h-0 min-w-0 flex-1 items-center justify-center"
              style={{ containerType: 'size' }}
            >
              <div
                className="editor-preview-frame relative"
                style={{
                  width: `min(100cqw, calc(100cqh * ${previewAspectRatioValue}))`,
                  height: `min(100cqh, calc(100cqw / ${previewAspectRatioValue}))`,
                  aspectRatio: previewAspectRatioValue,
                  maxWidth: '100%',
                  margin: '0 auto',
                  boxSizing: 'border-box'
                }}
              >
                {videoPath && !isPreviewReady && (
                  <Skeleton
                    aria-label="正在加载预览"
                    className="pointer-events-none absolute inset-0 z-20 h-full w-full rounded-xl"
                  />
                )}
                <EditorVideoPreview
                  controlRef={previewControl}
                  transport={transport}
                  videoPath={videoPath}
                  previewVersion={previewVersion}
                  aspectRatio={aspectRatio}
                  playbackRef={videoPlaybackRef}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  previewVolume={previewVolume}
                  suspendRendering={suspendRendering}
                  appearance={appearance}
                  timeline={timeline}
                  audio={audio}
                  effectiveZoomRegions={projection.effectiveZoomRegions}
                  zoomPlayback={zoomPlayback}
                  effectiveCursorTelemetry={effectiveCursorTelemetry}
                  effectiveShowCursor={effectiveShowCursor}
                  setDuration={setDuration}
                  setIsPreviewReady={setIsPreviewReady}
                  setCurrentTime={setCurrentTime}
                  setIsPlaying={setIsPlaying}
                  setError={setError}
                  handlers={{
                    onSelectZoom: zoomCommands.handleSelectZoom,
                    onZoomFocusChange: zoomCommands.handleZoomFocusChange,
                    onEditAutoCaption: handleSaveAutoCaptionEdit,
                    onSelectAnnotation: handleSelectAnnotation,
                    onAnnotationPositionChange: annotationCommands.handleAnnotationPositionChange,
                    onAnnotationRotationChange: annotationCommands.handleAnnotationRotationChange,
                    onAnnotationSizeChange: annotationCommands.handleAnnotationSizeChange
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="editor-playback relative grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4">
        <div className="editor-playback-tools z-10 flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9 gap-2 px-3">
                <Plus className="h-3.5 w-3.5" />
                <span className="font-medium">{t('editor.toolbar.addLayer')}</span>
                <CaretDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  // 统一交给注释命令分配空闲轨道，不另建只增不复用的轨道策略。
                  timelineRef.current?.addAnnotation()
                }}
                className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                {t('timeline.annotation.label')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const nextTrack =
                    timeline.audioRegions.length > 0
                      ? Math.max(...timeline.audioRegions.map((region) => region.trackIndex ?? 0)) +
                        1
                      : 0
                  timelineRef.current?.addAudio(nextTrack)
                }}
                className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                {t('timeline.audio.label')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PlaybackAction
            onClick={() => timelineRef.current?.suggestZooms()}
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={t('timeline.zoom.suggestZooms')}
          >
            <MagicWand className="h-4 w-4" />
          </PlaybackAction>
          <PlaybackAction
            onClick={() => timelineRef.current?.splitClip()}
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="分割选中片段"
            title={props.canSplitSelected ? '在游标处分割选中片段' : '选中片段并将游标移至片段内部'}
            disabled={!props.canSplitSelected}
          >
            <Scissors className="h-4 w-4" />
          </PlaybackAction>
        </div>

        <div className="editor-playback-center z-10 flex min-w-0 items-center justify-center">
          <PreviewTransport
            {...transport}
            onToggleFullscreen={() => void previewControl.current?.toggle()}
          />
        </div>
      </div>
    </div>
  )
}
