import { ArrowRight, BoundingBox, Eye, ImageSquare, Keyboard, TextT } from '@presentation/components/ui/icons'
import type { AnnotationType } from '../types'
import type { ReactElement } from 'react'

const icons = { text: TextT, image: ImageSquare, figure: ArrowRight, blur: BoundingBox, focus: Eye, keystroke: Keyboard }

/**
 * 按当前注释类型显示可区分的细线图标。
 * @param props 注释类型。
 * @returns 随类型更新的时间轴图标，马赛克使用原创网格。
 */
export function AnnotationTypeIcon({ type }: { type: AnnotationType }): ReactElement {
  if (type === 'mosaic') return (
    <svg aria-hidden="true" data-annotation-icon={type} className="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  )
  const Icon = icons[type]
  return <Icon aria-hidden="true" data-annotation-icon={type} className="size-3 shrink-0" />
}
