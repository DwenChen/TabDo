/**
 * 识别只包含图片的文件组，目录和普通文件不能参与图片批量操作。
 * @param files 剪贴板文件组。
 * @returns 非空且全部是支持的图片文件时为真。
 */
export function isClipboardImageFiles(
  files?: readonly { path?: string; isDirectory?: boolean }[]
): boolean {
  return (
    !!files?.length &&
    files.every(
      (file) =>
        !file?.isDirectory &&
        typeof file?.path === 'string' &&
        /\.(?:png|jpe?g|gif|bmp|webp|ico|avif|tiff?)$/i.test(file.path)
    )
  )
}

/**
 * 判断传输是否混合了不兼容的操作类型。
 * @param types 调用方按传输语义确定的 text、image 或 file 类型。
 * @returns 混合时的明确禁止原因，同类型或空集合时为undefined。
 */
export function getClipboardTransferError(types: readonly string[]): string | undefined {
  return new Set(types).size > 1 ? '不能混合复制或拖出文本、图片和文件，请分别操作' : undefined
}
