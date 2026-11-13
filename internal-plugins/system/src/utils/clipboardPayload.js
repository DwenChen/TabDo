import { getClipboardTransferError, isClipboardImageFiles } from '@shared/clipboardTransfer'

/**
 * 按可合并操作的类型识别剪贴板条目，保留记录本身的原始类型。
 * @param item 历史或收藏中的条目。
 * @returns 文本、图片或文件的操作类型。
 */
export function clipboardItemTransferType(item) {
  if (item?.type === 'file' && isClipboardImageFiles(item.files)) return 'image'
  return item?.type
}

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
 * 提取图片和文件条目的磁盘路径，供复制和原生拖放使用。
 * @param items 按列表顺序排列的条目。
 * @returns 去重后的磁盘路径。
 */
export function clipboardItemPaths(items) {
  return uniquePaths(
    items.flatMap((item) => {
      if (item.type === 'file') return getFilePaths(item)
      return item.type === 'image' ? [getImagePath(item)] : []
    })
  )
}

/**
 * 将同操作类型的选择转换为宿主剪贴板载荷。
 * @param items 按列表顺序排列的已选条目。
 * @returns 可写入宿主的载荷，无有效内容时为 null。
 */
export const buildClipboardPayload = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null

  const type = clipboardItemTransferType(items[0])
  if (getClipboardTransferError(items.map(clipboardItemTransferType))) return null

  if (type === 'text') {
    return {
      type: 'text',
      content: items.map((item) => String(item.content ?? '')).join('\n')
    }
  }

  // 单条仍沿用原始表示，复制图片文件时保留文件路径。
  if (items.length === 1 && items[0].type === 'image') {
    const content = itemImageContent(items[0])
    return content ? { type: 'image', content } : null
  }

  if (type === 'image' || type === 'file') {
    const paths = clipboardItemPaths(items)
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
export { getClipboardTransferError }
