import {
  Gauge,
  MagnifyingGlassPlus as ZoomIn,
  ChatCircle as MessageSquare,
  MusicNotes as Music,
  Scissors,
  SpeakerX
} from '@presentation/components/ui/icons'
import { ClipFilmstrip } from './components/filmstrip/ClipFilmstrip'
import type { Span, GetSpanFromDragEvent, GetSpanFromResizeEvent } from 'dnd-timeline'
import { useItem, useTimelineContext } from 'dnd-timeline'
import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react'
import { useTimelinePresentation } from './core/TimelinePresentation'
import { getRegionDisplaySpan, snapRegionSpan } from './core/clipPresentation'
import { resolveResizeEnd } from './dnd/engine'
import { Skeleton } from '@presentation/components/ui/skeleton'
import { cn } from '@presentation/lib/utils'
import { formatClipSpeedLabel } from '../clipSpeedChange'
import { getTimeAtClipSeam, type ClipPresentation } from './core/clipPresentation'
import { formatPlayheadTime } from './core/time'
import AudioWaveform from './components/waveform/AudioWaveform'
import type { AudioPeaksData } from './core/timelineTypes'
import glassStyles from './ItemGlass.module.css'
import { useTimelineItemMenu } from './TimelineItemMenu'
import { getZoomPresentation } from '../zoomCamera'
import { AnnotationTypeIcon } from './AnnotationTypeIcon'
import type { AnnotationType, ZoomCameraSettings, ZoomDepth } from '../types'

interface ItemProps {
  clipPresentation?: ClipPresentation[]
  displaySpan?: Span
  embedded?: boolean
  videoPath?: string | null
  sourceSpan?: Span
  id: string
  span: Span
  rowId: string
  disabled?: boolean
  children: React.ReactNode
  isSelected?: boolean
  onSelect?: () => void
  onDoubleClick?: () => void
  onSelectId?: (id: string) => void
  zoomDepth?: number
  zoomScale?: number
  zoomMode?: 'auto' | 'manual'
  zoomCamera?: ZoomCameraSettings
  annotationType?: AnnotationType
  speedValue?: number
  waveformPeaks?: AudioPeaksData | null
  waveformSegmentSpan?: Span
  waveformGain?: number
  waveformNormalize?: boolean
  muted?: boolean
  variant?: 'zoom' | 'trim' | 'clip' | 'webcam' | 'annotation' | 'speed' | 'audio' | 'caption'
  isLoading?: boolean
  loadingLabel?: string
}

/**
 * Render the current editor values with synchronized timeline interactions.
 * @param props - Current state and editing callbacks.
 * @returns The interactive editor component.
 */
