import { Skeleton } from '@presentation/components/ui/skeleton'
import { useTimelineContext, type Span } from 'dnd-timeline'
import { createContext, useContext, useEffect, useState, type ReactElement } from 'react'
import { buildFilmstripTiles } from '../../core/filmstrip'
import { extractFilmstrip, getCachedFilmstripFrame, retainFilmstripSource } from './frameCache'

export const FilmstripActivityContext = createContext(true)

/**
 * 按固定源时间块显示帧，平移同步移动旧图像，只为新出现的块取帧。
 * @param props 素材、剪辑区间、源区间及当前选择状态。
 * @returns 逐帧更新的可见帧带与始终覆盖图像上方的选择轮廓。
 */
export function ClipFilmstrip({
  path,
  span,
  sourceSpan,
  selected = false
}: {
  path: string
  span: Span
  sourceSpan: Span
  selected?: boolean
}): ReactElement {
  const { range, valueToPixels, pixelsToValue, direction } = useTimelineContext()
  const active = useContext(FilmstripActivityContext)
  const [, redraw] = useState(0)
  const [failedRequest, setFailedRequest] = useState<string | null>(null)
  const start = Math.max(span.start, range.start)
  const end = Math.min(span.end, range.end)
  const tiles = buildFilmstripTiles(span, sourceSpan, range, pixelsToValue(1))
  const requested = tiles.map((tile) => tile.timeMs).join(',')
  const requestKey = path + ':' + requested

  // 引用按素材归属；切片共享缓存，最后一个片段卸载即释放解码器。
  useEffect(() => (active ? retainFilmstripSource(path) : undefined), [path, active])
  useEffect(() => {
    if (!active || !requested) return
    const controller = new AbortController()
    let raf: number | null = null
    /**
     * 把同一绘制帧内的多个就绪通知合并，避免每张缩略图触发一次布局。
     * @returns 无返回值；下一个动画帧重绘当前可见块。
     */
    const publish = (): void => {
      if (controller.signal.aborted || raf !== null) return
      raf = requestAnimationFrame(() => {
        raf = null
        redraw((version) => version + 1)
      })
    }
    void extractFilmstrip(path, requested.split(',').map(Number), controller.signal, publish)
      .catch(() => {
        if (!controller.signal.aborted) setFailedRequest(requestKey)
      })
      .finally(publish)
    return () => {
      controller.abort()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [path, requested, requestKey, active])
  const pending =
    active &&
    failedRequest !== requestKey &&
    tiles.some((tile) => !getCachedFilmstripFrame(path, tile.timeMs))
  const side = direction === 'rtl' ? 'right' : 'left'
  return (
    <div
      data-testid="clip-filmstrip"
      data-pending={pending}
      data-visible-start={start}
      data-visible-end={end}
      className="pointer-events-none absolute top-0 bottom-0 overflow-hidden rounded-[inherit]"
      style={{
        [side]: valueToPixels(start - span.start),
        width: Math.max(0, valueToPixels(end - start))
      }}
      aria-hidden="true"
    >
      {active && tiles.map((tile) => {
        const frame = getCachedFilmstripFrame(path, tile.timeMs, true)
        return (
          <div
            key={tile.timeMs}
            className="absolute inset-y-0 overflow-hidden"
            style={{
              [side]: valueToPixels(tile.start - start),
              width: valueToPixels(tile.end - tile.start) + 0.5
            }}
          >
            {frame ? (
              <img
                src={frame.image}
                data-sample-time={tile.timeMs}
                data-frame-time={frame.timeMs}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <Skeleton className="h-full w-full rounded-none" />
            )}
          </div>
        )
      })}
      {active && selected && (
        <div
          data-testid="filmstrip-selection"
          className="absolute inset-0 z-40 rounded-[inherit]"
          style={{
            boxShadow:
              'inset 0 0 0 3px var(--accent), inset 0 0 0 5px rgba(255,255,255,0.95), inset 0 0 0 6px rgba(0,0,0,0.6)'
          }}
        />
      )}
    </div>
  )
}
