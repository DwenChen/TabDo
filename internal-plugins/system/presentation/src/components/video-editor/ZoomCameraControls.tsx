import { useRef, type PointerEvent } from 'react'
import { ChoiceGroup, ChoiceItem } from '@presentation/components/ui/choice-group'
import { Switch } from '@presentation/components/ui/switch'
import { SettingsRow } from './SettingsRow'
import { SliderControl } from './SliderControl'
import { getZoomScale, normalizeZoomCamera } from './zoomCamera'
import { MAX_ZOOM_RATE, MIN_ZOOM_RATE, normalizeZoomRate } from './zoomPlayback'
import type { ZoomCameraSettings, ZoomRegion } from './types'
import './zoom-camera.css'

export type ZoomCameraPatch = {
  scale?: number
  playbackRate?: number
  animationRate?: number
  camera?: Partial<ZoomCameraSettings>
}
const ANGLES = [
  { label: '正面', yaw: 0, pitch: 0 },
  { label: '向左', yaw: -24, pitch: 0 },
  { label: '向右', yaw: 24, pitch: 0 },
  { label: '俯视', yaw: 0, pitch: 24 },
  { label: '仰视', yaw: 0, pitch: -24 },
  { label: '斜向', yaw: -22, pitch: 13 }
]

/**
 * 展示当前片段的变焦倍率、视频与动画倍速、镜头模式及光学设置。
 * @param props 当前片段与一次参数发布入口。
 * @returns 共享侧栏样式的变焦控件；三维控件随模式卸载。
 */
