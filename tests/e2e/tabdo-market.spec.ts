import { test, expect, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('TabDo independent market installs its published session plugin and preserves saved data on reentry', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-market-'))
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
  const app = await electron.launch({
    args: [path.join(root, 'scripts/preview-main.cjs')],
    cwd: root,
    env
  })
  const logs: string[] = []
  app.process().stdout?.on('data', (data) => logs.push(String(data)))
  app.process().stderr?.on('data', (data) => logs.push(String(data)))
  try {
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((plugin) => plugin.name === 'system')
        )
      )
      .toBe(true)
    const installed = await app.evaluate(async ({ app }) => {
      const plugins = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/renderer/plugins.ts'
      ).default
      const result = await plugins.market.fetchPluginMarket()
      if (!result.success) throw new Error(result.error)
      const example = result.data.find((plugin: any) => plugin.name === 'hello-tabdo')
      if (!example) throw new Error('Published example missing')
      const installation = await plugins.installer.installPluginFromMarket(example)
      if (!installation.success) throw new Error(installation.error)
      return installation
    })
    expect(installed.success).toBe(true)
    const pluginPath = await app.evaluate(
      ({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
          .default.dbGet('plugins')
          .find((plugin: any) => plugin.name === 'hello-tabdo').path
    )
    /**
     * 通过真实宿主打开已安装的市场包。
     * @returns 新插件页面。
     */
    async function open(): Promise<Page> {
      const previous = new Set(app.context().pages())
      await main.evaluate(
        (pluginPath) =>
          window.tabdo.launch({ path: pluginPath, type: 'plugin', featureCode: 'hello' }),
        pluginPath
      )
      await app.evaluate(({ app }) => {
        const win = process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
          .default.getMainWindow()
        win.show()
        win.focus()
      })
      let page: Page | undefined
      await expect
        .poll(() => {
          page = app
            .context()
            .pages()
            .find(
              (item) =>
                !previous.has(item) &&
                item.url().includes('hello-tabdo') &&
                item.url().endsWith('index.html')
            )
          return !!page
        })
        .toBe(true)
      await expect(page!.getByRole('heading', { name: '会话示例' })).toBeVisible()
      return page!
    }
    const first = await open()
    expect(await first.evaluate(() => (window as any).tabdo.getAppName())).toBe('TabDo')
    await first.getByLabel('保存内容').fill('TabDo market data retained')
    await first.getByRole('button', { name: '保存', exact: true }).click()
    await expect(first.getByRole('status')).toHaveText('已保存')
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.getMainWindow()
        .hide()
    )
    await expect.poll(() => first.isClosed()).toBe(true)
    const second = await open()
    await expect(second.getByLabel('保存内容')).toHaveValue('TabDo market data retained')
    await second.screenshot({ path: info.outputPath('market-plugin-installed.png') })
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.getMainWindow()
        .hide()
    )
    await expect.poll(() => second.isClosed()).toBe(true)
  } finally {
    await fs.writeFile(info.outputPath('application.log'), logs.join(''))
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
