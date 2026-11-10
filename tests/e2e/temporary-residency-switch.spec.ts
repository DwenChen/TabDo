import { expect, test, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('临时常驻工具在其他子组件打开、退出与再次进入后保留原页面和内容', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-resident-switch-'))
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
  app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
  app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
  try {
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    const pluginPath = await main.evaluate(
      async () =>
        (await window.tabdo.getAllPlugins()).find((plugin) => plugin.name === 'system')!.path
    )
    await app.evaluate(async ({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
        .default.dbPut('auto-detach-plugin', [])
      await process
        .mainModule!.require(app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts')
        .default.promises.put({
          _id: 'CLIPBOARD/resident-switch-seed',
          type: 'text',
          timestamp: Date.now(),
          content: '常驻未保存筛选：切换后继续保留这条正文',
          hash: 'resident-switch-seed'
        })
    })
    /**
     * 经真实宿主指令入口启动工具。
     * @param code 工具功能码。
     * @returns 指令路由完成后的 Promise。
     */
    async function launch(code: string): Promise<void> {
      await main.evaluate(
        ({ pluginPath, code }) =>
          window.tabdo.launch({
            path: pluginPath,
            type: 'plugin',
            featureCode: code,
            name: code
          }),
        { pluginPath, code }
      )
    }
    /**
     * 等待当前主窗口实际正文，避免把常驻页面当作新工具。
     * @param selector 当前工具正文的稳定特征。
     * @returns 与主窗口当前 WebContents 身份一致的页面。
     */
    async function currentBody(selector: string): Promise<Page> {
      let result: Page | undefined
      await expect
        .poll(async () => {
          const id = await app.evaluate(
            ({ app }) =>
              process
                .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
                .default.getCurrentPluginView()?.webContents.id
          )
          for (const page of app.context().pages()) {
            if (page.isClosed() || !page.url().includes('15178')) continue
            if (
              (await page.evaluate(() => (window as any).tabdo.getWebContentsId())) === id &&
              (await page.locator(selector).isVisible())
            )
              result = page
          }
          return !!result
        })
        .toBe(true)
      return result!
    }
    await launch('clipboard')
    const resident = await currentBody('.clipboard-app .clear-btn')
    await main.getByRole('button', { name: '临时常驻', exact: true }).click()
    const residentId = await resident.evaluate(() => (window as any).tabdo.getWebContentsId())
    const ownerId = await app.evaluate(
      ({ app }, id) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(id).id,
      residentId
    )
    let titlebar: Page | undefined
    await expect
      .poll(async () => {
        for (const page of app.context().pages()) {
          if (
            page.url().includes('detached-titlebar.html') &&
            (await (await app.browserWindow(page)).evaluate((win) => win.id)) === ownerId
          )
            titlebar = page
        }
        return !!titlebar
      })
      .toBe(true)
    await expect(titlebar!.getByRole('button', { name: '临时常驻', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(titlebar!.getByTitle('开发者工具', { exact: true })).toHaveCount(0)
    await titlebar!.locator('input').fill('常驻未保存筛选')

    /**
     * 检查原会话仍有可用正文、原始局部状态和独立窗口归属。
     * @returns 所有断言完成后的 Promise。
     */
    async function preserved(): Promise<void> {
      expect(resident.isClosed()).toBe(false)
      await expect(resident.locator('.clipboard-app .clear-btn')).toBeVisible()
      await expect(
        resident.getByText('常驻未保存筛选：切换后继续保留这条正文', { exact: true })
      ).toBeVisible()
      await expect(titlebar!.locator('input')).toHaveValue('常驻未保存筛选')
      await expect(resident.locator('.clipboard-app')).toHaveAttribute(
        'data-search-text',
        '常驻未保存筛选'
      )
      expect(await resident.evaluate(() => (window as any).tabdo.isTemporaryResident())).toBe(true)
      expect(await resident.evaluate(() => (window as any).toolsLifecycle.signal.aborted)).toBe(
        false
      )
      expect(
        await app.evaluate(({ app }, id) => {
          const entry = process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.getAllWindows()
            .find((item) => item.view.webContents.id === id)
          return (
            entry && {
              attached: entry.window.contentView.children.includes(entry.view),
              visible: entry.view.getVisible(),
              height: entry.view.getBounds().height
            }
          )
        }, residentId)
      ).toMatchObject({ attached: true, visible: true, height: expect.any(Number) })
    }
    // 原有实现把二维码指令送进常驻剪贴板页面，此处必须创建另一份正文。
    await launch('qrcode-scan')
    const qr = await currentBody('.qr-page .qr-content')
    await preserved()
    await launch('web-quick-open')
    const web = await currentBody('.quick-open .sites')
    await expect.poll(() => qr.isClosed()).toBe(true)
    await preserved()

    // 同功能重入只恢复原窗口，不能因其他工具覆盖路径级记录而重建或清空筛选。
    await launch('clipboard')
    await preserved()
    expect(web.isClosed()).toBe(false)
    // 隐藏或最小化常驻窗口后仍可启动别的子组件，再次呼出应恢复可见窗口。
    for (const action of ['hide', 'minimize'] as const) {
      await app.evaluate(
        ({ app }, { residentId, action }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.getWindowByPluginWebContents(residentId)
            [action](),
        { residentId, action }
      )
      await launch('qrcode-scan')
      await currentBody('.qr-page .qr-content')
      await launch('clipboard')
      expect(
        await app.evaluate(({ app }, id) => {
          const win = process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.getWindowByPluginWebContents(id)
          return win.isVisible() && !win.isMinimized()
        }, residentId)
      ).toBe(true)
      await preserved()
    }
    await fs.writeFile(info.outputPath('resident-body.png'), await resident.screenshot())
    // 新工具直接独立打开也不能复用常驻工具；普通独立页明确关闭后只销毁自己。
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      manager.hidePluginView()
      process
        .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
        .default.dbPut('auto-detach-plugin', ['system'])
    })
    await launch('qrcode-scan')
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .filter((page) => !page.isClosed() && page.url().includes('15178')).length
      )
      .toBe(2)
    await preserved()
    await app.evaluate(({ app }, id) => {
      const windows = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/detachedWindowManager.ts'
      ).default
      for (const entry of windows.getAllWindows())
        if (entry.view.webContents.id !== id) entry.window.close()
    }, residentId)
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .filter((page) => !page.isClosed() && page.url().includes('15178')).length
      )
      .toBe(1)
    await preserved()
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
        .default.dbPut('auto-detach-plugin', [])
    )
    await launch('qrcode-scan')
    const remaining = await currentBody('.qr-page .qr-content')
    await titlebar!.getByRole('button', { name: '临时常驻', exact: true }).click()
    await expect.poll(() => resident.isClosed()).toBe(true)
    await expect(remaining.locator('.qr-page .qr-content')).toBeVisible()
  } finally {
    await fs.writeFile(info.outputPath('electron.log'), logs.join(''))
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
