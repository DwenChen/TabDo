/** 原 local-search-neo 分类契约与十种默认分类；MIT 来源见 docs/tools-development.md。 */
export interface FinderCategory {
  id: string
  label: string
  kind: 'all' | 'folder' | 'extension' | 'custom'
  rule: string
  enabled?: boolean
}
export const DEFAULT_CATEGORIES: FinderCategory[] = [
  { id: 'all', label: '全部', kind: 'all', rule: '' },
  { id: 'folder', label: '文件夹', kind: 'folder', rule: 'folder:' },
  { id: 'excel', label: 'EXCEL', kind: 'extension', rule: 'ext:xls;xlsx;xlsm;csv' },
  { id: 'word', label: 'WORD', kind: 'extension', rule: 'ext:doc;docx;rtf' },
  { id: 'ppt', label: 'PPT', kind: 'extension', rule: 'ext:ppt;pptx' },
  { id: 'pdf', label: 'PDF', kind: 'extension', rule: 'ext:pdf' },
  { id: 'image', label: '图片', kind: 'extension', rule: 'ext:jpg;jpeg;png;gif;webp;bmp;svg;ico' },
  { id: 'video', label: '视频', kind: 'extension', rule: 'ext:mp4;mkv;avi;mov;wmv;flv;webm' },
  { id: 'audio', label: '音频', kind: 'extension', rule: 'ext:mp3;wav;flac;aac;ogg;m4a' },
  { id: 'archive', label: '压缩文件', kind: 'extension', rule: 'ext:zip;rar;7z;tar;gz;iso' }
]
/**
 * 保留原插件自定义规则语义，扩展名简写会转为 ext 查询。
 * @param rule 分类规则或分号分隔的扩展名。
 * @returns Everything 筛选表达式。
 */
export function normalizeCategoryRule(rule: string): string {
  const trimmed = rule.trim()
  if (!trimmed || /[: *]/.test(trimmed)) return trimmed
  return (
    'ext:' +
    trimmed
      .split(/[;,，\s]+/)
      .map((value) => value.trim().replace(/^\./, ''))
      .filter(Boolean)
      .join(';')
  )
}
/**
 * 即使关键词为空也保留分类条件；正则仅修饰关键词，避免误解析分类语法。
 * @param keyword 用户输入的关键词或原生搜索表达式。
 * @param category 当前分类。
 * @param regex 是否将关键词当作正则。
 * @returns 有界的完整查询表达式。
 * @throws {Error} 正则含双引号或完整表达式超过桥接上限时抛出。
 */
export function buildLocalSearchQuery(
  keyword: string,
  category: FinderCategory,
  regex = false
): string {
  let term = keyword.trim()
  if (regex && term) {
    if (term.includes('"')) throw new Error('正则关键词请使用 \\x22 表示双引号')
    term = `regex:"${term}"`
  }
  const query = [term, normalizeCategoryRule(category.rule)].filter(Boolean).join(' ')
  if (query.length > 2000) throw new Error('搜索表达式超过 2000 字符，请缩短关键词或分类规则')
  return query
}
