import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('tray always restores settings and uninstall removes a running ASAR and its sidecar', async ({
  browserName: _browserName
}, testInfo) => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-cleanup-tray-'))
  if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    throw new Error('Unexpected test data path')
  }
  let app: ElectronApplication | undefined
  try {
    // 所有安装、卸载和托盘验证均使用临时配置，隔离真实预览数据。
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
      .poll(() =>
        app!.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((view) => view.getURL().startsWith('http://127.0.0.1:15177'))
        )
      )
      .toBe(true)
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    let settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()

    const source = path.join(temporary, 'fixture')
    const archive = path.join(temporary, 'fixture.zpx')
    await fs.mkdir(source)
    await fs.writeFile(
      path.join(source, 'plugin.json'),
      JSON.stringify({
        name: 'cleanup-fixture',
        title: 'Cleanup Fixture',
        version: '1.0.0',
        description: 'Isolated uninstall fixture',
        main: 'index.html',
        features: [{ code: 'main', cmds: ['CleanupFixture'] }]
      })
    )
    await fs.writeFile(path.join(source, 'index.html'), '<h1>Cleanup fixture is running</h1>')
    await app.evaluate(
      async ({ app }, files) => {
        const archive = process.mainModule!.require(
          app.getAppPath() + '/src/main/utils/zpxArchive.ts'
        )
        await archive.packZpx(files.source, files.archive)
      },
      { source, archive }
    )
    const installed = await settings.evaluate(
      (file) => window.tabdo.internal.installPluginFromPath(file),
      archive
    )
    expect(installed.success, installed.error).toBe(true)
    const fixture = (await settings.evaluate(() => window.tabdo.internal.getPlugins())).find(
      (plugin) => plugin.name === 'cleanup-fixture'
    )!
    expect(fixture.path.endsWith('.asar')).toBe(true)
    await fs.mkdir(fixture.path + '.unpacked', { recursive: true })
    await fs.writeFile(path.join(fixture.path + '.unpacked', 'sidecar.txt'), 'unpacked fixture')
    const dataPath = await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/appData/appDataPaths.ts')
        .getPluginDataPath('cleanup-fixture')
    )
    await fs.mkdir(dataPath, { recursive: true })
    await fs.writeFile(path.join(dataPath, 'keep.txt'), 'preserved plugin data')
    await app.evaluate(async ({ session }) => {
      await session.fromPartition('persist:cleanup-fixture').cookies.set({
        url: 'https://cleanup.invalid',
        name: 'fixture',
        value: 'keep'
      })
    })

    // 切换到真实安装包后通过托盘事件回到设置，覆盖“其他插件正在显示”的情况。
    const host = await app.firstWindow()
    await host.evaluate(
      (pluginPath) =>
        window.tabdo.launch({
          path: pluginPath,
          type: 'plugin',
          featureCode: 'main',
          name: 'Cleanup Fixture'
        }),
      fixture.path
    )
    await expect.poll(() => settings.isClosed()).toBe(true)
    await expect
      .poll(() =>
        app!.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some(
              (view) =>
                view.getURL().includes('cleanup-fixture') && view.getURL().endsWith('index.html')
            )
        )
      )
      .toBe(true)
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      manager.tray.emit('click')
    })
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    settings = app
      .context()
      .pages()
      .find((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
    for (const hidden of [false, true, false]) {
      await app.evaluate(({ app }, hide) => {
        const manager = process.mainModule!.require(
          app.getAppPath() + '/src/main/managers/windowManager.ts'
        ).default
        if (hide) manager.getMainWindow().hide()
        manager.tray.emit('click')
      }, hidden)
      await expect
        .poll(() =>
          app!.evaluate(({ app }) => {
            const manager = process.mainModule!.require(
              app.getAppPath() + '/src/main/managers/windowManager.ts'
            ).default
            const plugin = process.mainModule!.require(
              app.getAppPath() + '/src/main/managers/pluginManager.ts'
            ).default
            return {
              visible: manager.getMainWindow().isVisible(),
              path: plugin.getCurrentPluginPath()
            }
          })
        )
        .toMatchObject({
          visible: true,
          path: expect.stringMatching(/[\\/]setting(?:[\\/]public)?$/)
        })
    }
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    settings = app
      .context()
      .pages()
      .find((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15177'))!
    const menuLabels = await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.trayMenu.items.map((item: any) => item.label)
    )
    expect(menuLabels).not.toContain('设置')
    expect(menuLabels).toContain('退出')

    // 不勾选删除数据时仍清除实体和失效入口，插件专属文件应保留。
    await settings.evaluate(async (pluginPath) => {
      await window.tabdo.internal.dbPut('plugin-center-pinned', [pluginPath])
    }, fixture.path)
    const removal = await settings.evaluate(
      (pluginPath) =>
        window.tabdo.internal.deletePlugin(pluginPath, {
          deleteData: false
        }),
      fixture.path
    )
    expect(removal).toMatchObject({ success: true })
    if (!removal.cleanupPending) {
      await expect(fs.access(fixture.path)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    await expect(fs.access(fixture.path + '.unpacked')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readFile(path.join(dataPath, 'keep.txt'), 'utf8')).toBe('preserved plugin data')
    expect(
      await app.evaluate(async ({ session }) =>
        (
          await session.fromPartition('persist:cleanup-fixture').cookies.get({ name: 'fixture' })
        ).map((cookie) => cookie.value)
      )
    ).toEqual(['keep'])
    expect(
      await settings.evaluate(() => window.tabdo.internal.dbGet('plugin-center-pinned'))
    ).toEqual([])
    expect(await settings.evaluate(() => window.tabdo.internal.getDisabledPlugins())).toEqual([])

    // 再次安装后通过界面勾选删除数据，验证插件专属目录一起清理。
    expect(
      (
        await settings.evaluate(
          (file) => window.tabdo.internal.installPluginFromPath(file),
          archive
        )
      ).success
    ).toBe(true)
    const reinstalledPath = await settings.evaluate(async () => {
      const plugin = (await window.tabdo.internal.getPlugins()).find(
        (item) => item.name === 'cleanup-fixture'
      )!
      await window.tabdo.internal.setPluginDisabled(plugin.path, true)
      return plugin.path
    })
    await settings.getByRole('button', { name: '已安装插件', exact: true }).click()
    await settings.locator('.plugin-item').filter({ hasText: 'Cleanup Fixture' }).click()
    await settings.getByRole('button', { name: '卸载', exact: true }).click()
    await settings.getByRole('checkbox').check()
    await settings.getByRole('button', { name: '删除', exact: true }).click()
    await expect(
      settings.locator('.plugin-item').filter({ hasText: 'Cleanup Fixture' })
    ).toHaveCount(0, { timeout: 20000 })
    await expect(fs.access(dataPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      await app.evaluate(({ session }) =>
        session.fromPartition('persist:cleanup-fixture').cookies.get({ name: 'fixture' })
      )
    ).toEqual([])
    expect(await settings.evaluate(() => window.tabdo.internal.getDisabledPlugins())).toEqual([])
    expect(
      (await settings.evaluate(() => window.tabdo.internal.getPlugins())).map(
        (plugin) => plugin.name
      )
    ).toEqual(expect.arrayContaining(['setting', 'system']))
    await expect(settings.locator('.plugin-item').getByText('内置', { exact: true })).toHaveCount(0)

    // 等待正文插件项稳定后，直接捕获设置 WebContentsView 的当前可见区域。
    await settings.evaluate(() => {
      document.documentElement.setAttribute('data-material', 'none')
      document.body.style.background = 'var(--bg-color)'
    })
    await fs.writeFile(
      testInfo.outputPath('installed-builtin-plugins.png'),
      Buffer.from(
        await app.evaluate(async ({ webContents }) =>
          (
            await webContents
              .getAllWebContents()
              .find((view) => view.getURL().startsWith('http://127.0.0.1:15177'))!
              .capturePage()
          )
            .toPNG()
            .toString('base64')
        ),
        'base64'
      )
    )

    // Windows 的 Electron 归档缓存随宿主退出释放，独立任务随后必须物理删除旧包。
    await app.close()
    app = undefined
    for (const artifact of [fixture.path, reinstalledPath]) {
      await expect
        .poll(
          async () => {
            try {
              await fs.access(artifact)
              return true
            } catch {
              return false
            }
          },
          { timeout: 15000 }
        )
        .toBe(false)
    }
    await expect(
      fs.access(path.join(temporary, 'data/plugins/.pending-removals'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
