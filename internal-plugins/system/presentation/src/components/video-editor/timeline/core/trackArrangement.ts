/**
 * 按插入位置重排同轨片段，保留素材参数、片段时长和各位置的留白。
 * @param regions 当前类型的全部片段。
 * @param id 被移动片段的身份。
 * @param index 同轨中的目标位置。
 * @returns 更新同轨时间位置后的片段，其余轨道保持原对象。
 */
export function reorderTimedRegions<
  T extends { id: string; startMs: number; endMs: number; trackIndex?: number }
>(regions: T[], id: string, index: number): T[] {
  const active = regions.find((region) => region.id === id)
  if (!active) return regions
  const track = regions
    .filter((region) => (region.trackIndex ?? 0) === (active.trackIndex ?? 0))
    .sort((a, b) => a.startMs - b.startMs)
  const next = track.filter((region) => region.id !== id)
  next.splice(Math.max(0, Math.min(index, next.length)), 0, active)
  if (next.every((region, position) => region.id === track[position].id)) return regions
  let start = track[0].startMs
  const updated = new Map<string, T>()
  // 重排只调整时间位置，不能改写素材偏移、音量或淡入淡出。
  next.forEach((region, position) => {
    const end = start + region.endMs - region.startMs
    updated.set(region.id, { ...region, startMs: start, endMs: end })
    start =
      end +
      Math.max(0, (track[position + 1]?.startMs ?? track[position].endMs) - track[position].endMs)
  })
  return regions.map((region) => updated.get(region.id) ?? region)
}
