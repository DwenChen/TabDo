import { useState } from "react";
import { DEFAULT_EDITOR_PREFERENCES, type EditorPreferences } from "../editorPreferences";
import type {
	CropRegion,
	CursorClickEffectStyle,
	CursorStyle,
	WebcamOverlaySettings,
	ZoomMotionBlurTuning,
	ZoomTransitionEasing,
} from "../types";
import {
	DEFAULT_CONNECTED_ZOOM_DURATION_MS,
	DEFAULT_CONNECTED_ZOOM_EASING,
	DEFAULT_CONNECTED_ZOOM_GAP_MS,
	DEFAULT_CROP_REGION,
	DEFAULT_CURSOR_STYLE,
	DEFAULT_WEBCAM_OVERLAY,
	DEFAULT_ZOOM_IN_DURATION_MS,
	DEFAULT_ZOOM_IN_EASING,
	DEFAULT_ZOOM_IN_OVERLAP_MS,
	DEFAULT_ZOOM_MOTION_BLUR_TUNING,
	DEFAULT_ZOOM_OUT_DURATION_MS,
	DEFAULT_ZOOM_OUT_EASING,
} from "../types";

/**
 * 以出厂值初始化项目外观，仅从应用偏好读取自动缩放开关。
 * @param preferences 应用级自动缩放偏好；旧项目外观不用于新项目。
 * @returns 规范化状态或所属编辑操作。
 */
