import { useEffect, useState } from 'react'
import type { useTimelineEditingController } from '../hooks/useTimelineEditingController'
import type { useAppearanceState } from '../state/useAppearanceState'
import type { useTimelineState } from '../state/useTimelineState'
import { editMediaSegment, getWebcamTimelineSegments, removeWebcamSegment } from '../mediaSegments'
import { canSplitRegion, splitTimelineRegion } from '../timeline/regionSplit'
import type { TimelineItemAction, TimelineItemTarget } from '../timeline/TimelineItemMenu'
import {
  findClipAtTimelineTime,
  getClipSourceStartMs,
  type AnnotationRegion,
  type AudioRegion,
  type CaptionCue,
  type ClipRegion,
  type MediaSegment,
  type SourceAudioTrackSettings,
  type ZoomRegion
} from '../types'
import type { TimelineRegion } from '../timeline/core/timelineTypes'
import type { ClipSequenceSpan } from '../timeline/core/timelineTypes'
import { reorderTimedRegions } from '../timeline/core/trackArrangement'
import { findPasteTime, findPasteTrack } from '../timeline/timelineClipboard'

type ClipClipboard =
  | { variant: 'clip'; region: ClipRegion; audio?: SourceAudioTrackSettings }
  | { variant: 'audio'; region: AudioRegion }
  | { variant: 'annotation'; region: AnnotationRegion }
  | { variant: 'zoom'; region: ZoomRegion }
  | {
      variant: 'webcam'
      region: MediaSegment
      sourcePath: string | null
      sourceDurationMs?: number
      timeOffsetMs: number
      enabled: boolean
    }
  | { variant: 'caption'; region: CaptionCue }

interface TimelineItemCommands {
  cameraSegments: MediaSegment[]
  selectedCameraId: string | null
  selectCameraSegment: (id: string | null) => void
  changeCameraSpan: (id: string, span: ClipSequenceSpan) => void
  getActions: (target: TimelineItemTarget) => TimelineItemAction[]
  canSplitSelected: boolean
  splitSelected: () => void
}

/**
 * 统一选中片段的剪刀与右键操作，摄像头独立区间沿项目保存链持久化。
 * @param timeline 当前项目轨道与选区。
 * @param appearance 当前摄像头素材和外观状态。
 * @param editing 已有轨道命令及时间投影。
 * @param activeSection 当前侧栏分类。
 * @param selectCamera 打开摄像头侧栏。
 * @param sourceKey 当前项目和素材身份，切换时释放片段剪贴板。
 * @returns 当前分割状态、片段菜单和摄像头轨道操作。
 */
