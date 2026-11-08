import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

test('演示录屏控制条连续三次冷启动具有可用正文', async ({
  browserName: _browserName,
  request
}, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(root, '.local/source-preview-startup-'))
  const observations: unknown[] = []
  const health = await request.get('http://127.0.0.1:15178/__tabdo_source_preview_ready')
  expect(await health.json()).toEqual({ ready: true })
  for (const url of [
    'http://127.0.0.1:5174',
    'http://127.0.0.1:15177',
    'http://127.0.0.1:15178/presentation.html'
  ]) {
    expect((await request.get(url)).ok(), url).toBe(true)
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let app: ElectronApplication | undefined
    const logs: string[] = []
    try {
      const env = {
        ...process.env,
        TABDO_E2E: '1',
        TABDO_SOURCE_PREVIEW: '1',
        TABDO_DATA_ROOT: path.join(temporary, String(attempt), 'data'),
        TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, String(attempt), 'legacy'),
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
        TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
      }
      delete env.ELECTRON_RUN_AS_NODE
      app = await electron.launch({
        args: [path.join(root, 'scripts/preview-main.cjs')],
        cwd: root,
        env
      })
      app.process().stdout?.on('data', (value) => logs.push(String(value)))
      app.process().stderr?.on('data', (value) => logs.push(String(value)))
      // 在创建覆盖层之前观察错误，不能等按钮出现后才开始监听初始化失败。
      app.context().on('page', (page) => {
        page.on('pageerror', (error) => logs.push(`PAGE ERROR ${page.url()} ${error.stack}`))
        page.on('crash', () => logs.push(`PAGE CRASH ${page.url()}`))
        page.on('console', (event) => {
          if (event.type() === 'error') logs.push(`CONSOLE ${page.url()} ${event.text()}`)
        })
        page.on('requestfailed', (request) =>
          logs.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`)
        )
      })
      const main = await app.firstWindow()
      await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 30000 })
      await expect
        .poll(
          () =>
            app!
              .context()
              .pages()
              .some((page) => page.url().startsWith('http://127.0.0.1:15177')),
          { timeout: 30000 }
        )
        .toBe(true)
      const settings = app
        .context()
        .pages()
        .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
      await expect(settings.getByText('超级面板', { exact: true }).first()).toBeVisible({
        timeout: 30000
      })
      const started = Date.now()
      await main.evaluate(async () => {
        const plugin = (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')!
        await window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'presentation-recorder'
        })
      })
      await expect
        .poll(
          () =>
            app!
              .context()
              .pages()
              .some((page) => page.url().includes('windowType=hud-overlay')),
          { timeout: 30000 }
        )
        .toBe(true)
      const hud = app
        .context()
        .pages()
        .find((page) => page.url().includes('windowType=hud-overlay'))!
      try {
        await expect(hud.getByRole('button', { name: '录制', exact: true })).toBeVisible({
          timeout: 30000
        })
        await expect(hud.getByRole('button', { name: '演示编辑器', exact: true })).toBeEnabled()
        observations.push({ attempt, durationMs: Date.now() - started, url: hud.url() })
      } finally {
        observations.push(
          await hud
            .evaluate(() => ({
              readyState: document.readyState,
              title: document.title,
              body: document.body?.innerText.slice(0, 1000),
              root: document.getElementById('root')?.innerHTML.slice(0, 1000),
              scripts: [...document.scripts].map((script) => script.src)
            }))
            .catch((error) => ({ diagnosticError: String(error) }))
        )
      }
    } finally {
      await testInfo.attach(`startup-${attempt}.log`, {
        body: Buffer.from(logs.join('\n')),
        contentType: 'text/plain'
      })
      await testInfo.attach('startup-observations.json', {
        body: Buffer.from(JSON.stringify(observations, null, 2)),
        contentType: 'application/json'
      })
      await app?.close().catch(() => undefined)
    }
  }
  // 冷启动资料仅属于本用例；通过后回收，失败时保留以供诊断。
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
})