export function useAppearanceState(preferences: EditorPreferences) {
	const [wallpaper, setWallpaper] = useState(DEFAULT_EDITOR_PREFERENCES.wallpaper);
	const [shadowIntensity, setShadowIntensity] = useState(DEFAULT_EDITOR_PREFERENCES.shadowIntensity);
	const [backgroundBlur, setBackgroundBlur] = useState(DEFAULT_EDITOR_PREFERENCES.backgroundBlur);
	const [zoomMotionBlur, setZoomMotionBlur] = useState(DEFAULT_EDITOR_PREFERENCES.zoomMotionBlur);
	const [zoomMotionBlurTuning, setZoomMotionBlurTuning] = useState<ZoomMotionBlurTuning>(
		DEFAULT_EDITOR_PREFERENCES.zoomMotionBlurTuning ?? DEFAULT_ZOOM_MOTION_BLUR_TUNING,
	);
	const [autoApplyFreshRecordingAutoZooms, setAutoApplyFreshRecordingAutoZooms] = useState(
		preferences.autoApplyFreshRecordingAutoZooms,
	);
	const [connectZooms, setConnectZooms] = useState(DEFAULT_EDITOR_PREFERENCES.connectZooms);
	const [zoomInDurationMs, setZoomInDurationMs] = useState(
		DEFAULT_EDITOR_PREFERENCES.zoomInDurationMs ?? DEFAULT_ZOOM_IN_DURATION_MS,
	);
	const [zoomInOverlapMs, setZoomInOverlapMs] = useState(
		DEFAULT_EDITOR_PREFERENCES.zoomInOverlapMs ?? DEFAULT_ZOOM_IN_OVERLAP_MS,
	);
	const [zoomOutDurationMs, setZoomOutDurationMs] = useState(
		DEFAULT_EDITOR_PREFERENCES.zoomOutDurationMs ?? DEFAULT_ZOOM_OUT_DURATION_MS,
	);
	const [connectedZoomGapMs, setConnectedZoomGapMs] = useState(
		DEFAULT_EDITOR_PREFERENCES.connectedZoomGapMs ?? DEFAULT_CONNECTED_ZOOM_GAP_MS,
	);
	const [connectedZoomDurationMs, setConnectedZoomDurationMs] = useState(
		DEFAULT_EDITOR_PREFERENCES.connectedZoomDurationMs ?? DEFAULT_CONNECTED_ZOOM_DURATION_MS,
	);
	const [zoomInEasing, setZoomInEasing] = useState<ZoomTransitionEasing>(
		DEFAULT_EDITOR_PREFERENCES.zoomInEasing ?? DEFAULT_ZOOM_IN_EASING,
	);
	const [zoomOutEasing, setZoomOutEasing] = useState<ZoomTransitionEasing>(
		DEFAULT_EDITOR_PREFERENCES.zoomOutEasing ?? DEFAULT_ZOOM_OUT_EASING,
	);
	const [connectedZoomEasing, setConnectedZoomEasing] = useState<ZoomTransitionEasing>(
		DEFAULT_EDITOR_PREFERENCES.connectedZoomEasing ?? DEFAULT_CONNECTED_ZOOM_EASING,
	);
	const [showCursor, setShowCursor] = useState(DEFAULT_EDITOR_PREFERENCES.showCursor);
	const [loopCursor, setLoopCursor] = useState(DEFAULT_EDITOR_PREFERENCES.loopCursor);
	const [cursorStyle, setCursorStyle] = useState<CursorStyle>(
		DEFAULT_EDITOR_PREFERENCES.cursorStyle ?? DEFAULT_CURSOR_STYLE,
	);
	const [cursorSize, setCursorSize] = useState(DEFAULT_EDITOR_PREFERENCES.cursorSize);
	const [cursorSmoothing, setCursorSmoothing] = useState(DEFAULT_EDITOR_PREFERENCES.cursorSmoothing);
	const [cursorSpringStiffnessMultiplier, setCursorSpringStiffnessMultiplier] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorSpringStiffnessMultiplier,
	);
	const [cursorSpringDampingMultiplier, setCursorSpringDampingMultiplier] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorSpringDampingMultiplier,
	);
	const [cursorSpringMassMultiplier, setCursorSpringMassMultiplier] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorSpringMassMultiplier,
	);
	const [cameraSpringStiffnessMultiplier, setCameraSpringStiffnessMultiplier] = useState(
		DEFAULT_EDITOR_PREFERENCES.cameraSpringStiffnessMultiplier,
	);
	const [cameraSpringDampingMultiplier, setCameraSpringDampingMultiplier] = useState(
		DEFAULT_EDITOR_PREFERENCES.cameraSpringDampingMultiplier,
	);
	const [cameraSpringMassMultiplier, setCameraSpringMassMultiplier] = useState(
		DEFAULT_EDITOR_PREFERENCES.cameraSpringMassMultiplier,
	);
	const [zoomSmoothness, setZoomSmoothness] = useState(0.5);
	const [zoomClassicMode, setZoomClassicMode] = useState(false);
	const [cursorMotionBlur, setCursorMotionBlur] = useState(DEFAULT_EDITOR_PREFERENCES.cursorMotionBlur);
	const [cursorClickEffect, setCursorClickEffect] = useState<CursorClickEffectStyle>(
		DEFAULT_EDITOR_PREFERENCES.cursorClickEffect,
	);
	const [cursorClickEffectColor, setCursorClickEffectColor] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorClickEffectColor,
	);
	const [cursorClickEffectScale, setCursorClickEffectScale] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorClickEffectScale,
	);
	const [cursorClickEffectOpacity, setCursorClickEffectOpacity] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorClickEffectOpacity,
	);
	const [cursorClickEffectDurationMs, setCursorClickEffectDurationMs] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorClickEffectDurationMs,
	);
	const [cursorClickBounce, setCursorClickBounce] = useState(DEFAULT_EDITOR_PREFERENCES.cursorClickBounce);
	const [cursorClickBounceDuration, setCursorClickBounceDuration] = useState(
		DEFAULT_EDITOR_PREFERENCES.cursorClickBounceDuration,
	);
	const [cursorSway, setCursorSway] = useState(DEFAULT_EDITOR_PREFERENCES.cursorSway);
	const [backgroundBorderRadius, setBackgroundBorderRadius] = useState(DEFAULT_EDITOR_PREFERENCES.backgroundBorderRadius);
	const [borderRadius, setBorderRadius] = useState(DEFAULT_EDITOR_PREFERENCES.borderRadius);
	const [padding, setPadding] = useState(DEFAULT_EDITOR_PREFERENCES.padding);
	const [cropRegion, setCropRegion] = useState<CropRegion>(DEFAULT_CROP_REGION);
	const [webcam, setWebcam] = useState<WebcamOverlaySettings>(
		DEFAULT_EDITOR_PREFERENCES.webcam ?? DEFAULT_WEBCAM_OVERLAY,
	);
	const [resolvedWebcamVideoUrl, setResolvedWebcamVideoUrl] = useState<string | null>(null);

	return {
		wallpaper,
		setWallpaper,
		shadowIntensity,
		setShadowIntensity,
		backgroundBlur,
		setBackgroundBlur,
		zoomMotionBlur,
		setZoomMotionBlur,
		zoomMotionBlurTuning,
		setZoomMotionBlurTuning,
		autoApplyFreshRecordingAutoZooms,
		setAutoApplyFreshRecordingAutoZooms,
		connectZooms,
		setConnectZooms,
		zoomInDurationMs,
		setZoomInDurationMs,
		zoomInOverlapMs,
		setZoomInOverlapMs,
		zoomOutDurationMs,
		setZoomOutDurationMs,
		connectedZoomGapMs,
		setConnectedZoomGapMs,
		connectedZoomDurationMs,
		setConnectedZoomDurationMs,
		zoomInEasing,
		setZoomInEasing,
		zoomOutEasing,
		setZoomOutEasing,
		connectedZoomEasing,
		setConnectedZoomEasing,
		showCursor,
		setShowCursor,
		loopCursor,
		setLoopCursor,
		cursorStyle,
		setCursorStyle,
		cursorSize,
		setCursorSize,
		cursorSmoothing,
		setCursorSmoothing,
		cursorSpringStiffnessMultiplier,
		setCursorSpringStiffnessMultiplier,
		cursorSpringDampingMultiplier,
		setCursorSpringDampingMultiplier,
		cursorSpringMassMultiplier,
		setCursorSpringMassMultiplier,
		cameraSpringStiffnessMultiplier,
		setCameraSpringStiffnessMultiplier,
		cameraSpringDampingMultiplier,
		setCameraSpringDampingMultiplier,
		cameraSpringMassMultiplier,
		setCameraSpringMassMultiplier,
		zoomSmoothness,
		setZoomSmoothness,
		zoomClassicMode,
		setZoomClassicMode,
		cursorMotionBlur,
		setCursorMotionBlur,
		cursorClickEffect,
		setCursorClickEffect,
		cursorClickEffectColor,
		setCursorClickEffectColor,
		cursorClickEffectScale,
		setCursorClickEffectScale,
		cursorClickEffectOpacity,
		setCursorClickEffectOpacity,
		cursorClickEffectDurationMs,
		setCursorClickEffectDurationMs,
		cursorClickBounce,
		setCursorClickBounce,
		cursorClickBounceDuration,
		setCursorClickBounceDuration,
		cursorSway,
		setCursorSway,
		backgroundBorderRadius,
		setBackgroundBorderRadius,
		borderRadius,
		setBorderRadius,
		padding,
		setPadding,
		cropRegion,
		setCropRegion,
		webcam,
		setWebcam,
		resolvedWebcamVideoUrl,
		setResolvedWebcamVideoUrl,
	};
}
