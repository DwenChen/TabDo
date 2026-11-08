import { useEffect } from 'react'
import type { useTimelineState } from '../state/useTimelineState'
import { buildKeyboardAnnotations } from '../keyboardDisplay'
import { mapZoomTelemetryToTimeline } from '../timeline/zoomSuggestionUtils'

/**
 * 等待所属素材的遥测与剪辑就绪，首次自动载入按键，不覆盖已保存选择或编辑内容。
 * @param timeline 当前项目轨道与更新入口。
 * @param sourcePath 当前原素材身份，防止异步遥测串入另一个项目。
 * @param durationMs 当前剪辑总时长。
 * @returns 无返回值；在尚未初始化的项目中创建一次按键轨道。
 */
export function useRecordedKeyboard(timeline: ReturnType<typeof useTimelineState>, sourcePath: string | null, durationMs: number): void {
  const { keyboardDisplayEnabled, setKeyboardDisplayEnabled, annotationRegions, setAnnotationRegions,
    cursorTelemetry, cursorTelemetrySourcePath, clipRegions } = timeline
  useEffect(() => {
    if (keyboardDisplayEnabled !== null || !sourcePath || cursorTelemetrySourcePath !== sourcePath || durationMs <= 0 || !clipRegions.length) return
    // 已有按键原样恢复；未保存按键的录制素材按当前剪辑映射，只追加一次。
    if (annotationRegions.some((region) => region.type === 'keystroke')) {
      setKeyboardDisplayEnabled(true)
      return
    }
    const track = Math.max(-1, ...annotationRegions.map((region) => region.trackIndex ?? 0)) + 1
    const keys = buildKeyboardAnnotations(mapZoomTelemetryToTimeline(cursorTelemetry, clipRegions), durationMs, track)
    if (!keys.length) return
    setAnnotationRegions((current) => [...current, ...keys])
    setKeyboardDisplayEnabled(true)
  }, [keyboardDisplayEnabled, setKeyboardDisplayEnabled, annotationRegions, setAnnotationRegions,
    cursorTelemetry, cursorTelemetrySourcePath, clipRegions, sourcePath, durationMs])
}
