import type { AudioRegion, ClipRegion } from '../types'
import type { SourceAudioTrackSettings } from './audioTypes'
import { getSourceTrackIdFromPath } from '@presentation/lib/exporter/audioProcessorShared'

/**
 * Materialize each recorded source once, including companions published after initial load.
 * @param clips Screen clips with persisted source identities already materialized.
 * @param regions Existing independently edited audio, including user imports.
 * @param paths Available recorded source paths in system/microphone order.
 * @param delays Explicit capture delays for companion media.
 * @param settings Resolve the previous gain and normalization for each screen clip.
 * @returns Updated clips and audio; deleted or edited tracks are never recreated.
 */
export function materializeSourceAudio(
  clips: ClipRegion[],
  regions: AudioRegion[],
  paths: string[],
  delays: Record<string, number>,
  settings: (id: string) => SourceAudioTrackSettings
): { clips: ClipRegion[]; regions: AudioRegion[] } {
  const additions: AudioRegion[] = []
  const firstTrack = Math.max(-1, ...regions.map((region) => region.trackIndex ?? 0)) + 1
  const nextClips = clips.map((clip) => {
    // A legacy mute is an explicit choice; automatically materialized clips carry their own marker.
    if (clip.muted && !clip.detachedAudioPaths) return clip
    const pending = paths.filter((path) => !clip.detachedAudioPaths?.includes(path))
    if (!pending.length) return clip
    for (const path of pending) {
      const track = getSourceTrackIdFromPath(path)
      const sourceStart = (clip.sourceStartMs ?? clip.startMs) - (delays[path] ?? 0)
      const startMs = clip.startMs + Math.max(0, -sourceStart) / clip.speed
      if (startMs >= clip.endMs) continue
      const gain = settings(clip.id)[track]
      additions.push({
        id: `recorded-${clip.id}-${encodeURIComponent(path)}`,
        startMs,
        endMs: clip.endMs,
        sourceStartMs: Math.max(0, sourceStart),
        playbackRate: clip.speed,
        audioPath: path,
        volume: gain?.volume ?? 1,
        normalize: gain?.normalize ?? false,
        trackIndex: firstTrack + paths.indexOf(path),
        label: track === 'mic' ? '麦克风' : track === 'system' ? '系统音频' : '原始声音'
      })
    }
    return {
      ...clip,
      muted: true,
      showSourceAudio: false,
      detachedAudioPaths: [...(clip.detachedAudioPaths ?? []), ...pending]
    }
  })
  return { clips: nextClips, regions: additions.length ? [...regions, ...additions] : regions }
}
