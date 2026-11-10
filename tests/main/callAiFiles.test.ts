import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planCallAiWrites, publishCallAiWrites } from '../../src/main/core/callAiFiles'
import { prepareCallAiAttachments } from '../../src/main/core/callAiAttachments'

let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-call-ai-files-'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('Call AI file operations', () => {
  it('writes Unicode names in the actual desktop directory and leaves the default output unused', async () => {
    const output = path.join(root, 'out')
    const desktop = path.join(root, '同步桌面')
    const files = Array.from({ length: 5 }, (_, index) => ({
      path: `测试${index + 1}.txt`,
      content: ''
    }))
    const plan = await planCallAiWrites(output, desktop, [], 'desktop', files)
    const written = await publishCallAiWrites(plan)
    expect(written).toEqual(
      files.map((file) => ({ path: path.join(desktop, file.path), bytes: 0 }))
    )
    expect(await fs.readdir(desktop)).toEqual(files.map((file) => file.path))
    await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects collisions and directory escape before the batch is published', async () => {
    const current = path.join(root, 'existing.txt')
    await fs.writeFile(current, 'existing')
    await expect(
      planCallAiWrites(root, root, [], 'desktop', [
        { path: 'new.txt', content: '' },
        { path: 'existing.txt', content: '' }
      ])
    ).rejects.toThrow('已存在')
    await expect(
      planCallAiWrites(root, root, [], 'desktop', [{ path: '../escape.txt', content: '' }])
    ).rejects.toThrow('指定目录')
    await expect(
      planCallAiWrites(root, root, [root], undefined, [{ path: current, content: '' }])
    ).rejects.toThrow('资料目录')
    expect(await fs.readdir(root)).toEqual(['existing.txt'])
  })

  it('rolls back created files when a second writer races an approved batch', async () => {
    const plan = await planCallAiWrites(root, root, [], 'desktop', [
      { path: 'first.txt', content: '先写' },
      { path: 'second.txt', content: '' }
    ])
    await fs.writeFile(plan[1].path, 'independent writer')
    await expect(publishCallAiWrites(plan)).rejects.toMatchObject({ code: 'EEXIST' })
    await expect(fs.stat(plan[0].path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readFile(plan[1].path, 'utf8')).toBe('independent writer')
  })

  it('sends supported image bytes only to a vision model and preserves plain attachments as paths', async () => {
    const picture = path.join(root, '图片.png')
    const document = path.join(root, '文本.txt')
    const data = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
      'base64'
    )
    await fs.writeFile(picture, data)
    await fs.writeFile(document, 'local content')
    const signal = new AbortController().signal
    const vision = await prepareCallAiAttachments([picture, document, picture], true, signal)
    expect(vision.images).toEqual([
      { type: 'image', mimeType: 'image/png', data: data.toString('base64') }
    ])
    expect(vision.descriptions.map((entry) => JSON.parse(entry).path)).toEqual([picture, document])
    expect(vision.descriptions.join()).not.toContain('local content')
    const text = await prepareCallAiAttachments([picture], false, signal)
    expect(text.images).toEqual([])
    expect(text.descriptions[0]).toContain('当前模型不支持图片输入')

    const selection = `data:image/png;base64,${data.toString('base64')}`
    expect((await prepareCallAiAttachments(undefined, true, signal, selection)).images).toEqual(
      vision.images
    )
    await expect(prepareCallAiAttachments([], false, signal, selection)).rejects.toThrow(
      '当前模型不支持图片输入'
    )
    await expect(
      prepareCallAiAttachments([], true, signal, selection.replace('image/png', 'image/jpeg'))
    ).rejects.toThrow('选中的图片格式无效')
    await expect(
      prepareCallAiAttachments([], true, signal, 'data:image/png;base64,' + 'A'.repeat(6_000_000))
    ).rejects.toThrow('选中的图片超过 4 MB')
  })
})
