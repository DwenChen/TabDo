import { Container, Filter, GlProgram, GpuProgram, Rectangle } from 'pixi.js'
import { resolveZoomCamera } from '../zoomCamera'
import type { ZoomRegion } from '../types'
import { computeZoomCameraCapture } from './zoomCameraGeometry'

const vertex = `
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  gl_Position = vec4(p.x * 2.0 / uOutputTexture.x - 1.0,
    p.y * 2.0 * uOutputTexture.z / uOutputTexture.y - uOutputTexture.z, 0.0, 1.0);
  vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`

// 射线与完整录屏平面求交；取景视口只限制输出，不能提前裁掉画外录屏内容。
const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uLens;
uniform vec4 uFrame;
uniform vec4 uOptics;
vec4 sampleScreen(vec2 pixel) {
  vec2 local = pixel - uOutputFrame.xy;
  vec2 uv = local * uInputSize.zw;
  if (local.x < 0.0 || local.y < 0.0 || local.x > uOutputFrame.z || local.y > uOutputFrame.w) return vec4(0.0);
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}
void main() {
  float sx = sin(uLens.y), cx = cos(uLens.y), sy = sin(uLens.x), cy = cos(uLens.x), d = uLens.z;
  vec2 q = (vTextureCoord * uInputSize.xy + uOutputFrame.xy - uFrame.xy * 0.5) / uFrame.x;
  float a = d * cy + q.x * sy, b = d * sy * sx - q.x * cy * sx;
  float c = q.y * sy, e = d * cx - q.y * cy * sx;
  float det = a * e - b * c;
  if (det <= 0.00001) { finalColor = vec4(0.0); return; }
  vec2 p = d * vec2(q.x * e - b * q.y, a * q.y - c * q.x) / det;
  vec2 pixel = p * uFrame.x + uFrame.xy * 0.5;
  float z = -sy * p.x + cy * sx * p.y;
  vec2 fp = (uOptics.xy - 0.5) * uFrame.xy / uFrame.x;
  float focusZ = -sy * fp.x + cy * sx * fp.y;
  float radius = min(16.0, abs(z - focusZ) * uLens.w) * uFrame.x / 1920.0;
  vec4 color = sampleScreen(pixel);
  if (radius > 0.15) {
    for (int i = 0; i < 12; i++) {
      float angle = float(i) * 2.39996323;
      vec2 offset = vec2(cos(angle), sin(angle)) * sqrt((float(i) + 0.5) / 12.0) * radius;
      color += sampleScreen(pixel + offset);
    }
    color /= 13.0;
  }
  float shine = pow(max(0.0, 1.0 - abs(p.x * 0.6 + p.y + sin(uLens.x) * 0.35) * 2.5), 5.0) * uOptics.z;
  color.rgb += vec3(shine) * color.a;
  finalColor = color;
}`

const globals = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>, uInputPixel: vec4<f32>, uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>, uGlobalFrame: vec4<f32>, uOutputTexture: vec4<f32>,
};
@group(0) @binding(0) var<uniform> g: GlobalFilterUniforms;
`
const gpuVertex =
  globals +
  `
struct Output { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn mainVertex(@location(0) aPosition: vec2<f32>,) -> Output {
  let p = aPosition * g.uOutputFrame.zw + g.uOutputFrame.xy;
  return Output(vec4<f32>(p.x * 2.0 / g.uOutputTexture.x - 1.0,
    p.y * 2.0 * g.uOutputTexture.z / g.uOutputTexture.y - g.uOutputTexture.z, 0.0, 1.0),
    aPosition * g.uOutputFrame.zw * g.uInputSize.zw);
}`
const gpuFragment =
  globals +
  `
struct LensUniforms { uLens: vec4<f32>, uFrame: vec4<f32>, uOptics: vec4<f32> };
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> lens: LensUniforms;
fn sampleScreen(pixel: vec2<f32>) -> vec4<f32> {
  let local = pixel - g.uOutputFrame.xy;
  if (local.x < 0.0 || local.y < 0.0 || local.x > g.uOutputFrame.z || local.y > g.uOutputFrame.w) { return vec4<f32>(0.0); }
  return textureSampleLevel(uTexture, uSampler, clamp(local * g.uInputSize.zw, g.uInputClamp.xy, g.uInputClamp.zw), 0.0);
}
@fragment fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let sx = sin(lens.uLens.y); let cx = cos(lens.uLens.y);
  let sy = sin(lens.uLens.x); let cy = cos(lens.uLens.x); let d = lens.uLens.z;
  let q = (uv * g.uInputSize.xy + g.uOutputFrame.xy - lens.uFrame.xy * 0.5) / lens.uFrame.x;
  let a = d * cy + q.x * sy; let b = d * sy * sx - q.x * cy * sx;
  let c = q.y * sy; let e = d * cx - q.y * cy * sx;
  let det = a * e - b * c;
  if (det <= 0.00001) { return vec4<f32>(0.0); }
  let p = d * vec2<f32>(q.x * e - b * q.y, a * q.y - c * q.x) / det;
  let pixel = p * lens.uFrame.x + lens.uFrame.xy * 0.5;
  let z = -sy * p.x + cy * sx * p.y;
  let fp = (lens.uOptics.xy - 0.5) * lens.uFrame.xy / lens.uFrame.x;
  let focusZ = -sy * fp.x + cy * sx * fp.y;
  let radius = min(16.0, abs(z - focusZ) * lens.uLens.w) * lens.uFrame.x / 1920.0;
  var color = sampleScreen(pixel);
  if (radius > 0.15) {
    for (var i = 0; i < 12; i++) {
      let angle = f32(i) * 2.39996323;
      let offset = vec2<f32>(cos(angle), sin(angle)) * sqrt((f32(i) + 0.5) / 12.0) * radius;
      color += sampleScreen(pixel + offset);
    }
    color /= 13.0;
  }
  let shine = pow(max(0.0, 1.0 - abs(p.x * 0.6 + p.y + sin(lens.uLens.x) * 0.35) * 2.5), 5.0) * lens.uOptics.z;
  return vec4<f32>(color.rgb + vec3<f32>(shine) * color.a, color.a);
}`

