import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('reopening settings and focus notifications do not hide or reload the active settings view', async ({}, testInfo) => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ztools-settings-stability-'))
  let app: ElectronApplication | undefined
  try {
    const environment = {
      ...process.env,
      ZTOOLS_E2E: '1',
      ZTOOLS_SOURCE_PREVIEW: '1',
      ZTOOLS_DATA_ROOT: path.join(temporary, 'data'),
      ZTOOLS_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      ZTOOLS_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete environment.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
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
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('启用超级面板', { exact: true })).toBeVisible()
    await settings.getByRole('button', { name: '数据备份与迁移', exact: true }).click()
    await expect(settings.getByRole('button', { name: '导出完整备份' })).toBeVisible()

    // Keep observations on the real BrowserWindow and plugin instance; cap a faulty loop to protect the test runner.
    await app.evaluate(({ app, BrowserWindow, ipcMain, Menu }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const plugin = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      const win = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('http://127.0.0.1:5174')
      )!
      const counters = {
        hides: 0,
        shows: 0,
        launches: 0,
        requests: 0,
        assemblies: 0,
        initialView: plugin.pluginView.webContents.id
      }
      ;(globalThis as any).settingsStability = counters
      win.on('hide', () => counters.hides++)
      win.on('show', () => counters.shows++)
      ipcMain.on('open-settings', () => counters.requests++)
      const createView = plugin.createPluginView.bind(plugin)
      plugin.createPluginView = (...args: any[]) => {
        counters.assemblies++
        return createView(...args)
      }
      const original = manager.showSettings.bind(manager)
      manager.showSettings = () => {
        counters.launches++
        return counters.launches <= 25 ? original() : Promise.resolve()
      }
      const buildMenu = Menu.buildFromTemplate.bind(Menu)
      Menu.buildFromTemplate = (template) => {
        const menu = buildMenu(template)
        ;(globalThis as any).settingsActionMenu = menu
        ;(globalThis as any).settingsMenuTemplate = template
        return menu
      }
    })

    // Concurrent explicit opens and delayed focus notifications used to feed the hide/show/relaunch cycle.
    await app.evaluate(async ({ app, BrowserWindow }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const win = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('http://127.0.0.1:5174')
      )!
      const pending = Array.from({ length: 8 }, () => manager.showSettings())
      for (let i = 0; i < 8; i++) win.webContents.send('focus-search', null)
      await Promise.all(pending)
    })
    await settings.waitForTimeout(1800)
    const snapshot = await app.evaluate(({ app }) => {
      const plugin = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      return {
        ...(globalThis as any).settingsStability,
        currentView: plugin.pluginView?.webContents.id
      }
    })
    expect(snapshot.hides).toBe(0)
    expect(snapshot.shows).toBe(0)
    expect(snapshot.launches).toBe(8)
    expect(snapshot.currentView).toBe(snapshot.initialView)
    await expect(settings.getByRole('button', { name: '导出完整备份' })).toBeVisible()

    // Verify the restored original action menu against a real native popup and its IPC commands.
    const main = await app.firstWindow()
    await expect(main.getByRole('button', { name: '设置', exact: true })).toHaveCount(0)
    await fs.writeFile(
      testInfo.outputPath('plugin-header.png'),
      Buffer.from(
        await app.evaluate(async ({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().startsWith('http://127.0.0.1:5174')
          )!
          return (await win.webContents.capturePage({ x: 0, y: 0, width: 1100, height: 60 }))
            .toPNG()
            .toString('base64')
        }),
        'base64'
      )
    )
    await main.getByRole('button', { name: '插件操作', exact: true }).click()
    await expect
      .poll(() =>
        app!.evaluate(() => {
          const template = (globalThis as any).settingsMenuTemplate
          return template?.map((item: any) => item.label) || []
        })
      )
      .toEqual(['分离到独立窗口 (Ctrl+D)', '打开开发者工具', '插件设置', '结束运行 (Ctrl+Q)'])
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('http://127.0.0.1:5174')
      )!
      // Native popup focus must not trigger the host's blur-to-hide path.
      win.emit('blur')
      ;(globalThis as any).settingsMenuTemplate[2].submenu[2].click()
      ;(globalThis as any).settingsActionMenu.closePopup()
    })
    await expect
      .poll(() => main.evaluate(() => window.ztools.dbGet('auto-start-plugin')))
      .toEqual(['setting'])
    expect(await app.evaluate(() => (globalThis as any).settingsStability.hides)).toBe(0)

    // A user close stays closed even when delayed focus notifications arrive afterwards.
    await main.getByRole('button', { name: '关闭插件', exact: true }).click()
    await expect
      .poll(() =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().startsWith('http://127.0.0.1:5174'))!
            .isVisible()
        )
      )
      .toBe(false)
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().startsWith('http://127.0.0.1:5174')
      )!
      for (let i = 0; i < 8; i++) win.webContents.send('focus-search', null)
    })
    await main.waitForTimeout(1000)
    expect(await app.evaluate(() => (globalThis as any).settingsStability.launches)).toBe(8)
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL().startsWith('http://127.0.0.1:5174'))!
          .isVisible()
      )
    ).toBe(false)
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      // Hold only the launch result, after the real cached view has been restored.
      const api = process.mainModule!.require(app.getAppPath() + '/src/main/api/index.ts').default
      const launch = api.launchPlugin.bind(api)
      const gate = new Promise<void>((resolve) => {
        ;(globalThis as any).finishSettingsLaunch = resolve
      })
      api.launchPlugin = async (...args: any[]) => {
        const result = await launch(...args)
        await gate
        return result
      }
      ;(globalThis as any).pendingSettingsRequests = Array.from({ length: 8 }, () =>
        manager.showSettings()
      )
    })
    await expect
      .poll(() =>
        app!.evaluate(
          ({ app }) =>
            process.mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
              .default.pluginView?.webContents.id
        )
      )
      .toBe(snapshot.initialView)
    expect(await app.evaluate(() => (globalThis as any).settingsStability.assemblies)).toBe(1)
    await main.getByRole('button', { name: '关闭插件', exact: true }).click()
    await app.evaluate(async () => {
      ;(globalThis as any).finishSettingsLaunch()
      await Promise.all((globalThis as any).pendingSettingsRequests)
    })
    await main.waitForTimeout(500)
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL().startsWith('http://127.0.0.1:5174'))!
          .isVisible()
      )
    ).toBe(false)
  } finally {
    await app?.close()
    const resolved = path.resolve(temporary)
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep))
      throw new Error('Unexpected test data path')
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
