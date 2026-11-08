import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'

interface Props {
  source?: HTMLCanvasElement | null
  strength: number
  rotation?: number
  previewScale?: number
  refreshSource?: () => void
}
/**
 * Sample the visible scene into large pixel blocks without altering the recording.
 * @param props - The scene canvas and pixel block strength.
 * @returns A foreground canvas that releases its animation and buffer on unmount.
 */
export default function MosaicPreview({
  source,
  strength,
  rotation = 0,
  previewScale = 1,
  refreshSource
}: Props): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const refreshRef = useRef(refreshSource)
  refreshRef.current = refreshSource
  useEffect(() => {
    if (!source) return
    const small = document.createElement('canvas')
    let frame = 0
    /**
     * Refresh mosaic pixels from the current rendered scene geometry.
     * @returns Nothing; schedules the next foreground frame.
     */
    function draw(): void {
      const canvas = ref.current
      if (!canvas || !source) return
      // WebGL may discard the drawing buffer after presentation; sample immediately after rendering.
      refreshRef.current?.()
      const rect = canvas.getBoundingClientRect(),
        sourceRect = source.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && sourceRect.width > 0 && sourceRect.height > 0) {
        const scale = source.width / sourceRect.width
        const block = Math.max(4, (strength * scale) / 2)
        const width = canvas.clientWidth * previewScale * scale,
          height = canvas.clientHeight * previewScale * scale
        small.width = Math.max(1, Math.ceil(source.width / block))
        small.height = Math.max(1, Math.ceil(source.height / block))
        canvas.width = Math.max(1, Math.ceil(width))
        canvas.height = Math.max(1, Math.ceil(height))
        const sample = small.getContext('2d'),
          ctx = canvas.getContext('2d')
        if (sample && ctx) {
          // 先逆向映射场景再让对象旋转，避免马赛克中的画面随方框重复旋转。
          sample.drawImage(source, 0, 0, small.width, small.height)
          ctx.save()
          ctx.translate(width / 2, height / 2)
          ctx.rotate((-rotation * Math.PI) / 180)
          ctx.translate(
            -(rect.x + rect.width / 2 - sourceRect.x) * scale,
            -(rect.y + rect.height / 2 - sourceRect.y) * scale
          )
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(small, 0, 0, source.width, source.height)
          ctx.restore()
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      small.width = 0
      small.height = 0
    }
  }, [source, strength, rotation, previewScale])
  return <canvas ref={ref} className="w-full h-full block pointer-events-none" />
}
