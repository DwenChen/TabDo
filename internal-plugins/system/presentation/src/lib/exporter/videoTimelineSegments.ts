import type { ZoomPlaybackClock } from "@presentation/components/video-editor/zoomPlayback";
import {
	type ClipRegion,
	type SpeedRegion,
	type TrimRegion,
	getClipSourceStartMs,
	getClipSourceEndMs,
	sortClipRegions,
} from "@presentation/components/video-editor/types";

export interface VideoSegment {
	startSec: number;
	endSec: number;
	speed: number;
	outputStartSec?: number;
	outputEndSec?: number;
	editStartMs?: number;
	zoomPlayback?: ZoomPlaybackClock;
}

/**
 * Plan forward decode passes while placing each clip on the export clock.
 * @param clips Explicit clips in edit-timeline coordinates.
 * @param zoomPlayback Clock for zoom-region video speed, if present.
 * @returns Runs ordered by presentation, with source positions intact.
 */
export function buildClipDecodeRuns(clips: ClipRegion[], zoomPlayback?: ZoomPlaybackClock): VideoSegment[][] {
	const runs: VideoSegment[][] = [];
	for (const clip of sortClipRegions(clips)) {
		const segment: VideoSegment = {
			startSec: getClipSourceStartMs(clip) / 1000,
			endSec: getClipSourceEndMs(clip) / 1000,
			speed: clip.speed,
			outputStartSec: (zoomPlayback?.toOutputMs(clip.startMs) ?? clip.startMs) / 1000,
			outputEndSec: (zoomPlayback?.toOutputMs(clip.endMs) ?? clip.endMs) / 1000,
			...(zoomPlayback ? { editStartMs: clip.startMs, zoomPlayback } : {}),
		};
		const run = runs[runs.length - 1];
		if (run && segment.startSec >= run[run.length - 1].endSec) run.push(segment);
		else runs.push([segment]);
	}
	return runs;
}

export function segmentFrameCount(segment: VideoSegment, fps: number): number {
	return segment.outputStartSec !== undefined && segment.outputEndSec !== undefined
		? Math.ceil(segment.outputEndSec * fps) - Math.ceil(segment.outputStartSec * fps)
		: Math.ceil(((segment.endSec - segment.startSec) / segment.speed) * fps);
}

/**
 * Resolve source media time for an output frame.
 * @param segment Current clip segment.
 * @param index Output frame index within the segment.
 * @param fps Export frames per second.
 * @returns Source timestamp in seconds.
 */
export function segmentSourceTime(segment: VideoSegment, index: number, fps: number): number {
	if (segment.zoomPlayback && segment.outputStartSec !== undefined && segment.editStartMs !== undefined) {
		const outputMs = (Math.ceil(segment.outputStartSec * fps) + index) * 1000 / fps;
		const editOffsetMs = segment.zoomPlayback.toEditMs(outputMs) - segment.editStartMs;
		return segment.startSec + Math.max(0, editOffsetMs) * segment.speed / 1000;
	}
	const outputOffset =
		segment.outputStartSec === undefined
			? index / fps
			: (Math.ceil(segment.outputStartSec * fps) + index) / fps - segment.outputStartSec;
	return segment.startSec + outputOffset * segment.speed;
}

export function computeVideoSegments(
	totalDuration: number,
	trimRegions?: TrimRegion[],
): Array<{ startSec: number; endSec: number }> {
	if (!trimRegions || trimRegions.length === 0) {
		return [{ startSec: 0, endSec: totalDuration }];
	}

	const sorted = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
	const segments: Array<{ startSec: number; endSec: number }> = [];
	let cursor = 0;

	for (const trim of sorted) {
		const trimStart = trim.startMs / 1000;
		const trimEnd = trim.endMs / 1000;
		if (cursor < trimStart) {
			segments.push({ startSec: cursor, endSec: trimStart });
		}
		cursor = Math.max(cursor, trimEnd);
	}

	if (cursor < totalDuration) {
		segments.push({ startSec: cursor, endSec: totalDuration });
	}

	return segments;
}

export function splitVideoSegmentsBySpeed(
	segments: Array<{ startSec: number; endSec: number }>,
	speedRegions?: SpeedRegion[],
): Array<{ startSec: number; endSec: number; speed: number }> {
	if (!speedRegions || speedRegions.length === 0)
		return segments.map((s) => ({ ...s, speed: 1 }));

	const result: Array<{ startSec: number; endSec: number; speed: number }> = [];
	for (const segment of segments) {
		const overlapping = speedRegions
			.filter(
				(sr) => sr.startMs / 1000 < segment.endSec && sr.endMs / 1000 > segment.startSec,
			)
			.sort((a, b) => a.startMs - b.startMs);

		if (overlapping.length === 0) {
			result.push({ ...segment, speed: 1 });
			continue;
		}

		let cursor = segment.startSec;
		for (const sr of overlapping) {
			const srStart = Math.max(sr.startMs / 1000, segment.startSec);
			const srEnd = Math.min(sr.endMs / 1000, segment.endSec);
			if (cursor < srStart) {
				result.push({ startSec: cursor, endSec: srStart, speed: 1 });
			}
			const effectiveStart = Math.max(cursor, srStart);
			if (srEnd > effectiveStart) {
				result.push({
					startSec: effectiveStart,
					endSec: srEnd,
					speed: sr.speed,
				});
			}
			cursor = Math.max(cursor, srEnd);
		}
		if (cursor < segment.endSec)
			result.push({ startSec: cursor, endSec: segment.endSec, speed: 1 });
	}
	return result.filter((s) => s.endSec - s.startSec > 0.0001);
}
