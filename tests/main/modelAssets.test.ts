import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'

const fetchAsset = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ net: { fetch: fetchAsset } }))
import {
  ModelAssets,
  hasModelFiles,
  validateModelArchive
} from '../../src/main/core/provider/modelAssets'

const originalRoot = process.env.TABDO_DATA_ROOT
let temporary: string | undefined
afterEach(() => {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true })
  process.env.TABDO_DATA_ROOT = originalRoot
  if (originalRoot === undefined) delete process.env.TABDO_DATA_ROOT
  temporary = undefined
  vi.clearAllMocks()
})

/**
 * 准备带真实摘要、固定目录布局的离线引擎微型归档。
 * @returns 资源管理器及隔离目录。
 */
function fixture(): { manager: ModelAssets; root: string; buffer: Buffer } {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-model-assets-'))
  process.env.TABDO_DATA_ROOT = temporary
  const zip = new AdmZip()
  for (const name of [
    'index.js',
    'build/Release/wechat_ocr.node',
    'wco_data/WeChatOCR.exe',
    'wco_data/mmmojo_64.dll'
  ])
    zip.addFile('native/' + name, Buffer.from('fixture'))
  const buffer = zip.toBuffer()
  const digest = createHash('sha256').update(buffer).digest('hex')
  const manager = new ModelAssets({ wechat: [{ file: 'native-win.zip', digest }], latex: [] })
  return { manager, root: temporary, buffer }
}

describe.skipIf(process.platform !== 'win32')('offline provider resource transactions', () => {
  it('shares concurrent installs, verifies files and deletes only engine resources', async () => {
    const { manager, root, buffer } = fixture()
    fs.writeFileSync(path.join(root, 'user-config.json'), 'unchanged')
    fetchAsset.mockResolvedValue(new Response(new Uint8Array(buffer)))
    await Promise.all([manager.ensure('wechat'), manager.ensure('wechat')])
    expect(fetchAsset).toHaveBeenCalledTimes(1)
    expect(hasModelFiles('wechat')).toBe(true)
    expect(fs.readdirSync(path.join(root, 'builtin-providers'))).toEqual(['wechat'])
    await manager.remove('wechat')
    expect(hasModelFiles('wechat')).toBe(false)
    expect(fs.readFileSync(path.join(root, 'user-config.json'), 'utf8')).toBe('unchanged')
  })

  it('rejects corrupt archives without publishing partial resources and allows retry', async () => {
    const { manager, buffer } = fixture()
    fetchAsset
      .mockResolvedValueOnce(new Response('broken'))
      .mockImplementation(() => Promise.resolve(new Response(new Uint8Array(buffer))))
    await expect(manager.ensure('wechat')).rejects.toThrow('校验失败')
    expect(manager.status('wechat').status).toBe('error')
    expect(hasModelFiles('wechat')).toBe(false)
    await manager.ensure('wechat')
    expect(manager.status('wechat').status).toBe('ready')
  })

  it('aborts an in-flight download and removes staging files before cancellation resolves', async () => {
    const { manager, root } = fixture()
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    fetchAsset.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          started()
          options.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
            once: true
          })
        })
    )
    const job = manager.ensure('wechat')
    void job.catch(() => {})
    await ready
    await manager.cancel('wechat')
    await expect(job).rejects.toThrow('cancelled')
    expect(manager.status('wechat').status).toBe('idle')
    expect(fs.readdirSync(path.join(root, 'builtin-providers'))).toEqual([])
  })
})

it('rejects path traversal and symbolic links in downloaded model archives', () => {
  expect(() =>
    validateModelArchive({
      getEntries: () => [{ entryName: '../escape', header: { attr: 0 } }]
    } as any)
  ).toThrow('不安全路径')
  expect(() =>
    validateModelArchive({
      getEntries: () => [{ entryName: 'native/link', header: { attr: 0o120777 << 16 } }]
    } as any)
  ).toThrow('不安全路径')
})
