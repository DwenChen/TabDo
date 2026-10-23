import type { Rectangle } from 'electron'
import type { GuideFile } from './usageGuideVerification'

interface GuideViewNode {
  readonly children: GuideViewNode[]
  getBounds(): Rectangle
  getVisible(): boolean
}

/** 为原生文件对话框协调嵌套隐藏，只有最后一个对话框收束时才恢复覆盖层。 */
export class GuideNativeDialogScope {
  private pending = new Map<() => Promise<unknown>, Promise<unknown>>()
  private count = 0
  private disposed = false

  /**
   * 保存所属引导窗口的隐藏和恢复回调。
   * @param onChange 对话框组开始或全部结束时接收是否仍活动。
   * @returns 新的本次引导对话框作用域。
   */
  constructor(private onChange: (active: boolean) => void) {}

  /**
   * 查询是否仍有需要保持覆盖层隐藏的原生对话框。
   * @returns 本作用域仍存活且至少一个对话框运行时为 true。
   */
  get active(): boolean {
    return !this.disposed && this.count > 0
  }

  /**
   * 同一操作合并重复调用，不同操作支持嵌套；失败也恢复所属隐藏状态。
   * @param operation 打开真实原生对话框的受控操作。
   * @returns 原生操作的实际结果。
   * @throws 作用域已退出或原生操作失败时抛错。
   */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) throw new Error('引导已退出，无法打开文件对话框')
    const existing = this.pending.get(operation)
    if (existing) return existing as Promise<T>
    const pending = Promise.resolve().then(async () => {
      if (this.disposed) throw new Error('引导已退出，无法打开文件对话框')
      this.count++
      try {
        if (this.count === 1) this.onChange(true)
        return await operation()
      } finally {
        this.count--
        if (!this.disposed && this.count === 0) this.onChange(false)
      }
    })
    this.pending.set(operation, pending)
    // 两个结果分支均释放去重引用；退出后的迟到操作不会重新注册隐藏状态。
    void pending.then(
      () => this.pending.delete(operation),
      () => this.pending.delete(operation)
    )
    return pending
  }

  /**
   * 断开界面恢复权，迟到的系统对话框结果仍交还调用方但不复活覆盖窗口。
   * @returns 无返回值。
   */
  dispose(): void {
    this.disposed = true
    this.pending.clear()
  }
}

/**
 * 沿实际显示树确认工具视图仍已挂载，累计包装视图偏移并拒绝隐藏或退役页面。
 * @param root 目标窗口的 contentView 根节点。
 * @param target 课程所观察的 WebContentsView 身份。
 * @returns 相对窗口客户区的可见视图矩形；不在树中或任何祖先隐藏时返回 null。
 */
export function guideAttachedViewBounds(
  root: GuideViewNode,
  target: GuideViewNode
): Rectangle | null {
  const pending = [{ node: root, x: 0, y: 0, depth: 0 }]
  const seen = new Set<GuideViewNode>()
  let visited = 0
  // 深度和节点数量均有上限，异常布局不能造成引导主进程无限遍历。
  while (pending.length && visited++ < 256) {
    const current = pending.pop()!
    if (seen.has(current.node) || current.depth > 8 || !current.node.getVisible()) continue
    seen.add(current.node)
    if (current.node === target) {
      const bounds = current.node.getBounds()
      return bounds.width > 0 && bounds.height > 0
        ? { x: current.x, y: current.y, width: bounds.width, height: bounds.height }
        : null
    }
    for (const node of current.node.children) {
      const bounds = node.getBounds()
      pending.push({
        node,
        x: current.x + bounds.x,
        y: current.y + bounds.y,
        depth: current.depth + 1
      })
    }
  }
  return null
}

/**
 * 按 Electron 的递增页面身份排列创建顺序，避免把枚举顺序误当成最新窗口。
 * @param contents 当前实例返回的页面身份列表。
 * @returns 新列表，最后一项是身份最新的页面；不改变 Electron 返回的数组。
 */
export function guideCreationOrder<T extends { id: number }>(contents: T[]): T[] {
  return [...contents].sort((left, right) => left.id - right.id)
}

/**
 * 连续工具子步骤共享操作前的文件基线，保留用户提前执行后的真实输出证据。
 * @param previousTool 上一小步所属工具。
 * @param nextTool 即将进入的小步所属工具。
 * @param previous 上一小步开始前的文件快照。
 * @param current 进入新小步时的当前文件快照。
 * @returns 同工具的原始快照；切换工具时返回新快照，避免借用别的工具输出。
 */