interface CaptureArea {
  previous: Rectangle | null
  active: Rectangle
}

interface CameraResources {
  filter: Filter
  areas: Map<Container, CaptureArea>
  clipping: Map<Filter, boolean>
}

const owned = new WeakMap<Container, CameraResources>()

/**
 * 为镜头及其运动模糊输入保留同一画外区域，避免子滤镜再次按成片视口裁切。
 * @param container 当前待更新的场景节点。
 * @param capture 最终输出坐标中的采样区域。
 * @param resources 当前会话的原状态和临时覆盖。
 * @returns 无返回值；释放镜头时恢复原裁切策略和区域。
 */
function preserveCameraInput(
  container: Container,
  capture: Rectangle,
  resources: CameraResources
): void {
  if (container.filters?.length) {
    for (const filter of container.filters) {
      if (!resources.clipping.has(filter)) resources.clipping.set(filter, filter.clipToViewport)
      filter.clipToViewport = false
    }
    let area = resources.areas.get(container)
    if (!area) {
      area = { previous: container.filterArea, active: new Rectangle() }
      resources.areas.set(container, area)
    } else if (container.filterArea !== area.active) {
      // 布局改变时保留最新的原区域，退出3D后不能恢复过期尺寸。
      area.previous = container.filterArea
    }
    const points = [
      container.toLocal({ x: capture.x, y: capture.y }),
      container.toLocal({ x: capture.right, y: capture.y }),
      container.toLocal({ x: capture.right, y: capture.bottom }),
      container.toLocal({ x: capture.x, y: capture.bottom })
    ]
    area.active.x = Math.min(...points.map((point) => point.x))
    area.active.y = Math.min(...points.map((point) => point.y))
    area.active.width = Math.max(...points.map((point) => point.x)) - area.active.x
    area.active.height = Math.max(...points.map((point) => point.y)) - area.active.y
    container.filterArea = area.active
  }
  for (const child of container.children) preserveCameraInput(child, capture, resources)
}

