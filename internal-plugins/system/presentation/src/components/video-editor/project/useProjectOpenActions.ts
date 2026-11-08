import {
	type Dispatch,
	type MutableRefObject,
	type RefObject,
	type SetStateAction,
	useCallback,
	useEffect,
} from "react";
import type { useProjectSaveActions } from "./useProjectSaveActions";
import { toast } from "@presentation/components/ui/toast";
import { fromFileUrl, resolveVideoUrl } from "../projectPersistence";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useProjectState } from "../state/useProjectState";
import { DEFAULT_WEBCAM_TIME_OFFSET_MS } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";

type Set<T> = Dispatch<SetStateAction<T>>;

type UseProjectOpenActionsInput = {
	project: ReturnType<typeof useProjectState>;
	appearance: ReturnType<typeof useAppearanceState>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>;
	hasUnsavedChanges: boolean;
	setIsPlaying: Set<boolean>;
	setCurrentTime: Set<number>;
	setDuration: Set<number>;
	applyLoadedProject: (candidate: unknown, path?: string | null) => Promise<boolean>;
	openUnsavedChangesDialog: (actionLabel: string) => Promise<"save" | "discard" | "cancel">;
	saveProject: ReturnType<typeof useProjectSaveActions>["saveProject"];
	retireProjectSaves: ReturnType<typeof useProjectSaveActions>["retireProjectSaves"];
	refreshProjectLibrary: () => Promise<void>;
	resetSourceScopedEditorState: () => void;
	applySessionPresentation: (session: null) => void;
	handleSaveProject: () => Promise<unknown>;
	handleSaveProjectAs: () => Promise<unknown>;
};

