import type { Span } from 'dnd-timeline'

export interface FilmstripTile {
  start: number
  end: number
  timeMs: number
}

/**
 * 将可见区域映射到固定源时间网格，平移复用旧帧，缩放以二倍层级复用采样点。
 * @param span 剪辑时间区间。
 * @param source 对应源素材区间，包含裁剪及倍速。
 * @param visible 当前可见时间区间。
 * @param msPerPixel 每个显示像素对应的剪辑毫秒数。
 * @returns 有界的可见采样块，每块携带其真实源时间。
 */
export function buildFilmstripTiles(
  span: Span,
  source: Span,
  visible: Span,
  msPerPixel: number
): FilmstripTile[] {
  const start = Math.max(span.start, visible.start)
  const end = Math.min(span.end, visible.end)
  const rate = (source.end - source.start) / (span.end - span.start)
  if (end <= start || !(rate > 0) || !(msPerPixel > 0) || !Number.isFinite(msPerPixel)) return []
  const step = 2 ** Math.floor(Math.log2(Math.max(1, msPerPixel * rate * 112)))
  const first = Math.floor((source.start + (start - span.start) * rate) / step)
  const last = Math.ceil((source.start + (end - span.start) * rate) / step)
  const tiles: FilmstripTile[] = []
  for (let index = first; index < last && tiles.length < 64; index++) {
    const sourceStart = Math.max(source.start, index * step)
    const sourceEnd = Math.min(source.end, (index + 1) * step)
    if (sourceEnd <= sourceStart) continue
    tiles.push({
      start: span.start + (sourceStart - source.start) / rate,
      end: span.start + (sourceEnd - source.start) / rate,
      timeMs: Math.round(sourceStart)
    })
  }
  return tiles
}

/** Sample the visible edit in source coordinates, including source trims and speed. */
export function filmstripSampleTimes(span: Span, source: Span, visible: Span, count: number): number[] {
  const start = Math.max(span.start, visible.start)
  const end = Math.min(span.end, visible.end)
  if (end <= start || span.end <= span.start || count < 1) return []
  return Array.from({ length: count }, (_, index) => {
    const timelineMs = start + ((index + 0.5) / count) * (end - start)
    return (
      source.start +
      ((timelineMs - span.start) / (span.end - span.start)) * (source.end - source.start)
    )
  })
}