/**
 * 更新所属渲染会话的透视、景深与反光；二维或效果结束后立即释放临时滤镜。
 * @param container 保留原录屏平面、已应用二维取景变换的屏幕及光标容器。
 * @param stage 输出画面尺寸。
 * @param regions 当前变焦片段。
 * @param timeMs 当前媒体时间。
 * @param options 与二维镜头一致的时间设置。
 * @returns 无返回值；仅修改当前容器的镜头效果。
 */
export function applyZoomCamera(
  container: Container,
  stage: { width: number; height: number },
  regions: ZoomRegion[],
  timeMs: number,
  options: {
    connectZooms?: boolean
    connectedZoomGapMs?: number
    zoomInDurationMs?: number
    zoomOutDurationMs?: number
  }
): void {
  const { camera, strength } = resolveZoomCamera(regions, timeMs, options)
  if (strength <= 0 || !stage.width || !stage.height) {
    releaseZoomCamera(container)
    return
  }
  let resources = owned.get(container)
  // 滤镜仅归当前预览或导出实例所有，不能跨项目缓存 GPU 资源。
  if (!resources) {
    const filter = new Filter({
      clipToViewport: false,
      glProgram: GlProgram.from({ vertex, fragment, name: 'tabdo-zoom-camera' }),
      gpuProgram: GpuProgram.from({
        vertex: { source: gpuVertex, entryPoint: 'mainVertex' },
        fragment: { source: gpuFragment, entryPoint: 'mainFragment' }
      }),
      resources: {
        lens: {
          uLens: { value: new Float32Array(4), type: 'vec4<f32>' },
          uFrame: { value: new Float32Array(4), type: 'vec4<f32>' },
          uOptics: { value: new Float32Array(4), type: 'vec4<f32>' }
        }
      }
    })
    resources = { filter, areas: new Map(), clipping: new Map() }
    owned.set(container, resources)
    container.filters = [...(container.filters ?? []), filter]
  }
  // 只捕获逆投影需要的真实画外内容；画幅边界不再被当作录屏平面边缘。
  const capture = computeZoomCameraCapture(
    stage,
    {
      x: container.x,
      y: container.y,
      scale: container.scale.x
    },
    camera
  )
  preserveCameraInput(
    container,
    new Rectangle(capture.x, capture.y, capture.width, capture.height),
    resources
  )
  const { filter } = resources
  const uniforms = filter.resources.lens.uniforms
  uniforms.uLens = new Float32Array([
    (camera.yaw * Math.PI) / 180,
    (camera.pitch * Math.PI) / 180,
    camera.focalLength / 36,
    camera.depthOfField ? (70 / camera.aperture) * (camera.focalLength / 50) ** 2 * strength : 0
  ])
  uniforms.uFrame = new Float32Array([stage.width, stage.height, 0, 0])
  uniforms.uOptics = new Float32Array([
    camera.focus.cx,
    camera.focus.cy,
    camera.reflection ? 0.16 * strength : 0,
    0
  ])
}

/**
 * 从会话容器移除并销毁镜头滤镜，不触及媒体和持久配置。
 * @param container 当前会话所属的屏幕容器。
 * @returns 无返回值；重复释放安全。
 */
export function releaseZoomCamera(container: Container | null): void {
  if (!container) return
  const resources = owned.get(container)
  if (!resources) return
  const { filter } = resources
  container.filters = (container.filters ?? []).filter((entry) => entry !== filter)
  // 先撤销临时采样覆盖，再销毁GPU资源，保留原有二维模糊和最新布局区域。
  for (const [target, area] of resources.areas) {
    if (!target.destroyed && target.filterArea === area.active) target.filterArea = area.previous
  }
  for (const [target, clipping] of resources.clipping) target.clipToViewport = clipping
  filter.destroy()
  owned.delete(container)
}
