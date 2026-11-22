import { router } from '@/router'
import type { HistoryState } from 'vue-router'

export type ShortcutsSettingTab = 'builtin' | 'global' | 'app'

export type ShortcutsSettingCommandCmdType = 'text' | 'regex' | 'over' | 'img' | 'files' | 'window'

/**
 * 统一归一化快捷键目标字符串，兼容旧的“标题 / 指令”格式。
 */
export function normalizeShortcutTargetValue(value: string): string {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 2) {
    return `${parts[0]}/${parts[1]}`
  }

  return value.trim()
}

/**
 * 生成快捷键场景使用的 canonical target 字符串。
 */
export function buildShortcutTargetValue(target: {
  type: 'plugin' | 'direct'
  pluginName: string
  pluginTitle?: string
  cmdName: string
}): string {
  if (target.type === 'plugin') {
    return normalizeShortcutTargetValue(`${target.pluginName}/${target.cmdName}`)
  }

  return normalizeShortcutTargetValue(target.cmdName)
}

/**
 * 生成快捷键目标的兼容匹配候选值，便于识别旧存量配置。
 */
export function buildShortcutTargetCandidates(target: {
  type: 'plugin' | 'direct'
  pluginName: string
  pluginTitle: string
  groupTitle: string
  cmdName: string
}): string[] {
  const candidates = new Set<string>()

  candidates.add(buildShortcutTargetValue(target))

  if (target.type === 'plugin') {
    candidates.add(normalizeShortcutTargetValue(`${target.pluginTitle}/${target.cmdName}`))
    candidates.add(normalizeShortcutTargetValue(`${target.groupTitle}/${target.cmdName}`))
  }

  return Array.from(candidates)
}

export interface ShortcutsSettingCommandTargetOptionBase extends HistoryState {
  commandId: string
  type: 'plugin' | 'direct'
  subType?: 'app' | 'system-setting' | 'local-shortcut'
  path?: string
  groupKey: string
  groupTitle: string
  featureCode: string
  subtitle: string
  pluginName: string
  pluginTitle: string
  cmdName: string
  cmdType: ShortcutsSettingCommandCmdType
  icon?: string
  label: string
}

export interface ShortcutsSettingShortcutTargetOption extends ShortcutsSettingCommandTargetOptionBase {
  value: string
}

export interface ShortcutsSettingJumpFunction extends HistoryState {
  /**
   * 设置快捷键设置路径，传这个参数会直接打开快捷键设置页面
   */
  payload?: string
  /**
   * 类型
   */
  type?: string
  /**
   * 默认打开的 tab
   */
  tab?: ShortcutsSettingTab
}

/**
 * 快捷键跳转功能
 * @param config
 */
export function jumpFunctionShortcutsSetting(config: ShortcutsSettingJumpFunction): void {
  void router.replace({
    name: 'Shortcuts',
    query: { _t: Date.now() },
    state: { ...config }
  })
}
