import { type RefObject, useCallback } from "react";
import { toast } from "@presentation/components/ui/toast";
import type { ExportFormat, ExportSettings } from "@presentation/lib/exporter";
import { resolveExportStartSettings, resolveShareExportSettings } from "../exportStartSettings";
import type { VideoPlaybackRef } from "../VideoPlayback";
import type { useExportSession } from "./useExportSession";
import type { useExportSettings } from "./useExportSettings";

type ExportSession = ReturnType<typeof useExportSession>;
type ExportSettingsState = ReturnType<typeof useExportSettings>;

type UseExportDialogActionsInput = {
	videoPath: string | null;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	hasCaptionsForSidecar: boolean;
	settings: ExportSettingsState;
	session: ExportSession;
	handleExport: (
		settings: ExportSettings,
		options?: { destination?: "download" | "share" },
	) => Promise<string | undefined>;
	showExportSuccessToast: (filePath: string) => void;
};

export function useExportDialogActions({
	videoPath,
	videoPlaybackRef,
	hasCaptionsForSidecar,
	settings,
	session,
	handleExport,
	showExportSuccessToast,
}: UseExportDialogActionsInput) {
	const handleOpenExportDropdown = useCallback(() => {
		if (!videoPath) {
			toast.error("尚未加载视频");
			return;
		}

		if (session.hasPendingExportSave) {
			session.setShowExportDropdown(true);
			session.setExportError(
				"Save dialog canceled. Click Save Again to save without re-rendering.",
			);
			return;
		}
		session.setShowExportDropdown(true);
		session.setExportProgress(null);
		session.setExportError(null);
		session.setExportedFilePath(undefined);
	}, [videoPath, session]);

	const resolveCurrentSettings = useCallback(
		(exportFormat: ExportFormat = settings.exportFormat) => {
			const video = videoPlaybackRef.current?.video;
			if (!videoPath) {
				toast.error("尚未加载视频");
				return null;
			}
			if (!video) {
				toast.error("视频尚未准备就绪");
				return null;
			}
			if (video.videoWidth <= 0 || video.videoHeight <= 0) {
				toast.error("正在读取视频信息");
				return null;
			}

			return resolveExportStartSettings({
				sourceWidth: video.videoWidth,
				sourceHeight: video.videoHeight,
				exportFormat,
				includeCaptionSidecar: hasCaptionsForSidecar && settings.includeCaptionSidecar,
				exportEncodingMode: settings.exportEncodingMode,
				exportQuality: settings.exportQuality,
				mp4FrameRate: settings.mp4FrameRate,
				exportBackendPreference: settings.exportBackendPreference,
				exportPipelineModel: settings.exportPipelineModel,
				gifFrameRate: settings.gifFrameRate,
				gifLoop: settings.gifLoop,
				gifSizePreset: settings.gifSizePreset,
			});
		},
		[videoPath, videoPlaybackRef, hasCaptionsForSidecar, settings],
	);

	const handleStartExportFromDropdown = useCallback(() => {
		const resolvedSettings = resolveCurrentSettings();
		if (!resolvedSettings) return;
		session.setExportError(null);
		session.setExportedFilePath(undefined);
		session.setShowExportDropdown(true);
		void handleExport(resolvedSettings, { destination: "download" });
	}, [resolveCurrentSettings, session, handleExport]);

	const prepareExportForShare = useCallback(async () => {
		const resolvedSettings = resolveCurrentSettings("mp4");
		if (!resolvedSettings) return undefined;
		session.setExportError(null);
		session.setShowExportDropdown(true);
		return handleExport(resolveShareExportSettings(resolvedSettings), { destination: "share" });
	}, [resolveCurrentSettings, session, handleExport]);

	const handleCancelExport = useCallback(() => {
		if (!session.isExporting) return;
		session.cancelledExportRunIdRef.current = session.exportRunIdRef.current;
		session.exportRunIdRef.current += 1;
		session.exporterRef.current?.cancel();
		session.exporterRef.current = null;
		toast.info("已取消导出");
		session.clearPendingExportSave();
		session.setShowExportDropdown(false);
		session.setIsExporting(false);
		session.setExportProgress(null);
		session.setExportError(null);
		session.setExportedFilePath(undefined);
	}, [session]);

	const handleExportDropdownClose = useCallback(() => {
		session.clearPendingExportSave();
		session.setShowExportDropdown(false);
		session.setExportProgress(null);
		session.setExportError(null);
	}, [session]);

	const handleRetrySaveExport = useCallback(async () => {
		const pendingSave = session.pendingExportSaveRef.current;
		if (!pendingSave) return;

		const saveResult = pendingSave.tempFilePath
			? await window.electronAPI.finalizeExportedVideo({
					tempPath: pendingSave.tempFilePath,
					fileName: pendingSave.fileName,
					outputPath: null,
					captionSidecar: pendingSave.captionSidecar,
				})
			: pendingSave.arrayBuffer
				? await window.electronAPI.saveExportedVideo(
						pendingSave.arrayBuffer,
						pendingSave.fileName,
						pendingSave.captionSidecar,
					)
				: { success: false, message: "No pending export to save" };

		if (saveResult.canceled) {
			session.setExportError(
				"Save dialog canceled. Click Save Again to save without re-rendering.",
			);
			toast.info("已取消保存，可以稍后重试。");
			return;
		}
		if (saveResult.success && saveResult.path) {
			session.pendingExportSaveRef.current = null;
			session.setHasPendingExportSave(false);
			session.setExportError(null);
			session.setExportedFilePath(saveResult.path);
			showExportSuccessToast(saveResult.path);
			session.setShowExportDropdown(true);
			return;
		}

		const errorMessage = saveResult.message || "保存视频失败";
		session.setExportError(errorMessage);
		toast.error(errorMessage);
	}, [session, showExportSuccessToast]);

	const revealExportedFile = useCallback(async () => {
		if (!session.exportedFilePath) return;
		try {
			const result = await window.electronAPI.revealInFolder(session.exportedFilePath);
			if (!result.success) {
				toast.error(result.error || result.message || "Failed to reveal item in folder.");
			}
		} catch (error) {
			toast.error(`无法打开所在文件夹：${String(error)}`);
		}
	}, [session.exportedFilePath]);

	return {
		handleOpenExportDropdown,
		handleStartExportFromDropdown,
		prepareExportForShare,
		handleCancelExport,
		handleExportDropdownClose,
		handleRetrySaveExport,
		revealExportedFile,
	};
}
