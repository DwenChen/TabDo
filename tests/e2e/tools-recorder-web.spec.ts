import { test, expect, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readWindowIdentity, trackWindowIdentities } from '../fixtures/windowIdentity'

test('web quick open config, matched text/image, native recorder output and cleanup', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-recorder-web-'))
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
  const app = await electron.launch({
    args: [path.join(root, 'scripts/preview-main.cjs')],
    cwd: root,
    env: environment
  })
  const logs: string[] = []
  app.process().stdout?.on('data', (data) => logs.push(String(data)))
  app.process().stderr?.on('data', (data) => logs.push(String(data)))
  try {
    await trackWindowIdentities(app)
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((item) => item.name === 'system')
        )
      )
      .toBe(true)
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')
    )
    /**
     * 启动管理界面并等待本次新页面。
     * @param code 子组件指令。
     * @returns 新建的工具页面。
     */
    async function launch(code: string): Promise<Page> {
      const old = app
        .context()
        .pages()
        .filter((page) => page.url().startsWith('http://127.0.0.1:15178'))
      await main.evaluate(
        async ({ plugin, code }) =>
          window.tabdo.launch({ path: plugin!.path, type: 'plugin', featureCode: code }),
        { plugin, code }
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
            .some((page) => !old.includes(page) && page.url().startsWith('http://127.0.0.1:15178'))
        )
        .toBe(true)
      return app
        .context()
        .pages()
        .find((page) => !old.includes(page) && page.url().startsWith('http://127.0.0.1:15178'))!
    }
    /**
     * 直接截取稳定正文所在的工具 WebContentsView。
     * @param page 工具页面。
     * @param name 截图文件名。
     * @returns 截图保存完成后的 Promise。
     */
    async function capture(page: Page, name: string): Promise<void> {
      await page.evaluate(() => {
        document.body.style.background = matchMedia('(prefers-color-scheme: dark)').matches
          ? '#202020'
          : '#ffffff'
      })
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await fs.writeFile(
        testInfo.outputPath(name),
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
            page.url()
          ),
          'base64'
        )
      )
    }
    let tools = await launch('web-quick-open')
    await expect(tools.getByLabel('搜索网址')).toHaveCount(3)
    await tools.getByLabel('启用百度').uncheck()
    await tools.getByLabel('搜索文字').fill('中文 &?#')
    await tools.getByRole('button', { name: '保存设置' }).click()
    await expect(tools.getByRole('status')).toHaveText('已保存')
    await capture(tools, 'web-quick-open-light.png')
    await tools.emulateMedia({ colorScheme: 'dark' })
    await expect(tools.locator('.quick-open')).toHaveCSS('color', 'rgb(224, 224, 224)')
    await capture(tools, 'web-quick-open-dark.png')
    await app.evaluate(({ shell }) => {
      ;(globalThis as any).__quickLinks = []
      shell.openExternal = async (url) => {
        ;(globalThis as any).__quickLinks.push(url)
      }
    })
    await tools.getByRole('button', { name: '文本搜索', exact: true }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__quickLinks))
      .toContain('https://www.bing.com/search?q=%E4%B8%AD%E6%96%87%20%26%3F%23')
    await expect.poll(() => tools.isClosed()).toBe(true)
    tools = await launch('web-quick-open')
    await expect(tools.getByLabel('启用百度')).not.toBeChecked()
    await tools.getByLabel('启用百度').check()
    await tools.getByLabel('搜索文字').fill('native-menu')
    await tools.getByRole('button', { name: '文本搜索', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('quick-menu.html'))
      )
      .toBe(true)
    const menu = app
      .context()
      .pages()
      .find((page) => page.url().includes('quick-menu.html'))!
    await expect(menu.getByRole('menuitem')).toHaveText(['百度', 'Bing'])
    expect(await menu.evaluate(() => innerWidth)).toBeLessThanOrEqual(260)
    await menu.getByRole('menuitem', { name: 'Bing', exact: true }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__quickLinks))
      .toContain('https://www.bing.com/search?q=native-menu')
    await expect.poll(() => tools.isClosed()).toBe(true)
    await expect.poll(() => menu.isClosed()).toBe(true)
    tools = await launch('web-quick-open')
    await tools.getByLabel('启用百度').uncheck()
    await tools.getByRole('button', { name: '识图引擎', exact: true }).click()
    await tools.getByText('Google Lens', { exact: true }).locator('input').uncheck()
    await tools.getByRole('button', { name: '保存设置' }).click()
    // 使用纯色合成图片和本地响应替身，网络探测不上传桌面或用户图片。
    const image = await tools.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 32
      const context = canvas.getContext('2d')!
      context.fillStyle = '#059669'
      context.fillRect(0, 0, 32, 32)
      return canvas.toDataURL()
    })
    await app.evaluate(({ net }) => {
      net.request = () => {
        const { EventEmitter } = process.mainModule!.require('node:events'),
          request = new EventEmitter()
        request.setHeader = () => {}
        request.abort = () => {}
        request.end = (body) => {
          ;(globalThis as any).__imageForm = body.toString().includes('name="imageBin"')
          queueMicrotask(() =>
            request.emit(
              'redirect',
              302,
              'GET',
              'https://www.bing.com/images/search?insightsToken=synthetic'
            )
          )
        }
        return request
      }
    })
    await main.evaluate(
      async ({ plugin, image }) =>
        window.tabdo.launch({
          path: plugin!.path,
          type: 'plugin',
          featureCode: 'web-search-image',
          param: { type: 'img', payload: image }
        }),
      { plugin, image }
    )
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__quickLinks))
      .toContain('https://www.bing.com/images/search?insightsToken=synthetic')
    expect(await app.evaluate(() => (globalThis as any).__imageForm)).toBe(true)
    await expect.poll(() => tools.isClosed()).toBe(true)
    await main.evaluate(
      async ({ plugin }) =>
        window.tabdo.launch({
          path: plugin!.path,
          type: 'plugin',
          featureCode: 'web-search-text',
          param: { type: 'over', payload: 'matched & 中文' }
        }),
      { plugin }
    )
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__quickLinks))
      .toContain('https://www.bing.com/search?q=matched%20%26%20%E4%B8%AD%E6%96%87')
    tools = await launch('screen-recorder')
    await expect(tools.locator('.source').first()).toBeVisible({ timeout: 20000 })
    await expect(tools.getByLabel('显示鼠标')).toBeChecked()
    await capture(tools, 'screen-recorder.png')
    const output = path.join(temporary, 'fixture-recording.mp4')
    // 捕获本测试创建的纯色窗口，避免录入用户桌面；真实走原生录制和 MP4 封装。
    const fixtureSource = await app.evaluate(
      async ({ BrowserWindow, desktopCapturer, dialog, shell }) => {
        shell.showItemInFolder = (file) => {
          ;(globalThis as any).__recordRevealed = file
        }
        const fixture = new BrowserWindow({
          width: 640,
          height: 400,
          title: 'Recorder Synthetic Fixture',
          webPreferences: { nodeIntegration: false }
        })
        await fixture.loadURL(
          'data:text/html,<title>Recorder Synthetic Fixture</title><body style="margin:0;background:%23059669;color:white;font:32px sans-serif">TabDo recorder fixture</body>'
        )
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 0, height: 0 }
        })
        // 原版录屏直接写入设置目录，若意外出现保存对话框立即使测试失败。
        dialog.showSaveDialog = async () => {
          throw new Error('Unexpected save dialog')
        }
        const cp = process.mainModule!.require('node:child_process'),
          originalSpawn = cp.spawn
        ;(globalThis as any).__recorderPids = []
        cp.spawn = (...args) => {
          const child = originalSpawn(...args)
          if (args[1]?.some((value) => String(value).includes('recorder-worker.cjs'))) {
            ;(globalThis as any).__recorderPids.push(child.pid)
            child.on('message', (message) => {
              if (message.type === 'ready') (globalThis as any).__recorderPids.push(message.pid)
            })
          }
          return child
        }
        ;(globalThis as any).__recordFixture = fixture
        return sources.find((source) => source.name === 'Recorder Synthetic Fixture')!.id
      },
      output
    )
    await tools.evaluate(
      ({ source, directory }) => {
        const bridge = (window as any).toolsRecorder,
          original = bridge.start
        bridge.start = (options, signal) =>
          original(
            { ...options, mode: 'window', source, countdown: 0, outputDirectory: directory },
            signal
          )
      },
      { source: fixtureSource, directory: temporary }
    )
    await tools.getByRole('button', { name: '开始录制', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('recorder-control.html'))
      )
      .toBe(true)
    const control = app
      .context()
      .pages()
      .find((page) => page.url().includes('recorder-control.html'))!
    // 真实录制控制条必须有任务栏入口及原生图标，不依赖已经退出的录屏页面。
    const controlId = await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes('recorder-control.html')
        )!.id
    )
    const controlIdentity = await readWindowIdentity(app, controlId, 'screen-recorder')
    expect(controlIdentity.iconMatchesFeature).toBe(true)
    expect(controlIdentity.skipTaskbar).toBe(false)
    if (process.platform === 'win32')
      expect(controlIdentity.nativeIcons.some((icon) => icon.sent && icon.present)).toBe(true)
    await expect(control.locator('#status')).toHaveText(/00:0[2-9]/, { timeout: 20000 })
    await expect.poll(() => tools.isClosed()).toBe(true)
    const workerPids = await app.evaluate(() => (globalThis as any).__recorderPids)
    expect(workerPids).toHaveLength(2)
    await control.getByRole('button', { name: '停止', exact: true }).click()
    await expect.poll(() => control.isClosed(), { timeout: 20000 }).toBe(true)
    const recordings = (await fs.readdir(temporary)).filter(
      (file) => file.startsWith('录屏助手_') && file.endsWith('.mp4')
    )
    expect(recordings).toHaveLength(1)
    await fs.rename(path.join(temporary, recordings[0]), output)
    const bytes = await fs.readFile(output)
    expect(bytes.length).toBeGreaterThan(1000)
    expect(bytes.subarray(4, 8).toString()).toBe('ftyp')
    expect(bytes.includes(Buffer.from('moov'))).toBe(true)
    expect(bytes.includes(Buffer.from('mdat'))).toBe(true)
    await expect
      .poll(() =>
        app.evaluate(
          (_electron, pids) =>
            pids.some((pid) => {
              try {
                process.kill(pid, 0)
                return true
              } catch {
                return false
              }
            }),
          workerPids
        )
      )
      .toBe(false)
    await app.evaluate(() => {
      ;(globalThis as any).__recordFixture.destroy()
    })
    // 完成后可以立即再进入，且没有上次会话继续录制。
    tools = await launch('screen-recorder')
    await expect(tools.locator('.source').first()).toBeVisible()
    await expect(tools.getByRole('status')).toHaveCount(0)
    await tools.evaluate((directory) => {
      const bridge = (window as any).toolsRecorder,
        original = bridge.start
      bridge.start = (options, signal) =>
        original({ ...options, countdown: 5, outputDirectory: directory }, signal)
    }, temporary)
    await tools.getByRole('button', { name: '开始录制', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('recorder-countdown.html'))
      )
      .toBe(true)
    const countdown = app
      .context()
      .pages()
      .find((page) => page.url().includes('recorder-countdown.html'))!
    await expect(countdown.locator('#number')).toHaveText(/[1-5]/)
    await app.evaluate(({ app }) => {
      const { createRequire } = process.mainModule!.require('node:module')
      const { uIOhook, UiohookKey } = createRequire(app.getAppPath() + '/package.json')(
        'uiohook-napi'
      )
      uIOhook.keyTap(UiohookKey.Escape)
    })
    await expect.poll(() => countdown.isClosed() && tools.isClosed()).toBe(true)
    expect(await fs.readFile(output)).toEqual(bytes)
    expect(await app.evaluate(() => (globalThis as any).__recorderPids)).toHaveLength(2)
    // 区域入口取消后不启动工作进程，也不遗留选择窗口或旧工具页面。
    tools = await launch('screen-recorder')
    await expect(tools.locator('.source').first()).toBeVisible()
    await tools.getByRole('tab', { name: '区域录制', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('recorder-region.html'))
      )
      .toBe(true)
    const selection = app
      .context()
      .pages()
      .find((page) => page.url().includes('recorder-region.html'))!
    await expect(selection.getByText('拖动调整录制区域 · Enter 开始 · Esc 取消')).toBeVisible()
    await selection.keyboard.press('Escape').catch((error) => {
      if (!selection.isClosed()) throw error
    })
    await expect.poll(() => selection.isClosed() && tools.isClosed()).toBe(true)
    expect(await app.evaluate(() => (globalThis as any).__recorderPids)).toHaveLength(2)
  } finally {
    await fs.writeFile(testInfo.outputPath('recorder-web.log'), logs.join(''))
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
