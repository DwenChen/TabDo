import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('闲置解除启动输入引用，保护准备中的启动与未保存匹配，并按需恢复已保存记录', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(90000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-idle-inputs-'))
  const logs: string[] = []
  let app: ElectronApplication | undefined
  try {
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '0',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    const plugin = await main.evaluate(
      async () => (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')!
    )

    const retained = await app.evaluate(({ app }) => {
      const commands = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/renderer/commands.ts'
      ).default
      const api = process.mainModule!.require(app.getAppPath() + '/src/main/api/index.ts').default
      // 真正触发数据库现有1MiB文档上限，错误结果不会抛异常。
      const image = 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024, 90).toString('base64')
      commands.lastMatchState = {
        searchQuery: 'unsaved',
        pastedImage: image,
        pastedText: null,
        pastedFiles: null,
        timestamp: Date.now()
      }
      commands.lastMatchStatePersisted = false
      commands.saveLastMatchState()
      api.releaseIdleResources()
      return {
        dirty: !commands.lastMatchStatePersisted,
        bytes: commands.lastMatchState?.pastedImage.length
      }
    })
    expect(retained.dirty).toBe(true)
    expect(retained.bytes).toBeGreaterThan(2 * 1024 * 1024)

    const started = await app.evaluate(({ app }, plugin) => {
      const commands = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/renderer/commands.ts'
      ).default
      const api = process.mainModule!.require(app.getAppPath() + '/src/main/api/index.ts').default
      // 用可保存状态替换测试中的未保存输入，不更改用户的任何真实资料。
      commands.lastMatchState = {
        searchQuery: 'saved-memory-state',
        pastedImage: null,
        pastedText: '保留的匹配内容',
        pastedFiles: [{ path: '/fixture/document.txt' }],
        timestamp: Date.now()
      }
      commands.lastMatchStatePersisted = false
      commands.saveLastMatchState()
      if (!commands.lastMatchStatePersisted) throw new Error('匹配夹具未保存')
      const original = commands.getDefaultFeatureCode
      let resolve!: (value: unknown) => void
      commands.getDefaultFeatureCode = () =>
        new Promise((done) => {
          resolve = done
        })
      const input = { type: 'text', payload: Buffer.alloc(2 * 1024 * 1024, 90).toString('base64') }
      const operation = commands.launch({
        path: plugin.path,
        type: 'plugin',
        param: input,
        cmdType: 'window'
      })
      api.setLaunchParam(input)
      ;(globalThis as any).__idleInputLaunch = { resolve, operation, original }
      return {
        active: commands.hasActiveLaunches(),
        bytes: commands.getLaunchParam().payload.length
      }
    }, plugin)
    expect(started.active).toBe(true)
    await main.waitForTimeout(12000)
    const pending = await app.evaluate(({ app }) => {
      const commands = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/renderer/commands.ts'
      ).default
      return {
        active: commands.hasActiveLaunches(),
        bytes: commands.getLaunchParam()?.payload.length || 0
      }
    })
    expect(pending).toEqual(started)

    await app.evaluate(async ({ app }) => {
      const commands = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/renderer/commands.ts'
      ).default
      const fixture = (globalThis as any).__idleInputLaunch
      commands.getDefaultFeatureCode = fixture.original
      fixture.resolve({ success: false, error: '测试结束启动准备' })
      await fixture.operation
      delete (globalThis as any).__idleInputLaunch
    })
    await main.waitForTimeout(12000)
    expect(
      await app.evaluate(({ app }) => {
        const commands = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/renderer/commands.ts'
        ).default
        const lifecycle = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/plugin/lifecycle.ts'
        ).default
        return {
          active: commands.hasActiveLaunches(),
          launch: commands.getLaunchParam(),
          match: commands.lastMatchState,
          lifecycle: lifecycle.launchParam
        }
      })
    ).toEqual({ active: false, launch: null, match: null, lifecycle: null })
    const restored = await main.evaluate(() => window.tabdo.restoreLastMatch())
    expect(restored).toMatchObject({
      searchQuery: 'saved-memory-state',
      pastedText: '保留的匹配内容',
      pastedFiles: [{ path: '/fixture/document.txt' }]
    })
    expect(await main.evaluate(() => window.tabdo.dbGet('last-match-state'))).toEqual(restored)
  } finally {
    await fs.writeFile(info.outputPath('host.log'), logs.join(''))
    await app?.close().catch(() => {})
    expect(path.resolve(temporary).startsWith(path.join(os.tmpdir(), 'tabdo-idle-inputs-'))).toBe(
      true
    )
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 })
  }
})
