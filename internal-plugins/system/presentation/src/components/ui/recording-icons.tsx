import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement>
const DISABLED_SLASH = 'M4 4l16 16'

/**
 * 绘制两列三行的录制控制条拖动手柄。
 * @param props 图标尺寸、颜色及无障碍属性。
 * @returns 六点拖动图标。
 */
export function DragHandleIcon(props: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <circle cx="8" cy="5" r="1.6" />
      <circle cx="16" cy="5" r="1.6" />
      <circle cx="8" cy="12" r="1.6" />
      <circle cx="16" cy="12" r="1.6" />
      <circle cx="8" cy="19" r="1.6" />
      <circle cx="16" cy="19" r="1.6" />
    </svg>
  )
}

/**
 * 绘制无内部横线的简洁麦克风，关闭状态叠加斜线。
 * @param props 图标显示属性及当前是否关闭。
 * @returns 麦克风轮廓图标。
 */
export function RecordingMicIcon({ disabled = false, ...props }: Props & { disabled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3" />
      {disabled && <path d={DISABLED_SLASH} />}
    </svg>
  )
}

/**
 * 绘制系统音频轮廓，关闭斜线沿用麦克风的方向、端点和粗细。
 * @param props 图标显示属性及当前是否关闭。
 * @returns 系统音频开关图标。
 */
export function RecordingSystemAudioIcon({
  disabled = false,
  ...props
}: Props & { disabled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
      {disabled && <path d={DISABLED_SLASH} />}
    </svg>
  )
}

/**
 * 绘制向左回转的通用撤销箭头。
 * @param props 图标显示属性。
 * @returns 撤销图标。
 */
export function UndoIcon(props: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" transform="translate(0 -2)" />
    </svg>
  )
}

/**
 * 绘制向右回转的通用恢复箭头。
 * @param props 图标显示属性。
 * @returns 恢复图标。
 */
export function RedoIcon(props: Props) {
  return <UndoIcon {...props} style={{ ...props.style, transform: 'scaleX(-1)' }} />
}
