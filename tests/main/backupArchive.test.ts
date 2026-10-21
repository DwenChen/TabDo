import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import AdmZip from 'adm-zip'
const require = createRequire(import.meta.url)
const {
  createBackup,
  restoreBackup,
  inspectBackup,
  safeName
} = require('../../resources/backup-worker.cjs')
let base: string, root: string, file: string
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-backup-test-'))
  root = path.join(base, 'profile')
  file = path.join(base, 'all.ztbackup')
  for (const [relative, value] of Object.entries({
    'lmdb/device/data.mdb': 'settings-and-config',
    'lmdb/accounts/default/data.mdb': 'plugin-db-and-attachments',
    'plugins/demo/plugin.json': '{"name":"demo"}',
    'plugins-data/demo/state.json': 'private-plugin-data',
    'Partitions/demo/Local Storage/leveldb/000001.ldb': 'plugin-local-storage',
    'clipboard/image.png': 'image-data',
    'Cache/unneeded': 'cache',
    'lmdb/device/lock.mdb': 'lock'
  })) {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, value)
  }
})
afterEach(() => fs.rmSync(base, { recursive: true, force: true }))
describe('complete offline backup', () => {
  it('round trips settings, plugin binaries, plugin data, attachments and browser sessions with a rollback copy', () => {
    createBackup({ root, file, version: '1.0.0' })
    const manifest = inspectBackup(file)
    expect(manifest.entries).toHaveLength(6)
    fs.writeFileSync(path.join(root, 'plugins-data/demo/state.json'), 'changed')
    const rollback = restoreBackup({ root, file })
    expect(fs.readFileSync(path.join(root, 'plugins-data/demo/state.json'), 'utf8')).toBe(
      'private-plugin-data'
    )
    expect(fs.readFileSync(path.join(rollback, 'plugins-data/demo/state.json'), 'utf8')).toBe(
      'changed'
    )
    expect(
      fs.readFileSync(path.join(root, 'Partitions/demo/Local Storage/leveldb/000001.ldb'), 'utf8')
    ).toBe('plugin-local-storage')
    expect(fs.existsSync(path.join(root, 'Cache'))).toBe(false)
    expect(fs.existsSync(path.join(root, '.migration.json'))).toBe(true)
  })
  it('restores historical archive markers without losing plugin-private files', () => {
    createBackup({ root, file, version: '1.1.0' })
    const zip = new AdmZip(file)
    const manifest = JSON.parse(zip.readAsText('manifest.json'))
    manifest.format = 'ztools-local-backup'
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)))
    zip.writeZip(file)
    fs.writeFileSync(path.join(root, 'plugins-data/demo/state.json'), 'new contents')
    restoreBackup({ root, file })
    expect(fs.readFileSync(path.join(root, 'plugins-data/demo/state.json'), 'utf8')).toBe(
      'private-plugin-data'
    )
  })
  it('includes external development plugins and relocates their files into the restored plugin root', () => {
    const external = path.join(base, 'external')
    fs.mkdirSync(external)
    fs.writeFileSync(path.join(external, 'plugin.json'), '{"name":"external"}')
    createBackup({ root, file, externalPlugins: [external] })
    restoreBackup({ root, file })
    expect(
      fs.existsSync(path.join(root, inspectBackup(file).externalPlugins[0].target, 'plugin.json'))
    ).toBe(true)
    expect(inspectBackup(file).externalPlugins[0].source).toBe(external)
  })
  it('rejects tampered payload before changing the existing profile', () => {
    createBackup({ root, file })
    const zip = new AdmZip(file)
    zip.updateFile('data/plugins-data/demo/state.json', Buffer.from('tampered'))
    zip.writeZip(file)
    expect(() => restoreBackup({ root, file })).toThrow()
    expect(fs.readFileSync(path.join(root, 'plugins-data/demo/state.json'), 'utf8')).toBe(
      'private-plugin-data'
    )
    expect(fs.readdirSync(base).some((name) => name.includes('.restore-'))).toBe(false)
  })
  it.each([
    '../escape',
    '/absolute',
    'a\\b',
    'a/../b',
    'a/C:thing',
    'a/NUL',
    'a/name.',
    'a/name ',
    'a//b'
  ])('rejects unsafe cross-platform path %s', (name) => expect(() => safeName(name)).toThrow())
  it('rejects files not declared in the backup manifest', () => {
    createBackup({ root, file })
    const zip = new AdmZip(file)
    zip.addFile('data/unlisted', Buffer.from('unexpected'))
    zip.writeZip(file)
    expect(() => inspectBackup(file)).toThrow('未声明文件')
  })
  it('refuses to store a recursive archive inside the data root', () => {
    expect(() => createBackup({ root, file: path.join(root, 'backup.ztbackup') })).toThrow('之外')
  })
  it('preserves plugin-owned cache, temporary and log directories as plugin data', () => {
    for (const name of ['Cache', 'temp', 'logs']) {
      fs.mkdirSync(path.join(root, 'plugins-data/demo', name))
      fs.writeFileSync(path.join(root, 'plugins-data/demo', name, 'state'), 'keep')
    }
    createBackup({ root, file })
    restoreBackup({ root, file })
    for (const name of ['Cache', 'temp', 'logs'])
      expect(fs.readFileSync(path.join(root, 'plugins-data/demo', name, 'state'), 'utf8')).toBe(
        'keep'
      )
  })
})
