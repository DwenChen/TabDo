import { screen, type BrowserWindow } from 'electron'
import type { PluginWindowPosition } from '../../shared/pluginWindowConfig'
import {
  clampWindowSizeToWorkArea,
  resolveCenteredWindowOrigin,
  resolveCursorWindowOrigin,
  type CursorPoint,
  type WindowWorkArea
} from '../../shared/windowPlacement'

/** 可复用的窗口初始边界。 */
export interface WindowOpenBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 读取指定光标所在显示器的工作区，位置计算与光标使用同一套 DIP 坐标。
 * @param cursor 用于定位的光标坐标，省略时读取系统当前光标。
 * @returns 光标所在显示器及其工作区。
 */
function getCursorWorkArea(cursor?: CursorPoint): WindowWorkArea {
  const point = cursor ?? screen.getCursorScreenPoint()
  return screen.getDisplayNearestPoint(point).workArea
}

/**
 * 按打开位置和默认尺寸计算窗口初始边界。
 * @param position 跟随光标或固定居中。
 * @param size 开发者声明的窗口尺寸。
 * @param area 可选目标工作区，省略时使用光标所在显示器。
 * @param cursor 可选的触发光标；省略时读取系统当前光标。
 * @returns 已限制在工作区内的窗口边界。
 */
export function resolveWindowOpenBounds(
  position: PluginWindowPosition,
  size: { width: number; height: number },
  area?: WindowWorkArea,
  cursor?: CursorPoint
): WindowOpenBounds {
  const targetArea = area ?? getCursorWorkArea(cursor)
  const clampedSize = clampWindowSizeToWorkArea(size, targetArea)
  const origin =
    position === 'fixed'
      ? resolveCenteredWindowOrigin(clampedSize, targetArea)
      : resolveCursorWindowOrigin(cursor ?? screen.getCursorScreenPoint(), clampedSize, targetArea)
  return { ...origin, ...clampedSize }
}

/**
 * 在窗口首次显示前应用打开位置，不激活窗口也不触发用户尺寸记忆。
 * @param win 待定位的原生窗口。
 * @param position 跟随光标或固定居中。
 * @param cursor 可选的触发光标，位于超级面板触发点时优先于当前指针。
 * @returns 无返回值。
 */
export function placeWindowForOpen(
  win: BrowserWindow,
  position: PluginWindowPosition,
  cursor?: CursorPoint
): void {
  if (win.isDestroyed()) return
  const bounds = win.getBounds()
  const target = resolveWindowOpenBounds(
    position,
    {
      width: bounds.width,
      height: bounds.height
    },
    cursor ? getCursorWorkArea(cursor) : undefined,
    cursor
  )
  win.setBounds(target)
}
