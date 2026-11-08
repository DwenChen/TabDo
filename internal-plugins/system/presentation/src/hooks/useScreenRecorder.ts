import { acquireBrowserScreenCapture, isCapturePermissionDismissed } from "./browserScreenCapture";
import { BrowserAudioTracks } from "./browserAudioTracks";
import { fixWebmDuration } from "@fix-webm-duration/fix";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@presentation/components/ui/toast";
import { getEffectiveRecordingDurationMs } from "@presentation/lib/mediaTiming";
import {
	getVideoExtensionForMimeType,
	isWebmMimeType,
	selectRecordingMimeType,
	selectWebcamRecordingMimeType,
} from "./recordingMimeType";

const TARGET_FRAME_RATE = 60;
const TARGET_WIDTH = 3840;
const TARGET_HEIGHT = 2160;
const FOUR_K_PIXELS = TARGET_WIDTH * TARGET_HEIGHT;
const QHD_WIDTH = 2560;
const QHD_HEIGHT = 1440;
const QHD_PIXELS = QHD_WIDTH * QHD_HEIGHT;
const BITRATE_4K = 45_000_000;
const BITRATE_QHD = 28_000_000;
const BITRATE_BASE = 18_000_000;
const HIGH_FRAME_RATE_THRESHOLD = 60;
const HIGH_FRAME_RATE_BOOST = 1.7;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const CODEC_ALIGNMENT = 2;
const RECORDER_TIMESLICE_MS = 250;
const BITS_PER_MEGABIT = 1_000_000;
const MIN_FRAME_RATE = 30;
const CHROME_MEDIA_SOURCE = "desktop";
const RECORDING_FILE_PREFIX = "recording-";
const AUDIO_BITRATE_VOICE = 128_000;
const AUDIO_BITRATE_SYSTEM = 192_000;
const WEBCAM_BITRATE = 8_000_000;
const WEBCAM_WIDTH = 1280;
const WEBCAM_HEIGHT = 720;
const WEBCAM_FRAME_RATE = 30;
const CAPTURE_BOUNDARY_LEAD_MS = 40;

/**
 * Read the epoch clock without rounding away sub-frame capture boundaries.
 * @returns Precise epoch milliseconds shared with the native capture calibration.
 */
function captureNow(): number { return performance.timeOrigin + performance.now(); }

/**
 * Run a browser transition at the instant already submitted to native capture.
 * @param boundaryMs Shared future start, pause, resume or stop boundary.
 * @param action Synchronous companion recorder transition.
 * @returns Resolves with the transition result, excluding subsequent encoding work.
 */
async function atCaptureBoundary<T>(boundaryMs: number, action: () => T): Promise<T> {
	const delay = boundaryMs - captureNow();
	if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
	return action();
}
const WEBCAM_SUFFIX = "-webcam";
const MICROPHONE_FALLBACK_ERROR_TOAST_ID = "recording-microphone-fallback-error";
const MICROPHONE_SIDECAR_ERROR_TOAST_ID = "recording-microphone-sidecar-error";
export type BrowserMicrophoneProfile =
	| "processed"
	| "no-agc"
	| "no-echo"
	| "no-noise-suppression"
	| "raw";
type BrowserCaptureCursorMode = "always" | "never";
export type BrowserCaptureCursorPolicy = {
	streamCursor: BrowserCaptureCursorMode;
	hideOsCursorBeforeRecording: boolean;
	hideEditorOverlayCursorByDefault: boolean;
};
const DEFAULT_BROWSER_MICROPHONE_PROFILE: BrowserMicrophoneProfile = "no-agc";
const BROWSER_MICROPHONE_PROFILES = new Set<BrowserMicrophoneProfile>([
	"processed",
	"no-agc",
	"no-echo",
	"no-noise-suppression",
	"raw",
]);
type MicrophoneTrackSettingsSnapshot = Partial<
	Pick<
		MediaTrackSettings,
		| "autoGainControl"
		| "channelCount"
		| "deviceId"
		| "echoCancellation"
		| "groupId"
		| "noiseSuppression"
		| "sampleRate"
		| "sampleSize"
	>
> & {
	trackId?: string;
	trackLabel?: string;
	trackEnabled?: boolean;
	trackMuted?: boolean;
	trackReadyState?: MediaStreamTrackState;
};
type MicrophoneAudioInputDeviceSnapshot = {
	deviceId: string;
	groupId?: string;
	label: string;
};
type MicrophoneFallbackChunkEvent = {
	index: number;
	size: number;
	elapsedMs: number;
	deltaMs: number | null;
	recordedElapsedMs: number;
	recordedDeltaMs: number | null;
};
type MicrophoneFallbackPauseInterval = {
	startElapsedMs: number;
	endElapsedMs?: number;
	durationMs?: number;
};
type MicrophoneFallbackRecorderMetadata = {
	mimeType: string;
	audioBitsPerSecond: number;
	timesliceMs: number;
};
type MicrophoneSidecarOptions = {
	startDelayMs?: number;
	browserMicrophoneProfile?: BrowserMicrophoneProfile;
	requestedBrowserMicrophoneProfile?: string | null;
	requestedConstraints?: MediaStreamConstraints;
	mediaTrackSettings?: MicrophoneTrackSettingsSnapshot;
	audioInputDevices?: MicrophoneAudioInputDeviceSnapshot[];
	mediaRecorder?: MicrophoneFallbackRecorderMetadata;
	chunkEvents?: MicrophoneFallbackChunkEvent[];
	pauseIntervals?: MicrophoneFallbackPauseInterval[];
};

type DesktopCaptureMediaDevices = {
	getUserMedia: (constraints: unknown) => Promise<MediaStream>;
	getDisplayMedia: (constraints: unknown) => Promise<MediaStream>;
};

type UseScreenRecorderReturn = {
	starting: boolean;
	recording: boolean;
	paused: boolean;
	finalizing: boolean;
	countdownActive: boolean;
	toggleRecording: () => void;
	pauseRecording: () => void;
	resumeRecording: () => void;
	cancelRecording: () => void;
	cancelRecordingStart: () => Promise<boolean>;
	preparePermissions: () => Promise<boolean>;
	isMacOS: boolean;
	microphoneEnabled: boolean;
	setMicrophoneEnabled: (enabled: boolean) => void;
	microphoneDeviceId: string | undefined;
	setMicrophoneDeviceId: (deviceId: string | undefined) => void;
	systemAudioEnabled: boolean;
	setSystemAudioEnabled: (enabled: boolean) => void;
	keyboardEnabled: boolean;
	setKeyboardEnabled: (enabled: boolean) => void;
	webcamEnabled: boolean;
	setWebcamEnabled: (enabled: boolean) => void;
	webcamDeviceId: string | undefined;
	setWebcamDeviceId: (deviceId: string | undefined) => void;
	countdownDelay: number;
	setCountdownDelay: (delay: number) => void;
};

function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "string" && error.trim().length > 0) {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		try {
			const serialized = JSON.stringify(error);
			if (serialized && serialized !== "{}") {
				return serialized;
			}
		} catch {
			// Ignore stringify failures and fall through to a generic message.
		}

		if (typeof (error as { toString?: () => string }).toString === "function") {
			const stringified = (error as { toString: () => string }).toString();
			if (stringified && stringified !== "[object Object]") {
				return stringified;
			}
		}
	}

	return "An unexpected error occurred";
}

export function normalizeBrowserMicrophoneProfile(value?: string | null): BrowserMicrophoneProfile {
	const normalized = value?.trim().toLowerCase();
	return normalized && BROWSER_MICROPHONE_PROFILES.has(normalized as BrowserMicrophoneProfile)
		? (normalized as BrowserMicrophoneProfile)
		: DEFAULT_BROWSER_MICROPHONE_PROFILE;
}

/**
 * Avoid a burned-in cursor while keeping the editable telemetry overlay available.
 * @param options Whether native capture failed and needs the compatibility cursor path.
 * @returns Capture cursor handling and the initial editor overlay visibility.
 */
export function resolveBrowserCaptureCursorPolicy({
	nativeWindowsCaptureStartFailed = false,
}: {
	nativeWindowsCaptureStartFailed?: boolean;
} = {}): BrowserCaptureCursorPolicy {
	if (nativeWindowsCaptureStartFailed) {
		// If WGC already failed, avoid the telemetry overlay path that can lag on
		// constrained Windows systems; keep the browser-captured cursor instead.
		return {
			streamCursor: "always",
			hideOsCursorBeforeRecording: false,
			hideEditorOverlayCursorByDefault: true,
		};
	}

	return {
		streamCursor: "never",
		hideOsCursorBeforeRecording: true,
		hideEditorOverlayCursorByDefault: false,
	};
}

/**
 * Windows 使用明确关闭系统指针合成的 WGC，而非忽略 cursor 约束的浏览器捕获。
 * @param source 用户所选屏幕、窗口或区域。
 * @returns 是否要求使用支持无指针画面的原生捕获。
 */
export function shouldUseNativeWindowsCaptureForSource(
	source: Pick<ProcessedDesktopSource, "id"> | null | undefined,
): boolean {
	return /^(screen|window|area):/.test(source?.id ?? "");
}

export function createProcessedMicrophoneConstraints(
	microphoneDeviceId?: string,
	profile: BrowserMicrophoneProfile = DEFAULT_BROWSER_MICROPHONE_PROFILE,
): MediaStreamConstraints {
	const normalizedProfile = normalizeBrowserMicrophoneProfile(profile);
	const audio: MediaTrackConstraints = {
		echoCancellation: normalizedProfile !== "no-echo" && normalizedProfile !== "raw",
		noiseSuppression: normalizedProfile !== "no-noise-suppression" && normalizedProfile !== "raw",
		autoGainControl: normalizedProfile !== "no-agc" && normalizedProfile !== "raw",
		channelCount: { ideal: 1 },
		sampleRate: { ideal: 48000 },
	};

	if (microphoneDeviceId) {
		audio.deviceId = { exact: microphoneDeviceId };
	}

	return { audio, video: false };
}

export function createBrowserRecordingOptions({
	audioBitsPerSecond,
	mimeType,
	videoBitsPerSecond,
}: {
	audioBitsPerSecond?: number;
	mimeType?: string;
	videoBitsPerSecond: number;
}): MediaRecorderOptions {
	const options: MediaRecorderOptions = {
		videoBitsPerSecond,
		bitsPerSecond: videoBitsPerSecond + (audioBitsPerSecond ?? 0),
	};

	if (audioBitsPerSecond !== undefined) {
		options.audioBitsPerSecond = audioBitsPerSecond;
	}

	if (mimeType) {
		options.mimeType = mimeType;
	}

	return options;
}

type NativeCaptureStopResult = {
	success: boolean;
	durationMs?: number;
	leadingMs?: number;
	webcamPath?: string;
	strictSyncFailure?: boolean;
	path?: string;
	error?: string;
	message?: string;
};

export type DiscardNativeCaptureResult = {
	stopSucceeded: boolean;
	deleteSucceeded: boolean;
	path?: string;
	error?: unknown;
};

