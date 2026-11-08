import { createContext, useContext, useState, type ReactNode, type ReactElement } from 'react'

interface TrackOrderState {
  order: string[]
  onChange: (order: string[]) => void
  activeId: string | null
  drop: { id: string; edge: 'before' | 'after' } | null
  start: (id: string) => void
  preview: (id: string, edge: 'before' | 'after') => void
  clear: () => void
}
const TrackOrderContext = createContext<TrackOrderState | null>(null)

/**
 * 为轨道标题提供独立的排列状态，排序不改变轨道类型或片段时间。
 * @param props 已保存的轨道顺序、更新回调和时间轴正文。
 * @returns 共享当前项目顺序的时间轴正文。
 */
export function TrackOrderProvider(props: {
  order: string[]
  onChange: (order: string[]) => void
  children: ReactNode
}): ReactElement {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drop, setDrop] = useState<TrackOrderState['drop']>(null)
  return (
    <TrackOrderContext.Provider
      value={{
        ...props,
        activeId,
        drop,
        start: (id) => {
          setActiveId(id)
          setDrop(null)
        },
        preview: (id, edge) =>
          setDrop((previous) =>
            previous?.id === id && previous.edge === edge ? previous : { id, edge }
          ),
        clear: () => {
          setActiveId(null)
          setDrop(null)
        }
      }}
    >
      {props.children}
    </TrackOrderContext.Provider>
  )
}

/**
 * 将轨道插入目标位置，保留当前未显示轨道的身份。
 * @param order 当前排列。
 * @param active 被拖动的轨道。
 * @param target 目标轨道。
 * @param edge 明确插入目标上方或下方，省略时根据原方向判断。
 * @returns 无效操作返回原排列，否则返回新排列。
 */
export function moveTrack(
  order: string[],
  active: string,
  target: string,
  edge?: 'before' | 'after'
): string[] {
  if (active === target || !order.includes(active) || !order.includes(target)) return order
  const next = order.filter((id) => id !== active)
  const placement = edge ?? (order.indexOf(active) < order.indexOf(target) ? 'after' : 'before')
  next.splice(next.indexOf(target) + (placement === 'after' ? 1 : 0), 0, active)
  return next
}

/**
 * 读取轨道排序上下文，缺少提供者时保留默认排列。
 * @returns 当前项目的排序状态或空值。
 */
export function useTrackOrder(): TrackOrderState | null {
  return useContext(TrackOrderContext)
}
