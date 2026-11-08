import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import type { AudioRegion, EditorEffectSection } from "../types";

interface UseAudioRegionCommandsParams {
	audioRegions: AudioRegion[];
	handleSeek: (time: number, options: { pause: boolean }) => void;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	selectedAudioId: string | null;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextAudioIdRef: MutableRefObject<number>;
}

/**
 * 管理独立音频的片段、选区与时间轴编辑。
 * @param props 当前声音片段及状态发布入口。
 * @returns 当前项目的音频编辑命令。
 */
export function useAudioRegionCommands({
	audioRegions,
	handleSeek,
	setSelectedClipId,
	setAudioRegions,
	selectedAudioId,
	setSelectedAudioId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedCaptionId,
	setActiveEffectSection,
	nextAudioIdRef,
}: UseAudioRegionCommandsParams) {
	/**
	 * 选中音频并暂停定位到起点。
	 * @param id 目标声音片段身份；空值清除选区。
	 * @returns 无返回值；同步检查器与互斥选区。
	 */
	const handleSelectAudio = useCallback(
		(id: string | null) => {
			setSelectedAudioId(id);
			if (id) {
				const region = audioRegions.find((audio) => audio.id === id);
				if (region) handleSeek(region.startMs / 1000, { pause: true });
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedClipId(null);
				setSelectedCaptionId(null);
				setActiveEffectSection("audio");
			}
		},
		[
			audioRegions,
			handleSeek,
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedClipId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedZoomId,
		],
	);

	const handleAudioAdded = useCallback(
		(span: Span, audioPath: string, trackIndex?: number) => {
			const id = `audio-${nextAudioIdRef.current++}`;
			const newRegion: AudioRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				audioPath,
				volume: 1,
				normalize: false,
				trackIndex,
			};
			setAudioRegions((current) => [...current, newRegion]);
			setSelectedAudioId(id);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
			setSelectedClipId(null);
			setSelectedCaptionId(null);
			setActiveEffectSection("audio");
		},
		[
			nextAudioIdRef,
			setActiveEffectSection,
			setAudioRegions,
			setSelectedAnnotationId,
			setSelectedClipId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedZoomId,
		],
	);

	const handleAudioSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...region,
								sourceStartMs: Math.abs((span.end - span.start) - (region.endMs - region.startMs)) > 1 ? Math.max(0, (region.sourceStartMs ?? 0) + (span.start - region.startMs) * (region.playbackRate ?? 1)) : region.sourceStartMs,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
								...(normalizedTrackIndex === undefined
									? {}
									: { trackIndex: normalizedTrackIndex }),
							}
						: region,
				),
			);
		},
		[setAudioRegions],
	);

	const handleAudioVolumeChange = useCallback(
		(volume: number) => {
			if (!selectedAudioId || !Number.isFinite(volume)) return;
			const nextVolume = Math.max(0, Math.min(1, volume));
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, volume: nextVolume } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	const handleAudioDelete = useCallback(
		(id: string) => {
			setAudioRegions((current) => current.filter((region) => region.id !== id));
			if (selectedAudioId === id) setSelectedAudioId(null);
		},
		[selectedAudioId, setAudioRegions, setSelectedAudioId],
	);

	const handleAudioNormalizeChange = useCallback(
		(normalize: boolean) => {
			if (!selectedAudioId) return;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, normalize } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	return {
		handleSelectAudio,
		handleAudioAdded,
		handleAudioSpanChange,
		handleAudioVolumeChange,
		handleAudioDelete,
		handleAudioNormalizeChange,
	};
}
