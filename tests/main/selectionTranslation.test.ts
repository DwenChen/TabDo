import { describe, expect, it } from 'vitest'
import { shouldAutoTranslateSelection } from '../../src/shared/selectionTranslation'

describe('selected text automatic translation', () => {
  it.each([
    '',
    ' \n\t',
    '1234，？！',
    '选中的中文文本',
    '這是繁體中文。',
    '这是一段包含 API 缩写的中文文本。',
    '你好，世界！2026 / 10 / 26',
    '𠀀𠀁𠀂'
  ])('skips Chinese or nonlinguistic selection: %s', (text) => {
    expect(shouldAutoTranslateSelection(text)).toBe(false)
  })

  it.each([
    'Hello world',
    'An English sentence with 中文 terms.',
    '日本語を翻訳します。',
    'これは日本語です',
    'こんにちは',
    'Bonjour le monde',
    '안녕하세요'
  ])('continues to translate foreign text: %s', (text) => {
    expect(shouldAutoTranslateSelection(text)).toBe(true)
  })
})
