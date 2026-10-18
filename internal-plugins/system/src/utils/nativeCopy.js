const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit'
])

/**
 * 判断页面是否存在用户原生文本选择。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export const hasNativeTextSelection = () => {
  const selection = globalThis.getSelection?.()
  return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed)
}

/**
 * 判断键盘事件是否来自可编辑元素。
 * @param target target 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export const isTextEditingTarget = (target) => {
  if (!target || typeof target !== 'object') return false
  if (target.isContentEditable) return true

  const tagName = target.tagName?.toLowerCase()
  if (tagName === 'textarea' || tagName === 'select') return true
  if (tagName !== 'input') return false

  return !NON_TEXT_INPUT_TYPES.has(String(target.type || 'text').toLowerCase())
}

/**
 * 决定复制快捷键是否保留给原生文本选择。
 * @param event event 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export const shouldUseNativeCopy = (event) =>
  isTextEditingTarget(event?.target) || hasNativeTextSelection()

/**
 * 清除列表切换后遗留的文本选择。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export const clearNativeTextSelection = () => {
  const selection = globalThis.getSelection?.()
  if (selection && !selection.isCollapsed && typeof selection.removeAllRanges === 'function') {
    selection.removeAllRanges()
  }
}