export async function stopAndDiscardNativeCapture({
	stopNativeScreenRecording,
	deleteRecordingFile,
}: {
	stopNativeScreenRecording: () => Promise<NativeCaptureStopResult>;
	deleteRecordingFile: (path: string) => Promise<unknown>;
}): Promise<DiscardNativeCaptureResult> {
	let stoppedResult: NativeCaptureStopResult;
	try {
		stoppedResult = await stopNativeScreenRecording();
	} catch (error) {
		return { stopSucceeded: false, deleteSucceeded: false, error };
	}

	if (!stoppedResult.success) {
		return {
			stopSucceeded: false,
			deleteSucceeded: false,
			error: stoppedResult.error ?? stoppedResult.message,
		};
	}

	if (!stoppedResult.path) {
		return { stopSucceeded: true, deleteSucceeded: true };
	}

	try {
		await deleteRecordingFile(stoppedResult.path);
		return {
			stopSucceeded: true,
			deleteSucceeded: true,
			path: stoppedResult.path,
		};
	} catch (error) {
		return {
			stopSucceeded: true,
			deleteSucceeded: false,
			path: stoppedResult.path,
			error,
		};
	}
}

function createMicrophoneTrackSettingsSnapshot(
	stream: MediaStream,
): MicrophoneTrackSettingsSnapshot | null {
	const track = stream.getAudioTracks()[0];
	const settings = track?.getSettings?.();
	if (!track || !settings) {
		return null;
	}

	const snapshot: MicrophoneTrackSettingsSnapshot = {
		trackId: track.id,
		trackLabel: track.label,
		trackEnabled: track.enabled,
		trackMuted: track.muted,
		trackReadyState: track.readyState,
	};
	for (const key of [
		"autoGainControl",
		"channelCount",
		"deviceId",
		"echoCancellation",
		"groupId",
		"noiseSuppression",
		"sampleRate",
		"sampleSize",
	] as const) {
		const value = settings[key];
		if (value !== undefined) {
			snapshot[key] = value as never;
		}
	}

	return Object.keys(snapshot).length > 0 ? snapshot : null;
}

async function createAudioInputDeviceSnapshot(): Promise<
	MicrophoneAudioInputDeviceSnapshot[] | null
> {
	if (typeof navigator.mediaDevices?.enumerateDevices !== "function") {
		return null;
	}

	const devices = await navigator.mediaDevices.enumerateDevices();
	const audioInputs = devices
		.filter((device) => device.kind === "audioinput")
		.map((device) => ({
			deviceId: device.deviceId,
			...(device.groupId ? { groupId: device.groupId } : {}),
			label: device.label,
		}));

	return audioInputs.length > 0 ? audioInputs : null;
}

/**
 * 管理当前控制条的录制、设备、准备反馈与取消，退出时释放所属媒体资源。
 * @returns 当前录制状态和可暂停、停止、取消的操作。
 */
