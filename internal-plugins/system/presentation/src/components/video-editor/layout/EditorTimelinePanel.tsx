import type { RefObject } from 'react'
import type { useVideoEditorAudio } from '../audio/useVideoEditorAudio'
import { retimeCaptionFragment } from '../captionTimeline'
import type { useAnnotationRegionCommands } from '../hooks/useAnnotationRegionCommands'
import type { useAudioRegionCommands } from '../hooks/useAudioRegionCommands'
import type { useCaptionCommands } from '../hooks/useCaptionCommands'
import type { useClipRegionCommands } from '../hooks/useClipRegionCommands'
import type { useEditorPlaybackControls } from '../hooks/useEditorPlaybackControls'
import type { useTimelineProjection } from '../hooks/useTimelineProjection'
import type { useZoomRegionCommands } from '../hooks/useZoomRegionCommands'
import type { useTimelineState } from '../state/useTimelineState'
import TimelineEditor, { type TimelineEditorHandle } from '../timeline/TimelineEditor'
import { WebcamTrack, WEBCAM_ROW_ID } from '../timeline/WebcamTrack'
import type { WebcamOverlaySettings } from '../types'
import type { useTimelineItemCommands } from './useTimelineItemCommands'
import { reorderTimedRegions } from '../timeline/core/trackArrangement'

type Props = {
  itemCommands: ReturnType<typeof useTimelineItemCommands>
  webcam: WebcamOverlaySettings
  onInteract: () => void
  onSelectSourceAudio: (clipId: string, trackId: string) => void
  onImportVideo: () => unknown
  panelRef?: RefObject<HTMLDivElement | null>
  timelineRef: RefObject<TimelineEditorHandle | null>
  timeline: ReturnType<typeof useTimelineState>
  projection: ReturnType<typeof useTimelineProjection>
  playback: ReturnType<typeof useEditorPlaybackControls>
  audio: ReturnType<typeof useVideoEditorAudio>
  zoomCommands: ReturnType<typeof useZoomRegionCommands>
  clipCommands: ReturnType<typeof useClipRegionCommands>
  audioCommands: ReturnType<typeof useAudioRegionCommands>
  captionCommands: ReturnType<typeof useCaptionCommands>
  annotationCommands: ReturnType<typeof useAnnotationRegionCommands>
  videoPath: string | null
  videoSourcePath: string | null
  cursorTelemetrySourcePath: string | null
  normalizedCursorTelemetry: ReturnType<typeof useTimelineState>['cursorTelemetry']
  autoSuggestZoomsTrigger: number
  handleAutoSuggestZoomsConsumed: () => void
  disableSuggestedZooms: boolean
  currentTime: number
  handleSelectAnnotation: (id: string | null) => void
}

/**
 * 渲染当前可见时间轴，并把空轨道的导入操作交给编辑器统一文件流程。
 * @param props 片段、光标与导入操作。
 * @returns 时间轴面板。
 */
