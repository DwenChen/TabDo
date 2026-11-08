import { Tooltip } from '@heroui/react'
import { forwardRef } from 'react'
import { Button, type ButtonProps } from '../ui/button'
import { useLaunchPopoverCoordinator } from './popovers/LaunchPopoverCoordinator'

/**
 * 为控制条按钮提供统一的悬停和键盘焦点提示，打开选项时让出提示空间。
 * @param props 按钮属性，title 用作提示文字及缺省无障碍名称。
 * @param ref 传递给实际按钮的引用。
 * @returns 保留按钮及弹层触发行为的带提示按钮。
 */
export const HudButton = forwardRef<HTMLButtonElement, ButtonProps>(function HudButton(
  { title, ...props },
  ref
) {
  const { openId } = useLaunchPopoverCoordinator()
  // 使用独立提示层，避免原生 title 延迟显示或与选项弹层同时出现。
  return (
    <Tooltip delay={450} closeDelay={0} isDisabled={openId !== null || !title}>
      <Tooltip.Trigger className="inline-flex" role="presentation" tabIndex={-1}>
        <Button {...props} ref={ref} aria-label={props['aria-label'] ?? title} />
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" offset={8} className="pointer-events-none select-none">
        {title}
      </Tooltip.Content>
    </Tooltip>
  )
})
