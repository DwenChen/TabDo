/**
 * 根据文件扩展名选择图标类别。
 * @param file file 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export const getFileIconType = (file) => {
  if (file.isDirectory) return 'folder'
  const ext = file.name.split('.').pop()?.toLowerCase()
  const typeMap = {
    pdf: 'pdf',
    doc: 'doc',
    docx: 'doc',
    xls: 'sheet',
    xlsx: 'sheet',
    ppt: 'sheet',
    pptx: 'sheet',
    zip: 'archive',
    gz: 'archive',
    rar: 'archive',
    '7z': 'archive',
    tar: 'archive',
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    svg: 'image',
    webp: 'image',
    mp4: 'video',
    mov: 'video',
    avi: 'video',
    mkv: 'video',
    mp3: 'audio',
    wav: 'audio',
    flac: 'audio',
    aac: 'audio'
  }
  return typeMap[ext] || 'file'
}
