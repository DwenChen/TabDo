import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('reopening settings and focus notifications do not hide or reload the active settings view', async ({
  browserName: _browserName
}, testInfo) => {
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
    // 本组验证嵌入式设置宿主；新默认独立窗口由 builtin-providers 专项覆盖。
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

    // Verify the builtin header without a behavior-settings entry.
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
    // 内置设置不再暴露通用插件行为菜单，右上角入口应完全移除。
    await expect(main.getByRole('button', { name: '插件操作', exact: true })).toHaveCount(0)
    expect(await main.evaluate(() => window.tabdo.dbGet('auto-start-plugin'))).toBeFalsy()
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
      // 新会话创建后只阻塞启动返回，验证关闭动作能使迟到结果失效。
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
      .not.toBe(snapshot.initialView)
    await expect
      .poll(() =>
        app!.evaluate(
          ({ app }) =>
            !!process.mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
              .default.pluginView
        )
      )
      .toBe(true)
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
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
