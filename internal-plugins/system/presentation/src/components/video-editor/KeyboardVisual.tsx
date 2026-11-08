import { useLayoutEffect, useRef } from 'react'
import type { AnnotationRegion } from './types'
import { drawKeycaps, getKeyLegends } from './keyboardDisplay'

/**
 * 在编辑预览中使用导出同款键帽，按当前框和设备像素比适配尺寸。
 * @param props 当前按键片段、尺寸与参考倍率。
 * @returns 可访问的键帽画布。
 */
export function KeyboardVisual({
  annotation,
  width,
  height,
  scale,
  decorative = false
}: {
  annotation: AnnotationRegion
  width: number
  height: number
  scale: number
  decorative?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const canvas = ref.current!
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.ceil(width * ratio))
    canvas.height = Math.max(1, Math.ceil(height * ratio))
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    drawKeycaps(ctx, annotation, width, height, scale)
    return () => {
      canvas.width = 0
      canvas.height = 0
    }
  }, [annotation, width, height, scale])
  return (
    <canvas
      data-keycaps={decorative ? undefined : ''}
      ref={ref}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : getKeyLegends(annotation.content).join(' ')}
      className="block h-full w-full"
    />
  )
}
