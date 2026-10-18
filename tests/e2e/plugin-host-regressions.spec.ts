import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('cold plugin launch, singleton reuse, screenshot restore and detached body keep their intended target', async ({
  browserName: _browserName
}, testInfo) => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ztools-host-regression-'))
  let app: ElectronApplication | undefined
  try {
    const environment = {
      ...process.env,
      ZTOOLS_E2E: '1',
      ZTOOLS_SOURCE_PREVIEW: '1',
      ZTOOLS_PREVIEW_OPEN_SETTINGS: '0',
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
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    const builtin = await main.evaluate(async () =>
      (await window.ztools.getAllPlugins()).find((p) => p.name === 'system')
    )
    const command = {
      path: builtin!.path,
      type: 'plugin' as const,
      featureCode: 'clipboard',
      name: '剪贴板'
    }
    await main.evaluate((options) => window.ztools.launch(options), command)
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    let tools = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
    await expect(tools.locator('.clipboard-app .clear-btn')).toBeAttached()
    await expect(main.locator('.plugin-name')).toHaveText('工具')
    await expect(main.locator('.plugin-actions')).not.toHaveClass(/loading/)
    expect(
      app
        .context()
        .pages()
        .filter((p) => p.url().startsWith('http://127.0.0.1:15177'))
    ).toHaveLength(0)

    // 单例重入必须完成占位状态，不能一直显示加载圈。
    for (let i = 0; i < 3; i++) {
      await main.evaluate((options) => window.ztools.launch(options), command)
      await expect(main.locator('.plugin-actions')).not.toHaveClass(/loading/)
      await expect(main.locator('.plugin-name')).toHaveText('工具')
    }

    // 将截图捕获替换为取消结果，只验证宿主隐藏与恢复不启动设置，不测试原生图像算法。
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      manager.hidePluginView()
      const wm = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      ;(globalThis as any).__unwantedSettings = 0
      const showSettings = wm.showSettings.bind(wm)
      wm.showSettings = () => {
        ;(globalThis as any).__unwantedSettings++
        return showSettings()
      }
      const native = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/native/index.ts'
      )
      native.ScreenCapture.start = (_options, callback) => callback({ success: false })
      native.ScreenCapture.prime = () => false
    })
    await expect(main.locator('.identity')).toHaveCount(0)
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.showWindow()
    )
    await main.evaluate((options) => window.ztools.launch(options), {
      ...command,
      featureCode: 'screenshot',
      name: '截图'
    })
    expect(await app.evaluate(() => (globalThis as any).__unwantedSettings)).toBe(0)

    await main.evaluate((options) => window.ztools.launch(options), command)
    await expect(main.locator('.plugin-actions')).not.toHaveClass(/loading/)
    // 上一轮工具已退出并销毁；分离操作必须等待新会话正文和搜索框初始化。
    await expect.poll(() => tools.isClosed()).toBe(true)
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    tools = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
    await expect(tools.locator('.clipboard-app .clear-btn')).toBeAttached()
    await expect(main.locator('header input')).toHaveAttribute('placeholder', '搜索剪贴板内容...')
    const detached = await main.evaluate(() => window.ztools.detachPlugin())
    expect(detached.success).toBe(true)
    const attachment = await app.evaluate(({ app }) => {
      const windows = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/detachedWindowManager.ts'
      ).default
      const item = [...windows.detachedWindowMap.values()][0] as any
      return {
        attached: item.window.contentView.children.includes(item.view),
        bounds: item.view.getBounds()
      }
    })
    expect(attachment.attached).toBe(true)
    expect(attachment.bounds.height).toBeGreaterThan(200)
    await expect(tools.locator('.clipboard-app .clear-btn')).toBeAttached()
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .filter((p) => p.url().includes('detached-titlebar.html')).length
      )
      .toBe(1)
    const titlebar = app
      .context()
      .pages()
      .find((p) => p.url().includes('detached-titlebar.html'))!
    await expect(titlebar.locator('input')).toHaveAttribute('placeholder', '搜索剪贴板内容...')
    await app.evaluate(({ app }) => {
      const windows = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/detachedWindowManager.ts'
      ).default
      for (const item of windows.detachedWindowMap.values()) item.window.close()
    })

    // 普通第三方插件也覆盖重复进入和分离，避免修复只对工具生效。
    const fixture = path.join(temporary, 'fixture')
    await fs.mkdir(fixture)
    await fs.writeFile(
      path.join(fixture, 'plugin.json'),
      JSON.stringify({
        name: 'host-fixture',
        title: 'Host Fixture',
        version: '1.0.0',
        main: 'index.html',
        features: [{ code: 'main', cmds: ['HostFixture'] }]
      })
    )
    await fs.writeFile(
      path.join(fixture, 'index.html'),
      '<body style="background:white;color:#123"><h1>Stable fixture plugin body</h1><p>Detached content remains visible.</p></body>'
    )
    await app.evaluate(({ app }, fixture) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      db.dbPut('plugins', [
        ...db.dbGet('plugins'),
        { name: 'host-fixture', path: fixture, main: fixture + '/index.html' }
      ])
    }, fixture)
    const fixtureCommand = {
      path: fixture,
      type: 'plugin' as const,
      featureCode: 'main',
      name: 'HostFixture'
    }
    for (let i = 0; i < 2; i++) {
      await main.evaluate((options) => window.ztools.launch(options), fixtureCommand)
      await expect(main.locator('.plugin-actions')).not.toHaveClass(/loading/)
    }
    const fixturePage = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('file:') && p.url().endsWith('/fixture/index.html'))!
    await expect(fixturePage.getByText('Detached content remains visible.')).toBeVisible()
    expect((await main.evaluate(() => window.ztools.detachPlugin())).success).toBe(true)
    await expect(fixturePage.getByText('Detached content remains visible.')).toBeVisible()
    await fs.writeFile(
      testInfo.outputPath('detached-plugin-body.png'),
      Buffer.from(
        await app.evaluate(async ({ webContents }) =>
          (
            await webContents
              .getAllWebContents()
              .find((c) => c.getURL().endsWith('/fixture/index.html'))!
              .capturePage()
          )
            .toPNG()
            .toString('base64')
        ),
        'base64'
      )
    )
    expect(await app.evaluate(() => (globalThis as any).__unwantedSettings)).toBe(0)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
