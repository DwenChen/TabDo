import { AdvancedSettings } from "./AdvancedSettings";
import { ZoomCameraControls, type ZoomCameraPatch } from './ZoomCameraControls';
import { hasWebcamFootage } from './mediaSegments';
import type { ZoomRegion } from './types';
import type { User } from "@supabase/supabase-js";
import { SettingsSections, SettingsCategory } from "./SettingsSections";
import { Card, Label } from "@heroui/react";
import { ProgressBar } from "@heroui/react";
import { ColorControl, ColorPalette } from "@presentation/components/ui/color-picker";
import {
	Palette,
	Trash as Trash2,
	UploadSimple as Upload
} from "@presentation/components/ui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@presentation/components/ui/toast";
import minimalCursorUrl from "@presentation/assets/cursors/custom/minimal-cursor.svg";
import { Button } from "@presentation/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@presentation/components/ui/select";
import { Switch } from "@presentation/components/ui/switch";
import { ChoiceGroup, ChoiceItem } from "@presentation/components/ui/choice-group";
import { useTheme } from "@presentation/contexts/ThemeContext";
import {
	getAssetPath,
	getRenderableVideoUrl,
	getWallpaperThumbnailUrl
} from "@presentation/lib/assetPath";
import { cn } from "@presentation/lib/utils";
import type { BuiltInWallpaper } from "@presentation/lib/wallpapers";
import {
	BUILT_IN_WALLPAPERS,
	getAvailableWallpapers,
	isVideoWallpaperSource
} from "@presentation/lib/wallpapers";
import { type AspectRatio } from "@presentation/utils/aspectRatioUtils";
import { useI18n, useScopedT } from "../../contexts/I18nContext";
import type { AppLocale } from "../../i18n/config";
import { SUPPORTED_LOCALES } from "../../i18n/config";
import { AnnotationSettingsPanel } from "./AnnotationSettingsPanel";
import CaptionListPanel from "./CaptionListPanel";
import type { CaptionRetimeSpan } from "./captionOps";
import { CURSOR_MOTION_PRESETS, type CursorMotionPresetId } from "./cursorMotionPresets";
import { loadEditorPreferences, saveEditorPreferences } from "./editorPreferences";
import { getDefaultBorderRadiusPercent } from "./projectPersistence";
import { createDefaultProjectEditor } from './editorDefaults';
import { SliderControl } from "./SliderControl";
import { WallpaperGrid } from "./WallpaperGrid";
import { useShortcuts } from "@presentation/contexts/ShortcutsContext";
import { SettingsRow } from "./SettingsRow";
import type {
	AnnotationRegion,
	AnnotationType,
	AutoCaptionAnimation,
	AutoCaptionSettings,
	CaptionCue,
	CropRegion,
	CursorClickEffectStyle,
	CursorStyle,
	EditorEffectSection,
	FigureData,
	Padding,
	WebcamOverlaySettings,
	ZoomDepth,
	ZoomMode,
	ZoomTransitionEasing
} from "./types";
import {
	ADVANCED_VERTICAL_PADDING_MAX,
	DEFAULT_AUTO_CAPTION_SETTINGS,
	DEFAULT_CURSOR_CLICK_BOUNCE_DURATION,
	DEFAULT_CURSOR_CLICK_EFFECT,
	DEFAULT_CURSOR_CLICK_EFFECT_COLOR,
	DEFAULT_CURSOR_CLICK_EFFECT_DURATION_MS,
	DEFAULT_CURSOR_CLICK_EFFECT_OPACITY,
	DEFAULT_CURSOR_CLICK_EFFECT_SCALE,
	DEFAULT_CURSOR_STYLE,
	DEFAULT_CURSOR_SWAY,
	DEFAULT_PADDING,
	DEFAULT_WEBCAM_REACT_TO_ZOOM,
	DEFAULT_WEBCAM_ROUNDNESS,
	DEFAULT_WEBCAM_SHADOW,
	DEFAULT_WEBCAM_SIZE,
	DEFAULT_ZOOM_IN_DURATION_MS,
	DEFAULT_CONNECTED_ZOOM_GAP_MS,
	DEFAULT_ZOOM_OUT_DURATION_MS
} from "./types";
import { fromCursorSwaySliderValue, toCursorSwaySliderValue } from "./videoPlayback/cursorSway";
import { isZeroPadding } from "./videoPlayback/layoutUtils";
import { getPreviewPlaybackRateRange } from "./videoPlayback/playbackRate";
import {
	cursorSetAssets,
	getCursorStyleSizeMultiplier
} from "./videoPlayback/uploadedCursorAssets";
import { WebcamCropControl } from "./WebcamCropControl";
import {
	getCropMatchedWebcamHeightPercent,
	normalizeWebcamCropRegion
} from "./webcamOverlay";

const tahoeCursorUrl = cursorSetAssets.tahoe.arrow.url;
const BUILTIN_CURSOR_PREVIEW_SIZE = 28;
const BUILTIN_CURSOR_PREVIEW_FRAME_SIZE = 48;

const GRADIENTS = [
	"linear-gradient( 111.6deg,  rgba(114,167,232,1) 9.4%, rgba(253,129,82,1) 43.9%, rgba(253,129,82,1) 54.8%, rgba(249,202,86,1) 86.3% )",
	"linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
	"radial-gradient( circle farthest-corner at 3.2% 49.6%,  rgba(80,12,139,0.87) 0%, rgba(161,10,144,0.72) 83.6% )",
	"linear-gradient( 111.6deg,  rgba(0,56,68,1) 0%, rgba(163,217,185,1) 51.5%, rgba(231, 148, 6, 1) 88.6% )",
	"linear-gradient( 107.7deg,  rgba(235,230,44,0.55) 8.4%, rgba(252,152,15,1) 90.3% )",
	"linear-gradient( 91deg,  rgba(72,154,78,1) 5.2%, rgba(251,206,70,1) 95.9% )",
	"radial-gradient( circle farthest-corner at 10% 20%,  rgba(2,37,78,1) 0%, rgba(4,56,126,1) 19.7%, rgba(85,245,221,1) 100.2% )",
	"linear-gradient( 109.6deg,  rgba(15,2,2,1) 11.2%, rgba(36,163,190,1) 91.1% )",
	"linear-gradient(135deg, #FBC8B4, #2447B1)",
	"linear-gradient(109.6deg, #F635A6, #36D860)",
	"linear-gradient(90deg, #FF0101, #4DFF01)",
	"linear-gradient(315deg, #EC0101, #5044A9)",
	"linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%)",
	"linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)",
	"linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
	"linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
	"linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
	"linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)",
	"linear-gradient(to right, #fa709a 0%, #fee140 100%)",
	"linear-gradient(to top, #30cfd0 0%, #330867 100%)",
	"linear-gradient(to top, #c471f5 0%, #fa71cd 100%)",
	"linear-gradient(to right, #f78ca0 0%, #f9748f 19%, #fd868c 60%, #fe9a8b 100%)",
	"linear-gradient(to top, #48c6ef 0%, #6f86d6 100%)",
	"linear-gradient(to right, #0acffe 0%, #495aff 100%)"
];

const CAPTION_ANIMATION_OPTIONS: Array<{ value: AutoCaptionAnimation; label: string }> = [
	{ value: "none", label: "关闭" },
	{ value: "fade", label: "淡入淡出" },
	{ value: "rise", label: "上移" },
	{ value: "pop", label: "弹入" }
];

const CLICK_EFFECT_COLOR_OPTIONS = [
	"#2563EB",
	"#EF4444",
	"#F59E0B",
	"#22C55E",
	"#A855F7",
	"#EC4899",
	"#14B8A6",
	"#F97316"
] as const;

type BackgroundTab = "image" | "video" | "color" | "gradient";
function isHexWallpaper(value: string): boolean {
	return /^#(?:[0-9a-f]{3}){1,2}$/i.test(value);
}

