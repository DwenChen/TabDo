import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import { insertCopiedClip, insertTimelineGap } from '../timeline/timelineClipboard';
import { toast } from "@presentation/components/ui/toast";
import { changeClipSpan } from "../clipSpanChange";
import type { ClipSequenceSpan } from "../timeline/core/timelineTypes";
import {
	packClipSequence,
	reorderClipSequence,
	rippleRegions,
} from "../clipSequence";
import { getClipSourceStartMs, type AnnotationRegion, type AudioRegion } from "../types";
import { planClipSplit } from "../clipSplit";
import type { ClipRegion, EditorEffectSection, ZoomRegion } from "../types";
import { supportsPreviewPlaybackRate } from "../videoPlayback/playbackRate";
import type { SourceAudioTrackSettings } from "../audio/audioTypes";

type Translator = (
	key: string,
	fallback?: string,
	params?: Record<string, string | number>,
) => string;

interface UseClipRegionCommandsParams {
	handleSeek: (time: number, options: { pause: boolean }) => void;
	setSourceAudioTrackSettingsByClip: Dispatch<SetStateAction<Record<string, SourceAudioTrackSettings>>>;
	setAnnotationRegions: Dispatch<SetStateAction<AnnotationRegion[]>>;
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	sourceDurationMs: number;
	clipRegions: ClipRegion[];
	setClipRegions: Dispatch<SetStateAction<ClipRegion[]>>;
	zoomRegions: ZoomRegion[];
	setZoomRegions: Dispatch<SetStateAction<ZoomRegion[]>>;
	selectedClipId: string | null;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextClipIdRef: MutableRefObject<number>;
	t: Translator;
}

/**
 * 管理录屏片段及关联效果的编辑，保留源素材坐标和独立音频。
 * @param props 当前片段、素材时长及状态发布入口。
 * @returns 当前项目的录屏编辑和选择命令。
 */
