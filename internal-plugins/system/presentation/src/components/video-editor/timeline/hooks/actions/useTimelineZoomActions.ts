import type { Span } from "dnd-timeline";
import { useCallback, useEffect, useMemo } from "react";
import type { ClipRegion, CursorTelemetryPoint, ZoomFocus, ZoomRegion } from "../../../types";
import { buildInteractionZoomSuggestions } from "../../zoomSuggestionUtils";
import { timelineNotifications } from "../utils/timelineNotifications";
import { resolveZoomPlacement } from "../../zoomPlacement";

interface UseTimelineZoomActionsParams {
	timeline: {
		videoDuration: number;
		totalMs: number;
		currentTimeMs: number;
	};
	regions: {
		zoom: ZoomRegion[];
		clip: ClipRegion[];
	};
	cursorTelemetry: CursorTelemetryPoint[];
	options: {
		disableSuggestedZooms: boolean;
	};
	autoSuggestZoomsTrigger: number;
	onAutoSuggestZoomsConsumed?: () => void;
	onZoomAdded: (span: Span) => void;
	onZoomSuggested?: (span: Span, focus: ZoomFocus) => void;
}

/**
 * 在当前剪辑时间轴添加或识别变焦，保留已有片段并提示真实结果。
 * @param params 时间轴、源轨迹、片段及变更回调。
 * @returns 手动添加和自动识别的操作入口。
 */
export function useTimelineZoomActions({
	timeline,
	regions,
	cursorTelemetry,
	options,
	autoSuggestZoomsTrigger,
	onAutoSuggestZoomsConsumed,
	onZoomAdded,
	onZoomSuggested,
}: UseTimelineZoomActionsParams) {
	const { videoDuration, totalMs, currentTimeMs } = timeline;
	const { zoom: zoomRegions, clip: clipRegions } = regions;
	const { disableSuggestedZooms } = options;
	const defaultRegionDurationMs = useMemo(() => Math.min(2000, totalMs), [totalMs]);

	/**
	 * 为悬停与点击解析相同的实际变焦区间。
	 * @param startMs 请求的毫秒落点。
	 * @returns 可用区间，或无法添加时的空值。
	 */
	const resolveZoomSpanAtMs = useCallback(
		(startMs: number) => {
			return resolveZoomPlacement(startMs, totalMs, clipRegions, zoomRegions);
		},
		[totalMs, clipRegions, zoomRegions],
	);
	/**
	 * 判断当前落点是否有正时长的空位。
	 * @param startMs 请求的毫秒落点。
	 * @returns 可以创建变焦时为真。
	 */
	const canPlaceZoomAtMs = useCallback((startMs: number) => resolveZoomSpanAtMs(startMs) !== null, [resolveZoomSpanAtMs]);

	/**
	 * 提交与悬停预览一致的变焦，不以错误通知打断无效点击。
	 * @param startMs 请求的毫秒落点。
	 * @returns 无返回值；有效时发布新变焦。
	 */
	const addZoomAtMs = useCallback(
		(startMs: number) => {
			// 无效空位不弹错误；已有片段由时间轴的选择交互处理。
			const span = resolveZoomSpanAtMs(startMs);
			if (span) onZoomAdded(span);
		},
		[resolveZoomSpanAtMs, onZoomAdded],
	);

	const handleAddZoom = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0) {
			return;
		}

		addZoomAtMs(currentTimeMs);
	}, [videoDuration, totalMs, currentTimeMs, addZoomAtMs]);

	const handleSuggestZooms = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0) {
			return;
		}

		if (disableSuggestedZooms) {
			timelineNotifications.info(
				"循环光标开启时无法自动添加变焦。",
			);
			return;
		}

		if (!onZoomSuggested) {
			timelineNotifications.error("自动变焦暂不可用");
			return;
		}

		if (cursorTelemetry.length === 0) {
			timelineNotifications.info(
				"没有可用的光标轨迹",
				"请先录制包含鼠标操作的演示，或在变焦轨道空白处点击添加变焦。",
			);
			return;
		}

		const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
		if (defaultDuration <= 0) {
			return;
		}

		const result = buildInteractionZoomSuggestions({
			cursorTelemetry,
			totalMs,
			defaultDurationMs: defaultDuration,
			clipRegions,
			reservedSpans: zoomRegions
				.map((region) => ({ start: region.startMs, end: region.endMs }))
				.sort((a, b) => a.start - b.start),
		});

		if (result.status === "no-telemetry") {
			timelineNotifications.info(
				"没有可用的光标轨迹",
				"录制中没有足够的鼠标移动数据。",
			);
			return;
		}

		if (result.status === "no-interactions") {
			timelineNotifications.info(
				"未检测到可放大的操作",
				"轨迹基本静止；可在需要强调的位置手动添加变焦。",
			);
			return;
		}

		if (result.status === "no-slots" || result.suggestions.length === 0) {
			timelineNotifications.info(
				"没有可添加自动变焦的位置",
				"检测到的停顿位置与已有变焦片段重叠。",
			);
			return;
		}

		for (const region of result.suggestions) {
			onZoomSuggested({ start: region.start, end: region.end }, region.focus);
		}

		timelineNotifications.success(`已添加 ${result.suggestions.length} 处自动变焦`);
	}, [
		videoDuration,
		totalMs,
		disableSuggestedZooms,
		onZoomSuggested,
		cursorTelemetry,
		defaultRegionDurationMs,
		zoomRegions,
		clipRegions,
	]);

	useEffect(() => {
		if (autoSuggestZoomsTrigger <= 0) {
			return;
		}

		onAutoSuggestZoomsConsumed?.();
		handleSuggestZooms();
	}, [autoSuggestZoomsTrigger, handleSuggestZooms, onAutoSuggestZoomsConsumed]);

	return {
		defaultRegionDurationMs,
		canPlaceZoomAtMs,
		resolveZoomSpanAtMs,
		addZoomAtMs,
		handleAddZoom,
		handleSuggestZooms,
	};
}
