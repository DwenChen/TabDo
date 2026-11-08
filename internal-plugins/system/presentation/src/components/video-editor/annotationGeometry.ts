export interface AnnotationBox {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

/**
 * 将有限角度折叠到一周，避免多次拖动后累积无界值。
 * @param degrees 顺时针角度。
 * @returns 0 至 360 度之间的角度；无效值返回零。
 */
export function normalizeAnnotationRotation(degrees = 0): number {
  return Number.isFinite(degrees) ? ((degrees % 360) + 360) % 360 : 0
}

/**
 * 在对象局部坐标中缩放角点，保持旋转后对角点的世界位置不变。
 * @param box 手势开始时的对象几何。
 * @param dx 预览坐标中的横向位移。
 * @param dy 预览坐标中的纵向位移。
 * @param corner 当前角点的横向、纵向符号。
 * @returns 缩放后的几何，宽高至少为八个预览像素。
 */
export function resizeAnnotationBox(
  box: AnnotationBox,
  dx: number,
  dy: number,
  corner: [number, number]
): AnnotationBox {
  const angle = (box.rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle)
  const width = Math.max(8, box.width + corner[0] * (dx * c + dy * s))
  const height = Math.max(8, box.height + corner[1] * (-dx * s + dy * c))
  const localX = ((width - box.width) * corner[0]) / 2,
    localY = ((height - box.height) * corner[1]) / 2
  return {
    ...box,
    width,
    height,
    x: box.x + (box.width - width) / 2 + localX * c - localY * s,
    y: box.y + (box.height - height) / 2 + localX * s + localY * c
  }
}
