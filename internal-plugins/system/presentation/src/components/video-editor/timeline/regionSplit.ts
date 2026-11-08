type TimedRegion = { id: string; startMs: number; endMs: number }

/**
 * 校验游标在片段内部且两侧均留有可编辑的长度。
 * @param region 当前选中片段。
 * @param atMs 游标毫秒位置。
 * @returns 是否允许在当前片段分割。
 */
export function canSplitRegion(region: TimedRegion | undefined, atMs: number): boolean {
  const cut = Math.round(atMs)
  return Boolean(
    region && Number.isFinite(atMs) && cut >= region.startMs + 100 && cut <= region.endMs - 100
  )
}

/**
 * 分割独立轨道片段，保留右段的素材偏移与播放速度并移除切口淡化。
 * @param region 要分割的片段。
 * @param atMs 时间轴游标位置。
 * @param createId 生成右段唯一标识。
 * @returns 两个紧邻片段；无效切点返回原片段。
 */
export function splitTimelineRegion<T extends TimedRegion>(
  region: T,
  atMs: number,
  createId: () => string
): T[] {
  if (!canSplitRegion(region, atMs)) return [region]
  const cut = Math.round(atMs)
  const media = region as T & {
    sourceStartMs?: number
    playbackRate?: number
    audioPath?: string
    fadeInMs?: number
    fadeOutMs?: number
  }
  const left = { ...region, endMs: cut }
  const right = { ...region, id: createId(), startMs: cut }
  // 素材偏移按真实播放倍率推进，不能让右段从素材起点重播。
  if ('sourceStartMs' in media || 'audioPath' in media) {
    Object.assign(right, {
      sourceStartMs: (media.sourceStartMs ?? 0) + (cut - region.startMs) * (media.playbackRate ?? 1)
    })
  }
  if ('audioPath' in media) {
    Object.assign(left, {
      fadeInMs: Math.min(media.fadeInMs ?? 0, cut - region.startMs),
      fadeOutMs: 0
    })
    Object.assign(right, {
      fadeInMs: 0,
      fadeOutMs: Math.min(media.fadeOutMs ?? 0, region.endMs - cut)
    })
  }
  return [left, right]
}
