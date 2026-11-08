import { ZOOM_DEPTH_SCALES, type ZoomCameraSettings, type ZoomRegion } from './types'
import { findDominantRegion } from './videoPlayback/zoomRegionUtils'
import { canConnectZoomRegions } from './zoomConnection'

export const DEFAULT_ZOOM_CAMERA: ZoomCameraSettings = {
  mode: '2d',
  yaw: 0,
  pitch: 0,
  focalLength: 50,
  aperture: 2.8,
  depthOfField: false,
  reflection: false,
  focus: { cx: 0.5, cy: 0.5 }
}

/**
 * 将外部数值限制到镜头支持范围，拒绝非有限值。
 * @param value 输入数值。
 * @param fallback 缺失或非法时的默认值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 有限且位于范围内的数值。
 */
function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

/**
 * 补齐镜头模型，保持旧项目为二维并保留用户显式参数。
 * @param camera 待校验的项目镜头设置。
 * @returns 可独立编辑的完整镜头模型。
 */
export function normalizeZoomCamera(
  camera?: Partial<ZoomCameraSettings> | null
): ZoomCameraSettings {
  return {
    mode: camera?.mode === '3d' ? '3d' : '2d',
    yaw: finite(camera?.yaw, 0, -45, 45),
    pitch: finite(camera?.pitch, 0, -45, 45),
    focalLength: finite(camera?.focalLength, 50, 18, 200),
    aperture: finite(camera?.aperture, 2.8, 1.4, 22),
    depthOfField: camera?.depthOfField === true,
    reflection: camera?.reflection === true,
    focus: { cx: finite(camera?.focus?.cx, 0.5, 0, 1), cy: finite(camera?.focus?.cy, 0.5, 0, 1) }
  }
}

/**
 * 读取连续倍率或旧项目六档倍率。
 * @param region 当前变焦片段。
 * @returns 1至5倍之间的连续倍率；旧档位保持原值。
 */
export function getZoomScale(region: Pick<ZoomRegion, 'depth' | 'scale'>): number {
  return finite(region.scale, ZOOM_DEPTH_SCALES[region.depth] ?? 1.5, 1, 5)
}

/**
 * 为变焦片段生成统一可见名称和悬停说明，只展示当前模式实际生效的镜头参数。
 * @param region 当前片段的倍率、镜头及取景方式；缺失镜头保持旧项目二维行为。
 * @returns 包含2D/3D、倍率的简短名称，以及取景和有效光学参数的完整说明。
 */
export function getZoomPresentation(
  region: Pick<ZoomRegion, 'depth' | 'scale' | 'camera' | 'mode'>
): { label: string; description: string } {
  const camera = normalizeZoomCamera(region.camera)
  const mode = camera.mode === '3d' ? '3D' : '2D'
  const scale = `${Number(getZoomScale(region).toFixed(2))}×`
  const label = `${mode} · ${scale}`
  const details = [`${mode} 镜头 · ${scale}`, region.mode === 'manual' ? '手动取景' : '自动取景']
  if (camera.mode === '3d') {
    details.push(`水平 ${camera.yaw}°`, `俯仰 ${camera.pitch}°`, `焦距 ${camera.focalLength} mm`)
    details.push(
      camera.depthOfField
        ? `景深开启 · 光圈 f/${camera.aperture.toFixed(1)} · 对焦 ${Math.round(camera.focus.cx * 100)}% / ${Math.round(camera.focus.cy * 100)}%`
        : '景深关闭'
    )
    details.push(camera.reflection ? '屏幕反光开启' : '屏幕反光关闭')
  }
  return { label, description: details.join(' · ') }
}

/**
 * 按媒体时间解析三维镜头，进出场回到正面，相邻镜头在同一连接窗口混合。
 * @param regions 当前项目变焦片段。
 * @param timeMs 剪辑时间轴毫秒。
 * @param options 与二维相机共用的进出场及连接设置。
 * @returns 当前帧的镜头及效果权重。
 */
export function resolveZoomCamera(
  regions: ZoomRegion[],
  timeMs: number,
  options: {
    connectZooms?: boolean
    connectedZoomGapMs?: number
    zoomInDurationMs?: number
    zoomOutDurationMs?: number
  } = {}
): { camera: ZoomCameraSettings; strength: number } {
  const dominant = findDominantRegion(regions, timeMs, options)
  const camera = normalizeZoomCamera(dominant.region?.camera)
  const strength = camera.mode === '3d' ? dominant.strength : 0
  // 连接期间用两端相机插值，避免在片段交界突然翻转。
  if (options.connectZooms) {
    const sorted = [...regions].sort((a, b) => a.startMs - b.startMs)
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i],
        b = sorted[i + 1],
        start = a.endMs + 500
      if (
        !canConnectZoomRegions(a, b, options.connectedZoomGapMs) ||
        timeMs < start ||
        timeMs >= start + 1000
      )
        continue
      const left = normalizeZoomCamera(a.camera),
        right = normalizeZoomCamera(b.camera)
      const raw = (timeMs - start) / 1000,
        t = raw * raw * (3 - 2 * raw)
      const ls = left.mode === '3d' ? 1 : 0,
        rs = right.mode === '3d' ? 1 : 0
      return {
        camera: {
          ...right,
          mode: ls || rs ? '3d' : '2d',
          yaw: left.yaw * ls * (1 - t) + right.yaw * rs * t,
          pitch: left.pitch * ls * (1 - t) + right.pitch * rs * t,
          focalLength: left.focalLength * (1 - t) + right.focalLength * t,
          aperture: left.aperture * (1 - t) + right.aperture * t,
          depthOfField: left.depthOfField || right.depthOfField,
          reflection: left.reflection || right.reflection,
          focus: {
            cx: left.focus.cx * (1 - t) + right.focus.cx * t,
            cy: left.focus.cy * (1 - t) + right.focus.cy * t
          }
        },
        strength: ls * (1 - t) + rs * t
      }
    }
  }
  return {
    camera: { ...camera, yaw: camera.yaw * strength, pitch: camera.pitch * strength },
    strength
  }
}