export function useProjectOpenActions({
	project,
	appearance,
	videoPlaybackRef,
	pendingFreshRecordingAutoZoomPathRef,
	hasUnsavedChanges,
	setIsPlaying,
	setCurrentTime,
	setDuration,
	applyLoadedProject,
	saveProject,
	retireProjectSaves,
	refreshProjectLibrary,
	resetSourceScopedEditorState,
	applySessionPresentation,
	handleSaveProject,
	handleSaveProjectAs,
}: UseProjectOpenActionsInput) {
	const confirmReplaceSourceWithUnsavedChanges = useCallback(
		async (_actionLabel: string) => {
			if (!hasUnsavedChanges) return true;
			return saveProject(false, { remountPreviewAfterSave: false });
		},
		[hasUnsavedChanges, saveProject],
	);

	const handleOpenProjectFromLibrary = useCallback(
		async (projectPath: string) => {
			if (!(await confirmReplaceSourceWithUnsavedChanges("open another project"))) return;
			try {
				const result = await window.electronAPI.openProjectFileAtPath(projectPath);
				if (result.canceled) return;
				if (!result.success) {
					throw new Error(result.message || result.error || "加载项目失败");
				}
				if (!(await applyLoadedProject(result.project, result.path ?? null))) {
					project.setError("无法加载项目：文件格式无效");
					return;
				}
				project.setProjectBrowserOpen(false);
				await refreshProjectLibrary();
				return true;
			} catch (error) {
				throw new Error(`无法加载项目：${error instanceof Error ? error.message : String(error)}`);
			}
		},
		[
			applyLoadedProject,
			confirmReplaceSourceWithUnsavedChanges,
			project,
			refreshProjectLibrary,
		],
	);

	const handleImportMediaOrProject = useCallback(async () => {
		if (!(await confirmReplaceSourceWithUnsavedChanges("import a file"))) return;
		try {
			const result = await window.electronAPI.openVideoFilePicker({ includeProjects: true });
			if (result.canceled) return;
			if (!result.success) {
				toast.error(result.message || "导入文件失败");
				return;
			}
			if (result.kind === "project" || result.project) {
				if (!(await applyLoadedProject(result.project, result.path ?? null))) {
					project.setError("无法加载项目：文件格式无效");
					return;
				}
				project.setProjectBrowserOpen(false);
				await refreshProjectLibrary();
				toast.success(
					result.path ? `已加载项目：${result.path}` : "项目已加载",
				);
				return;
			}
			if (!result.path) {
				toast.error("尚未选择素材");
				return;
			}

			const sourcePath = fromFileUrl(result.path);
			const setPathResult = await window.electronAPI.setCurrentVideoPath(sourcePath, {
				preserveProjectPath: false,
			});
			if (!setPathResult.success) throw new Error("无法加载素材");
			const sourceVideoUrl = await resolveVideoUrl(sourcePath);
			try {
				videoPlaybackRef.current?.pause();
			} catch {
				// The preview may already be tearing down.
			}
			setIsPlaying(false);
			setCurrentTime(0);
			setDuration(0);
			project.setVideoSourcePath(sourcePath);
			project.setVideoPath(sourceVideoUrl);
			project.setError(null);
			project.setCurrentProjectPath(null);
			project.setLastSavedSnapshot(null);
			resetSourceScopedEditorState();
			pendingFreshRecordingAutoZoomPathRef.current =
				appearance.autoApplyFreshRecordingAutoZooms ? sourceVideoUrl : null;
			appearance.setWebcam((previous) => ({
				...previous,
				visibleRanges: undefined,
				enabled: false,
				sourcePath: null,
				timeOffsetMs: DEFAULT_WEBCAM_TIME_OFFSET_MS,
			}));
			applySessionPresentation(null);
			project.setProjectBrowserOpen(false);
			await refreshProjectLibrary();
			toast.success("素材已导入");
		} catch (error) {
			project.setError(
				`无法加载文件：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [
		confirmReplaceSourceWithUnsavedChanges,
		applyLoadedProject,
		project,
		appearance,
		videoPlaybackRef,
		setIsPlaying,
		setCurrentTime,
		setDuration,
		resetSourceScopedEditorState,
		pendingFreshRecordingAutoZoomPathRef,
		applySessionPresentation,
		refreshProjectLibrary,
	]);

	const handleOpenProjectBrowser = useCallback(async () => {
		if (project.projectBrowserOpen) {
			project.setProjectBrowserOpen(false);
			return;
		}
		videoPlaybackRef.current?.pause();
		setIsPlaying(false);
		project.setProjectLibraryLoading(true);
		project.setProjectBrowserOpen(true);
		try {
			if (project.videoPath && !project.error) {
				await saveProject(false, {
					remountPreviewAfterSave: false,
					refreshLibraryAfterSave: false,
				});
			}
		} finally {
			await refreshProjectLibrary();
		}
	}, [
		project.projectBrowserOpen,
		project.setProjectBrowserOpen,
		project.setProjectLibraryLoading,
		refreshProjectLibrary,
		videoPlaybackRef,
		setIsPlaying,
		saveProject,
		project.videoPath,
		project.error,
	]);

	useEffect(() => {
		const openRequestedDashboard = () => {
			if (!localStorage.getItem("recordly.open-dashboard")) return;
			localStorage.removeItem("recordly.open-dashboard");
			if (!project.projectBrowserOpen) void handleOpenProjectBrowser();
		};
		openRequestedDashboard();
		window.addEventListener("storage", openRequestedDashboard);
		return () => window.removeEventListener("storage", openRequestedDashboard);
	}, [handleOpenProjectBrowser, project.projectBrowserOpen]);

	useEffect(() => {
		const removeLoad = window.electronAPI.onMenuLoadProject(
			() => void handleOpenProjectBrowser(),
		);
		const removeSave = window.electronAPI.onMenuSaveProject(handleSaveProject);
		const removeSaveAs = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);
		return () => {
			removeLoad?.();
			removeSave?.();
			removeSaveAs?.();
		};
	}, [handleOpenProjectBrowser, handleSaveProject, handleSaveProjectAs]);

	/**
	 * Delete selected project files after retiring the active project's save queue.
	 * @param paths Selected project library paths.
	 * @returns The paths moved to the recycle bin.
	 */
	const handleDeleteProjects = useCallback(
		(paths: string[]) => window.electronAPI.runNecessaryTask(async () => {
			const removingActive = Boolean(project.currentProjectPath && paths.includes(project.currentProjectPath));
			if (removingActive) {
				await retireProjectSaves();
				// Release the loaded source before clearing its saved snapshot to prevent autosave revival.
				videoPlaybackRef.current?.pause();
				setIsPlaying(false);
				project.setVideoPath(null);
				project.setVideoSourcePath(null);
				setDuration(0);
				setCurrentTime(0);
				await window.electronAPI.clearCurrentVideoPath();
			}
			const result = await window.electronAPI.trashProjectFiles(paths);
			if (result.deleted.length) project.setError(null);
			if (project.currentProjectPath && result.deleted.includes(project.currentProjectPath)) {
				project.setCurrentProjectPath(null);
				project.setLastSavedSnapshot(null);
				project.setError(null);
			}
			await refreshProjectLibrary();
			if (result.errors.length) toast.error(result.errors.join("\n"));
			return result.deleted;
		}),
		[project, refreshProjectLibrary, retireProjectSaves, videoPlaybackRef, setIsPlaying, setDuration, setCurrentTime],
	);
	/**
	 * 原始录制删除前保存当前编辑并卸载所属媒体，避免回收被自身预览占用。
	 * @param paths 用户已确认删除的录制路径。
	 * @returns 保存队列和媒体释放完成后的 Promise；项目文件继续保留。
	 * @throws 保存失败时阻止删除，保留素材及当前编辑。
	 */
	const handlePrepareRecordingRemoval = useCallback(async (paths: string[]): Promise<void> => {
		const source = project.videoSourcePath;
		if (!source || !paths.some((path) => fromFileUrl(path).toLowerCase() === fromFileUrl(source).toLowerCase())) return;
		if (!(await saveProject(false, { silent: true, captureThumbnail: false, remountPreviewAfterSave: false }))) throw new Error('当前编辑尚未保存，素材已保留，请保存项目后重试。');
		await retireProjectSaves();
		videoPlaybackRef.current?.pause();
		setIsPlaying(false);
		project.setVideoPath(null);
		project.setVideoSourcePath(null);
		project.setCurrentProjectPath(null);
		project.setLastSavedSnapshot(null);
		project.setError(null);
		setDuration(0);
		setCurrentTime(0);
		resetSourceScopedEditorState();
		await window.electronAPI.clearCurrentVideoPath();
	}, [project, saveProject, retireProjectSaves, videoPlaybackRef, setIsPlaying, setDuration, setCurrentTime, resetSourceScopedEditorState]);
	const handleRenameLibraryProject = useCallback(
		async (path: string, name: string) => {
			const result = await window.electronAPI.renameLibraryProject(path, name);
			if (!result.success || !result.path)
				throw new Error(result.error || "无法重命名项目");
			if (project.currentProjectPath === path) project.setCurrentProjectPath(result.path);
			await refreshProjectLibrary();
			return result.path;
		},
		[project, refreshProjectLibrary],
	);

	return {
		handlePrepareRecordingRemoval,
		handleRefreshLibrary: refreshProjectLibrary,
		handleRenameLibraryProject,
		handleOpenProjectFromLibrary,
		handleImportMediaOrProject,
		handleOpenProjectBrowser,
		handleDeleteProjects,
	};
}
