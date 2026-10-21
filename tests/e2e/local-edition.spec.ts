import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('local edition settings, backup bridge, providers and complete panel matching', async ({
  browserName: _browserName
}, testInfo) => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-local-e2e-'))
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
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeVisible()
    await expect
      .poll(
        () =>
          app!.evaluate(
            ({ webContents }) =>
              webContents
                .getAllWebContents()
                .find((c) => c.getURL().startsWith('http://127.0.0.1:15177'))
                ?.executeJavaScript('document.body.innerText') || ''
          ),
        { timeout: 30000 }
      )
      .toContain('开机自动启动')
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const setting = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15177'))!
    await expect(setting.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
    await expect(setting.getByText('显示悬浮球', { exact: true })).toHaveCount(0)
    await expect(setting.getByRole('heading', { name: '搜索', exact: true })).toHaveCount(0)
    for (const text of ['注册/登录 TabDo', 'MCP 服务', '数据同步'])
      await expect(setting.getByText(text, { exact: true })).toHaveCount(0)
    await expect(
      setting.locator('.settings-sidebar').getByText('TabDo 本地版 · 第一版')
    ).toHaveCount(0)
    await expect(
      main.getByRole('button', { name: '插件操作', exact: true }).locator('img')
    ).toHaveCount(0)
    await expect(setting.locator('.settings-sidebar').getByText('数据备份与迁移')).toHaveCount(0)
    await setting.getByRole('button', { name: '我的数据', exact: true }).click()
    await setting.getByRole('tab', { name: '数据备份与迁移', exact: true }).click()
    await expect(setting.getByRole('button', { name: '导出完整备份' })).toBeVisible()
    expect(
      await setting.evaluate(() => ({
        backup: typeof window.tabdo.internal.backupRun,
        account: typeof (window.tabdo.internal as any).accountSaveSession,
        sync: typeof (window.tabdo.internal as any).syncConnect,
        floatingBall: typeof (window.tabdo.internal as any).setFloatingBallEnabled,
        mcp: typeof (window.tabdo.internal as any).mcpServerStatus,
        toolRegistration: typeof (window.tabdo as any).registerTool
      }))
    ).toEqual({
      backup: 'function',
      account: 'undefined',
      sync: 'undefined',
      floatingBall: 'undefined',
      mcp: 'undefined',
      toolRegistration: 'undefined'
    })
    // Capture the plugin view with an opaque material so the exported image stays legible.
    await setting.evaluate(() => {
      document.documentElement.setAttribute('data-material', 'none')
      document.body.style.background = 'var(--bg-color)'
    })
    await setting.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    await fs.writeFile(
      testInfo.outputPath('backup.png'),
      Buffer.from(
        await app.evaluate(async ({ webContents }) =>
          (
            await webContents
              .getAllWebContents()
              .find((c) => c.getURL().startsWith('http://127.0.0.1:15177'))!
              .capturePage()
          )
            .toPNG()
            .toString('base64')
        ),
        'base64'
      )
    )
    await setting.getByRole('button', { name: '关于', exact: true }).click()
    const appVersion = await app.evaluate(({ app }) => app.getVersion())
    await expect(setting.getByText(`v${appVersion}`)).toBeVisible()
    await expect(setting.getByText('致谢', { exact: true })).toBeVisible()
    await setting.getByRole('button', { name: '已安装插件', exact: true }).click()
    for (const title of ['设置', '工具']) {
      await expect(
        setting
          .locator('.plugin-item')
          .filter({ has: setting.locator('.plugin-name', { hasText: title }) })
      ).toHaveCount(0)
    }
    await setting.getByRole('button', { name: '提供商', exact: true }).click()
    await expect(setting.getByText('TabDo 官方模型')).toHaveCount(0)
    await expect(main.locator('.search-input')).toHaveCount(0)

    // Inject a real development plugin so every panel payload modality is exercised.
    const pluginPath = path.join(temporary, 'fixture-plugin')
    await fs.mkdir(pluginPath)
    const features = [
      { code: 'text', cmds: ['LocalPanelFixture'] },
      { code: 'regex', cmds: [{ type: 'regex', label: 'Local regex', match: '/^fixture-.+/' }] },
      { code: 'image', cmds: [{ type: 'img', label: 'Local image' }] },
      { code: 'files', cmds: [{ type: 'files', label: 'Local files' }] },
      {
        code: 'window',
        cmds: [{ type: 'window', label: 'Local window', match: { app: ['Fixture.exe'] } }]
      }
    ]
    await fs.writeFile(
      path.join(pluginPath, 'plugin.json'),
      JSON.stringify({
        name: 'local-panel-fixture',
        version: '1.0.0',
        main: 'index.html',
        features
      })
    )
    await fs.writeFile(
      path.join(pluginPath, 'index.html'),
      '<h1>Panel plugin launched</h1><script>tabdo.onPluginEnter(action => document.body.dataset.payload = JSON.stringify(action));</script>'
    )

    await app.evaluate(
      ({ app, webContents }, plugin) => {
        const database = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/shared/database.ts'
        ).default
        database.dbPut('plugins', [...database.dbGet('plugins'), plugin])
        webContents
          .getAllWebContents()
          .find((c) => c.getURL().startsWith('http://127.0.0.1:5174/'))!
          .send('plugins-changed')
      },
      {
        name: 'local-panel-fixture',
        title: 'Panel Fixture',
        path: pluginPath,
        features,
        isDevelopment: true
      }
    )
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((p) => p.name === 'local-panel-fixture')
        )
      )
      .toBe(true)
    for (const [content, feature] of [
      [{ type: 'text', text: 'LocalPanelFixture' }, 'text'],
      [{ type: 'text', text: 'fixture-selection' }, 'regex'],
      [{ type: 'image', image: 'data:image/png;base64,AA==' }, 'image'],
      [
        {
          type: 'file',
          files: [
            { path: path.join(temporary, 'sample.txt'), name: 'sample.txt', isDirectory: false }
          ]
        },
        'files'
      ]
    ] as const) {
      await expect
        .poll(
          () =>
            app!.evaluate(
              ({ ipcMain, webContents }, clipboardContent) =>
                new Promise<string[]>((resolve) => {
                  ipcMain.once('super-panel-search-result', (_event, data) =>
                    resolve(
                      data.results
                        .filter((r: any) => r.path.includes('fixture-plugin'))
                        .map((r: any) => r.featureCode)
                    )
                  )
                  webContents
                    .getAllWebContents()
                    .find((c) => c.getURL().startsWith('http://127.0.0.1:5174/'))!
                    .send('super-panel-search', {
                      text: 'text' in clipboardContent ? clipboardContent.text : '',
                      clipboardContent
                    })
                }),
              content
            ),
          { timeout: 15000 }
        )
        .toContain(feature)
    }
    await expect
      .poll(
        () =>
          app!.evaluate(
            ({ ipcMain, webContents }) =>
              new Promise<string[]>((resolve) => {
                ipcMain.once('super-panel-window-commands-result', (_event, data) =>
                  resolve(
                    data.results
                      .filter((r: any) => r.path.includes('fixture-plugin'))
                      .map((r: any) => r.featureCode)
                  )
                )
                webContents
                  .getAllWebContents()
                  .find((c) => c.getURL().startsWith('http://127.0.0.1:5174/'))!
                  .send('super-panel-search-window-commands', {
                    requestId: 42,
                    windowInfo: { app: 'Fixture.exe', title: 'Fixture' }
                  })
              })
          ),
        { timeout: 15000 }
      )
      .toContain('window')
    await app.evaluate(({ app, webContents }, pluginPath) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/superPanelManager.ts'
      ).default
      manager.currentClipboardContent = { type: 'text', text: 'LocalPanelFixture' }
      const main = webContents
        .getAllWebContents()
        .find((c) => c.getURL().startsWith('http://127.0.0.1:5174/'))!
      main.send('super-panel-launch', {
        command: {
          path: pluginPath,
          type: 'plugin',
          featureCode: 'text',
          cmdType: 'text',
          name: 'LocalPanelFixture'
        },
        clipboardContent: manager.currentClipboardContent,
        launchSource: 'super-panel'
      })
    }, pluginPath)
    await expect
      .poll(() =>
        app!.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((c) => c.getURL().includes('fixture-plugin'))
              .map((c) => c.getURL()).length
        )
      )
      .toBe(1)
    const fixturePage = app
      .context()
      .pages()
      .find((p) => p.url().includes('fixture-plugin'))!
    await expect(fixturePage.getByRole('heading', { name: 'Panel plugin launched' })).toBeVisible()
    await expect
      .poll(() => fixturePage.evaluate(() => document.body.dataset.payload || ''))
      .toContain('LocalPanelFixture')
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
