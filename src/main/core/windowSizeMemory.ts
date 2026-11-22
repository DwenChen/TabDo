/**
 * 子组件与插件窗口的尺寸记忆。
 *
 * 内嵌正文和独立窗口共用同一份按功能键保存的宽高，避免打开时回退到默认尺寸，
 * 也避免同一插件的不同子组件互相覆盖。
 */

import databaseAPI from '../api/shared/database'
import { getDetachedWindowSizeKey } from '../../shared/pluginRuntimeNamespace'

/** 已保存的窗口尺寸，高度不含独立窗口标题栏。 */
export interface RememberedWindowSize {
  width: number
  height: number
}

/** 与独立窗口一致的最小可恢复尺寸。 */
const MIN_WIDTH = 400
const MIN_HEIGHT = 260

/**
 * 把尺寸限制到可恢复范围并取整。
 * @param width 目标宽度。
 * @param height 目标正文高度。
 * @returns 归一化后的窗口尺寸。
 */
export function normalizeRememberedWindowSize(width: number, height: number): RememberedWindowSize {
  return {
    width: Math.max(MIN_WIDTH, Math.round(width)),
    height: Math.max(MIN_HEIGHT, Math.round(height))
  }
}

/**
 * 读取指定子组件或插件上次保存的窗口尺寸。
 * @param pluginName 插件有效名称。
 * @param toolFeatureCode 内置工具功能码；第三方插件省略。
 * @returns 可用尺寸；缺失或数据无效时返回 null。
 */
export function readRememberedWindowSize(
  pluginName: string,
  toolFeatureCode?: string
): RememberedWindowSize | null {
  try {
    const sizes = databaseAPI.dbGet('detached-window-sizes')
    const sizeKey = getDetachedWindowSizeKey(pluginName, toolFeatureCode)
    if (!sizes || typeof sizes !== 'object' || Array.isArray(sizes)) return null
    const rawSize = (sizes as Record<string, unknown>)[sizeKey]
    if (!rawSize || typeof rawSize !== 'object') return null
    const width = Number((rawSize as Record<string, unknown>).width)
    const height = Number((rawSize as Record<string, unknown>).height)
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    return normalizeRememberedWindowSize(width, height)
  } catch (error) {
    console.error('[WindowSize] 读取窗口尺寸失败:', error)
    return null
  }
}

/**
 * 保存子组件或插件窗口尺寸，供同一功能下次打开使用。
 * @param pluginName 插件有效名称。
 * @param toolFeatureCode 内置工具功能码；第三方插件省略。
 * @param width 窗口宽度。
 * @param height 正文高度。
 * @returns 无返回值。
 */
export function writeRememberedWindowSize(
  pluginName: string,
  toolFeatureCode: string | undefined,
  width: number,
  height: number
): void {
  try {
    const size = normalizeRememberedWindowSize(width, height)
    const sizeKey = getDetachedWindowSizeKey(pluginName, toolFeatureCode)
    const existing = databaseAPI.dbGet('detached-window-sizes')
    const next = {
      ...(typeof existing === 'object' && existing !== null && !Array.isArray(existing)
        ? existing
        : {}),
      [sizeKey]: size
    }
    databaseAPI.dbPut('detached-window-sizes', next)
  } catch (error) {
    console.error('[WindowSize] 保存窗口尺寸失败:', error)
  }
}
