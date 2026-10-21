import { expect, test, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('Lens submits the image in an independent browser session and releases the handoff', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(60000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-lens-e2e-'))
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
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await app.evaluate(async ({ app, BrowserWindow, shell, nativeImage }) => {
      const state = globalThis as any
      state.__lensTest = {}
      const browser = new BrowserWindow({
        show: false,
        webPreferences: {
          partition: 'lens-independent-e2e',
          nodeIntegration: false,
          contextIsolation: true
        }
      })
      state.__lensBrowser = browser
      // 只在此隔离浏览器拦截 Google 请求，真实执行一次性页面、CSP 和 multipart 表单导航。
      await browser.webContents.session.protocol.handle('https', async (request) => {
        const url = new URL(request.url)
        if (url.hostname === 'lens.google.com' && url.pathname === '/v3/upload') {
          const form = await request.formData(),
            file = form.get('encoded_image') as File
          const bytes = Buffer.from(await file.arrayBuffer())
          state.__lensTest.upload = {
            type: file.type,
            name: file.name,
            prefix: bytes.subarray(0, 2).toString('hex'),
            dimensions: form.get('processed_image_dimensions'),
            origin: request.headers.get('origin')
          }
          state.__lensTest.image = 'data:image/jpeg;base64,' + bytes.toString('base64')
          return new Response(null, {
            status: 303,
            headers: { location: 'https://www.google.com/search?lens-fixture=1' }
          })
        }
        if (url.hostname === 'www.google.com' && url.pathname === '/search')
          return new Response(
            '<!doctype html><title>Lens fixture result</title><img id="uploaded" src="' +
              state.__lensTest.image +
              '"><p>识图结果</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        return new Response('fixture only', { status: 404 })
      })
      shell.openExternal = async (url) => {
        state.__lensTest.handoff = url
        void browser.loadURL(url).catch(() => {})
      }
      const { launchWebQuickOpen } = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/webQuickOpen.ts'
      )
      const bitmap = Buffer.alloc(64 * 40 * 4, 180)
      const image = nativeImage.createFromBitmap(bitmap, { width: 64, height: 40 }).toDataURL()
      await launchWebQuickOpen(123, {
        id: 'lens-independent',
        kind: 'image',
        image,
        config: { sites: [], imageEngines: ['google-lens'] }
      })
    })
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('lens-fixture=1'))
      )
      .toBe(true)
    const browser = app
      .context()
      .pages()
      .find((page) => page.url().includes('lens-fixture=1'))!
    await expect(browser.getByText('识图结果', { exact: true })).toBeVisible()
    await expect
      .poll(() =>
        browser.locator('#uploaded').evaluate((image: HTMLImageElement) => image.naturalWidth)
      )
      .toBe(64)
    const state = await app.evaluate(() => (globalThis as any).__lensTest)
    expect(state.upload).toMatchObject({
      type: 'image/jpeg',
      prefix: 'ffd8',
      dimensions: '64,40'
    })
    // Electron 自定义协议 Request 可省略 Origin，但不能把回环地址作为同源凭据转发。
    expect([null, 'null']).toContain(state.upload.origin)
    await expect(fetch(state.handoff)).rejects.toThrow()
    await fs.writeFile(
      testInfo.outputPath('lens-browser.json'),
      JSON.stringify({ ...state.upload, bridgeReleased: true }, null, 2)
    )
    await app.evaluate(() => (globalThis as any).__lensBrowser.destroy())
  } finally {
    await fs.writeFile(testInfo.outputPath('lens-browser.log'), logs.join(''))
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
