/** 引导只使用工具与必要设置页，不包含系统指令教学。 */
export const GUIDE_PRACTICE_CODES = [
  'clipboard',
  'screenshot',
  'color-picker',
  'sticky-note',
  'float-content',
  'file-renamer',
  'folder-break',
  'local-search',
  'qrcode-scan',
  'image-annotate',
  'recognize',
  'latex-recognize',
  'screen-recorder',
  'screen-recorder-region',
  'screen-recorder-stop',
  'image-batch',
  'image-batch-folder',
  'image-manual-crop',
  'image-merge',
  'video-batch',
  'web-quick-open'
] as const

/**
 * 限制引导实例的统一启动链，避免从搜索结果绕过练习入口。
 * @param pluginName 已登记的插件身份。
 * @param code 请求的功能码。
 * @returns 是否允许在引导实例启动。
 */
export function isGuideLaunchAllowed(
  pluginName: string | undefined,
  code: string | undefined
): boolean {
  return (
    (pluginName === 'system' &&
      GUIDE_PRACTICE_CODES.includes(code as (typeof GUIDE_PRACTICE_CODES)[number])) ||
    (pluginName === 'setting' &&
      typeof code === 'string' &&
      code.startsWith('ui.router?') &&
      ['About', 'GeneralSetting', 'Shortcuts', 'Providers'].includes(
        new URLSearchParams(code.split('?')[1]).get('router') || ''
      ))
  )
}

export interface UsageGuideStatus {
  sandbox: boolean
  running: boolean
  retained: boolean
  awaitingChoice: boolean
  error: string
  samples: string
  report?: { completed: string[]; skipped: string[] }
}
