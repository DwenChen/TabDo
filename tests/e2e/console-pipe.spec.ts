import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('closing terminal pipes keeps main process responsive and file logging available', async ({
  browserName: _browserName
}, testInfo) => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-console-pipe-'))
  let application: ElectronApplication | undefined
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
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    const app = application
    await expect((await app.firstWindow()).locator('.plugin-host')).toBeAttached()
    const logfile = await app.evaluate(({ app }) => {
      ;(globalThis as any).__consolePipeUncaught = 0
      process.on('uncaughtExceptionMonitor', () => {
        ;(globalThis as any).__consolePipeUncaught++
      })
      return (
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/appData/appDataPaths.ts')
          .getLogsPath() + '/main.log'
      )
    })
    // 真正关闭父进程持有的管道读端，不用手工 emit EPIPE 替代系统断管。
    app.process().stdout!.destroy()
    app.process().stderr!.destroy()
    await app.evaluate(() => {
      console.info('console-pipe-first-write')
    })
    await expect
      .poll(() =>
        app.evaluate(
          ({ app }) =>
            process.mainModule!.require(app.getAppPath() + '/node_modules/electron-log').transports
              .console.level
        )
      )
      .toBe(false)
    await app.evaluate(() => {
      console.info('console-pipe-file-still-available')
      console.warn('console-pipe-warning-still-available')
    })
    await expect
      .poll(() => fs.readFile(logfile, 'utf8'))
      .toContain('console-pipe-file-still-available')
    expect(await fs.readFile(logfile, 'utf8')).toContain('console-pipe-warning-still-available')
    expect(await app.evaluate(() => (globalThis as any).__consolePipeUncaught)).toBe(0)
    await fs.copyFile(logfile, testInfo.outputPath('main-after-pipe-close.log'))
  } finally {
    await application?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
