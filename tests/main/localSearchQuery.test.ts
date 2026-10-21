import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORIES,
  buildLocalSearchQuery,
  normalizeCategoryRule
} from '../../internal-plugins/system/src/utils/localSearch'

describe('original Finder category queries', () => {
  it('keeps all ten upstream categories usable without keywords', () => {
    expect(DEFAULT_CATEGORIES.map((category) => category.label)).toEqual([
      '全部',
      '文件夹',
      'EXCEL',
      'WORD',
      'PPT',
      'PDF',
      '图片',
      '视频',
      '音频',
      '压缩文件'
    ])
    for (const category of DEFAULT_CATEGORIES)
      expect(buildLocalSearchQuery('', category)).toBe(category.rule)
    expect(buildLocalSearchQuery('  年报  ', DEFAULT_CATEGORIES[2])).toBe(
      '年报 ext:xls;xlsx;xlsm;csv'
    )
  })
  it('scopes regex to the keyword while keeping category filters native', () => {
    expect(buildLocalSearchQuery('报告.*2026', DEFAULT_CATEGORIES[5], true)).toBe(
      'regex:"报告.*2026" ext:pdf'
    )
    expect(buildLocalSearchQuery('', DEFAULT_CATEGORIES[5], true)).toBe('ext:pdf')
    expect(() => buildLocalSearchQuery('a"b', DEFAULT_CATEGORIES[0], true)).toThrow('双引号')
  })
  it('preserves custom expressions and normalizes extension shorthand', () => {
    expect(normalizeCategoryRule('.md;.txt')).toBe('ext:md;txt')
    expect(normalizeCategoryRule('size:>1mb ext:pdf')).toBe('size:>1mb ext:pdf')
    expect(() => buildLocalSearchQuery('a'.repeat(2001), DEFAULT_CATEGORIES[0])).toThrow('2000')
  })
})
