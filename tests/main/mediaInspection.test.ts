import { expect, test } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'

test('streams complete image batches and isolates native decoder crashes and corrupt files', async () => {
  const root = process.cwd()
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-inspection-'))
  try {
    const image = await sharp(randomBytes(360 * 240 * 3), {
      raw: { width: 360, height: 240, channels: 3 }
    })
      .png()
      .toBuffer()
    const files: string[] = []
    for (let index = 0; index < 24; index++) {
      const file = path.join(folder, `图片-${index}.png`)
      await fs.writeFile(file, image)
      files.push(file)
    }
    const broken = path.join(folder, '损坏.png'),
      crash = path.join(folder, 'native-crash.png')
    await fs.writeFile(broken, 'not an image')
    await fs.writeFile(crash, image)
    files.splice(4, 0, broken, crash)
    // 只在隔离夹具注入原生崩溃，生产代码不暴露测试专用开关。
    const hook = path.join(folder, 'crash-hook.cjs')
    await fs.writeFile(
      hook,
      `const Module = require('node:module'); const original = Module._load;
Module._load = function(id, parent, main) {
  const value = original.apply(this, arguments);
  if (String(id).endsWith('images.cjs')) return { ...value, imageInfo: async function(file) {
    if (typeof file === 'string' && file.endsWith('native-crash.png')) process.exit(91);
    return value.imageInfo(file);
  }};
  return value;
};`
    )
    for (let iteration = 0; iteration < 2; iteration++) {
      const rows: any[] = []
      const child = spawn(process.execPath, [path.join(root, 'resources/media-worker.cjs')], {
        env: {
          ...process.env,
          TABDO_MEDIA_APP_ROOT: root,
          NODE_OPTIONS: `--require ${JSON.stringify(hook.replaceAll('\\', '/'))}`
        },
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc']
      })
      let complete = false,
        diagnostic = ''
      child.stderr!.on('data', (data) => {
        diagnostic += data
      })
      child.on('message', (message: any) => {
        if (message.type === 'inspected') rows.push(message.item)
        if (message.type === 'result') complete = true
        if (message.type === 'error') diagnostic += message.message
      })
      const closed = new Promise<number | null>((resolve, reject) => {
        child.once('close', resolve)
        child.once('error', reject)
      })
      child.send({ type: 'start', request: { action: 'inspect', media: 'image', files, folder } })
      expect(await closed, diagnostic).toBe(0)
      expect(complete).toBe(true)
      expect(rows.map((row) => row.path)).toEqual(files)
      expect(rows.filter((row) => !row.error)).toHaveLength(24)
      expect(rows.find((row) => row.path === crash).error).toContain('91')
      expect(rows.find((row) => row.path === broken).error).toBeTruthy()
      expect(rows.at(-1).thumbnail).toMatch(/^data:image\/png;base64,/)
    }
    // 超长合并队列只渲染前十二张，不触碰原文件或发布用户输出。
    const previewFolder = path.join(folder, 'preview')
    await fs.mkdir(previewFolder)
    const previewChild = spawn(process.execPath, [path.join(root, 'resources/media-worker.cjs')], {
      env: { ...process.env, TABDO_MEDIA_APP_ROOT: root },
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    })
    let rendered: any[] = []
    previewChild.on('message', (message: any) => {
      if (message.type === 'result') rendered = message.items
    })
    const previewClosed = new Promise<number | null>((resolve, reject) => {
      previewChild.once('close', resolve)
      previewChild.once('error', reject)
    })
    previewChild.send({
      type: 'start',
      request: {
        action: 'preview',
        media: 'image',
        mode: 'merge',
        files: files.filter((file) => file !== broken && file !== crash).slice(0, 13),
        folder: previewFolder,
        params: { width: 96, height: 64, margin: 0, gap: 0, direction: 'vertical' }
      }
    })
    expect(await previewClosed).toBe(0)
    expect(rendered[0]).toMatchObject({ width: 96, height: 768, partial: true })
    expect(await fs.readFile(files[0])).toEqual(image)
  } finally {
    await fs.rm(folder, { recursive: true, force: true })
  }
}, 60000)
