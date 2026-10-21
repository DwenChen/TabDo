import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const {
  inspectFiles,
  reviewRenames,
  validateRenames,
  renameBatch,
  previewFile
} = require('../../internal-plugins/system/public/tools-files.cjs')

/**
 * 在专用临时目录中运行文件事务用例，并在结束后清理夹具。
 * @param operation 用例操作。
 * @returns 用例完成后的 Promise。
 */
async function fixture(operation: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-rename-'))
  try {
    await operation(root)
  } finally {
    vi.restoreAllMocks()
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('built-in file rename transactions', () => {
  it('collects every preview conflict without modifying files, and accepts swaps', () =>
    fixture(async (root) => {
      const names = ['a.txt', 'b.txt', 'occupied.txt']
      await Promise.all(names.map((name) => fs.writeFile(path.join(root, name), name)))
      const [a, b] = await inspectFiles(names.slice(0, 2).map((name) => path.join(root, name)))
      expect(
        await reviewRenames([
          { ...a, newName: 'occupied.txt' },
          { ...b, newName: 'invalid/name' }
        ])
      ).toEqual({ [a.path]: '目标已存在', [b.path]: '文件名无效' })
      expect(
        await reviewRenames([
          { ...a, newName: 'same.txt' },
          { ...b, newName: 'same.txt' }
        ])
      ).toEqual({ [a.path]: '目标名称重复', [b.path]: '目标名称重复' })
      expect(
        await reviewRenames([
          { ...a, newName: 'b.txt' },
          { ...b, newName: 'a.txt' }
        ])
      ).toEqual({})
      await fs.writeFile(a.path, 'changed content')
      expect(await reviewRenames([{ ...a, newName: 'new.txt' }])).toEqual({
        [a.path]: '文件已变化，请刷新预览'
      })
      expect(await fs.readFile(b.path, 'utf8')).toBe('b.txt')
      expect(await fs.readdir(root)).toEqual(names)
    }))
  it('bounds text previews and reports folder contents without recursively scanning', () =>
    fixture(async (root) => {
      const file = path.join(root, 'large # 文本.txt')
      await fs.writeFile(file, 'a'.repeat(150000))
      const preview = await previewFile(file)
      expect(preview.type).toBe('text')
      expect(preview.content.length).toBe(128 * 1024)
      expect(preview.truncated).toBe(true)
      const directory = await previewFile(root)
      expect(directory.type).toBe('folder')
      expect(directory.entries.map((entry: any) => entry.name)).toContain('large # 文本.txt')
    }))
  it('renames a real batch and leaves no temporary files', () =>
    fixture(async (root) => {
      const file = path.join(root, 'a.txt')
      await fs.writeFile(file, 'original')
      const [entry] = await inspectFiles([file])
      expect(
        await renameBatch([{ ...entry, newName: 'new.txt' }], path.join(root, 'journal'))
      ).toMatchObject([{ previousPath: file, path: path.join(root, 'new.txt') }])
      expect(await fs.readFile(path.join(root, 'new.txt'), 'utf8')).toBe('original')
      expect(await fs.readdir(path.join(root, 'journal'))).toEqual([])
      expect((await fs.readdir(root)).filter((name) => name.startsWith('.tabdo-'))).toEqual([])
    }))
  it('supports swap and case-only names without overwriting content', () =>
    fixture(async (root) => {
      const a = path.join(root, 'alpha.txt'),
        b = path.join(root, 'beta.txt')
      await fs.writeFile(a, 'A')
      await fs.writeFile(b, 'B')
      const [ea, eb] = await inspectFiles([a, b])
      await renameBatch(
        [
          { ...ea, newName: 'beta.txt' },
          { ...eb, newName: 'alpha.txt' }
        ],
        path.join(root, 'journal')
      )
      expect(await fs.readFile(a, 'utf8')).toBe('B')
      expect(await fs.readFile(b, 'utf8')).toBe('A')
      const [entry] = await inspectFiles([a])
      await renameBatch([{ ...entry, newName: 'ALPHA.txt' }], path.join(root, 'journal'))
      expect(await fs.readFile(path.join(root, 'ALPHA.txt'), 'utf8')).toBe('B')
    }))
  it.each(['../escape', 'CON.txt', 'x?.txt', 'name.', 'name ', '', 'a\0b'])(
    'rejects invalid names: %s',
    (name) =>
      fixture(async (root) => {
        const file = path.join(root, 'a.txt')
        await fs.writeFile(file, 'safe')
        const [entry] = await inspectFiles([file])
        await expect(validateRenames([{ ...entry, newName: name }])).rejects.toThrow('无效文件名')
        expect(await fs.readFile(file, 'utf8')).toBe('safe')
      })
  )
  it('refuses existing targets, duplicate targets and changed source files', () =>
    fixture(async (root) => {
      const a = path.join(root, 'a.txt'),
        b = path.join(root, 'b.txt')
      await fs.writeFile(a, 'A')
      await fs.writeFile(b, 'B')
      const [ea, eb] = await inspectFiles([a, b])
      await expect(validateRenames([{ ...ea, newName: 'b.txt' }])).rejects.toThrow('目标已存在')
      await expect(
        validateRenames([
          { ...ea, newName: 'same.txt' },
          { ...eb, newName: 'same.txt' }
        ])
      ).rejects.toThrow('目标名称重复')
      await fs.writeFile(a, 'changed')
      await expect(validateRenames([{ ...ea, newName: 'new.txt' }])).rejects.toThrow('文件已变化')
    }))
  it('refuses a directory mixed with its own children', () =>
    fixture(async (root) => {
      const parent = path.join(root, 'folder')
      await fs.mkdir(parent)
      await fs.writeFile(path.join(parent, 'file'), 'safe')
      const [directory, file] = await inspectFiles([parent, path.join(parent, 'file')])
      await expect(
        validateRenames([
          { ...directory, newName: 'renamed' },
          { ...file, newName: 'child' }
        ])
      ).rejects.toThrow('父目录')
    }))
  it('rolls back a failure during the publish stage', () =>
    fixture(async (root) => {
      const a = path.join(root, 'a.txt'),
        b = path.join(root, 'b.txt')
      await fs.writeFile(a, 'A')
      await fs.writeFile(b, 'B')
      const entries = await inspectFiles([a, b])
      const original = fs.rename.bind(fs)
      let calls = 0
      vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
        if (++calls === 4) throw new Error('fixture failure')
        await original(source, target)
      })
      await expect(
        renameBatch(
          entries.map((entry: any, index: number) => ({ ...entry, newName: `out-${index}.txt` })),
          path.join(root, 'journal')
        )
      ).rejects.toThrow('fixture failure')
      expect(await fs.readFile(a, 'utf8')).toBe('A')
      expect(await fs.readFile(b, 'utf8')).toBe('B')
      expect((await fs.readdir(root)).filter((name) => name.startsWith('.tabdo-'))).toEqual([])
    }))
  it('aborts before mutation and retains original data', () =>
    fixture(async (root) => {
      const a = path.join(root, 'a.txt')
      await fs.writeFile(a, 'A')
      const [entry] = await inspectFiles([a])
      const controller = new AbortController()
      controller.abort()
      await expect(
        renameBatch(
          [{ ...entry, newName: 'new.txt' }],
          path.join(root, 'journal'),
          controller.signal
        )
      ).rejects.toThrow('取消')
      expect(await fs.readFile(a, 'utf8')).toBe('A')
    }))
})
