import type { ArrowDirection, FigureData } from './types'

export const ARROW_DIRECTIONS: Record<ArrowDirection, string> = {
  up: '向上', down: '向下', left: '向左', right: '向右',
  'up-right': '右上', 'up-left': '左上', 'down-right': '右下', 'down-left': '左下'
}
export const ARROW_STYLES = { line: '直线箭头', solid: '饱满箭头', double: '双向箭头', dashed: '虚线箭头', cartoon: '弧形箭头', ribbon: '缎带箭头' } as const

/**
 * 归并已精简外观，旧项目继续显示最接近的六款形状。
 * @param style 已保存或缺省的箭头外观。
 * @returns 当前可选择的箭头外观。
 */
export function normalizeArrowStyle(style: FigureData['arrowStyle']): keyof typeof ARROW_STYLES {
  if (style === 'glass') return 'solid'
  if (style === 'neon') return 'line'
  if (style === 'chevron') return 'double'
  return style && style in ARROW_STYLES ? style as keyof typeof ARROW_STYLES : 'cartoon'
}

/**
 * 将横向贴纸等比放入任意方向的对象框，不裁掉旋转后的箭头尖角。
 * @param direction 箭头方向。
 * @param width 可用宽度。
 * @param height 可用高度。
 * @returns 旋转弧度与等比贴纸宽高。
 */
export function getStickerArrowLayout(direction: ArrowDirection, width: number, height: number) {
  const angles = { right: 0, down: 90, left: 180, up: -90, 'up-right': -45, 'up-left': -135, 'down-right': 45, 'down-left': 135 }
  const angle = (angles[direction] ?? 0) * Math.PI / 180
  const scale = Math.max(0, Math.min(width / (3 * Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))), height / (3 * Math.abs(Math.sin(angle)) + Math.abs(Math.cos(angle))))) * 0.92
  return { angle, width: 3 * scale, height: scale }
}

/**
 * 为侧栏、预览和导出生成相同的箭头路径与线型，旧项目默认线形。
 * @param direction 箭头指向。
 * @param style 箭头外观。
 * @returns 百分比坐标中的路径、填充和虚线参数。
 */
export function getArrowGeometry(direction: ArrowDirection, style: FigureData['arrowStyle'] = 'line'): { paths: string[]; filled: boolean; dashed: boolean } {
  const angles: Record<ArrowDirection, number> = { right: 0, down: 90, left: 180, up: -90, 'up-right': -45, 'up-left': -135, 'down-right': 45, 'down-left': 135 }
  const angle = (angles[direction] ?? 0) * Math.PI / 180
  /**
   * 旋转路径中的点，保留首尾命令供 SVG 和 Canvas 共用。
   * @param points 路径点及其绘制命令。
   * @returns 旋转后的 SVG 路径。
   */
  function path(points: Array<[string, number, number]>): string {
    return points.map(([cmd, x, y]) => `${cmd} ${50 + (x - 50) * Math.cos(angle) - (y - 50) * Math.sin(angle)} ${50 + (x - 50) * Math.sin(angle) + (y - 50) * Math.cos(angle)}`).join(' ')
  }
  if (style === 'solid') return { paths: [path([['M', 20, 43], ['L', 58, 43], ['L', 58, 30], ['L', 80, 50], ['L', 58, 70], ['L', 58, 57], ['L', 20, 57]]) + ' Z'], filled: true, dashed: false }
  const paths = [path([['M', 20, 50], ['L', 80, 50]]), path([['M', 65, 35], ['L', 80, 50], ['L', 65, 65]])]
  if (style === 'double') paths.push(path([['M', 35, 35], ['L', 20, 50], ['L', 35, 65]]))
  return { paths, filled: false, dashed: style === 'dashed' }
}
