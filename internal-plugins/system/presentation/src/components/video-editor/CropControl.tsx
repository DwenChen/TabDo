import { useEffect, useRef, type PointerEvent, type ReactElement } from 'react'
import { transformCrop, type CropHandle } from './cropGeometry'
import type { CropRegion } from './types'

type Props = {
  videoElement: HTMLVideoElement | null
  cropRegion: CropRegion
  onCropChange: (crop: CropRegion) => void
  aspectRatio?: string
  lockedRatio?: number
  drawMode?: boolean
  onDrawComplete?: () => void
}
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
const positions = {
  nw: [0, 0],
  n: [50, 0],
  ne: [100, 0],
  e: [100, 50],
  se: [100, 100],
  s: [50, 100],
  sw: [0, 100],
  w: [0, 50]
}

/**
 * 提供八向裁剪、整体移动和重新框选，画布只在媒体帧变化时更新。
 * @param props 当前素材、裁剪区域与可选比例约束。
 * @returns 有边界限制和取消回滚的紧凑裁剪画布。
 */
export function CropControl({
  videoElement,
  cropRegion,
  onCropChange,
  lockedRatio,
  drawMode,
  onDrawComplete
}: Props): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    id: number
    handle: CropHandle
    crop: CropRegion
    x: number
    y: number
  } | null>(null)
  const aspect =
    videoElement?.videoWidth && videoElement.videoHeight
      ? videoElement.videoWidth / videoElement.videoHeight
      : 16 / 9
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !videoElement) return
    /**
     * 在实际视频帧就绪或跳转后复制画面，暂停时不持续重绘。
     * @returns 无返回值。
     */
    const draw = (): void => {
      if (videoElement.readyState < 2) return
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight
      canvas.getContext('2d', { alpha: false })?.drawImage(videoElement, 0, 0)
    }
    draw()
    for (const name of ['loadeddata', 'seeked', 'timeupdate'])
      videoElement.addEventListener(name, draw)
    return () => {
      for (const name of ['loadeddata', 'seeked', 'timeupdate'])
        videoElement.removeEventListener(name, draw)
    }
  }, [videoElement])
  /**
   * 捕获主指针，记录初始选区及落点。
   * @param event 指针按下事件。
   * @param handle 移动、边角或框选操作。
   * @returns 无返回值。
   */
  const start = (event: PointerEvent, handle: CropHandle): void => {
    if (event.button !== 0 || drag.current || !containerRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const rect = containerRef.current.getBoundingClientRect()
    drag.current = {
      id: event.pointerId,
      handle: drawMode ? 'draw' : handle,
      crop: { ...cropRegion },
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    }
    containerRef.current.setPointerCapture(event.pointerId)
  }
  /**
   * 将指针移动转换为素材坐标并应用统一裁剪规则。
   * @param event 已捕获指针的移动。
   * @returns 无返回值。
   */
  const move = (event: PointerEvent): void => {
    const current = drag.current
    if (!current || current.id !== event.pointerId || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    onCropChange(
      transformCrop(
        current.crop,
        current.handle,
        (event.clientX - rect.left) / rect.width - current.x,
        (event.clientY - rect.top) / rect.height - current.y,
        lockedRatio ? lockedRatio / aspect : undefined,
        current
      )
    )
  }
  /**
   * 完成或取消拖动，并释放所属指针捕获。
   * @param event 所属指针的结束事件。
   * @param canceled 是否撤销本次拖动。
   * @returns 无返回值。
   */
  const end = (event: PointerEvent, canceled = false): void => {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    if (!canceled) move(event)
    drag.current = null
    if (containerRef.current?.hasPointerCapture(current.id))
      containerRef.current.releasePointerCapture(current.id)
    if (canceled) onCropChange(current.crop)
    if (current.handle === 'draw') onDrawComplete?.()
  }
  return (
    <div
      ref={containerRef}
      data-crop-canvas
      className="relative mx-auto select-none overflow-hidden rounded-md bg-black"
      style={{
        width: `min(100%, ${52 * aspect}vh)`,
        aspectRatio: aspect,
        touchAction: 'none',
        cursor: drawMode ? 'crosshair' : undefined
      }}
      onPointerDown={(event) => start(event, 'draw')}
      onPointerMove={move}
      onPointerUp={(event) => end(event)}
      onPointerCancel={(event) => end(event, true)}
      onLostPointerCapture={(event) => end(event, true)}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div
        data-crop-selection
        aria-label="移动裁剪区域"
        className="absolute border border-white"
        style={{
          left: `${cropRegion.x * 100}%`,
          top: `${cropRegion.y * 100}%`,
          width: `${cropRegion.width * 100}%`,
          height: `${cropRegion.height * 100}%`,
          boxShadow: '0 0 0 2000px #0009',
          cursor: drawMode ? 'crosshair' : 'move'
        }}
        onPointerDown={(event) => start(event, 'move')}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/3 h-1/3 border-y border-white/30" />
        <div className="pointer-events-none absolute inset-y-0 left-1/3 w-1/3 border-x border-white/30" />
        {!drawMode &&
          handles.map((handle) => (
            <div
              key={handle}
              data-crop-handle={handle}
              aria-label={`裁剪手柄 ${handle}`}
              className="absolute z-10 h-4 w-4 rounded-sm border border-accent bg-white"
              style={{
                left: `${positions[handle][0]}%`,
                top: `${positions[handle][1]}%`,
                transform: 'translate(-50%, -50%)',
                cursor: `${handle === 'n' || handle === 's' ? 'ns' : handle === 'e' || handle === 'w' ? 'ew' : handle === 'nw' || handle === 'se' ? 'nwse' : 'nesw'}-resize`
              }}
              onPointerDown={(event) => start(event, handle)}
            />
          ))}
      </div>
    </div>
  )
}
