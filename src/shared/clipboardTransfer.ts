/**
 * 判断合并复制或拖出是否混合了不兼容的内容类型，文件扩展名不改变文件传输语义。
 * @param types 选中条目的text、image或file类型。
 * @returns 混合时的明确禁止原因，同类型或空集合时为undefined。
 */
export function getClipboardTransferError(types: readonly string[]): string | undefined {
  return new Set(types).size > 1 ? '不能混合复制或拖出文本、图片和文件，请分别操作' : undefined
}
