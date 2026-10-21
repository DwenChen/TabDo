import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getFileIcon: vi.fn()
}))

vi.mock('electron', () => ({
  protocol: {}
}))

vi.mock('../../src/main/core/native/index', () => ({
  IconExtractor: {
    getFileIcon: mocks.getFileIcon
  }
}))

import {
  getFileIconAsBase64,
  registerIconProtocolForSession
} from '../../src/main/core/iconProtocol'

const tempDirectories: string[] = []

afterEach(async () => {
  mocks.handle.mockReset()
  mocks.getFileIcon.mockReset()
  await Promise.all(
    tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))
  )
})

describe('icon protocol', () => {
  it('coalesces simultaneous extraction and retries after failure', async () => {
    mocks.getFileIcon.mockResolvedValueOnce(Buffer.from('same icon'))
    const results = await Promise.all(
      Array.from({ length: 20 }, () => getFileIconAsBase64('/coalesced.exe'))
    )
    expect(new Set(results).size).toBe(1)
    expect(mocks.getFileIcon).toHaveBeenCalledOnce()
    mocks.getFileIcon
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce(Buffer.from('retry icon'))
    await expect(getFileIconAsBase64('/retry.exe')).rejects.toThrow('not ready')
    await expect(getFileIconAsBase64('/retry.exe')).resolves.toContain('data:image/png;base64,')
    expect(mocks.getFileIcon).toHaveBeenCalledTimes(3)
  })

  it('evicts by bytes even when only two large icons were requested', async () => {
    mocks.getFileIcon.mockImplementation(async () => Buffer.alloc(9 * 1024 * 1024))
    await getFileIconAsBase64('/large-a.exe')
    await getFileIconAsBase64('/large-b.exe')
    await getFileIconAsBase64('/large-a.exe')
    expect(mocks.getFileIcon).toHaveBeenCalledTimes(3)
  })

  it('直接返回 UWP PNG 原图，不提取 PNG 文件类型图标', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ztools-icon-protocol-'))
    tempDirectories.push(directory)
    const iconPath = path.join(directory, 'uwp-icon.png')
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
    await fs.writeFile(iconPath, png)

    const session = {
      protocol: {
        isProtocolHandled: vi.fn(() => false),
        handle: mocks.handle
      }
    }
    registerIconProtocolForSession(session as never)
    const handler = mocks.handle.mock.calls[0]?.[1] as (request: {
      url: string
    }) => Promise<Response>

    const response = await handler({ url: `ztools-icon://${encodeURIComponent(iconPath)}` })

    expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(mocks.getFileIcon).not.toHaveBeenCalled()
  })
})
