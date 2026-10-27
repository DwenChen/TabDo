import {
	getClipSourceStartMs,
	type ClipRegion,
	type CursorTelemetryPoint,
	type ZoomFocus,
} from "../types";
import { cursorSampleIndexAt } from "../videoPlayback/cursorTelemetryIndex";

export const MIN_DWELL_DURATION_MS = 450;
export const MAX_DWELL_DURATION_MS = 2600;
export const DWELL_MOVE_THRESHOLD = 0.02;
export const MIN_FRESH_RECORDING_AUTO_ZOOM_SOURCE_ASPECT_RATIO = 1.2;

export interface ZoomDwellCandidate {
	centerTimeMs: number;
	focus: ZoomFocus;
	strength: number;
}

export interface CursorInteractionCandidate extends ZoomDwellCandidate {
	kind:
		| "dwell"
		| "click-like"
		| "double-click-like"
		| "text-focus-like"
		| "dropdown-open"
		| "text-selection"
		| "text-field-click";
	source: "explicit" | "heuristic";
}

export interface SuggestedZoomRegion {
	start: number;
	end: number;
	focus: ZoomFocus;
}

export type InteractionZoomSuggestionStatus =
	| "ok"
	| "no-telemetry"
	| "no-interactions"
	| "no-slots";

export interface InteractionZoomSuggestionResult {
	status: InteractionZoomSuggestionStatus;
	suggestions: SuggestedZoomRegion[];
}

export function shouldAutoApplyFreshRecordingZoomsForSource(
	sourceWidth?: number,
	sourceHeight?: number,
	platform?: string,
): boolean {
	// Window capture on Windows legitimately produces portrait and near-square
	// sources. Click telemetry is already normalized to that captured window, so
	// its aspect ratio is not a reason to suppress interaction-based zooms.
	if (platform === "win32") {
		return true;
	}

	if (
		!Number.isFinite(sourceWidth) ||
		!Number.isFinite(sourceHeight) ||
		(sourceWidth ?? 0) <= 0 ||
		(sourceHeight ?? 0) <= 0
	) {
		return true;
	}

	return (
		(sourceWidth as number) / (sourceHeight as number) >=
		MIN_FRESH_RECORDING_AUTO_ZOOM_SOURCE_ASPECT_RATIO
	);
}

/** Max gap between consecutive clicks before they are split into separate zoom clusters. */
export const CLICK_CLUSTER_MERGE_GAP_MS = 1600;
/** Padding added before the first click and after the last click in a cluster. */
export const CLICK_CLUSTER_PAD_MS = 500;
const EXPLICIT_CLICK_TYPES = new Set<NonNullable<CursorTelemetryPoint["interactionType"]>>([
	"click",
	"double-click",
	"right-click",
	"middle-click",
]);

function isExplicitClickType(
	interactionType: CursorTelemetryPoint["interactionType"],
): interactionType is NonNullable<CursorTelemetryPoint["interactionType"]> {
	return typeof interactionType === "string" && EXPLICIT_CLICK_TYPES.has(interactionType);
}

function normalizeTelemetrySample(
	sample: CursorTelemetryPoint,
	totalMs: number,
): CursorTelemetryPoint {
	return {
		timeMs: Math.max(0, Math.min(sample.timeMs, totalMs)),
		cx: Math.max(0, Math.min(sample.cx, 1)),
		cy: Math.max(0, Math.min(sample.cy, 1)),
		interactionType: sample.interactionType,
		cursorType: sample.cursorType,
	};
}

/**
 * 只遍历指定时间内的轨迹，补充缺失的光标形状。
 * @param samples 按时间排序的轨迹。
 * @param startMs 开始时间。
 * @param endMs 结束时间。
 * @param cursorType 要补充的形状。
 * @returns 无返回值；已有明确形状保持不变。
 */
