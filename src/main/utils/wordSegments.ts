/** 拆分选词允许渲染的词语上限，避免超长文本生成过多界面节点。 */
export const WORD_PICKER_LIMIT = 3000

/** 拆分选词结果。 */
export interface WordSplitResult {
  /** 按原文顺序排列的可选词语。 */
  words: string[]
  /** 是否因超过上限而截断后续词语。 */
  truncated: boolean
}

/**
 * 按空白、标点和换行拆分文本，中文按语义词、英文与数字按整词保留。
 * @param text 待拆分的原始文本。
 * @param limit 词语上限，省略时使用界面允许的最大数量。
 * @returns 按原文顺序排列的词语以及是否发生截断。
 */
export function splitWords(text: string, limit = WORD_PICKER_LIMIT): WordSplitResult {
  const source = typeof text === 'string' ? text : ''
  if (!source.trim()) return { words: [], truncated: false }
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  const words: string[] = []
  for (const part of segmenter.segment(source)) {
    if (!part.isWordLike) continue
    // 达到上限后立即停止遍历，超长文本只保留可渲染的前缀。
    if (words.length >= limit) return { words, truncated: true }
    words.push(part.segment)
  }
  return { words, truncated: false }
}
