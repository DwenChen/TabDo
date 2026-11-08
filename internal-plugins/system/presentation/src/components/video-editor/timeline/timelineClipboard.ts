import { packClipSequence } from '../clipSequence'
import { getClipSourceStartMs, sortClipRegions, type ClipRegion } from '../types'

type Timed = { startMs: number; endMs: number }

/**
 * 为视频插入留出时间，保留后半段效果；横跨插入点的效果拆为前后两段。
 * @param regions 随视频移动的注释或缩放片段。
 * @param atMs 视频插入的时间轴位置。
 * @param lengthMs 插入的视频时长。
 * @param createId 为横跨插入点的后半段分配身份。
 * @returns 避开插入区间且保留全部原有效果的片段集合。
 */
export function insertTimelineGap<T extends Timed & { id: string }>(
  regions: T[],
  atMs: number,
  lengthMs: number,
  createId: () => string
): T[] {
  return regions.flatMap((region) => {
    if (region.endMs <= atMs) return [region]
    if (region.startMs >= atMs)
      return [{ ...region, startMs: region.startMs + lengthMs, endMs: region.endMs + lengthMs }]
    return [
      { ...region, endMs: atMs },
      { ...region, id: createId(), startMs: atMs + lengthMs, endMs: region.endMs + lengthMs }
    ]
  })
}

/**
 * 在单轨中寻找游标之后可容纳完整片段的空隙，避免粘贴覆盖已有片段。
 * @param regions 当前单轨片段。
 * @param atMs 请求粘贴的时间。
 * @param lengthMs 复制片段的完整时长。
 * @param endMs 该轨道允许的结束时间。
 * @returns 可用起点；没有完整空隙时返回空值。
 */
export function findPasteTime(
  regions: Timed[],
  atMs: number,
  lengthMs: number,
  endMs: number
): number | null {
  let start = Math.max(0, Math.round(atMs))
  for (const region of [...regions].sort((a, b) => a.startMs - b.startMs)) {
    if (region.endMs <= start) continue
    if (start + lengthMs <= region.startMs) break
    start = region.endMs
  }
  return lengthMs > 0 && start + lengthMs <= endMs ? start : null
}

/**
 * 为新增或粘贴的注释和音频找空闲导轨，保留请求的导轨优先级。
 * @param regions 当前同类片段。
 * @param startMs 粘贴起点。
 * @param endMs 粘贴终点。
 * @param preferred 复制片段的原轨道编号。
 * @returns 不与现有片段重叠的轨道编号。
 */
export function findPasteTrack(
  regions: (Timed & { trackIndex?: number })[],
  startMs: number,
  endMs: number,
  preferred = 0
): number {
  let track = preferred
  while (
    regions.some(
      (region) =>
        (region.trackIndex ?? 0) === track && region.endMs > startMs && region.startMs < endMs
    )
  )
    track++
  return track
}

/**
 * 在游标处插入复制的视频，必要时切开原片段并保留素材偏移和速度。
 * @param regions 原有视频序列。
 * @param copied 已分配新身份的复制片段。
 * @param atMs 游标位置。
 * @param createId 被切开的右半段身份生成器。
 * @returns 连续视频序列及需要继承声音设置的右半段身份。
 */
export function insertCopiedClip(
  regions: ClipRegion[],
  copied: ClipRegion,
  atMs: number,
  createId: () => string
): {
  clips: ClipRegion[]
  split?: { originalId: string; rightId: string }
} {
  const ordered = sortClipRegions(regions),
    next: ClipRegion[] = []
  const at = Math.max(0, Math.round(atMs))
  let inserted = false,
    split: { originalId: string; rightId: string } | undefined
  const copy = { ...copied, sourceStartMs: getClipSourceStartMs(copied) }
  for (const clip of ordered) {
    if (!inserted && at <= clip.startMs) {
      next.push(copy)
      inserted = true
    }
    if (!inserted && at > clip.startMs && at < clip.endMs) {
      const rightId = createId()
      next.push({ ...clip, endMs: at }, copy, {
        ...clip,
        id: rightId,
        startMs: at,
        sourceStartMs: getClipSourceStartMs(clip) + (at - clip.startMs) * clip.speed
      })
      split = { originalId: clip.id, rightId }
      inserted = true
    } else next.push(clip)
  }
  if (!inserted) next.push(copy)
  return { clips: packClipSequence(next), split }
}
