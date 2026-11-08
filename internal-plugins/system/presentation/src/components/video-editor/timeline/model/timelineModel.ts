import { formatClipSpeedLabel } from '../../clipSpeedChange'
import type { AnnotationRegion, AudioRegion, CaptionCue, ClipRegion, ZoomRegion } from '../../types'
import { getClipSourceEndMs, getClipSourceStartMs } from '../../types'
import { CAPTION_ROW_ID, CLIP_ROW_ID, ZOOM_ROW_ID } from '../core/constants'
import {
  getAnnotationTrackIndex,
  getAnnotationTrackRowId,
  getAudioTrackIndex,
  getAudioTrackRowId,
  isAnnotationTrackRowId,
  isAudioTrackRowId
} from '../core/rows'
import type { TimelineRegionSpan, TimelineRenderItem } from '../core/timelineTypes'

export function getAnnotationLabel(region: AnnotationRegion): string {
  if (region.type === 'text' || region.type === 'keystroke') {
    const preview = region.content.trim() || '内容为空'
    return preview.length > 20 ? `${preview.substring(0, 20)}...` : preview
  }
  if (region.type === 'image') {
    return '图片'
  }
  return region.type === 'focus'
    ? '聚焦'
    : region.type === 'mosaic'
      ? '马赛克'
      : region.type === 'blur'
        ? '模糊'
        : '注释'
}

/**
 * 优先显示用户声音名称或素材文件名，缺失时使用中文通用标题。
 * @param region 当前声音片段。
 * @returns 时间轴声音名称。
 */
export function getAudioLabel(region: AudioRegion): string {
  return (
    region.label ||
    region.audioPath
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '') ||
    '音频'
  )
}

/**
 * 按字幕正文生成简短轨道名称，空字幕提供中文占位。
 * @param cue 当前字幕片段。
 * @returns 有界的字幕名称。
 */
function getCaptionLabel(cue: CaptionCue): string {
  const preview = cue.text.trim() || '字幕'
  return preview.length > 24 ? `${preview.substring(0, 24)}...` : preview
}

/**
 * 将项目片段映射为显示轨道，保留连续变焦倍率及媒体时间。
 * @param params 各类项目片段。
 * @returns 带稳定身份和显示参数的轨道项。
 */
export function buildTimelineItems(params: {
  zoomRegions: ZoomRegion[]
  clipRegions: ClipRegion[]
  annotationRegions: AnnotationRegion[]
  audioRegions: AudioRegion[]
  captionCues?: CaptionCue[]
}): TimelineRenderItem[] {
  const { zoomRegions, clipRegions, annotationRegions, audioRegions, captionCues = [] } = params
  const zooms: TimelineRenderItem[] = zoomRegions.map((region, index) => ({
    id: region.id,
    rowId: ZOOM_ROW_ID,
    span: { start: region.startMs, end: region.endMs },
    label: `变焦 ${index + 1}`,
    zoomDepth: region.depth,
    zoomScale: region.scale,
    zoomMode: region.mode ?? 'auto',
    zoomCamera: region.camera,
    variant: 'zoom'
  }))

  const clips: TimelineRenderItem[] = clipRegions.map((region, index) => {
    const speed = Number.isFinite(region.speed) && region.speed > 0 ? region.speed : 1
    const sourceEndMs = getClipSourceEndMs(region)
    const speedLabel = formatClipSpeedLabel(speed)

    return {
      id: region.id,
      rowId: CLIP_ROW_ID,
      span: { start: region.startMs, end: region.endMs },
      sourceSpan: { start: getClipSourceStartMs(region), end: sourceEndMs },
      label: speedLabel ? `Clip ${index + 1} ${speedLabel}` : `Clip ${index + 1}`,
      speedValue: speedLabel ? speed : undefined,
      showSourceAudio: region.showSourceAudio,
      muted: Boolean(region.muted),
      variant: 'clip'
    }
  })

  const annotations: TimelineRenderItem[] = annotationRegions.map((region) => ({
    id: region.id,
    rowId: getAnnotationTrackRowId(region.trackIndex ?? 0),
    span: { start: region.startMs, end: region.endMs },
    label: getAnnotationLabel(region),
    annotationType: region.type,
    variant: 'annotation'
  }))

  const audios: TimelineRenderItem[] = audioRegions.map((region) => ({
    id: region.id,
    rowId: getAudioTrackRowId(region.trackIndex ?? 0),
    span: { start: region.startMs, end: region.endMs },
    label: getAudioLabel(region),
    audioPath: region.audioPath,
    audioSourceStartMs: region.sourceStartMs ?? 0,
    audioPlaybackRate: region.playbackRate ?? 1,
    audioGain: region.volume,
    audioNormalize: Boolean(region.normalize),
    variant: 'audio'
  }))

  const captions: TimelineRenderItem[] = captionCues.map((cue) => ({
    id: cue.id,
    rowId: CAPTION_ROW_ID,
    span: { start: cue.startMs, end: cue.endMs },
    label: getCaptionLabel(cue),
    variant: 'caption'
  }))

  return [...zooms, ...clips, ...annotations, ...audios, ...captions]
}

export function buildAllRegionSpans(params: {
  annotationRegions?: AnnotationRegion[]
  captionCues?: CaptionCue[]
  zoomRegions: ZoomRegion[]
  clipRegions: ClipRegion[]
  audioRegions: AudioRegion[]
}): TimelineRegionSpan[] {
  const { zoomRegions, clipRegions, audioRegions } = params
  const zooms = zoomRegions.map((r) => ({
    id: r.id,
    start: r.startMs,
    end: r.endMs,
    rowId: ZOOM_ROW_ID
  }))
  const clips = clipRegions.map((r) => ({
    id: r.id,
    start: r.startMs,
    end: r.endMs,
    rowId: CLIP_ROW_ID
  }))
  const audios = audioRegions.map((r) => ({
    id: r.id,
    start: r.startMs,
    end: r.endMs,
    rowId: getAudioTrackRowId(r.trackIndex ?? 0)
  }))
  return [
    ...zooms,
    ...clips,
    ...audios,
    ...(params.annotationRegions ?? []).map((r) => ({
      id: r.id,
      start: r.startMs,
      end: r.endMs,
      rowId: getAnnotationTrackRowId(r.trackIndex ?? 0)
    })),
    ...(params.captionCues ?? []).map((r) => ({
      id: r.id,
      start: r.startMs,
      end: r.endMs,
      rowId: CAPTION_ROW_ID
    }))
  ]
}

export function resolveDropRowId(
  id: string,
  proposedRowId: string,
  timelineItems: TimelineRenderItem[]
) {
  const currentRowId = timelineItems.find((item) => item.id === id)?.rowId
  if (!currentRowId) {
    return proposedRowId
  }

  if (isAnnotationTrackRowId(currentRowId)) {
    return isAnnotationTrackRowId(proposedRowId)
      ? getAnnotationTrackRowId(getAnnotationTrackIndex(proposedRowId))
      : currentRowId
  }

  if (isAudioTrackRowId(currentRowId)) {
    return isAudioTrackRowId(proposedRowId)
      ? getAudioTrackRowId(getAudioTrackIndex(proposedRowId))
      : currentRowId
  }

  return currentRowId
}
