import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('翻译方向图标与中文选区跳过', async ({ browserName: _browserName }, testInfo) => {
  test.setTimeout(90_000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-settings-search-'))
  let application: ElectronApplication | undefined
  try {
    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '1',
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
    await app.firstWindow()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByLabel('选中文本自动翻译', { exact: true })).toBeChecked()
    await expect(
      settings.getByText('使用默认翻译服务和语言，中文为主的选文不自动翻译', { exact: true })
    ).toBeVisible()

    // 调用真实宿主自动翻译入口，仅替换提供商与结果发布边界，不发出外网请求。
    const translation = await app.evaluate(async ({ app }) => {
      const load = (file: string): any =>
        process.mainModule!.require(app.getAppPath() + '/src/main/' + file).default
      const manager = load('core/superPanelManager.ts')
      const provider = load('core/provider/providerManager.ts')
      const originalInvoke = provider.invoke
      const originalSend = manager.sendToSuperPanel
      const originalVisible = manager.requestedVisible
      const calls: string[] = []
      const published: string[] = []
      let oldSignal: AbortSignal | undefined
      let finishOld: ((result: { text: string }) => void) | undefined
      try {
        manager.requestedVisible = true
        manager.sendToSuperPanel = (_channel: string, result: { sourceText: string }) =>
          published.push(result.sourceText)
        provider.invoke = async (
          _type: string,
          input: { text: string },
          options: { signal: AbortSignal }
        ) => {
          calls.push(input.text)
          if (input.text === 'Old pending selection') {
            oldSignal = options.signal
            return new Promise((resolve) => {
              finishOld = resolve
            })
          }
          return { text: '夹具译文' }
        }
        for (const text of [
          '简体中文选区',
          '這是繁體中文',
          '中文说明包含 API 缩写。',
          '2026，！？',
          'Hello world',
          '日本語を翻訳します。'
        ])
          await manager.requestTranslation(text)
        const pending = manager.requestTranslation('Old pending selection')
        await manager.requestTranslation('新中文选区')
        const aborted = oldSignal?.aborted
        finishOld!({ text: '不得发布的旧译文' })
        await pending
        return { calls, published, aborted, released: manager.translationController === null }
      } finally {
        provider.invoke = originalInvoke
        manager.sendToSuperPanel = originalSend
        manager.requestedVisible = originalVisible
      }
    })
    expect(translation).toEqual({
      calls: ['Hello world', '日本語を翻訳します。', 'Old pending selection'],
      published: ['Hello world', '日本語を翻訳します。'],
      aborted: true,
      released: true
    })

    /**
     * 直接捕获设置插件当前稳定可见区域，保留翻译方向图标的主题验收证据。
     * @param name 证据文件名。
     * @returns 截图写入完成后的 Promise。
     */
    async function capture(name: string): Promise<void> {
      const png = await app.evaluate(
        async ({ webContents }, url) =>
          (
            await webContents
              .getAllWebContents()
              .find((item) => item.getURL() === url)!
              .capturePage()
          )
            .toPNG()
            .toString('base64'),
        settings.url()
      )
      await fs.writeFile(testInfo.outputPath(name), Buffer.from(png, 'base64'))
    }
    await settings.getByRole('button', { name: '提供商', exact: true }).click()
    await settings.getByRole('button', { name: '翻译', exact: true }).click()
    await settings.getByLabel('在线翻译服务').selectOption('builtin-google')
    const arrow = settings.locator('.language-direction svg')
    await expect(arrow).toBeVisible()
    for (const theme of ['light', 'dark'] as const) {
      // 用Electron实际主题驱动页面；普通材质让插件截图不依赖DWM背景合成。
      await app.evaluate(({ nativeTheme }, theme) => {
        nativeTheme.themeSource = theme
      }, theme)
      await settings.emulateMedia({ colorScheme: theme })
      await settings.evaluate(() => document.documentElement.setAttribute('data-material', 'none'))
      await expect
        .poll(() =>
          settings
            .locator('.capability-card')
            .first()
            .evaluate((element) => getComputedStyle(element).backgroundColor)
        )
        .toBe(theme === 'dark' ? 'rgb(58, 58, 60)' : 'rgb(255, 255, 255)')
      await settings.getByLabel('目标语言', { exact: true }).scrollIntoViewIfNeeded()
      const layout = await settings.locator('.language-fields').evaluate((element) => {
        const svg = element.querySelector('svg')!.getBoundingClientRect()
        const source = element.querySelector('select')!.getBoundingClientRect()
        return {
          delta: Math.abs(svg.y + svg.height / 2 - source.y - source.height / 2),
          width: svg.width,
          overflow: element.scrollWidth > element.clientWidth
        }
      })
      expect(layout.delta).toBeLessThanOrEqual(2)
      expect(layout.width).toBe(20)
      expect(layout.overflow).toBe(false)
      await capture(`translation-direction-${theme}.png`)
    }
  } finally {
    await application?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
