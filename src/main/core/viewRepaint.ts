import type { WebContentsView } from 'electron'

/**
 * 跨事件循环微调视图尺寸，触发 Windows 合成器重绘；视图已释放或重新布局时放弃恢复。
 * @param view 本次需要重绘的视图，回调不能影响后续替换的会话或布局。
 * @returns 无返回值；仅对仍存活且尺寸未变的同一视图恢复原尺寸。
 */
export function forceRepaintView(view: WebContentsView): void {
  const contents = view.webContents
  if (!contents || contents.isDestroyed()) return
  const bounds = view.getBounds()
  if (bounds.height <= 0) return
  const intermediate = { ...bounds, height: bounds.height + 1 }
  view.setBounds(intermediate)
  setImmediate(() => {
    // 工具可能在下一 tick 前释放，Electron 此时会清空 view.webContents。
    if (contents.isDestroyed() || view.webContents !== contents) return
    const current = view.getBounds()
    // 迟到的重绘不能覆盖用户拖动窗口或切换工具后的新布局。
    if (
      current.x === intermediate.x &&
      current.y === intermediate.y &&
      current.width === intermediate.width &&
      current.height === intermediate.height
    ) {
      view.setBounds(bounds)
    }
  })
}