function applyCursorTypeInRange(
	samples: CursorTelemetryPoint[],
	startMs: number,
	endMs: number,
	cursorType: NonNullable<CursorTelemetryPoint["cursorType"]>,
) {
	for (
		let index = Math.max(0, cursorSampleIndexAt(samples, startMs));
		index < samples.length;
		index++
	) {
		const sample = samples[index];
		if (sample.timeMs > endMs) break;
		if (sample.timeMs < startMs) continue;
		if (!sample.cursorType) {
			sample.cursorType = cursorType;
		}
	}
}

/**
 * 归一化素材轨迹并根据局部交互补充缺失形状。
 * @param telemetry 原始轨迹。
 * @param totalMs 素材总时长。
 * @returns 独立、已排序且坐标有效的轨迹数组。
 */
export function normalizeCursorTelemetry(
	telemetry: CursorTelemetryPoint[],
	totalMs: number,
): CursorTelemetryPoint[] {
	const normalized = [...telemetry]
		.filter(
			(sample) =>
				Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy),
		)
		.sort((a, b) => a.timeMs - b.timeMs)
		.map((sample) => normalizeTelemetrySample(sample, totalMs));

	const interactions = detectInteractionCandidates(normalized);
	for (const candidate of interactions) {
		if (candidate.kind === "text-selection") {
			applyCursorTypeInRange(
				normalized,
				candidate.centerTimeMs - 140,
				candidate.centerTimeMs + 1200,
				"text",
			);
			continue;
		}

		if (candidate.kind === "text-field-click" || candidate.kind === "text-focus-like") {
			applyCursorTypeInRange(
				normalized,
				candidate.centerTimeMs - 100,
				candidate.centerTimeMs + 900,
				"text",
			);
			continue;
		}
	}

	const mouseUps = normalized.filter((sample) => sample.interactionType === "mouseup");
	for (const sample of normalized) {
		if (sample.interactionType !== "click" && sample.interactionType !== "double-click") {
			continue;
		}

		const mouseUp = mouseUps[cursorSampleIndexAt(mouseUps, sample.timeMs) + 1];
		if (!mouseUp) {
			continue;
		}

		const dragDuration = mouseUp.timeMs - sample.timeMs;
		const dragDistance = Math.hypot(mouseUp.cx - sample.cx, mouseUp.cy - sample.cy);
		if (dragDuration >= 160 && dragDistance > 0.015) {
			const isTextDrag = Math.abs(mouseUp.cx - sample.cx) > Math.abs(mouseUp.cy - sample.cy) * 1.8;
			applyCursorTypeInRange(
				normalized,
				sample.timeMs,
				mouseUp.timeMs,
				isTextDrag ? "text" : "closed-hand",
			);
		}
	}

	return normalized;
}

/**
 * 识别光标在同一小范围内的有效停留，缓慢持续移动也会结束当前停留段。
 * @param samples 已按时间归一化的光标轨迹。
 * @returns 带时间、焦点和停留强度的候选位置。
 */
export function detectZoomDwellCandidates(samples: CursorTelemetryPoint[]): ZoomDwellCandidate[] {
	if (samples.length < 2) {
		return [];
	}

	const dwellCandidates: ZoomDwellCandidate[] = [];
	let runStart = 0;

	const pushRunIfDwell = (startIndex: number, endIndexExclusive: number) => {
		if (endIndexExclusive - startIndex < 2) {
			return;
		}

		const start = samples[startIndex];
		const end = samples[endIndexExclusive - 1];
		const runDuration = end.timeMs - start.timeMs;
		if (runDuration < MIN_DWELL_DURATION_MS) {
			return;
		}

		const runSamples = samples.slice(startIndex, endIndexExclusive);
		const avgCx = runSamples.reduce((sum, sample) => sum + sample.cx, 0) / runSamples.length;
		const avgCy = runSamples.reduce((sum, sample) => sum + sample.cy, 0) / runSamples.length;

		dwellCandidates.push({
			// 长停留仍识别进入焦点的动作，但不将整段空闲时间放大。
			centerTimeMs: Math.round(start.timeMs + Math.min(runDuration, MAX_DWELL_DURATION_MS) / 2),
			focus: { cx: avgCx, cy: avgCy },
			strength: Math.min(runDuration, MAX_DWELL_DURATION_MS),
		});
	};

	for (let index = 1; index < samples.length; index += 1) {
		const prev = samples[runStart];
		const curr = samples[index];
		const distance = Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy);

		if (distance > DWELL_MOVE_THRESHOLD || curr.timeMs - samples[index - 1].timeMs > 1200) {
			pushRunIfDwell(runStart, index);
			runStart = index;
		}
	}
	pushRunIfDwell(runStart, samples.length);

	return dwellCandidates;
}

