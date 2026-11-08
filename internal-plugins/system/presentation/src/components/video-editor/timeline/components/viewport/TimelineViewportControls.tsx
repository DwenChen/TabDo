import { useRef, type PointerEvent, type ReactElement } from 'react'
import type { Range } from 'dnd-timeline'
import { formatPlayheadTime } from '../../core/time'
import styles from './TimelineViewportControls.module.css'

/**
 * 显示自定义比例和按可见时长绘制的横向滚动条。
 * @param props 当前可见区间、总时长与显示控制回调。
 * @returns 支持鼠标、触控和键盘的比例及横向浏览控件。
 */
export function TimelineViewportControls({
  range,
  totalMs,
  onZoom,
  onPan
}: {
  range: Range
  totalMs: number
  onZoom: (visibleMs: number) => void
  onPan: (startMs: number) => void
}): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; start: number } | null>(null)
  const visibleMs = range.end - range.start
  const maxStart = Math.max(0, totalMs - visibleMs)
  const maxZoom = Math.max(1, totalMs / Math.min(totalMs, 300))
  const zoom = totalMs / Math.max(1, visibleMs)
  const fraction = Math.min(1, visibleMs / Math.max(1, totalMs))

  /**
   * 把拖动距离换算为时间，最小滑块宽度同样参与可用距离计算。
   * @param event 当前指针事件。
   * @returns 无返回值；更新横向显示起点。
   */
  function move(event: PointerEvent<HTMLDivElement>): void {
    if (!dragRef.current || !scrollRef.current) return
    const width = scrollRef.current.clientWidth
    const travel = width - Math.max(28, width * fraction)
    if (travel > 0)
      onPan(
        Math.max(
          0,
          Math.min(
            maxStart,
            dragRef.current.start + ((event.clientX - dragRef.current.x) / travel) * maxStart
          )
        )
      )
  }
  return (
    <div
      className="flex shrink-0 items-center gap-3 px-3 pt-2 pb-1 text-[11px] text-muted-foreground"
      data-testid="timeline-viewport-controls"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="缩小时间轴"
          title="缩小时间轴"
          className={styles.zoomButton}
          disabled={zoom <= 1.001}
          onClick={() => onZoom(visibleMs * 1.5)}
        >
          −
        </button>
        <input
          type="range"
          aria-label="时间轴显示比例"
          title="调整时间轴显示比例"
          className={styles.scale}
          min={0}
          max={Math.log2(maxZoom)}
          step={0.01}
          value={Math.log2(Math.max(1, zoom))}
          onChange={(event) => onZoom(totalMs / 2 ** event.currentTarget.valueAsNumber)}
        />
        <button
          type="button"
          aria-label="放大时间轴"
          title="放大时间轴"
          className={styles.zoomButton}
          disabled={zoom >= maxZoom - 0.001}
          onClick={() => onZoom(visibleMs / 1.5)}
        >
          ＋
        </button>
        <span className="w-12 text-right tabular-nums" aria-label="当前时间轴比例">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="whitespace-nowrap rounded px-2 py-1 hover:bg-foreground/10 focus-visible:outline-accent"
          onClick={() => onZoom(totalMs)}
        >
          适应全部
        </button>
      </div>
      <div
        ref={scrollRef}
        role="scrollbar"
        aria-label="时间轴横向滚动"
        aria-orientation="horizontal"
        aria-controls="presentation-timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxStart)}
        aria-valuenow={Math.round(range.start)}
        aria-valuetext={`${formatPlayheadTime(range.start)} 至 ${formatPlayheadTime(range.end)}`}
        aria-disabled={maxStart <= 0}
        tabIndex={maxStart > 0 ? 0 : -1}
        className={styles.scrollbar}
        onPointerDown={(event) => {
          if (event.button !== 0 || maxStart <= 0) return
          event.preventDefault()
          const track = event.currentTarget
          const thumb = track.firstElementChild as HTMLElement
          let start = range.start
          if (event.target !== thumb) {
            const rect = track.getBoundingClientRect()
            const travel = rect.width - thumb.offsetWidth
            start = Math.max(
              0,
              Math.min(
                maxStart,
                ((event.clientX - rect.left - thumb.offsetWidth / 2) / Math.max(1, travel)) *
                  maxStart
              )
            )
            onPan(start)
          }
          dragRef.current = { x: event.clientX, start }
          track.setPointerCapture(event.pointerId)
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          dragRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onLostPointerCapture={() => {
          dragRef.current = null
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', "终点"].includes(event.key))
            return
          event.preventDefault()
          const delta = ['ArrowLeft', 'PageUp'].includes(event.key) ? -1 : 1
          const start =
            event.key === 'Home'
              ? 0
              : event.key === "终点"
                ? maxStart
                : range.start + delta * visibleMs * (event.key.startsWith('Page') ? 0.9 : 0.1)
          onPan(Math.max(0, Math.min(maxStart, start)))
        }}
      >
        <span
          className={styles.thumb}
          style={{
            width: `${fraction * 100}%`,
            left:
              maxStart > 0
                ? `calc((100% - max(28px, ${fraction * 100}%)) * ${range.start / maxStart})`
                : 0
          }}
        />
      </div>
    </div>
  )
}
