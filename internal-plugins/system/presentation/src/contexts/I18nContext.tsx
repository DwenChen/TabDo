import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { I18nNamespace } from '../i18n/config'
import common from '../i18n/locales/zh-CN/common.json'
import launch from '../i18n/locales/zh-CN/launch.json'
import editor from '../i18n/locales/zh-CN/editor.json'
import timeline from '../i18n/locales/zh-CN/timeline.json'
import settings from '../i18n/locales/zh-CN/settings.json'
import dialogs from '../i18n/locales/zh-CN/dialogs.json'
import shortcuts from '../i18n/locales/zh-CN/shortcuts.json'
const messages: Record<string, unknown> = {
  common,
  launch,
  editor,
  timeline,
  settings,
  dialogs,
  shortcuts
}
/**
 * 读取唯一的简体中文消息，插入本次动作的数据。
 * @param _locale 兼容保留参数，始终使用中文。
 * @param key 消息路径。
 * @param fallback 缺少资源时的说明。
 * @param vars 插入参数。
 * @returns 用户可读的中文消息。
 */
export function translateForLocale(
  _locale: string,
  key: string,
  fallback?: string,
  vars?: Record<string, string | number>
) {
  const parts = key.split('.')
  if (!(parts[0] in messages)) parts.unshift('common')
  let value: any = messages
  for (const part of parts) value = value?.[part]
  const result = typeof value === 'string' ? value : fallback || key
  return result.replace(/\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}/g, (_all, name) =>
    String(vars?.[name] ?? '')
  )
}
/**
 * 固定中文环境，不读取或保存原工程语言选择。
 * @param children 当前界面。
 * @returns 当前界面。
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  return children
}
/**
 * 提供当前固定中文翻译器。
 * @returns 中文环境和翻译函数。
 */
export function useI18n() {
  return {
    locale: 'zh-CN' as const,
    setLocale: () => {},
    t: translateChinese
  }
}
/**
 * 使用稳定的翻译函数身份，避免界面更新反复启动资源加载 effect。
 * @param key 消息路径。
 * @param fallback 缺少资源时的中文说明。
 * @param vars 当前插入数据。
 * @returns 插入数据后的中文文字。
 */
function translateChinese(key: string, fallback?: string, vars?: Record<string, string | number>) {
  return translateForLocale('zh-CN', key, fallback, vars)
}
/**
 * 将中文消息命名空间绑定到组件。
 * @param namespace 消息类别。
 * @returns 当前类别的翻译函数。
 */
export function useScopedT(namespace: I18nNamespace) {
  return useCallback(
    (key: string, fallback?: string, vars?: Record<string, string | number>) =>
      translateForLocale('zh-CN', namespace + '.' + key, fallback, vars),
    [namespace]
  )
}
