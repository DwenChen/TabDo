import type { ReactNode } from 'react'

/**
 * 统一选项标题和描述层级，让开关对齐标题行而非整块说明的中线。
 * @param props 标题、说明、控件、堆叠方式及指定的辅助标签色。
 * @returns 使用共享字号与标题行对齐的设置行。
 */
export function SettingsRow({
  title,
  description,
  children,
  stacked = false,
  muted = false
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  stacked?: boolean
  muted?: boolean
}) {
  return (
    <section className="inspector-setting-row" data-stacked={stacked}>
      <div className="inspector-setting-copy">
        <span className={`inspector-control-label${muted ? ' inspector-muted-label' : ''}`}>
          {title}
        </span>
        {description && <div className="inspector-description">{description}</div>}
      </div>
      <div className="inspector-setting-control">{children}</div>
    </section>
  )
}
