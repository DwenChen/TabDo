import type { SelectedSource, WindowBounds } from './types'
import { getScreen, parseWindowId } from './utils'
import { convertPhysicalBoundsToDip } from './windowsCaptureSelection'
import { queryWindowsCapture } from './windowsCaptureWorker'

/**
 * 使用原版 HWND 前置逻辑恢复用户所选应用，复用当前操作链的原生查询进程。
 * @param windowId 用户选择的窗口身份。
 * @returns 窗口前置请求完成后的 Promise。
 * @throws 原生查询失败时抛出。
 */
export async function bringWindowsWindowForward(windowId: number): Promise<void> {
  await queryWindowsCapture('front', windowId)
}

/**
 * 查询所选窗口的实时 DWM 边界并转换为 Electron DIP 坐标。
 * @param source 用户所选的可捕获应用窗口。
 * @returns 可见窗口的真实边界；窗口失效时返回空值。
 */
export async function resolveWindowsWindowBounds(
  source: SelectedSource
): Promise<WindowBounds | null> {
  const windowId = parseWindowId(source.id)
  if (!windowId) return null
  try {
    const bounds = await queryWindowsCapture('bounds', windowId)
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
    const electronScreen = getScreen()
    return typeof electronScreen.screenToDipPoint === 'function'
      ? convertPhysicalBoundsToDip(bounds, (point) => electronScreen.screenToDipPoint(point))
      : bounds
  } catch {
    return null
  }
}
