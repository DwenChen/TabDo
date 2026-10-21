export interface CaptureRectangle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 在工作区内选择不覆盖录制区域的控制条位置，优先贴近区域下方，其次上方和侧面。
 * @param capture 录制区域的全局 DIP 坐标。
 * @param areas 可用显示器工作区，首项为录制所在显示器。
 * @param size 控制条的客户区大小。
 * @returns 控制条坐标；无可避让位置时停靠工作区边缘并依赖系统排除捕获。
 */
export function placeRecorderControl(
  capture: CaptureRectangle,
  areas: CaptureRectangle[],
  size: { width: number; height: number }
): CaptureRectangle {
  const gap = 12
  /**
   * 检查控制条与录区是否占用同一像素区域。
   * @param a 第一个矩形。
   * @param b 第二个矩形。
   * @returns 两矩形是否重叠。
   */
  const overlaps = (a: CaptureRectangle, b: CaptureRectangle): boolean =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  for (const area of areas) {
    /**
     * 把横坐标限制在当前工作区内。
     * @param x 候选横坐标。
     * @returns 工作区内的横坐标。
     */
    const clampX = (x: number): number =>
      Math.max(area.x, Math.min(x, area.x + area.width - size.width))
    /**
     * 把纵坐标限制在当前工作区内。
     * @param y 候选纵坐标。
     * @returns 工作区内的纵坐标。
     */
    const clampY = (y: number): number =>
      Math.max(area.y, Math.min(y, area.y + area.height - size.height))
    const positions = [
      {
        x: clampX(capture.x + (capture.width - size.width) / 2),
        y: capture.y + capture.height + gap
      },
      { x: clampX(capture.x + (capture.width - size.width) / 2), y: capture.y - size.height - gap },
      { x: capture.x + capture.width + gap, y: clampY(capture.y) },
      { x: capture.x - size.width - gap, y: clampY(capture.y) },
      { x: area.x + area.width - size.width - gap, y: area.y + gap },
      { x: area.x + gap, y: area.y + gap }
    ]
    for (const position of positions) {
      const rectangle = { x: Math.round(position.x), y: Math.round(position.y), ...size }
      if (
        rectangle.x >= area.x &&
        rectangle.y >= area.y &&
        rectangle.x + size.width <= area.x + area.width &&
        rectangle.y + size.height <= area.y + area.height &&
        !overlaps(rectangle, capture)
      )
        return rectangle
    }
  }
  const area = areas[0]
  return {
    x: Math.round(area.x + Math.max(0, area.width - size.width - gap)),
    y: Math.round(area.y + gap),
    ...size
  }
}
