import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('解散文件夹把内容移到父目录、保留历史并可撤销', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-folder-break-'))
  let application: ElectronApplication | undefined
  const logs: string[] = []
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
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const app = application
    const main = await app.firstWindow()
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    app
      .context()
      .on('page', (page) =>
        page.on('pageerror', (error) => logs.push('PAGE ERROR: ' + error.message))
      )
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((plugin) => plugin.name === 'system')
        )
      )
      .toBe(true)
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((entry) => entry.name === 'system')
    )

    // 准备一个包含文件、子文件和子目录的目录，覆盖单层模式的移动与目录删除。
    const target = path.join(temporary, '待解散')
    const nested = path.join(target, '子目录')
    await fs.mkdir(nested, { recursive: true })
    await fs.writeFile(path.join(target, '说明.txt'), 'break fixture')
    await fs.writeFile(path.join(nested, '内层.txt'), 'nested fixture')

    await main.evaluate(
      async ({ pluginPath, dir }) =>
        window.tabdo.launch({
          path: pluginPath,
          type: 'plugin',
          featureCode: 'folder-break',
          name: '解散文件夹',
          cmdType: 'files',
          param: { type: 'files', payload: [{ path: dir, name: '待解散', isDirectory: true }] }
        }),
      { pluginPath: plugin!.path, dir: target }
    )
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      manager.getMainWindow().show()
      manager.getMainWindow().focus()
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
        .default.focusPluginView()
    })
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const tools = app
      .context()
      .pages()
      .find((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178'))!

    // 子组件不再自带标题与说明，目录栏即正文入口。
    await expect(tools.locator('.folder-toolbar')).toBeVisible()
    expect(
      await tools.locator('.folder-toolbar').evaluate((el) => el.getBoundingClientRect().height)
    ).toBeLessThan(54)
    expect(
      await tools.locator('.config-bar').evaluate((el) => el.getBoundingClientRect().height)
    ).toBeLessThan(42)
    await expect(tools.getByRole('button', { name: '选择文件夹', exact: true })).toHaveCount(0)
    await expect(tools.locator('.folder-path')).toContainText('待解散')
    await expect(tools.getByRole('status')).toHaveText('已就绪，可执行解散')
    await expect(tools.getByLabel('解散预览')).toBeVisible()
    await expect(tools.getByLabel('解散预览')).toContainText('说明.txt')
    await expect(tools.getByLabel('解散预览')).toContainText('子目录')
    await expect(tools.getByRole('radio', { name: '单层' })).toBeChecked()
    await expect(tools.getByLabel('冲突处理')).toHaveValue('rename')
    await expect(tools.getByRole('button', { name: '执行解散' })).toBeEnabled()
    const screenshot = await app.evaluate(async ({ webContents }) => {
      const owner = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      return (await owner.capturePage()).toPNG().toString('base64')
    })
    await fs.writeFile(testInfo.outputPath('folder-compact.png'), Buffer.from(screenshot, 'base64'))
    await tools.getByRole('button', { name: '执行解散' }).click()
    await expect(tools.getByRole('dialog', { name: '确认解散文件夹' })).toBeVisible()
    await tools.getByRole('button', { name: '确认执行' }).click()
    await expect(tools.getByRole('status')).toContainText('解散完成', { timeout: 20000 })

    // 单层模式把文件和子目录整体移到父目录，并在目录清空后删除它。
    expect(await fs.readFile(path.join(temporary, '说明.txt'), 'utf8')).toBe('break fixture')
    expect(await fs.readFile(path.join(temporary, '子目录', '内层.txt'), 'utf8')).toBe(
      'nested fixture'
    )
    await expect
      .poll(async () =>
        fs.stat(target).then(
          () => true,
          () => false
        )
      )
      .toBe(false)

    // 历史记录保留本次操作，可撤销回原目录结构。
    const history = tools.getByLabel('解散历史')
    await expect(history).toBeVisible()
    await expect(history).toContainText('移动 2 项')
    await history.getByRole('button', { name: '撤销 待解散' }).click()
    await expect(tools.getByRole('status')).toContainText('已撤销：恢复 2 项', { timeout: 20000 })
    expect(await fs.readFile(path.join(target, '说明.txt'), 'utf8')).toBe('break fixture')
    expect(await fs.readFile(path.join(nested, '内层.txt'), 'utf8')).toBe('nested fixture')
    await expect
      .poll(async () =>
        fs.stat(path.join(temporary, '说明.txt')).then(
          () => true,
          () => false
        )
      )
      .toBe(false)
    await expect(history).toContainText('暂无历史记录')

    await fs.writeFile(
      testInfo.outputPath('break-fixture.json'),
      JSON.stringify({ target, nested }, null, 2)
    )
  } finally {
    await application?.close()
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