export function detectInteractionCandidates(
	samples: CursorTelemetryPoint[],
): CursorInteractionCandidate[] {
	// --- Phase 1: Explicit interaction events (from uiohook telemetry) ---
	const clickEvents = samples.filter((sample) => isExplicitClickType(sample.interactionType));

	const explicitInteractionCandidates: CursorInteractionCandidate[] = [];

	for (const clickSample of clickEvents) {
		// Classify what happened AFTER this click by analyzing cursor trajectory
		const kind = classifyPostClickBehavior(samples, clickSample);

		const baseStrength =
			kind === "double-click-like"
				? 1500
				: kind === "dropdown-open"
					? 1200
					: kind === "text-selection"
						? 1300
						: kind === "text-field-click"
							? 1100
							: 900;

		explicitInteractionCandidates.push({
			centerTimeMs: Math.round(clickSample.timeMs),
			focus: { cx: clickSample.cx, cy: clickSample.cy },
			strength: baseStrength,
			kind,
			source: "explicit",
		});
	}

	// --- Phase 2: Dwell-based heuristic candidates ---
	const dwellCandidates = detectZoomDwellCandidates(samples).map<CursorInteractionCandidate>(
		(candidate) => {
			if (candidate.strength >= 1100) {
				return { ...candidate, kind: "text-focus-like", source: "heuristic" };
			}
			if (candidate.strength <= 800) {
				return { ...candidate, kind: "click-like", source: "heuristic" };
			}
			return { ...candidate, kind: "dwell", source: "heuristic" };
		},
	);

	// --- Phase 3: Synthetic double-click detection from dwell pairs ---
	const doubleClickCandidates: CursorInteractionCandidate[] = [];
	const sortedByTime = [...dwellCandidates].sort((a, b) => a.centerTimeMs - b.centerTimeMs);

	for (let index = 1; index < sortedByTime.length; index += 1) {
		const prev = sortedByTime[index - 1];
		const curr = sortedByTime[index];
		const timeGap = curr.centerTimeMs - prev.centerTimeMs;
		const spatialGap = Math.hypot(curr.focus.cx - prev.focus.cx, curr.focus.cy - prev.focus.cy);
		const bothShort = prev.strength <= 900 && curr.strength <= 900;

		if (bothShort && timeGap <= 450 && spatialGap <= 0.035) {
			doubleClickCandidates.push({
				centerTimeMs: Math.round((prev.centerTimeMs + curr.centerTimeMs) / 2),
				focus: {
					cx: (prev.focus.cx + curr.focus.cx) / 2,
					cy: (prev.focus.cy + curr.focus.cy) / 2,
				},
				strength: prev.strength + curr.strength + 500,
				kind: "double-click-like",
				source: "heuristic",
			});
		}
	}

	return [...explicitInteractionCandidates, ...dwellCandidates, ...doubleClickCandidates];
}

/**
 * 按时间和空间聚合操作，跨区域操作和长操作链分别生成独立缩放。
 * @param clicks 真实点击或经过筛选的有效停留。
 * @param mergeGapMs 相邻操作的最大合并时间间隔。
 * @returns 带起止操作时间和代表焦点的聚合结果。
 */
