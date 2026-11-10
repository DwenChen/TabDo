import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('reopening settings and focus notifications do not hide or reload the active settings view', async () => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-settings-stability-'))
  if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    throw new Error('Unexpected test data path')
  }
  let app: ElectronApplication | undefined
  try {
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
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    // 旧资料的自动分离列表可以为空，设置仍使用独立宿主。
    await expect((await app.firstWindow()).locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        app!.evaluate(({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
            .default.dbGet('plugins')
            ?.some((plugin: any) => plugin.name === 'setting')
        )
      )
      .toBe(true)
    await app.evaluate(async ({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
        .default.dbPut('auto-detach-plugin', [])
      process
        .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
        .default.dbPut('out-kill-plugin', [])
      await process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.showSettings()
    })
    await expect
      .poll(
        () =>
          app!.evaluate(
            ({ webContents }) =>
              webContents
                .getAllWebContents()
                .filter((view) => view.getURL().startsWith('http://127.0.0.1:15177')).length
          ),
        { timeout: 30000 }
      )
      .toBe(1)
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
    await settings.getByRole('button', { name: '我的数据', exact: true }).click()
    await settings.getByRole('tab', { name: '数据备份与迁移', exact: true }).click()
    await expect(settings.getByRole('button', { name: '导出完整备份' })).toBeVisible()

    const titlebar = app
      .context()
      .pages()
      .find((page) => page.url().includes('detached-titlebar.html'))!
    await expect(titlebar.getByTitle('置顶窗口', { exact: true })).toBeVisible()
    await expect(titlebar.getByTitle('开发者工具', { exact: true })).toHaveCount(0)
    await expect(titlebar.getByRole('button', { name: '临时常驻', exact: true })).toHaveCount(0)
    await expect(titlebar.getByRole('button', { name: '插件操作', exact: true })).toHaveCount(0)
    const main = await app.firstWindow()
    expect(await main.evaluate(() => window.tabdo.dbGet('auto-start-plugin'))).toBeFalsy()
    expect(await main.evaluate(() => window.tabdo.dbGet('auto-detach-plugin'))).toEqual([])

    // 最小化、失焦及并发重开应复用同一设置页和当前导航。
    await app.evaluate(({ app, BrowserWindow }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const settingsWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('detached-titlebar.html')
      )!
      settingsWindow.minimize()
      manager.getMainWindow().show()
      manager.getMainWindow().focus()
    })
    expect(settings.isClosed()).toBe(false)
    await app.evaluate(async ({ app, BrowserWindow }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const mainWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('http://127.0.0.1:5174')
      )!
      const pending = Array.from({ length: 8 }, () => manager.showSettings())
      for (let i = 0; i < 8; i++) mainWindow.webContents.send('focus-search', null)
      await Promise.all(pending)
    })
    await expect(settings.getByRole('button', { name: '导出完整备份' })).toBeVisible()
    await expect
      .poll(() =>
        app!.context().pages().filter((page) => page.url().startsWith('http://127.0.0.1:15177')).length
      )
      .toBe(1)

    // 明确关闭应销毁正文，宿主的迟到焦点消息不会重开它。
    await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows()
      windows.find((window) => window.webContents.getURL().includes('detached-titlebar.html'))!.close()
      const mainWindow = windows.find((window) =>
        window.webContents.getURL().startsWith('http://127.0.0.1:5174')
      )!
      for (let i = 0; i < 8; i++) mainWindow.webContents.send('focus-search', null)
    })
    await expect.poll(() => settings.isClosed()).toBe(true)
    await expect
      .poll(() =>
        app!.context().pages().filter((page) => page.url().startsWith('http://127.0.0.1:15177')).length
      )
      .toBe(0)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
