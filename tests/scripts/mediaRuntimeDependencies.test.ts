import { afterEach, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import runtime from '../../scripts/media-runtime-dependencies.cjs'
import sync from '../../scripts/sync-portable-preview.cjs'
const { mediaRuntimeFiles } = runtime
const { createPreviewArchive } = sync
const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})
it('materializes exact nested versions and unpacks complete runtime trees in an ASAR fixture', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-media-deps-'))
  temporary.push(root)
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { sharp: '1.0.0' } })
  )
  const source = path.join(root, 'node_modules/sharp')
  await fs.mkdir(path.join(source, 'node_modules/color'), { recursive: true })
  await fs.writeFile(
    path.join(source, 'package.json'),
    JSON.stringify({
      name: 'sharp',
      version: '1.0.0',
      dependencies: { color: '2.0.0' },
      optionalDependencies: { 'missing-platform': '1.0.0' }
    })
  )
  await fs.writeFile(path.join(source, 'index.js'), 'module.exports=1')
  await fs.writeFile(
    path.join(source, 'node_modules/color/package.json'),
    JSON.stringify({ name: 'color', version: '2.0.0' })
  )
  await fs.writeFile(path.join(source, 'node_modules/color/index.js'), 'module.exports=2')
  const files = mediaRuntimeFiles(root)
  expect(files.map((x) => x.relative)).toContain('node_modules/sharp/node_modules/color/index.js')
  const archive = path.join(root, 'runtime.asar')
  await createPreviewArchive(
    root,
    archive,
    files.map((x) => x.relative)
  )
  const asar = await import('@electron/asar')
  for (const file of files) {
    expect(asar.statFile(archive, path.normalize(file.relative)).unpacked).toBe(true)
    expect(await fs.readFile(path.join(archive + '.unpacked', file.relative), 'utf8')).toBe(
      await fs.readFile(file.source, 'utf8')
    )
  }
})
