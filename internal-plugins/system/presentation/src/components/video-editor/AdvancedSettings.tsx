import { useId, type ReactElement, type ReactNode } from 'react'
import { CaretDown } from '@presentation/components/ui/icons'

/**
 * 为高级和缩放通用设置提供一致的标题、留白与按需挂载的正文。
 * @param props 展开状态、切换回调、标题、无障碍名称及设置正文。
 * @returns 可键盘操作的折叠分组，收起时不挂载子控件。
 */
export function AdvancedSettings({
  open,
  onOpenChange,
  children,
  title = '高级',
  label = '高级设置',
  groupLabel
}: {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  title?: string
  label?: string
  groupLabel?: string
}): ReactElement {
  const id = useId()
  return (
    <section
      className="inspector-disclosure"
      data-advanced-section
      role="group"
      aria-label={groupLabel}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        className="inspector-disclosure-trigger"
        onClick={() => onOpenChange?.(!open)}
      >
        {title}
        <CaretDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={id} data-advanced-settings className="inspector-disclosure-content">
          {children}
        </div>
      )}
    </section>
  )
}