export function guideFileBaseline(
  previousTool: string | undefined,
  nextTool: string | undefined,
  previous: Record<string, GuideFile> | undefined,
  current: Record<string, GuideFile> | undefined
): Record<string, GuideFile> | undefined {
  return previousTool && previousTool === nextTool && previous ? previous : current
}

/**
 * 为主进程等待设置截止时间，并在换步或退出时立即撤销监听。
 * @param operation 已启动且可能迟到的异步操作。
 * @param signal 当前步骤的取消信号。
 * @param timeout 最长等待毫秒数。
 * @param label 超时时显示的操作名称。
 * @returns 在截止时间内完成的操作结果。
 * @throws 操作失败、步骤取消或超时时抛错。
 */
export function awaitGuideOperation<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeout: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined
    /**
     * 释放本次等待持有的取消监听与定时器。
     * @returns 无返回值。
     */
    const cleanup = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
    /**
     * 换步或退出后立即结束等待，迟到结果由 Promise 的既有监听吸收。
     * @returns 无返回值。
     */
    const abort = (): void => {
      cleanup()
      reject(new Error('引导步骤已取消'))
    }
    // 先接住原操作的两个分支，取消后仍不会留下未处理的迟到拒绝。
    operation.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => {
      cleanup()
      reject(new Error(`${label}超时，可重试、跳过或结束引导。`))
    }, timeout)
  })
}

/**
 * 把渲染器 CSS 矩形映射到覆盖窗口中的逻辑像素，裁掉视图外不可见部分。
 * @param rectangle 元素在页面视口中的 CSS 矩形。
 * @param viewport 所属 WebContentsView 在屏幕中的 DIP 矩形。
 * @param display 全屏覆盖窗口使用的屏幕 DIP 矩形。
 * @param zoom WebContents 的缩放倍数；显示器 scaleFactor 不参与 DIP 运算。
 * @returns 当前屏幕可见的强调矩形；完全不可见时返回 null。
 */
export function guideSpotlightRectangle(
  rectangle: Rectangle,
  viewport: Rectangle,
  display: Rectangle,
  zoom: number
): Rectangle | null {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const left = Math.max(viewport.x, display.x, viewport.x + rectangle.x * scale)
  const top = Math.max(viewport.y, display.y, viewport.y + rectangle.y * scale)
  const right = Math.min(
    viewport.x + viewport.width,
    display.x + display.width,
    viewport.x + (rectangle.x + rectangle.width) * scale
  )
  const bottom = Math.min(
    viewport.y + viewport.height,
    display.y + display.height,
    viewport.y + (rectangle.y + rectangle.height) * scale
  )
  if (right <= left || bottom <= top) return null
  return {
    x: Math.round(left - display.x),
    y: Math.round(top - display.y),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top))
  }
}

/**
 * 将提示卡放到与操作目标重叠最少的位置，保持所有按钮在当前屏幕内。
 * @param display 当前屏幕的 DIP 尺寸。
 * @param size 提示卡实际测得的宽高。
 * @param target 当前元素在覆盖窗口中的强调矩形。
 * @returns 屏幕内的提示卡位置和尺寸。
 */
export function guideCardRectangle(
  display: Rectangle,
  size: Pick<Rectangle, 'width' | 'height'>,
  target: Rectangle | null
): Rectangle {
  const gap = 18
  const width = Math.min(size.width, Math.max(1, display.width - gap * 2))
  const height = Math.min(size.height, Math.max(1, display.height - gap * 2))
  const right = Math.max(gap, display.width - width - gap)
  const bottom = Math.max(gap, display.height - height - gap)
  const candidates = [
    { x: right, y: gap, width, height },
    { x: gap, y: gap, width, height },
    { x: right, y: bottom, width, height },
    { x: gap, y: bottom, width, height }
  ]
  if (!target) return candidates[0]
  /**
   * 使用相交面积比较候选位置，优先保留没有遮挡的右上角。
   * @param card 待比较的卡片矩形。
   * @returns 卡片与目标的相交面积。
   */
  const overlap = (card: Rectangle): number =>
    Math.max(0, Math.min(card.x + width, target.x + target.width) - Math.max(card.x, target.x)) *
    Math.max(0, Math.min(card.y + height, target.y + target.height) - Math.max(card.y, target.y))
  return candidates.reduce((best, candidate) =>
    overlap(candidate) < overlap(best) ? candidate : best
  )
}
