/**
 * 子组件与插件窗口的打开位置、可调整能力和默认尺寸配置。
 *
 * 配置来源为 `plugin.json`：功能上的 `window` 覆盖插件级 `window`，缺省时使用
 * “跟随光标 + 可调整”，由宿主在创建独立窗口时统一解释。
 */

/** 子组件或插件窗口的打开位置策略。 */
export type PluginWindowPosition = 'cursor' | 'fixed'

/** 归一化后的窗口配置。 */
export interface PluginWindowConfig {
  /** 跟随光标打开，或由宿主在当前显示器居中。 */
  position: PluginWindowPosition
  /** 是否允许用户拖动调整窗口大小和最大化。 */
  resizable: boolean
  /** 开发者声明的默认宽度，省略时使用宿主默认值。 */
  width?: number
  /** 开发者声明的默认正文高度，省略时使用宿主默认值。 */
  height?: number
}

/** 未声明时的宿主默认配置。 */
export const DEFAULT_PLUGIN_WINDOW_CONFIG: Readonly<PluginWindowConfig> = {
  position: 'cursor',
  resizable: true
}

/** 开发者默认尺寸的最小值与最大值，避免异常清单撑破工作区。 */
const MIN_DECLARED_SIZE = 120
const MAX_DECLARED_SIZE = 8000

/**
 * 读取有限的正数尺寸，其他值视为未声明。
 * @param value 清单中的原始尺寸值。
 * @returns 位于允许范围内的整数尺寸，无效时返回 undefined。
 */
function readDeclaredSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.min(MAX_DECLARED_SIZE, Math.max(MIN_DECLARED_SIZE, Math.round(value)))
}

/**
 * 将清单中的任意值归一化为受支持的窗口配置。
 * @param raw 清单声明的原始窗口配置对象。
 * @returns 只包含有效字段的窗口配置。
 */
export function normalizePluginWindowConfig(raw: unknown): PluginWindowConfig {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    position: source.position === 'fixed' ? 'fixed' : 'cursor',
    resizable: source.resizable !== false,
    width: readDeclaredSize(source.width),
    height: readDeclaredSize(source.height)
  }
}

/**
 * 解析功能实际使用的窗口配置，功能声明优先于插件级默认值。
 * @param pluginConfig 插件清单对象。
 * @param featureCode 当前启动的功能代码。
 * @returns 归一化后的窗口配置；清单无效时返回宿主默认值。
 */
export function resolvePluginWindowConfig(
  pluginConfig: unknown,
  featureCode?: string
): PluginWindowConfig {
  const config =
    pluginConfig && typeof pluginConfig === 'object'
      ? (pluginConfig as Record<string, unknown>)
      : {}
  const features = Array.isArray(config.features) ? config.features : []
  const feature = features.find(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && (item as Record<string, unknown>).code === featureCode
  )
  const merged = {
    ...normalizePluginWindowConfig(DEFAULT_PLUGIN_WINDOW_CONFIG),
    ...(config.window && typeof config.window === 'object' ? config.window : {}),
    ...(feature?.window && typeof feature.window === 'object' ? feature.window : {})
  }
  return normalizePluginWindowConfig(merged)
}
