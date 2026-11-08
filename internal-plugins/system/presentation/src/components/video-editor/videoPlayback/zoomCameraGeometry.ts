import type { ZoomCameraSettings } from '../types'

interface CameraCapture {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 按输出视口的逆透视射线保留所需原画面，避免先裁切取景再旋转导致露底。
 * @param stage 最终成片尺寸。
 * @param transform 已提交的二维取景变换。
 * @param camera 当前时间混合后的镜头参数。
 * @returns 包含输出视口和必要画外采样的整数像素范围，不超过原场景及视口的并集。
 */
export function computeZoomCameraCapture(
  stage: { width: number; height: number },
  transform: { x: number; y: number; scale: number },
  camera: ZoomCameraSettings
): CameraCapture {
  const { width, height } = stage
  const yaw = (camera.yaw * Math.PI) / 180
  const pitch = (camera.pitch * Math.PI) / 180
  const sy = Math.sin(yaw),
    cy = Math.cos(yaw)
  const sx = Math.sin(pitch),
    cx = Math.cos(pitch)
  const distance = camera.focalLength / 36
  const points: Array<{ x: number; y: number }> = []
  let crossesHorizon = false

  // 同号分母的单应变换在矩形边界上单调；跨越消失线时保留完整原场景。
  for (const x of [0, width]) {
    for (const y of [0, height]) {
      const qx = (x - width / 2) / width
      const qy = (y - height / 2) / width
      const a = distance * cy + qx * sy
      const b = distance * sy * sx - qx * cy * sx
      const c = qy * sy
      const e = distance * cx - qy * cy * sx
      const determinant = a * e - b * c
      if (determinant <= 0.00001) crossesHorizon = true
      points.push({
        x: ((distance * (qx * e - b * qy)) / determinant) * width + width / 2,
        y: ((distance * (a * qy - c * qx)) / determinant) * width + height / 2
      })
    }
  }

  // 光学虚化邻域也要取得真实画外像素；不把整个五倍场景无条件栅格化。
  const margin = 2 + (camera.depthOfField ? (16 * width) / 1920 : 0)
  const sourceRight = transform.x + width * transform.scale
  const sourceBottom = transform.y + height * transform.scale
  const left = crossesHorizon
    ? transform.x
    : Math.max(transform.x, Math.min(...points.map((p) => p.x)) - margin)
  const top = crossesHorizon
    ? transform.y
    : Math.max(transform.y, Math.min(...points.map((p) => p.y)) - margin)
  const right = crossesHorizon
    ? sourceRight
    : Math.min(sourceRight, Math.max(...points.map((p) => p.x)) + margin)
  const bottom = crossesHorizon
    ? sourceBottom
    : Math.min(sourceBottom, Math.max(...points.map((p) => p.y)) + margin)
  const x = Math.floor(Math.min(0, left))
  const y = Math.floor(Math.min(0, top))
  return {
    x,
    y,
    width: Math.ceil(Math.max(width, right)) - x,
    height: Math.ceil(Math.max(height, bottom)) - y
  }
}
