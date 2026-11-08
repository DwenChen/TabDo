import { DEFAULT_EDITOR_PREFERENCES } from '../editorPreferences';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OPEN_EDITOR_SECTION_EVENT } from "@presentation/lib/announcementActions";
import { type AnnouncementEditorSection, isAnnouncementEditorSection } from "@presentation/lib/announcements";
import type { AspectRatio } from "@presentation/utils/aspectRatioUtils";
import type { loadEditorPreferences } from "../editorPreferences";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { CropRegion, EditorEffectSection } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";

type SessionPresentation = {
	hideOverlayCursorByDefault?: boolean;
	nativeCaptureUnavailable?: boolean;
};

/**
 * 初始化编辑界面及应用级字幕偏好，新项目画面比例使用出厂值。
 * @param initialPreferences 应用偏好，只用于字幕引擎路径等跨项目选项。
 * @param cropRegion 当前项目裁剪范围。
 * @param setCropRegion 裁剪弹窗的状态发布入口。
 * @returns 播放、弹窗、会话显示及画面比例状态与操作。
 */
export function useEditorUiState(
	initialPreferences: ReturnType<typeof loadEditorPreferences>,
	cropRegion: CropRegion,
	setCropRegion: (region: CropRegion) => void,
) {
	const [appPlatform, setAppPlatform] = useState(
		typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "darwin" : "",
	);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [sessionShowCursorOverride, setSessionShowCursorOverride] = useState<boolean | null>(
		null,
	);
	const [sessionNativeCaptureUnavailable, setSessionNativeCaptureUnavailable] = useState(false);
	const [nativeCaptureUnavailableModalOpen, setNativeCaptureUnavailableModalOpen] =
		useState(false);
	const [whisperExecutablePath, setWhisperExecutablePath] = useState<string | null>(
		initialPreferences.whisperExecutablePath,
	);
	const [whisperModelPath, setWhisperModelPath] = useState<string | null>(
		initialPreferences.whisperModelPath,
	);
	const [downloadedWhisperModelPath, setDownloadedWhisperModelPath] = useState<string | null>(
		null,
	);
	const [whisperModelDownloadStatus, setWhisperModelDownloadStatus] = useState<
		"idle" | "downloading" | "downloaded" | "error"
	>(initialPreferences.whisperModelPath ? "downloaded" : "idle");
	const [whisperModelDownloadProgress, setWhisperModelDownloadProgress] = useState(0);
	const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
	const [previewVolume, setPreviewVolume] = useState(1);
	const [aspectRatio, setAspectRatio] = useState<AspectRatio>(DEFAULT_EDITOR_PREFERENCES.aspectRatio);
	const [activeEffectSection, setActiveEffectSection] = useState<EditorEffectSection>("scene");
	const [showCropModal, setShowCropModal] = useState(false);
	const [previewVersion, setPreviewVersion] = useState(0);
	const [isPreviewReady, setIsPreviewReady] = useState(false);
	const [autoSuggestZoomsTrigger, setAutoSuggestZoomsTrigger] = useState(0);

	const videoPlaybackRef = useRef<VideoPlaybackRef>(null);
	const projectBrowserTriggerRef = useRef<HTMLButtonElement | null>(null);
	const projectBrowserFallbackTriggerRef = useRef<HTMLButtonElement | null>(null);
	const projectNameInputRef = useRef<HTMLInputElement | null>(null);
	const projectSaveDialogInputRef = useRef<HTMLInputElement | null>(null);
	const nextZoomIdRef = useRef(1);
	const nextClipIdRef = useRef(1);
	const clipInitializedRef = useRef(false);
	const autoFullTrackClipIdRef = useRef<string | null>(null);
	const autoFullTrackClipEndMsRef = useRef<number | null>(null);
	const nextAudioIdRef = useRef(1);
	const nextAnnotationIdRef = useRef(1);
	const nextAnnotationZIndexRef = useRef(1);
	const autoSuggestedVideoPathRef = useRef<string | null>(null);
	const pendingFreshRecordingAutoZoomPathRef = useRef<string | null>(null);
	const pendingFreshRecordingAutoSuggestTimeoutRef = useRef<number | null>(null);
	const pendingFreshRecordingAutoSuggestTelemetryCountRef = useRef(0);
	const cropSnapshotRef = useRef<CropRegion | null>(null);
	const timelineRef = useRef<TimelineEditorHandle>(null);

	useEffect(() => {
		void window.electronAPI?.getPlatform?.()?.then(setAppPlatform);
	}, []);
	useEffect(() => {
		const handleOpenEditorSection = (event: Event) => {
			const section = (event as CustomEvent<AnnouncementEditorSection>).detail;
			if (isAnnouncementEditorSection(section)) setActiveEffectSection(section);
		};
		window.addEventListener(OPEN_EDITOR_SECTION_EVENT, handleOpenEditorSection);
		return () => window.removeEventListener(OPEN_EDITOR_SECTION_EVENT, handleOpenEditorSection);
	}, []);
	useEffect(() => {
		if (activeEffectSection === "frame" || activeEffectSection === "crop")
			setActiveEffectSection("scene");
	}, [activeEffectSection]);

	const applySessionPresentation = useCallback(
		(session: SessionPresentation | null | undefined) => {
			setSessionShowCursorOverride(session?.hideOverlayCursorByDefault ? false : null);
			setSessionNativeCaptureUnavailable(Boolean(session?.nativeCaptureUnavailable));
			setNativeCaptureUnavailableModalOpen(Boolean(session?.nativeCaptureUnavailable));
		},
		[],
	);
	const handleOpenCropEditor = useCallback(() => {
		cropSnapshotRef.current = { ...cropRegion };
		setShowCropModal(true);
	}, [cropRegion]);
	const handleCloseCropEditor = useCallback(() => setShowCropModal(false), []);
	const handleCancelCropEditor = useCallback(() => {
		if (cropSnapshotRef.current) setCropRegion(cropSnapshotRef.current);
		setShowCropModal(false);
	}, [setCropRegion]);
	const isCropped = useMemo(() => {
		const top = Math.round(cropRegion.y * 100);
		const left = Math.round(cropRegion.x * 100);
		const bottom = Math.round((1 - cropRegion.y - cropRegion.height) * 100);
		const right = Math.round((1 - cropRegion.x - cropRegion.width) * 100);
		return top > 0 || left > 0 || bottom > 0 || right > 0;
	}, [cropRegion]);

	return {
		appPlatform,
		isPlaying,
		setIsPlaying,
		currentTime,
		setCurrentTime,
		duration,
		setDuration,
		sessionShowCursorOverride,
		setSessionShowCursorOverride,
		sessionNativeCaptureUnavailable,
		nativeCaptureUnavailableModalOpen,
		setNativeCaptureUnavailableModalOpen,
		whisperExecutablePath,
		setWhisperExecutablePath,
		whisperModelPath,
		setWhisperModelPath,
		downloadedWhisperModelPath,
		setDownloadedWhisperModelPath,
		whisperModelDownloadStatus,
		setWhisperModelDownloadStatus,
		whisperModelDownloadProgress,
		setWhisperModelDownloadProgress,
		isGeneratingCaptions,
		setIsGeneratingCaptions,
		previewVolume,
		setPreviewVolume,
		aspectRatio,
		setAspectRatio,
		activeEffectSection,
		setActiveEffectSection,
		showCropModal,
		previewVersion,
		setPreviewVersion,
		isPreviewReady,
		setIsPreviewReady,
		autoSuggestZoomsTrigger,
		setAutoSuggestZoomsTrigger,
		videoPlaybackRef,
		projectBrowserTriggerRef,
		projectBrowserFallbackTriggerRef,
		projectNameInputRef,
		projectSaveDialogInputRef,
		nextZoomIdRef,
		nextClipIdRef,
		clipInitializedRef,
		autoFullTrackClipIdRef,
		autoFullTrackClipEndMsRef,
		nextAudioIdRef,
		nextAnnotationIdRef,
		nextAnnotationZIndexRef,
		autoSuggestedVideoPathRef,
		pendingFreshRecordingAutoZoomPathRef,
		pendingFreshRecordingAutoSuggestTimeoutRef,
		pendingFreshRecordingAutoSuggestTelemetryCountRef,
		timelineRef,
		applySessionPresentation,
		handleOpenCropEditor,
		handleCloseCropEditor,
		handleCancelCropEditor,
		isCropped,
	};
}
