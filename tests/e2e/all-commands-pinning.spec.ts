import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('所有指令搜索自动切换来源后可固定与取消固定，保留原有超级面板项目', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(90000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-command-pinning-'))
  let app: ElectronApplication | undefined
  try {
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '1',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
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
    // 新资料默认已固定演示录屏；仅在本用例隔离资料中移除它，保留其他默认项和顺序。
    await settings.evaluate(async () => {
      const pinned = await window.tabdo.internal.getSuperPanelPinned()
      await window.tabdo.internal.dbPut(
        'super-panel-pinned',
        pinned.filter(
          (item) => item.featureCode !== 'presentation-recorder' || item.pluginName !== 'system'
        )
      )
    })
    await settings.getByRole('button', { name: '所有指令', exact: true }).click()
    const source = settings
      .locator('.source-item')
      .filter({ has: settings.locator('.source-name').getByText('设置', { exact: true }) })
    await source.click()
    await expect(source).toHaveClass(/active/)
    const before = await settings.evaluate(() => window.tabdo.internal.getSuperPanelPinned())
    const owner = await settings.evaluate(() => window.tabdo.getWebContentsId())
    const ownerId = await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner).id,
      owner
    )
    let titlebar
    for (const page of app.context().pages()) {
      if (
        page.url().includes('detached-titlebar.html') &&
        (await (await app.browserWindow(page)).evaluate((window) => window.id)) === ownerId
      )
        titlebar = page
    }
    expect(titlebar).toBeTruthy()
    // 仅输入搜索词，不点击新的来源，复现自动切换来源后固定无反应的路径。
    await titlebar!.getByPlaceholder('搜索指令...').fill('演示录屏')
    const command = settings.locator('.command-tag').getByText('演示录屏', { exact: true })
    await expect(command).toBeVisible()
    await command.click()
    await settings
      .locator('.dropdown-menu .dropdown-item')
      .getByText('固定到超级面板', { exact: true })
      .click()
    await expect
      .poll(async () =>
        (await settings.evaluate(() => window.tabdo.internal.getSuperPanelPinned())).some(
          (item) => item.featureCode === 'presentation-recorder' && item.pluginName === 'system'
        )
      )
      .toBe(true)
    const after = await settings.evaluate(() => window.tabdo.internal.getSuperPanelPinned())
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after).toHaveLength(before.length + 1)
    expect(after.at(-1)).toMatchObject({
      name: '演示录屏',
      type: 'plugin',
      featureCode: 'presentation-recorder',
      pluginName: 'system'
    })
    expect(after.at(-1).path).toBeTruthy()
    await command.click()
    await expect(
      settings
        .locator('.dropdown-menu .dropdown-item')
        .getByText('取消固定超级面板', { exact: true })
    ).toBeVisible()
    await settings
      .locator('.dropdown-menu .dropdown-item')
      .getByText('取消固定超级面板', { exact: true })
      .click()
    await expect
      .poll(() => settings.evaluate(() => window.tabdo.internal.getSuperPanelPinned()))
      .toEqual(before)
    // 搜索清空后返回原选择来源，不能把自动来源写回用户的选择。
    await titlebar!.getByPlaceholder('搜索指令...').fill('')
    await expect(source).toHaveClass(/active/)
    await fs.writeFile(
      testInfo.outputPath('all-commands-search.png'),
      Buffer.from(
        await app.evaluate(
          async ({ webContents }, owner) =>
            (await webContents.fromId(owner)!.capturePage()).toPNG().toString('base64'),
          owner
        ),
        'base64'
      )
    )
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
