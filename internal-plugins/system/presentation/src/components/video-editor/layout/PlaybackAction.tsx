import { Tooltip } from '@heroui/react'
import { useState } from 'react'
import { Button, type ButtonProps } from '@presentation/components/ui/button'

/**
 * 为播放工具提供即时中文悬停与焦点提示，禁用操作同样说明可用条件。
 * @param props 图标按钮、提示及操作状态。
 * @returns 带统一提示的工具按钮。
 */
export function PlaybackAction({ title, ...props }: ButtonProps & { title: string }) {
  const [showTip, setShowTip] = useState(false)
  return (
    <Tooltip delay={350} isOpen={showTip} onOpenChange={setShowTip}>
      {props.disabled ? (
        <Tooltip.Trigger
          className={`inline-flex items-center justify-center rounded-full opacity-50 ${props.className ?? ''}`}
          aria-label={props['aria-label'] ?? title}
          aria-disabled="true"
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          onFocus={() => setShowTip(true)}
          onBlur={() => setShowTip(false)}
        >
          {props.children}
        </Tooltip.Trigger>
      ) : (
        <Tooltip.Trigger className="inline-flex" role="presentation" tabIndex={-1}>
          <Button {...props} aria-label={props['aria-label'] ?? title} />
        </Tooltip.Trigger>
      )}
      <Tooltip.Content placement="top">{title}</Tooltip.Content>
    </Tooltip>
  )
}
