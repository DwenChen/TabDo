import { describe, expect, it } from 'vitest'
import {
  getZoomScale,
  getZoomPresentation,
  normalizeZoomCamera,
  resolveZoomCamera
} from '../../internal-plugins/system/presentation/src/components/video-editor/zoomCamera'
import { normalizeProjectEditor } from '../../internal-plugins/system/presentation/src/components/video-editor/projectPersistence'
import { resetProjectEditorSection } from '../../internal-plugins/system/presentation/src/components/video-editor/editorDefaults'
import { resolveSceneZoomTarget } from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/sceneMotion'
import { createCursorFollowCameraState } from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/cursorFollowCamera'
import type { ZoomRegion } from '../../internal-plugins/system/presentation/src/components/video-editor/types'
import { computeZoomCameraCapture } from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/zoomCameraGeometry'

const legacy: ZoomRegion = {
  id: 'zoom-1',
  startMs: 0,
  endMs: 4000,
  depth: 3,
  focus: { cx: 0.5, cy: 0.5 },
  mode: 'manual'
}

describe('演示连续变焦及三维镜头项目兼容', () => {
  it('片段名称区分二维与三维，悬停只说明当前有效镜头与光学参数', () => {
    expect(getZoomPresentation(legacy)).toEqual({
      label: '2D · 1.8×',
      description: '2D 镜头 · 1.8× · 手动取景'
    })
    const region = {
      ...legacy,
      scale: 1.41,
      camera: normalizeZoomCamera({ mode: '3d', yaw: -22, pitch: 13, aperture: 1.4 })
    }
    const closed = getZoomPresentation(region)
    expect(closed.label).toBe('3D · 1.41×')
    expect(closed.description).toContain('水平 -22° · 俯仰 13° · 焦距 50 mm · 景深关闭')
    expect(closed.description).not.toContain('光圈')
    const open = getZoomPresentation({
      ...region,
      camera: { ...region.camera, depthOfField: true }
    })
    expect(open.description).toContain('光圈 f/1.4 · 对焦 50% / 50%')
    expect(open.description).toContain('屏幕反光关闭')
  })
  it('深度放大保留逆透视需要的画外内容，采样不膨胀为完整五倍场景', () => {
    const capture = computeZoomCameraCapture(
      { width: 1920, height: 1080 },
      { x: -3840, y: -2160, scale: 5 },
      normalizeZoomCamera({ mode: '3d', yaw: 35, pitch: 20 })
    )
    expect(capture.x).toBeLessThan(0)
    expect(capture.y).toBeLessThan(0)
    expect(capture.x + capture.width).toBeGreaterThan(1920)
    expect(capture.y + capture.height).toBeGreaterThan(1080)
    expect(capture.width).toBeLessThan(3840)
    expect(capture.height).toBeLessThan(2160)
  })
  it('靠边取景的采样不越过原场景边界，同时保留完整输出视口', () => {
    const capture = computeZoomCameraCapture(
      { width: 640, height: 360 },
      { x: 250, y: -180, scale: 2 },
      normalizeZoomCamera({ mode: '3d', yaw: 35, pitch: 20, depthOfField: true })
    )
    expect(capture.x).toBe(0)
    expect(capture.y).toBeGreaterThanOrEqual(-180)
    expect(capture.x + capture.width).toBeGreaterThanOrEqual(640)
    expect(capture.x + capture.width).toBeLessThanOrEqual(1530)
    expect(capture.y + capture.height).toBeGreaterThanOrEqual(360)
    expect(capture.y + capture.height).toBeLessThanOrEqual(540)
  })
  it('最短焦距和极端角度跨越消失线时采样有界且有限', () => {
    const capture = computeZoomCameraCapture(
      { width: 1920, height: 1080 },
      { x: -3840, y: -2160, scale: 5 },
      normalizeZoomCamera({ mode: '3d', yaw: 45, pitch: 45, focalLength: 18 })
    )
    expect(capture).toEqual({ x: -3840, y: -2160, width: 9600, height: 5400 })
  })
  it('旧六档倍率不变，缺失镜头参数保持二维', () => {
    for (const [depth, scale] of [
      [1, 1.25],
      [2, 1.5],
      [3, 1.8],
      [4, 2.2],
      [5, 3.5],
      [6, 5]
    ]) {
      const editor = normalizeProjectEditor({
        zoomRegions: [{ ...legacy, depth: depth as ZoomRegion['depth'] }]
      })
      expect(getZoomScale(editor.zoomRegions[0])).toBe(scale)
      expect(resolveZoomCamera(editor.zoomRegions, 2000).strength).toBe(0)
    }
  })
  it('任意小数倍率和光学参数经过JSON保存及归一化后完整保留', () => {
    const region = {
      ...legacy,
      scale: 1.41,
      camera: normalizeZoomCamera({
        mode: '3d',
        yaw: -22,
        pitch: 13,
        focalLength: 85,
        aperture: 1.8,
        depthOfField: true,
        reflection: true,
        focus: { cx: 0.23, cy: 0.78 }
      })
    }
    const editor = normalizeProjectEditor(JSON.parse(JSON.stringify({ zoomRegions: [region] })))
    expect(editor.zoomRegions[0]).toEqual(region)
    const target = resolveSceneZoomTarget({
      zoomRegions: editor.zoomRegions,
      timeMs: 2000,
      cursorFollowCamera: createCursorFollowCameraState()
    })
    expect(target.scale).toBe(1.41)
    expect(target.progress).toBe(1)
  })
  it('损坏输入有界，不让NaN或极端角度进入GPU', () => {
    expect(getZoomScale({ ...legacy, scale: NaN })).toBe(1.8)
    expect(getZoomScale({ ...legacy, scale: 90 })).toBe(5)
    expect(
      normalizeZoomCamera({
        yaw: Infinity,
        pitch: 999,
        aperture: -1,
        focalLength: NaN,
        focus: { cx: -1, cy: 2 }
      })
    ).toMatchObject({
      mode: '2d',
      yaw: 0,
      pitch: 45,
      aperture: 1.4,
      focalLength: 50,
      focus: { cx: 0, cy: 1 }
    })
  })
  it('镜头按时间进出场，结束后恢复二维，相邻3D/2D连接不跳变', () => {
    const first = {
      ...legacy,
      endMs: 2000,
      camera: normalizeZoomCamera({ mode: '3d', yaw: 30, pitch: 20 })
    }
    const next = { ...legacy, id: 'zoom-2', startMs: 2400, endMs: 6000 }
    expect(resolveZoomCamera([first], -10000).strength).toBe(0)
    expect(resolveZoomCamera([first], 1500).camera.yaw).toBe(30)
    expect(resolveZoomCamera([first], 9000).strength).toBe(0)
    const left = resolveZoomCamera([first, next], 2500, { connectZooms: true })
    const middle = resolveZoomCamera([first, next], 3000, { connectZooms: true })
    const right = resolveZoomCamera([first, next], 3499, { connectZooms: true })
    expect(left.camera.yaw).toBe(30)
    expect(middle.camera.yaw).toBe(15)
    expect(right.camera.yaw).toBeLessThan(0.001)
  })
  it('变焦重置恢复1.5倍与二维，保留片段时间、焦点及其他片段', () => {
    const editor = normalizeProjectEditor({
      zoomRegions: [
        { ...legacy, scale: 2.31, camera: normalizeZoomCamera({ mode: '3d', yaw: 35 }) },
        { ...legacy, id: 'zoom-2' }
      ]
    })
    const reset = resetProjectEditorSection(editor, 'zoom', 'zoom-1')
    expect(getZoomScale(reset.zoomRegions[0])).toBe(1.5)
    expect(normalizeZoomCamera(reset.zoomRegions[0].camera).mode).toBe('2d')
    expect(reset.zoomRegions[0]).toMatchObject({ startMs: 0, endMs: 4000, focus: legacy.focus })
    expect(reset.zoomRegions[1]).toEqual(editor.zoomRegions[1])
  })
})
