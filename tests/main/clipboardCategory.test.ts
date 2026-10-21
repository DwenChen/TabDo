import { describe, expect, it } from 'vitest'
import {
  classifyClipboardText,
  isClipboardImageFiles
} from '../../src/main/utils/clipboardCategory'

describe('clipboard categories', () => {
  it('groups only pure image file sets as images and preserves mixed files', () => {
    expect(isClipboardImageFiles([{ path: 'C:/a.PNG' }, { path: 'C:/b.jpeg' }])).toBe(true)
    expect(isClipboardImageFiles([{ path: 'C:/a.png' }, { path: 'C:/document.pdf' }])).toBe(false)
    expect(isClipboardImageFiles([{ path: 'C:/folder.png', isDirectory: true }])).toBe(false)
    expect(isClipboardImageFiles([])).toBe(false)
  })
  it.each(['https://example.com/a?q=1', 'www.example.com', 'https://例子.中国/路径'])(
    'classifies a complete URL: %s',
    (text) => {
      expect(classifyClipboardText(text)).toBe('link')
    }
  )
  it.each([
    'const answer = 42',
    'def hello():\n    print("hi")',
    '{"hello": true}',
    'module test(input clk);\nendmodule',
    '```js\nlet x = 1\n```'
  ])('recognizes code syntax: %s', (text) => {
    expect(classifyClipboardText(text)).toBe('code')
  })
  it.each([
    '普通文本',
    '访问 https://example.com 查看帮助',
    'javascript:alert(1)',
    'hello world',
    '[这是文本]'
  ])('keeps plain text and unsafe schemes as text: %s', (text) => {
    expect(classifyClipboardText(text)).toBe('text')
  })
})