function hexToRgba(hex: string, alpha: number) {
	const normalized = isHexWallpaper(hex) ? hex : DEFAULT_CURSOR_CLICK_EFFECT_COLOR;
	const value =
		normalized.length === 4
			? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
			: normalized;
	const color = Number.parseInt(value.slice(1), 16);
	const red = (color >> 16) & 255;
	const green = (color >> 8) & 255;
	const blue = color & 255;
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getBackgroundTabForWallpaper(value: string): BackgroundTab {
	if (GRADIENTS.includes(value)) {
		return "gradient";
	}

	if (isHexWallpaper(value)) {
		return "color";
	}

	if (isVideoWallpaperSource(value)) {
		return "video";
	}

	return "image";
}

/**
 * 统一侧栏分组标题的实际像素字号。
 * @param props 分组标题内容。
 * @returns 使用十三像素字体的标题。
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
	return <span className="inspector-section-title">{children}</span>;
}

const CURSOR_CLICK_EFFECT_OPTIONS: Array<{
	id: CursorClickEffectStyle;
	label: string;
	description: string;
}> = [
	{
		id: "none",
		label: "关闭",
		description: "不显示点击动画，点击时保持光标稳定。"
	},
	{
		id: "spotlight",
		label: "聚光",
		description: "点击时在光标后方展开柔和脉冲。"
	},
	{
		id: "ripple",
		label: "波纹",
		description: "从点击位置向外扩散的同心圆。"
	},
	{
		id: "echo",
		label: "回响",
		description: "使用两层柔和圆环向外扩散，形成清晰的脉冲效果。"
	}
];

function CursorClickEffectPreview({
	effect,
	color = DEFAULT_CURSOR_CLICK_EFFECT_COLOR
}: {
	effect: CursorClickEffectStyle;
	color?: string;
}) {
	return (
		<div
			className="relative flex items-center justify-center"
			style={{
				width: `${BUILTIN_CURSOR_PREVIEW_FRAME_SIZE}px`,
				height: `${BUILTIN_CURSOR_PREVIEW_FRAME_SIZE}px`
			}}
		>
			{effect === "none" ? (
				<svg
					className="absolute h-10 w-10 text-foreground/40"
					viewBox="0 0 40 40"
					aria-hidden="true"
				>
					<circle
						cx="20"
						cy="20"
						r="11.5"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
						opacity="0.75"
					/>
					<path
						d="M12.5 27.5 27.5 12.5"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="2.2"
						opacity="0.92"
					/>
				</svg>
			) : null}
			{effect === "ripple" ? (
				<svg
					className="absolute h-12 w-12"
					style={{ color }}
					viewBox="0 0 48 48"
					aria-hidden="true"
				>
					<circle
						cx="24"
						cy="24"
						r="13"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						opacity="0.72"
					/>
				</svg>
			) : null}
			{effect === "spotlight" ? (
				<svg
					className="absolute h-12 w-12"
					style={{ color: hexToRgba(color, 0.92) }}
					viewBox="0 0 48 48"
					aria-hidden="true"
				>
					<g fill="none" stroke="currentColor">
						<circle cx="24" cy="24" r="13.5" strokeWidth="1.5" opacity="0.3" />
						<circle cx="24" cy="24" r="9.75" strokeWidth="1.7" opacity="0.56" />
					</g>
				</svg>
			) : null}
			{effect === "echo" ? (
				<svg
					className="absolute h-12 w-12"
					style={{ color: hexToRgba(color, 0.92) }}
					viewBox="0 0 48 48"
					aria-hidden="true"
				>
					<g fill="none" stroke="currentColor">
						<circle cx="24" cy="24" r="9" strokeWidth="1.8" opacity="0.72" />
						<circle cx="24" cy="24" r="14.5" strokeWidth="1.5" opacity="0.4" />
						<circle cx="24" cy="24" r="4.25" fill="currentColor" opacity="0.22" stroke="none" />
					</g>
				</svg>
			) : null}
		</div>
	);
}

function CursorClickEffectCards({
	title,
	activeEffectId,
	effectColor,
	onApply,
	tSettings
}: {
	title: string;
	activeEffectId: CursorClickEffectStyle;
	effectColor: string;
	onApply: (effectId: CursorClickEffectStyle) => void;
	tSettings: (key: string, fallback?: string) => string;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<Label>{title}</Label>
			</div>
			<ChoiceGroup
				type="single"
				value={activeEffectId}
				onValueChange={(value) => {
					if (value) {
						onApply(value as CursorClickEffectStyle);
					}
				}}
				className="grid grid-cols-4 gap-2"
				aria-label={title}
			>
				{CURSOR_CLICK_EFFECT_OPTIONS.map((effect) => {
					const label = tSettings(`effects.cursorClickEffects.${effect.id}.label`, effect.label);
					const description = tSettings(
						`effects.cursorClickEffects.${effect.id}.description`,
						effect.description
					);

					return (
						<ChoiceItem
							key={effect.id}
							value={effect.id}
							aria-label={label}
							title={`${label} - ${description}`}
							className={cn("group aspect-square h-auto min-w-0 p-3 text-left")}
						>
							<div className="flex h-full flex-col items-center justify-between gap-3">
								<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] px-2 py-1.5">
									<CursorClickEffectPreview effect={effect.id} color={effectColor} />
								</div>
							</div>
						</ChoiceItem>
					);
				})}
			</ChoiceGroup>
		</div>
	);
}

interface SettingsPanelProps {
	accountUser?: User | null;
	onShowOnboarding?: () => void;
	advanced?: boolean;
	onAdvancedChange?: (open: boolean) => void;
	resetRef?: React.RefObject<(() => void) | null>;
	onResetEditorSection?: (section: EditorEffectSection) => void;
	panelMode?: "editor" | "background";
	activeEffectSection?: EditorEffectSection;
	selected: string;
	onWallpaperChange: (path: string) => void;
	selectedZoomDepth?: ZoomDepth | null;
	selectedZoomRegion?: ZoomRegion;
	onZoomCameraChange?: (patch: ZoomCameraPatch) => void;
	onZoomDepthChange?: (depth: ZoomDepth) => void;
	selectedZoomId?: string | null;
	selectedZoomMode?: ZoomMode | null;
	onZoomModeChange?: (mode: ZoomMode) => void;
	onZoomDelete?: (id: string) => void;
	selectedClipId?: string | null;
	selectedClipSpeed?: number | null;
	selectedClipMuted?: boolean | null;
	selectedClipShowSourceAudio?: boolean;
	onClipShowSourceAudioChange?: (show: boolean) => void;
	hasClipAudioOverrides?: boolean;
	onResetClipAudio?: () => void;
	onClipSpeedChange?: (speed: number) => void;
	onClipMutedChange?: (muted: boolean) => void;
	onClipDelete?: (id: string) => void;
	selectedAudioId?: string | null;
	selectedAudioVolume?: number | null;
	selectedAudioNormalize?: boolean | null;
	onAudioVolumeChange?: (volume: number) => void;
	onAudioNormalizeChange?: (normalize: boolean) => void;
	onAudioDelete?: (id: string) => void;
	shadowIntensity?: number;
	onShadowChange?: (intensity: number) => void;
	backgroundBlur?: number;
	onBackgroundBlurChange?: (amount: number) => void;
	connectZooms?: boolean;
	onConnectZoomsChange?: (enabled: boolean) => void;
	autoApplyFreshRecordingAutoZooms?: boolean;
	onAutoApplyFreshRecordingAutoZoomsChange?: (enabled: boolean) => void;
	zoomInDurationMs?: number;
	onZoomInDurationMsChange?: (duration: number) => void;
	zoomInOverlapMs?: number;
	onZoomInOverlapMsChange?: (duration: number) => void;
	zoomOutDurationMs?: number;
	onZoomOutDurationMsChange?: (duration: number) => void;
	connectedZoomGapMs?: number;
	onConnectedZoomGapMsChange?: (duration: number) => void;
	connectedZoomDurationMs?: number;
	onConnectedZoomDurationMsChange?: (duration: number) => void;
	zoomInEasing?: ZoomTransitionEasing;
	onZoomInEasingChange?: (easing: ZoomTransitionEasing) => void;
	zoomOutEasing?: ZoomTransitionEasing;
	onZoomOutEasingChange?: (easing: ZoomTransitionEasing) => void;
	connectedZoomEasing?: ZoomTransitionEasing;
	onConnectedZoomEasingChange?: (easing: ZoomTransitionEasing) => void;
	showCursor?: boolean;
	onShowCursorChange?: (enabled: boolean) => void;
	loopCursor?: boolean;
	onLoopCursorChange?: (enabled: boolean) => void;
	cursorStyle?: CursorStyle;
	onCursorStyleChange?: (style: CursorStyle) => void;
	cursorSize?: number;
	onCursorSizeChange?: (size: number) => void;
	cursorSmoothing?: number;
	onCursorSmoothingChange?: (smoothing: number) => void;
	cursorSpringStiffnessMultiplier?: number;
	onCursorSpringStiffnessMultiplierChange?: (multiplier: number) => void;
	cursorSpringDampingMultiplier?: number;
	onCursorSpringDampingMultiplierChange?: (multiplier: number) => void;
	cursorSpringMassMultiplier?: number;
	onCursorSpringMassMultiplierChange?: (multiplier: number) => void;
	cameraSpringStiffnessMultiplier?: number;
	onCameraSpringStiffnessMultiplierChange?: (multiplier: number) => void;
	cameraSpringDampingMultiplier?: number;
	onCameraSpringDampingMultiplierChange?: (multiplier: number) => void;
	cameraSpringMassMultiplier?: number;
	onCameraSpringMassMultiplierChange?: (multiplier: number) => void;
	zoomClassicMode?: boolean;
	onZoomClassicModeChange?: (enabled: boolean) => void;
	cursorClickEffect?: CursorClickEffectStyle;
	onCursorClickEffectChange?: (effect: CursorClickEffectStyle) => void;
	cursorClickEffectColor?: string;
	onCursorClickEffectColorChange?: (color: string) => void;
	cursorClickEffectScale?: number;
	onCursorClickEffectScaleChange?: (scale: number) => void;
	cursorClickEffectOpacity?: number;
	onCursorClickEffectOpacityChange?: (opacity: number) => void;
	cursorClickEffectDurationMs?: number;
	onCursorClickEffectDurationMsChange?: (duration: number) => void;
	cursorClickBounce?: number;
	onCursorClickBounceChange?: (amount: number) => void;
	cursorClickBounceDuration?: number;
	onCursorClickBounceDurationChange?: (duration: number) => void;
	cursorSway?: number;
	onCursorSwayChange?: (amount: number) => void;
	borderRadius?: number;
	backgroundBorderRadius?: number;
	onBackgroundBorderRadiusChange?: (value: number) => void;
	onBorderRadiusChange?: (radius: number) => void;
	webcam?: WebcamOverlaySettings;
	webcamPreviewSrc?: string | null;
	webcamPreviewCurrentTime?: number;
	webcamPreviewPlaying?: boolean;
	onWebcamChange?: (webcam: WebcamOverlaySettings) => void;
	onUploadWebcam?: () => void;
		padding?: Padding;
	onPaddingChange?: (padding: Padding) => void;
	cropRegion?: CropRegion;
	onCropChange?: (region: CropRegion) => void;
	aspectRatio: AspectRatio;
	onAspectRatioChange?: (ratio: AspectRatio) => void;
	selectedAnnotationId?: string | null;
	annotationRegions?: AnnotationRegion[];
	onAnnotationContentChange?: (id: string, content: string) => void;
	onAnnotationTypeChange?: (id: string, type: AnnotationType) => void;
	onAnnotationRotationChange?: (id: string, rotation: number) => void;
	onAnnotationStyleChange?: (id: string, style: Partial<AnnotationRegion["style"]>) => void;
	onAnnotationFigureDataChange?: (id: string, figureData: FigureData) => void;
	onAnnotationBlurIntensityChange?: (id: string, intensity: number) => void;
	onAnnotationBlurColorChange?: (id: string, color: string) => void;
	onAnnotationDelete?: (id: string) => void;
	autoCaptions?: CaptionCue[];
	autoCaptionSettings?: AutoCaptionSettings;
	whisperExecutablePath?: string | null;
	whisperModelPath?: string | null;
	whisperModelDownloadStatus?: "idle" | "downloading" | "downloaded" | "error";
	whisperModelDownloadProgress?: number;
	isGeneratingCaptions?: boolean;
	onAutoCaptionSettingsChange?: (settings: AutoCaptionSettings) => void;
	onPickWhisperExecutable?: () => void;
	onPickWhisperModel?: () => void;
	onGenerateAutoCaptions?: () => void;
	onClearAutoCaptions?: () => void;
	onDownloadWhisperSmallModel?: () => void;
	onDeleteWhisperSmallModel?: () => void;
	captionCurrentTimeMs?: number;
	selectedCaptionId?: string | null;
	onBeginCaptionEdit?: (id: string) => void;
	onCaptionTextEdit?: (id: string, text: string) => void;
	onCaptionRetime?: (id: string, span: CaptionRetimeSpan) => void;
	onCaptionSplit?: (id: string, atMs: number) => void;
	onCaptionMerge?: (idA: string, idB: string) => void;
	onCaptionDelete?: (id: string) => void;
	nativeCaptureUnavailableSession?: boolean;
	onOpenNativeCaptureUnavailableModal?: () => void;
}

type CursorStyleOption = { value: CursorStyle; label: string };

type WallpaperTile = {
	key: string;
	label: string;
	value: string;
	previewUrl: string;
};

const BUILTIN_CURSOR_STYLE_OPTIONS: CursorStyleOption[] = [
	{ value: "macos", label: "macOS" },
	{ value: "tahoe", label: "金门" },
	{ value: "tahoe-inverted", label: "反色金门" },
	{ value: "windows11", label: "Windows 11" },
	{ value: "dot", label: "圆点" },
	{ value: "figma", label: "极简" }
];

const CAPTION_LANGUAGE_OPTIONS = [
	{ value: "auto", label: "自动检测" },
	{ value: "en", label: "英语" },
	{ value: "es", label: "西班牙语" },
	{ value: "fr", label: "法语" },
	{ value: "de", label: "德语" },
	{ value: "it", label: "意大利语" },
	{ value: "pt", label: "葡萄牙语" },
	{ value: "zh", label: "中文（简体）" },
	{ value: "ja", label: "日语" },
	{ value: "ko", label: "韩语" }
] as const;

const APP_LANGUAGE_LABELS: Record<AppLocale, string> = {
	en: "英语",
	es: "Español",
	fr: "Français",
	de: "Deutsch",
	it: "Italiano",
	nl: "Nederlands",
	ko: "한국어",
	"pt-BR": "Português",
	"zh-CN": "簡體中文",
	"zh-TW": "繁體中文"
};

function loadPreviewImage(url: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Failed to load preview asset: ${url}`));
		image.src = url;
	});
}

function trimCanvasToAlpha(canvas: HTMLCanvasElement, hotspot?: { x: number; y: number }) {
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return {
			dataUrl: canvas.toDataURL("image/png"),
			width: canvas.width,
			height: canvas.height,
			hotspot
		};
	}

	const { width, height } = canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const { data } = imageData;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const alpha = data[(y * width + x) * 4 + 3];
			if (alpha === 0) {
				continue;
			}

			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}

	if (maxX < minX || maxY < minY) {
		return {
			dataUrl: canvas.toDataURL("image/png"),
			width,
			height,
			hotspot
		};
	}

	const croppedWidth = maxX - minX + 1;
	const croppedHeight = maxY - minY + 1;
	const croppedCanvas = document.createElement("canvas");
	croppedCanvas.width = croppedWidth;
	croppedCanvas.height = croppedHeight;
	const croppedCtx = croppedCanvas.getContext("2d")!;
	croppedCtx.drawImage(
		canvas,
		minX,
		minY,
		croppedWidth,
		croppedHeight,
		0,
		0,
		croppedWidth,
		croppedHeight
	);

	return {
		dataUrl: croppedCanvas.toDataURL("image/png"),
		width: croppedWidth,
		height: croppedHeight,
		hotspot: hotspot
			? {
					x: hotspot.x - minX,
					y: hotspot.y - minY
				}
			: undefined
	};
}

async function createTrimmedSvgPreview(
	url: string,
	sampleSize: number,
	trim?: { x: number; y: number; width: number; height: number }
) {
	const image = await loadPreviewImage(url);
	const sourceCanvas = document.createElement("canvas");
	sourceCanvas.width = sampleSize;
	sourceCanvas.height = sampleSize;
	const sourceCtx = sourceCanvas.getContext("2d")!;
	sourceCtx.drawImage(image, 0, 0, sampleSize, sampleSize);

	if (trim) {
		const croppedCanvas = document.createElement("canvas");
		croppedCanvas.width = trim.width;
		croppedCanvas.height = trim.height;
		const croppedCtx = croppedCanvas.getContext("2d")!;
		croppedCtx.drawImage(
			sourceCanvas,
			trim.x,
			trim.y,
			trim.width,
			trim.height,
			0,
			0,
			trim.width,
			trim.height
		);
		return croppedCanvas.toDataURL("image/png");
	}

	return trimCanvasToAlpha(sourceCanvas).dataUrl;
}

async function createInvertedPreview(url: string) {
	const image = await loadPreviewImage(url);
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(image, 0, 0);
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const { data } = imageData;
	for (let index = 0; index < data.length; index += 4) {
		if (data[index + 3] === 0) {
			continue;
		}
		data[index] = 255 - data[index];
		data[index + 1] = 255 - data[index + 1];
		data[index + 2] = 255 - data[index + 2];
	}
	ctx.putImageData(imageData, 0, 0);
	return canvas.toDataURL("image/png");
}

function CursorStylePreview({
	style,
	previewUrls,
	frameSize = BUILTIN_CURSOR_PREVIEW_FRAME_SIZE,
	previewSize
}: {
	style: CursorStyle;
	previewUrls: Partial<Record<string, string>>;
	frameSize?: number;
	previewSize?: number;
}) {
	const previewSrc =
		style === "macos"
			? (previewUrls.macos ?? tahoeCursorUrl)
			: style === "tahoe"
				? (previewUrls.tahoe ?? tahoeCursorUrl)
				: style === "windows11"
					? (previewUrls.windows11 ?? tahoeCursorUrl)
					: style === "figma"
						? (previewUrls.figma ?? minimalCursorUrl)
						: style === "tahoe-inverted"
							? (previewUrls["tahoe-inverted"] ?? tahoeCursorUrl)
							: previewUrls[style];

	if (
		style === "macos" ||
		style === "tahoe" ||
		style === "tahoe-inverted" ||
		style === "windows11"
	) {
		const resolvedPreviewSize =
			(previewSize ?? BUILTIN_CURSOR_PREVIEW_SIZE) *
			(style === "windows11" ? 1 : getCursorStyleSizeMultiplier(style));
		return (
			<div
				className="flex items-center justify-center"
				style={{
					width: `${frameSize}px`,
					height: `${frameSize}px`
				}}
			>
				<img
					src={previewSrc ?? tahoeCursorUrl}
					alt=""
					className="max-w-none object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.18)]"
					draggable={false}
					style={{
						width: `${resolvedPreviewSize}px`,
						height: `${resolvedPreviewSize}px`
					}}
				/>
			</div>
		);
	}

	if (style === "figma") {
		const resolvedPreviewSize = previewSize ?? 28;
		return (
			<div
				className="flex items-center justify-center"
				style={{ width: `${frameSize}px`, height: `${frameSize}px` }}
			>
				<img
					src={previewSrc}
					alt=""
					className="object-contain"
					draggable={false}
					style={{
						width: `${resolvedPreviewSize}px`,
						height: `${resolvedPreviewSize}px`
					}}
				/>
			</div>
		);
	}

	if (style === "dot") {
		const resolvedPreviewSize = previewSize ?? 14;
		return (
			<div
				className="flex items-center justify-center"
				style={{ width: `${frameSize}px`, height: `${frameSize}px` }}
			>
				<span
					className="rounded-full border-[2.5px] border-neutral-800 bg-white shadow-[0_8px_12px_rgba(15,23,42,0.16)]"
					style={{
						width: `${resolvedPreviewSize}px`,
						height: `${resolvedPreviewSize}px`
					}}
				/>
			</div>
		);
	}

	const resolvedPreviewSize = previewSize ?? 28;
	return (
		<div
			className="flex items-center justify-center"
			style={{ width: `${frameSize}px`, height: `${frameSize}px` }}
		>
			<img
				src={previewSrc ?? tahoeCursorUrl}
				alt=""
				className="object-contain"
				draggable={false}
				style={{ width: `${resolvedPreviewSize}px`, height: `${resolvedPreviewSize}px` }}
			/>
		</div>
	);
}

/**
 * 按编辑任务显示设置，保持普通内容顺序并将高级选项集中到底部。
 * @param props 当前效果参数、平台能力及更新操作。
 * @returns 当前设置正文。
 */
export function SettingsPanel({
	accountUser = null,
	advanced = false,
	onAdvancedChange,
	resetRef,
	onResetEditorSection,
	panelMode = "editor",
	activeEffectSection: activeEffectSectionProp,
	selected,
	onWallpaperChange,
	selectedZoomRegion,
	onZoomCameraChange,
	selectedZoomId,
	selectedZoomMode,
	onZoomModeChange,
	onZoomDelete,
	selectedClipId,
	selectedClipSpeed,
	onClipSpeedChange,
	onClipDelete,
	selectedAudioId,
	selectedAudioVolume,
	selectedAudioNormalize,
	onAudioVolumeChange,
	onAudioNormalizeChange,
	onAudioDelete,
	shadowIntensity = 0.67,
	onShadowChange,
	backgroundBlur = 0,
	onBackgroundBlurChange,
	connectZooms = true,
	onConnectZoomsChange,
	connectedZoomGapMs = DEFAULT_CONNECTED_ZOOM_GAP_MS,
	onConnectedZoomGapMsChange,
	autoApplyFreshRecordingAutoZooms = true,
	onAutoApplyFreshRecordingAutoZoomsChange,
	zoomInDurationMs = DEFAULT_ZOOM_IN_DURATION_MS,
	onZoomInDurationMsChange,
	zoomOutDurationMs = DEFAULT_ZOOM_OUT_DURATION_MS,
	onZoomOutDurationMsChange,
	showCursor = false,
	onShowCursorChange,
	loopCursor = false,
	onLoopCursorChange,
	cursorStyle = DEFAULT_CURSOR_STYLE,
	onCursorStyleChange,
	cursorSize = 5,
	onCursorSizeChange,
	cursorSmoothing = 2,
	onCursorSmoothingChange,
	cursorSpringStiffnessMultiplier = 1,
	onCursorSpringStiffnessMultiplierChange,
	cursorSpringDampingMultiplier = 1,
	onCursorSpringDampingMultiplierChange,
	cursorSpringMassMultiplier = 1,
	onCursorSpringMassMultiplierChange,
	cameraSpringStiffnessMultiplier = 1,
	onCameraSpringStiffnessMultiplierChange,
	cameraSpringDampingMultiplier = 1.13,
	onCameraSpringDampingMultiplierChange,
	cameraSpringMassMultiplier = 1.12,
	onCameraSpringMassMultiplierChange,
	onZoomClassicModeChange,
	cursorClickEffect = DEFAULT_CURSOR_CLICK_EFFECT,
	onCursorClickEffectChange,
	cursorClickEffectColor = DEFAULT_CURSOR_CLICK_EFFECT_COLOR,
	onCursorClickEffectColorChange,
	cursorClickEffectScale = DEFAULT_CURSOR_CLICK_EFFECT_SCALE,
	onCursorClickEffectScaleChange,
	cursorClickEffectOpacity = DEFAULT_CURSOR_CLICK_EFFECT_OPACITY,
	onCursorClickEffectOpacityChange,
	cursorClickEffectDurationMs = DEFAULT_CURSOR_CLICK_EFFECT_DURATION_MS,
	onCursorClickEffectDurationMsChange,
	cursorClickBounce = 1,
	onCursorClickBounceChange,
	cursorClickBounceDuration = DEFAULT_CURSOR_CLICK_BOUNCE_DURATION,
	onCursorClickBounceDurationChange,
	cursorSway = DEFAULT_CURSOR_SWAY,
	onCursorSwayChange,
	borderRadius = getDefaultBorderRadiusPercent(),
	backgroundBorderRadius = 0,
	onBackgroundBorderRadiusChange,
	onBorderRadiusChange,
	webcam,
	webcamPreviewSrc = null,
	webcamPreviewCurrentTime = 0,
	webcamPreviewPlaying = false,
	onWebcamChange,
	onUploadWebcam,
	padding = DEFAULT_PADDING,
	onPaddingChange,
	aspectRatio,
	onAspectRatioChange,
	selectedAnnotationId,
	annotationRegions = [],
	onAnnotationContentChange,
	onAnnotationTypeChange,
	onAnnotationStyleChange,
	onAnnotationRotationChange,
	onAnnotationFigureDataChange,
	onAnnotationBlurIntensityChange,
	onAnnotationBlurColorChange,
	onAnnotationDelete,
	autoCaptions = [],
	autoCaptionSettings = DEFAULT_AUTO_CAPTION_SETTINGS,
	whisperModelPath,
	whisperModelDownloadStatus = "idle",
	whisperModelDownloadProgress = 0,
	isGeneratingCaptions = false,
	onAutoCaptionSettingsChange,
	onPickWhisperModel,
	onGenerateAutoCaptions,
	onClearAutoCaptions,
	onDownloadWhisperSmallModel,
	onDeleteWhisperSmallModel,
	captionCurrentTimeMs = 0,
	selectedCaptionId = null,
	onBeginCaptionEdit,
	onCaptionTextEdit,
	onCaptionRetime,
	onCaptionSplit,
	onCaptionMerge,
	onCaptionDelete,
	nativeCaptureUnavailableSession = false,
	onOpenNativeCaptureUnavailableModal,
}: SettingsPanelProps) {
	const tSettings = useScopedT("settings");
	const { locale, setLocale, t } = useI18n();
	const { preference: themePreference, setPreference: setThemePreference } = useTheme();
	const isBackgroundPanel = panelMode === "background";
	const initialEditorPreferences = useMemo(() => loadEditorPreferences(), []);
	const defaultEditor = useMemo(createDefaultProjectEditor, []);
	const clipSpeedRange = useMemo(getPreviewPlaybackRateRange, []);
	const [builtInWallpapers, setBuiltInWallpapers] =
		useState<BuiltInWallpaper[]>(BUILT_IN_WALLPAPERS);
	const [wallpaperPreviewPaths, setWallpaperPreviewPaths] = useState<string[]>([]);
	const [customImages, setCustomImages] = useState<string[]>(
		initialEditorPreferences.customWallpapers
	);
	const [experimentalUpdatesEnabled, setExperimentalUpdatesEnabled] = useState(false);
	const [savingExperimentalUpdates, setSavingExperimentalUpdates] = useState(false);
	const { openConfig: openShortcutsConfig } = useShortcuts();
	const [internalActiveEffectSection] = useState<EditorEffectSection>("scene");
	const activeEffectSection = activeEffectSectionProp ?? internalActiveEffectSection;
	const removeBackgroundStateRef = useRef<{
		aspectRatio: AspectRatio;
		padding: Padding;
	} | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const builtInWallpaperPaths = useMemo(
		() => builtInWallpapers.map((wallpaper) => wallpaper.publicPath),
		[builtInWallpapers]
	);
	const captionCueCount = autoCaptions.length;
	const updateAutoCaptionSettings = (partial: Partial<AutoCaptionSettings>) => {
		onAutoCaptionSettingsChange?.({
			...autoCaptionSettings,
			...partial
		});
	};

	useEffect(() => {
		let cancelled = false;
		void window.electronAPI
			.getExperimentalUpdatesEnabled()
			.then((enabled) => {
				if (!cancelled) setExperimentalUpdatesEnabled(enabled);
			})
			.catch((error) => {
				console.error("Failed to load experimental updates preference:", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const updateExperimentalUpdatesPreference = async (enabled: boolean) => {
		const previousValue = experimentalUpdatesEnabled;
		setExperimentalUpdatesEnabled(enabled);
		setSavingExperimentalUpdates(true);
		try {
			const result = await window.electronAPI.setExperimentalUpdatesEnabled(enabled);
			setExperimentalUpdatesEnabled(result.enabled);
			if (!result.success) {
				toast.error(
					result.error || tSettings("updates.saveFailed", "Failed to change the update channel.")
				);
			}
		} catch (error) {
			setExperimentalUpdatesEnabled(previousValue);
			toast.error(
				`${tSettings("updates.saveFailed", "Failed to change the update channel.")} ${String(error)}`
			);
		} finally {
			setSavingExperimentalUpdates(false);
		}
	};

	useEffect(() => {
		if (
			!isBackgroundPanel &&
			activeEffectSection !== "scene" &&
			activeEffectSection !== "frame" &&
			activeEffectSection !== "crop" &&
			activeEffectSection !== "extensions" &&
			!activeEffectSection.startsWith("ext:")
		) {
			return;
		}

		let mounted = true;
		(async () => {
			try {
				const availableWallpapers = await getAvailableWallpapers();
				const resolved = await Promise.all(
					availableWallpapers.map(async (wallpaper) => {
						const assetUrl = await getAssetPath(wallpaper.relativePath);
						// Use tiny thumbnails for the grid; full-res loads on selection
						if (isVideoWallpaperSource(wallpaper.publicPath)) {
							return getRenderableVideoUrl(assetUrl);
						}
						return getWallpaperThumbnailUrl(assetUrl);
					})
				);
				if (mounted) {
					setBuiltInWallpapers(availableWallpapers);
					setWallpaperPreviewPaths(resolved);
				}
			} catch {
				if (mounted) {
					setBuiltInWallpapers(BUILT_IN_WALLPAPERS);
					setWallpaperPreviewPaths(BUILT_IN_WALLPAPERS.map((wallpaper) => wallpaper.publicPath));
				}
			}
		})();
		return () => {
			mounted = false;
		};
	}, [activeEffectSection, isBackgroundPanel]);

	const colorPalette = [
		"#FF0000",
		"#FFD700",
		"#00FF00",
		"#FFFFFF",
		"#0000FF",
		"#FF6B00",
		"#9B59B6",
		"#E91E63",
		"#00BCD4",
		"#FF5722",
		"#8BC34A",
		"#FFC107",
		"#2563EB",
		"#000000",
		"#607D8B",
		"#795548"
	];

	const [selectedColor, setSelectedColor] = useState(
		isHexWallpaper(selected) ? selected : "#ADADAD"
	);
	const [gradient, setGradient] = useState<string>(
		GRADIENTS.includes(selected) ? selected : GRADIENTS[0]
	);
	const removeBackgroundEnabled = aspectRatio === "native" && isZeroPadding(padding);

	const [backgroundTab, setBackgroundTab] = useState<BackgroundTab>(() =>
		getBackgroundTabForWallpaper(selected)
	);

	const [webcamAspectLocked, setWebcamAspectLocked] = useState(true);
	const [builtInCursorPreviewUrls, setBuiltInCursorPreviewUrls] = useState<
		Partial<Record<string, string>>
	>({});

	const cursorPreviewUrls = builtInCursorPreviewUrls;
	const showDevMotionControls = import.meta.env.DEV;
	const cursorStyleOptions = BUILTIN_CURSOR_STYLE_OPTIONS;

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const macosPreview = cursorSetAssets.macos.arrow.url;
				const tahoePreview = cursorSetAssets.tahoe.arrow.url;
				const [windows11Preview, minimalPreview] = await Promise.all([
					createTrimmedSvgPreview(cursorSetAssets.windows11.arrow.url, 512),
					createTrimmedSvgPreview(minimalCursorUrl, 512)
				]);
				const invertedPreview = await createInvertedPreview(tahoePreview);

				if (!cancelled) {
					setBuiltInCursorPreviewUrls({
						macos: macosPreview,
						tahoe: tahoePreview,
						windows11: windows11Preview,
						figma: minimalPreview,
						"tahoe-inverted": invertedPreview
					});
				}
			} catch {
				if (!cancelled) {
					setBuiltInCursorPreviewUrls({
						macos: tahoeCursorUrl,
						tahoe: tahoeCursorUrl,
						windows11: tahoeCursorUrl,
						figma: minimalCursorUrl,
						"tahoe-inverted": tahoeCursorUrl
					});
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		setBackgroundTab(getBackgroundTabForWallpaper(selected));

		if (isHexWallpaper(selected)) {
			setSelectedColor(selected);
		}

		if (GRADIENTS.includes(selected)) {
			setGradient(selected);
		}
	}, [selected]);

	useEffect(() => {
		if (selected.startsWith("data:image")) {
			setCustomImages((prev) => (prev.includes(selected) ? prev : [selected, ...prev]));
			return;
		}

		const isKnownWallpaper =
			builtInWallpaperPaths.includes(selected) || wallpaperPreviewPaths.includes(selected);

		if (!isKnownWallpaper && isVideoWallpaperSource(selected)) {
			setCustomImages((prev) => (prev.includes(selected) ? prev : [selected, ...prev]));
		}
	}, [builtInWallpaperPaths, selected, wallpaperPreviewPaths]);

	const imageWallpaperTiles = useMemo<WallpaperTile[]>(() => {
		const imageWallpapers = builtInWallpapers.filter(
			(wallpaper) => !isVideoWallpaperSource(wallpaper.publicPath)
		);
		const builtInTiles = (
			wallpaperPreviewPaths.length > 0 ? wallpaperPreviewPaths : builtInWallpaperPaths
		)
			.filter((path) => !isVideoWallpaperSource(path))
			.map((previewPath, index) => {
				const wallpaper = imageWallpapers[index];
				return {
					key: wallpaper ? `builtin/${wallpaper.id}` : previewPath,
					label: wallpaper?.label ?? `Wallpaper ${index + 1}`,
					value: wallpaper?.publicPath ?? previewPath,
					previewUrl: wallpaperPreviewPaths.length ? previewPath : ""
				};
			});

		return builtInTiles;
	}, [builtInWallpaperPaths, builtInWallpapers, wallpaperPreviewPaths]);

	const videoWallpaperTiles = useMemo<WallpaperTile[]>(() => {
		const builtInTiles = builtInWallpapers
			.filter((wallpaper) => isVideoWallpaperSource(wallpaper.publicPath))
			.map((wallpaper) => ({
				key: `builtin/${wallpaper.id}`,
				label: wallpaper.label,
				value: wallpaper.publicPath,
				previewUrl: wallpaper.publicPath
			}));

		return builtInTiles;
	}, [builtInWallpapers]);

	useEffect(() => {
		saveEditorPreferences({ customWallpapers: customImages });
	}, [customImages]);

	const handleRemoveBackgroundToggle = (checked: boolean) => {
		if (checked) {
			removeBackgroundStateRef.current = {
				aspectRatio,
				padding
			};
			onAspectRatioChange?.("native");
			onPaddingChange?.({ top: 0, bottom: 0, left: 0, right: 0, linked: padding.linked });
			return;
		}

		const previousState = removeBackgroundStateRef.current;
		if (previousState) {
			onAspectRatioChange?.(previousState.aspectRatio);
			onPaddingChange?.(previousState.padding);
			removeBackgroundStateRef.current = null;
			return;
		}

		// Fallback if the project loaded in a "background removed" state already
		onAspectRatioChange?.(defaultEditor.aspectRatio);
		onPaddingChange?.({ ...DEFAULT_PADDING });
	};

	/**
	 * 切换四边联动，重新联动时以均值保持画面稳定。
	 * @returns 无返回值；发布已有四边值及联动选择。
	 */
	const togglePaddingLink = () => {
		const isLinked = padding.linked !== false;
		const nextLinked = !isLinked;
		if (nextLinked) {
			// Compute average for relinking to avoid sudden shifts
			const avg = Math.round((padding.top + padding.bottom + padding.left + padding.right) / 4);
			onPaddingChange?.({
				top: avg,
				bottom: avg,
				left: avg,
				right: avg,
				linked: true
			});
		} else {
			onPaddingChange?.({
				...padding,
				linked: false
			});
		}
	};

	/**
	 * 按联动状态修改内边距，独立模式只更新指定边。
	 * @param side 被调整的边。
	 * @param value 百分比数值。
	 * @returns 无返回值；沿既有项目及撤销链发布布局。
	 */
	const handlePaddingSideChange = (side: "top" | "bottom" | "left" | "right", value: number) => {
		if (padding.linked !== false) {
			onPaddingChange?.({
				top: value,
				bottom: value,
				left: value,
				right: value,
				linked: true
			});
		} else {
			onPaddingChange?.({
				...padding,
				[side]: value
			});
		}
	};

	const webcamFileName = webcam?.sourcePath?.split(/[\\/]/).pop() ?? null;
	const hasCameraFootage = hasWebcamFootage(webcam);
	const visibleColorPalette = colorPalette.slice(0, 15);

	const webcamWidth = webcam?.width ?? webcam?.size ?? DEFAULT_WEBCAM_SIZE;
	const webcamHeight = webcam?.height ?? webcam?.size ?? DEFAULT_WEBCAM_SIZE;
	const webcamCrop = normalizeWebcamCropRegion(webcam?.cropRegion);

	const getWallpaperTileState = (candidateValue: string, previewPath?: string) => {
		if (!selected) return false;
		if (selected === candidateValue || (previewPath && selected === previewPath)) return true;
		try {
			const clean = (s: string) => s.replace(/^file:\/\//, "").replace(/^\//, "");
			if (clean(selected).endsWith(clean(candidateValue))) return true;
			if (clean(candidateValue).endsWith(clean(selected))) return true;
			if (previewPath && clean(selected).endsWith(clean(previewPath))) return true;
			if (previewPath && clean(previewPath).endsWith(clean(selected))) return true;
		} catch {
			return false;
		}
		return false;
	};

	const wallpaperTileClass = (isSelected: boolean) =>
		cn(
			"group relative aspect-[4/3] h-auto w-full min-w-0 overflow-hidden rounded-md p-1",
			isSelected && "opacity-70"
		);


	// 运动效果按缩放时长识别，不受用户单独调整光标外观的影响。
	const activeMotionEffect =
		zoomInDurationMs <= 200 && zoomOutDurationMs <= 200 ? "focused" : "smooth";

	/**
	 * 为当前项目应用缩放运动效果，并退出旧的经典动画模式。
	 * @param effect 用户选择的平滑或专注效果。
	 * @returns 无返回值；当前项目沿现有保存链更新。
	 */
	const applyMotionEffect = (effect: CursorMotionPresetId) => {
		const preset = CURSOR_MOTION_PRESETS[effect];
		onZoomClassicModeChange?.(false);
		onZoomInDurationMsChange?.(preset.zoomInDurationMs);
		onZoomOutDurationMsChange?.(preset.zoomOutDurationMs);
	};

	// 重置只恢复当前分类的出厂选项，本地控件状态同步回到初始状态。
	useEffect(() => {
		if (!resetRef) return;
		resetRef.current = () => {
			if (activeEffectSection === "webcam") setWebcamAspectLocked(true);
			if (["scene", "frame", "crop"].includes(activeEffectSection)) removeBackgroundStateRef.current = null;
			onResetEditorSection?.(activeEffectSection);
		};
		return () => { resetRef.current = null; };
	});

	const updateWebcam = (patch: Partial<WebcamOverlaySettings>) => {
		if (!webcam || !onWebcamChange) return;
		onWebcamChange({ ...webcam, ...patch });
	};

	/**
	 * 联动缩放当前人像宽高，在边界处保持现有比例。
	 * @param factor 相对当前宽高的缩放倍率。
	 * @returns 无返回值，更新所属项目的人像尺寸。
	 */
	const scaleWebcam = (factor: number) => {
		const safe = Math.min(
			100 / Math.max(webcamWidth, webcamHeight),
			Math.max(10 / Math.min(webcamWidth, webcamHeight), factor)
		);
		updateWebcam({
			dimensionsMode: "manual",
			width: webcamWidth * safe,
			height: webcamHeight * safe,
			size: webcamWidth * safe
		});
	};

	const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (!files || files.length === 0) return;

		const file = files[0];

		// Validate file type - only allow JPG/JPEG
		const validTypes = ["image/jpeg", "image/jpg"];
		if (!validTypes.includes(file.type)) {
			toast.error(tSettings("background.uploadError"), {
				description: tSettings("background.uploadErrorDescription")
			});
			event.target.value = "";
			return;
		}

		const reader = new FileReader();

		reader.onload = (e) => {
			const dataUrl = e.target?.result as string;
			if (dataUrl) {
				setCustomImages((prev) => [...prev, dataUrl]);
				onWallpaperChange(dataUrl);
				toast.success(tSettings("background.uploadSuccess"));
			}
		};

		reader.onerror = () => {
			toast.error(t("common.errors.failedToUploadImage"), {
				description: t("common.errors.fileReadError")
			});
		};

		reader.readAsDataURL(file);
		// Reset input so the same file can be selected again
		event.target.value = "";
	};

	const handleVideoUpload = async () => {
		try {
			const result = await window.electronAPI.openVideoFilePicker();
			if (!result?.success || !result.path) return;
			const filePath = result.path;
			if (!isVideoWallpaperSource(filePath)) {
				toast.error("不支持的格式", {
					description: "请选择视频文件（MP4、WebM、MOV 等）"
				});
				return;
			}
			setCustomImages((prev) => [filePath, ...prev]);
			onWallpaperChange(filePath);
			toast.success("已添加视频背景");
		} catch {
			toast.error("导入视频背景失败");
		}
	};

	const handleRemoveCustomImage = (imageUrl: string) => {
		setCustomImages((prev) => prev.filter((img) => img !== imageUrl));
		// If the removed image was selected, clear selection
		if (selected === imageUrl) {
			onWallpaperChange(builtInWallpaperPaths[0] ?? BUILT_IN_WALLPAPERS[0]?.publicPath ?? "");
		}
	};

	// Find selected annotation
	const selectedAnnotation = selectedAnnotationId
		? annotationRegions.find((a) => a.id === selectedAnnotationId)
		: null;

	const backgroundSettingsContent = (
		<div className="space-y-5">
			<section className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-3">
					<SectionLabel>{tSettings("background.title")}</SectionLabel>
				</div>
				<SliderControl
					label={tSettings("effects.backgroundBlur")}
					value={backgroundBlur}
					min={0}
					max={8}
					step={0.25}
					onChange={(v) => onBackgroundBlurChange?.(v)}
					formatValue={(v) => `${v.toFixed(1)}px`}
				/>
			</section>

			<div className="w-full">
				<ChoiceGroup
					type="single"
					value={backgroundTab}
					onValueChange={(value) => {
						if (value) {
							setBackgroundTab(value as typeof backgroundTab);
						}
					}}
					aria-label={tSettings("background.title", "背景类型")}
					className="grid w-full grid-cols-4 gap-2"
				>
					{(
						[
							{ value: "image", label: tSettings("background.image") },
							{ value: "video", label: tSettings("background.video", "视频") },
							{ value: "color", label: tSettings("background.color") },
							{ value: "gradient", label: tSettings("background.gradient") }
						] as const
					).map((option) => (
						<ChoiceItem key={option.value} value={option.value} className="flex-1 min-w-0 px-2">
							{option.label}
						</ChoiceItem>
					))}
				</ChoiceGroup>

				<input
					type="file"
					ref={fileInputRef}
					onChange={handleImageUpload}
					accept=".jpg,.jpeg,image/jpeg"
					className="hidden"
				/>
				<div className="grid pt-4 overflow-hidden" data-testid="background-slider">
					<div
						key={backgroundTab}
						data-background-panel={backgroundTab}
						className="editor-section-enter min-w-0"
					>
						{backgroundTab === "image" || backgroundTab === "video" ? (
							<>
								<WallpaperGrid
									addLabel={
										backgroundTab === "image"
											? tSettings("background.addWallpaper", "添加背景")
											: tSettings("background.addVideoWallpaper", "添加视频背景")
									}
									onAdd={
										backgroundTab === "image"
											? () => fileInputRef.current?.click()
											: handleVideoUpload
									}
									onSelect={onWallpaperChange}
									onRemove={handleRemoveCustomImage}
									isSelected={getWallpaperTileState}
									items={[
										...customImages
											.filter((url) => isVideoWallpaperSource(url) === (backgroundTab === "video"))
											.map((url, index) => ({
												key: `custom-${index}`,
												value: url,
												previewUrl: url,
												label: isVideoWallpaperSource(url)
													? (url.split(/[\\/]/).pop() ?? "自定义视频背景")
													: `${tSettings("background.customWallpaper", "自定义背景")} ${index + 1}`,
												removable: true
											})),
										...(backgroundTab === "image" ? imageWallpaperTiles : videoWallpaperTiles)
									]}
								/>
							</>
						) : backgroundTab === "color" ? (
							<div className="mt-0 space-y-4">
								<div className="flex flex-col gap-3">
									<ColorPalette
										color={selectedColor}
										colors={visibleColorPalette}
										onChange={({ hex }) => {
											setSelectedColor(hex);
											onWallpaperChange(hex);
										}}
									/>
									<ColorControl
										label="自定义颜色"
										value={selectedColor}
										onChange={(color) => {
											setSelectedColor(color);
											onWallpaperChange(color);
										}}
									/>
								</div>
							</div>
						) : (
							<div className="mt-0 grid grid-cols-5 gap-2">
								{GRADIENTS.map((g, idx) => (
									<Button
										variant="ghost"
										key={g}
										className={wallpaperTileClass(gradient === g)}
										aria-label={`渐变 ${idx + 1}`}
										onClick={() => {
											setGradient(g);
											onWallpaperChange(g);
										}}
										role="button"
									>
										<div
											className="absolute inset-[1px] overflow-hidden rounded-[8px]"
											style={{ background: g }}
										/>
									</Button>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);

	// If an annotation is selected, show annotation settings instead
	if (
		!isBackgroundPanel &&
		selectedAnnotation &&
		onAnnotationContentChange &&
		onAnnotationTypeChange &&
		onAnnotationStyleChange &&
		onAnnotationDelete
	) {
		return (
			<AnnotationSettingsPanel
				annotation={selectedAnnotation}
				onRotationChange={(rotation) => onAnnotationRotationChange?.(selectedAnnotation.id, rotation)}
				onContentChange={(content) => onAnnotationContentChange(selectedAnnotation.id, content)}
				onTypeChange={(type) => onAnnotationTypeChange(selectedAnnotation.id, type)}
				onStyleChange={(style) => onAnnotationStyleChange(selectedAnnotation.id, style)}
				onFigureDataChange={
					onAnnotationFigureDataChange
						? (figureData) => onAnnotationFigureDataChange(selectedAnnotation.id, figureData)
						: undefined
				}
				onBlurIntensityChange={
					onAnnotationBlurIntensityChange
						? (intensity) => onAnnotationBlurIntensityChange(selectedAnnotation.id, intensity)
						: undefined
				}
				onBlurColorChange={
					onAnnotationBlurColorChange
						? (color) => onAnnotationBlurColorChange(selectedAnnotation.id, color)
						: undefined
				}
			/>
		);
	}

	if (isBackgroundPanel) {
		return (
			<Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-none bg-transparent p-0 shadow-none">
				<div
					className="flex-1 min-h-0 inspector-scroll custom-scrollbar"
				>
					<div className="mb-4 flex items-center gap-2">
						<Palette className="w-4 h-4 text-accent" />
						<span className="text-sm font-medium text-foreground">
							{tSettings("background.title")}
						</span>
					</div>
					{backgroundSettingsContent}
				</div>
			</Card>
		);
	}

  const frameSectionContent = (
    <section className="flex flex-col gap-4" data-scene-layout>
      <SectionLabel>{tSettings("sections.frame", "边框")}</SectionLabel>
      <SliderControl label="背景圆角" value={backgroundBorderRadius} min={0} max={50} step={1}
        onChange={(value) => onBackgroundBorderRadiusChange?.(value)} formatValue={(value) => `${value}%`} />
      <SliderControl label="录屏圆角" value={borderRadius} min={0} max={50} step={0.1}
        onChange={(value) => onBorderRadiusChange?.(value)} formatValue={(value) => `${value}%`} />
      <SliderControl label={tSettings("effects.shadow")} value={shadowIntensity} min={0} max={1} step={0.01}
        onChange={(value) => onShadowChange?.(value)} formatValue={(value) => `${Math.round(value * 100)}%`} />
      <section className="flex flex-col gap-3" aria-label="内边距设置">
        {padding.linked !== false ? <SliderControl label={tSettings("effects.padding")} value={padding.top} min={0} max={100} step={1}
          onChange={(value) => handlePaddingSideChange("top", value)} formatValue={(value) => `${value}%`} /> : <>
          <span className="inspector-control-label">{tSettings("effects.padding")}</span>
          {([['top', '上'], ['bottom', '下'], ['left', '左'], ['right', '右']] as const).map(([side, label]) => (
            <SliderControl key={side} label={label} ariaLabel={tSettings(`effects.padding${side.charAt(0).toUpperCase() + side.slice(1)}`, label)}
              value={padding[side]} min={0} max={side === 'top' || side === 'bottom' ? ADVANCED_VERTICAL_PADDING_MAX : 100} step={1}
              onChange={(value) => handlePaddingSideChange(side, value)} formatValue={(value) => `${value}%`} />
          ))}
        </>}
      </section>
      <SettingsRow title="联动各边留白" muted>
        <Switch aria-label="联动各边留白" checked={padding.linked !== false} onCheckedChange={togglePaddingLink} />
      </SettingsRow>
      <SettingsRow title={tSettings("effects.removeBackground")} muted>
        <Switch aria-label={tSettings("effects.removeBackground")} checked={removeBackgroundEnabled} onCheckedChange={handleRemoveBackgroundToggle} />
      </SettingsRow>
    </section>
  );

	const captionsSectionContent = (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<SectionLabel>{tSettings("captions.generation", "生成")}</SectionLabel>
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{tSettings("captions.enabled", "Show")}</span>
					<Switch
						aria-label={tSettings("captions.enabled", "Show")}
						checked={autoCaptionSettings.enabled}
						onCheckedChange={(enabled) => updateAutoCaptionSettings({ enabled })}
					/>
				</div>
			</div>

			<div className="py-2 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm font-medium text-foreground">
						{tSettings("captions.language", "Language")}
					</div>
					<Select
						value={autoCaptionSettings.language || "auto"}
						onValueChange={(value) => updateAutoCaptionSettings({ language: value })}
					>
						<SelectTrigger className="h-9 w-[180px] text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CAPTION_LANGUAGE_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="text-sm font-medium text-foreground">
						{tSettings("captions.animation", "动画")}
					</div>
					<Select
						value={autoCaptionSettings.animationStyle}
						onValueChange={(value) =>
							updateAutoCaptionSettings({
								animationStyle: value as AutoCaptionAnimation
							})
						}
					>
						<SelectTrigger className="h-9 w-[180px] text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CAPTION_ANIMATION_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="grid w-full grid-cols-1 gap-2">
						{whisperModelDownloadStatus === "downloading" ? (
							<Button type="button" disabled className="h-9 w-full px-4 text-sm">
								{tSettings("captions.downloading", "Downloading...")}{" "}
								{Math.round(whisperModelDownloadProgress)}%
							</Button>
						) : whisperModelPath ? (
							<Button
								type="button"
								variant="outline"
								onClick={onDeleteWhisperSmallModel}
								className="h-9 w-full px-4 text-sm"
							>
								{tSettings("captions.deleteModel", "Delete Model")}
							</Button>
						) : (
							<Button
								type="button"
								onClick={onDownloadWhisperSmallModel}
								className="h-9 w-full px-4 text-sm"
							>
								{tSettings("captions.downloadModel", "Download Model")}
							</Button>
						)}
						<Button
							type="button"
							variant="outline"
							onClick={onClearAutoCaptions}
							disabled={captionCueCount === 0}
							className="h-9 w-full px-4 text-sm"
						>
							{tSettings("captions.clearFull", "清空字幕")}
						</Button>
					</div>
				</div>
				<div className="flex flex-col gap-4">
					<Button
						type="button"
						onClick={onGenerateAutoCaptions}
						disabled={isGeneratingCaptions || !whisperModelPath}
						className="h-9 w-full px-4 text-sm"
					>
						{isGeneratingCaptions
							? tSettings("captions.generating", "Generating...")
							: captionCueCount > 0
								? tSettings("captions.regenerateFull", "Regenerate Captions")
								: tSettings("captions.generateFull", "生成字幕")}
					</Button>
					{isGeneratingCaptions ? (
						<div className="space-y-1">
							<div className="text-xs text-muted-foreground">
								{tSettings("captions.generatingStatus", "正在生成字幕，请稍候。")}
							</div>
							<ProgressBar aria-label="正在下载字幕模型" isIndeterminate>
								<ProgressBar.Track>
									<ProgressBar.Fill />
								</ProgressBar.Track>
							</ProgressBar>
						</div>
					) : null}
				</div>
				{whisperModelDownloadStatus === "downloading" ? (
					<div className="h-2 overflow-hidden rounded-full bg-foreground/5">
						<div
							className="h-full rounded-full bg-accent transition-all"
							style={{ width: `${whisperModelDownloadProgress}%` }}
						/>
					</div>
				) : null}
			</div>

			<div className="flex flex-col gap-3">
				<div className="mb-1 text-sm font-medium text-foreground">
					{tSettings("captions.fontSettings", "字体设置")}
				</div>
				<SliderControl
					label={tSettings("captions.fontSize", "字号")}
					value={autoCaptionSettings.fontSize}
					min={16}
					max={72}
					step={1}
					onChange={(value) => updateAutoCaptionSettings({ fontSize: value })}
					formatValue={(value) => `${Math.round(value)}px`}
				/>
				<div className="flex items-center justify-between py-2">
					<span className="text-sm font-medium text-foreground">
						{tSettings("captions.textColor", "Text color")}
					</span>
					<ColorControl
						compact
						label={tSettings("captions.textColor", "Text color")}
						value={autoCaptionSettings.textColor}
						onChange={(color) => updateAutoCaptionSettings({ textColor: color })}
					/>
				</div>
			</div>
			<AdvancedSettings open={advanced} onOpenChange={onAdvancedChange}>
				{
					<div>
						<Button
							type="button"
							variant="outline"
							onClick={onPickWhisperModel}
							className="h-9 w-full px-4 text-sm"
						>
							{tSettings("captions.useCustomModel", "使用自定义模型")}
						</Button>
					</div>
				}
				{
					<div className="flex items-center justify-between gap-3 py-2">
						<div className="text-xs text-muted-foreground">
							{tSettings("captions.timelineQuickAdd", "悬停后添加到时间轴")}
						</div>
						<Switch
							checked={autoCaptionSettings.timelineQuickAdd}
							onCheckedChange={(timelineQuickAdd) =>
								updateAutoCaptionSettings({ timelineQuickAdd })
							}
							aria-label={tSettings("captions.timelineQuickAdd", "悬停后添加到时间轴")}
						/>
					</div>
				}
				{
					<SliderControl
						label={tSettings("captions.rowCount", "Rows")}
						value={autoCaptionSettings.maxRows}
						min={1}
						max={4}
						step={1}
						onChange={(value) => updateAutoCaptionSettings({ maxRows: Math.round(value) })}
						formatValue={(value) => `${Math.round(value)}`}
					/>
				}
				{
					<SliderControl
						label={tSettings("captions.bottomOffset", "底部偏移")}
						value={autoCaptionSettings.bottomOffset}
						min={0}
						max={30}
						step={1}
						onChange={(value) => updateAutoCaptionSettings({ bottomOffset: value })}
						formatValue={(value) => `${Math.round(value)}%`}
					/>
				}
				{
					<SliderControl
						label={tSettings("captions.maxWidth", "最大宽度")}
						value={autoCaptionSettings.maxWidth}
						min={40}
						max={95}
						step={1}
						onChange={(value) => updateAutoCaptionSettings({ maxWidth: value })}
						formatValue={(value) => `${Math.round(value)}%`}
					/>
				}
				{
					<SliderControl
						label={tSettings("captions.boxRadius", "方框圆角")}
						value={autoCaptionSettings.boxRadius}
						min={0}
						max={40}
						step={0.5}
						onChange={(value) => updateAutoCaptionSettings({ boxRadius: value })}
						formatValue={(value) =>
							`${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}px`
						}
					/>
				}
				{
					<SliderControl
						label={tSettings("captions.backgroundOpacity", "背景不透明度")}
						value={autoCaptionSettings.backgroundOpacity}
						min={0}
						max={1}
						step={0.01}
						onChange={(value) => updateAutoCaptionSettings({ backgroundOpacity: value })}
						formatValue={(value) => `${Math.round(value * 100)}%`}
					/>
				}
			</AdvancedSettings>
		</section>
	);

	const effectSectionContent = (() => {
		const settingsSectionContent = (
			<SettingsSections
				categories={advanced && showDevMotionControls ? ["general", "advanced"] : ["general"]}
			>
				<SettingsCategory category="general">
					<section className="flex flex-col gap-6">
						<SettingsRow
							title={tSettings(
								"effects.autoApplyFreshRecordingZooms",
								"Auto-apply fresh recording zooms"
							)}
							description={tSettings(
								"effects.autoApplyFreshRecordingZoomsDescription",
								"Suggest cursor-follow zooms automatically when you open a new recording."
							)}
						>
							<Switch
								aria-label={tSettings(
									"effects.autoApplyFreshRecordingZooms",
									"Auto-apply fresh recording zooms"
								)}
								checked={autoApplyFreshRecordingAutoZooms}
								onCheckedChange={onAutoApplyFreshRecordingAutoZoomsChange}
							/>
						</SettingsRow>
					</section>
				</SettingsCategory>
				<SettingsCategory category="advanced">
					{advanced && showDevMotionControls ? (
						<section className="flex flex-col gap-4 rounded-xl border border-separator bg-surface-secondary p-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<SectionLabel>{tSettings("effects.devSection", "开发者选项")}</SectionLabel>
									<div className="inspector-description mt-0.5">
										{tSettings("effects.devSectionHint", "用于调试原生捕获和动画的临时选项。")}
									</div>
								</div>
								<span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-accent">
									开发
								</span>
							</div>

							<div className="rounded-lg border border-foreground/10 bg-background/60 px-3 py-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<div className="text-sm font-medium text-foreground">
											{tSettings("effects.nativeCaptureWarningTester", "原生捕获提示")}
										</div>
										<div className="inspector-description mt-0.5">
											{nativeCaptureUnavailableSession
												? tSettings(
														"effects.nativeCaptureWarningTesterUnavailable",
														"此项目已标记为无法使用原生捕获。"
													)
												: tSettings(
														"effects.nativeCaptureWarningTesterAvailable",
														"此项目支持原生捕获，可打开提示窗口检查显示。"
													)}
										</div>
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onOpenNativeCaptureUnavailableModal?.()}
										className="h-8 shrink-0"
									>
										{tSettings("effects.openNativeCaptureWarning", "查看提示")}
									</Button>
								</div>
							</div>

							<div className="space-y-1.5 rounded-lg border border-foreground/10 bg-background/60 px-3 py-3">
								<div>
									<div className="text-sm font-medium text-foreground">
										{tSettings("effects.cameraDebugTuning", "镜头动画调试")}
									</div>
									<div className="inspector-description mt-0.5">
										{tSettings("effects.cameraDebugTuningHint", "用于开发调试的镜头弹簧参数。")}
									</div>
								</div>
								<SliderControl
									label={tSettings("effects.cameraSpringStiffnessMultiplier", "镜头刚度")}
									value={cameraSpringStiffnessMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) => onCameraSpringStiffnessMultiplierChange?.(value)}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings("effects.cameraSpringDampingMultiplier", "镜头阻尼")}
									value={cameraSpringDampingMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) => onCameraSpringDampingMultiplierChange?.(value)}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings("effects.cameraSpringMassMultiplier", "镜头质量")}
									value={cameraSpringMassMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) => onCameraSpringMassMultiplierChange?.(value)}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
							</div>

							<div className="space-y-1.5 rounded-lg border border-foreground/10 bg-background/60 px-3 py-3">
								<div>
									<div className="text-sm font-medium text-foreground">
										{tSettings("effects.cursorDebugTuning", "光标动画调试")}
									</div>
									<div className="inspector-description mt-0.5">
										{tSettings("effects.cursorDebugTuningHint", "用于开发调试的弹簧参数。")}
									</div>
								</div>
								<SliderControl
									label={tSettings("effects.cursorSpringStiffnessMultiplier", "弹簧刚度")}
									value={cursorSpringStiffnessMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) => onCursorSpringStiffnessMultiplierChange?.(value)}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings("effects.cursorSpringDampingMultiplier", "弹簧阻尼")}
									value={cursorSpringDampingMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) => onCursorSpringDampingMultiplierChange?.(value)}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
								<SliderControl
									label={tSettings("effects.cursorSpringMassMultiplier", "弹簧质量")}
									value={cursorSpringMassMultiplier}
									min={0.25}
									max={3}
									step={0.01}
									onChange={(value) => onCursorSpringMassMultiplierChange?.(value)}
									formatValue={(value) => `${value.toFixed(2)}×`}
								/>
							</div>
						</section>
					) : null}
				</SettingsCategory>
			</SettingsSections>
		);

    const sceneSectionContent = <div className="space-y-5">{backgroundSettingsContent}{frameSectionContent}</div>;

		const zoomItemSectionContent = (
			<section className="flex flex-col gap-4">
				{selectedZoomId && (
					<>
						{selectedZoomRegion && <ZoomCameraControls region={selectedZoomRegion} onChange={(patch) => onZoomCameraChange?.(patch)} />}
						<SectionLabel>取景方式</SectionLabel>
						<div className="mb-1">
							<ChoiceGroup
                                aria-label="变焦取景方式"
								value={selectedZoomMode ?? "auto"}
								onValueChange={(value) => onZoomModeChange?.(value as ZoomMode)}
								className="grid grid-cols-2 gap-2"
							>
								<ChoiceItem value="auto">{tSettings("zoom.modeAuto", "自动")}</ChoiceItem>
								<ChoiceItem value="manual">{tSettings("zoom.modeManual", "手动")}</ChoiceItem>
							</ChoiceGroup>
							<p className="mt-1.5 text-xs text-muted-foreground/70">
								{selectedZoomMode === "manual"
									? tSettings("zoom.modeManualDescription", "Set a fixed focus point for this zoom")
									: tSettings(
											"zoom.modeAutoDescription",
											"Camera recenters when the cursor nears the edge of the zoomed view"
										)}
							</p>
						</div>
					</>
				)}
				{!selectedZoomId && <p className="inspector-description">在变焦轨道空白处点击添加，或选择已有片段调整镜头。</p>}
				<AdvancedSettings title="通用设置" label="变焦通用设置" groupLabel="变焦通用设置" open={advanced} onOpenChange={onAdvancedChange}>
				<SettingsRow
                    title={tSettings("effects.connectZooms", "连接变焦")}
					description={tSettings(
						"effects.connectZoomsDescription",
						"Smooth consecutive zoom regions into a continuous camera move."
					)}
				>
					<Switch
						aria-label={tSettings("effects.connectZooms", "Connect neighboring zooms")}
						checked={connectZooms}
						onCheckedChange={onConnectZoomsChange}
					/>
				</SettingsRow>
        {connectZooms && <SliderControl label="变焦衔接最大间隔" description="相邻两段变焦之间的空白时长小于或等于此值时，保持放大状态并平滑衔接；超过此值则分别进出场。" value={connectedZoomGapMs} min={0} max={5000} step={100} onChange={value => onConnectedZoomGapMsChange?.(value)} formatValue={value => `${value} ms`} />}
				<div className="flex items-center justify-between gap-3">
					<span className="inspector-control-label">运动效果</span>
				</div>
				<ChoiceGroup
					aria-label="运动效果"
					value={activeMotionEffect}
					onValueChange={(value) => applyMotionEffect(value as CursorMotionPresetId)}
					className="grid grid-cols-2 gap-2"
				>
					<ChoiceItem value="smooth" style={{ fontSize: 12 }}>平滑</ChoiceItem>
					<ChoiceItem value="focused" style={{ fontSize: 12 }}>专注</ChoiceItem>
				</ChoiceGroup>
				</AdvancedSettings>
			</section>
		);

		const audioSectionContent = (
			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<SectionLabel>{tSettings("audio.volumeTitle", "Audio")}</SectionLabel>
				</div>
				<SliderControl
					label={tSettings("audio.volume", "音量")}
					value={selectedAudioVolume ?? 1}
					min={0}
					max={1}
					step={0.01}
					onChange={(v) => onAudioVolumeChange?.(v)}
					formatValue={(v) => `${Math.round(v * 100)}%`}
				/>
				<div className="flex items-center justify-between py-2">
					<span className="text-xs text-muted-foreground">
						{tSettings("audio.normalize", "Normalize")}
					</span>
					<Switch
						aria-label={tSettings("audio.normalize", "Normalize")}
						checked={Boolean(selectedAudioNormalize)}
						onCheckedChange={(v) => onAudioNormalizeChange?.(v)}
					/>
				</div>
			</section>
		);

		const clipSectionContent = (
			<section className="flex flex-col gap-3">
				<SliderControl
					label={tSettings("speed.label", "速度")}
					value={Math.min(clipSpeedRange.max, Math.max(clipSpeedRange.min, selectedClipSpeed ?? 1))}
					min={clipSpeedRange.min}
					max={clipSpeedRange.max}
					step={0.25}
					onChange={(value) => onClipSpeedChange?.(value)}
					formatValue={(value) => `${value}×`}
				/>
				{selectedClipSpeed != null &&
					(selectedClipSpeed < clipSpeedRange.min || selectedClipSpeed > clipSpeedRange.max) && (
						<p className="text-xs text-muted-foreground" role="status">
							{selectedClipSpeed}× — {tSettings("speed.unsupported", "当前设备不支持预览")}
						</p>
					)}
			</section>
		);

		const captionSectionContent = (
			<section className="flex flex-col gap-4">
				{selectedCaptionId !== null ? (
					<CaptionListPanel
						cues={autoCaptions}
						selectedCaptionId={selectedCaptionId}
						currentTimeMs={captionCurrentTimeMs}
						onBeginCaptionEdit={(id) => onBeginCaptionEdit?.(id)}
						onCaptionTextEdit={(id, text) => onCaptionTextEdit?.(id, text)}
						onCaptionRetime={(id, span) => onCaptionRetime?.(id, span)}
						onCaptionSplit={(id, atMs) => onCaptionSplit?.(id, atMs)}
						onCaptionMerge={(idA, idB) => onCaptionMerge?.(idA, idB)}
						onCaptionDelete={(id) => onCaptionDelete?.(id)}
					/>
				) : (
					<div className="rounded-lg bg-foreground/[0.03] px-2.5 py-6 text-center">
						<p className="text-xs text-muted-foreground">
							{tSettings(
								"captions.selectOnTimeline",
								"Select a caption on the timeline to edit it."
							)}
						</p>
					</div>
				)}
			</section>
		);

		switch (activeEffectSection) {
			case "settings":
				return settingsSectionContent;
			case "scene":
				return sceneSectionContent;
			case "zoom":
				return zoomItemSectionContent;
			case "clip":
				return clipSectionContent;
			case "audio":
				return audioSectionContent;
			case "frame":
				return sceneSectionContent;
			case "crop":
				return sceneSectionContent;
			case "captions":
				return captionsSectionContent;
			case "caption":
				return captionSectionContent;
			case "cursor":
				return (
					<section className="flex flex-col gap-4">
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between gap-3">
								<SectionLabel>{tSettings("sections.appearance", "外观")}</SectionLabel>
							</div>
						</div>
						<div className="flex flex-col gap-3">
							<div className="space-y-1.5">
								<ChoiceGroup
									type="single"
									value={cursorStyle}
									onValueChange={(value) => {
										if (value) {
											onCursorStyleChange?.(value as CursorStyle);
										}
									}}
									className="grid grid-cols-4 gap-2"
									aria-label={tSettings("effects.cursorStyle", "光标样式")}
								>
									{cursorStyleOptions.map((option) => (
										<ChoiceItem
											key={option.value}
											value={option.value}
											title={option.label}
											aria-label={option.label}
											className={cn("group aspect-square h-auto min-w-0 p-3 text-left")}
										>
											<div className="flex h-full flex-col items-center justify-between gap-3">
												<div className="flex min-h-0 flex-1 items-center justify-center rounded-lg px-2 py-1.5">
													<CursorStylePreview
														style={option.value}
														previewUrls={cursorPreviewUrls}
													/>
												</div>
											</div>
										</ChoiceItem>
									))}
								</ChoiceGroup>
							</div>
							<SliderControl
								label={tSettings("effects.cursorSize")}
								value={cursorSize}
								min={0.5}
								max={10}
								step={0.05}
								onChange={(v) => onCursorSizeChange?.(v)}
								formatValue={(v) => `${v.toFixed(2)}×`}
							/>
							<CursorClickEffectCards
								title={tSettings("effects.cursorClickEffects.title", "点击效果")}
								activeEffectId={cursorClickEffect}
								effectColor={cursorClickEffectColor}
								onApply={(effectId) => onCursorClickEffectChange?.(effectId)}
								tSettings={tSettings}
							/>

							<SliderControl
								label={tSettings("effects.cursorClickBounce")}
								value={cursorClickBounce}
								min={0}
								max={5}
								step={0.05}
								onChange={(v) => onCursorClickBounceChange?.(v)}
								formatValue={(v) => `${v.toFixed(2)}×`}
							/>
						</div>
						<AdvancedSettings open={advanced} onOpenChange={onAdvancedChange}>
							{
								<div className="flex flex-col gap-3">
									<SettingsRow title={tSettings("effects.showCursor")}>
										<Switch
											aria-label={tSettings("effects.showCursor")}
											checked={showCursor}
											onCheckedChange={onShowCursorChange}
										/>
									</SettingsRow>
									<SettingsRow title={tSettings("effects.loopCursor")} description="循环播放时让光标轨迹首尾衔接，不影响系统鼠标。">
										<Switch
											aria-label={tSettings("effects.loopCursor")}
											checked={loopCursor}
											onCheckedChange={onLoopCursorChange}
										/>
									</SettingsRow>
								</div>
							}
							{
								<div className="grid gap-3">
									<div className="grid gap-1">
										<div className="text-xs text-muted-foreground">
											{tSettings("effects.cursorClickEffects.color", "效果颜色")}
										</div>
										<div className="flex flex-col gap-3">
											<ColorPalette
												color={cursorClickEffectColor}
												colors={CLICK_EFFECT_COLOR_OPTIONS}
												onChange={({ hex }) => onCursorClickEffectColorChange?.(hex)}
											/>
											<ColorControl
												label="自定义效果颜色"
												value={cursorClickEffectColor}
												onChange={(color) => onCursorClickEffectColorChange?.(color)}
											/>
										</div>
									</div>
									<SliderControl
										label={tSettings("effects.cursorClickEffects.size", "效果大小")}
										value={cursorClickEffectScale}
										min={0.5}
										max={2}
										step={0.05}
										onChange={(v) => onCursorClickEffectScaleChange?.(v)}
										formatValue={(v) => `${v.toFixed(2)}×`}
									/>
									<SliderControl
										label={tSettings("effects.cursorClickEffects.opacity", "效果不透明度")}
										value={cursorClickEffectOpacity}
										min={0}
										max={1}
										step={0.01}
										onChange={(v) => onCursorClickEffectOpacityChange?.(v)}
										formatValue={(v) => `${Math.round(v * 100)}%`}
									/>
									<SliderControl
										label={tSettings("effects.cursorClickEffects.duration", "效果持续时间")}
										value={cursorClickEffectDurationMs}
										min={120}
										max={1200}
										step={10}
										onChange={(v) => onCursorClickEffectDurationMsChange?.(v)}
										formatValue={(v) => `${Math.round(v)} ms`}
									/>
								</div>
							}
							{
								<SliderControl
									label={tSettings("effects.cursorClickBounceDuration", "弹跳速度")}
									value={cursorClickBounceDuration}
									min={60}
									max={500}
									step={5}
									onChange={(v) => onCursorClickBounceDurationChange?.(v)}
									formatValue={(v) => `${Math.round(v)} ms`}
								/>
							}
							{
								<SliderControl
									label={tSettings("effects.cursorSway")}
									value={toCursorSwaySliderValue(cursorSway)}
									min={0}
									max={toCursorSwaySliderValue(2)}
									step={toCursorSwaySliderValue(0.05)}
									onChange={(v) => onCursorSwayChange?.(fromCursorSwaySliderValue(v))}
									formatValue={(v) => (v <= 0 ? tSettings("effects.off") : `${v.toFixed(2)}×`)}
								/>
							}
							{showDevMotionControls ? (
								<div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
									<div className="text-xs text-muted-foreground">
										{tSettings(
											"effects.cursorDebugMovedToDev",
											"可在设置的开发者选项中调整光标弹簧参数。"
										)}
									</div>
								</div>
							) : null}
						</AdvancedSettings>
					</section>
				);
      case "webcam":
        // 无片段时只保留导入入口；历史空区间不能继续显示文件和无效外观控件。
        if (!hasCameraFootage) return <section className="flex flex-col gap-4" data-webcam-settings>
          <p className="inspector-description">暂无摄像头片段，导入视频后可编辑。</p>
          <Button type="button" variant="outline" onClick={onUploadWebcam} className="h-9 w-full min-w-0 justify-start gap-2 px-3">
            <Upload className="h-3 w-3" /><span className="min-w-0 truncate">{tSettings("effects.uploadWebcamFootage")}</span>
          </Button>
        </section>;
        return <section className="flex flex-col gap-4" data-webcam-settings>
          <SectionLabel>{tSettings("sections.appearance", "外观")}</SectionLabel>
          <SettingsRow title="显示摄像头画面">
            <Switch aria-label="显示摄像头画面" checked={webcam?.enabled ?? false} onCheckedChange={(enabled) => updateWebcam({ enabled })} />
          </SettingsRow>
          <SettingsRow title="保持宽高比例">
            <Switch aria-label="保持宽高比例" checked={webcamAspectLocked} onCheckedChange={setWebcamAspectLocked} />
          </SettingsRow>
          <SliderControl label="人像画面宽度" description="按成片较短边的百分比计算；锁定比例时宽高一起变化。"
            value={webcamWidth} min={10} max={100} step={1}
            onChange={(value) => webcamAspectLocked ? scaleWebcam(value / webcamWidth) : updateWebcam({ width: value, size: value, dimensionsMode: 'manual' })}
            formatValue={(value) => `${Math.round(value)}%`} />
          <SliderControl label="人像画面高度" value={webcamHeight} min={10} max={100} step={1}
            onChange={(value) => webcamAspectLocked ? scaleWebcam(value / webcamHeight) : updateWebcam({ height: value, dimensionsMode: 'manual' })}
            formatValue={(value) => `${Math.round(value)}%`} />
          <SliderControl label="圆角" description="0%为直角，100%为最大圆角；正方形画面可显示为圆形。"
            value={webcam?.roundness ?? DEFAULT_WEBCAM_ROUNDNESS} min={0} max={100} step={1}
            onChange={(value) => updateWebcam({ roundness: value })} formatValue={(value) => `${Math.round(value)}%`} />
          <SliderControl label="阴影" description="调节人像画面周围阴影的深浅；0%不显示阴影。"
            value={webcam?.shadow ?? DEFAULT_WEBCAM_SHADOW} min={0} max={1} step={0.01}
            onChange={(value) => updateWebcam({ shadow: value })} formatValue={(value) => `${Math.round(value * 100)}%`} />
          <p className="inspector-description">在预览中直接拖动摄像头画面调整位置。</p>
          <div className="flex flex-col gap-2">
            <span className="inspector-control-label">当前摄像头视频文件</span>
            <div className="inspector-description break-all">{webcamFileName ?? tSettings("effects.webcamFootageDescription")}</div>
            <Button type="button" variant="outline" onClick={onUploadWebcam} className="h-9 w-full min-w-0 justify-start gap-2 px-3">
              <Upload className="h-3 w-3" /><span className="min-w-0 truncate">{webcam?.sourcePath ? tSettings("effects.replaceWebcamFootage") : tSettings("effects.uploadWebcamFootage")}</span>
            </Button>
          </div>
          <AdvancedSettings open={advanced} onOpenChange={onAdvancedChange}>
            <SettingsRow title={tSettings("effects.webcamReactToZoom")} description="开启后，屏幕放大时人像会相应缩小，减少遮挡；关闭则保持人像大小。">
              <Switch aria-label={tSettings("effects.webcamReactToZoom")} checked={webcam?.reactToZoom ?? DEFAULT_WEBCAM_REACT_TO_ZOOM}
                onCheckedChange={(reactToZoom) => updateWebcam({ reactToZoom })} />
            </SettingsRow>
            <SettingsRow title={tSettings("effects.webcamMirror", "镜像")} description="像照镜子一样左右翻转人像，画面中的文字也会反向。">
              <Switch aria-label={tSettings("effects.webcamMirror", "镜像")} checked={webcam?.mirror ?? true} onCheckedChange={(mirror) => updateWebcam({ mirror })} />
            </SettingsRow>
            <section className="flex flex-col gap-2">
              <span className="inspector-control-label">{tSettings("effects.webcamCrop", "画面裁剪")}</span>
              <p className="inspector-description">拖动裁剪框选择保留的人像区域，只影响成片中的摄像头画面。</p>
              <div className="mx-auto w-full max-w-56">
                <WebcamCropControl cropRegion={webcamCrop} mirrored={webcam?.mirror ?? true} previewSrc={webcamPreviewSrc}
                  previewCurrentTime={webcamPreviewCurrentTime} previewPlaying={webcamPreviewPlaying} previewTimeOffsetMs={webcam?.timeOffsetMs}
                  onCropChange={(cropRegion, previewFrame) => updateWebcam({ cropRegion,
                    height: previewFrame ? getCropMatchedWebcamHeightPercent(webcamWidth, webcamHeight, previewFrame.width, previewFrame.height, cropRegion) : webcamHeight })} />
              </div>
            </section>
          </AdvancedSettings>
        </section>;

			default: {
				return sceneSectionContent;
			}
		}
	})();

	return (
		<Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-none bg-transparent p-0 shadow-none">
			<div
				className="flex-1 min-h-0 inspector-scroll custom-scrollbar"
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={activeEffectSection}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
					>
						{effectSectionContent}
					</motion.div>
				</AnimatePresence>
			</div>

		</Card>
	);
}
