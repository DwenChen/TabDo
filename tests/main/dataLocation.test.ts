import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { getTabDoRoot } from '../../src/main/core/appData/appDataPaths'
const require = createRequire(import.meta.url)
const { relocateData, validateDestination } = require('../../resources/data-location-worker.cjs')
let base: string, source: string, target: string
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-data-location-'))
  source = path.join(base, '原资料')
  target = path.join(base, '新 资料')
  for (const [relative, content] of Object.entries({
    'lmdb/device/data.mdb': 'settings',
    'plugins/demo/plugin.json': '{"name":"demo"}',
    'plugins-data/demo/private.bin': 'private-data',
    'Partitions/demo/Local Storage/data': 'browser-session',
    'Cache/data': 'cache-data',
    'clipboard/image.png': 'image-pixels'
  })) {
    const file = path.join(source, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(base, { recursive: true, force: true })
})
describe('完整资料目录迁移', () => {
  it('逐文件保留配置、插件、私有数据、会话、剪贴板与缓存，原目录不删除', () => {
    const result = relocateData({ source, target, anchor: source })
    expect(result.files).toBe(6)
    expect(getTabDoRoot({ dataRoot: source })).toBe(target)
    for (const relative of [
      'lmdb/device/data.mdb',
      'plugins/demo/plugin.json',
      'plugins-data/demo/private.bin',
      'Partitions/demo/Local Storage/data',
      'Cache/data',
      'clipboard/image.png'
    ])
      expect(fs.readFileSync(path.join(target, relative))).toEqual(
        fs.readFileSync(path.join(source, relative))
      )
    expect(JSON.parse(fs.readFileSync(path.join(target, '.migration.json'), 'utf8'))).toEqual({
      sourceRoot: source,
      externalPlugins: []
    })
  })
  it.each(['same', 'inside', 'parent', 'nonempty'])(
    '拒绝不安全目标 %s，源资料和已有目标保持原样',
    (kind) => {
      const candidate =
        kind === 'same'
          ? source
          : kind === 'inside'
            ? path.join(source, 'nested')
            : kind === 'parent'
              ? base
              : target
      if (kind === 'nonempty') {
        fs.mkdirSync(target)
        fs.writeFileSync(path.join(target, 'keep'), 'existing')
      }
      expect(() => validateDestination(source, candidate)).toThrow()
      expect(fs.readFileSync(path.join(source, 'lmdb/device/data.mdb'), 'utf8')).toBe('settings')
      expect(fs.existsSync(path.join(source, '.data-location.json'))).toBe(false)
    }
  )
  it('复制失败不发布目标或切换位置记录，并清理本任务的暂存树', () => {
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('disk full')
    })
    expect(() => relocateData({ source, target, anchor: source })).toThrow('disk full')
    expect(fs.existsSync(target)).toBe(false)
    expect(fs.existsSync(path.join(source, '.data-location.json'))).toBe(false)
    expect(fs.readdirSync(base).filter((name) => name.startsWith('.tabdo-relocate-'))).toEqual([])
  })
  it('再次迁移只忽略根位置记录，插件私有同名文件完整保留', () => {
    fs.writeFileSync(path.join(source, '.data-location.json'), '{"root":"obsolete"}')
    const relative = 'plugins-data/demo/.data-location.json'
    fs.writeFileSync(path.join(source, relative), 'plugin-owned')
    relocateData({ source, target, anchor: source })
    expect(fs.existsSync(path.join(target, '.data-location.json'))).toBe(false)
    expect(fs.readFileSync(path.join(target, relative), 'utf8')).toBe('plugin-owned')
    const next = path.join(base, 'second')
    relocateData({ source: target, target: next, anchor: source })
    expect(getTabDoRoot({ dataRoot: source })).toBe(next)
    expect(fs.readFileSync(path.join(target, relative), 'utf8')).toBe('plugin-owned')
    expect(fs.readFileSync(path.join(next, relative), 'utf8')).toBe('plugin-owned')
  })
  it('拒绝目录联接或符号链接，不将外部数据带入迁移', () => {
    const external = path.join(base, 'external')
    fs.mkdirSync(external)
    fs.writeFileSync(path.join(external, 'keep'), 'external')
    fs.symlinkSync(
      external,
      path.join(source, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    expect(() => relocateData({ source, target, anchor: source })).toThrow('符号链接')
    expect(fs.readFileSync(path.join(external, 'keep'), 'utf8')).toBe('external')
    expect(fs.existsSync(target)).toBe(false)
  })
  it('损坏或失效的位置记录直接失败，不隐式创建空白资料', () => {
    fs.writeFileSync(
      path.join(source, '.data-location.json'),
      JSON.stringify({ root: path.join(base, 'missing') })
    )
    expect(() => getTabDoRoot({ dataRoot: source })).toThrow()
    expect(fs.existsSync(path.join(base, 'missing'))).toBe(false)
  })
})