function buildClickClusters(
	clicks: CursorInteractionCandidate[],
	mergeGapMs: number,
): Array<{ firstMs: number; lastMs: number; focus: ZoomFocus }> {
	if (clicks.length === 0) {
		return [];
	}

	const sorted = [...clicks].sort((a, b) => a.centerTimeMs - b.centerTimeMs);
	const clusters: Array<{ firstMs: number; lastMs: number; focus: ZoomFocus }> = [];

	let clusterStart = sorted[0].centerTimeMs;
	let clusterEnd = sorted[0].centerTimeMs;
	let bestStrength = sorted[0].strength;
	let bestFocus = sorted[0].focus;
	let sumCx = sorted[0].focus.cx;
	let sumCy = sorted[0].focus.cy;
	let count = 1;

	for (let i = 1; i < sorted.length; i++) {
		const click = sorted[i];
		const gap = click.centerTimeMs - clusterEnd;

		const distance = Math.hypot(click.focus.cx - bestFocus.cx, click.focus.cy - bestFocus.cy);
		if (gap <= mergeGapMs && distance <= 0.2 && click.centerTimeMs - clusterStart <= 4000) {
			// Extend current cluster
			clusterEnd = Math.max(clusterEnd, click.centerTimeMs);
			if (click.strength > bestStrength) {
				bestStrength = click.strength;
				bestFocus = click.focus;
			}
			sumCx += click.focus.cx;
			sumCy += click.focus.cy;
			count += 1;
		} else {
			// Flush current cluster and start a new one
			clusters.push({
				firstMs: clusterStart,
				lastMs: clusterEnd,
				focus: bestFocus ?? { cx: sumCx / count, cy: sumCy / count },
			});
			clusterStart = click.centerTimeMs;
			clusterEnd = click.centerTimeMs;
			bestStrength = click.strength;
			bestFocus = click.focus;
			sumCx = click.focus.cx;
			sumCy = click.focus.cy;
			count = 1;
		}
	}

	// Flush last cluster
	clusters.push({
		firstMs: clusterStart,
		lastMs: clusterEnd,
		focus: bestFocus ?? { cx: sumCx / count, cy: sumCy / count },
	});

	return clusters;
}

/**
 * 将源视频轨迹映射到剪辑后的时间轴，删除的素材不参与候选，重复素材分别映射。
 * @param samples 已排序的源视频轨迹。
 * @param clips 当前时间轴片段，包含源起点及播放速度。
 * @returns 对应时间轴的独立采样；没有剪辑时沿用源轨迹。
 */
