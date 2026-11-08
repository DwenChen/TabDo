import { useEffect } from "react";
import { saveEditorPreferences } from "../editorPreferences";
import type { useAppearanceState } from "../state/useAppearanceState";

type Input = {
  appearance: ReturnType<typeof useAppearanceState>;
  whisperExecutablePath: string | null;
  whisperModelPath: string | null;
};

/**
 * 只持久化应用级偏好，项目外观由各自项目文件保存。
 * @param props 自动缩放选择与字幕引擎路径。
 * @returns 无返回值；偏好变化后沿原应用设置存储链保存。
 */
export function useEditorPreferencesPersistence({ appearance, whisperExecutablePath, whisperModelPath }: Input): void {
  useEffect(() => {
    // 保留旧设置及已保存预设，只更新跨项目适用的应用选项。
    saveEditorPreferences({
      autoApplyFreshRecordingAutoZooms: appearance.autoApplyFreshRecordingAutoZooms,
      whisperExecutablePath,
      whisperModelPath,
    });
  }, [appearance.autoApplyFreshRecordingAutoZooms, whisperExecutablePath, whisperModelPath]);
}
