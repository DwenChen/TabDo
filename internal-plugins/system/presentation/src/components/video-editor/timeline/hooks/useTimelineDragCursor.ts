import { useLayoutEffect, useRef } from 'react'

/**
 * 在一次拖动期间固定系统指针，避免游标重绘及经过其他控件时争用光标样式。
 * @param active 当前是否处于游标或关键帧拖动中。
 * @param cancel 失焦、取消或按下Escape时结束当前拖动。
 * @returns 无返回值；结束或卸载时移除本次手势的样式和监听。
 */
export function useTimelineDragCursor(active: boolean, cancel: () => void): void {
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  useLayoutEffect(() => {
    if (!active) return
    // 样式只跟随手势生命周期，不能随每次时间更新先恢复箭头再设置拖动指针。
    const style = document.createElement('style')
    style.dataset.timelineDragCursor = 'true'
    style.textContent = '* { cursor: ew-resize !important; user-select: none !important; }'
    document.head.append(style)
    /**
     * 终止已离开前台或被系统取消的手势。
     * @returns 无返回值；通知调用方清除拖动状态。
     */
    const stop = (): void => cancelRef.current()
    /**
     * 允许键盘退出拖动，防止失去鼠标抬起事件后遗留指针。
     * @param event 当前键盘事件。
     * @returns 无返回值；Escape结束手势。
     */
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') stop()
    }
    window.addEventListener('blur', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('keydown', keydown)
    return () => {
      // 仅释放本次手势拥有的资源，保留页面原有鼠标与选择样式。
      style.remove()
      window.removeEventListener('blur', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('keydown', keydown)
    }
  }, [active])
}
