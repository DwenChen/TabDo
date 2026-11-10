import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const fixture = vi.hoisted(() => ({ data: '' }))
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => fixture.data }
}))
import {
  CallAiProcesses,
  isCallAiChild,
  assertCallAiNoLinks,
  removeCallAiOwned,
  callAiEnvironment
} from '../../src/main/core/callAiRuntime'

beforeAll(async () => {
  fixture.data = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-call-ai-unit-'))
})
afterAll(async () => {
  await fs.rm(fixture.data, { recursive: true, force: true })
})

describe('call AI owned runtime', () => {
  it('rejects sibling prefixes, root deletion and parent traversal', async () => {
    const root = path.join(fixture.data, 'owned')
    expect(isCallAiChild(root, path.join(root, 'session'))).toBe(true)
    expect(isCallAiChild(root, root)).toBe(false)
    expect(isCallAiChild(root, root + '-other')).toBe(false)
    expect(isCallAiChild(root, path.join(root, '..', 'other'))).toBe(false)
    await expect(removeCallAiOwned(root, fixture.data)).rejects.toThrow('超出')
  })

  it('rejects linked ancestors and preserves material outside the owned directory', async () => {
    const root = path.join(fixture.data, 'links'),
      external = path.join(fixture.data, 'result')
    await fs.mkdir(root)
    await fs.mkdir(external)
    await fs.writeFile(path.join(external, 'keep.txt'), 'result')
    const link = path.join(root, 'redirect')
    await fs.symlink(external, link, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(assertCallAiNoLinks(path.join(link, 'keep.txt'))).rejects.toThrow('链接')
    await expect(removeCallAiOwned(root, link)).rejects.toThrow('链接')
    expect(await fs.readFile(path.join(external, 'keep.txt'), 'utf8')).toBe('result')
    await fs.unlink(link)
  })

  it('does not inherit credentials or interpreter injection settings', () => {
    const env = callAiEnvironment(fixture.data, 'node-bin')
    expect(env).not.toHaveProperty('OPENAI_API_KEY')
    expect(env).not.toHaveProperty('NODE_OPTIONS')
    expect(env.USERPROFILE).toBe(fixture.data)
    expect(env.PYTHONNOUSERSITE).toBe('1')
  })

  it('terminates descendants even when the root command already exited', async () => {
    if (process.platform !== 'win32') return
    const owner = new CallAiProcesses()
    // 云端单测在打包前执行，使用当前 Node 验证真实 Job Object 的进程回收。
    const output = await owner.run(
      process.execPath,
      [
        '-e',
        `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);c.unref()`
      ],
      fixture.data,
      callAiEnvironment(fixture.data)
    )
    const pid = Number(output.trim())
    expect(pid).toBeGreaterThan(0)
    expect(() => process.kill(pid, 0)).toThrow()
    await owner.close()
  }, 20_000)

  it('stops an owned command on abort and rejects further work after close', async () => {
    if (process.platform !== 'win32') return
    const owner = new CallAiProcesses(),
      controller = new AbortController()
    const ready = path.join(fixture.data, 'abort-ready')
    const run = owner.run(
      process.execPath,
      [
        '-e',
        'require("node:fs").writeFileSync(process.argv[1], "ready"); setInterval(()=>{},1000)',
        ready
      ],
      fixture.data,
      callAiEnvironment(fixture.data),
      controller.signal
    )
    const assertion = expect(run).rejects.toThrow('取消')
    try {
      // 确认子进程实际启动后再取消，避免首次编译隔离器的耗时改变断言分支。
      await vi.waitFor(async () => expect(await fs.readFile(ready, 'utf8')).toBe('ready'), {
        timeout: 8_000
      })
      controller.abort()
      await assertion
    } finally {
      await owner.close()
    }
    expect(owner.children.size).toBe(0)
    await expect(
      owner.run(process.execPath, ['--version'], fixture.data, callAiEnvironment(fixture.data))
    ).rejects.toThrow('停止')
  }, 20_000)
})
