export const BUILTIN_SHORTCUT_DEFAULTS = {
  search: false,
  detach: false,
  settings: false,
  closePlugin: false,
  killPlugin: false,
  esc: false,
  devTools: false,
  recorderStop: false
} as const

export type BuiltinShortcutKey = keyof typeof BUILTIN_SHORTCUT_DEFAULTS
export type BuiltinShortcutConfig = Record<BuiltinShortcutKey, boolean>

/**
 * 统一读取内置快捷键，缺少设置时全部关闭，保留用户明确启用的条目。
 * @param settings 通用设置快照。
 * @returns 完整的内置快捷键开关。
 */
export function readBuiltinShortcuts(settings: any): BuiltinShortcutConfig {
  const configured = settings?.builtinAppShortcutsEnabled || {}
  return Object.fromEntries(
    Object.keys(BUILTIN_SHORTCUT_DEFAULTS).map((key) => [key, configured[key] === true])
  ) as BuiltinShortcutConfig
}
