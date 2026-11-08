import type { Span } from "dnd-timeline";

export const CLIP_SEAM_GAP_PX = 0;

/**
 * 保持片段显示坐标与媒体时间一致，切口不占用额外空间。
 * @param span 真实媒体区间。
 * @param _allClips 同轨片段，保留调用兼容。
 * @param _msPerPixel 当前显示比例，保留调用兼容。
 * @returns 原区间，连续片段在任意比例下紧邻。
 */
export function getClipDisplaySpan(span: Span, _allClips: Span[], _msPerPixel: number): Span {
	return span;
}

export function getEmbeddedCaptionSpan(
	span: Span,
	clips: { span: Span; displaySpan: Span }[],
): Span | null {
	const clip = clips.find((clip) => span.start < clip.span.end && span.end > clip.span.start);
	if (!clip) return null;
	const start = mapSpanTime(Math.max(span.start, clip.span.start), clip.span, clip.displaySpan);
	const end = mapSpanTime(Math.min(span.end, clip.span.end), clip.span, clip.displaySpan);
	return end > start ? { start, end } : null;
}

export type ClipPresentation = { span: Span; displaySpan: Span };

function mapSpanTime(time: number, from: Span, to: Span): number {
	if (from.end <= from.start) return to.start;
	return to.start + ((time - from.start) / (from.end - from.start)) * (to.end - to.start);
}

/**
 * 将媒体时间映射到片段显示坐标；连续切口保持同一个位置。
 * @param time 媒体毫秒时间。
 * @param clips 片段显示区间。
 * @param edge 使用切口左侧或右侧片段。
 * @returns 对应显示时间。
 */
export function getPlayheadDisplayTime(
	time: number,
	clips: ClipPresentation[],
	edge: "start" | "end" = "start",
): number {
	if (edge === "end") {
		const ending = clips.find(({ span }) => time > span.start && time <= span.end);
		if (ending) return mapSpanTime(time, ending.span, ending.displaySpan);
	}
	const clip =
		clips.find(({ span }) => time >= span.start && time < span.end) ??
		clips.find(({ span }) => time === span.end);
	if (!clip) return time;
	return mapSpanTime(time, clip.span, clip.displaySpan);
}

/** Scrubbing a shared gutter selects the cut, which has no media duration. */
export function getTimeAtClipSeam(time: number, clips: ClipPresentation[]): number {
	for (const left of clips) {
		const right = clips.find(({ span }) => span.start === left.span.end);
		if (right && time >= left.displaySpan.end && time <= right.displaySpan.start) {
			return right.span.start;
		}
	}
	const clip = clips.find(
		({ displaySpan }) => time >= displaySpan.start && time <= displaySpan.end,
	);
	return clip ? mapSpanTime(time, clip.displaySpan, clip.span) : time;
}

/** Both sides of a cut share a timestamp, but occupy different visual edges. */
export function getRegionDisplaySpan(span: Span, clips: ClipPresentation[]): Span {
	return {
		start: getPlayheadDisplayTime(span.start, clips, "start"),
		end: getPlayheadDisplayTime(span.end, clips, "end"),
	};
}

/** A small screen-space magnet; moving farther away releases it without changing duration. */
export function snapRegionSpan(
	span: Span,
	targets: number[],
	clips: ClipPresentation[],
	msPerPixel: number,
	edge?: "start" | "end",
): Span {
	if (!(msPerPixel > 0)) return span;
	let best = 8 * msPerPixel;
	let delta = 0;
	for (const side of edge ? [edge] : (["start", "end"] as const)) {
		const position = getPlayheadDisplayTime(span[side], clips, side);
		for (const target of targets) {
			const distance = Math.abs(position - getPlayheadDisplayTime(target, clips, side));
			if (distance <= best) {
				best = distance;
				delta = target - span[side];
			}
		}
	}
	return edge
		? { ...span, [edge]: span[edge] + delta }
		: { start: span.start + delta, end: span.end + delta };
}
