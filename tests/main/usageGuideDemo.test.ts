import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { searchUsageGuideDemo } from '../../src/main/core/usageGuideDemo'
const require = createRequire(import.meta.url)
const { respond, runDemo } = require('../../resources/usage-guide-demo.cjs')
afterEach(() => vi.unstubAllEnvs())

/**
 * 为接口脚本准备有所有权标记的隔离目录，并恢复环境和清理全部夹具。
 * @param operation 对当前练习目录进行的验证。
 * @returns 验证结束后的 Promise。
 */
async function fixture(operation: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-guide-demo-'))
  vi.stubEnv('TABDO_USAGE_GUIDE', '1')
  vi.stubEnv('TABDO_GUIDE_WORKSPACE', root)
  vi.stubEnv('TABDO_GUIDE_TOKEN', 'fixture-owner')
  vi.stubEnv('TABDO_GUIDE_DEMO_WORKER', require.resolve('../../resources/usage-guide-demo.cjs'))
  try {
    await fs.writeFile(
      path.join(root, '.tabdo-guide-owner.json'),
      JSON.stringify({ token: 'fixture-owner' })
    )
    await fs.writeFile(path.join(root, '练习图片.png'), 'sample')
    await fs.writeFile(path.join(root, '练习文本.txt'), 'sample')
    await operation(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('isolated guide demo backend', () => {
  it('binds main process searches and cancellation to the owning tool page', () =>
    fixture(async () => {
      const owner = Object.assign(new EventEmitter(), { id: 101 })
      const other = Object.assign(new EventEmitter(), { id: 102 })
      const first = searchUsageGuideDemo(owner as never, { query: 'ext:png' })
      await searchUsageGuideDemo(other as never, { cancel: true })
      await expect(first).resolves.toMatchObject({ demo: true, total: 1 })
      expect(owner.listenerCount('destroyed')).toBe(0)
      const pending = searchUsageGuideDemo(owner as never, {})
      owner.emit('destroyed')
      await expect(pending).rejects.toThrow('取消')
      expect(owner.listenerCount('destroyed')).toBe(0)
    }))
  it('rejects formal runtime and mismatched workspace ownership', () =>
    fixture(async () => {
      vi.stubEnv('TABDO_USAGE_GUIDE', '')
      expect(() => respond('search', {})).toThrow('仅供隔离引导')
      vi.stubEnv('TABDO_USAGE_GUIDE', '1')
      vi.stubEnv('TABDO_GUIDE_TOKEN', 'wrong-owner')
      expect(() => respond('search', {})).toThrow('身份不匹配')
    }))

  it('runs short lived scripts for explicitly marked OCR, formula and bounded search results', () =>
    fixture(async (root) => {
      const text = await runDemo('ocr', { image: 'selected-image' })
      expect(text.demo).toBe(true)
      expect(text.text).toContain('教学演示')
      const formula = await runDemo('formula', { image: 'selected-image' })
      expect(formula.demo).toBe(true)
      expect(formula.text).toContain('\\frac')
      const result = await runDemo('search', { query: 'ext:png', enumerate: true })
      expect(result.demo).toBe(true)
      expect(result.items.map((item) => item.path)).toEqual([path.join(root, '练习图片.png')])
      expect((await fs.readdir(root)).sort()).toEqual(
        ['.tabdo-guide-owner.json', '练习图片.png', '练习文本.txt'].sort()
      )
      expect(() => respond('arbitrary-operation', {})).toThrow('不支持')
    }))

  it('cancels an in flight background script before returning to the caller', () =>
    fixture(async () => {
      const controller = new AbortController()
      const operation = runDemo('search', {}, controller.signal)
      controller.abort()
      await expect(operation).rejects.toThrow('取消')
    }))
})