export function useClipRegionCommands({
	handleSeek,
	setSourceAudioTrackSettingsByClip,
	setAnnotationRegions,
	setAudioRegions,
	sourceDurationMs,
	clipRegions,
	setClipRegions,
	setZoomRegions,
	selectedClipId,
	setSelectedClipId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedAudioId,
	setSelectedCaptionId,
	setActiveEffectSection,
	nextClipIdRef,
	t,
}: UseClipRegionCommandsParams) {
	const applySequence = useCallback(
		(edited: ClipRegion[]) => {
			const next = packClipSequence(edited);
			setClipRegions(next);
			setZoomRegions((current) => rippleRegions(current, clipRegions, next));
			setAnnotationRegions((current) => rippleRegions(current, clipRegions, next));
			// Independent audio retains timeline positions when video clips move or trim.
		},
		[clipRegions, setClipRegions, setZoomRegions, setAnnotationRegions, setAudioRegions],
	);

	/**
	 * 选中录屏并暂停定位到起点，同步互斥选区与检查器。
	 * @param id 目标片段身份；空值清除选区。
	 * @returns 无返回值；选择本身不写入编辑历史。
	 */
	const handleSelectClip = useCallback(
		(id: string | null) => {
			setSelectedClipId(id);
			if (id) {
				const region = clipRegions.find((clip) => clip.id === id);
				if (region) handleSeek(region.startMs / 1000, { pause: true });
				setActiveEffectSection("clip");
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedAudioId(null);
				setSelectedCaptionId(null);
			} else {
				setActiveEffectSection((section) => (section === "clip" ? "scene" : section));
			}
		},
		[
			clipRegions,
			handleSeek,
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedClipId,
			setSelectedZoomId,
		],
	);

	/**
	 * 仅分割指定的录屏片段，游标在其他片段内时不修改。
	 * @param splitMs 时间轴毫秒切点。
	 * @param clipId 目标片段，默认当前选区。
	 * @returns 无有效目标时不操作，成功时发布两个连续片段。
	 */
	const handleClipSplit = useCallback(
		(splitMs: number, clipId = selectedClipId) => {
			if (!clipId) return;
			const plan = planClipSplit({
				clipRegions: clipRegions.filter((clip) => clip.id === clipId),
				splitMs,
				createId: () => `clip-${nextClipIdRef.current++}`,
			});
			if (!plan) return;
			setClipRegions((current) =>
				current.flatMap((clip) =>
					clip.id === plan.targetId ? [plan.left, plan.right] : [clip],
				),
			);
			handleSelectClip(plan.left.id);
		},
		[clipRegions, selectedClipId, nextClipIdRef, setClipRegions, handleSelectClip],
	);

	const handleClipSpanChange = useCallback(
		(id: string, span: ClipSequenceSpan) => {
			const oldClip = clipRegions.find((clip) => clip.id === id);
			const newStart = Math.round(span.start);
			const newEnd = Math.round(span.end);

			if (!oldClip) return;
			if (span.sequenceIndex !== undefined) {
				applySequence(reorderClipSequence(clipRegions, id, span.sequenceIndex));
				return;
			}
			applySequence(
				clipRegions.map((clip) =>
					clip.id === id
						? changeClipSpan(clip, newStart, newEnd, sourceDurationMs)
						: clip,
				),
			);
		},
		[clipRegions, applySequence, sourceDurationMs],
	);

	const handleClipSpeedChange = useCallback(
		(speed: number) => {
			if (!selectedClipId || !Number.isFinite(speed) || speed <= 0) return;
			if (!supportsPreviewPlaybackRate(speed)) {
				toast.error(
					t(
						"editor.timeline.unsupportedSpeed",
						"当前设备不支持以此速度预览。",
					),
				);
				return;
			}

			applySequence(
				clipRegions.map((clip) =>
					clip.id === selectedClipId
						? {
								...clip,
								sourceStartMs: getClipSourceStartMs(clip),
								speed,
								endMs:
									clip.startMs +
									Math.max(
										1,
										Math.round(
											((clip.endMs - clip.startMs) * clip.speed) / speed,
										),
									),
							}
						: clip,
				),
			);
		},
		[clipRegions, selectedClipId, applySequence, t],
	);

	const handleClipMutedChange = useCallback(
		(muted: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) => (clip.id === selectedClipId ? { ...clip, muted } : clip)),
			);
		},
		[selectedClipId, setClipRegions],
	);
	const handleClipShowSourceAudioChange = useCallback(
		(showSourceAudio: boolean) => {
			if (!selectedClipId) return;
			setClipRegions((current) =>
				current.map((clip) =>
					clip.id === selectedClipId ? { ...clip, showSourceAudio } : clip,
				),
			);
		},
		[selectedClipId, setClipRegions],
	);

	const handleClipDelete = useCallback(
		(id: string) => {
			applySequence(clipRegions.filter((clip) => clip.id !== id));
			if (selectedClipId === id) setSelectedClipId(null);
		},
		[clipRegions, selectedClipId, applySequence, setSelectedClipId],
	);
	/**
	 * Duplicate the selected footage directly after its current position.
	 * @returns Nothing; packs the sequence and updates anchored effects.
	 */
	const handleClipDuplicate = useCallback(() => {
		const index = clipRegions.findIndex((clip) => clip.id === selectedClipId);
		if (index < 0) return;
		const copy = { ...clipRegions[index], id: `clip-${nextClipIdRef.current++}` };
		const next = [...clipRegions];
		next.splice(index + 1, 0, copy);
		applySequence(next);
		// Copy per-clip audio choices while leaving inherited project defaults unchanged.
		setSourceAudioTrackSettingsByClip((current) => current[clipRegions[index].id] ? { ...current, [copy.id]: { ...current[clipRegions[index].id] } } : current);
		handleSelectClip(copy.id);
	}, [clipRegions, selectedClipId, nextClipIdRef, applySequence, handleSelectClip, setSourceAudioTrackSettingsByClip]);
	/**
	 * Move the selected footage to its adjacent sequence position.
	 * @param direction Negative for the previous position, positive for the next.
	 * @returns Nothing; applies the reordered sequence when a neighbor exists.
	 */
	const handleClipMove = useCallback((direction: -1 | 1) => {
		const index = clipRegions.findIndex((clip) => clip.id === selectedClipId);
		if (index < 0 || index + direction < 0 || index + direction >= clipRegions.length) return;
		const next = [...clipRegions];
		const [clip] = next.splice(index, 1);
		next.splice(index + direction, 0, clip);
		applySequence(next);
	}, [clipRegions, selectedClipId, applySequence]);

	return {
		/**
		 * 粘贴复制的视频及声音设置，保留插入点前后的关联注释和缩放。
		 * @param copied 带新身份的视频副本。
		 * @param atMs 粘贴游标位置。
		 * @param audio 复制时的视频声音设置快照。
		 * @returns 无返回值；插入后选中新片段。
		 */
		handleClipPaste(copied: ClipRegion, atMs: number, audio?: SourceAudioTrackSettings): void {
			const plan = insertCopiedClip(clipRegions, copied, atMs, () => `clip-${crypto.randomUUID()}`);
			setClipRegions(plan.clips);
			// 内部插入会产生新右半段身份；按插入时间平移效果，不能按旧片段身份裁掉尾部注释。
			const lengthMs = copied.endMs - copied.startMs;
			setZoomRegions((current) => insertTimelineGap(current, atMs, lengthMs, () => `zoom-${crypto.randomUUID()}`));
			setAnnotationRegions((current) => insertTimelineGap(current, atMs, lengthMs, () => `annotation-${crypto.randomUUID()}`));
			// 切开的右半段与复制片段分别继承自己的原始声音选择。
			setSourceAudioTrackSettingsByClip((current) => ({ ...current,
				...(audio ? { [copied.id]: structuredClone(audio) } : {}),
				...(plan.split && current[plan.split.originalId]
					? { [plan.split.rightId]: structuredClone(current[plan.split.originalId]) } : {}) }));
			handleSelectClip(copied.id);
		},
		handleClipDuplicate,
		handleClipMove,
		handleSelectClip,
		handleClipSplit,
		handleClipSpanChange,
		handleClipSpeedChange,
		handleClipMutedChange,
		handleClipShowSourceAudioChange,
		handleClipDelete,
	};
}
