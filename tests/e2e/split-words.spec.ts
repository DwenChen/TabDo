import { test, expect, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('拆分选词从剪贴板、悬浮中转与文本匹配指令打开并复制词语', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(150000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-split-words-'))
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
  let picker: Page | undefined
  try {
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main
          .evaluate(() => window.tabdo.getAllPlugins())
          .then((list) => list.some((item) => item.name === 'system'))
      )
      .toBe(true)
    const plugins = await main.evaluate(() => window.tabdo.getAllPlugins())
    const plugin = plugins.find((item) => item.name === 'system')!
    /**
     * 从真实宿主指令进入工具，等待匹配的新页面。
     * @param code 工具功能码。
     * @returns 当前工具正文页面。
     */
    async function launch(code: string): Promise<Page> {
      await main.evaluate(
        ({ plugin, code }) =>
          window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: code, name: code }),
        { plugin, code }
      )
      const id = await app.evaluate(
        ({ app }: any) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
            .default.getCurrentPluginView()?.webContents.id
      )
      let current: Page | undefined
      await expect
        .poll(async () => {
          for (const page of app.context().pages())
            if (
              !page.isClosed() &&
              page.url().includes('15178') &&
              (await page.evaluate(() => (window as any).tabdo.getWebContentsId())) === id
            )
              current = page
          return !!current
        })
        .toBe(true)
      return current!
    }
    const tools = await launch('clipboard')
    await app.evaluate(async ({ app }: any) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts'
      ).default
      await db.promises.put({
        _id: 'CLIPBOARD/split-words-0',
        type: 'text',
        timestamp: Date.now(),
        content: 'Hello, world! 拆分选词 123',
        hash: 'split-words-0'
      })
    })
    await tools.locator('.tab-item').getByText('文本', { exact: true }).click()
    const item = tools.locator('.clipboard-item[data-content="Hello, world! 拆分选词 123"]')
    await expect(item).toBeVisible()
    await tools.screenshot({ path: info.outputPath('clipboard-split-entry.png') })
    await item.getByRole('button', { name: '拆分选词', exact: true }).click()
    await expect
      .poll(async () => {
        for (const page of app.context().pages())
          if (!page.isClosed() && page.url().includes('word-picker.html')) picker = page
        return !!picker
      })
      .toBe(true)
    await expect(picker!.getByRole('button', { name: 'Hello', exact: true })).toBeVisible()
    await expect(picker!.getByRole('button', { name: 'world', exact: true })).toBeVisible()
    // 隐藏原生标题栏后窗口边缘与内容区只保留系统缩放的少量差值，不再有标题栏高度。
    const pickerWindow = await app.browserWindow(picker!)
    const frameMetrics = await pickerWindow.evaluate((win) => ({
      bounds: win.getBounds(),
      content: win.getContentBounds()
    }))
    expect(frameMetrics.bounds.width - frameMetrics.content.width).toBeLessThan(12)
    expect(frameMetrics.bounds.height - frameMetrics.content.height).toBeLessThan(12)
    await picker!.getByRole('button', { name: 'Hello', exact: true }).click()
    await picker!.getByRole('button', { name: 'world', exact: true }).click()
    await picker!.getByRole('button', { name: '复制选中', exact: true }).click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('Hello world')
    // 连续中文词语直接拼接，不为每个字补空格。
    await picker!.getByRole('button', { name: 'Hello', exact: true }).click()
    await picker!.getByRole('button', { name: 'world', exact: true }).click()
    await picker!.getByRole('button', { name: '拆', exact: true }).click()
    await picker!.getByRole('button', { name: '分', exact: true }).click()
    await picker!.getByRole('button', { name: '复制选中', exact: true }).click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('拆分')
    await picker!.screenshot({ path: info.outputPath('split-words-picker.png') })
    await picker!.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => picker!.isClosed()).toBe(true)

    // 中转文本条目复用选词窗口能力，并显示当前条目的正文。
    await tools.evaluate(() =>
      (window as any).tabdo.internal.tools.openFloating({
        type: 'relay',
        entries: [{ type: 'text', text: 'alpha beta gamma' }]
      })
    )
    let relay: Page | undefined
    await expect
      .poll(async () => {
        for (const page of app.context().pages())
          if (!page.isClosed() && page.url().includes('tools-text-float.html')) relay = page
        return !!relay
      })
      .toBe(true)
    await expect(relay!.locator('.entry pre')).toHaveText('alpha beta gamma')
    await relay!.screenshot({ path: info.outputPath('relay-split-entry.png') })
    await relay!.getByRole('button', { name: '拆分选词', exact: true }).click()
    picker = undefined
    await expect
      .poll(async () => {
        for (const page of app.context().pages())
          if (!page.isClosed() && page.url().includes('word-picker.html')) picker = page
        return !!picker
      })
      .toBe(true)
    await expect(picker!.getByRole('button', { name: 'alpha', exact: true })).toBeVisible()
    const reusedMetrics = await (
      await app.browserWindow(picker!)
    ).evaluate((win) => ({
      bounds: win.getBounds(),
      content: win.getContentBounds()
    }))
    expect(reusedMetrics.bounds.height - reusedMetrics.content.height).toBeLessThan(12)
    await picker!.getByRole('button', { name: 'alpha', exact: true }).dblclick()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('alpha')

    // 文本匹配指令隐藏宿主后打开同一选词窗口。
    await main.evaluate(
      ({ plugin }) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'split-words',
          name: '拆分选词',
          param: { type: 'over', payload: 'Delta epsilon' },
          cmdType: 'text'
        }),
      { plugin }
    )
    await expect(picker!.getByRole('button', { name: 'Delta', exact: true })).toBeVisible()
    await expect(picker!.getByRole('button', { name: 'epsilon', exact: true })).toBeVisible()
    await picker!.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => picker!.isClosed()).toBe(true)
  } catch (error) {
    console.error(logs.join(''))
    throw error
  } finally {
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
