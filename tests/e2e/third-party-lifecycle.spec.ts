import { test, expect, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('TabDo third-party sessions release memory and preserve finite tasks and independent windows', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-third-party-'))
  const pluginPath = path.join(temporary, 'fixture')
  await fs.mkdir(pluginPath)
  await fs.writeFile(
    path.join(pluginPath, 'plugin.json'),
    JSON.stringify({
      name: 'session-fixture',
      title: '第三方会话验证',
      version: '1.0.0',
      lifecycle: 'session-v1',
      main: 'index.html',
      preload: 'preload.js',
      providers: { echo: { type: 'translation', label: 'session echo', description: 'fixture' } },
      features: [{ code: 'session', cmds: ['会话验证'] }]
    })
  )
  await fs.writeFile(
    path.join(pluginPath, 'index.html'),
    '<!doctype html><meta charset="utf-8"><h1>TabDo plugin session</h1><p>Stable body ready</p>'
  )
  await fs.writeFile(
    path.join(pluginPath, 'child.html'),
    '<!doctype html><meta charset="utf-8"><h1>Independent child session</h1>'
  )
  await fs.writeFile(
    path.join(pluginPath, 'preload.js'),
    "window.tabdo.registerProvider('echo', async input => { await new Promise(resolve => setTimeout(resolve, input.text === 'slow' ? 600 : 50)); return { text: input.text } })"
  )
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
  const logPath = testInfo.outputPath('main-process.log')
  fsSync.mkdirSync(path.dirname(logPath), { recursive: true })
  app.process().stdout?.on('data', (data) => fsSync.appendFileSync(logPath, data))
  app.process().stderr?.on('data', (data) => fsSync.appendFileSync(logPath, data))
  try {
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((plugin) => plugin.name === 'system')
        )
      )
      .toBe(true)
    await app.evaluate(({ app }, pluginPath) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      db.dbPut('plugins', [
        ...db.dbGet('plugins'),
        { name: 'session-fixture', title: '第三方会话验证', path: pluginPath, version: '1.0.0' }
      ])
      // 旧保活选择不再使页面留驻，测试不会写入真实资料。
      db.dbPut('out-kill-plugin', [])
      db.dbPut('auto-start-plugin', ['session-fixture'])
      const wm = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      wm.restorePreviousFocus = () => {}
    }, pluginPath)
    /**
     * 打开真实第三方插件正文并等待稳定内容。
     * @returns 当前全新插件页面。
     */
    async function open(): Promise<Page> {
      const before = new Set(app.context().pages())
      await main.evaluate(
        (pluginPath) =>
          window.tabdo.launch({ path: pluginPath, type: 'plugin', featureCode: 'session' }),
        pluginPath
      )
      await app.evaluate(({ app }) => {
        const win = process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
          .default.getMainWindow()
        win.show()
        win.focus()
      })
      let page: Page | undefined
      await expect
        .poll(() => {
          page = app
            .context()
            .pages()
            .find((item) => !before.has(item) && item.url().endsWith('/index.html'))
          return !!page
        })
        .toBe(true)
      await expect(page!.getByText('Stable body ready')).toBeVisible()
      return page!
    }
    /**
     * 隐藏宿主，走真实前台退出事件。
     * @returns 宿主隐藏完成后的 Promise。
     */
    async function hide(): Promise<void> {
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
          .default.getMainWindow()
          .hide()
      )
    }
    /**
     * 记录页面数和实际 Electron 工作集，避免把单次工作集当作堆存活指标。
     * @returns 当前页面、缓存和内存快照。
     */
    async function snapshot(): Promise<any> {
      return app.evaluate(({ app, webContents }) => {
        const manager = process.mainModule!.require(
          app.getAppPath() + '/src/main/managers/pluginManager.ts'
        ).default
        return {
          contents: webContents.getAllWebContents().length,
          cached: manager.pluginViews.length,
          workingSetKB: app
            .getAppMetrics()
            .reduce((sum, metric) => sum + metric.memory.workingSetSize, 0)
        }
      })
    }
    // 并发 provider 共用一次隐藏装载，最后一次调用结束后关闭隐藏运行时。
    const providerResult = await app.evaluate(async ({ app }) => {
      const providers = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/provider/providerManager.ts'
      ).default
      const id = providers
        .getAllProviders('translation')
        .find((item: any) => item.pluginName === 'session-fixture').id
      providers.setEnabled(id, true)
      return Promise.all([
        providers.invoke('translation', { text: 'slow' }, { providerId: id }),
        providers.invoke('translation', { text: 'fast' }, { providerId: id })
      ])
    })
    expect(providerResult).toEqual([{ text: 'slow' }, { text: 'fast' }])
    await expect.poll(async () => (await snapshot()).cached).toBe(0)
    await expect.poll(async () => (await snapshot()).contents).toBe(1)
    const observations: any[] = [await snapshot()]
    for (let round = 0; round < 8; round++) {
      const page = await open()
      await page.evaluate(() => {
        const win = window as any
        win.buffer = new Uint8Array(32 * 1024 * 1024).fill(1)
        win.tabdo.lifecycle.addCleanup(() => {
          win.buffer = null
        })
      })
      observations.push(await snapshot())
      await hide()
      await expect.poll(() => page.isClosed()).toBe(true)
      expect((await snapshot()).cached).toBe(0)
    }
    const first = await open()
    await first.evaluate(() => {
      const win = window as any
      win.savedTask = win.tabdo.lifecycle.runTask(async (scope: any) => {
        scope.addCleanup(() => {
          win.taskReleased = true
        })
        await new Promise((resolve) => setTimeout(resolve, 2000))
        win.tabdo.dbStorage.setItem('saved', 'old task finished')
      }, 10000)
    })
    await hide()
    expect(first.isClosed()).toBe(false)
    expect(await first.evaluate(() => (window as any).tabdo.lifecycle.signal.aborted)).toBe(true)
    const second = await open()
    await expect.poll(() => first.isClosed()).toBe(true)
    expect(second.isClosed()).toBe(false)
    expect(await second.evaluate(() => (window as any).tabdo.dbStorage.getItem('saved'))).toBe(
      'old task finished'
    )
    // 子窗口有独立前台，父页面退出不会结束仍然可见的子窗口。
    await second.evaluate(() =>
      (window as any).tabdo.createBrowserWindow('child.html', { width: 420, height: 300 })
    )
    let child: Page | undefined
    await expect
      .poll(() => {
        child = app
          .context()
          .pages()
          .find((page) => page.url().endsWith('/child.html'))
        return !!child
      })
      .toBe(true)
    await expect(child!.getByText('Independent child session')).toBeVisible()
    await hide()
    await expect.poll(() => second.isClosed()).toBe(true)
    expect(child!.isClosed()).toBe(false)
    await app.evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows())
        if (win.webContents.getURL().endsWith('/child.html')) win.minimize()
    })
    await expect.poll(() => child!.isClosed()).toBe(true)
    const timed = await open()
    await timed.evaluate(() => {
      const win = window as any
      void win.tabdo.lifecycle
        .runTask((scope: any) => {
          scope.addCleanup(() => win.tabdo.dbStorage.setItem('timeoutCleaned', true))
          return new Promise(() => {})
        }, 100)
        .catch(() => {})
    })
    await hide()
    await expect.poll(() => timed.isClosed()).toBe(true)
    const final = await open()
    expect(
      await final.evaluate(() => (window as any).tabdo.dbStorage.getItem('timeoutCleaned'))
    ).toBe(true)
    await final.screenshot({ path: testInfo.outputPath('third-party-session.png') })
    await hide()
    await expect.poll(() => final.isClosed()).toBe(true)
    observations.push(await snapshot())
    expect(observations.at(-1).contents).toBe(1)
    await fs.writeFile(
      testInfo.outputPath('third-party-memory.json'),
      JSON.stringify(observations, null, 2)
    )
  } finally {
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
