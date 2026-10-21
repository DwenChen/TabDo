import { describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

/**
 * 结束测试创建的 PowerShell 进程并等待关闭，不触碰用户 Everything。
 * @param child 本用例创建的进程。
 * @returns 关闭后的 Promise。
 */
async function close(child?: ChildProcess): Promise<void> {
  if (!child || child.exitCode !== null) return
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
  child.kill()
  await closed
}

describe.skipIf(process.platform !== 'win32')('Everything native IPC bridge', () => {
  it('detects an isolated live instance, preserves Unicode, flags and paging', async () => {
    const root = path.resolve(__dirname, '../..'),
      temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-everything-')),
      instance = 'tabdo-test-' + randomUUID()
    let fixture: ChildProcess | undefined, bridge: ChildProcess | undefined
    try {
      fixture = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(root, 'tests/fixtures/everything-ipc.ps1'),
          '-Instance',
          instance,
          '-Output',
          path.join(temporary, 'request.txt')
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('fixture startup timeout')), 10000)
        fixture!.stdout!.on('data', (value) => {
          if (String(value).includes('ready')) {
            clearTimeout(timer)
            resolve()
          }
        })
        fixture!.stderr!.on('data', (value) => {
          clearTimeout(timer)
          reject(new Error(String(value)))
        })
      })
      bridge = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(root, 'internal-plugins/system/public/everything-bridge.ps1')
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      const lines = createInterface({ input: bridge.stdout! }),
        queue = new Map<number, (value: any) => void>()
      let bridgeErrors = ''
      bridge.stderr!.on('data', (value) => {
        bridgeErrors += String(value)
      })
      lines.on('line', (line) => {
        const result = JSON.parse(line)
        queue.get(result.id)?.(result)
        queue.delete(result.id)
      })
      /**
       * 发送原生协议请求并等待对应 JSON 响应。
       * @param input 请求参数。
       * @returns 响应对象。
       * @throws {Error} 桥接未启动或没有按时回复时拒绝。
       */
      function request(input: any): Promise<any> {
        return new Promise((resolve, reject) => {
          // 启动解析错误必须带诊断及时失败，不能挂到整个测试超时。
          const timer = setTimeout(
            () => reject(new Error('bridge request timeout: ' + bridgeErrors)),
            12000
          )
          queue.set(input.id, (value) => {
            clearTimeout(timer)
            resolve(value)
          })
          bridge!.stdin!.write(JSON.stringify({ instance, ...input }) + '\n')
        })
      }
      expect(await request({ id: 1 })).toMatchObject({ state: 'ready', items: [] })
      const result = await request({
        id: 2,
        query: '中文路径.*',
        regex: true,
        matchCase: true,
        sort: 14,
        offset: 0
      })
      expect(result.error).toBeUndefined()
      expect(result.items).toHaveLength(100)
      expect(result.total).toBe(101)
      expect(result.items[0]).toMatchObject({
        path: 'C:\\fixture\\文件-0.txt',
        name: '文件-0.txt',
        isDirectory: false
      })
      expect(
        (await fs.readFile(path.join(temporary, 'request.txt'), 'utf8')).replace(/^\uFEFF/, '')
      ).toBe('9|0|100|4|14|中文路径.*')
      const next = await request({
        id: 3,
        query: '文件',
        regex: false,
        matchCase: false,
        sort: 1,
        offset: 100
      })
      expect(next.items).toHaveLength(1)
      expect(next.items[0].name).toBe('文件-100.txt')
      expect(
        (await fs.readFile(path.join(temporary, 'request.txt'), 'utf8')).replace(/^\uFEFF/, '')
      ).toBe('0|100|100|4|1|文件')
      // 分类切换允许显式枚举空关键词；不改变状态探测请求的原有语义。
      const all = await request({ id: 4, query: '', enumerate: true, sort: 14 })
      expect(all.items).toHaveLength(100)
      expect(all.total).toBe(101)
      expect(
        (await fs.readFile(path.join(temporary, 'request.txt'), 'utf8')).replace(/^\uFEFF/, '')
      ).toBe('0|0|100|4|14|')
      const category = await request({ id: 5, query: 'ext:pdf', matchPath: true, sort: 14 })
      expect(category.items).toHaveLength(100)
      expect(
        (await fs.readFile(path.join(temporary, 'request.txt'), 'utf8')).replace(/^\uFEFF/, '')
      ).toBe('2|0|100|4|14|ext:pdf')
      lines.close()
    } finally {
      await close(bridge)
      await close(fixture)
      await fs.rm(temporary, { recursive: true, force: true })
    }
  }, 30000)
})
