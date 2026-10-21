import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('native listeners drain before real source Electron exits without a native crash', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-native-exit-'))
  const results: Array<{
    route: string
    pid: number
    exitCode: number | null
    signal: string | null
  }> = []
  const logs: string[] = []
  let application: ElectronApplication | undefined
  let previousRoute: string | null = null
  try {
    for (const route of ['playwright-close', 'app-quit', 'SIGTERM']) {
      const environment = {
        ...process.env,
        TABDO_E2E: '1',
        TABDO_SOURCE_PREVIEW: '1',
        TABDO_PREVIEW_OPEN_SETTINGS: '0',
        TABDO_DATA_ROOT: path.join(temporary, 'data'),
        TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
        TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
      }
      delete environment.ELECTRON_RUN_AS_NODE
      application = await electron.launch({
        args: [path.join(root, 'scripts/preview-main.cjs')],
        cwd: root,
        env: environment
      })
      const app = application
      app.process().stdout?.on('data', (data) => logs.push(String(data)))
      app.process().stderr?.on('data', (data) => logs.push(String(data)))
      await expect((await app.firstWindow()).locator('.plugin-host')).toBeAttached()
      // 必须确认真实原生监听已启动，不能只验证空壳窗口关闭。
      await expect
        .poll(() =>
          app.evaluate(async ({ app }) => {
            const manager = process.mainModule!.require(
              app.getAppPath() + '/src/main/managers/clipboardManager.ts'
            ).default
            return (await manager.getStatus()).isRunning
          })
        )
        .toBe(true)
      const pid = await app.evaluate(() => process.pid)
      // 用下一次启动检查上一轮保存的数据，所有记录只存在于同一隔离目录。
      const sentinel = await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
          .default.dbGet('shutdown-sentinel')
      )
      if (previousRoute) expect(sentinel).toEqual({ route: previousRoute, preserved: true })
      await app.evaluate(async ({ app }, route) => {
        await process
          .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
          .default.dbPut('shutdown-sentinel', { route, preserved: true })
      }, route)
      const exited = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
        app.process().once('exit', (exitCode, signal) => resolve({ exitCode, signal }))
      })
      if (route === 'playwright-close') await app.close()
      else {
        // 延后发起退出，使 evaluate 回复先交回测试端，避免把正常断连误判为调用错误。
        await app.evaluate(({ app }, route) => {
          setTimeout(() => {
            if (route === 'SIGTERM') process.emit('SIGTERM')
            else app.quit()
          }, 50)
        }, route)
      }
      const result = await exited
      results.push({ route, pid, ...result })
      previousRoute = route
      application = undefined
      expect(result, route).toEqual({ exitCode: 0, signal: null })
      expect(logs.join('')).not.toMatch(/A JavaScript error occurred|uncaughtException|FATAL ERROR/)
    }
    expect(logs.join('')).toContain('原生监听已停止，采集保存已完成')
  } finally {
    await application?.close()
    await fs.writeFile(
      testInfo.outputPath('native-exit-results.json'),
      JSON.stringify(results, null, 2)
    )
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
