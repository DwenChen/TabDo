import MosaicPreview from './MosaicPreview'
import { KeyboardVisual } from './KeyboardVisual'
import { getAnnotationMotion } from './annotationMotion'
import { getAnnotationMaskUrl } from './annotationMask'
import { useEffect, useMemo, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@presentation/lib/utils'
import { ArrowPreview } from './ArrowSvgs'
import {
  normalizeAnnotationRotation,
  resizeAnnotationBox,
  type AnnotationBox
} from './annotationGeometry'
import { type AnnotationRegion, BASE_PREVIEW_WIDTH, BLUR_ANNOTATION_STRENGTH } from './types'

type Rect = { x: number; y: number; width: number; height: number }
interface AnnotationOverlayProps {
  sourceCanvas?: HTMLCanvasElement | null
  refreshScene?: () => void
  annotation: AnnotationRegion
  isSelected: boolean
  containerWidth: number
  containerHeight: number
  recordingRect: Rect
  sceneTransform: { scale: number; x: number; y: number }
  interactionScale?: number
  onPositionChange: (id: string, position: { x: number; y: number }) => void
  onSizeChange: (id: string, size: { width: number; height: number }) => void
  onRotationChange: (id: string, rotation: number) => void
  onClick: (id: string) => void
  zIndex: number
  isSelectedBoost: boolean
  timeMs: number
  onMaskChange?: (id: string, strokes: NonNullable<AnnotationRegion['style']['maskStrokes']>) => void
}
type Gesture = {
  box: AnnotationBox
  clientX: number
  clientY: number
  centerX: number
  centerY: number
  corner?: [number, number]
  rotate: boolean
  pointerId: number
}

/**
 * 按当前场景坐标显示注释，支持拖动、旋转及保持对角点的局部缩放。
 * @param props 注释模型、场景尺寸和沿保存历史链发布的编辑回调。
 * @returns 可编辑的注释对象；手势取消不修改项目。
 */
export function AnnotationOverlay({
  annotation,
  sourceCanvas,
  refreshScene,
  isSelected,
  containerWidth,
  containerHeight,
  recordingRect,
  sceneTransform,
  interactionScale = 1,
  onPositionChange,
  onSizeChange,
  onRotationChange,
  onClick,
  zIndex,
  isSelectedBoost,
  timeMs,
  onMaskChange
}: AnnotationOverlayProps) {
  const safeRecordingRect =
    recordingRect.width > 0 && recordingRect.height > 0
      ? recordingRect
      : { x: 0, y: 0, width: containerWidth, height: containerHeight }
  const width = (annotation.size.width / 100) * safeRecordingRect.width * sceneTransform.scale
  const height = (annotation.size.height / 100) * safeRecordingRect.height * sceneTransform.scale
  const x =
    (safeRecordingRect.x + (annotation.position.x / 100) * safeRecordingRect.width) *
      sceneTransform.scale +
    sceneTransform.x
  const y =
    (safeRecordingRect.y + (annotation.position.y / 100) * safeRecordingRect.height) *
      sceneTransform.scale +
    sceneTransform.y
  const sizeScale = safeRecordingRect.width / BASE_PREVIEW_WIDTH
  const blurScaleFactor = sizeScale * sceneTransform.scale
  const rotation = normalizeAnnotationRotation(annotation.rotation)
  const [draft, setDraft] = useState<AnnotationBox | null>(null)
  const draftRef = useRef<AnnotationBox | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const box = draft ?? { x, y, width, height, rotation }
  const maskId = useId().replace(/:/g, '')
  const [painting, setPainting] = useState(false)
  const [stroke, setStroke] = useState<Array<{ x: number; y: number }> | null>(null)
  const strokeRef = useRef<Array<{ x: number; y: number }> | null>(null)
  const maskStyle = useMemo(() => stroke ? { ...annotation.style, maskStrokes: [...(annotation.style.maskStrokes ?? []), stroke] } : annotation.style, [annotation.style, stroke])
  const maskUrl = useMemo(() => ['blur', 'mosaic', 'focus'].includes(annotation.type) ? getAnnotationMaskUrl(maskStyle, box.width, box.height, (annotation.style.borderRadius ?? 0) * blurScaleFactor) : '', [annotation.type, maskStyle, box.width, box.height, annotation.style.borderRadius, blurScaleFactor])
  const motion = getAnnotationMotion(annotation, timeMs)
  /**
   * 将屏幕指针逆映射到旋转前的归一化遮罩坐标。
   * @param event 当前涂抹指针。
   * @returns 对象范围内的笔画点。
   */
  function brushPoint(event: ReactPointerEvent<HTMLElement>) {
    const rect = rootRef.current!.getBoundingClientRect(), angle = -box.rotation * Math.PI / 180
    const dx = (event.clientX - rect.x - rect.width / 2) / interactionScale, dy = (event.clientY - rect.y - rect.height / 2) / interactionScale
    return { x: Math.max(0, Math.min(100, 50 + (dx * Math.cos(angle) - dy * Math.sin(angle)) * 100 / box.width)), y: Math.max(0, Math.min(100, 50 + (dx * Math.sin(angle) + dy * Math.cos(angle)) * 100 / box.height)) }
  }

  useEffect(() => {
    /**
     * Escape 取消尚未发布的对象手势。
     * @param event 当前按键事件。
     * @returns 无返回值；恢复保存的对象几何。
     */
    function cancel(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        gestureRef.current = null
        draftRef.current = null
        setDraft(null)
        strokeRef.current = null
        setStroke(null)
        setPainting(false)
      }
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [])

  /**
   * 捕获当前指针并记录局部编辑基线，控件不触发底层拖动。
   * @param event 当前指针事件。
   * @param corner 缩放角点，缺省表示平移。
   * @param rotate 是否为旋转手柄。
   * @returns 无返回值；后续仅在此指针释放时发布一次编辑。
   */
  function begin(
    event: ReactPointerEvent<HTMLElement>,
    corner?: [number, number],
    rotate = false
  ): void {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    if (!isSelected) {
      onClick(annotation.id)
      return
    }
    if (painting && ['blur', 'mosaic', 'focus'].includes(annotation.type) && annotation.style.maskShape === 'brush' && !corner && !rotate) {
      strokeRef.current = [brushPoint(event)]; setStroke(strokeRef.current)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    const rect = rootRef.current!.getBoundingClientRect()
    gestureRef.current = {
      box,
      corner,
      rotate,
      clientX: event.clientX,
      clientY: event.clientY,
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2,
      pointerId: event.pointerId
    }
    draftRef.current = box
    setDraft(box)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  /**
   * 在预览缩放与对象旋转后计算真实编辑几何。
   * @param event 已捕获的指针移动。
   * @returns 无返回值；更新本地草稿，不记录中间历史。
   */
  function move(event: ReactPointerEvent<HTMLElement>): void {
    if (strokeRef.current) {
      if (strokeRef.current.length < 2000) { strokeRef.current = [...strokeRef.current, brushPoint(event)]; setStroke(strokeRef.current) }
      return
    }
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const dx = (event.clientX - gesture.clientX) / interactionScale
    const dy = (event.clientY - gesture.clientY) / interactionScale
    let next: AnnotationBox
    if (gesture.rotate) {
      const start = Math.atan2(gesture.clientY - gesture.centerY, gesture.clientX - gesture.centerX)
      const angle = Math.atan2(event.clientY - gesture.centerY, event.clientX - gesture.centerX)
      let degrees = gesture.box.rotation + ((angle - start) * 180) / Math.PI
      if (event.shiftKey) degrees = Math.round(degrees / 15) * 15
      next = { ...gesture.box, rotation: normalizeAnnotationRotation(degrees) }
    } else if (gesture.corner) next = resizeAnnotationBox(gesture.box, dx, dy, gesture.corner)
    else {
      const parent = rootRef.current?.parentElement
      const angle = (gesture.box.rotation * Math.PI) / 180
      const halfWidth =
        (Math.abs(gesture.box.width * Math.cos(angle)) +
          Math.abs(gesture.box.height * Math.sin(angle))) /
        2
      const halfHeight =
        (Math.abs(gesture.box.width * Math.sin(angle)) +
          Math.abs(gesture.box.height * Math.cos(angle))) /
        2
      // 以旋转后的外接矩形限制平移，不能把对象整个拖出预览而无法再次选中。
      const centerX = Math.max(
        Math.min(halfWidth, (parent?.clientWidth ?? containerWidth) / 2),
        Math.min(
          (parent?.clientWidth ?? containerWidth) -
            Math.min(halfWidth, (parent?.clientWidth ?? containerWidth) / 2),
          gesture.box.x + gesture.box.width / 2 + dx
        )
      )
      const centerY = Math.max(
        Math.min(halfHeight, (parent?.clientHeight ?? containerHeight) / 2),
        Math.min(
          (parent?.clientHeight ?? containerHeight) -
            Math.min(halfHeight, (parent?.clientHeight ?? containerHeight) / 2),
          gesture.box.y + gesture.box.height / 2 + dy
        )
      )
      next = {
        ...gesture.box,
        x: centerX - gesture.box.width / 2,
        y: centerY - gesture.box.height / 2
      }
    }
    draftRef.current = next
    setDraft(next)
  }
  /**
   * 将最终手势一次发布到项目；取消和丢失捕获均丢弃草稿。
   * @param event 当前指针结束事件。
   * @returns 无返回值；清理指针状态和草稿。
   */
  function finish(event: ReactPointerEvent<HTMLElement>): void {
    if (strokeRef.current) {
      const points = strokeRef.current
      strokeRef.current = null; setStroke(null)
      // 取消、丢失捕获和 Escape 均不写入项目；一笔只发布一次历史。
      if (event.type === 'pointerup') onMaskChange?.(annotation.id, [...(annotation.style.maskStrokes ?? []).slice(-63), points])
      return
    }
    const gesture = gestureRef.current,
      next = draftRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    draftRef.current = null
    setDraft(null)
    if (event.type !== 'pointerup' || !next) return
    // 单纯选择或未移动的点击不发布浮点换算，避免占用历史或清空重做。
    if (
      ['x', 'y', 'width', 'height', 'rotation'].every(
        (key) =>
          Math.abs(next[key as keyof AnnotationBox] - gesture.box[key as keyof AnnotationBox]) <
          0.001
      )
    )
      return
    // 旋转和几何分别发布；同一次指针手势由共享历史合并为一个步骤。
    if (gesture.rotate) onRotationChange(annotation.id, next.rotation)
    else {
      onPositionChange(annotation.id, {
        x:
          (((next.x - sceneTransform.x) / sceneTransform.scale - safeRecordingRect.x) /
            safeRecordingRect.width) *
          100,
        y:
          (((next.y - sceneTransform.y) / sceneTransform.scale - safeRecordingRect.y) /
            safeRecordingRect.height) *
          100
      })
      if (gesture.corner)
        onSizeChange(annotation.id, {
          width: (next.width / sceneTransform.scale / safeRecordingRect.width) * 100,
          height: (next.height / sceneTransform.scale / safeRecordingRect.height) * 100
        })
    }
  }
  /**
   * 以导出共用的几何渲染当前箭头外观。
   * @returns 当前箭头图形。
   */
  const renderArrow = () => {
    const direction = annotation.figureData?.arrowDirection || 'right'
    const color = annotation.figureData?.color || '#2563EB'
    const strokeWidth = annotation.figureData?.strokeWidth || 4

    return (
      <ArrowPreview
        direction={direction}
        color={color}
        strokeWidth={strokeWidth}
        arrowStyle={annotation.figureData?.arrowStyle}
        width={box.width}
        height={box.height}
      />
    )
  }

  /**
   * Render the current annotation, sharing keycap decoration with the export renderer.
   * @returns The visible annotation content.
   */
  const renderContent = () => {
    switch (annotation.type) {
      case 'keystroke':
        return <KeyboardVisual annotation={annotation} width={box.width} height={box.height} scale={sizeScale} />
      case 'text':
        return (
          <div
            className="w-full h-full flex items-center overflow-hidden"
            style={{
              justifyContent:
                annotation.style.textAlign === 'left'
                  ? 'flex-start'
                  : annotation.style.textAlign === 'right'
                    ? 'flex-end'
                    : 'center',
              alignItems: 'center',
              padding: `${8 * sizeScale}px`
            }}
          >
            <span
              style={{
                color: annotation.style.color,
                backgroundColor: annotation.style.backgroundColor,
                fontSize: `${annotation.style.fontSize * sizeScale}px`,
                fontFamily: annotation.style.fontFamily,
                fontWeight: annotation.style.fontWeight,
                fontStyle: annotation.style.fontStyle,
                textDecoration: annotation.style.textDecoration,
                textAlign: annotation.style.textAlign,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
                padding: '0.1em 0.2em',
                borderRadius: `${4 * sizeScale}px`,
                lineHeight: '1.4'
              }}
            >
              {annotation.content}
            </span>
          </div>
        )

      case 'image':
        if (annotation.content && annotation.content.startsWith('data:image')) {
          return (
            <img
              src={annotation.content || undefined}
              alt="注释"
              className="w-full h-full object-contain"
              style={{ borderRadius: (annotation.style.borderRadius ?? 0) * blurScaleFactor }}
              draggable={false}
            />
          )
        }
        return (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            没有图片
          </div>
        )

      case 'figure':
        if (!annotation.figureData) {
          return (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              没有光标图形
            </div>
          )
        }

        return (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ padding: `${8 * sizeScale}px` }}
          >
            {renderArrow()}
          </div>
        )

      case 'blur': {
        const currentBlurStrength = annotation.blurIntensity ?? BLUR_ANNOTATION_STRENGTH
        const blurPx = currentBlurStrength * blurScaleFactor
        const blurStyle = `blur(${blurPx}px)`

        return (
          <div
            className="h-full w-full"
            style={{
              backdropFilter: blurStyle,
              WebkitBackdropFilter: blurStyle,
              maskImage: `url("${maskUrl}")`,
              maskSize: '100% 100%',
              borderRadius: `${(annotation.style.borderRadius ?? 0) * blurScaleFactor}px`
            }}
          />
        )
      }

      case 'focus':
        return (
          <svg className="h-full w-full pointer-events-none" style={{ overflow: 'visible' }}>
            <defs><mask id={maskId} maskUnits="userSpaceOnUse" x={-100000} y={-100000} width={200000} height={200000}>
              <rect x={-100000} y={-100000} width={200000} height={200000} fill="white" />
              <image href={maskUrl} width={box.width} height={box.height} />
            </mask>
            <clipPath id={`${maskId}-wipe`} clipPathUnits="userSpaceOnUse"><rect width={(rootRef.current?.parentElement?.clientWidth ?? containerWidth) * motion.reveal} height={rootRef.current?.parentElement?.clientHeight ?? containerHeight} transform={`translate(${box.width / 2} ${box.height / 2}) rotate(${-box.rotation}) translate(${-box.x - box.width / 2} ${-box.y - box.height / 2})`} /></clipPath>
            </defs>
            <rect x={-100000} y={-100000} width={200000} height={200000} fill={`rgba(0,0,0,${(annotation.blurIntensity ?? 60) / 100})`} mask={`url(#${maskId})`} clipPath={motion.reveal < 1 ? `url(#${maskId}-wipe)` : undefined} />
          </svg>
        )
      case 'mosaic':
        return (
          <div
            className="h-full w-full overflow-hidden"
            style={{ maskImage: `url("${maskUrl}")`, maskSize: '100% 100%' }}
          >
            <MosaicPreview
              refreshSource={refreshScene}
              source={sourceCanvas}
              strength={annotation.blurIntensity ?? 20}
              rotation={box.rotation}
              previewScale={interactionScale * motion.scale}
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div
      ref={rootRef}
      data-annotation-id={annotation.id}
      data-selected={isSelected}
      data-rotation={box.rotation}
      className="absolute cursor-move touch-none select-none"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        transform: `rotate(${box.rotation}deg)`,
        transformOrigin: 'center',
        pointerEvents: 'auto',
        zIndex: isSelectedBoost ? zIndex + 1000 : zIndex,
        outline: isSelected ? '2px solid var(--accent)' : undefined
        ,cursor: painting && ['blur', 'mosaic', 'focus'].includes(annotation.type) && annotation.style.maskShape === 'brush' ? 'crosshair' : 'move'
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    >
      <div
        style={{ borderRadius: (annotation.style.borderRadius ?? 0) * blurScaleFactor,
          opacity: motion.opacity,
          transform: `translateY(${motion.y * box.height}px) scale(${motion.scale})`,
          clipPath: motion.reveal < 1 && annotation.type !== 'focus' ? `inset(0 ${(1 - motion.reveal) * 100}% 0 0)` : undefined }}
        className={cn('w-full h-full', isSelected && 'shadow-lg')}
      >
        {renderContent()}
      </div>
      {isSelected && ['blur', 'mosaic', 'focus'].includes(annotation.type) && annotation.style.maskShape === 'brush' && <button type="button" aria-pressed={painting} className="absolute -top-8 left-0 rounded bg-background px-2 py-1 text-xs text-foreground shadow" onPointerDown={e => e.stopPropagation()} onClick={() => setPainting(!painting)}>{painting ? '完成涂抹' : '涂抹遮罩'}</button>}
      {isSelected && (
        <>
          <div className="pointer-events-none absolute left-1/2 -top-6 h-6 border-l border-accent" />
          <button
            type="button"
            aria-label="旋转注释"
            title="拖动旋转，按住 Shift 每次旋转 15°"
            className="absolute left-1/2 -top-9 size-4 -translate-x-1/2 rounded-full border-2 border-accent bg-background cursor-grab"
            onPointerDown={(event) => begin(event, undefined, true)}
          />
          {annotation.type !== 'keystroke' && (
            [
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1]
            ] as [number, number][]
          ).map((corner, index) => (
            <button
              key={index}
              type="button"
              aria-label={
                ['调整注释左上角', '调整注释右上角', '调整注释左下角', '调整注释右下角'][index]
              }
              className="absolute size-3 rounded-full border-2 border-accent bg-background"
              style={{
                left: corner[0] < 0 ? -6 : undefined,
                right: corner[0] > 0 ? -6 : undefined,
                top: corner[1] < 0 ? -6 : undefined,
                bottom: corner[1] > 0 ? -6 : undefined,
                cursor: corner[0] === corner[1] ? 'nwse-resize' : 'nesw-resize'
              }}
              onPointerDown={(event) => begin(event, corner)}
            />
          ))}
        </>
      )}
    </div>
  )
}
