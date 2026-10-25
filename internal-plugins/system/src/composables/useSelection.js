import { computed, ref, watch } from 'vue'
import {
  clearNativeTextSelection,
  hasNativeTextSelection,
  shouldUseNativeCopy
} from '../utils/nativeCopy.js'
import { getClipboardTransferError } from '../utils/clipboardPayload.js'

/**
 * 维护多选、范围选择及复制粘贴快捷键。
 * @param filteredData filteredData 参数。
 * @param tabs tabs 参数。
 * @param activeTab activeTab 参数。
 * @param writeItems writeItems 参数。
 * @param onDeleteItems onDeleteItems 参数。
 * @param onInvalidSelection 混合内容类型时的可见禁止反馈，可省略。
 * @returns {object} 响应式选择状态与复制、粘贴及导航操作。
 */
export function useSelection(
  filteredData,
  tabs,
  activeTab,
  writeItems,
  onDeleteItems,
  onInvalidSelection
) {
  const activeItem = ref(null)
  const selectionAnchor = ref(null)
  const selectedItemSet = ref(new Set())
  const clipboardListRef = ref(null)

  const activeIndex = computed(() => filteredData.value.indexOf(activeItem.value))
  const selectedItems = computed(() => {
    const visibleItems = new Set(filteredData.value)
    return [...selectedItemSet.value].filter((item) => visibleItems.has(item))
  })
  const selectedCount = computed(() => selectedItems.value.length)

  /**
   * 原子替换选择集合、活动条目及范围锚点。
   * @param items items 参数。
   * @param active active 参数。
   * @param anchor anchor 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const replaceSelection = (items, active = items[0] || null, anchor = active) => {
    selectedItemSet.value = new Set(items)
    activeItem.value = active
    selectionAnchor.value = anchor
  }

  /**
   * 仅选中指定可见条目。
   * @param index index 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const selectSingle = (index) => {
    const item = filteredData.value[index]
    if (!item) return
    replaceSelection([item], item, item)
  }

  /**
   * 清空选择，不自动选中当前分类的最新条目。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const resetSelection = () => {
    replaceSelection([])
  }

  /**
   * 列表变化后保留仍可见的选择。
   * @param items items 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const syncSelection = (items) => {
    if (items.length === 0) {
      resetSelection()
      return
    }

    const visibleItems = new Set(items)
    const retainedItems = [...selectedItemSet.value].filter((item) => visibleItems.has(item))
    if (retainedItems.length === 0) {
      resetSelection()
      return
    }

    selectedItemSet.value = new Set(retainedItems)
    if (!visibleItems.has(activeItem.value)) {
      activeItem.value = retainedItems.at(-1)
    }
    if (!visibleItems.has(selectionAnchor.value)) {
      selectionAnchor.value = activeItem.value
    }
  }

  watch(() => filteredData.value.slice(), syncSelection, { immediate: true })

  /**
   * 从锚点扩展同类型范围，混合类型时保留原选择并提供禁止反馈。
   * @param {number} index 当前可见条目的下标。
   * @returns {boolean} 是否完成允许的选择操作。
   */
  const selectRange = (index) => {
    const item = filteredData.value[index]
    const anchorIndex = filteredData.value.indexOf(selectionAnchor.value)
    if (item && anchorIndex >= 0 && selectionAnchor.value.type !== item.type) {
      onInvalidSelection?.(getClipboardTransferError([selectionAnchor.value.type, item.type]))
      return false
    }
    if (!item || anchorIndex < 0) {
      selectSingle(index)
      return true
    }

    const direction = anchorIndex <= index ? 1 : -1
    const rangeItems = []
    for (
      let rangeIndex = anchorIndex;
      direction > 0 ? rangeIndex <= index : rangeIndex >= index;
      rangeIndex += direction
    ) {
      const rangeItem = filteredData.value[rangeIndex]
      if (rangeItem.type === item.type) rangeItems.push(rangeItem)
    }

    replaceSelection(rangeItems, item, selectionAnchor.value)
    return true
  }

  /**
   * 切换同类型条目的选择，混合类型时拒绝且保留原选择。
   * @param {number} index 当前可见条目的下标。
   * @returns {boolean} 是否成功更新选择。
   */
  const toggleItem = (index) => {
    const item = filteredData.value[index]
    if (!item) return false

    clearNativeTextSelection()

    const currentItems = selectedItems.value
    if (currentItems.length > 0 && currentItems[0].type !== item.type) {
      onInvalidSelection?.(getClipboardTransferError([currentItems[0].type, item.type]))
      return false
    }

    const nextSelection = new Set(selectedItemSet.value)
    if (nextSelection.has(item)) {
      nextSelection.delete(item)
      const nextActiveItem = [...nextSelection].at(-1) || null
      activeItem.value = nextActiveItem
      selectionAnchor.value = nextActiveItem
    } else {
      nextSelection.add(item)
      activeItem.value = item
      selectionAnchor.value = item
    }

    selectedItemSet.value = nextSelection
    return true
  }

  /**
   * 根据修饰键执行单选或范围多选。
   * @param event event 参数。
   * @param index index 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const handleItemClick = (event, index) => {
    // A text drag emits click after mouseup; keep both the DOM selection and record selection intact.
    if (hasNativeTextSelection() && !event.shiftKey && !event.metaKey && !event.ctrlKey)
      return false

    if (event.shiftKey) {
      clearNativeTextSelection()
      return selectRange(index)
    } else if (event.metaKey || event.ctrlKey) {
      return toggleItem(index)
    } else {
      selectSingle(index)
    }
    return true
  }

  /**
   * 处理复选框点击，禁止混合时阻止浏览器把复选框错误切为选中。
   * @param {MouseEvent} event 原始点击事件。
   * @param {number} index 可见条目下标。
   * @returns {boolean} 是否完成允许的选择操作。
   */
  const handleToggleClick = (event, index) => {
    const changed = event.shiftKey ? handleItemClick(event, index) : toggleItem(index)
    if (!changed) event.preventDefault?.()
    return changed
  }

  /**
   * 让右键操作保留已选集合，仅在点击未选条目时切换到单选。
   * @param index index 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const handleContextSelection = (index) => {
    if (!selectedItemSet.value.has(filteredData.value[index])) selectSingle(index)
  }

  /**
   * 解析列表组件的实际滚动容器。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const getContainerEl = () => {
    const element = clipboardListRef.value
    if (!element) return null
    return element.$el || element
  }

  /**
   * 将活动条目滚动到可见区域。
   * @param direction direction 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const scrollToActiveItem = (direction = 'down') => {
    setTimeout(() => {
      const activeElement = document.querySelector('.clipboard-item.active')
      const container = getContainerEl()
      if (!activeElement || !container) return

      const containerRect = container.getBoundingClientRect()
      const elementRect = activeElement.getBoundingClientRect()

      if (direction === 'down' && elementRect.bottom > containerRect.bottom) {
        container.scrollTop += elementRect.bottom - containerRect.bottom + 10
      } else if (direction === 'up' && elementRect.top < containerRect.top) {
        container.scrollTop += elementRect.top - containerRect.top - 10
      }
    }, 0)
  }

  /**
   * 寻找指定方向的下一个匹配类型条目。
   * @param startIndex startIndex 参数。
   * @param direction direction 参数。
   * @param type type 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const findNextIndex = (startIndex, direction, type) => {
    for (
      let index = startIndex + direction;
      index >= 0 && index < filteredData.value.length;
      index += direction
    ) {
      if (!type || filteredData.value[index].type === type) return index
    }
    return startIndex
  }

  /**
   * 选中当前列表中与活动条目同类型的记录。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const selectAllOfActiveType = () => {
    const item = activeItem.value || filteredData.value[0]
    if (!item) return
    const matchingItems = filteredData.value.filter((candidate) => candidate.type === item.type)
    const orderedItems = [item, ...matchingItems.filter((candidate) => candidate !== item)]
    replaceSelection(orderedItems, item, item)
  }

  /**
   * 执行当前选择的复制或粘贴。
   * @param shouldPaste shouldPaste 参数。
   * @returns 操作完成后的 Promise。
   */
  const executeSelected = async (shouldPaste = true) => {
    if (selectedItems.value.length > 0) {
      await writeItems(selectedItems.value, shouldPaste)
    }
  }

  /**
   * 双击条目时执行粘贴。
   * @param index index 参数。
   * @returns 操作完成后的 Promise。
   */
  const handleDoubleClick = async (index) => {
    const item = filteredData.value[index]
    if (!item) return

    if (!selectedItemSet.value.has(item)) {
      selectSingle(index)
    }
    await executeSelected(true)
  }

  /**
   * 处理当前视图的键盘交互。
   * @param event event 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const handleKeydown = (event) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'c'
    ) {
      if (shouldUseNativeCopy(event) || selectedCount.value === 0) return
      event.preventDefault()
      executeSelected(false)
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selectAllOfActiveType()
      return
    }

    if (event.key === 'Escape' && selectedCount.value > 1) {
      event.preventDefault()
      selectSingle(Math.max(0, activeIndex.value))
      return
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const currentIndex = tabs.value.findIndex((tab) => tab.key === activeTab.value)
      const nextIndex =
        event.key === 'ArrowLeft'
          ? currentIndex > 0
            ? currentIndex - 1
            : tabs.value.length - 1
          : currentIndex < tabs.value.length - 1
            ? currentIndex + 1
            : 0

      activeTab.value = tabs.value[nextIndex].key
      resetSelection()
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      if (filteredData.value.length === 0) return

      const direction = event.key === 'ArrowDown' ? 1 : -1
      // 无选择时从边界条目开始，不能跳过第一项，也不在加载时替用户选择。
      if (activeIndex.value < 0) {
        selectSingle(direction > 0 ? 0 : filteredData.value.length - 1)
        scrollToActiveItem(direction > 0 ? 'down' : 'up')
        return
      }
      const currentIndex = activeIndex.value >= 0 ? activeIndex.value : 0
      const type = event.shiftKey ? selectionAnchor.value?.type || activeItem.value?.type : null
      const nextIndex = findNextIndex(currentIndex, direction, type)

      if (event.shiftKey) {
        if (!selectionAnchor.value) {
          selectionAnchor.value = filteredData.value[currentIndex]
        }
        selectRange(nextIndex)
      } else {
        selectSingle(nextIndex)
      }

      scrollToActiveItem(direction > 0 ? 'down' : 'up')
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      executeSelected(true)
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      if (selectedItems.value.length > 0 && onDeleteItems) {
        onDeleteItems(selectedItems.value)
      }
    }
  }

  return {
    activeIndex,
    selectedItems,
    selectedItemSet,
    selectedCount,
    clipboardListRef,
    resetSelection,
    handleItemClick,
    handleContextSelection,
    handleDoubleClick,
    handleKeydown,
    handleToggleClick,
    scrollToActiveItem,
    toggleItem,
    copySelected: () => executeSelected(false),
    pasteSelected: () => executeSelected(true)
  }
}
