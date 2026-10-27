import { systemPreferences } from '@tabdo/presentation-electron'
import { queryWindowsCapture } from './windowsCaptureWorker'
import { getNativeMacWindowsFrontToBack } from './cursor/bounds'
import type { CapturePickerWindow, SelectedSource } from './types'
import { getScreen, parseWindowId } from './utils'
import { getDesktopSources } from './register/sources'

/**
 * 按原版前后层级列出可捕获应用窗口，使用真实边界而非把窗口退化为整屏。
 * @returns 所有可见、未最小化且被 Electron 确认可捕获的应用窗口。
 * @throws 缺少捕获权限、平台不支持或原生列表失败时抛出。
 */
export async function listCapturePickerWindows(): Promise<CapturePickerWindow[]> {
  if (process.platform === 'darwin') {
    if (systemPreferences.getMediaAccessStatus('screen') !== 'granted')
      throw new Error('Allow screen recording in System Settings before picking a window.')
    const entries = await getNativeMacWindowsFrontToBack({ strict: true })
    return entries
      .filter(
        (entry) =>
          entry.ownerPid !== process.pid &&
          [entry.x, entry.y, entry.width, entry.height].every(Number.isFinite) &&
          (entry.width ?? 0) > 0 &&
          (entry.height ?? 0) > 0
      )
      .map((entry) => ({
        id: entry.id,
        appName: entry.appName ?? '',
        title: entry.windowTitle ?? entry.name,
        display_id: entry.display_id,
        x: entry.x!,
        y: entry.y!,
        width: entry.width!,
        height: entry.height!
      }))
  }
  if (process.platform !== 'win32') throw new Error('Use the source list on Linux.')
  const sources = await getDesktopSources(
    {
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    },
    { strict: true }
  )
  const capturable = sources.filter(
    (source): source is SelectedSource & { id: string } =>
      typeof source.id === 'string' && source.id.startsWith('window:')
  )
  const byId = new Map(capturable.map((source) => [parseWindowId(source.id), source]))
  const entries: unknown = await queryWindowsCapture('list')
  if (!Array.isArray(entries)) throw new Error('Unable to read window positions.')
  return entries.flatMap((entry) => {
    const source = byId.get(entry.id)
    if (
      !source ||
      ![entry.x, entry.y, entry.width, entry.height].every(Number.isFinite) ||
      entry.width <= 0 ||
      entry.height <= 0
    )
      return []
    const bounds = getScreen().screenToDipRect(null, entry)
    return [
      {
        ...bounds,
        id: source.id,
        appName: '',
        title: source.name,
        display_id: source.display_id
      }
    ]
  })
}
