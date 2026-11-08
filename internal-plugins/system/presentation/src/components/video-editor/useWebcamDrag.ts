import { useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import type { WebcamOverlaySettings } from './types'
import { scaleWebcamOverlayPixels } from './webcamOverlay'

type DragState = {
  pointerId: number
  target: HTMLDivElement
  original: WebcamOverlaySettings
  offsetX: number
  offsetY: number
}

type WebcamDragHandlers = {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void
  onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => void
}

/**
 * 将预览中的人像拖动映射为预览、项目和导出共用的归一化位置。
 * @param options 当前人像设置、预览容器及编辑回调。
 * @returns 人像画面的指针事件；取消拖动回滚位置，卸载释放指针捕获。
 */
export function useWebcamDrag({
  webcam,
  overlayRef,
  onWebcamChange,
  onDragStart
}: {
  webcam?: WebcamOverlaySettings
  overlayRef: RefObject<HTMLDivElement | null>
  onWebcamChange?: (webcam: WebcamOverlaySettings) => void
  onDragStart: () => void
}): WebcamDragHandlers {
  const drag = useRef<DragState | null>(null)

  /**
   * 结束所属拖动并释放捕获，指针取消或意外失去捕获时恢复原位置。
   * @param canceled 是否撤销本次位置修改。
   * @returns 无返回值。
   */
  const finish = (canceled: boolean): void => {
    const current = drag.current
    if (!current) return
    // 先清空状态，避免释放捕获触发 lostpointercapture 再次回滚。
    drag.current = null
    if (current.target.hasPointerCapture(current.pointerId)) {
      current.target.releasePointerCapture(current.pointerId)
    }
    if (canceled) onWebcamChange?.(current.original)
  }

  useEffect(() => {
    return () => {
      const current = drag.current
      drag.current = null
      // 卸载仅释放当前指针，不在已退出的会话回写项目。
      if (current?.target.hasPointerCapture(current.pointerId)) {
        current.target.releasePointerCapture(current.pointerId)
      }
    }
  }, [])

  /**
   * 从人像内的实际落点开始拖动，保留抓取偏移以免画面跳到鼠标中心。
   * @param event 人像画面的主指针按下事件。
   * @returns 无返回值；没有可编辑人像或有效容器时忽略。
   */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !webcam?.enabled || !onWebcamChange || drag.current) return
    const overlay = overlayRef.current
    if (!overlay) return
    event.preventDefault()
    event.stopPropagation()
    onDragStart()
    const rect = overlay.getBoundingClientRect()
    const bubble = event.currentTarget.getBoundingClientRect()
    // 使用容器布局尺寸消除缩放窗口和 CSS 缩放对坐标的影响。
    drag.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      original: { ...webcam },
      offsetX: ((event.clientX - bubble.left) * overlay.clientWidth) / rect.width,
      offsetY: ((event.clientY - bubble.top) * overlay.clientHeight) / rect.height
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  /**
   * 在留出边距后的可用范围内更新人像位置，并钳制越界拖动。
   * @param event 已捕获指针的移动事件。
   * @returns 无返回值；非所属指针和已结束拖动不处理。
   */
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current
    const overlay = overlayRef.current
    if (!current || current.pointerId !== event.pointerId || !overlay || !webcam) return
    event.stopPropagation()
    const rect = overlay.getBoundingClientRect()
    const margin = scaleWebcamOverlayPixels(webcam.margin, overlay.clientWidth)
    const width = Math.max(0, overlay.clientWidth - current.target.offsetWidth - margin * 2)
    const height = Math.max(0, overlay.clientHeight - current.target.offsetHeight - margin * 2)
    const x = ((event.clientX - rect.left) * overlay.clientWidth) / rect.width - current.offsetX
    const y = ((event.clientY - rect.top) * overlay.clientHeight) / rect.height - current.offsetY
    onWebcamChange?.({
      ...webcam,
      positionPreset: 'custom',
      positionX: width > 0 ? Math.min(1, Math.max(0, (x - margin) / width)) : 0,
      positionY: height > 0 ? Math.min(1, Math.max(0, (y - margin) / height)) : 0
    })
  }

  /**
   * 提交主指针拖动后的最终位置。
   * @param event 所属指针的释放事件。
   * @returns 无返回值。
   */
  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    onPointerMove(event)
    finish(false)
  }

  /**
   * 系统取消或捕获丢失时撤销未完成的拖动。
   * @param event 被取消的指针事件。
   * @returns 无返回值。
   */
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    finish(true)
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture: onPointerCancel
  }
}