export default function Item({
  clipPresentation: suppliedPresentation,
  id,
  embedded = false,
  videoPath,
  sourceSpan,
  span,
  displaySpan: suppliedDisplaySpan,
  rowId,
  disabled = false,
  isSelected = false,
  onSelect,
  onDoubleClick,
  onSelectId,
  zoomDepth = 1,
  zoomScale,
  zoomMode = 'auto',
  zoomCamera,
  annotationType,
  speedValue,
  waveformPeaks = null,
  waveformSegmentSpan,
  waveformGain = 1,
  waveformNormalize = false,
  muted = false,
  variant = 'zoom',
  isLoading = false,
  loadingLabel,
  children
}: ItemProps): ReactElement {
  const timeline = useTimelineContext()
  const openMenu = useTimelineItemMenu()
  const presentation = useTimelinePresentation()
  const clipPresentation =
    variant === 'clip' ? undefined : (suppliedPresentation ?? presentation.clips)
  const displaySpan = clipPresentation?.length
    ? getRegionDisplaySpan(span, clipPresentation)
    : (suppliedDisplaySpan ?? span)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    // 新增或跨轨选中时揭示片段；只滚动到最近可见位置，不改动时间轴比例。
    if (isSelected) nodeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isSelected])
  const targets = useMemo(
    () => [
      ...new Set(
        presentation.regions
          .filter((region) => region.id !== id)
          .flatMap((region) => [region.start, region.end])
      )
    ],
    [presentation.regions, id]
  )
  const snap = (next: Span, edge?: 'start' | 'end'): Span =>
    snapRegionSpan(next, targets, presentation.clips, timeline.pixelsToValue(1), edge)
  /**
   * 从指针位移计算媒体位置，避免滚动容器与拖动变换重复计算矩形偏移。
   * @param event 当前拖动事件。
   * @returns 保留原时长的媒体区间，无位移时返回原区间。
   */
  const getMediaSpanFromDrag: GetSpanFromDragEvent = (event) => {
    if (!('delta' in event)) return span
    const delta = timeline.pixelsToValue(event.delta.x) * (timeline.direction === 'rtl' ? -1 : 1)
    const dragged = { start: displaySpan.start + delta, end: displaySpan.end + delta }
    if (clipPresentation) {
      const start = getTimeAtClipSeam(dragged.start, clipPresentation)
      return snap({ start, end: start + span.end - span.start })
    }
    const visualOffset = displaySpan.start - span.start
    return { start: dragged.start - visualOffset, end: dragged.end - visualOffset }
  }
  const getMediaSpanFromResize: GetSpanFromResizeEvent = (event) => {
    const delta = timeline.pixelsToValue(event.delta.x)
    const edge = event.direction
    if (clipPresentation)
      return snap(
        {
          ...span,
          [edge]: getTimeAtClipSeam(displaySpan[edge] + delta, clipPresentation)
        },
        edge
      )
    const scale = (span.end - span.start) / (displaySpan.end - displaySpan.start)
    return { ...span, [edge]: span[edge] + delta * scale }
  }

  /**
   * 仅在裁剪时绘制有界几何，拖动变换由拖动库独占。
   * @param preview 校验后的媒体区间。
   * @returns 无返回值；更新当前片段的位置和宽度。
   */
  const paintPreview = (preview: Span): void => {
    const node = nodeRef.current
    if (!node || !clipPresentation) return
    const display = getRegionDisplaySpan(preview, clipPresentation)
    const side = timeline.direction === 'rtl' ? 'right' : 'left'
    node.style[side] = `${timeline.valueToPixels(display.start - timeline.range.start)}px`
    node.style.width = `${timeline.valueToPixels(display.end - display.start)}px`
    node.style.transform = 'none'
  }
  const { previewConfig } = presentation
  // 拖动时仅由拖动库更新变换；手改布局位置会被其补偿，吞掉实际位移。
  const { setNodeRef, attributes, listeners, itemStyle, itemContentStyle } = useItem({
    id,
    span: displaySpan,
    disabled: disabled || isLoading,
    data: {
      rowId,
      span,
      getSpanFromDragEvent: getMediaSpanFromDrag,
      getSpanFromResizeEvent: getMediaSpanFromResize
    },
    resizeHandleWidth: variant === 'clip' ? 12 : undefined,
    onResizeMove(event) {
      if (!clipPresentation) return
      const next = getMediaSpanFromResize(event)
      if (next) {
        const resolved = resolveResizeEnd(id, next, previewConfig)
        if (resolved) paintPreview(resolved)
      }
    }
  })

  const attachRef = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node
      setNodeRef(node)
    },
    [setNodeRef]
  )
  const timeLabel = useMemo(
    () => `${formatPlayheadTime(span.start)} – ${formatPlayheadTime(span.end)}`,
    [span.start, span.end]
  )

  if (isLoading) {
    return (
      <div
        ref={attachRef}
        style={{
          ...itemStyle,
          height: '100%',
          display: 'flex',
          alignItems: 'center'
        }}
        {...listeners}
        {...attributes}
        data-timeline-item="true"
        data-variant={variant}
        data-start-ms={span.start}
        data-end-ms={span.end}
        onMouseDownCapture={(event) => event.stopPropagation()}
        onClickCapture={(event) => event.stopPropagation()}
      >
        <Skeleton
          animationType="shimmer"
          aria-label={loadingLabel || '正在加载…'}
          className="w-full"
          style={{ height: '85%', minHeight: 22 }}
        />
      </div>
    )
  }

  const isZoom = variant === 'zoom'
  const zoomPresentation = isZoom
    ? getZoomPresentation({
        depth: zoomDepth as ZoomDepth,
        scale: zoomScale,
        mode: zoomMode,
        camera: zoomCamera
      })
    : null
  const isTrim = variant === 'trim'
  const isClip = variant === 'clip'
  const isFilmstrip = isClip || variant === 'webcam'
  const isSpeed = variant === 'speed'
  const isAudio = variant === 'audio'
  const isCaption = variant === 'caption'
  const showAudioWaveform = isAudio && Boolean(waveformPeaks)
  const clipSpeedLabel = isClip ? formatClipSpeedLabel(speedValue ?? 1) : null
  const mediaName = zoomPresentation
    ? `变焦 · ${zoomPresentation.description}`
    : isClip
      ? `录屏${clipSpeedLabel ? ` ${clipSpeedLabel}` : ''}`
      : typeof children === 'string'
        ? children
        : '片段'
  const information = `${mediaName} · ${timeLabel} · 时长 ${formatPlayheadTime(span.end - span.start)}`

  const glassClass = isZoom
    ? glassStyles.glassBlue
    : isTrim
      ? glassStyles.glassRed
      : isFilmstrip
        ? glassStyles.glassCyan
        : isSpeed
          ? glassStyles.glassAmber
          : isAudio
            ? glassStyles.glassDarkGreen
            : isCaption
              ? glassStyles.glassCaption
              : glassStyles.glassYellow

  const MIN_ITEM_PX = 6
  const handleSelect = (): void => {
    onSelect?.()
    onSelectId?.(id)
  }
  const safeItemStyle = {
    ...itemStyle,
    minWidth: MIN_ITEM_PX,
    top: '7.5%',
    height: '85%',
    overflow: isClip ? 'visible' : 'hidden',
    pointerEvents: 'auto' as const
  }

  return (
    <div
      ref={attachRef}
      style={safeItemStyle}
      {...listeners}
      {...attributes}
      aria-disabled={isLoading || (disabled && !onSelect && !onSelectId)}
      onKeyDownCapture={(event) => {
        if (disabled && !isLoading && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          event.stopPropagation()
          handleSelect()
        }
      }}
      data-timeline-item="true"
      data-variant={variant}
      data-item-id={id}
      data-selected={isSelected}
      data-start-ms={span.start}
      data-end-ms={span.end}
      aria-label={information}
      title={information}
      onPointerDownCapture={(event) => {
        // 已选片段的右键只打开操作菜单，保留用户随后设置的分割/粘贴游标。
        if (event.button !== 2 || !isSelected) handleSelect()
      }}
      onContextMenu={(event) => {
        if (!openMenu) return
        event.preventDefault()
        event.stopPropagation()
        if (!isSelected) handleSelect()
        openMenu({
          target: { id, variant },
          x: event.clientX,
          y: event.clientY,
          anchor: event.currentTarget
        })
      }}
      onDoubleClick={(event) => {
        if (!onDoubleClick) return
        event.stopPropagation()
        onDoubleClick()
      }}
      className="group h-full"
    >
      <div
        className="h-full"
        style={{
          ...itemContentStyle,
          // 帧预览自行定位可见窗口，不再叠加拖动库的离屏内边距。
          ...(isFilmstrip ? { paddingLeft: 0, paddingRight: 0 } : {}),
          overflow: isClip ? 'visible' : 'hidden',
          minWidth: MIN_ITEM_PX,
          height: '100%',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <div
          className={cn(
            glassClass,
            'timeline-block w-full flex items-center justify-center gap-1.5 relative',
            isSelected && glassStyles.selected,
            embedded && glassStyles.embeddedCaption,
            isClip ? 'overflow-visible' : 'overflow-hidden'
          )}
          style={{
            height: '100%',
            minHeight: embedded ? 18 : 22,
            minWidth: MIN_ITEM_PX,
            containerType: 'size'
          }}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          {isFilmstrip && videoPath && (
            <ClipFilmstrip
              path={videoPath}
              span={span}
              sourceSpan={sourceSpan ?? span}
              selected={isSelected}
            />
          )}
          {!isFilmstrip && (
            <div
              className={cn(glassStyles.zoomEndCap, glassStyles.left)}
              style={{
                cursor: 'col-resize'
              }}
              title="调整左侧长度"
            />
          )}
          {!isFilmstrip && (
            <div
              className={cn(glassStyles.zoomEndCap, glassStyles.right)}
              style={{
                cursor: 'col-resize'
              }}
              title="调整右侧长度"
            />
          )}
          {showAudioWaveform && waveformPeaks && (
            <AudioWaveform
              peaks={waveformPeaks}
              segmentStartMs={waveformSegmentSpan?.start ?? span.start}
              segmentEndMs={waveformSegmentSpan?.end ?? span.end}
              gain={waveformGain}
              normalize={waveformNormalize}
              className="absolute inset-0 w-full h-full pointer-events-none opacity-90"
            />
          )}
          {/* Muted overlay for source audio track items */}
          {isAudio && muted && (
            <div className="absolute inset-0 z-20 flex items-center justify-center gap-1 bg-red-900/40 pointer-events-none">
              <SpeakerX className="w-3 h-3 text-red-300/90 shrink-0" />
            </div>
          )}
          {/* Media names live in the fixed row header; retain names on accessible items and tooltips. */}
          {!isFilmstrip && !isAudio && (
            <div
              title={information}
              className={cn(
                'relative z-10 flex max-w-full items-center justify-center gap-1 px-1 text-[11px] font-medium text-black/70 dark:text-white/90 select-none overflow-hidden',
                isClip && 'rounded bg-black/65 px-2 py-1 text-white dark:text-white',
                (isZoom || embedded) && 'text-white dark:text-white',
                embedded && 'w-full justify-start px-2'
              )}
            >
              {isClip ? (
                <span className="truncate">录屏{clipSpeedLabel ? ` · ${clipSpeedLabel}` : ''}</span>
              ) : isZoom ? (
                <>
                  <ZoomIn aria-hidden="true" className="zoom-icon size-3 shrink-0" />
                  <span className="zoom-value whitespace-nowrap">
                    {zoomPresentation?.label}
                    <span className="zoom-mode font-normal">
                      {zoomMode === 'manual' ? '手动' : '自动'}
                    </span>
                  </span>
                </>
              ) : embedded ? (
                <span className="truncate">{children}</span>
              ) : (
                <>
                  {isTrim ? (
                    <Scissors className="size-3 shrink-0" />
                  ) : isSpeed ? (
                    <Gauge className="size-3 shrink-0" />
                  ) : isAudio ? (
                    <Music className="size-3 shrink-0" />
                  ) : annotationType ? (
                    <AnnotationTypeIcon type={annotationType} />
                  ) : (
                    <MessageSquare className="size-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {isTrim ? '裁剪' : isSpeed ? `${speedValue}×` : children}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
