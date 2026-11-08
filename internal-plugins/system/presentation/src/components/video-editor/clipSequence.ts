import { type ClipRegion, getClipSourceStartMs, sortClipRegions } from "./types";

/** Primary footage is a sequence. Source in-points survive every ripple edit. */
export function closeClipGaps(clips: ClipRegion[]): ClipRegion[] {
	return packClipSequence(sortClipRegions(clips));
}

/** Repack authored sequence order; trim positions must never determine clip order. */
export function packClipSequence(clips: ClipRegion[]): ClipRegion[] {
	let cursor = 0;
	return clips.map((clip) => {
		const duration = clip.endMs - clip.startMs;
		const next =
			clip.startMs === cursor
				? clip
				: {
						...clip,
						sourceStartMs: getClipSourceStartMs(clip),
						startMs: cursor,
						endMs: cursor + duration,
					};
		cursor += duration;
		return next;
	});
}

/** Insert by sequence index, independent of temporarily overlapping drag positions. */
export function reorderClipSequence(
	clips: ClipRegion[],
	id: string,
	sequenceIndex: number,
): ClipRegion[] {
	const ordered = sortClipRegions(clips);
	const activeIndex = ordered.findIndex((clip) => clip.id === id);
	if (activeIndex < 0 || !Number.isFinite(sequenceIndex)) return closeClipGaps(clips);
	const [active] = ordered.splice(activeIndex, 1);
	ordered.splice(Math.max(0, Math.min(ordered.length, Math.round(sequenceIndex))), 0, active);
	return packClipSequence(ordered);
}

function safeSpeed(clip: ClipRegion): number {
	return Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
}

function mapWithinClip(time: number, before: ClipRegion, after: ClipRegion): number {
	const source = getClipSourceStartMs(before) + (time - before.startMs) * safeSpeed(before);
	return Math.round(
		Math.max(
			after.startMs,
			Math.min(
				after.endMs,
				after.startMs + (source - getClipSourceStartMs(after)) / safeSpeed(after),
			),
		),
	);
}

/**
 * 按保留画面映射关联效果，重排后只合并相邻区间，分离部分独立成段。
 * @param regions 随录屏编辑的变焦或注释。
 * @param before 编辑前的录屏序列。
 * @param after 编辑后的录屏序列。
 * @returns 保留参数和实际覆盖时长的效果；新增分段使用独立身份。
 */
export function rippleRegions<T extends { id: string; startMs: number; endMs: number }>(
	regions: T[],
	before: ClipRegion[],
	after: ClipRegion[],
): T[] {
	return regions.flatMap((region) => {
		const retainedSpans = before.flatMap((clip) => {
			const next = after.find((candidate) => candidate.id === clip.id);
			const start = Math.max(region.startMs, clip.startMs);
			const end = Math.min(region.endMs, clip.endMs);
			if (!next || end <= start) return [];
			const startMs = mapWithinClip(start, clip, next);
			const endMs = mapWithinClip(end, clip, next);
			return endMs > startMs ? [{ startMs, endMs }] : [];
		});
		// 不能用最早起点和最晚终点包围分离区间，否则会覆盖无关画面和其他效果。
		const spans: { startMs: number; endMs: number }[] = [];
		for (const span of retainedSpans.sort((a, b) => a.startMs - b.startMs)) {
			const previous = spans.at(-1);
			if (previous && span.startMs <= previous.endMs) previous.endMs = Math.max(previous.endMs, span.endMs);
			else spans.push({ ...span });
		}
		return spans.map((span, index) => ({
			...region,
			...span,
			id: index === 0 ? region.id : `${region.id}-${crypto.randomUUID()}`,
		}));
	});
}