export function ZoomCameraControls({
  region,
  onChange
}: {
  region: ZoomRegion
  onChange: (patch: ZoomCameraPatch) => void
}) {
  const camera = normalizeZoomCamera(region.camera)
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  /**
   * 在当前拖动手势内更新角度，限制到安全透视范围。
   * @param event 捕获中的指针事件。
   * @returns 无返回值；没有拖动时不发布状态。
   */
  function moveAngle(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current
    if (!start) return
    onChange({
      camera: {
        yaw: Math.max(-45, Math.min(45, Math.round(start.yaw + (event.clientX - start.x) * 0.4))),
        pitch: Math.max(
          -45,
          Math.min(45, Math.round(start.pitch - (event.clientY - start.y) * 0.4))
        )
      }
    })
  }
  /**
   * 将指针映射到变焦画面的归一化对焦点。
   * @param event 对焦板上的指针事件。
   * @returns 无返回值；更新当前镜头的清晰平面。
   */
  function focusAt(event: PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect()
    onChange({
      camera: {
        focus: {
          cx: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
          cy: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
        }
      }
    })
  }
  return (
    <div className="flex flex-col gap-4" data-testid="zoom-camera-controls">
      <SettingsRow title="镜头模式">
        <ChoiceGroup
          aria-label="镜头模式"
          value={camera.mode}
          onValueChange={(mode) =>
            onChange({
              camera: {
                ...(!region.camera && mode === '3d' ? { yaw: -22, pitch: 13 } : {}),
                mode: mode as '2d' | '3d'
              }
            })
          }
          className="grid grid-cols-2 gap-1"
        >
          <ChoiceItem value="2d">2D</ChoiceItem>
          <ChoiceItem value="3d">3D 镜头</ChoiceItem>
        </ChoiceGroup>
      </SettingsRow>
      <SliderControl
        label="变焦倍率"
        value={getZoomScale(region)}
        min={1}
        max={5}
        step={0.01}
        onChange={(scale) => onChange({ scale })}
        formatValue={(value) => `${value.toFixed(2)}×`}
      />
      <SliderControl
        label="视频倍速"
        value={normalizeZoomRate(region.playbackRate)}
        min={MIN_ZOOM_RATE}
        max={MAX_ZOOM_RATE}
        step={0.25}
        onChange={(playbackRate) => onChange({ playbackRate })}
        formatValue={(value) => `${value.toFixed(2)}×`}
      />
      <SliderControl
        label="镜头动画倍速"
        value={normalizeZoomRate(region.animationRate)}
        min={MIN_ZOOM_RATE}
        max={MAX_ZOOM_RATE}
        step={0.25}
        onChange={(animationRate) => onChange({ animationRate })}
        formatValue={(value) => `${value.toFixed(2)}×`}
      />
      {camera.mode === '3d' && (
        <>
          <h3 className="inspector-section-title">3D 镜头</h3>
          <div className="space-y-2">
            <div className="inspector-control-label">镜头角度</div>
            <div
              className="zoom-angle-pad"
              role="group"
              aria-label="拖动调整镜头角度"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.currentTarget.setPointerCapture(event.pointerId)
                drag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  yaw: camera.yaw,
                  pitch: camera.pitch
                }
              }}
              onPointerMove={moveAngle}
              onPointerUp={() => {
                drag.current = null
              }}
              onPointerCancel={() => {
                const start = drag.current
                drag.current = null
                if (start) onChange({ camera: { yaw: start.yaw, pitch: start.pitch } })
              }}
              onLostPointerCapture={() => {
                drag.current = null
              }}
            >
              <div
                className="zoom-angle-plane"
                style={{
                  transform: `perspective(${camera.focalLength * 8}px) rotateX(${camera.pitch}deg) rotateY(${camera.yaw}deg)`
                }}
              >
                <span>
                  {camera.yaw}° / {camera.pitch}°
                </span>
              </div>
              <span className="zoom-pad-hint inspector-description">拖动调整角度</span>
            </div>
            <div className="zoom-angle-presets" role="group" aria-label="镜头角度预设">
              {ANGLES.map(({ label, yaw, pitch }) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-label={`镜头角度：${label}`}
                  aria-pressed={camera.yaw === yaw && camera.pitch === pitch}
                  onClick={() => onChange({ camera: { yaw, pitch } })}
                >
                  <span
                    style={{
                      transform: `perspective(60px) rotateX(${pitch}deg) rotateY(${yaw}deg)`
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
          <SliderControl
            label="水平角度"
            value={camera.yaw}
            min={-45}
            max={45}
            step={1}
            onChange={(yaw) => onChange({ camera: { yaw } })}
            formatValue={(v) => `${v}°`}
          />
          <SliderControl
            label="俯仰角度"
            value={camera.pitch}
            min={-45}
            max={45}
            step={1}
            onChange={(pitch) => onChange({ camera: { pitch } })}
            formatValue={(v) => `${v}°`}
          />
          <h3 className="inspector-section-title">镜头</h3>
          <SliderControl
            label="焦距"
            description="短焦透视更明显，长焦画面更平缓。"
            value={camera.focalLength}
            min={18}
            max={200}
            step={1}
            onChange={(focalLength) => onChange({ camera: { focalLength } })}
            formatValue={(v) => `${v} mm`}
          />
          <SettingsRow title="景深">
            <Switch
              aria-label="景深"
              checked={camera.depthOfField}
              onCheckedChange={(depthOfField) => onChange({ camera: { depthOfField } })}
            />
          </SettingsRow>
          {camera.depthOfField && (
            <SliderControl
              label="光圈"
              description="较小的 f 值带来更明显的虚化。"
              value={camera.aperture}
              min={1.4}
              max={22}
              step={0.1}
              onChange={(aperture) => onChange({ camera: { aperture } })}
              formatValue={(v) => `f/${v.toFixed(1)}`}
            />
          )}
          <SettingsRow title="屏幕反光">
            <Switch
              aria-label="屏幕反光"
              checked={camera.reflection}
              onCheckedChange={(reflection) => onChange({ camera: { reflection } })}
            />
          </SettingsRow>
          {camera.depthOfField && (
            <div className="space-y-2">
              <h3 className="inspector-section-title">对焦点</h3>
              <div
                className="zoom-focus-pad"
                role="group"
                aria-label="点按设置对焦点"
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  focusAt(event)
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) focusAt(event)
                }}
              >
                <span
                  className="zoom-focus-point"
                  style={{ left: `${camera.focus.cx * 100}%`, top: `${camera.focus.cy * 100}%` }}
                />
              </div>
              <p className="inspector-description">点按画面对应位置，将该处保持清晰。</p>
              <SliderControl
                label="对焦水平位置"
                value={camera.focus.cx}
                min={0}
                max={1}
                step={0.01}
                onChange={(cx) => onChange({ camera: { focus: { ...camera.focus, cx } } })}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
              <SliderControl
                label="对焦垂直位置"
                value={camera.focus.cy}
                min={0}
                max={1}
                step={0.01}
                onChange={(cy) => onChange({ camera: { focus: { ...camera.focus, cy } } })}
                formatValue={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
