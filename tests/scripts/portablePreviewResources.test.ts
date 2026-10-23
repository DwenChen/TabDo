import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createPackageWithOptions, statFile, uncache } from '@electron/asar'

const { verifyPortableResources } = createRequire(import.meta.url)(
  '../../scripts/verify-portable-preview.cjs'
)
const { createPreviewArchive, resolvePreviewUnpackedEntries } = createRequire(import.meta.url)(
  '../../scripts/sync-portable-preview.cjs'
)
let temporary: string
let project: string
let preview: string
let archive: string

/**
 * 在隔离夹具内写入资源，支持模拟同步遗漏的旧预加载脚本和插件页面。
 * @param {string} root 夹具根目录。
 * @param {string} relative 相对文件路径。
 * @param {string} content 文件内容。
 * @returns {Promise<void>} 写入完成后结束的 Promise。
 */
async function write(root: string, relative: string, content: string): Promise<void> {
  const file = path.join(root, relative)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
}

/**
 * 仅为测试生成微型资源归档，不构建应用、不启动 Electron、不读取真实用户数据。
 * @param {boolean} unpackNative 是否将原生资源物理展开。
 * @returns {Promise<void>} 资源夹具准备完成的 Promise。
 */
async function archiveFixture(unpackNative = true): Promise<void> {
  const app = path.join(temporary, 'app-fixture')
  await fs.cp(path.join(project, 'out'), path.join(app, 'out'), { recursive: true })
  await fs.cp(path.join(project, 'resources'), path.join(app, 'resources'), { recursive: true })
  uncache(archive)
  await createPackageWithOptions(
    app,
    archive,
    unpackNative ? { unpackDir: 'resources', unpack: '**/*.{node,cjs,exe}' } : {}
  )
}

beforeEach(async () => {
  // 所有程序和用户文件都在临时目录中，核验工具本身没有写入能力。
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-preview-resources-'))
  project = path.join(temporary, 'project')
  preview = path.join(temporary, 'preview')
  archive = path.join(preview, 'resources/app.asar')
  await write(project, 'out/main/index.js', 'current main')
  await write(project, 'resources/preload.js', 'current clipboard category API')
  await write(project, 'resources/plugin-cleanup-worker.cjs', 'current worker')
  await write(project, 'resources/lib/win/capture.node', 'native fixture')
  for (const plugin of ['setting', 'system']) {
    await write(project, `internal-plugins/${plugin}/dist/index.html`, plugin + ' current body')
    await write(
      preview,
      `resources/app.asar.unpacked/internal-plugins/${plugin}/index.html`,
      plugin + ' current body'
    )
  }
  await write(preview, 'data/plugins/external/plugin.json', 'existing installed plugin')
  await write(preview, 'legacy/settings.json', 'existing settings')
  await fs.mkdir(path.dirname(archive), { recursive: true })
  await archiveFixture()
})

afterEach(async () => {
  // 只清理由本用例创建的临时夹具。
  uncache(archive)
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})

