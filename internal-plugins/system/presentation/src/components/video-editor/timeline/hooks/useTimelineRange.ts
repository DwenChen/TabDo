import type { Range } from "dnd-timeline";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type WheelEvent } from "react";
import { createInitialRange, normalizeWheelDeltaToPixels } from "../core/time";
import { clampRange } from "../dnd/engine";

interface UseTimelineRangeParams {
	totalMs: number;
	sourceKey?: string | null;
	timelineContainerRef: RefObject<HTMLDivElement | null>;
}

export interface TimelineWheelPanDeltaInput {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	shiftKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	canScrollVertically?: boolean;
}

export function resolveTimelineWheelPanDeltaPx({
	deltaX,
	deltaY,
	deltaMode,
	shiftKey = false,
	ctrlKey = false,
	metaKey = false,
	canScrollVertically = true,
}: TimelineWheelPanDeltaInput) {
	if ((ctrlKey || metaKey) && !shiftKey) {
		return 0;
	}

	if (Math.abs(deltaX) > 0) {
		return normalizeWheelDeltaToPixels(deltaX, deltaMode);
	}

	if ((shiftKey || !canScrollVertically) && Math.abs(deltaY) > 0) {
		return normalizeWheelDeltaToPixels(deltaY, deltaMode);
	}

	return 0;
}

/**
 * 调整显示时长并保持锚点在原来的相对位置。
 * @param range 当前可见区间。
 * @param visibleMs 目标可见时长。
 * @param totalMs 时间轴总时长。
 * @param anchorMs 优先保持可见的游标或中心点。
 * @returns 限制在有效时间轴内的显示区间。
 */
export function resizeTimelineViewport(range: Range, visibleMs: number, totalMs: number, anchorMs: number): Range {
  const span = Math.min(totalMs, Math.max(Math.min(300, totalMs), visibleMs));
  const anchor = anchorMs >= range.start && anchorMs <= range.end ? anchorMs : (range.start + range.end) / 2;
  const fraction = Math.max(0, Math.min(1, (anchor - range.start) / Math.max(1, range.end - range.start)));
  const start = Math.max(0, Math.min(totalMs - span, anchor - span * fraction));
  return { start, end: start + span };
}

/**
 * 管理用户选择的显示比例；剪辑时保留比例，仅换素材时重新适配。
 * @param options 总时长、素材身份和滚动容器。
 * @returns 有界显示区间及比例、滚轮控制。
 */
export function useTimelineRange({ totalMs, sourceKey, timelineContainerRef }: UseTimelineRangeParams) {
	const [range, setRange] = useState<Range>(() => createInitialRange(totalMs));
	const previousRef = useRef({ totalMs, sourceKey });

	useEffect(() => {
		const previous = previousRef.current;
		previousRef.current = { totalMs, sourceKey };
		setRange((current) => {
			// 换项目重新适配；已有放大尺度在分割、变速、删除时保持。
			if (sourceKey !== previous.sourceKey || previous.totalMs <= 0 || current.end - current.start >= previous.totalMs - 1) return createInitialRange(totalMs);
			return resizeTimelineViewport(current, current.end - current.start, totalMs, current.start);
		});
	}, [totalMs, sourceKey]);

	const clampedRange = useMemo<Range>(() => {
		if (totalMs === 0) {
			return range;
		}
		return clampRange(range, { totalMs, minVisibleRangeMs: 300 });
	}, [range, totalMs]);

	const panTimelineRange = useCallback(
		(deltaMs: number) => {
			if (!Number.isFinite(deltaMs) || deltaMs === 0 || totalMs <= 0) {
				return;
			}

			setRange((previous) => {
				const visibleSpan = Math.max(1, previous.end - previous.start);
				const maxStart = Math.max(0, totalMs - visibleSpan);
				const nextStart = Math.max(0, Math.min(previous.start + deltaMs, maxStart));
				return { start: nextStart, end: nextStart + visibleSpan };
			});
		},
		[totalMs],
	);

	const handleTimelineWheel = useCallback(
		(event: WheelEvent<HTMLDivElement>) => {
			if (((event.ctrlKey || event.metaKey) && !event.shiftKey) || totalMs <= 0) {
				return;
			}

			const container = timelineContainerRef.current;
			const horizontalDeltaPx = resolveTimelineWheelPanDeltaPx({
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				deltaMode: event.deltaMode,
				shiftKey: event.shiftKey,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				canScrollVertically: container
					? container.scrollHeight > container.clientHeight + 1
					: true,
			});

			if (horizontalDeltaPx === 0) {
				return;
			}

			const containerWidth = container?.clientWidth ?? 0;
			const visibleRangeMs = clampedRange.end - clampedRange.start;
			if (containerWidth <= 0 || visibleRangeMs <= 0) {
				return;
			}

			event.preventDefault();
			const deltaMs = (horizontalDeltaPx / containerWidth) * visibleRangeMs;
			panTimelineRange(deltaMs);
		},
		[clampedRange.end, clampedRange.start, panTimelineRange, timelineContainerRef, totalMs],
	);

	return {
		range,
		setRange,
		clampedRange,
		handleTimelineWheel,
		setVisibleMs: (visibleMs: number, anchorMs: number) => setRange((current) => resizeTimelineViewport(current, visibleMs, totalMs, anchorMs)),
	};
}
