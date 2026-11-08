import type { RowDefinition } from 'dnd-timeline'
import { useEffect, useRef, type PointerEvent, type ReactElement } from 'react'
import { useRow } from 'dnd-timeline'
import { TIMELINE_CLIP_ROW_HEIGHT_PX, TIMELINE_ROW_MIN_HEIGHT_PX } from './timelineLayout'
import { moveTrack, useTrackOrder } from './TrackOrder'
import { ItemDropPreview } from './DropPreview'

interface RowProps extends RowDefinition {
  embedded?: boolean
  caption?: boolean
  compact?: boolean
  filmstrip?: boolean
  children: React.ReactNode
  label?: string
  hint?: string
  isEmpty?: boolean
  labelColor?: string
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>
  onClick?: React.MouseEventHandler<HTMLDivElement>
}

/**
 * 显示轨道及固定名称，名称通过当前指针会话调整整轨排列。
 * @param props 轨道身份、正文与片段交互回调。
 * @returns 支持指针及键盘排序的轨道行。
 */
export default function Row({
  id,
  embedded = false,
  caption = false,
  compact = true,
  filmstrip = false,
  children,
  label,
  hint,
  isEmpty,
  labelColor = '#666',
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onMouseDown,
  onClick
}: RowProps): ReactElement {
  const { setNodeRef, rowWrapperStyle, rowStyle } = useRow({ id })
  const ordering = useTrackOrder()
  const orderingRef = useRef(ordering)
  orderingRef.current = ordering
  const drag = useRef<{
    pointerId: number
    x: number
    y: number
    moved: boolean
    drop: { id: string; edge: 'before' | 'after' } | null
  } | null>(null)
  useEffect(
    () => () => {
      // 行卸载后不能留下悬挂的落点或活动轨道。
      if (drag.current) orderingRef.current?.clear()
    },
    []
  )
  const position = ordering?.order.indexOf(id) ?? -1
  const rowLabel =
    label ??
    (id.includes('clip')
      ? '录屏'
      : id.includes('zoom')
        ? '变焦'
        : id.includes('audio')
          ? '音频'
          : id.includes('annotation')
            ? '注释'
            : '轨道')
  /**
   * 按实际显示顺序移动整条轨道，空轨道同样保留。
   * @param node 当前轨道内的元素。
   * @param active 被移动的轨道身份。
   * @param target 目标轨道身份。
   * @param edge 拖动明确选择的上方或下方位置。
   * @returns 无返回值；有效操作发布项目顺序。
   */
  function reorder(
    node: HTMLElement,
    active: string,
    target: string,
    edge?: 'before' | 'after'
  ): void {
    if (!ordering) return
    const rows = Array.from(
      node.closest('[data-timeline-rows]')?.querySelectorAll<HTMLElement>('[data-timeline-row]') ??
        []
    )
      .filter((row) => !row.dataset.embedded)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map((row) => row.dataset.timelineRow!)
    if (!rows.includes(active)) return
    ordering.onChange([
      ...moveTrack(rows, active, target, edge),
      ...ordering.order.filter((key) => !rows.includes(key))
    ])
  }
  /**
   * 捕获轨道名上的主指针，不依赖浏览器跨重开会话的原生拖放状态。
   * @param event 名称按钮上的按下事件。
   * @returns 无返回值；仅建立本次手势，尚不修改排列。
   */
  function startTrackDrag(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0 || !event.isPrimary || !ordering || drag.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      drop: null
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  /**
   * 达到移动阈值后按实际行边界显示落点，片段时间保持不变。
   * @param event 已捕获指针的移动事件。
   * @returns 无返回值；只更新当前手势预览。
   */
  function moveTrackDrag(event: PointerEvent<HTMLButtonElement>): void {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId || !ordering) return
    if (!current.moved) {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 4) return
      current.moved = true
      ordering.start(id)
    }
    const rows =
      event.currentTarget
        .closest('[data-timeline-rows]')
        ?.querySelectorAll<HTMLElement>('[data-timeline-row]:not([data-embedded])') ?? []
    const target = Array.from(rows).find((row) => {
      const rect = row.getBoundingClientRect()
      return (
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right
      )
    })
    const rect = target?.getBoundingClientRect()
    current.drop =
      target && rect
        ? {
            id: target.dataset.timelineRow!,
            edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
          }
        : null
    ordering.preview(current.drop?.id ?? id, current.drop?.edge ?? 'before')
  }
  /**
   * 一次松手提交一次排序，取消或丢失捕获只清理预览。
   * @param event 所属指针的结束事件。
   * @param canceled 是否取消本次操作。
   * @returns 无返回值；释放捕获并清理当前手势。
   */
  function endTrackDrag(event: PointerEvent<HTMLButtonElement>, canceled = false): void {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (!canceled) moveTrackDrag(event)
    drag.current = null
    if (!canceled && current.moved && current.drop)
      reorder(event.currentTarget, id, current.drop.id, current.drop.edge)
    ordering?.clear()
    if (event.currentTarget.hasPointerCapture(current.pointerId))
      event.currentTarget.releasePointerCapture(current.pointerId)
  }
  /**
   * 取消键盘或焦点中断的排序手势，释放捕获且不提交历史。
   * @param node 当前轨道名按钮。
   * @returns 无返回值；已有项目排列保持不变。
   */
  function cancelTrackDrag(node: HTMLButtonElement): void {
    const current = drag.current
    if (!current) return
    drag.current = null
    ordering?.clear()
    if (node.hasPointerCapture(current.pointerId)) node.releasePointerCapture(current.pointerId)
  }

  return (
    <div
      data-timeline-row={id}
      data-embedded={embedded || caption ? 'true' : undefined}
      className="bg-transparent relative"
      style={{
        ...rowWrapperStyle,
        order: position < 0 ? (ordering?.order.length ?? 0) : position,
        ...(embedded || caption
          ? {
              position: 'absolute' as const,
              insetInline: 0,
              ...(caption ? { top: 36 } : { bottom: 7 }),
              zIndex: 15,
              pointerEvents: 'none' as const
            }
          : {}),
        marginBottom: 2,
        flexGrow: 0,
        flexShrink: 0,
        height:
          embedded || caption
            ? 20
            : filmstrip || !compact
              ? TIMELINE_CLIP_ROW_HEIGHT_PX
              : TIMELINE_ROW_MIN_HEIGHT_PX,
        flexBasis: caption
          ? 20
          : filmstrip || !compact
            ? TIMELINE_CLIP_ROW_HEIGHT_PX
            : TIMELINE_ROW_MIN_HEIGHT_PX
      }}
    >
      {!embedded && !caption && (
        <button
          type="button"
          aria-label={`调整${rowLabel}轨道顺序`}
          title="拖动调整轨道顺序，也可使用上下方向键"
          onPointerDown={startTrackDrag}
          onPointerMove={moveTrackDrag}
          onPointerUp={(event) => endTrackDrag(event)}
          onPointerCancel={(event) => endTrackDrag(event, true)}
          onLostPointerCapture={(event) => endTrackDrag(event, true)}
          onBlur={(event) => cancelTrackDrag(event.currentTarget)}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && drag.current) {
              cancelTrackDrag(event.currentTarget)
              event.preventDefault()
              event.stopPropagation()
              return
            }
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
            event.preventDefault()
            event.stopPropagation()
            const rows = Array.from(
              event.currentTarget
                .closest('[data-timeline-rows]')
                ?.querySelectorAll<HTMLElement>('[data-timeline-row]:not([data-embedded])') ?? []
            ).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            const index = rows.findIndex((row) => row.dataset.timelineRow === id)
            const target = rows[index + (event.key === 'ArrowUp' ? -1 : 1)]?.dataset.timelineRow
            if (target) reorder(event.currentTarget, id, target)
          }}
          className="w-20 shrink-0 flex items-center gap-1 px-1 text-[10px] text-muted-foreground select-none cursor-grab active:cursor-grabbing overflow-hidden"
          style={{ color: labelColor, touchAction: 'none' }}
        >
          <span className="truncate">{rowLabel}</span>
        </button>
      )}
      {ordering?.activeId && ordering.activeId !== id && ordering.drop?.id === id && (
        <div
          data-testid="timeline-track-drop-preview"
          data-drop-edge={ordering.drop.edge}
          className="absolute inset-x-0 z-[80] h-[3px] bg-accent pointer-events-none"
          style={{ [ordering.drop.edge === 'before' ? 'top' : 'bottom']: 0 }}
        >
          <span className="absolute left-1 -top-2 rounded bg-accent px-1 text-[10px] leading-4 text-accent-foreground">
            放到此处
          </span>
        </div>
      )}
      {isEmpty && hint && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
          <span className="text-[11px] text-foreground/15 font-medium">{hint}</span>
        </div>
      )}
      <div
        ref={setNodeRef}
        className={`relative min-w-0 self-stretch ${onClick ? 'cursor-crosshair' : ''}`}
        style={{ ...rowStyle, overflow: 'clip' }}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        {children}
        <ItemDropPreview rowId={id} />
      </div>
    </div>
  )
}