export function useTimelineItemCommands(
  timeline: ReturnType<typeof useTimelineState>,
  appearance: ReturnType<typeof useAppearanceState>,
  editing: ReturnType<typeof useTimelineEditingController>,
  activeSection: string,
  selectCamera: () => void,
  sourceKey: string
): TimelineItemCommands {
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<ClipClipboard | null>(null)
  useEffect(() => setClipboard(null), [sourceKey])
  const { webcam, setWebcam } = appearance
  const { projection } = editing
  const durationMs = Math.round(projection.timelineDuration * 1000)
  const cameraSegments = webcam.sourcePath ? getWebcamTimelineSegments(webcam, durationMs) : []
  useEffect(() => {
    // 只为缺失区间的新摄像头素材补轨，不恢复用户已删除的空轨。
    if (!webcam.sourcePath || webcam.segments || !webcam.sourceDurationMs || !durationMs) return
    setWebcam((current) =>
      current.sourcePath === webcam.sourcePath && !current.segments
        ? { ...current, segments: getWebcamTimelineSegments(current, durationMs) }
        : current
    )
  }, [webcam.sourcePath, webcam.sourceDurationMs, webcam.segments, durationMs, setWebcam])
  useEffect(() => {
    if (
      activeSection !== 'webcam' ||
      timeline.selectedClipId ||
      timeline.selectedAudioId ||
      timeline.selectedZoomId ||
      timeline.selectedAnnotationId ||
      timeline.selectedCaptionId
    )
      setSelectedCameraId(null)
  }, [
    activeSection,
    timeline.selectedClipId,
    timeline.selectedAudioId,
    timeline.selectedZoomId,
    timeline.selectedAnnotationId,
    timeline.selectedCaptionId
  ])
  useEffect(() => setSelectedCameraId(null), [webcam.sourcePath])

  const selected: TimelineItemTarget | null = timeline.selectedClipId
    ? { id: timeline.selectedClipId, variant: 'clip' }
    : timeline.selectedAudioId
      ? { id: timeline.selectedAudioId, variant: 'audio' }
      : timeline.selectedZoomId
        ? { id: timeline.selectedZoomId, variant: 'zoom' }
        : timeline.selectedAnnotationId
          ? { id: timeline.selectedAnnotationId, variant: 'annotation' }
          : timeline.selectedCaptionId
            ? { id: timeline.selectedCaptionId, variant: 'caption' }
            : selectedCameraId
              ? { id: selectedCameraId, variant: 'webcam' }
              : null
  const cut = Math.round(projection.timelinePlayheadTime * 1000)

  /**
   * 对右键目标做独立快照，复制不修改项目或撤销历史。
   * @param target 实际右键片段身份。
   * @returns 无返回值；仅更新当前编辑会话的剪贴板。
   */
  function copy(target: TimelineItemTarget): void {
    if (target.variant === 'caption') {
      const fragment = projection.effectiveCaptionRegions.find(
        (item) => item.id === target.id || item.sourceCueId === target.id
      )
      if (!fragment) return
      /**
       * 将字幕词源时间映射到当前可见片段。
       * @param ms 源素材毫秒时间。
       * @returns 时间轴毫秒时间。
       */
      const toTimeline = (ms: number): number =>
        fragment.clip.startMs + (ms - getClipSourceStartMs(fragment.clip)) / fragment.clip.speed
      // 字幕源坐标先投影到复制的可见片段，不能把被裁掉的前后文字时长带入粘贴。
      const region: CaptionCue = {
        id: fragment.id,
        startMs: fragment.startMs,
        endMs: fragment.endMs,
        text: fragment.text,
        words: fragment.words
          ?.filter(
            (word) =>
              toTimeline(word.endMs) > fragment.startMs && toTimeline(word.startMs) < fragment.endMs
          )
          .map((word) => ({
            ...word,
            startMs: Math.max(fragment.startMs, toTimeline(word.startMs)),
            endMs: Math.min(fragment.endMs, toTimeline(word.endMs))
          }))
      }
      setClipboard(structuredClone({ variant: 'caption', region }))
      return
    }
    if (target.variant === 'clip') {
      const region = timeline.clipRegions.find((item) => item.id === target.id)
      if (region)
        setClipboard(
          structuredClone({
            variant: 'clip',
            region: { ...region, sourceStartMs: getClipSourceStartMs(region) },
            audio: timeline.sourceAudioTrackSettingsByClip[target.id]
          })
        )
    } else if (target.variant === 'audio') {
      const region = timeline.audioRegions.find((item) => item.id === target.id)
      if (region) setClipboard(structuredClone({ variant: 'audio', region }))
    } else if (target.variant === 'annotation') {
      const region = timeline.annotationRegions.find((item) => item.id === target.id)
      if (region) setClipboard(structuredClone({ variant: 'annotation', region }))
    } else if (target.variant === 'zoom') {
      const region = timeline.zoomRegions.find((item) => item.id === target.id)
      if (region) setClipboard(structuredClone({ variant: 'zoom', region }))
    } else if (target.variant === 'webcam') {
      const region = cameraSegments.find((item) => item.id === target.id)
      if (region)
        setClipboard(
          structuredClone({
            variant: 'webcam',
            region,
            sourcePath: webcam.sourcePath,
            sourceDurationMs: webcam.sourceDurationMs,
            timeOffsetMs: webcam.timeOffsetMs,
            enabled: webcam.enabled
          })
        )
    }
  }

  /**
   * 解析当前剪贴板可粘贴的时间，单轨寻找空隙，多轨保留完整时长。
   * @returns 粘贴起点；素材已换或没有完整空间时返回空值。
   */
  function pasteTime(): number | null {
    if (!clipboard) return null
    if (clipboard.variant === 'clip') return Math.min(cut, durationMs)
    const length = clipboard.region.endMs - clipboard.region.startMs
    if (clipboard.variant === 'webcam')
      return clipboard.sourcePath &&
        (clipboard.sourcePath === webcam.sourcePath || !webcam.sourcePath)
        ? findPasteTime(cameraSegments, cut, length, durationMs)
        : null
    if (clipboard.variant === 'zoom')
      return findPasteTime(timeline.zoomRegions, cut, length, durationMs)
    if (clipboard.variant === 'caption') {
      const clip = findClipAtTimelineTime(cut, timeline.clipRegions)
      return clip
        ? findPasteTime(projection.effectiveCaptionRegions, cut, length, clip.endMs)
        : null
    }
    return cut + length <= durationMs ? cut : null
  }

  /**
   * 发布一个拥有新身份的完整副本，保留素材偏移、样式、轨道与字幕词时间。
   * @returns 无返回值；一次粘贴通过现有持久状态链形成一个历史步骤。
   */
  function paste(): void {
    const startMs = pasteTime()
    if (!clipboard || startMs === null) return
    const id = `${clipboard.variant}-${crypto.randomUUID()}`
    const endMs = startMs + clipboard.region.endMs - clipboard.region.startMs
    if (clipboard.variant === 'clip') {
      editing.clipCommands.handleClipPaste({ ...clipboard.region, id }, startMs, clipboard.audio)
    } else if (clipboard.variant === 'audio') {
      const region = {
        ...structuredClone(clipboard.region),
        id,
        startMs,
        endMs,
        trackIndex: findPasteTrack(
          timeline.audioRegions,
          startMs,
          endMs,
          clipboard.region.trackIndex
        )
      }
      timeline.setAudioRegions((current) => [...current, region])
      editing.audioCommands.handleSelectAudio(id)
    } else if (clipboard.variant === 'annotation') {
      const copied = clipboard.region
      const region = {
        ...structuredClone(clipboard.region),
        id,
        startMs,
        endMs,
        zIndex: Math.max(0, ...timeline.annotationRegions.map((item) => item.zIndex)) + 1,
        trackIndex: findPasteTrack(
          timeline.annotationRegions.filter(
            (item) => (item.type === 'keystroke') === (copied.type === 'keystroke')
          ),
          startMs,
          endMs,
          copied.trackIndex
        )
      }
      timeline.setAnnotationRegions((current) => [...current, region])
      editing.handleSelectAnnotation(id)
    } else if (clipboard.variant === 'zoom') {
      const region = { ...structuredClone(clipboard.region), id, startMs, endMs }
      timeline.setZoomRegions((current) => [...current, region])
      editing.zoomCommands.handleSelectZoom(id)
    } else if (clipboard.variant === 'webcam') {
      const copied = clipboard
      const region = { ...structuredClone(clipboard.region), id, startMs, endMs }
      // 当前项目删空后允许从所属会话剪贴板恢复来源，已有不同来源仍由粘贴校验拦截。
      setWebcam((current) => ({
        ...current,
        ...(!current.sourcePath
          ? {
              sourcePath: copied.sourcePath,
              sourceDurationMs: copied.sourceDurationMs,
              timeOffsetMs: copied.timeOffsetMs,
              enabled: copied.enabled,
              visibleRanges: undefined
            }
          : {}),
        segments: [
          ...(current.sourcePath ? getWebcamTimelineSegments(current, durationMs) : []),
          region
        ]
      }))
      selectCameraSegment(id)
    } else {
      const copied = clipboard.region
      const clip = findClipAtTimelineTime(startMs, timeline.clipRegions)
      if (!clip) return
      /**
       * 按目标视频速度将时间轴字幕词转换到源素材坐标。
       * @param ms 粘贴后的时间轴毫秒时间。
       * @returns 目标素材毫秒时间。
       */
      const toSource = (ms: number): number =>
        Math.round(getClipSourceStartMs(clip) + (ms - clip.startMs) * clip.speed)
      const region: CaptionCue = {
        ...structuredClone(clipboard.region),
        id,
        startMs: toSource(startMs),
        endMs: toSource(endMs),
        words: copied.words?.map((word) => ({
          ...word,
          startMs: toSource(startMs + word.startMs - copied.startMs),
          endMs: toSource(startMs + word.endMs - copied.startMs)
        }))
      }
      timeline.setAutoCaptions((current) =>
        [...current, region].sort((a, b) => a.startMs - b.startMs)
      )
      timeline.setSelectedCaptionId(id)
      timeline.setSelectedClipId(null)
      timeline.setSelectedZoomId(null)
      timeline.setSelectedAudioId(null)
      timeline.setSelectedAnnotationId(null)
    }
    editing.playback.handleSeek(startMs / 1000, { pause: true })
  }

  /**
   * 按类型和标识寻找片段，不能退回游标下的其他轨道。
   * @param target 用户选中的片段身份。
   * @returns 对应时间区间或空值。
   */
  function findRegion(target: TimelineItemTarget): TimelineRegion | undefined {
    const regions =
      target.variant === 'clip'
        ? timeline.clipRegions
        : target.variant === 'audio'
          ? timeline.audioRegions
          : target.variant === 'zoom'
            ? timeline.zoomRegions
            : target.variant === 'annotation'
              ? timeline.annotationRegions
              : target.variant === 'webcam'
                ? cameraSegments
                : projection.effectiveCaptionRegions
    return regions.find(
      (region) =>
        region.id === target.id ||
        ('sourceCueId' in region &&
          region.sourceCueId === target.id &&
          cut >= region.startMs &&
          cut < region.endMs)
    )
  }
  /**
   * 对明确目标执行分割，保持其余轨道和媒体时长不变。
   * @param target 要分割的已选中片段。
   * @returns 无有效切点时不修改；成功时发布两个相邻片段。
   */
  function split(target: TimelineItemTarget): void {
    if (!canSplitRegion(findRegion(target), cut)) return
    /**
     * 为新片段分配跨轨道唯一身份，避免与已保存的片段编号冲突。
     * @returns 目标类型与随机标识组成的新身份。
     */
    const createId = (): string => `${target.variant}-${crypto.randomUUID()}`
    if (target.variant === 'clip') editing.clipCommands.handleClipSplit(cut, target.id)
    else if (target.variant === 'audio')
      timeline.setAudioRegions((current) =>
        current.flatMap((region) =>
          region.id === target.id ? splitTimelineRegion(region, cut, createId) : [region]
        )
      )
    else if (target.variant === 'zoom')
      timeline.setZoomRegions((current) =>
        current.flatMap((region) =>
          region.id === target.id ? splitTimelineRegion(region, cut, createId) : [region]
        )
      )
    else if (target.variant === 'annotation')
      timeline.setAnnotationRegions((current) =>
        current.flatMap((region) =>
          region.id === target.id ? splitTimelineRegion(region, cut, createId) : [region]
        )
      )
    else if (target.variant === 'webcam')
      setWebcam((current) => ({
        ...current,
        segments: getWebcamTimelineSegments(current, durationMs).flatMap((region) =>
          region.id === target.id ? splitTimelineRegion(region, cut, createId) : [region]
        )
      }))
    else {
      const fragment = projection.effectiveCaptionRegions.find(
        (cue) => cue.id === target.id || cue.sourceCueId === target.id
      )
      if (fragment)
        editing.captionCommands.handleCaptionSplit(
          fragment.sourceCueId,
          projection.mapTimelineTimeToSourceTime(cut)
        )
    }
  }
  /**
   * 为实际右键目标生成操作，菜单不依赖上一次侧栏选区。
   * @param target 右键目标身份。
   * @returns 该类型支持的菜单项。
   */
  function getActions(target: TimelineItemTarget): TimelineItemAction[] {
    if (!findRegion(target)) return []
    const actions: TimelineItemAction[] = [
      { label: '复制', run: () => copy(target) },
      { label: '粘贴', disabled: pasteTime() === null, run: paste },
      {
        label: '在游标处分割',
        disabled: !canSplitRegion(findRegion(target), cut),
        run: () => split(target)
      }
    ]
    if (target.variant === 'audio') {
      const region = timeline.audioRegions.find((region) => region.id === target.id)!
      actions.push(
        {
          label: region.volume ? '静音音频' : '恢复音量',
          run: () =>
            timeline.setAudioRegions((current) =>
              current.map((item) =>
                item.id === target.id ? { ...item, volume: item.volume ? 0 : 1 } : item
              )
            )
        },
        {
          label: '删除片段',
          destructive: true,
          run: () => editing.audioCommands.handleAudioDelete(target.id)
        }
      )
    } else if (target.variant === 'clip') {
      actions.push({
        label: '删除片段',
        destructive: true,
        run: () => editing.clipCommands.handleClipDelete(target.id)
      })
    } else if (target.variant === 'zoom')
      actions.push({
        label: '删除片段',
        destructive: true,
        run: () => editing.zoomCommands.handleZoomDelete(target.id)
      })
    else if (target.variant === 'annotation')
      actions.push({
        label: '删除片段',
        destructive: true,
        run: () => editing.annotationCommands.handleAnnotationDelete(target.id)
      })
    else if (target.variant === 'webcam')
      actions.push({
        label: '删除片段',
        destructive: true,
        run: () => {
          // 删除最终片段时一并撤下来源引用，恢复由完整项目历史负责。
          setWebcam((current) => removeWebcamSegment(current, target.id, durationMs))
          setSelectedCameraId(null)
        }
      })
    else
      actions.push({
        label: '删除片段',
        destructive: true,
        run: () => {
          const fragment = projection.effectiveCaptionRegions.find(
            (cue) => cue.id === target.id || cue.sourceCueId === target.id
          )
          if (fragment) editing.captionCommands.handleCaptionDelete(fragment.sourceCueId)
        }
      })
    return actions
  }
  /**
   * 选择摄像头并暂停定位到起点，清除其他片段选区。
   * @param id 当前摄像头片段标识，空值清除选择。
   * @returns 无返回值；同步侧栏和轨道选择。
   */
  function selectCameraSegment(id: string | null): void {
    setSelectedCameraId(id)
    if (!id) return
    const region = cameraSegments.find((segment) => segment.id === id)
    if (region) editing.playback.handleSeek(region.startMs / 1000, { pause: true })
    timeline.setSelectedClipId(null)
    timeline.setSelectedAudioId(null)
    timeline.setSelectedZoomId(null)
    timeline.setSelectedAnnotationId(null)
    timeline.setSelectedCaptionId(null)
    selectCamera()
  }
  /**
   * 发布摄像头插入换位、移动或裁剪，保留每段的源素材偏移。
   * @param id 摄像头片段标识。
   * @param span 拖动后的时间区间及可选插入位置。
   * @returns 无返回值；更新当前项目摄像头区间。
   */
  function changeCameraSpan(id: string, span: ClipSequenceSpan): void {
    if (span.sequenceIndex !== undefined) {
      setWebcam((current) => ({
        ...current,
        segments: reorderTimedRegions(
          getWebcamTimelineSegments(current, durationMs),
          id,
          span.sequenceIndex!
        )
      }))
      return
    }
    setWebcam((current) => ({
      ...current,
      segments: getWebcamTimelineSegments(current, durationMs).map((region) => {
        if (region.id !== id) return region
        const trimLeft = Math.abs(span.end - span.start - (region.endMs - region.startMs)) > 1
        const boundedStart = trimLeft
          ? Math.max(span.start, region.startMs - region.sourceStartMs)
          : span.start
        const edited = editMediaSegment(region, boundedStart, span.end, trimLeft)
        return {
          ...edited,
          endMs: Math.min(
            edited.endMs,
            edited.startMs + (current.sourceDurationMs ?? durationMs) - edited.sourceStartMs
          )
        }
      })
    }))
  }
  return {
    cameraSegments,
    selectedCameraId,
    selectCameraSegment,
    changeCameraSpan,
    getActions,
    canSplitSelected: Boolean(selected && canSplitRegion(findRegion(selected), cut)),
    splitSelected: () => {
      if (selected) split(selected)
    }
  }
}
