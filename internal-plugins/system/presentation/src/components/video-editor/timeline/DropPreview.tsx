import { createContext, useContext, type ReactElement } from 'react'
import { useTimelineContext, type Span } from 'dnd-timeline'

export interface TimelineDropPreview {
  rowId: string
  span: Span
}
export const TimelineDropPreviewContext = createContext<TimelineDropPreview | null>(null)

/**
 * 绘制已通过同一落点校验的片段插入位置，不改动正在拖动片段的DOM几何。
 * @param props 当前轨道身份。
 * @returns 目标轨道内的落点框和插入线，其他轨道返回空值。
 */
export function ItemDropPreview({ rowId }: { rowId: string }): ReactElement | null {
  const preview = useContext(TimelineDropPreviewContext)
  const { range, valueToPixels, direction } = useTimelineContext()
  if (!preview || preview.rowId !== rowId) return null
  return (
    <div
      data-testid="timeline-item-drop-preview"
      data-drop-row={rowId}
      className="absolute inset-y-0 z-50 pointer-events-none rounded border-2 border-dashed border-accent bg-accent/15"
      style={{
        [direction === 'rtl' ? 'right' : 'left']: valueToPixels(preview.span.start - range.start),
        width: Math.max(4, valueToPixels(preview.span.end - preview.span.start))
      }}
    >
      <span className="absolute inset-y-0 -left-0.5 w-[3px] bg-accent" />
      <span className="absolute left-1 top-0.5 whitespace-nowrap rounded bg-accent px-1 text-[10px] leading-4 text-accent-foreground">
        放到此处
      </span>
    </div>
  )
}
