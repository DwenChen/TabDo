/**
 * 子组件、插件与悬浮内容窗口的初始位置计算。
 *
 * 只处理纯几何，不访问 Electron；原生窗口在显示前用这里的结果设置边界。
 */

/** 窗口尺寸。 */
export interface WindowSize {
  width: number
  height: number
}

/** 显示器工作区。 */
export interface WindowWorkArea {
  x: number
  y: number
  width: number
  height: number
}

/** 窗口左上角坐标。 */
export interface WindowOrigin {
  x: number
  y: number
}

/** 光标位置。 */
export interface CursorPoint {
  x: number
  y: number
}

/** 光标与窗口之间保留的间距。 */
const CURSOR_GAP = 12

/**
 * 把窗口尺寸限制在当前工作区内。
 * @param size 期望的窗口尺寸。
 * @param area 目标显示器工作区。
 * @returns 不超过工作区的整数尺寸。
 */
export function clampWindowSizeToWorkArea(size: WindowSize, area: WindowWorkArea): WindowSize {
  return {
    width: Math.max(1, Math.min(Math.round(size.width), area.width)),
    height: Math.max(1, Math.min(Math.round(size.height), area.height))
  }
}

/**
 * 把坐标限制在工作区内，窗口大于工作区时贴齐左上角。
 * @param origin 候选窗口坐标。
 * @param size 窗口尺寸。
 * @param area 目标显示器工作区。
 * @returns 工作区内的整数坐标。
 */
function clampOrigin(origin: WindowOrigin, size: WindowSize, area: WindowWorkArea): WindowOrigin {
  return {
    x: Math.round(Math.max(area.x, Math.min(origin.x, area.x + area.width - size.width))),
    y: Math.round(Math.max(area.y, Math.min(origin.y, area.y + area.height - size.height)))
  }
}

/**
 * 计算跟随光标的窗口坐标：优先放在光标右下方，空间不足时翻到左侧或上方。
 * @param cursor 触发时的系统光标坐标（DIP）。
 * @param size 窗口尺寸。
 * @param area 光标所在显示器工作区。
 * @returns 不遮挡光标的窗口左上角坐标。
 */
export function resolveCursorWindowOrigin(
  cursor: CursorPoint,
  size: WindowSize,
  area: WindowWorkArea
): WindowOrigin {
  const right = area.x + area.width
  const bottom = area.y + area.height
  const preferredX =
    cursor.x + CURSOR_GAP + size.width <= right
      ? cursor.x + CURSOR_GAP
      : cursor.x - CURSOR_GAP - size.width
  const preferredY =
    cursor.y + CURSOR_GAP + size.height <= bottom
      ? cursor.y + CURSOR_GAP
      : cursor.y - CURSOR_GAP - size.height
  return clampOrigin({ x: preferredX, y: preferredY }, size, area)
}

/**
 * 计算固定窗口的坐标，在当前显示器工作区内居中。
 * @param size 窗口尺寸。
 * @param area 目标显示器工作区。
 * @returns 居中后的窗口左上角坐标。
 */
export function resolveCenteredWindowOrigin(size: WindowSize, area: WindowWorkArea): WindowOrigin {
  return clampOrigin(
    {
      x: area.x + Math.round((area.width - size.width) / 2),
      y: area.y + Math.round((area.height - size.height) / 2)
    },
    size,
    area
  )
}
