import type { ZoomPlaybackClock } from "@presentation/components/video-editor/zoomPlayback";
import { type ClipRegion, getClipSourceStartMs } from "@presentation/components/video-editor/types";

/**
 * Decide whether the exporter needs explicit clip placement and timing.
 * @param clips Current explicit clip timeline.
 * @param zoomPlayback Clock for zoom-region video speed, if present.
 * @returns Whether trim-only or native shortcuts would change the edit.
 */
export function requiresClipTimelineRendering(clips?: ClipRegion[], zoomPlayback?: ZoomPlaybackClock): boolean {
	if (!clips) return false;
	return (
		zoomPlayback !== undefined ||
		clips.length !== 1 ||
		clips[0].startMs !== 0 ||
		getClipSourceStartMs(clips[0]) !== 0 ||
		clips[0].speed !== 1
	);
}