export function mapZoomTelemetryToTimeline(samples: CursorTelemetryPoint[], clips: ClipRegion[]) {
	if (clips.length === 0) return samples;
	const mapped: CursorTelemetryPoint[] = [];
	for (const clip of clips) {
		const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
		const start = getClipSourceStartMs(clip);
		const end = start + (clip.endMs - clip.startMs) * speed;
		let first = Math.max(0, cursorSampleIndexAt(samples, start));
		while (first > 0 && samples[first - 1].timeMs >= start) first--;
		for (let i = first; i < samples.length; i++) {
			const sample = samples[i];
			if (sample.timeMs >= end) break;
			if (sample.timeMs < start) continue;
			mapped.push({ ...sample, timeMs: clip.startMs + (sample.timeMs - start) / speed });
		}
	}
	return mapped.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * 二分定位首个不早于目标时间的候选，避免长录制反复全量扫描。
 * @param candidates 已按时间排序的操作候选。
 * @param timeMs 时间轴目标时间。
 * @returns 首个匹配位置；没有匹配时为数组长度。
 */
function zoomCandidateIndexAt(candidates: CursorInteractionCandidate[], timeMs: number) {
	let lo = 0,
		hi = candidates.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (candidates[mid].centerTimeMs < timeMs) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * 在局部时间窗查找已识别操作，按需检查空间距离以抑制同一焦点的重复候选。
 * @param candidates 已排序操作。
 * @param candidate 待检查焦点。
 * @param windowMs 两侧的抑制时长。
 * @param distance 最大空间距离，省略时只检查时间。
 * @returns 局部窗口内存在可合并操作时为真。
 */
function hasNearbyZoomCandidate(
	candidates: CursorInteractionCandidate[],
	candidate: ZoomDwellCandidate,
	windowMs: number,
	distance = Infinity,
) {
	for (
		let i = zoomCandidateIndexAt(candidates, candidate.centerTimeMs - windowMs);
		i < candidates.length;
		i++
	) {
		const known = candidates[i];
		if (known.centerTimeMs > candidate.centerTimeMs + windowMs) break;
		if (
			Math.hypot(known.focus.cx - candidate.focus.cx, known.focus.cy - candidate.focus.cy) <=
			distance
		)
			return true;
	}
	return false;
}

/**
 * 在没有点击或停顿的连续操作中提取移动焦点，每四秒最多一个候选。
 * @param samples 时间轴轨迹。
 * @returns 有真实位移及足够观测时长的焦点，不为静止、细小抖动或断层补造缩放。
 */
function detectMovingFocusCandidates(
	samples: CursorTelemetryPoint[],
): CursorInteractionCandidate[] {
	const result: CursorInteractionCandidate[] = [];
	let start = 0;
	while (start < samples.length) {
		let end = start + 1;
		while (
			end < samples.length &&
			samples[end].timeMs - samples[start].timeMs < 4000 &&
			samples[end].timeMs - samples[end - 1].timeMs <= 1200
		)
			end++;
		let displacement = 0;
		for (let i = start + 1; i < end; i++) {
			const distance = Math.hypot(
				samples[i].cx - samples[start].cx,
				samples[i].cy - samples[start].cy,
			);
			if (distance > displacement) {
				displacement = distance;
			}
		}
		if (displacement >= 0.025 && samples[end - 1].timeMs - samples[start].timeMs >= 250) {
			// 在操作中段开始强调，短片不能等到移动结束才只放大最后几帧。
			const middleTime = (samples[start].timeMs + samples[end - 1].timeMs) / 2;
			const sample = samples[Math.max(start, cursorSampleIndexAt(samples, middleTime))];
			result.push({
				centerTimeMs: sample.timeMs,
				focus: { cx: sample.cx, cy: sample.cy },
				strength: 500,
				kind: "dwell",
				source: "heuristic",
			});
		}
		start = end;
	}
	return result;
}

/**
 * 从点击、有效停留和连续移动识别焦点，在剪辑时间轴的空闲部分生成缩放。
 * @param params 光标轨迹、片长及需要避让的现有片段。
 * @returns 按时间排列的缩放建议及未生成的原因。
 */
export function buildInteractionZoomSuggestions(params: {
	cursorTelemetry: CursorTelemetryPoint[];
	totalMs: number;
	defaultDurationMs: number;
	reservedSpans?: Array<{ start: number; end: number }>;
	spacingMs?: number;
	mergeGapMs?: number;
	padMs?: number;
	clipRegions?: ClipRegion[];
}): InteractionZoomSuggestionResult {
	const {
		cursorTelemetry,
		totalMs,
		reservedSpans = [],
		mergeGapMs = CLICK_CLUSTER_MERGE_GAP_MS,
		padMs = CLICK_CLUSTER_PAD_MS,
	} = params;

	if (!Number.isFinite(totalMs) || totalMs <= 0) {
		return { status: "no-slots", suggestions: [] };
	}

	// 建议生成只需坐标和操作时间，避免为每次建议重复推断整条轨迹的光标形状。
	const sourceSamples = cursorTelemetry
		.filter(
			(sample) =>
				Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy),
		)
		.map((sample) => normalizeTelemetrySample(sample, Number.MAX_SAFE_INTEGER))
		.sort((a, b) => a.timeMs - b.timeMs);
	const normalizedSamples = mapZoomTelemetryToTimeline(
		sourceSamples,
		params.clipRegions ?? [],
	).filter((sample) => sample.timeMs >= 0 && sample.timeMs <= totalMs);
	if (normalizedSamples.length === 0) {
		return { status: "no-telemetry", suggestions: [] };
	}

	if (
		normalizedSamples.length === 1 &&
		!isExplicitClickType(normalizedSamples[0].interactionType)
	) {
		return { status: "no-telemetry", suggestions: [] };
	}

	const explicit: CursorInteractionCandidate[] = normalizedSamples
		.filter((sample) => isExplicitClickType(sample.interactionType))
		.map((sample) => ({
			centerTimeMs: sample.timeMs,
			focus: { cx: sample.cx, cy: sample.cy },
			strength: sample.interactionType === "double-click" ? 1500 : 1000,
			kind: "click-like",
			source: "explicit",
		}));
	// 点击附近不重复推断停留；其他时段仍允许识别移动后阅读、输入等焦点。
	let sampleIndex = 0;
	const heuristic = detectZoomDwellCandidates(normalizedSamples)
		.filter((candidate) => {
			while (
				sampleIndex + 1 < normalizedSamples.length &&
				normalizedSamples[sampleIndex + 1].timeMs < candidate.centerTimeMs - candidate.strength / 2
			)
				sampleIndex++;
			const preceding = normalizedSamples[Math.max(0, sampleIndex - 1)];
			const moved =
				Math.hypot(preceding.cx - candidate.focus.cx, preceding.cy - candidate.focus.cy) >= 0.012;
			const nearbyClick = hasNearbyZoomCandidate(explicit, candidate, 900, 0.12);
			return moved && candidate.strength >= 450 && !nearbyClick;
		})
		.map<CursorInteractionCandidate>((candidate) => ({
			...candidate,
			kind: "dwell",
			source: "heuristic",
		}));
	const recognized = [...explicit, ...heuristic].sort((a, b) => a.centerTimeMs - b.centerTimeMs);
	const moving = detectMovingFocusCandidates(normalizedSamples).filter(
		(candidate) => !hasNearbyZoomCandidate(recognized, candidate, 1800),
	);
	const clickCandidates = [...recognized, ...moving].sort(
		(a, b) => a.centerTimeMs - b.centerTimeMs,
	);

	if (clickCandidates.length === 0) {
		return { status: "no-interactions", suggestions: [] };
	}

	// Group nearby clicks into clusters, then derive zoom windows from those clusters
	const clusters = buildClickClusters(clickCandidates, mergeGapMs);

	const reserved = [...reservedSpans].sort((a, b) => a.start - b.start);
	const suggestions: SuggestedZoomRegion[] = [];

	const padding = Number.isFinite(padMs) ? Math.max(0, padMs) : CLICK_CLUSTER_PAD_MS;
	const duration = Number.isFinite(params.defaultDurationMs)
		? Math.max(1000, params.defaultDurationMs)
		: 2000;
	const spacing = Number.isFinite(params.spacingMs) ? Math.max(0, params.spacingMs ?? 0) : 0;
	for (let index = 0; index < clusters.length; index++) {
		const cluster = clusters[index];
		const previous = clusters[index - 1];
		const next = clusters[index + 1];
		// 邻接焦点在两次操作之间交接，确保每次点击可见且片段不重叠。
		const left = previous ? (previous.lastMs + cluster.firstMs) / 2 + spacing / 2 : 0;
		const right = next ? (cluster.lastMs + next.firstMs) / 2 - spacing / 2 : totalMs;
		const regionStart = Math.max(0, cluster.firstMs - padding, left);
		const regionEnd = Math.min(
			totalMs,
			cluster.lastMs + Math.max(padding, duration - padding),
			right,
		);

		if (regionEnd <= regionStart) {
			continue;
		}

		// 保留包含实际操作的空闲部分，不能仅因前后留白与已有片段相碰就整段丢弃。
		let free = params.clipRegions?.length
			? params.clipRegions
					.map((clip) => ({
						start: Math.max(regionStart, clip.startMs),
						end: Math.min(regionEnd, clip.endMs),
					}))
					.filter((span) => span.end > span.start)
			: [{ start: regionStart, end: regionEnd }];
		for (const occupied of reserved)
			free = free.flatMap((span) => {
				if (span.end <= occupied.start || span.start >= occupied.end) return [span];
				return [
					{ start: span.start, end: Math.min(span.end, occupied.start) },
					{ start: Math.max(span.start, occupied.end), end: span.end },
				].filter((part) => part.end > part.start);
			});
		for (const span of free) {
			const anchor =
				clickCandidates[
					zoomCandidateIndexAt(clickCandidates, Math.max(span.start, cluster.firstMs))
				];
			if (
				!anchor ||
				anchor.centerTimeMs >= span.end ||
				anchor.centerTimeMs > cluster.lastMs ||
				span.end - span.start < Math.min(400, totalMs)
			)
				continue;
			reserved.push(span);
			suggestions.push({ ...span, focus: anchor.focus });
		}
	}

	if (suggestions.length === 0) {
		return { status: "no-slots", suggestions: [] };
	}

	// Sort chronologically
	suggestions.sort((a, b) => a.start - b.start);

	return { status: "ok", suggestions };
}

/**
 * 通过点击后有限时间窗口内的轨迹区分选择、菜单和输入焦点。
 * @param samples 已排序轨迹。
 * @param clickSample 当前真实点击。
 * @returns 该次交互的推断种类。
 */
function classifyPostClickBehavior(
	samples: CursorTelemetryPoint[],
	clickSample: CursorTelemetryPoint,
): CursorInteractionCandidate["kind"] {
	// Explicit double-click from uiohook
	if (clickSample.interactionType === "double-click") {
		return "double-click-like";
	}

	const clickTime = clickSample.timeMs;

	// Check for mouseup shortly after (drag detection)
	// 二分定位后只读取局部窗口，长录制不为每次点击扫描整条轨迹。
	const windowStart = cursorSampleIndexAt(samples, clickTime) + 1;
	const windowEnd = cursorSampleIndexAt(samples, clickTime + 3000) + 1;
	const following = samples.slice(windowStart, windowEnd);
	const mouseUpAfter = following.find(
		(s) => s.interactionType === "mouseup" && s.timeMs > clickTime && s.timeMs - clickTime < 3000,
	);

	if (mouseUpAfter) {
		const dragDx = Math.abs(mouseUpAfter.cx - clickSample.cx);
		const dragDy = Math.abs(mouseUpAfter.cy - clickSample.cy);
		const dragDuration = mouseUpAfter.timeMs - clickTime;

		// Text selection: horizontal drag > 3% of screen, mostly horizontal, duration 200ms+
		if (dragDuration >= 200 && dragDx > 0.03 && dragDx > dragDy * 1.8) {
			return "text-selection";
		}
	}

	// Analyze trajectory in the 400ms-2000ms window after click
	const moveSamples = following.filter(
		(s) =>
			s.timeMs > clickTime + 100 &&
			s.timeMs <= clickTime + 2000 &&
			(s.interactionType === "move" || !s.interactionType),
	);

	if (moveSamples.length < 3) {
		// Very few move samples after click = cursor stayed still = text field click
		return "text-field-click";
	}

	// Compute displacement from click position
	let maxDist = 0;
	let totalAbsDy = 0;
	let totalAbsDx = 0;
	for (const s of moveSamples) {
		const dist = Math.hypot(s.cx - clickSample.cx, s.cy - clickSample.cy);
		maxDist = Math.max(maxDist, dist);
		totalAbsDx += Math.abs(s.cx - clickSample.cx);
		totalAbsDy += Math.abs(s.cy - clickSample.cy);
	}

	// Cursor barely moved after click: text field click (dwell)
	if (maxDist < 0.02) {
		return "text-field-click";
	}

	// Primarily downward movement after click: dropdown open
	const lastMoveSample = moveSamples[moveSamples.length - 1];
	const netDy = lastMoveSample.cy - clickSample.cy;

	if (netDy > 0.03 && totalAbsDy > totalAbsDx * 1.5) {
		return "dropdown-open";
	}

	// Primarily horizontal movement: text selection (fallback if no mouseup)
	if (totalAbsDx > 0.03 && totalAbsDx > totalAbsDy * 1.8) {
		return "text-selection";
	}

	return "click-like";
}
