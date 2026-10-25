/**
 * 读取图片条目的本地路径。
 * @param item item 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const getImagePath = (item) => {
  if (typeof item.imagePath === 'string' && item.imagePath) {
    return item.imagePath
  }

  if (typeof item.content !== 'string' || item.content.startsWith('data:')) {
    return ''
  }

  return item.content.startsWith('file://') ? item.content.slice('file://'.length) : item.content
}

/**
 * 提取文件条目中的路径集合。
 * @param item item 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const getFilePaths = (item) => {
  if (Array.isArray(item.files)) {
    return item.files.map((file) => file?.path)
  }
  return [item.filePath]
}

/**
 * 过滤无效路径并保持顺序去重。
 * @param paths paths 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const uniquePaths = (paths) => {
  const seen = new Set()
  return paths.filter((path) => {
    if (typeof path !== 'string' || !path || seen.has(path)) return false
    seen.add(path)
    return true
  })
}

/**
 * 将同类型选择转换为宿主剪贴板载荷。
 * @param items items 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export const buildClipboardPayload = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null

  const type = items[0].type
  if (!items.every((item) => item?.type === type)) return null

  if (type === 'text') {
    return {
      type: 'text',
      content: items.map((item) => String(item.content ?? '')).join('\n')
    }
  }

  if (type === 'image') {
    if (items.length === 1) {
      const content = itemImageContent(items[0])
      return content ? { type: 'image', content } : null
    }

    const paths = uniquePaths(items.map(getImagePath))
    return paths.length > 0 ? { type: 'file', content: paths } : null
  }

  if (type === 'file') {
    const paths = uniquePaths(items.flatMap(getFilePaths))
    return paths.length > 0 ? { type: 'file', content: paths } : null
  }

  return null
}

/**
 * 提取单张图片可写入的内容。
 * @param item item 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const itemImageContent = (item) => item.imagePath || item.content?.replace(/^file:\/\//, '') || ''
import { getClipboardTransferError } from '@shared/clipboardTransfer'
export { getClipboardTransferError }
