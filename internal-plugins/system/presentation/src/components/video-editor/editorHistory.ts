import type {
	AnnotationRegion,
	AudioRegion,
	CaptionCue,
	ClipRegion,
	SpeedRegion,
	ZoomRegion,
} from "./types";
import type { ProjectEditorState } from './projectPersistence';

export type EditorHistorySnapshot = {
	editor?: Partial<ProjectEditorState>;
	zoomRegions: ZoomRegion[];
	clipRegions: ClipRegion[];
	speedRegions: SpeedRegion[];
	annotationRegions: AnnotationRegion[];
	keyboardDisplayEnabled?: boolean | null;
	audioRegions: AudioRegion[];
	autoCaptions: CaptionCue[];
	selectedZoomId: string | null;
	selectedClipId: string | null;
	selectedAnnotationId: string | null;
	selectedAudioId: string | null;
};

export type EditorHistoryStack = {
	past: EditorHistorySnapshot[];
	current: EditorHistorySnapshot | null;
	future: EditorHistorySnapshot[];
};

export type EditorHistoryRecordResult = "initialized" | "applied" | "recorded" | "unchanged";

export const MAX_EDITOR_HISTORY_ENTRIES = 100;

export function createEditorHistoryStack(): EditorHistoryStack {
	return {
		past: [],
		current: null,
		future: [],
	};
}

export function resetEditorHistoryStack(stack: EditorHistoryStack): void {
	stack.past = [];
	stack.current = null;
	stack.future = [];
}

export function cloneEditorHistorySnapshot(snapshot: EditorHistorySnapshot): EditorHistorySnapshot {
	return globalThis.structuredClone(snapshot);
}

function isComparableObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function areDeepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}

	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
			return false;
		}

		return left.every((value, index) => areDeepEqual(value, right[index]));
	}

	if (!isComparableObject(left) || !isComparableObject(right)) {
		return false;
	}

	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	return leftKeys.every((key) => key in right && areDeepEqual(left[key], right[key]));
}

/**
 * 比较真实编辑内容，选区和录屏派生裁剪镜像不消耗额外历史步骤。
 * @param left 上一编辑快照。
 * @param right 当前编辑快照。
 * @returns 编辑内容相同则为真。
 */
export function areEditorHistorySnapshotsEqual(
	left: EditorHistorySnapshot,
	right: EditorHistorySnapshot,
): boolean {
	// 选区只为恢复编辑上下文保留，点击或切换片段不消耗撤销步数，也不清空重做。
	const { selectedZoomId: _lz, selectedClipId: _lc, selectedAnnotationId: _la, selectedAudioId: _lu, ...leftEdits } = left;
	const { selectedZoomId: _rz, selectedClipId: _rc, selectedAnnotationId: _ra, selectedAudioId: _ru, ...rightEdits } = right;
	// 录屏片段已是完整历史源；异步刷新的旧裁剪镜像不能让删除或变速需要两次撤销。
	if (leftEdits.editor) {
		const { trimRegions: _leftTrims, ...editor } = leftEdits.editor;
		leftEdits.editor = editor;
	}
	if (rightEdits.editor) {
		const { trimRegions: _rightTrims, ...editor } = rightEdits.editor;
		rightEdits.editor = editor;
	}
	return areDeepEqual(leftEdits, rightEdits);
}

/**
 * 记录独立编辑快照，保留容量限制并在新编辑时清空旧重做分支。
 * @param stack 当前项目历史栈。
 * @param snapshot 当前编辑与选区。
 * @param options 历史恢复标记及容量上限。
 * @returns 初始化、恢复、记录或未变化的状态。
 */
export function recordEditorHistorySnapshot(
	stack: EditorHistoryStack,
	snapshot: EditorHistorySnapshot,
	options: {
		applyingHistory?: boolean;
		maxEntries?: number;
	} = {},
): EditorHistoryRecordResult {
	const clonedSnapshot = cloneEditorHistorySnapshot(snapshot);

	if (!stack.current) {
		stack.current = clonedSnapshot;
		return "initialized";
	}

	if (options.applyingHistory) {
		stack.current = clonedSnapshot;
		return "applied";
	}

	if (areEditorHistorySnapshotsEqual(stack.current, snapshot)) {
		stack.current = clonedSnapshot;
		return "unchanged";
	}

	stack.past.push(cloneEditorHistorySnapshot(stack.current));
	const maxEntries = options.maxEntries ?? MAX_EDITOR_HISTORY_ENTRIES;
	if (stack.past.length > maxEntries) {
		stack.past.shift();
	}

	stack.current = clonedSnapshot;
	stack.future = [];
	return "recorded";
}

export function undoEditorHistoryStack(
	stack: EditorHistoryStack,
	fallbackCurrent: EditorHistorySnapshot,
): EditorHistorySnapshot | null {
	if (stack.past.length === 0) {
		return null;
	}

	const current = stack.current ?? cloneEditorHistorySnapshot(fallbackCurrent);
	const previous = stack.past.pop();
	if (!previous) {
		return null;
	}

	stack.future.push(cloneEditorHistorySnapshot(current));
	stack.current = cloneEditorHistorySnapshot(previous);
	return cloneEditorHistorySnapshot(previous);
}

export function redoEditorHistoryStack(
	stack: EditorHistoryStack,
	fallbackCurrent: EditorHistorySnapshot,
): EditorHistorySnapshot | null {
	if (stack.future.length === 0) {
		return null;
	}

	const current = stack.current ?? cloneEditorHistorySnapshot(fallbackCurrent);
	const next = stack.future.pop();
	if (!next) {
		return null;
	}

	stack.past.push(cloneEditorHistorySnapshot(current));
	stack.current = cloneEditorHistorySnapshot(next);
	return cloneEditorHistorySnapshot(next);
}
