import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const native = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:child_process', () => {
  const execFile = vi.fn()
  execFile[Symbol.for('nodejs.util.promisify.custom')] = native.execute
  return { execFile }
})
vi.mock('@tabdo/presentation-electron', () => ({ shell: { trashItem: vi.fn() } }))
import { recycleRecordingBundle } from '../../internal-plugins/system/presentation/electron/ipc/recording/recycle'

describe('Windows recording recycle source access recovery', () => {
  let root: string
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-recycle-test-'))
    vi.stubGlobal('__TABDO_PRESENTATION_HOST__', { nativeRoot: root })
    native.execute.mockReset()
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await fs.rm(root, { recursive: true, force: true })
  })
  it('recycles new user-owned copies after a source security rejection, retaining originals until success', async () => {
    const bundle = await fs.mkdtemp(path.join(root, '.recordly-trash-'))
    await fs.writeFile(path.join(bundle, 'recording-1.webm'), 'video bytes')
    await fs.writeFile(path.join(bundle, 'recording-1.webm.cursor.json'), 'telemetry bytes')
    let owned = ''
    native.execute.mockImplementation(async (_command, _args, options) => {
      const directory = options.env.TABDO_RECORDING_TRASH_PATH
      if (directory === bundle)
        return { stdout: JSON.stringify({ success: false, hresult: '0x80270021' }) }
      owned = directory
      expect(path.dirname(directory)).toBe(os.tmpdir())
      expect(await fs.readFile(path.join(bundle, 'recording-1.webm'), 'utf8')).toBe('video bytes')
      expect(await fs.readFile(path.join(directory, 'recording-1.webm'), 'utf8')).toBe(
        'video bytes'
      )
      expect(await fs.readFile(path.join(directory, 'recording-1.webm.cursor.json'), 'utf8')).toBe(
        'telemetry bytes'
      )
      await fs.rm(directory, { recursive: true })
      return { stdout: JSON.stringify({ success: true }) }
    })
    await recycleRecordingBundle(bundle)
    expect(native.execute).toHaveBeenCalledTimes(2)
    await expect(fs.stat(bundle)).rejects.toThrow()
    await expect(fs.stat(owned)).rejects.toThrow()
  })
  it('retains the original bundle and removes temporary copies if the fallback is refused', async () => {
    const bundle = await fs.mkdtemp(path.join(root, '.recordly-trash-'))
    await fs.writeFile(path.join(bundle, 'recording-2.webm'), 'preserve me')
    const temporary: string[] = []
    native.execute.mockImplementation(async (_command, _args, options) => {
      temporary.push(options.env.TABDO_RECORDING_TRASH_PATH)
      return { stdout: JSON.stringify({ success: false, hresult: '0x80270021' }) }
    })
    await expect(recycleRecordingBundle(bundle)).rejects.toThrow('0x80270021')
    expect(await fs.readFile(path.join(bundle, 'recording-2.webm'), 'utf8')).toBe('preserve me')
    expect(temporary).toHaveLength(2)
    await expect(fs.stat(temporary[1])).rejects.toThrow()
  })
  it('reports sharing violations without copying or bypassing them', async () => {
    native.execute.mockResolvedValue({
      stdout: JSON.stringify({ success: false, hresult: '0x80270027' })
    })
    await expect(recycleRecordingBundle(root)).rejects.toThrow('其他程序使用')
    expect(native.execute).toHaveBeenCalledTimes(1)
  })
})