export function useScreenRecorder(): UseScreenRecorderReturn {
	const [recording, setRecordingValue] = useState(false);
	const recordingActive = useRef(false);
	const discardCurrentCapture = useRef({ value: false });
	const setRecording = useCallback((value: boolean) => {
		recordingActive.current = value;
		setRecordingValue(value);
	}, []);
	const [paused, setPaused] = useState(false);
	const [starting, setStarting] = useState(false);
	const [finalizing, setFinalizing] = useState(false);
	const [countdownActive, setCountdownActive] = useState(false);
	const [isMacOS, setIsMacOS] = useState(false);
	const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
	const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | undefined>(undefined);
	const [systemAudioEnabled, setSystemAudioEnabled] = useState(false);
	const [keyboardEnabled, setKeyboardEnabled] = useState(false);
	const [webcamEnabled, setWebcamEnabled] = useState(false);
	const [webcamDeviceId, setWebcamDeviceId] = useState<string | undefined>(undefined);
	const [countdownDelay, setCountdownDelayState] = useState(3);
	const mediaRecorder = useRef<MediaRecorder | null>(null);
	const browserAudioTracks = useRef<BrowserAudioTracks | null>(null);
	const webcamRecorder = useRef<MediaRecorder | null>(null);
	const stream = useRef<MediaStream | null>(null);
	const screenStream = useRef<MediaStream | null>(null);
	const microphoneStream = useRef<MediaStream | null>(null);
	const webcamStream = useRef<MediaStream | null>(null);
	const chunks = useRef<Blob[]>([]);
	const webcamChunks = useRef<Blob[]>([]);
	const startTime = useRef<number>(0);
	const webcamStartTime = useRef<number | null>(null);
	const webcamTimeOffsetMs = useRef(0);
	const nativeBoundaryInFlight = useRef(false);
	const recordingStoppedAtMs = useRef<number | null>(null);
	const recordingSessionTimestamp = useRef<number | null>(null);
	const nativeScreenRecording = useRef(false);
	const nativeWindowsRecording = useRef(false);
	const nativeWarmStartActive = useRef(false);
	const pendingNativeCleanupPath = useRef<string | null>(null);
	const recordingStartGeneration = useRef(0);
	const nativeStopRequestInFlight = useRef(false);
	const startInFlight = useRef(false);
	const pendingStart = useRef<Promise<void> | null>(null);
	const hasPromptedForReselect = useRef(false);
	const hasShownNativeWindowsFallbackToast = useRef(false);
	const countdownDelayLoaded = useRef(false);
	const recordingPrefsLoaded = useRef(false);
	const pendingWebcamPathPromise = useRef<Promise<string | null> | null>(null);
	const webcamStopPromise = useRef<Promise<string | null> | null>(null);
	const webcamStopResolver = useRef<((path: string | null) => void) | null>(null);
	const resolvedWebcamPath = useRef<string | null>(null);
	const accumulatedPausedDurationMs = useRef(0);
	const pauseStartedAtMs = useRef<number | null>(null);
	const micFallbackRecorder = useRef<MediaRecorder | null>(null);
	const micFallbackChunks = useRef<Blob[]>([]);
	const micFallbackStartDelayMs = useRef<number | null>(null);
	const micFallbackTrackSettings = useRef<MicrophoneTrackSettingsSnapshot | null>(null);
	const micFallbackRequestedConstraints = useRef<MediaStreamConstraints | null>(null);
	const micFallbackAudioInputDevices = useRef<MicrophoneAudioInputDeviceSnapshot[] | null>(null);
	const micFallbackRecorderMetadata = useRef<MicrophoneFallbackRecorderMetadata | null>(null);
	const micFallbackChunkEvents = useRef<MicrophoneFallbackChunkEvent[]>([]);
	const micFallbackRecorderStartedAt = useRef<number | null>(null);
	const micFallbackPauseStartedAt = useRef<number | null>(null);
	const micFallbackPausedDurationMs = useRef(0);
	const micFallbackPauseIntervals = useRef<MicrophoneFallbackPauseInterval[]>([]);
	const browserMicrophoneProfile = useRef<BrowserMicrophoneProfile>(
		DEFAULT_BROWSER_MICROPHONE_PROFILE,
	);
	const requestedBrowserMicrophoneProfile = useRef<string | null>(null);
	const hideEditorOverlayCursorByDefault = useRef(false);

	const notifyRecordingFinalizationFailure = useCallback(async (message: string) => {
		setFinalizing(false);
		toast.error(message, { duration: 10000 });
	}, []);

	const logNativeCaptureDiagnostics = useCallback(async (context: string) => {
		if (typeof window.electronAPI?.getLastNativeCaptureDiagnostics !== "function") {
			return;
		}

		try {
			const result = await window.electronAPI.getLastNativeCaptureDiagnostics();
			if (result.success && result.diagnostics) {
				console.warn(`[NativeCaptureDiagnostics:${context}]`, result.diagnostics);
			}
		} catch (error) {
			console.warn("Failed to load native capture diagnostics:", error);
		}
	}, []);

	const buildNativeCaptureFailureMessage = useCallback(
		async (context: string, fallbackMessage: string) => {
			if (typeof window.electronAPI?.getLastNativeCaptureDiagnostics !== "function") {
				return fallbackMessage;
			}

			try {
				const result = await window.electronAPI.getLastNativeCaptureDiagnostics();
				const diagnostics = result.success ? (result.diagnostics ?? null) : null;
				if (!diagnostics) {
					return fallbackMessage;
				}

				console.warn(`[NativeCaptureDiagnostics:${context}]`, diagnostics);

				const details: string[] = [];
				if (diagnostics.error) {
					details.push(diagnostics.error);
				}
				if (diagnostics.outputPath && (diagnostics.fileSizeBytes ?? 0) > 0) {
					details.push(`Saved file: ${diagnostics.outputPath}`);
				}

				return details.length > 0 ? `${fallbackMessage} ${details.join(". ")}` : fallbackMessage;
			} catch (error) {
				console.warn("Failed to load native capture diagnostics:", error);
				return fallbackMessage;
			}
		},
		[],
	);

	const resetRecordingClock = useCallback((startedAt: number) => {
		recordingStoppedAtMs.current = null;
		startTime.current = startedAt;
		accumulatedPausedDurationMs.current = 0;
		pauseStartedAtMs.current = null;
	}, []);

	const markRecordingPaused = useCallback((pausedAt: number) => {
		if (pauseStartedAtMs.current === null) {
			pauseStartedAtMs.current = pausedAt;
		}
	}, []);

	const markRecordingResumed = useCallback((resumedAt: number) => {
		if (pauseStartedAtMs.current === null) {
			return;
		}

		const pauseStart = pauseStartedAtMs.current;
		const pauseDurationMs = Math.max(0, resumedAt - pauseStart);
		accumulatedPausedDurationMs.current += pauseDurationMs;
		pauseStartedAtMs.current = null;
	}, []);

	/**
	 * Read the shared capture clock without counting encoding or file publication time.
	 * @param endedAt Wall clock fallback while the capture is still running.
	 * @returns Effective screen and camera duration with paused intervals removed.
	 */
	const getRecordingDurationMs = useCallback((endedAt: number) => {
		return getEffectiveRecordingDurationMs({
			startTimeMs: startTime.current,
			endTimeMs: recordingStoppedAtMs.current ?? endedAt,
			accumulatedPausedDurationMs: accumulatedPausedDurationMs.current,
			pauseStartedAtMs: pauseStartedAtMs.current,
		});
	}, []);

	const getMicFallbackRecordedElapsedMs = useCallback((now = performance.now()) => {
		const startedAt = micFallbackRecorderStartedAt.current;
		if (startedAt === null) {
			return 0;
		}

		const currentPauseDurationMs =
			micFallbackPauseStartedAt.current === null
				? 0
				: Math.max(0, now - micFallbackPauseStartedAt.current);
		return Math.max(
			0,
			Math.round(now - startedAt - micFallbackPausedDurationMs.current - currentPauseDurationMs),
		);
	}, []);

	const resetMicFallbackTimingDiagnostics = useCallback(() => {
		micFallbackChunkEvents.current = [];
		micFallbackRecorderStartedAt.current = null;
		micFallbackPauseStartedAt.current = null;
		micFallbackPausedDurationMs.current = 0;
		micFallbackPauseIntervals.current = [];
	}, []);

	const preparePermissions = useCallback(async () => {
		// 本地演示录屏无需上游账户；只校验实际设备权限。
		if ((await window.electronAPI.getPlatform()) !== "darwin") return true;
		const [screen, accessibility] = await Promise.all([
			window.electronAPI.getScreenRecordingPermissionStatus(),
			window.electronAPI.getAccessibilityPermissionStatus(),
		]);
		if (
			screen.success &&
			screen.status === "granted" &&
			accessibility.success &&
			accessibility.trusted
		)
			return true;
		await window.electronAPI.showRecordingPermissions();
		return false;
	}, []);

	const selectMimeType = useCallback(() => {
		return selectRecordingMimeType();
	}, []);

	const selectWebcamMimeType = useCallback(() => {
		return selectWebcamRecordingMimeType();
	}, []);

	const computeBitrate = (width: number, height: number) => {
		const pixels = width * height;
		const highFrameRateBoost =
			TARGET_FRAME_RATE >= HIGH_FRAME_RATE_THRESHOLD ? HIGH_FRAME_RATE_BOOST : 1;

		if (pixels >= FOUR_K_PIXELS) {
			return Math.round(BITRATE_4K * highFrameRateBoost);
		}

		if (pixels >= QHD_PIXELS) {
			return Math.round(BITRATE_QHD * highFrameRateBoost);
		}

		return Math.round(BITRATE_BASE * highFrameRateBoost);
	};

	/**
	 * Stop the owning session's encoders and release its capture devices after flushing.
	 * @returns Nothing; persistent recordings, settings and global input capture remain owned elsewhere.
	 */
	const cleanupCapturedMedia = useCallback(() => {
		browserAudioTracks.current?.apply("stop");
		if (stream.current) {
			stream.current.getTracks().forEach((track) => track.stop());
			stream.current = null;
		}

		if (screenStream.current) {
			screenStream.current.getTracks().forEach((track) => track.stop());
			screenStream.current = null;
		}

		if (microphoneStream.current) {
			microphoneStream.current.getTracks().forEach((track) => track.stop());
			microphoneStream.current = null;
		}

		if (webcamStream.current) {
			webcamStream.current.getTracks().forEach((track) => track.stop());
			webcamStream.current = null;
		}


		if (micFallbackRecorder.current) {
			try {
				if (micFallbackRecorder.current.state !== "inactive") {
					micFallbackRecorder.current.stop();
				}
				micFallbackRecorder.current.stream?.getTracks().forEach((track) => track.stop());
			} catch {
				/* ignore */
			}
			micFallbackRecorder.current = null;
			micFallbackChunks.current = [];
			micFallbackTrackSettings.current = null;
			micFallbackRequestedConstraints.current = null;
			micFallbackAudioInputDevices.current = null;
			micFallbackRecorderMetadata.current = null;
			resetMicFallbackTimingDiagnostics();
		}
	}, [resetMicFallbackTimingDiagnostics]);

	const appendMicFallbackChunk = useCallback(
		(event: BlobEvent) => {
			if (event.data.size <= 0) {
				return;
			}

			micFallbackChunks.current.push(event.data);
			const startedAt = micFallbackRecorderStartedAt.current;
			if (startedAt === null) {
				return;
			}

			const now = performance.now();
			const elapsedMs = Math.max(0, Math.round(now - startedAt));
			const recordedElapsedMs = getMicFallbackRecordedElapsedMs(now);
			const previous = micFallbackChunkEvents.current[micFallbackChunkEvents.current.length - 1];
			micFallbackChunkEvents.current.push({
				index: micFallbackChunkEvents.current.length,
				size: event.data.size,
				elapsedMs,
				deltaMs: previous ? Math.max(0, elapsedMs - previous.elapsedMs) : null,
				recordedElapsedMs,
				recordedDeltaMs: previous
					? Math.max(0, recordedElapsedMs - previous.recordedElapsedMs)
					: null,
			});
		},
		[getMicFallbackRecordedElapsedMs],
	);

	const resolveBrowserCaptureSource = useCallback(async (source: ProcessedDesktopSource) => {
		if (!source?.id?.startsWith("screen:")) {
			return source;
		}

		// Linux/Wayland portal sentinel: do NOT call getSources here, because
		// on Wayland that triggers an additional xdg-desktop-portal dialog.
		// The sentinel is handled later by routing through getDisplayMedia,
		// which lets the portal pick the source in a single dialog.
		if (source.id === "screen:linux-portal") {
			return source;
		}

		try {
			const liveSources = await window.electronAPI.getSources({
				types: ["screen"],
				thumbnailSize: { width: 1, height: 1 },
				fetchWindowIcons: false,
			});

			const exactMatch = liveSources.find((candidate) => candidate.id === source.id);
			if (exactMatch) {
				return {
					...source,
					id: exactMatch.id,
					name: exactMatch.name ?? source.name,
					display_id: exactMatch.display_id ?? source.display_id,
				};
			}

			const displayMatch = liveSources.find(
				(candidate) => String(candidate.display_id ?? "") === String(source.display_id ?? ""),
			);
			if (displayMatch) {
				return {
					...source,
					id: displayMatch.id,
					name: displayMatch.name ?? source.name,
					display_id: displayMatch.display_id ?? source.display_id,
				};
			}
		} catch (error) {
			console.warn("Failed to resolve browser capture source:", error);
		}

		return source;
	}, []);

	const finalizeRecordingSession = useCallback(
		async (videoPath: string, webcamPath: string | null) => {
			const start = performance.now();
			console.log("[PERF:RENDERER] Finalize Session & Switch to Editor: STARTED");
			const shouldHideOverlayCursor = hideEditorOverlayCursorByDefault.current;
			try {
				if (webcamPath) {
					await window.electronAPI.setCurrentRecordingSession({
						videoPath,
						webcamPath,
						timeOffsetMs: webcamTimeOffsetMs.current,
						hideOverlayCursorByDefault: shouldHideOverlayCursor,
					});
				} else {
					await window.electronAPI.setCurrentVideoPath(videoPath, {
						hideOverlayCursorByDefault: shouldHideOverlayCursor,
					});
				}
			} catch (error) {
				console.error("Failed to persist recording session metadata:", error);

				try {
					await window.electronAPI.setCurrentVideoPath(videoPath, {
						hideOverlayCursorByDefault: shouldHideOverlayCursor,
					});
				} catch (fallbackError) {
					console.error("Failed to persist fallback video path:", fallbackError);
				}
			}

			setFinalizing(false);
			await window.electronAPI.switchToEditor();
			console.log(
				`[PERF:RENDERER] Finalize Session & Switch to Editor: COMPLETED in ${(performance.now() - start).toFixed(2)}ms`,
			);
		},
		[],
	);

	const closeMicFallbackPauseInterval = useCallback((now = performance.now()) => {
		const pauseStartedAt = micFallbackPauseStartedAt.current;
		if (pauseStartedAt === null) {
			return;
		}

		const durationMs = Math.max(0, Math.round(now - pauseStartedAt));
		micFallbackPausedDurationMs.current += durationMs;
		const startedAt = micFallbackRecorderStartedAt.current ?? now;
		const lastInterval =
			micFallbackPauseIntervals.current[micFallbackPauseIntervals.current.length - 1];
		if (lastInterval && lastInterval.endElapsedMs === undefined) {
			lastInterval.endElapsedMs = Math.max(
				lastInterval.startElapsedMs,
				Math.round(now - startedAt),
			);
			lastInterval.durationMs = durationMs;
		}
		micFallbackPauseStartedAt.current = null;
	}, []);

	const stopMicFallbackRecorder = useCallback((): Promise<Blob | null> => {
		return new Promise((resolve) => {
			const recorder = micFallbackRecorder.current;
			if (!recorder || recorder.state === "inactive") {
				micFallbackRecorder.current = null;
				resolve(null);
				return;
			}
			closeMicFallbackPauseInterval();
			recorder.ondataavailable = appendMicFallbackChunk;
			recorder.onstop = () => {
				const blob =
					micFallbackChunks.current.length > 0
						? new Blob(micFallbackChunks.current, { type: recorder.mimeType })
						: null;
				micFallbackChunks.current = [];
				recorder.stream.getTracks().forEach((track) => track.stop());
				micFallbackRecorder.current = null;
				micFallbackRecorderStartedAt.current = null;
				resolve(blob);
			};
			recorder.stop();
		});
	}, [appendMicFallbackChunk, closeMicFallbackPauseInterval]);

	const pauseMicFallbackRecorder = useCallback(() => {
		const recorder = micFallbackRecorder.current;
		if (recorder?.state !== "recording") {
			return;
		}

		try {
			recorder.requestData();
		} catch (error) {
			console.warn("Failed to flush microphone fallback chunk before pause:", error);
		}

		recorder.pause();
		const now = performance.now();
		const startedAt = micFallbackRecorderStartedAt.current ?? now;
		micFallbackPauseStartedAt.current = now;
		micFallbackPauseIntervals.current.push({
			startElapsedMs: Math.max(0, Math.round(now - startedAt)),
		});
	}, []);

	const resumeMicFallbackRecorder = useCallback(() => {
		const recorder = micFallbackRecorder.current;
		if (recorder?.state !== "paused") {
			return;
		}

		closeMicFallbackPauseInterval();
		recorder.resume();
	}, [closeMicFallbackPauseInterval]);

	const storeMicrophoneSidecar = useCallback(
		async (
			micFallbackBlobPromise: Promise<Blob | null> | null | undefined,
			finalPath: string,
			startDelayMs?: number | null,
			mediaTrackSettings?: MicrophoneTrackSettingsSnapshot | null,
		) => {
			const micFallbackBlob = await micFallbackBlobPromise;
			if (!micFallbackBlob) {
				micFallbackStartDelayMs.current = null;
				micFallbackTrackSettings.current = null;
				micFallbackRequestedConstraints.current = null;
				micFallbackAudioInputDevices.current = null;
				micFallbackRecorderMetadata.current = null;
				resetMicFallbackTimingDiagnostics();
				return;
			}

			try {
				const arrayBuffer = await micFallbackBlob.arrayBuffer();
				const effectiveStartDelayMs = startDelayMs ?? micFallbackStartDelayMs.current;
				const effectiveTrackSettings = mediaTrackSettings ?? micFallbackTrackSettings.current;
				const sidecarOptions: MicrophoneSidecarOptions = {
					...(Number.isFinite(effectiveStartDelayMs) && (effectiveStartDelayMs ?? 0) >= 0
						? { startDelayMs: effectiveStartDelayMs ?? 0 }
						: {}),
					browserMicrophoneProfile: browserMicrophoneProfile.current,
					...(requestedBrowserMicrophoneProfile.current
						? {
								requestedBrowserMicrophoneProfile: requestedBrowserMicrophoneProfile.current,
							}
						: {}),
					...(micFallbackRequestedConstraints.current
						? { requestedConstraints: micFallbackRequestedConstraints.current }
						: {}),
					...(effectiveTrackSettings ? { mediaTrackSettings: effectiveTrackSettings } : {}),
					...(micFallbackAudioInputDevices.current
						? { audioInputDevices: micFallbackAudioInputDevices.current }
						: {}),
					...(micFallbackRecorderMetadata.current
						? { mediaRecorder: micFallbackRecorderMetadata.current }
						: {}),
					...(micFallbackChunkEvents.current.length > 0
						? { chunkEvents: [...micFallbackChunkEvents.current] }
						: {}),
					...(micFallbackPauseIntervals.current.length > 0
						? {
								pauseIntervals: micFallbackPauseIntervals.current.map((interval) => ({
									...interval,
								})),
							}
						: {}),
				};
				const result = await window.electronAPI.storeMicrophoneSidecar(
					arrayBuffer,
					finalPath,
					sidecarOptions,
				);
				if (!result.success) {
					const errorMessage = result.error || "Failed to save the fallback microphone audio track";
					console.warn("Failed to store microphone sidecar:", errorMessage);
					toast.error(`${errorMessage}. 录制已保存，但未包含备用麦克风音轨。`, {
						id: MICROPHONE_SIDECAR_ERROR_TOAST_ID,
						duration: 10000,
					});
				}
			} catch (error) {
				console.warn("Failed to store microphone sidecar:", error);
				toast.error(`${getErrorMessage(error)}. 录制已保存，但未包含备用麦克风音轨。`, {
					id: MICROPHONE_SIDECAR_ERROR_TOAST_ID,
					duration: 10000,
				});
			} finally {
				micFallbackStartDelayMs.current = null;
				micFallbackTrackSettings.current = null;
				micFallbackRequestedConstraints.current = null;
				micFallbackAudioInputDevices.current = null;
				micFallbackRecorderMetadata.current = null;
				resetMicFallbackTimingDiagnostics();
			}
		},
		[resetMicFallbackTimingDiagnostics],
	);

	/**
	 * Flush camera data before releasing the device and await duration finalization.
	 * @returns The completed camera source path, or null when no camera was captured.
	 */
	const stopWebcamRecorder = useCallback(async () => {
		const recorder = webcamRecorder.current;
		const pending = webcamStopPromise.current;

		if (!recorder) {
			const result = pending ? await pending : resolvedWebcamPath.current;
			webcamStopPromise.current = null;
			pendingWebcamPathPromise.current = null;
			resolvedWebcamPath.current = result ?? null;
			return result ?? null;
		}

		if (recorder.state !== "inactive") {
			// Freeze both source durations at stop, before asynchronous onstop and storage callbacks.
			recordingStoppedAtMs.current ??= Date.now();
			recorder.stop();
		} else if (pending && webcamStopResolver.current) {
			webcamStopResolver.current(resolvedWebcamPath.current);
			webcamStopResolver.current = null;
		}

		const result = pending ? await pending : resolvedWebcamPath.current;
		webcamStopPromise.current = null;
		pendingWebcamPathPromise.current = null;
		resolvedWebcamPath.current = result ?? null;
		webcamRecorder.current = null;
		return result ?? null;
	}, []);

	const recoverNativeRecordingSession = useCallback(
		async (micFallbackBlobPromise?: Promise<Blob | null> | null, startDelayMs?: number | null) => {
			if (typeof window.electronAPI?.recoverNativeScreenRecording !== "function") {
				return null;
			}

			const result = await window.electronAPI.recoverNativeScreenRecording();
			if (!result.success || !result.path) {
				return null;
			}

			const resolvedMicFallbackBlobPromise = micFallbackBlobPromise ?? stopMicFallbackRecorder();
			const webcamPath = await stopWebcamRecorder();
			await storeMicrophoneSidecar(resolvedMicFallbackBlobPromise, result.path, startDelayMs);
			await finalizeRecordingSession(result.path, webcamPath);

			if (typeof window.electronAPI?.hudOverlayClose === "function") {
				window.electronAPI.hudOverlayClose();
			}

			return result.path;
		},
		[finalizeRecordingSession, stopMicFallbackRecorder, stopWebcamRecorder, storeMicrophoneSidecar],
	);

	/**
	 * Acquire the webcam stream and prepare the MediaRecorder, but do NOT start
	 * recording yet. Call {@link beginWebcamCapture} after the main recording
	 * has started so both begin at approximately the same time.
	 */
	const prepareWebcamRecorder = useCallback(async () => {
		const disposition = discardCurrentCapture.current;
		if (!webcamEnabled) {
			resolvedWebcamPath.current = null;
			pendingWebcamPathPromise.current = Promise.resolve(null);
			webcamStartTime.current = null;
			webcamTimeOffsetMs.current = 0;
			return;
		}

		try {
			webcamStream.current = await navigator.mediaDevices.getUserMedia({
				video: webcamDeviceId
					? {
							deviceId: { exact: webcamDeviceId },
							width: { ideal: WEBCAM_WIDTH },
							height: { ideal: WEBCAM_HEIGHT },
							frameRate: { ideal: WEBCAM_FRAME_RATE, max: WEBCAM_FRAME_RATE },
						}
					: {
							width: { ideal: WEBCAM_WIDTH },
							height: { ideal: WEBCAM_HEIGHT },
							frameRate: { ideal: WEBCAM_FRAME_RATE, max: WEBCAM_FRAME_RATE },
						},
				audio: false,
			});

			const mimeType = selectWebcamMimeType();
			webcamChunks.current = [];
			resolvedWebcamPath.current = null;
			webcamStopPromise.current = new Promise((resolve) => {
				webcamStopResolver.current = resolve;
			});
			pendingWebcamPathPromise.current = webcamStopPromise.current;

			const recorder = new MediaRecorder(webcamStream.current, {
				videoBitsPerSecond: WEBCAM_BITRATE,
				...(mimeType ? { mimeType } : {}),
			});

			webcamRecorder.current = recorder;
			recorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					webcamChunks.current.push(event.data);
				}
			};
			recorder.onerror = () => {
				webcamStopResolver.current?.(null);
				webcamStopResolver.current = null;
			};
			recorder.onstop = async () => {
				const sessionTimestamp = recordingSessionTimestamp.current ?? Date.now();
				const webcamMimeType = recorder.mimeType || mimeType;
				const webcamFileName = `${RECORDING_FILE_PREFIX}${sessionTimestamp}${WEBCAM_SUFFIX}${getVideoExtensionForMimeType(webcamMimeType)}`;

				try {
					if (disposition.value || webcamChunks.current.length === 0) {
						webcamStopResolver.current?.(null);
						return;
					}

					const duration = Math.max(
						0,
						getRecordingDurationMs(Date.now()) - webcamTimeOffsetMs.current,
					);
					const webcamBlob = new Blob(
						webcamChunks.current,
						webcamMimeType ? { type: webcamMimeType } : undefined,
					);
					webcamChunks.current = [];
					const finalBlob = isWebmMimeType(webcamMimeType)
						? await fixWebmDuration(webcamBlob, duration)
						: webcamBlob;
					const arrayBuffer = await finalBlob.arrayBuffer();
					const result = await window.electronAPI.storeRecordedVideo(arrayBuffer, webcamFileName, {
						auxiliary: true,
					});
					webcamStopResolver.current?.(result.success ? (result.path ?? null) : null);
				} catch (error) {
					console.error("Error saving webcam recording:", error);
					webcamStopResolver.current?.(null);
				} finally {
					webcamStopResolver.current = null;
					webcamRecorder.current = null;
					webcamStartTime.current = null;
					if (webcamStream.current) {
						webcamStream.current.getTracks().forEach((track) => track.stop());
						webcamStream.current = null;
					}
				}
			};
		} catch (error) {
			console.warn("Failed to start webcam recording; continuing without webcam layer:", error);
			resolvedWebcamPath.current = null;
			pendingWebcamPathPromise.current = Promise.resolve(null);
			webcamStopPromise.current = Promise.resolve(null);
			webcamRecorder.current = null;
			webcamStartTime.current = null;
			webcamTimeOffsetMs.current = 0;
			if (webcamStream.current) {
				webcamStream.current.getTracks().forEach((track) => track.stop());
				webcamStream.current = null;
			}
		}
	}, [getRecordingDurationMs, selectWebcamMimeType, webcamDeviceId, webcamEnabled]);

	/**
	 * Start the prepared camera at the shared screen boundary.
	 * @param boundaryMs Explicit screen start timestamp; defaults to the current native boundary.
	 * @returns Nothing; camera chunks are flushed by the owning recording session.
	 */
	const beginWebcamCapture = useCallback((boundaryMs = Date.now()) => {
		const recorder = webcamRecorder.current;
		if (recorder && recorder.state === "inactive") {
			webcamStartTime.current = boundaryMs;
			recorder.start(RECORDER_TIMESLICE_MS);
		}
	}, []);

	/**
	 * 准备本次录制所选来源和设备；并行读取独立元数据，按平台校验实际权限。
	 * @returns 可用来源及捕获方式，用户取消或权限不足时返回空值。
	 */
	const prepareRecordingStart = useCallback(async () => {
		const [platform, selectedSource] = await Promise.all([
			window.electronAPI.getPlatform(),
			window.electronAPI.getSelectedSource(),
		]);
		hideEditorOverlayCursorByDefault.current = false;
		if (!selectedSource) {
			toast.info("请先选择要录制的屏幕或应用窗口");
			return null;
		}

		const permissionsReady = platform !== "darwin" || (await preparePermissions());
		if (!permissionsReady) {
			return null;
		}

		recordingSessionTimestamp.current = Date.now();
		resetRecordingClock(recordingSessionTimestamp.current);
		const useNativeMacScreenCapture =
			platform === "darwin" &&
			(selectedSource.id?.startsWith("screen:") ||
				selectedSource.id?.startsWith("window:") ||
				selectedSource.id?.startsWith("area:")) &&
			typeof window.electronAPI.startNativeScreenRecording === "function";

		let useNativeWindowsCapture = false;
		if (
			platform === "win32" &&
			shouldUseNativeWindowsCaptureForSource(selectedSource) &&
			typeof window.electronAPI.isNativeWindowsCaptureAvailable === "function"
		) {
			try {
				const nativeWindowsResult = await window.electronAPI.isNativeWindowsCaptureAvailable();
				useNativeWindowsCapture = nativeWindowsResult.available;
				if (!useNativeWindowsCapture && !hasShownNativeWindowsFallbackToast.current) {
					void logNativeCaptureDiagnostics("is-native-windows-capture-available");
					hasShownNativeWindowsFallbackToast.current = true;
					toast.error("当前系统不支持无系统指针的演示录制。");
				}
			} catch {
				useNativeWindowsCapture = false;
				if (!hasShownNativeWindowsFallbackToast.current) {
					hasShownNativeWindowsFallbackToast.current = true;
					toast.error("无法检查无系统指针的原生捕获能力。");
				}
			}
		}

		if (platform === "win32" && !useNativeWindowsCapture) return null;
		// 能力验证通过后才并行取得设备，避免原生不可用时留下迟到的摄像头流。
		const webcamPreparation = useNativeWindowsCapture ? Promise.resolve() : prepareWebcamRecorder();
		let micLabel: string | undefined;
		let webcamLabel: string | undefined;
		if (((useNativeMacScreenCapture || useNativeWindowsCapture) && microphoneEnabled) || (useNativeWindowsCapture && webcamEnabled)) {
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const mic = devices.find(
					(d) => d.deviceId === microphoneDeviceId && d.kind === "audioinput",
				);
				micLabel = mic?.label || undefined;
				webcamLabel = devices.find((device) => device.kind === "videoinput" && device.deviceId === webcamDeviceId)?.label;
			} catch {
				// Fall through - native process will use the default mic.
			}
		}

		const microphonePreparation =
			!useNativeMacScreenCapture && !useNativeWindowsCapture && microphoneEnabled
				? navigator.mediaDevices
						.getUserMedia(
							createProcessedMicrophoneConstraints(
								microphoneDeviceId,
								browserMicrophoneProfile.current,
							),
						)
						.then((media) => {
							microphoneStream.current = media;
							return media;
						})
						.catch((error) => {
							console.warn("麦克风采集失败", error);
							toast.error("麦克风不可用，将继续录制其他来源。");
							return null;
						})
				: Promise.resolve(null);
		return {
			webcamLabel,
			webcamPreparation,
			microphonePreparation,
			platform,
			selectedSource,
			useNativeMacScreenCapture,
			useNativeWindowsCapture,
			micLabel,
		};
	}, [
		logNativeCaptureDiagnostics,
		microphoneDeviceId,
		microphoneEnabled,
		preparePermissions,
		prepareWebcamRecorder,
		resetRecordingClock,
	]);

	const discardActiveNativeCapture = useCallback(async () => {
		const pendingPath = pendingNativeCleanupPath.current;
		if (pendingPath) {
			try {
				await window.electronAPI.deleteRecordingFile(pendingPath);
				pendingNativeCleanupPath.current = null;
			} catch (error) {
				console.warn("Failed to delete pending native capture file:", error);
			}
		}

		if (!nativeScreenRecording.current) {
			return pendingNativeCleanupPath.current === null;
		}
		if (nativeStopRequestInFlight.current) {
			return false;
		}

		nativeStopRequestInFlight.current = true;
		let result: DiscardNativeCaptureResult;
		try {
			result = await stopAndDiscardNativeCapture({
				stopNativeScreenRecording: () => window.electronAPI.stopNativeScreenRecording(),
				deleteRecordingFile: (path) => window.electronAPI.deleteRecordingFile(path),
			});
		} finally {
			nativeStopRequestInFlight.current = false;
		}

		if (result.stopSucceeded) {
			nativeScreenRecording.current = false;
			nativeWindowsRecording.current = false;
			nativeWarmStartActive.current = false;
		}

		if (!result.deleteSucceeded && result.path) {
			pendingNativeCleanupPath.current = result.path;
		}

		if (!result.stopSucceeded || !result.deleteSucceeded) {
			console.warn("Failed to fully discard native capture:", result.error);
			return false;
		}

		return true;
	}, []);

	/**
	 * 冻结录制边界，等待全部所属素材保存和时间对齐后交给编辑器。
	 * @returns 无返回值；异步收尾属于当前已登记录制任务。
	 */
	const stopRecording = useRef(() => {
		recordingStartGeneration.current += 1;
		setPaused(false);
		if (nativeScreenRecording.current && nativeWarmStartActive.current) {
			setRecording(false);
			void (async () => {
				await discardActiveNativeCapture();
				cleanupCapturedMedia();
				await Promise.allSettled([
					stopMicFallbackRecorder(),
					stopWebcamRecorder(),
					window.electronAPI?.setRecordingState(false),
				]);
			})();
			return;
		}
		if (nativeScreenRecording.current) {
			if (nativeStopRequestInFlight.current) {
				return;
			}
			nativeStopRequestInFlight.current = true;
			setRecording(false);
			setFinalizing(true);

			void (async () => {
				const stopStart = performance.now();
				console.log("[PERF:RENDERER] Total Stop Sequence: STARTED");

				const fallbackStartDelayMs = micFallbackStartDelayMs.current;
				const fallbackTrackSettings = micFallbackTrackSettings.current;
				const isNativeWindows = nativeWindowsRecording.current;
				const stoppedAtMs = isNativeWindows ? captureNow() + CAPTURE_BOUNDARY_LEAD_MS : Date.now();
				// 原生先收到未来截止时刻，浏览器来源再在该时刻同时停止，不等待封装回执。
				const nativeStop = window.electronAPI.stopNativeScreenRecording(stoppedAtMs);
				await atCaptureBoundary(stoppedAtMs, () => undefined);
				recordingStoppedAtMs.current = stoppedAtMs;
				markRecordingResumed(stoppedAtMs);
				const expectedDurationMs = getRecordingDurationMs(stoppedAtMs);
				const micFallbackBlobPromise = stopMicFallbackRecorder();
				const webcamPathPromise = stopWebcamRecorder();

				const ipcStopStart = performance.now();
				console.log("[PERF:RENDERER] IPC: stopNativeScreenRecording: STARTED");
				let result: NativeCaptureStopResult;
				try {
					result = await nativeStop;
				} catch (error) {
					result = { success: false, error: getErrorMessage(error) };
				}
				nativeStopRequestInFlight.current = false;
				console.log(
					`[PERF:RENDERER] IPC: stopNativeScreenRecording: COMPLETED in ${(performance.now() - ipcStopStart).toFixed(2)}ms`,
				);
				if (result.success || result.strictSyncFailure) {
					nativeScreenRecording.current = false;
					nativeWindowsRecording.current = false;
					nativeWarmStartActive.current = false;
				}

				try {
					await window.electronAPI?.setRecordingState(false);
				} catch (stateError) {
					console.warn("Failed to reset main-process recording state:", stateError);
				}

				if (!result.success || !result.path) {
					console.error("Failed to stop native screen recording:", result.error ?? result.message);
					void logNativeCaptureDiagnostics("stop-native-screen-recording");
					if (result.strictSyncFailure) {
						await notifyRecordingFinalizationFailure("录制的同步素材未完整生成，请检查摄像头或麦克风后重试。");
						return;
					}
					try {
						const recoveredPath = await recoverNativeRecordingSession(
							micFallbackBlobPromise,
							fallbackStartDelayMs,
						);
						if (recoveredPath) {
							console.log(
								`[PERF:RENDERER] Total Stop Sequence (RECOVERED) in ${(performance.now() - stopStart).toFixed(2)}ms`,
							);
							return;
						}
					} catch (recoveryError) {
						console.error("Failed to recover native screen recording:", recoveryError);
					}

					const failureMessage = await buildNativeCaptureFailureMessage(
						"stop-native-screen-recording",
						isMacOS
							? "Failed to finish the macOS recording, so the editor was not opened."
							: "Failed to finish the recording, so the editor was not opened.",
					);
					await notifyRecordingFinalizationFailure(failureMessage);
					return;
				}

				const finalPath = result.path;

				try {
					// 等待相机落盘后再发布原生前置量，避免改变其 WebM 容器时长计算。
					const webcamPath = result.webcamPath ?? await webcamPathPromise;
					const leadingMs = Math.max(0, result.leadingMs ?? 0);
					webcamTimeOffsetMs.current += leadingMs;
					await storeMicrophoneSidecar(micFallbackBlobPromise, finalPath,
						(fallbackStartDelayMs ?? 0) + leadingMs, fallbackTrackSettings);
					// 麦克风保存完成后再归一化两路音频，不能并发读取尚未发布的伴随文件。
					if (isNativeWindows) {
						const aligned = await window.electronAPI.muxNativeWindowsRecording(result.durationMs ?? expectedDurationMs);
						if (!aligned.success) throw new Error(aligned.error ?? "原生音轨时间对齐失败");
					}
					await finalizeRecordingSession(finalPath, webcamPath);
				} catch (error) {
					console.error("原生录制素材发布失败:", error);
					await notifyRecordingFinalizationFailure(getErrorMessage(error));
				} finally {
					cleanupCapturedMedia();
					window.electronAPI?.hudOverlayClose?.();
				}
			})();
			return;
		}

		const recorder = mediaRecorder.current;
		const recorderState = recorder?.state;
		if (recorder && (recorderState === "recording" || recorderState === "paused")) {
			recordingStoppedAtMs.current = Date.now();

			browserAudioTracks.current?.apply("stop");
			pendingWebcamPathPromise.current = stopWebcamRecorder();
			try {
				recorder.requestData();
			} catch (error) {
				console.warn("Failed to flush recorder before stopping:", error);
			}
			recorder.stop();
			setRecording(false);
			setFinalizing(true);
			window.electronAPI?.setRecordingState(false);
		}
	});

	useEffect(() => {
		void (async () => {
			const platform = await window.electronAPI.getPlatform();
			setIsMacOS(platform === "darwin");
		})();
	}, []);

	useEffect(() => {
		if (typeof window.electronAPI?.getRecordingAudioLabConfig !== "function") {
			return;
		}

		void (async () => {
			const result = await window.electronAPI.getRecordingAudioLabConfig();
			browserMicrophoneProfile.current = normalizeBrowserMicrophoneProfile(
				result.browserMicrophoneProfile,
			);
			requestedBrowserMicrophoneProfile.current = result.requestedBrowserMicrophoneProfile ?? null;
			console.info("Browser microphone profile:", browserMicrophoneProfile.current);
		})();
	}, []);

	useEffect(() => {
		if (countdownDelayLoaded.current) return;
		countdownDelayLoaded.current = true;

		void (async () => {
			const result = await window.electronAPI.getCountdownDelay();
			if (result.success && typeof result.delay === "number") {
				setCountdownDelayState(result.delay);
			}
		})();
	}, []);

	const setCountdownDelay = useCallback((delay: number) => {
		setCountdownDelayState(delay);
		void window.electronAPI.setCountdownDelay(delay);
	}, []);

	useEffect(() => {
		if (recordingPrefsLoaded.current) return;
		recordingPrefsLoaded.current = true;

		void (async () => {
			const result = await window.electronAPI.getRecordingPreferences();
			if (result.success) {
				setMicrophoneEnabled(result.microphoneEnabled);
				if (result.microphoneDeviceId) {
					setMicrophoneDeviceId(result.microphoneDeviceId);
				}
				setSystemAudioEnabled(result.systemAudioEnabled);
				setWebcamEnabled(result.webcamEnabled);
				if (result.webcamDeviceId) {
					setWebcamDeviceId(result.webcamDeviceId);
				}
			}
		})();
	}, []);

	const persistMicrophoneEnabled = useCallback((enabled: boolean) => {
		setMicrophoneEnabled(enabled);
		void window.electronAPI.setRecordingPreferences({ microphoneEnabled: enabled });
	}, []);

	const persistMicrophoneDeviceId = useCallback((deviceId: string | undefined) => {
		setMicrophoneDeviceId(deviceId);
		void window.electronAPI.setRecordingPreferences({ microphoneDeviceId: deviceId });
	}, []);

	const persistSystemAudioEnabled = useCallback((enabled: boolean) => {
		setSystemAudioEnabled(enabled);
		void window.electronAPI.setRecordingPreferences({ systemAudioEnabled: enabled });
	}, []);

	const persistWebcamEnabled = useCallback((enabled: boolean) => {
		setWebcamEnabled(enabled);
		void window.electronAPI.setRecordingPreferences({ webcamEnabled: enabled });
	}, []);

	const persistWebcamDeviceId = useCallback((deviceId: string | undefined) => {
		setWebcamDeviceId(deviceId);
		void window.electronAPI.setRecordingPreferences({ webcamDeviceId: deviceId });
	}, []);

	useEffect(() => {
		let cleanup: (() => void) | undefined;

		if (window.electronAPI?.onStopRecordingFromTray) {
			cleanup = window.electronAPI.onStopRecordingFromTray(() => {
				stopRecording.current();
			});
		}

		const removeRecordingStateListener = window.electronAPI?.onRecordingStateChanged?.((state) => {
			setRecording(state.recording);
		});

		const removeRecordingInterruptedListener = window.electronAPI?.onRecordingInterrupted?.(
			(state) => {
				void (async () => {
					recordingStartGeneration.current += 1;
					setRecording(false);
					nativeScreenRecording.current = false;
					nativeWindowsRecording.current = false;
					nativeWarmStartActive.current = false;
					cleanupCapturedMedia();
					await window.electronAPI.setRecordingState(false);

					if (state.reason !== "window-unavailable") {
						try {
							const recoveredPath = await recoverNativeRecordingSession();
							if (recoveredPath) {
								return;
							}
						} catch (recoveryError) {
							console.error(
								"Failed to recover interrupted native screen recording:",
								recoveryError,
							);
						}
					}

					if (state.reason === "window-unavailable" && !hasPromptedForReselect.current) {
						hasPromptedForReselect.current = true;
						alert(state.message);
						await window.electronAPI.openSourceSelector();
					} else {
						console.error(state.message);
						toast.error(state.message);
					}
				})();
			},
		);

		return () => {
			recordingStartGeneration.current += 1;
			cleanup?.();
			removeRecordingStateListener?.();
			removeRecordingInterruptedListener?.();

			if (nativeScreenRecording.current) {
				if (nativeWarmStartActive.current) {
					void discardActiveNativeCapture();
				} else if (!nativeStopRequestInFlight.current) {
					nativeStopRequestInFlight.current = true;
					void window.electronAPI
						.stopNativeScreenRecording()
						.then((result) => {
							if (result.success) {
								nativeScreenRecording.current = false;
								nativeWindowsRecording.current = false;
							}
						})
						.catch((error) => {
							console.warn("Failed to stop native capture during cleanup:", error);
						})
						.finally(() => {
							nativeStopRequestInFlight.current = false;
						});
				}
			} else if (pendingNativeCleanupPath.current) {
				void discardActiveNativeCapture();
			}

			const recorder = mediaRecorder.current;
			const recorderState = recorder?.state;
			if (recorder && (recorderState === "recording" || recorderState === "paused")) {
				recorder.stop();
			}

			cleanupCapturedMedia();
		};
	}, [
		cleanupCapturedMedia,
		discardActiveNativeCapture,
		recoverNativeRecordingSession,
		setRecording,
	]);

	/**
	 * 按录制前的设备及输入选择启动本次捕获，准备失败时释放已取得的媒体。
	 * @returns 启动或取消及其资源收尾完成后的 Promise。
	 */
	const startRecording = async () => {
		let captureStarted = false;
		let devicePreparation: Promise<unknown> = Promise.resolve();
		if (startInFlight.current) {
			return;
		}
		const startGeneration = recordingStartGeneration.current + 1;
		discardCurrentCapture.current = { value: false };
		const disposition = discardCurrentCapture.current;
		recordingStartGeneration.current = startGeneration;
		const startWasCancelled = () => recordingStartGeneration.current !== startGeneration;
		let usingLinuxPortal = false;

		let hudSourceSelectionActive = false;
		const setHudSourceSelectionActive = (active: boolean) => {
			if (hudSourceSelectionActive === active) {
				return;
			}

			hudSourceSelectionActive = active;
			window.electronAPI?.hudOverlaySetSourceSelectionActive?.(active);
		};

		hasPromptedForReselect.current = false;
		startInFlight.current = true;
		let finishStart!: () => void;
		pendingStart.current = new Promise<void>((resolve) => {
			finishStart = resolve;
		});
		setStarting(true);

		try {
			const preparedStart = await prepareRecordingStart();
			devicePreparation = Promise.all([preparedStart?.webcamPreparation, preparedStart?.microphonePreparation]);
			if (!preparedStart || startWasCancelled()) {
				await preparedStart?.webcamPreparation;
				await preparedStart?.microphonePreparation;
				cleanupCapturedMedia();
				await stopWebcamRecorder();
				return;
			}

			const {
				selectedSource,
				useNativeMacScreenCapture,
				useNativeWindowsCapture,
				micLabel,
				webcamLabel,
				webcamPreparation,
				microphonePreparation,
			} = preparedStart;
			const useNativeCapture = useNativeMacScreenCapture || useNativeWindowsCapture;
			// 在首帧和原生订阅开始前提交两个独立选择；不持久化输入采集状态。
			// 演示录制始终采集鼠标，按键仍由用户单独选择。
			await window.electronAPI.configureInputCapture({ keyboard: keyboardEnabled, mouse: true });
			const shouldWarmStartNativeCapture = useNativeMacScreenCapture && countdownDelay > 0;

			let nativeWindowsCaptureStartFailed = false;

			if (useNativeCapture) {
				// 并行准备WGC编码器、相机与麦克风；准备期间不采集正式内容。
				const nativePreparation = window.electronAPI.startNativeScreenRecording(selectedSource, {
					capturesSystemAudio: systemAudioEnabled,
					capturesMicrophone: microphoneEnabled,
					capturesWebcam: useNativeWindowsCapture && webcamEnabled,
					webcamLabel,
					microphoneDeviceId,
					microphoneLabel: micLabel,
					deferStart: useNativeWindowsCapture,
				});
				const [, nativeResult] = await Promise.all([Promise.all([webcamPreparation, microphonePreparation]), nativePreparation]);
				if (nativeResult.success && startWasCancelled()) {
					nativeScreenRecording.current = true;
					nativeWindowsRecording.current = useNativeWindowsCapture;
					nativeWarmStartActive.current = shouldWarmStartNativeCapture;
					await discardActiveNativeCapture();
					cleanupCapturedMedia();
					await stopWebcamRecorder();
					return;
				}
				if (!nativeResult.success) {
					if (useNativeWindowsCapture) {
						// 不静默退回可能将系统指针写入画面的捕获链。
						throw new Error(nativeResult.error ?? nativeResult.message ?? "无法启动无系统指针的原生捕获");
					} else if (!nativeResult.userNotified) {
						throw new Error(
							nativeResult.error ??
								nativeResult.message ??
								"Failed to start native screen recording",
						);
					} else {
						setRecording(false);
						cleanupCapturedMedia();
						await stopWebcamRecorder();
						return;
					}
				}

				if (nativeResult.success) {
					nativeScreenRecording.current = true;
					nativeWindowsRecording.current = useNativeWindowsCapture;
					if (useNativeWindowsCapture && nativeResult.microphoneFallbackRequired) throw new Error("所选麦克风无法提供原生同步采集，请更换设备后重试。");
					if (shouldWarmStartNativeCapture) {
						nativeWarmStartActive.current = true;
						const pauseResult = await window.electronAPI.pauseNativeScreenRecording();
						if (startWasCancelled()) {
							return;
						}
						if (!pauseResult.success) {
							throw new Error(
								pauseResult.error ??
									pauseResult.message ??
									"Failed to pause native capture before countdown",
							);
						}

						setCountdownActive(true);
						try {
							const countdownResult = await window.electronAPI.startCountdown(countdownDelay);
							if (!countdownResult.success || countdownResult.cancelled || startWasCancelled()) {
								if (!startWasCancelled()) {
									await discardActiveNativeCapture();
								}
								cleanupCapturedMedia();
								await stopWebcamRecorder();
								return;
							}
						} finally {
							setCountdownActive(false);
						}

						const resumeResult = await window.electronAPI.resumeNativeScreenRecording();
						if (startWasCancelled()) {
							return;
						}
						if (!resumeResult.success) {
							throw new Error(
								resumeResult.error ??
									resumeResult.message ??
									"Failed to resume native capture after countdown",
							);
						}
						nativeWarmStartActive.current = false;
					}
					if (startWasCancelled()) {
						return;
					}

					let mainStartedAt = shouldWarmStartNativeCapture
						? Date.now()
						: (nativeResult.captureStartedAtMs ?? Date.now());
					micFallbackStartDelayMs.current = null;
					resetRecordingClock(mainStartedAt);
					webcamTimeOffsetMs.current =
						webcamStartTime.current === null ? 0 : webcamStartTime.current - mainStartedAt;

					// When native mic capture is unavailable or explicitly bypassed,
					// record mic via browser getUserMedia as a sidecar file.
					if (nativeResult.microphoneFallbackRequired && microphoneEnabled) {
						void logNativeCaptureDiagnostics("start-browser-microphone-fallback");
						console.info("Using browser microphone processing for this recording.");
						let unownedMicStream: MediaStream | null = null;
						try {
							const microphoneConstraints = createProcessedMicrophoneConstraints(
								microphoneDeviceId,
								browserMicrophoneProfile.current,
							);
							micFallbackRequestedConstraints.current = microphoneConstraints;
							const micStream = microphoneStream.current ?? await navigator.mediaDevices.getUserMedia(microphoneConstraints);
							unownedMicStream = micStream;
							micFallbackTrackSettings.current = createMicrophoneTrackSettingsSnapshot(micStream);
							micFallbackAudioInputDevices.current = await createAudioInputDeviceSnapshot().catch(
								() => null,
							);
							console.info("Browser microphone track settings:", micFallbackTrackSettings.current);
							console.info(
								"Browser microphone audio input devices:",
								micFallbackAudioInputDevices.current,
							);
							micFallbackChunks.current = [];
							const recorder = new MediaRecorder(micStream, {
								mimeType: "audio/webm;codecs=opus",
								audioBitsPerSecond: AUDIO_BITRATE_VOICE,
							});
							micFallbackRecorderMetadata.current = {
								mimeType: recorder.mimeType,
								audioBitsPerSecond: AUDIO_BITRATE_VOICE,
								timesliceMs: RECORDER_TIMESLICE_MS,
							};
							resetMicFallbackTimingDiagnostics();

							recorder.ondataavailable = appendMicFallbackChunk;
							micFallbackStartDelayMs.current = Math.max(0, Date.now() - mainStartedAt);
							if (startWasCancelled()) return;
							micFallbackRecorder.current = recorder;
							unownedMicStream = null;
						} catch (micError) {
							micFallbackStartDelayMs.current = null;
							micFallbackTrackSettings.current = null;
							micFallbackRequestedConstraints.current = null;
							micFallbackAudioInputDevices.current = null;
							micFallbackRecorderMetadata.current = null;
							resetMicFallbackTimingDiagnostics();
							console.warn("Browser microphone fallback failed:", micError);
							const permissionDenied =
								micError instanceof DOMException &&
								(micError.name === "NotAllowedError" || micError.name === "SecurityError");
							toast.error(
								permissionDenied
									? "麦克风权限被拒绝，将继续录制画面。"
									: `${getErrorMessage(micError)}. 将继续录制画面，不包含麦克风声音。`,
								{ id: MICROPHONE_FALLBACK_ERROR_TOAST_ID, duration: 10000 },
							);
						} finally {
							// Until the recorder owns it, cancellation or setup failure must release the mic.
							unownedMicStream?.getTracks().forEach((track) => track.stop());
						}
					}
					if (startWasCancelled()) {
						await stopMicFallbackRecorder();
						await stopWebcamRecorder();
						cleanupCapturedMedia();
						return;
					}

					if (useNativeWindowsCapture && countdownDelay > 0) {
						setCountdownActive(true);
						try {
							const countdown = await window.electronAPI.startCountdown(countdownDelay);
							if (!countdown.success || countdown.cancelled || startWasCancelled()) { await discardActiveNativeCapture(); return; }
						} finally { setCountdownActive(false); }
					}
					// 所有设备与编码器就绪后才提交同一短期边界，避免录入准备阶段。
					mainStartedAt = useNativeWindowsCapture ? captureNow() + CAPTURE_BOUNDARY_LEAD_MS : mainStartedAt;
					resetRecordingClock(mainStartedAt);
					if (useNativeWindowsCapture) beginWebcamCapture(mainStartedAt);
					const committed = useNativeWindowsCapture ? window.electronAPI.commitNativeScreenRecording(mainStartedAt) : null;
					await atCaptureBoundary(mainStartedAt, () => {
						const webcamBoundary = useNativeWindowsCapture ? mainStartedAt : Date.now();
						if (!useNativeWindowsCapture) beginWebcamCapture(webcamBoundary);
						webcamTimeOffsetMs.current = webcamBoundary - mainStartedAt;
						if (micFallbackRecorder.current?.state === "inactive") {
							micFallbackRecorderStartedAt.current = performance.now();
							micFallbackStartDelayMs.current = Math.max(0, captureNow() - mainStartedAt);
							micFallbackRecorder.current.start(RECORDER_TIMESLICE_MS);
						}
					});
					const commitResult = await committed;
					if (commitResult && !commitResult.success) throw new Error(commitResult.error ?? "无法开始同步录制");
					captureStarted = true;
					setRecording(true);
					try {
						await window.electronAPI?.setRecordingState(true, mainStartedAt);
					} catch (stateError) {
						console.warn(
							"Failed to notify main process that native recording started:",
							stateError,
						);
					}

					return;
				}
			}

			if (startWasCancelled()) return;
			if (nativeWindowsCaptureStartFailed && countdownDelay > 0) {
				setCountdownActive(true);
				try {
					const result = await window.electronAPI.startCountdown(countdownDelay);
					if (!result.success || result.cancelled || startWasCancelled()) {
						cleanupCapturedMedia();
						await stopWebcamRecorder();
						return;
					}
				} finally {
					setCountdownActive(false);
				}
				recordingSessionTimestamp.current = Date.now();
				resetRecordingClock(recordingSessionTimestamp.current);
			}

			if (startWasCancelled()) return;
			const browserCursorPolicy = resolveBrowserCaptureCursorPolicy({
				nativeWindowsCaptureStartFailed,
			});
			hideEditorOverlayCursorByDefault.current =
				browserCursorPolicy.hideEditorOverlayCursorByDefault;

			const wantsAudioCapture = microphoneEnabled || systemAudioEnabled;
			const browserCaptureSource = await resolveBrowserCaptureSource(selectedSource);

			if (
				browserCaptureSource?.id?.startsWith("screen:fallback:") ||
				browserCaptureSource?.id?.startsWith("window:fallback:")
			) {
				throw new Error("Selected display is not available for browser capture on this system.");
			}

			if (browserCursorPolicy.hideOsCursorBeforeRecording) {
				try {
					const hideCursorResult = await window.electronAPI.hideOsCursor?.();
					if (hideCursorResult && !hideCursorResult.success) {
						console.warn("Could not hide OS cursor before recording.", hideCursorResult);
					}
				} catch {
					console.warn("Could not hide OS cursor before recording.");
				}
			}

			let videoTrack: MediaStreamTrack | undefined;
			let systemAudioIncluded = false;
			const mediaDevices = navigator.mediaDevices as DesktopCaptureMediaDevices;
			const useLinuxPortal = selectedSource.id === "screen:linux-portal";
			usingLinuxPortal = useLinuxPortal;
			const browserScreenVideoConstraints = {
				mandatory: {
					chromeMediaSource: CHROME_MEDIA_SOURCE,
					chromeMediaSourceId: browserCaptureSource.id,
					maxWidth: TARGET_WIDTH,
					maxHeight: TARGET_HEIGHT,
					maxFrameRate: TARGET_FRAME_RATE,
					minFrameRate: MIN_FRAME_RATE,
					googCaptureCursor: browserCursorPolicy.streamCursor === "always",
				},
				cursor: browserCursorPolicy.streamCursor,
			};

			if (wantsAudioCapture) {
				let screenMediaStream: MediaStream;
				const acquireLinuxPortalStream = (withAudio: boolean) =>
					mediaDevices.getDisplayMedia({
						audio: withAudio,
						video: {
							displaySurface: "monitor",
							width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
							height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
							frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
							cursor: browserCursorPolicy.streamCursor,
						},
						selfBrowserSurface: "exclude",
						surfaceSwitching: "exclude",
					});

				screenMediaStream = await acquireBrowserScreenCapture({
					audio: systemAudioEnabled,
					usePortal: useLinuxPortal,
					request: (audio) =>
						useLinuxPortal
							? acquireLinuxPortalStream(audio)
							: mediaDevices.getUserMedia({
									audio: audio
										? {
												mandatory: {
													chromeMediaSource: CHROME_MEDIA_SOURCE,
													chromeMediaSourceId: browserCaptureSource.id,
												},
											}
										: false,
									video: browserScreenVideoConstraints,
								}),
					onAudioFallback: () => {
						alert("此来源无法采集系统声音，将继续录制画面。");
					},
				});

				screenStream.current = screenMediaStream;
				stream.current = new MediaStream();

				videoTrack = screenMediaStream.getVideoTracks()[0];
				if (!videoTrack) {
					throw new Error("Video track is not available.");
				}

				stream.current.addTrack(videoTrack);

				await microphonePreparation;
				systemAudioIncluded = screenMediaStream.getAudioTracks().length > 0;
			} else {
				const mediaStream = useLinuxPortal
					? await mediaDevices.getDisplayMedia({
							audio: false,
							video: {
								displaySurface: selectedSource.id?.startsWith("window:") ? "window" : "monitor",
								width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
								height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
								frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
								cursor: browserCursorPolicy.streamCursor,
							},
							selfBrowserSurface: "exclude",
							surfaceSwitching: "exclude",
						})
					: await mediaDevices.getUserMedia({
							audio: false,
							video: browserScreenVideoConstraints,
						});

				stream.current = mediaStream;
				videoTrack = mediaStream.getVideoTracks()[0];
			}

			if (!stream.current || !videoTrack) {
				throw new Error("Media stream is not available.");
			}

			await Promise.all([webcamPreparation, microphonePreparation]);
			if (startWasCancelled()) return;
			browserAudioTracks.current = new BrowserAudioTracks([
				{ kind: "system", stream: screenStream.current },
				{ kind: "mic", stream: microphoneStream.current },
			]);

			const captured = videoTrack.getSettings();
			// 首次捕获已经声明分辨率和帧率范围；合格轨道不再重复协商并重启捕获管线。
			if (
				!captured.width ||
				!captured.height ||
				captured.width > TARGET_WIDTH ||
				captured.height > TARGET_HEIGHT ||
				(captured.frameRate ?? 0) < MIN_FRAME_RATE ||
				(captured.frameRate ?? 0) > TARGET_FRAME_RATE
			) {
				try {
					await videoTrack.applyConstraints({
						frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
						width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
						height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
					} as MediaTrackConstraints);
				} catch (error) {
					console.warn("无法调整捕获参数，继续使用当前可用画质。", error);
				}
			}

			let {
				width = DEFAULT_WIDTH,
				height = DEFAULT_HEIGHT,
				frameRate = TARGET_FRAME_RATE,
			} = videoTrack.getSettings();

			width = Math.floor(width / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;
			height = Math.floor(height / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;

			const videoBitsPerSecond = computeBitrate(width, height);
			const mimeType = selectMimeType();

			console.log(
				`Recording at ${width}x${height} @ ${frameRate ?? TARGET_FRAME_RATE}fps using ${mimeType ?? "browser default"} / ${Math.round(
					videoBitsPerSecond / BITS_PER_MEGABIT,
				)} Mbps`,
			);

			chunks.current = [];
			const hasAudio = stream.current.getAudioTracks().length > 0;
			const audioBitsPerSecond = hasAudio
				? systemAudioIncluded
					? AUDIO_BITRATE_SYSTEM
					: AUDIO_BITRATE_VOICE
				: undefined;
			const recorder = new MediaRecorder(
				stream.current,
				createBrowserRecordingOptions({
					audioBitsPerSecond,
					mimeType,
					videoBitsPerSecond,
				}),
			);

			mediaRecorder.current = recorder;
			recorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) chunks.current.push(event.data);
			};
			recorder.onstop = async () => {
				if (disposition.value || chunks.current.length === 0) {
					cleanupCapturedMedia();
					setFinalizing(false);
					return;
				}

				const duration = getRecordingDurationMs(Date.now());
				const recordedChunks = chunks.current;
				const recordingBlobType = recorder.mimeType || mimeType;
				const buggyBlob = new Blob(
					recordedChunks,
					recordingBlobType ? { type: recordingBlobType } : undefined,
				);
				chunks.current = [];
				const timestamp = recordingSessionTimestamp.current ?? Date.now();
				const videoFileName = `${RECORDING_FILE_PREFIX}${timestamp}${getVideoExtensionForMimeType(recordingBlobType)}`;

				try {
					const videoBlob = isWebmMimeType(recordingBlobType)
						? await fixWebmDuration(buggyBlob, duration)
						: buggyBlob;
					const arrayBuffer = await videoBlob.arrayBuffer();
					const videoResult = await window.electronAPI.storeRecordedVideo(
						arrayBuffer,
						videoFileName,
					);
					if (!videoResult.success) {
						console.error("Failed to store video:", videoResult.message);
						await notifyRecordingFinalizationFailure(
							videoResult.message || "Failed to store the recording.",
						);
						return;
					}

					if (videoResult.path) {
						const finalVideoPath = videoResult.path;
						// Publish a complete session so both recorded sounds are editable on first load.
						const [webcamPath] = await Promise.all([
							pendingWebcamPathPromise.current ?? resolvedWebcamPath.current,
							browserAudioTracks.current?.save(`${RECORDING_FILE_PREFIX}${timestamp}`, duration),
						]);
						browserAudioTracks.current = null;
						cleanupCapturedMedia();
						await finalizeRecordingSession(finalVideoPath, webcamPath);
						window.electronAPI?.hudOverlayClose?.();
					} else {
						await notifyRecordingFinalizationFailure("Failed to save the recording.");
					}
				} catch (error) {
					console.error("Error saving recording:", error);
					const message = error instanceof Error ? error.message : String(error);
					await notifyRecordingFinalizationFailure(`Failed to finalize the recording. ${message}`);
				} finally {
					cleanupCapturedMedia();
				}
			};
			recorder.onerror = () => {
				setRecording(false);
			};
			if (countdownDelay > 0) {
				setCountdownActive(true);
				try {
					const result = await window.electronAPI.startCountdown(countdownDelay);
					if (!result.success || result.cancelled || startWasCancelled()) return;
				} finally {
					setCountdownActive(false);
				}
			}
			if (startWasCancelled()) return;
			const mainStartedAt = Date.now();
			resetRecordingClock(mainStartedAt);
			// No awaits between these starts: all encoders share the same capture task and pause clock.
			recorder.start(RECORDER_TIMESLICE_MS);
			beginWebcamCapture(mainStartedAt);
			browserAudioTracks.current?.apply("start");
			webcamTimeOffsetMs.current = 0;
			captureStarted = true;
			setRecording(true);
			try {
				await window.electronAPI?.setRecordingState(true, mainStartedAt);
			} catch (stateError) {
				console.warn("Failed to notify main process that recording started:", stateError);
			}
		} catch (error) {
			if (!startWasCancelled() && !(usingLinuxPortal && isCapturePermissionDismissed(error))) {
				console.error("Failed to start recording:", error);
				alert(
					error instanceof Error
						? `Failed to start recording: ${error.message}`
						: "Failed to start recording",
				);
			}
			setRecording(false);
			if (nativeScreenRecording.current) {
				await discardActiveNativeCapture();
			}
			try {
				await window.electronAPI?.setRecordingState(false);
			} catch (stateError) {
				console.warn("Failed to reset main-process recording state:", stateError);
			} finally {
				cleanupCapturedMedia();
				await stopWebcamRecorder();
			}
		} finally {
			try {
				if (startWasCancelled() || !captureStarted) {
					await devicePreparation;
					try {
						await discardActiveNativeCapture();
					} finally {
						cleanupCapturedMedia();
						await Promise.allSettled([
							stopMicFallbackRecorder(),
							stopWebcamRecorder(),
							// This also restores the Windows cursor hidden during browser startup.
							window.electronAPI.setRecordingState(false),
						]);
					}
				}
			} catch (error) {
				console.warn("Failed to clean up canceled recording startup:", error);
			}
			try {
				await window.electronAPI.finishRecordingStartup();
			} catch (error) {
				console.warn("Failed to release recording startup protection:", error);
			}
			setHudSourceSelectionActive(false);
			startInFlight.current = false;
			pendingStart.current = null;
			setStarting(false);
			finishStart();
		}
	};

	const cancelRecordingStart = useCallback(async () => {
		if (recordingActive.current) return false;
		const pending = pendingStart.current;
		if (!pending) return true;
		recordingStartGeneration.current += 1;
		await window.electronAPI.cancelCountdown();
		// Wait for native warm-up, webcam and microphone cleanup before picking again.
		await pending;
		if (nativeScreenRecording.current || pendingNativeCleanupPath.current)
			throw new Error("Could not stop the pending capture. Try again.");
		return true;
	}, []);

	/**
	 * Pause Windows content at its shared capture boundary and preserve the other native protocols.
	 * @returns No value; the scheduled transition finishes within the owning session.
	 */
	const pauseRecording = useCallback(() => {
		if (!recording || paused || nativeBoundaryInFlight.current) return;
		if (nativeWindowsRecording.current) {
			nativeBoundaryInFlight.current = true;
			void (async () => {
				try {
					const boundary = captureNow() + CAPTURE_BOUNDARY_LEAD_MS;
					const transition = window.electronAPI.pauseNativeScreenRecording(boundary);
					await atCaptureBoundary(boundary, () => {
						pauseMicFallbackRecorder();
						markRecordingPaused(boundary);
						setPaused(true);
					});
					const result = await transition;
					if (!result.success) toast.error("暂停同步采集失败，请结束本次录制。");
				} finally { nativeBoundaryInFlight.current = false; }
			})();
			return;
		}
		if (nativeScreenRecording.current) {
			void (async () => {
				const result = await window.electronAPI.pauseNativeScreenRecording();
				if (!result.success) {
					console.error("Failed to pause native screen recording:", result.error ?? result.message);
					return;
				}

				if (webcamRecorder.current?.state === "recording") {
					webcamRecorder.current.pause();
				}
				pauseMicFallbackRecorder();
				const boundaryMs = Date.now();
				markRecordingPaused(boundaryMs);
				setPaused(true);
				try {
					await window.electronAPI.pauseCursorCapture(boundaryMs);
				} catch (error) {
					console.warn("Failed to pause cursor capture:", error);
				}
			})();
			return;
		}
		if (mediaRecorder.current?.state === "recording") {
			mediaRecorder.current.pause();
			browserAudioTracks.current?.apply("pause");
			if (webcamRecorder.current?.state === "recording") {
				webcamRecorder.current.pause();
			}
			void (async () => {
				const boundaryMs = Date.now();
				markRecordingPaused(boundaryMs);
				setPaused(true);
				try {
					await window.electronAPI.pauseCursorCapture(boundaryMs);
				} catch (error) {
					console.warn("Failed to pause cursor capture:", error);
				}
			})();
		}
	}, [markRecordingPaused, pauseMicFallbackRecorder, paused, recording]);

	/**
	 * Resume Windows content on the same clock after its excluded pause interval.
	 * @returns No value; the scheduled transition finishes within the owning session.
	 */
	const resumeRecording = useCallback(() => {
		if (!recording || !paused || nativeBoundaryInFlight.current) return;
		if (nativeWindowsRecording.current) {
			nativeBoundaryInFlight.current = true;
			void (async () => {
				try {
					const boundary = captureNow() + CAPTURE_BOUNDARY_LEAD_MS;
					const transition = window.electronAPI.resumeNativeScreenRecording(boundary);
					await atCaptureBoundary(boundary, () => {
						resumeMicFallbackRecorder();
						markRecordingResumed(boundary);
						setPaused(false);
					});
					const result = await transition;
					if (!result.success) toast.error("恢复同步采集失败，请结束本次录制。");
				} finally { nativeBoundaryInFlight.current = false; }
			})();
			return;
		}
		if (nativeScreenRecording.current) {
			void (async () => {
				const result = await window.electronAPI.resumeNativeScreenRecording();
				if (!result.success) {
					console.error(
						"Failed to resume native screen recording:",
						result.error ?? result.message,
					);
					return;
				}

				if (webcamRecorder.current?.state === "paused") {
					webcamRecorder.current.resume();
				}
				resumeMicFallbackRecorder();
				const boundaryMs = Date.now();
				markRecordingResumed(boundaryMs);
				setPaused(false);
				try {
					await window.electronAPI.resumeCursorCapture(boundaryMs);
				} catch (error) {
					console.warn("Failed to resume cursor capture:", error);
				}
			})();
			return;
		}
		if (mediaRecorder.current?.state === "paused") {
			mediaRecorder.current.resume();
			browserAudioTracks.current?.apply("resume");
			if (webcamRecorder.current?.state === "paused") {
				webcamRecorder.current.resume();
			}
			void (async () => {
				const boundaryMs = Date.now();
				markRecordingResumed(boundaryMs);
				setPaused(false);
				try {
					await window.electronAPI.resumeCursorCapture(boundaryMs);
				} catch (error) {
					console.warn("Failed to resume cursor capture:", error);
				}
			})();
		}
	}, [markRecordingResumed, paused, recording, resumeMicFallbackRecorder]);

	/**
	 * 取消当前录制并阻止迟到的编码数据发布为新素材。
	 * @returns 无返回值；所属原生停止与文件清理沿录制任务收尾。
	 */
	const cancelRecording = useCallback(() => {
		recordingStartGeneration.current += 1;
		if (!recording) return;
		discardCurrentCapture.current.value = true;
		setPaused(false);
		markRecordingResumed(Date.now());

		// Discard webcam recording regardless of recording mode
		webcamChunks.current = [];
		if (webcamRecorder.current && webcamRecorder.current.state !== "inactive") {
			webcamRecorder.current.stop();
		}
		webcamRecorder.current = null;
		webcamStartTime.current = null;
		webcamTimeOffsetMs.current = 0;
		webcamStream.current?.getTracks().forEach((t) => t.stop());
		webcamStream.current = null;
		pendingWebcamPathPromise.current = null;
		resolvedWebcamPath.current = null;

		if (nativeScreenRecording.current) {
			setRecording(false);
			window.electronAPI?.setRecordingState(false);
			void (async () => {
				await Promise.allSettled([discardActiveNativeCapture(), stopMicFallbackRecorder()]);
				cleanupCapturedMedia();
			})();
			return;
		}

		if (mediaRecorder.current) {
			chunks.current = [];
			cleanupCapturedMedia();
			if (mediaRecorder.current.state !== "inactive") {
				mediaRecorder.current.stop();
			}
			setRecording(false);
			window.electronAPI?.setRecordingState(false);
		}
	}, [
		cleanupCapturedMedia,
		discardActiveNativeCapture,
		markRecordingResumed,
		setRecording,
		recording,
		stopMicFallbackRecorder,
	]);

	const toggleRecording = async () => {
		if (starting || countdownActive || finalizing) {
			return;
		}

		if (recording) {
			stopRecording.current();
			return;
		}

		startRecording();
	};

	return {
		starting,
		recording,
		paused,
		finalizing,
		countdownActive,
		toggleRecording,
		pauseRecording,
		resumeRecording,
		cancelRecording,
		cancelRecordingStart,
		preparePermissions,
		isMacOS,
		microphoneEnabled,
		setMicrophoneEnabled: persistMicrophoneEnabled,
		microphoneDeviceId,
		setMicrophoneDeviceId: persistMicrophoneDeviceId,
		systemAudioEnabled,
		setSystemAudioEnabled: persistSystemAudioEnabled,
		keyboardEnabled,
		setKeyboardEnabled,
		webcamEnabled,
		setWebcamEnabled: persistWebcamEnabled,
		webcamDeviceId,
		setWebcamDeviceId: persistWebcamDeviceId,
		countdownDelay,
		setCountdownDelay,
	};
}
