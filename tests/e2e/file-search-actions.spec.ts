import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('文件搜索右键高亮、拖出文件及多选复制', async ({ browserName: _browserName }, testInfo) => {
  test.skip(process.platform !== 'win32', '验证 Windows 文件剪贴板及资源管理器路由')
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-file-search-'))
  const searchFile = path.join(temporary, '搜索界面.txt')
  const secondSearchFile = path.join(temporary, '搜索界面第二项.txt')
  let application: ElectronApplication | undefined
  const logs: string[] = []
  try {
    await fs.writeFile(searchFile, '文件搜索预览夹具')
    await fs.writeFile(secondSearchFile, '批量复制夹具')
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
    const app = (application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    }))
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(
        () =>
          main.evaluate(async () =>
            (await window.tabdo.getAllPlugins()).some((entry) => entry.name === 'system')
          ),
        { timeout: 20000 }
      )
      .toBe(true)
    await main.evaluate(async () => {
      const plugin = (await window.tabdo.getAllPlugins()).find((entry) => entry.name === 'system')!
      await window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'local-search' })
    })
    // 源码宿主可能在启动扫描期间隐藏，显式聚焦新建的工具视图。
    await app.evaluate(({ app }) => {
      const load = (file: string) =>
        process.mainModule!.require(app.getAppPath() + '/src/main/managers/' + file).default
      const host = load('windowManager.ts').getMainWindow()
      host.show()
      host.focus()
      load('pluginManager.ts').focusPluginView()
    })
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .some((page) => page.url().startsWith('http://127.0.0.1:15178')),
        { timeout: 20000 }
      )
      .toBe(true)
    const tools = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    tools.on('pageerror', (error) => logs.push('PAGE ERROR: ' + error.message + '\n'))
    await expect(tools.locator('.finder-sidebar')).toBeVisible({ timeout: 25000 })
    // Everything 只负责返回固定条目；系统剪贴板和工具宿主仍使用真实 IPC。
    await tools.evaluate(
      ({ file, second }) => {
        const bridge = (window as any).toolsFiles
        bridge.everything = async (input) => {
          ;(window as any).__searchInput = input
          return {
            state: 'ready',
            total: 2,
            items: [
              { name: '搜索界面.txt', path: file, size: 24, isDirectory: false },
              { name: '搜索界面第二项.txt', path: second, size: 24, isDirectory: false }
            ]
          }
        }
      },
      { file: searchFile, second: secondSearchFile }
    )
    await main.getByPlaceholder('全盘搜索', { exact: true }).fill('搜索界面')
    await expect
      .poll(() => tools.evaluate(() => (window as any).__searchInput?.query))
      .toBe('搜索界面')
    const rows = tools.getByRole('listbox', { name: '文件搜索结果' }).getByRole('option')
    const actionMenu = tools.getByRole('menu', { name: '文件操作' })
    const owner = await tools.evaluate(() => window.tabdo.getWebContentsId())
    await app.evaluate(({ shell, webContents }, id) => {
      const calls: string[] = []
      const drags: string[][] = []
      ;(globalThis as any).__finderActions = calls
      ;(globalThis as any).__finderDrags = drags
      // Capture the actual native payload without entering the OS drag loop in Playwright.
      webContents.fromId(id)!.startDrag = (item) => {
        drags.push(item.files ?? (item.file ? [item.file] : []))
      }
      shell.openPath = async (target) => {
        calls.push('open:' + target)
        return ''
      }
      shell.showItemInFolder = (target) => {
        calls.push('reveal:' + target)
      }
    }, owner)
    /**
     * Use a real row gesture that crosses the drag threshold and leaves the row.
     * @param index Result to drag.
     * @returns Resolves after the pointer is released.
     */
    async function dragRow(index: number) {
      const row = rows.nth(index)
      await expect(row).toHaveAttribute('draggable', 'true')
      const box = (await row.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await tools.mouse.move(x, y)
      await tools.mouse.down()
      await tools.mouse.move(x + 24, y, { steps: 6 })
      await tools.mouse.move(x + 24, y + (index === 0 ? box.height : -box.height), { steps: 4 })
      await tools.mouse.up()
    }
    for (const [theme, background] of [
      ['light', 'rgb(255, 255, 255)'],
      ['dark', 'rgb(39, 39, 42)']
    ] as const) {
      await tools.emulateMedia({ colorScheme: theme })
      await rows.first().click({ button: 'right' })
      await expect(actionMenu.getByRole('menuitem')).toHaveCount(4)
      // 透明面板色在浅色和深色下都会透出文件行。
      await expect(actionMenu).toHaveCSS('background-color', background)
      await expect(actionMenu.getByRole('menuitem').first()).toHaveCSS(
        'color',
        theme === 'light' ? 'rgb(51, 51, 51)' : 'rgb(224, 224, 224)'
      )
      const hovered = actionMenu.getByRole('menuitem', { name: '复制路径' })
      await hovered.hover()
      await expect(hovered).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(hovered).not.toHaveCSS('background-color', background)
      const screenshot = await app.evaluate(
        async ({ webContents }, url) =>
          (
            await webContents
              .getAllWebContents()
              .find((view) => view.getURL() === url)!
              .capturePage()
          )
            .toPNG()
            .toString('base64'),
        tools.url()
      )
      await fs.writeFile(
        testInfo.outputPath('file-search-menu-' + theme + '.png'),
        Buffer.from(screenshot, 'base64')
      )
      await tools.mouse.move(1, 1)
      await actionMenu.getByRole('menuitem').first().press('ArrowDown')
      const focused = actionMenu.getByRole('menuitem', { name: '在资源管理器中显示' })
      await expect(focused).toBeFocused()
      await expect(focused).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await focused.press('Escape')
      await expect(actionMenu).toHaveCount(0)
    }
    await rows.first().click({ button: 'right' })
    await expect(actionMenu.getByRole('menuitem')).toHaveCount(4)
    await actionMenu.getByRole('menuitem', { name: '使用默认应用打开' }).click()
    await rows.first().press('Shift+F10')
    await actionMenu.getByRole('menuitem', { name: '在资源管理器中显示' }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__finderActions))
      .toEqual(['open:' + searchFile, 'reveal:' + searchFile])
    await rows.first().click({ button: 'right' })
    await actionMenu.getByRole('menuitem', { name: '复制路径' }).click()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(searchFile)
    await rows.first().click({ button: 'right' })
    await actionMenu.getByRole('menuitem', { name: '复制', exact: true }).click()
    await expect
      .poll(() =>
        tools.evaluate(() => (window as any).tabdo.getCopyedFiles().map(({ path }) => path))
      )
      .toEqual([searchFile])
    await dragRow(0)
    await expect.poll(() => app.evaluate(() => (globalThis as any).__finderDrags))
      .toEqual([[searchFile]])
    await tools.getByRole('button', { name: '多选', exact: true }).click()
    const batchCopy = tools.getByRole('button', { name: '批量复制' })
    await expect(batchCopy).toBeDisabled()
    await rows.first().click()
    await rows.nth(1).press('Space')
    await expect(rows.first()).toHaveAttribute('aria-selected', 'true')
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true')
    await dragRow(0)
    await expect.poll(() => app.evaluate(() => (globalThis as any).__finderDrags))
      .toEqual([[searchFile], [searchFile, secondSearchFile]])
    await batchCopy.click()
    await expect
      .poll(() =>
        tools.evaluate(() => (window as any).tabdo.getCopyedFiles().map(({ path }) => path))
      )
      .toEqual([searchFile, secondSearchFile])
    await rows.nth(1).press('Space')
    await dragRow(1)
    await expect.poll(() => app.evaluate(() => (globalThis as any).__finderDrags))
      .toEqual([[searchFile], [searchFile, secondSearchFile], [secondSearchFile]])
    await tools.getByRole('button', { name: '多选', exact: true }).click()
    await expect(batchCopy).toHaveCount(0)

    const image = await app.evaluate(
      async ({ webContents }, url) =>
        (
          await webContents
            .getAllWebContents()
            .find((view) => view.getURL() === url)!
            .capturePage()
        )
          .toPNG()
          .toString('base64'),
      tools.url()
    )
    await fs.writeFile(testInfo.outputPath('file-search-results.png'), Buffer.from(image, 'base64'))
  } finally {
    if (application) await application.close().catch(() => {})
    await fs.writeFile(testInfo.outputPath('file-search-host.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
