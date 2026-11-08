import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement
} from 'react'
import { createPortal } from 'react-dom'

export type TimelineItemTarget = { id: string; variant: string }
export type TimelineItemAction = {
  label: string
  run: () => void
  disabled?: boolean
  destructive?: boolean
}
type MenuRequest = { target: TimelineItemTarget; x: number; y: number; anchor: HTMLElement }
const MenuContext = createContext<((request: MenuRequest) => void) | null>(null)

/**
 * 访问当前时间轴统一右键菜单入口，菜单只在用户调用时挂载。
 * @returns 菜单打开函数，或未处于编辑器时的空值。
 */
export function useTimelineItemMenu(): ((request: MenuRequest) => void) | null {
  return useContext(MenuContext)
}

/**
 * 为所有片段提供不透明右键菜单，处理边界定位、焦点和键盘导航。
 * @param props 轨道正文与按目标片段生成的操作。
 * @returns 正文和按需挂载的菜单。
 */
export function TimelineItemMenuProvider({
  children,
  resolveActions
}: {
  children: ReactNode
  resolveActions: (target: TimelineItemTarget) => TimelineItemAction[]
}): ReactElement {
  const [request, setRequest] = useState<MenuRequest | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const actions = request ? resolveActions(request.target) : []
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!request || !menu) return
    // 首次绘制前限制在可见窗口中，避免底部轨道菜单越界。
    menu.style.left = `${Math.max(8, Math.min(request.x, window.innerWidth - menu.offsetWidth - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(request.y, window.innerHeight - menu.offsetHeight - 8))}px`
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [request])
  useEffect(() => {
    if (!request) return
    /**
     * 在菜单外操作或滚动时收起，避免操作已移动的旧片段。
     * @param event 当前窗口交互。
     * @returns 无返回值；必要时收起菜单。
     */
    function dismiss(event: Event): void {
      if (!menuRef.current?.contains(event.target as Node)) setRequest(null)
    }
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [request])
  return (
    <MenuContext.Provider value={setRequest}>
      {children}
      {request &&
        actions.length > 0 &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="片段操作"
            className="fixed z-[200] min-w-40 rounded-lg border border-foreground/15 p-1 text-xs text-foreground shadow-lg"
            style={{
              left: request.x,
              top: request.y,
              background: 'var(--bg-elevated, var(--background))'
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              const buttons = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
              )
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
              if (['ArrowDown', 'ArrowUp', 'Home', "终点"].includes(event.key)) {
                event.preventDefault()
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === "终点"
                      ? buttons.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                        buttons.length
                buttons[next]?.focus()
              } else if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault()
                request.anchor.focus({ preventScroll: true })
                setRequest(null)
              }
            }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                className={`flex w-full rounded-md px-3 py-2 text-left hover:bg-foreground/10 focus:bg-foreground/10 focus:outline-none disabled:opacity-35 ${action.destructive ? 'text-danger' : ''}`}
                onClick={() => {
                  // 先归还焦点再执行；删除操作允许把目标从文档中移除。
                  request.anchor.focus({ preventScroll: true })
                  setRequest(null)
                  action.run()
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </MenuContext.Provider>
  )
}