describe('portable preview runtime resources', () => {
  it('requires guide HTML, CSS and scripts at their physical sibling paths', async () => {
    const files = [
      'usage-guide.html',
      'usage-guide.css',
      'usage-guide-ui.js',
      'usage-guide-preload.cjs'
    ]
    for (const file of files) await write(project, 'resources/' + file, 'guide fixture ' + file)
    await archiveFixture(false)
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      'resources/usage-guide.html'
    )
    await archiveFixture()
    expect(await verifyPortableResources(project, preview)).toMatchObject({ programFiles: 8 })
    for (const file of files)
      expect(await fs.readFile(path.join(archive + '.unpacked/resources', file), 'utf8')).toBe(
        'guide fixture ' + file
      )
    await fs.unlink(path.join(archive + '.unpacked/resources/usage-guide.html'))
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      'resources/usage-guide.html'
    )
  })
  it('requires recorder executables to be physically unpacked', async () => {
    await write(project, 'resources/recorder/win32/capture-x64.exe', 'recorder executable fixture')
    const app = path.join(temporary, 'app-fixture')
    await fs.cp(path.join(project, 'resources'), path.join(app, 'resources'), { recursive: true })
    uncache(archive)
    await createPackageWithOptions(app, archive, { unpack: '**/*.{node,cjs}' })
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      'Native resource is not unpacked: resources/recorder/win32/capture-x64.exe'
    )
    await archiveFixture()
    expect(await verifyPortableResources(project, preview)).toEqual({
      programFiles: 5,
      builtinFiles: 2
    })
  })
  it('replaces obsolete hashed native output while preserving unpacked dependencies', async () => {
    const source = path.join(temporary, '.artifacts', 'current-app')
    const destination = path.join(temporary, '.artifacts', 'current-resources', 'app.asar')
    const oldNative = 'out/main/chunks/tabdo_native-old.node'
    const newNative = 'out/main/chunks/tabdo_native-new.node'
    const dependency = 'node_modules/@lmdb/lmdb-win32-x64/index.js'
    await write(source, newNative, 'new native module')
    await write(source, dependency, 'existing native dependency')

    // 模拟重新编译的哈希变化，旧清单不能阻断同步或把新原生文件打进归档。
    const entries = resolvePreviewUnpackedEntries(source, [
      oldNative,
      'resources/lib/win/obsolete-native.node',
      dependency,
      newNative,
      newNative
    ])
    expect(entries).toEqual([dependency, newNative])
    await createPreviewArchive(source, destination, entries)
    expect(() => statFile(destination, path.normalize(oldNative))).toThrow()
    for (const file of entries) {
      expect(statFile(destination, path.normalize(file)).unpacked).toBe(true)
      expect(await fs.readFile(path.join(destination + '.unpacked', file))).toEqual(
        await fs.readFile(path.join(source, file))
      )
    }
    uncache(destination)
  })

  it('still rejects a missing unpacked dependency outside compiled output', () => {
    expect(() =>
      resolvePreviewUnpackedEntries(project, ['node_modules/@lmdb/lmdb-win32-x64/index.js'])
    ).toThrow('Required unpacked preview resource is missing: node_modules/@lmdb')
  })

  it.each([1, 2])('preserves %i unpacked dependencies under a hidden directory', async (count) => {
    const source = path.join(temporary, '.artifacts', 'app')
    const destination = path.join(temporary, '.artifacts', 'new-resources', 'app.asar')
    const entries = ['node_modules/@lmdb/lmdb-win32-x64/index.js', 'resources/capture.node'].slice(
      0,
      count
    )
    for (const file of entries) await write(source, file, 'unpacked fixture')
    await write(source, 'package.json', '{"version":"1.1.0"}')

    // 实际生成微型归档验证隐藏路径规则，避免同步后原生依赖留在包内。
    await createPreviewArchive(source, destination, entries)
    for (const file of entries) {
      expect(statFile(destination, path.normalize(file)).unpacked).toBe(true)
      expect(await fs.readFile(path.join(destination + '.unpacked', file), 'utf8')).toBe(
        'unpacked fixture'
      )
    }
    expect(statFile(destination, 'package.json').unpacked).not.toBe(true)
    uncache(destination)
  })

  it('verifies all resources without changing settings or installed plugins', async () => {
    const before = await fs.readFile(archive)
    expect(await verifyPortableResources(project, preview)).toEqual({
      programFiles: 4,
      builtinFiles: 2
    })
    expect(await fs.readFile(archive)).toEqual(before)
    expect(await fs.readFile(path.join(preview, 'data/plugins/external/plugin.json'), 'utf8')).toBe(
      'existing installed plugin'
    )
    expect(await fs.readFile(path.join(preview, 'legacy/settings.json'), 'utf8')).toBe(
      'existing settings'
    )
  })

  it('rejects an old preload even when the main program is current', async () => {
    await write(project, 'resources/preload.js', 'new clipboard category and middle-click APIs')
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      'Program resource differs: resources/preload.js'
    )
  })

  it('rejects missing runtime workers and missing unpacked native files', async () => {
    await write(project, 'resources/new-worker.cjs', 'new runtime worker')
    await fs.unlink(path.join(archive + '.unpacked', 'resources/lib/win/capture.node'))
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      'resources/new-worker.cjs'
    )
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      'resources/lib/win/capture.node'
    )
  })

  it('rejects native resources that exist only inside the archive', async () => {
    await archiveFixture(false)
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      'Native resource is not unpacked: resources/lib/win/capture.node'
    )
  })

  it.each(['setting', 'system'])('rejects an old %s builtin body', async (plugin) => {
    await write(
      preview,
      `resources/app.asar.unpacked/internal-plugins/${plugin}/index.html`,
      'old body'
    )
    await expect(verifyPortableResources(project, preview)).rejects.toThrow(
      `Builtin resource differs: internal-plugins/${plugin}/index.html`
    )
  })
})