export function EditorTimelinePanel(props: Props) {
  const {
    timelineRef,
    timeline,
    projection,
    playback,
    audio,
    zoomCommands,
    clipCommands,
    audioCommands,
    captionCommands,
    annotationCommands,
    videoPath,
    videoSourcePath,
    cursorTelemetrySourcePath,
    normalizedCursorTelemetry,
    autoSuggestZoomsTrigger,
    handleAutoSuggestZoomsConsumed,
    disableSuggestedZooms,
    currentTime,
    handleSelectAnnotation
  } = props

  return (
    <div
      ref={props.panelRef}
      tabIndex={-1}
      data-timeline-panel
      onPointerDownCapture={props.onInteract}
      className="outline-none flex flex-shrink-0 flex-col bg-transparent px-3 pb-2 pt-1"
      style={{ height: '36%', minHeight: 270, maxHeight: 460 }}
    >
      <TimelineEditor
        trackOrder={timeline.trackOrder}
        onTrackOrderChange={timeline.setTrackOrder}
        onReorderTrackItems={(id, index) => {
          timeline.setZoomRegions((regions) => reorderTimedRegions(regions, id, index))
          timeline.setAudioRegions((regions) => reorderTimedRegions(regions, id, index))
          timeline.setAnnotationRegions((regions) => reorderTimedRegions(regions, id, index))
          const fragments = projection.effectiveCaptionRegions
          for (const fragment of reorderTimedRegions(fragments, id, index)) {
            const previous = fragments.find((cue) => cue.id === fragment.id)!
            if (fragment.startMs === previous.startMs && fragment.endMs === previous.endMs) continue
            captionCommands.handleCaptionRetime(
              fragment.sourceCueId,
              retimeCaptionFragment(previous, { start: fragment.startMs, end: fragment.endMs })
            )
          }
        }}
        onSplitSelected={props.itemCommands.splitSelected}
        extraTracks={
          props.webcam.sourcePath && props.itemCommands.cameraSegments.length > 0 ? (
            <WebcamTrack
              path={props.webcam.sourcePath}
              segments={props.itemCommands.cameraSegments}
              selectedId={props.itemCommands.selectedCameraId}
              onSelect={props.itemCommands.selectCameraSegment}
            />
          ) : undefined
        }
        extraRegions={props.itemCommands.cameraSegments.map((segment) => ({
          id: segment.id,
          rowId: WEBCAM_ROW_ID,
          start: segment.startMs,
          end: segment.endMs
        }))}
        onExtraSpanChange={props.itemCommands.changeCameraSpan}
        onImportVideo={props.onImportVideo}
        ref={timelineRef}
        videoDuration={projection.timelineDuration}
        currentTime={currentTime}
        playheadTime={projection.timelinePlayheadTime}
        onSeek={playback.handleTimelineSeek}
        videoPath={videoPath}
        videoSourcePath={videoSourcePath}
        cursorTelemetrySourcePath={cursorTelemetrySourcePath}
        cursorTelemetry={normalizedCursorTelemetry}
        autoSuggestZoomsTrigger={autoSuggestZoomsTrigger}
        onAutoSuggestZoomsConsumed={handleAutoSuggestZoomsConsumed}
        disableSuggestedZooms={disableSuggestedZooms}
        zoomRegions={timeline.zoomRegions}
        onZoomAdded={zoomCommands.handleZoomAdded}
        onZoomSuggested={zoomCommands.handleZoomSuggested}
        onZoomSpanChange={zoomCommands.handleZoomSpanChange}
        onZoomDelete={zoomCommands.handleZoomDelete}
        selectedZoomId={timeline.selectedZoomId}
        onSelectZoom={zoomCommands.handleSelectZoom}
        trimRegions={timeline.trimRegions}
        clipRegions={timeline.clipRegions}
        onClipDelete={clipCommands.handleClipDelete}
        onClipSpanChange={clipCommands.handleClipSpanChange}
        selectedClipId={timeline.selectedClipId}
        onSelectSourceAudio={props.onSelectSourceAudio}
        onSelectClip={clipCommands.handleSelectClip}
        audioRegions={timeline.audioRegions}
        onAudioAdded={audioCommands.handleAudioAdded}
        onAudioSpanChange={audioCommands.handleAudioSpanChange}
        onAudioDelete={audioCommands.handleAudioDelete}
        selectedAudioId={timeline.selectedAudioId}
        onSelectAudio={audioCommands.handleSelectAudio}
        captionRegions={projection.effectiveCaptionRegions}
        onCaptionSpanChange={(id, span) => {
          const fragment = projection.effectiveCaptionRegions.find((cue) => cue.id === id)
          if (!fragment) return
          captionCommands.handleCaptionRetime(
            fragment.sourceCueId,
            retimeCaptionFragment(fragment, span)
          )
        }}
        selectedCaptionId={
          projection.effectiveCaptionRegions.find(
            (cue) =>
              cue.sourceCueId === timeline.selectedCaptionId &&
              currentTime * 1000 >= cue.startMs &&
              currentTime * 1000 < cue.endMs
          )?.id ??
          projection.effectiveCaptionRegions.find(
            (cue) => cue.sourceCueId === timeline.selectedCaptionId
          )?.id ??
          null
        }
        onSelectCaption={(id) => {
          const fragment = projection.effectiveCaptionRegions.find((cue) => cue.id === id)
          captionCommands.handleSelectCaption(fragment?.sourceCueId ?? null)
          if (fragment) playback.handleTimelineSeek(fragment.startMs / 1000)
        }}
        onCaptionDelete={(id) => {
          const fragment = projection.effectiveCaptionRegions.find((cue) => cue.id === id)
          if (fragment) captionCommands.handleCaptionDelete(fragment.sourceCueId)
        }}
        onCaptionAdded={captionCommands.handleCaptionAdded}
        captionsEnabled={timeline.autoCaptionSettings.enabled}
        captionQuickAddEnabled={timeline.autoCaptionSettings.timelineQuickAdd}
        annotationRegions={timeline.annotationRegions}
        onAnnotationAdded={annotationCommands.handleAnnotationAdded}
        onAnnotationSpanChange={annotationCommands.handleAnnotationSpanChange}
        onAnnotationDelete={annotationCommands.handleAnnotationDelete}
        selectedAnnotationId={timeline.selectedAnnotationId}
        onSelectAnnotation={handleSelectAnnotation}
        showSourceAudioTrack={timeline.clipRegions.some((clip) => clip.showSourceAudio !== false)}
        sourceAudioResourceVersion={timeline.sourceAudioFallbackRefreshKey}
        sourceAudioTrackSettings={audio.activeSourceAudioTrackSettings}
        getSourceAudioTrackSettingsForClip={audio.getSourceAudioTrackSettingsForClip}
        onSourceAudioAvailabilityChange={timeline.setHasClipSourceAudio}
        onSourceAudioTracksMetaChange={audio.onSourceAudioTracksMetaChange}
      />
    </div>
  )
}
