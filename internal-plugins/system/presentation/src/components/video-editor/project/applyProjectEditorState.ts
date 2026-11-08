import type { Dispatch, SetStateAction } from 'react'
import type { AspectRatio } from '@presentation/utils/aspectRatioUtils'
import type { ProjectEditorState } from '../projectPersistence'
import type { useAppearanceState } from '../state/useAppearanceState'
import type { useTimelineState } from '../state/useTimelineState'

/**
 * 发布完整的项目编辑状态，供项目加载与撤销重做共用，不修改素材身份或播放位置。
 * @param editor 已规范化的持久编辑状态。
 * @param appearance 外观状态更新入口。
 * @param timeline 轨道状态更新入口。
 * @param setAspectRatio 成片比例更新入口。
 * @returns 无返回值；同步发布编辑参数。
 */
export function applyProjectEditorState(editor: ProjectEditorState, appearance: ReturnType<typeof useAppearanceState>,
  timeline: ReturnType<typeof useTimelineState>, setAspectRatio: Dispatch<SetStateAction<AspectRatio>>): void {
		appearance.setWallpaper(editor.wallpaper);
		appearance.setShadowIntensity(editor.shadowIntensity);
		appearance.setBackgroundBlur(editor.backgroundBlur);
		appearance.setZoomMotionBlur(editor.zoomMotionBlur);
		appearance.setZoomMotionBlurTuning({ ...editor.zoomMotionBlurTuning });
		appearance.setConnectZooms(editor.connectZooms);
		appearance.setZoomInDurationMs(editor.zoomInDurationMs);
		appearance.setZoomInOverlapMs(editor.zoomInOverlapMs);
		appearance.setZoomOutDurationMs(editor.zoomOutDurationMs);
		appearance.setConnectedZoomGapMs(editor.connectedZoomGapMs);
		appearance.setConnectedZoomDurationMs(editor.connectedZoomDurationMs);
		appearance.setZoomInEasing(editor.zoomInEasing);
		appearance.setZoomOutEasing(editor.zoomOutEasing);
		appearance.setConnectedZoomEasing(editor.connectedZoomEasing);
		appearance.setShowCursor(editor.showCursor);
		appearance.setLoopCursor(editor.loopCursor);
		appearance.setCursorStyle(editor.cursorStyle);
		appearance.setCursorSize(editor.cursorSize);
		appearance.setCursorSmoothing(editor.cursorSmoothing);
		appearance.setCursorSpringStiffnessMultiplier(editor.cursorSpringStiffnessMultiplier);
		appearance.setCursorSpringDampingMultiplier(editor.cursorSpringDampingMultiplier);
		appearance.setCursorSpringMassMultiplier(editor.cursorSpringMassMultiplier);
		appearance.setCameraSpringStiffnessMultiplier(editor.cameraSpringStiffnessMultiplier);
		appearance.setCameraSpringDampingMultiplier(editor.cameraSpringDampingMultiplier);
		appearance.setCameraSpringMassMultiplier(editor.cameraSpringMassMultiplier);
		appearance.setCursorClickEffect(editor.cursorClickEffect);
		appearance.setCursorClickEffectColor(editor.cursorClickEffectColor);
		appearance.setCursorClickEffectScale(editor.cursorClickEffectScale);
		appearance.setCursorClickEffectOpacity(editor.cursorClickEffectOpacity);
		appearance.setCursorClickEffectDurationMs(editor.cursorClickEffectDurationMs);
		appearance.setZoomSmoothness(editor.zoomSmoothness);
		appearance.setZoomClassicMode(editor.zoomClassicMode);
		appearance.setCursorMotionBlur(editor.cursorMotionBlur);
		appearance.setCursorClickBounce(editor.cursorClickBounce);
		appearance.setCursorClickBounceDuration(editor.cursorClickBounceDuration);
		appearance.setCursorSway(editor.cursorSway);
		appearance.setBorderRadius(editor.borderRadius);
		appearance.setBackgroundBorderRadius(editor.backgroundBorderRadius ?? 0);
		appearance.setPadding(editor.padding);
		appearance.setCropRegion(editor.cropRegion);
		appearance.setWebcam(editor.webcam);
		timeline.setZoomRegions(editor.zoomRegions);
		timeline.setTrimRegions(editor.trimRegions);
		timeline.setTrackOrder(editor.trackOrder ?? []);
		timeline.setClipRegions(editor.clipRegions);
		timeline.setSpeedRegions(editor.speedRegions);
		timeline.setAnnotationRegions(editor.annotationRegions);
		timeline.setKeyboardDisplayEnabled(editor.keyboardDisplayEnabled);
		timeline.setAudioRegions(editor.audioRegions);
		timeline.setSourceAudioTrackSettingsByClip(editor.sourceAudioTrackSettingsByClip ?? {});
		timeline.setDefaultSourceAudioTrackSettings(editor.defaultSourceAudioTrackSettings ?? {});
		timeline.setAutoCaptions(editor.autoCaptions);
		timeline.setAutoCaptionSettings(editor.autoCaptionSettings);
		setAspectRatio(editor.aspectRatio);
}
