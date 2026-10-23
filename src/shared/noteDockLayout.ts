export interface DockTab {
  id: number
  label: string
  offset: number
}

/**
 * 将靠近的同边色签按编号整理为轻微错位的堆叠，完整保留标签文字区。
 * @param tabs 同显示器同边缘的收起便签。
 * @param target 本次拖动或收起的便签身份。
 * @param lower 工作区沿边起点。
 * @param length 工作区沿边长度。
 * @param vertical 是否为左右边缘。
 * @returns 当前相邻组的沿边位置与向屏幕内侧的错位距离。
 */
export function layoutDockTabs(
  tabs: DockTab[],
  target: number,
  lower: number,
  length: number,
  vertical: boolean
): Array<{ id: number; offset: number; inset: number }> {
  const size = vertical ? 80 : 88
  const ordered = [...tabs].sort((a, b) => a.offset - b.offset || a.id - b.id)
  const groups: DockTab[][] = []
  // 仅整理相邻组，远处独立标签保持用户选择的位置。
  for (const tab of ordered) {
    const group = groups.at(-1)
    if (!group || tab.offset - group.at(-1)!.offset > size + 22) groups.push([tab])
    else group.push(tab)
  }
  const group = groups.find((items) => items.some((item) => item.id === target))
  if (!group || group.length < 2) return []
  group.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true }) || a.id - b.id)
  // 常见标签仅重叠纸张留白；长编号扩大间距，不能遮住任何文字或数字。
  const step = Math.max(
    size - 6,
    ...group.map((item) =>
      vertical ? item.label.replace(/\s/g, '').length * 14 + 8 : item.label.length * 12 + 8
    )
  )
  const capacity = Math.max(1, Math.floor((length - size) / step) + 1)
  const used = Math.min(capacity, group.length)
  const anchor = Math.round(
    Math.max(
      lower,
      Math.min(
        Math.min(...group.map((item) => item.offset)),
        lower + length - size - (used - 1) * step
      )
    )
  )
  return group.map((tab, index) => ({
    id: tab.id,
    offset: anchor + (index % capacity) * step,
    inset: Math.floor(index / capacity) * 24 + ((index % capacity) % 3) * 3
  }))
}
