import { type MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	createEditorHistoryStack,
	type EditorHistorySnapshot,
	recordEditorHistorySnapshot,
	redoEditorHistoryStack,
	resetEditorHistoryStack,
	undoEditorHistoryStack,
} from "../editorHistory";
import { deriveNextId } from "../projectPersistence";
import type { useTimelineState } from "../state/useTimelineState";
import { cloneStructured } from "../videoEditorUtils";
import type { ProjectEditorState } from '../projectPersistence';

type Input = {
	editorState: Partial<ProjectEditorState>;
	restoreEditor: (editor: Partial<ProjectEditorState>) => void;
	timeline: ReturnType<typeof useTimelineState>;
	nextZoomIdRef: MutableRefObject<number>;
	nextClipIdRef: MutableRefObject<number>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAudioIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
};

/**
 * 管理片段及按键显示选择的撤销历史，恢复时保留素材引用和编辑内容。
 * @param input 当前轨道和后续片段身份计数器。
 * @returns 历史可用状态与撤销、恢复命令。
 */
export function useEditorHistory({
	editorState,
	restoreEditor,
	timeline,
	nextZoomIdRef,
	nextClipIdRef,
	nextAnnotationIdRef,
	nextAudioIdRef,
	nextAnnotationZIndexRef,
}: Input) {
	const {
		zoomRegions,
		clipRegions,
		speedRegions,
		annotationRegions,
		keyboardDisplayEnabled,
		setKeyboardDisplayEnabled,
		audioRegions,
		autoCaptions,
		selectedZoomId,
		selectedClipId,
		selectedAnnotationId,
		selectedAudioId,
		setZoomRegions,
		setClipRegions,
		setSpeedRegions,
		setAnnotationRegions,
		setAudioRegions,
		setAutoCaptions,
		setSelectedZoomId,
		setSelectedClipId,
		setSelectedAnnotationId,
		setSelectedAudioId,
	} = timeline;
	const historyRef = useRef(createEditorHistoryStack());
	const applyingRef = useRef(false);
	const gestureRef = useRef(false);
	const interactedRef = useRef(false);
	const latestSnapshotRef = useRef<EditorHistorySnapshot | null>(null);
	const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
	const syncButtons = useCallback(() => {
		const next = {
			canUndo: historyRef.current.past.length > 0,
			canRedo: historyRef.current.future.length > 0,
		};
		setHistoryFlags((current) =>
			current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next,
		);
	}, []);
	const buildSnapshot = useCallback(
		(): EditorHistorySnapshot => ({
			editor: editorState,
			zoomRegions,
			clipRegions,
			speedRegions,
			annotationRegions,
			keyboardDisplayEnabled,
			audioRegions,
			autoCaptions,
			selectedZoomId,
			selectedClipId,
			selectedAnnotationId,
			selectedAudioId,
		}),
		[
			editorState,
			zoomRegions,
			clipRegions,
			speedRegions,
			annotationRegions,
			keyboardDisplayEnabled,
			audioRegions,
			autoCaptions,
			selectedZoomId,
			selectedClipId,
			selectedAnnotationId,
			selectedAudioId,
		],
	);
	const applySnapshot = useCallback(
		(snapshot: EditorHistorySnapshot) => {
			applyingRef.current = true;
			const cloned = cloneStructured(snapshot);
			// 用持久编辑模型完整恢复外观、轨道顺序、摄像头和音频设置。
			if (cloned.editor) restoreEditor(cloned.editor);
			setZoomRegions(cloned.zoomRegions);
			setClipRegions(cloned.clipRegions);
			setSpeedRegions(cloned.speedRegions);
			setAnnotationRegions(cloned.annotationRegions);
			setKeyboardDisplayEnabled(cloned.keyboardDisplayEnabled ?? null);
			setAudioRegions(cloned.audioRegions);
			setAutoCaptions(cloned.autoCaptions);
			setSelectedZoomId(cloned.selectedZoomId);
			setSelectedClipId(cloned.selectedClipId);
			setSelectedAnnotationId(cloned.selectedAnnotationId);
			setSelectedAudioId(cloned.selectedAudioId);
			nextZoomIdRef.current = deriveNextId(
				"zoom",
				cloned.zoomRegions.map(({ id }) => id),
			);
			nextClipIdRef.current = deriveNextId(
				"clip",
				cloned.clipRegions.map(({ id }) => id),
			);
			nextAnnotationIdRef.current = deriveNextId(
				"annotation",
				cloned.annotationRegions.map(({ id }) => id),
			);
			nextAudioIdRef.current = deriveNextId(
				"audio",
				cloned.audioRegions.map(({ id }) => id),
			);
			nextAnnotationZIndexRef.current =
				cloned.annotationRegions.reduce((max, region) => Math.max(max, region.zIndex), 0) +
				1;
		},
		[
			restoreEditor,
			setZoomRegions,
			setClipRegions,
			setSpeedRegions,
			setAnnotationRegions,
			setKeyboardDisplayEnabled,
			setAudioRegions,
			setAutoCaptions,
			setSelectedZoomId,
			setSelectedClipId,
			setSelectedAnnotationId,
			setSelectedAudioId,
			nextZoomIdRef,
			nextClipIdRef,
			nextAnnotationIdRef,
			nextAudioIdRef,
			nextAnnotationZIndexRef,
		],
	);
	const handleUndo = useCallback(() => {
		const previous = undoEditorHistoryStack(historyRef.current, buildSnapshot());
		if (previous) {
			applySnapshot(previous);
			syncButtons();
		}
	}, [applySnapshot, buildSnapshot, syncButtons]);
	const handleRedo = useCallback(() => {
		const next = redoEditorHistoryStack(historyRef.current, buildSnapshot());
		if (next) {
			applySnapshot(next);
			syncButtons();
		}
	}, [applySnapshot, buildSnapshot, syncButtons]);
	const resetHistory = useCallback(() => {
		resetEditorHistoryStack(historyRef.current);
		applyingRef.current = false;
		gestureRef.current = false;
		interactedRef.current = false;
		syncButtons();
	}, [syncButtons]);

	latestSnapshotRef.current = buildSnapshot();
	/**
	 * 提交最新编辑快照，将加载期自动补轨作为基线，避免拖动中每帧占用一个历史步骤。
	 * @returns 无返回值；更新撤销按钮及当前快照。
	 */
	const commitLatest = useCallback(() => {
		const snapshot = latestSnapshotRef.current;
		if (!snapshot || gestureRef.current) return;
		if (!interactedRef.current && !applyingRef.current) {
			historyRef.current.current = cloneStructured(snapshot);
			return;
		}
		const result = recordEditorHistorySnapshot(historyRef.current, snapshot, {
			applyingHistory: applyingRef.current,
		});
		if (result === "applied") applyingRef.current = false;
		if (result !== "unchanged") syncButtons();
	}, [syncButtons]);
	useLayoutEffect(() => { commitLatest(); }, [buildSnapshot, commitLatest]);
	useEffect(() => {
		let finishTimer: ReturnType<typeof setTimeout> | undefined;
		/**
		 * 在用户手势开始前保留完整基线，并合并本次指针操作的中间帧。
		 * @returns 无返回值；开始本次编辑手势。
		 */
		function start(): void {
			if (finishTimer) { clearTimeout(finishTimer); gestureRef.current = false; commitLatest(); }
			interactedRef.current = true;
			gestureRef.current = true;
		}
		/**
		 * 等待拖动库发布最终区间后，只提交这一次手势的结果。
		 * @returns 无返回值；结束或取消后提交当前稳定状态。
		 */
		function finish(): void {
			if (finishTimer) clearTimeout(finishTimer);
			finishTimer = setTimeout(() => { gestureRef.current = false; commitLatest(); finishTimer = undefined; }, 0);
		}
		/**
		 * 标记键盘编辑，单纯切换选区仍由内容比较排除。
		 * @returns 无返回值。
		 */
		function keyboard(): void { interactedRef.current = true; }
		document.addEventListener('pointerdown', start, true);
		document.addEventListener('pointerup', finish, true);
		document.addEventListener('pointercancel', finish, true);
		document.addEventListener('keydown', keyboard, true);
		return () => {
			if (finishTimer) clearTimeout(finishTimer);
			document.removeEventListener('pointerdown', start, true);
			document.removeEventListener('pointerup', finish, true);
			document.removeEventListener('pointercancel', finish, true);
			document.removeEventListener('keydown', keyboard, true);
		};
	}, [commitLatest]);

	return {
		...historyFlags,
		handleUndo,
		handleRedo,
		resetHistory,
	};
}
