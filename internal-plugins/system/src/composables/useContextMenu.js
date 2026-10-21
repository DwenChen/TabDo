import { ref } from 'vue'

/**
 * 维护右键菜单的目标和显示位置。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export function useContextMenu() {
  const contextMenu = ref({
    show: false,
    x: 0,
    y: 0,
    item: null
  })

  /**
   * 限制菜单位置并显示目标条目的操作。
   * @param event event 参数。
   * @param item item 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const showContextMenu = (event, item) => {
    event.preventDefault()
    contextMenu.value = {
      show: true,
      x: Math.max(4, Math.min(event.clientX, window.innerWidth - 160)),
      y: Math.max(4, Math.min(event.clientY, window.innerHeight - 180)),
      item: item
    }
  }

  /**
   * 关闭右键菜单。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const hideContextMenu = () => {
    contextMenu.value.show = false
  }

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu
  }
}
