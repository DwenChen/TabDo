import { describe, expect, it } from 'vitest'
import { splitWords, WORD_PICKER_LIMIT } from '../../src/main/utils/wordSegments'

describe('拆分选词分词', () => {
  it('按空白和标点拆分，保留英文整词与数字', () => {
    const { words, truncated } = splitWords('Hello, world! 版本 1.5.9 已发布。')
    expect(truncated).toBe(false)
    expect(words[0]).toBe('Hello')
    expect(words).toContain('world')
    expect(words).toContain('1.5.9')
    expect(words.join('')).not.toMatch(/\s/)
    expect(words.length).toBeGreaterThan(4)
  })

  it('中文按语义词或字符保留，顺序与原文一致', () => {
    const { words } = splitWords('拆分选词 读写')
    expect(words.join('')).toBe('拆分选词读写')
    expect(words.length).toBeGreaterThan(1)
  })

  it('超过上限时截断并标记，未超限不标记', () => {
    const { words, truncated } = splitWords('一 二 三 四 五', 3)
    expect(words).toEqual(['一', '二', '三'])
    expect(truncated).toBe(true)
    expect(splitWords('一 二', 3)).toEqual({ words: ['一', '二'], truncated: false })
  })

  it('空文本和纯空白没有可拆分的词语', () => {
    expect(splitWords('')).toEqual({ words: [], truncated: false })
    expect(splitWords(' \n\t ')).toEqual({ words: [], truncated: false })
    expect(WORD_PICKER_LIMIT).toBeGreaterThan(0)
  })
})
