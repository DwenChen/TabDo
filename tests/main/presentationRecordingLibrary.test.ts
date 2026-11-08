import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const boundary = vi.hoisted(() => ({ root: '', recycle: vi.fn() }))
vi.mock('../../internal-plugins/system/presentation/electron/ipc/recording/recycle', () => ({
  recycleRecordingBundle: boundary.recycle
}))
vi.mock('../../internal-plugins/system/presentation/electron/ipc/utils', () => ({
  getRecordingsDir: async () => boundary.root
}))
vi.mock('../../internal-plugins/system/presentation/electron/ipc/project/manager', () => ({
  rememberApprovedLocalReadPath: async () => undefined
}))
vi.mock('../../internal-plugins/system/presentation/electron/mediaServer', () => ({
  getMediaServerBaseUrl: () => 'http://127.0.0.1:1234',
  buildMediaUrl: (_base: string, file: string) => file
}))
import {
  listRecordings,
  setRecordingsRemoved,
  clearRecordingTrashUndo
} from '../../internal-plugins/system/presentation/electron/ipc/recording/library'

describe('presentation recording removal transactions', () => {
  beforeEach(async () => {
    boundary.root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-library-'))
    boundary.recycle.mockReset().mockImplementation((bundle) => fs.rm(bundle, { recursive: true }))
  })
  afterEach(async () => {
    boundary.recycle.mockImplementation((bundle) => fs.rm(bundle, { recursive: true, force: true }))
    await clearRecordingTrashUndo()
    await fs.rm(boundary.root, { recursive: true, force: true })
  })
  it('restores the complete selected bundle after recycle failure and preserves unrelated sources', async () => {
    const selected = path.join(boundary.root, 'recording-1.webm')
    const companions = [
      selected,
      selected + '.cursor.json',
      path.join(boundary.root, 'recording-1.mic.webm')
    ]
    for (const file of companions) await fs.writeFile(file, path.basename(file))
    const unrelated = path.join(boundary.root, 'recording-12.webm')
    await fs.writeFile(unrelated, 'unchanged')
    await setRecordingsRemoved([selected], true)
    boundary.recycle.mockRejectedValueOnce(new Error('access denied 0x80070005'))
    await expect(clearRecordingTrashUndo([selected])).rejects.toThrow('0x80070005')
    await setRecordingsRemoved([selected], false)
    for (const file of companions) expect(await fs.readFile(file, 'utf8')).toBe(path.basename(file))
    expect(await fs.readFile(unrelated, 'utf8')).toBe('unchanged')
  })
  it('recycles only the requested transaction and leaves the older undo transaction recoverable', async () => {
    const older = path.join(boundary.root, 'recording-older.webm')
    const selected = path.join(boundary.root, 'recording-new.webm')
    for (const file of [older, selected]) await fs.writeFile(file, 'source')
    await setRecordingsRemoved([older], true)
    await setRecordingsRemoved([selected], true)
    expect(boundary.recycle).not.toHaveBeenCalled()
    await clearRecordingTrashUndo([selected])
    expect(boundary.recycle).toHaveBeenCalledTimes(1)
    await setRecordingsRemoved([older], false)
    expect(await fs.readFile(older, 'utf8')).toBe('source')
  })
  it('does not delete orphaned staging directories while listing and rejects external paths', async () => {
    const staged = path.join(boundary.root, '.recordly-trash-Ab1234')
    await fs.mkdir(staged)
    await fs.writeFile(path.join(staged, 'recording-old.webm'), 'recoverable')
    await fs.writeFile(path.join(boundary.root, 'recording-visible.webm'), 'visible')
    expect(await listRecordings()).toHaveLength(1)
    expect(boundary.recycle).not.toHaveBeenCalled()
    expect(await fs.readFile(path.join(staged, 'recording-old.webm'), 'utf8')).toBe('recoverable')
    await expect(
      setRecordingsRemoved([path.join(boundary.root, '..', 'external.webm')], true)
    ).rejects.toThrow('outside')
  })
  it('uses one canonical transaction identity for library directory aliases and rejects aliases outside it', async () => {
    const alias = path.join(boundary.root, 'alias')
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-library-external-'))
    try {
      await fs.symlink(boundary.root, alias, 'junction')
      const selected = path.join(boundary.root, 'recording-alias.webm')
      const aliasSelected = path.join(alias, path.basename(selected))
      await fs.writeFile(selected, 'retained')
      await setRecordingsRemoved([aliasSelected], true)
      await setRecordingsRemoved([selected], false)
      expect(await fs.readFile(selected, 'utf8')).toBe('retained')
      await setRecordingsRemoved([selected], true)
      await clearRecordingTrashUndo([aliasSelected])
      expect(boundary.recycle).toHaveBeenCalledOnce()
      const escape = path.join(boundary.root, 'outside-alias')
      await fs.symlink(outside, escape, 'junction')
      await fs.writeFile(path.join(outside, 'external.webm'), 'external source')
      await expect(
        setRecordingsRemoved([path.join(escape, 'external.webm')], true)
      ).rejects.toThrow('outside')
      expect(await fs.readFile(path.join(outside, 'external.webm'), 'utf8')).toBe('external source')
    } finally {
      // 先解除测试创建的目录链接，再回收独立外部夹具；不递归进入别名目标。
      await fs.unlink(path.join(boundary.root, 'outside-alias')).catch(() => undefined)
      await fs.unlink(alias).catch(() => undefined)
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})
