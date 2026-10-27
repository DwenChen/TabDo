import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readWindowIdentity, trackWindowIdentities } from '../fixtures/windowIdentity'

test('工具分类保留各指令操作，所有可见子组件提供任务栏图标并在退出时释放', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-catalog-'))
  let application: ElectronApplication | undefined
  const logs: string[] = []
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
    await trackWindowIdentities(app)
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await app.evaluate(({ app, clipboard }) => {
      clipboard.clear()
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      void manager.withBlurHideSuppressed(
        () =>
          new Promise((resolve) => {
            ;(globalThis as any).__catalogFocus = resolve
          })
      )
    })
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
    await settings.getByRole('button', { name: '所有指令', exact: true }).click()
    await settings
      .locator('.source-item')
      .filter({ has: settings.locator('.source-name').getByText('工具', { exact: true }) })
      .click()
    const recorder = settings.locator('[data-command-group="录屏"]')
    await expect(recorder.locator('.command-tag')).toHaveText(['录屏', '区域录屏', '停止录屏'])
    await expect(settings.locator('.command-list .command-tag')).toHaveCount(30)
    await expect(settings.locator('[data-command-group="演示录屏"] .command-tag')).toHaveText([
      '演示录屏'
    ])
    await expect(settings.getByText('Screen Recorder', { exact: true })).toHaveCount(0)
    await expect(settings.getByText('录屏助手', { exact: true })).toHaveCount(0)

    // 分类只改变卡片，禁用操作必须精确落到区域入口，不能影响整组。
    const region = recorder.locator('[data-feature-code="screen-recorder-region"] .command-tag')
    await region.click()
    await settings.locator('.dropdown-menu .dropdown-item').filter({ hasText: '禁用指令' }).click()
    await expect(region).toHaveClass(/disabled/)
    await expect(
      recorder.locator('[data-feature-code="screen-recorder"] .command-tag')
    ).not.toHaveClass(/disabled/)
    await region.click()
    await settings.locator('.dropdown-menu .dropdown-item').filter({ hasText: '启用指令' }).click()
    await expect(region).not.toHaveClass(/disabled/)
    await expect(settings.locator('.dropdown-menu')).toHaveCount(0)
    await settings.mouse.move(12, 12)
    // 插件正文透明材质在脱离原生背景捕获时改为同主题实色，保留界面原有颜色。
    await settings.evaluate(() => {
      document.documentElement.setAttribute('data-material', 'none')
      document.body.style.background = matchMedia('(prefers-color-scheme: dark)').matches
        ? '#202020'
        : '#ffffff'
    })
    await recorder.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        recorder
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
            )
          )
      )
      .toBe(true)
    // 直接捕获插件 WebContentsView 的当前可见正文。
    await fs.writeFile(
      testInfo.outputPath('tools-catalog.png'),
      Buffer.from(
        await app.evaluate(
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
        ),
        'base64'
      )
    )
    await settings.getByRole('button', { name: /匹配指令/ }).click()
    await expect(
      settings.locator('[data-feature-code="presentation-editor"] .tag-files')
    ).toHaveCount(1)
    const qr = settings.locator('[data-feature-code="qrcode-scan"]')
    await expect(qr.locator('.tag-img')).toHaveCount(1)
    await expect(qr.locator('.tag-files')).toHaveCount(1)

    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')
    )
    const mainId = await app.evaluate(
      ({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
          .default.getMainWindow().id
    )
    const identities: any[] = []
    /**
     * 启动真实宿主工具并等待该功能的稳定正文。
     * @param code 功能码。
     * @param selector 该子组件正文特征。
     * @returns 当前新建的工具页面。
     */
    async function launch(code: string, selector: string): Promise<Page> {
      const previousPages = new Set(app.context().pages())
      await main.evaluate(
        ({ plugin, code }) =>
          window.tabdo.launch({ path: plugin!.path, type: 'plugin', featureCode: code }),
        { plugin, code }
      )
      await expect
        .poll(() =>
          app
            .context()
            .pages()
            .some(
              (page) =>
                !previousPages.has(page) &&
                !page.isClosed() &&
                page.url().startsWith('http://127.0.0.1:15178')
            )
        )
        .toBe(true)
      const page = app
        .context()
        .pages()
        .find(
          (page) =>
            !previousPages.has(page) &&
            !page.isClosed() &&
            page.url().startsWith('http://127.0.0.1:15178')
        )!
      await expect(page.locator(selector).first()).toBeAttached()
      return page
    }
    let previous: Page | undefined
    // 覆盖全部嵌入正文及媒体直达入口，不执行文件事务或真实内容识别。
    for (const [code, selector] of [
      ['clipboard', '.clipboard-app .clear-btn'],
      ['recognize', '.result-empty'],
      ['latex-recognize', '.result-empty'],
      ['file-renamer', '.rename-page input'],
      ['folder-break', '.break-page select'],
      ['qrcode-scan', '.qr-empty'],
      ['local-search', '.search-empty'],
      ['screen-recorder', '.app-workspace input'],
      ['image-batch', '.media-empty'],
      ['image-batch-folder', '.media-empty'],
      ['image-manual-crop', '.media-empty'],
      ['image-merge', '.media-empty'],
      ['video-batch', '.media-empty'],
      ['web-quick-open', '.quick-open input']
    ]) {
      const page = await launch(code, selector)
      if (previous) await expect.poll(() => previous!.isClosed()).toBe(true)
      const identity = await readWindowIdentity(app, mainId, code)
      expect(identity.iconMatchesFeature, code).toBe(true)
      expect(identity.skipTaskbar, code).toBe(false)
      if (process.platform === 'win32')
        expect(
          identity.nativeIcons.some((icon) => icon.sent && icon.present),
          code
        ).toBe(true)
      identities.push({ code, ...identity })
      previous = page
    }
    // 分离后正文和搜索宿主使用各自的任务栏状态。
    expect((await main.evaluate(() => window.tabdo.detachPlugin())).success).toBe(true)
    const detachedId = await app.evaluate(
      ({ app }) =>
        [
          ...process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.detachedWindowMap.values()
        ].find((item: any) => item.pluginName === 'system').window.id
    )
    const detachedIdentity = await readWindowIdentity(app, detachedId, 'web-quick-open')
    expect(detachedIdentity.iconMatchesFeature).toBe(true)
    expect(detachedIdentity.skipTaskbar).toBe(false)
    if (process.platform === 'win32')
      expect(detachedIdentity.nativeIcons.some((icon) => icon.present)).toBe(true)
    identities.push({ code: 'detached-web-quick-open', ...detachedIdentity })
    expect((await readWindowIdentity(app, mainId)).skipTaskbar).toBe(true)
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(), detachedId)
    await expect.poll(() => previous!.isClosed()).toBe(true)

    // 自动分离路径也携带当前功能的图标。
    const direct = await app.evaluate(
      async ({ app }, pluginPath) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
          .default.createPluginInDetachedWindow(pluginPath, 'clipboard', {
            code: 'clipboard',
            type: 'text',
            payload: ''
          }),
      plugin!.path
    )
    expect(direct.success).toBe(true)
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const directId = await app.evaluate(
      ({ app }) =>
        [
          ...process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.detachedWindowMap.values()
        ].find((item: any) => item.pluginName === 'system').window.id
    )
    const directIdentity = await readWindowIdentity(app, directId, 'clipboard')
    expect(directIdentity.iconMatchesFeature).toBe(true)
    expect(directIdentity.skipTaskbar).toBe(false)
    if (process.platform === 'win32')
      expect(directIdentity.nativeIcons.some((icon) => icon.present)).toBe(true)
    identities.push({ code: 'direct-clipboard', ...directIdentity })
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(), directId)

    // 独立便签、悬浮图片和图片标记不依赖宿主页面存活。
    for (const content of [
      { type: 'text', text: '窗口图标验证', newWindow: true },
      { type: 'image', edit: false },
      { type: 'image', edit: true }
    ]) {
      const id = await app.evaluate(
        async ({ app, nativeImage }, content) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/toolsFloating.ts')
            .openFloating({
              ...content,
              ...(content.type === 'image'
                ? {
                    image: nativeImage
                      .createFromBitmap(Buffer.alloc(80 * 60 * 4, 180), { width: 80, height: 60 })
                      .toDataURL()
                  }
                : {})
            }),
        content
      )
      const expectedIcon =
        content.type === 'text' ? 'sticky-note' : content.edit ? 'image-annotate' : 'float-content'
      const identity = await readWindowIdentity(app, id, expectedIcon)
      expect(identity.iconMatchesFeature).toBe(true)
      expect(identity.skipTaskbar).toBe(false)
      if (process.platform === 'win32')
        expect(identity.nativeIcons.some((icon) => icon.present)).toBe(true)
      identities.push({
        code:
          content.type === 'text'
            ? 'sticky-note'
            : content.edit
              ? 'image-annotate'
              : 'float-content',
        ...identity
      })
      await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.hide(), id)
      await expect
        .poll(() => app.evaluate(({ BrowserWindow }, id) => Boolean(BrowserWindow.fromId(id)), id))
        .toBe(false)
    }
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({ path: plugin!.path, type: 'plugin', featureCode: 'window-info' }),
      plugin
    )
    const infoId = await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => window.getTitle() === '窗口信息')!.id
    )
    const infoIdentity = await readWindowIdentity(app, infoId, 'window-info')
    expect(infoIdentity.iconMatchesFeature).toBe(true)
    expect(infoIdentity.skipTaskbar).toBe(false)
    if (process.platform === 'win32')
      expect(infoIdentity.nativeIcons.some((icon) => icon.present)).toBe(true)
    identities.push({ code: 'window-info', ...infoIdentity })
    await fs.writeFile(
      testInfo.outputPath('window-identities.json'),
      JSON.stringify(identities, null, 2)
    )
  } finally {
    await fs.writeFile(testInfo.outputPath('tools-catalog.log'), logs.join(''))
    await application?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
