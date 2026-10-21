import { test, expect, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('performance: repeated tool switches and panel sessions release resources', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-performance-'))
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
  const timings: { operation: string; ms: number }[] = []
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
    const pluginPath = await main.evaluate(
      async () =>
        (await window.tabdo.getAllPlugins()).find((plugin) => plugin.name === 'system')!.path
    )
    await app.evaluate(({ app }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      db.dbPut('auto-detach-plugin', [])
      const wm = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      wm.getMainWindow().show()
      wm.getMainWindow().focus()
    })
    /**
     * 记录真实 Electron 进程工作集与插件 Session 的 preload 注册数。
     * @returns 本次资源快照。
     */
    async function snapshot(): Promise<{
      workingSetKB: number
      contents: number
      cachedViews: number
      preloads: number
    }> {
      return app.evaluate(({ app, webContents }) => {
        const manager = process.mainModule!.require(
          app.getAppPath() + '/src/main/managers/pluginManager.ts'
        ).default
        const current = manager.getCurrentPluginView()?.webContents
        return {
          workingSetKB: app
            .getAppMetrics()
            .reduce((sum, metric) => sum + metric.memory.workingSetSize, 0),
          contents: webContents.getAllWebContents().length,
          cachedViews: manager.pluginViews.length,
          preloads: current?.session.getPreloadScripts().length ?? 0
        }
      })
    }
    const idle = await snapshot()
    const registrations: number[] = []
    let current: Page | undefined
    for (let round = 0; round < 6; round++) {
      const old = current
      const before = new Set(app.context().pages())
      const featureCode = round % 2 === 0 ? 'web-quick-open' : 'qrcode-scan'
      const start = performance.now()
      await main.evaluate(
        async ({ pluginPath, featureCode }) => {
          await window.tabdo.launch({ path: pluginPath, type: 'plugin', featureCode })
        },
        { pluginPath, featureCode }
      )
      await expect
        .poll(() => {
          current = app
            .context()
            .pages()
            .find((page) => !before.has(page) && page.url().startsWith('http://127.0.0.1:15178'))
          return !!current
        })
        .toBe(true)
      await expect(
        current!.locator(round % 2 === 0 ? '.quick-open .site' : '.qr-page').first()
      ).toBeVisible()
      timings.push({ operation: featureCode, ms: performance.now() - start })
      if (old) await expect.poll(() => old.isClosed()).toBe(true)
      registrations.push((await snapshot()).preloads)
    }
    const active = await snapshot()
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
        .default.hidePluginView()
    })
    await expect.poll(() => current!.isClosed()).toBe(true)
    const classification = await app.evaluate(async ({ app }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts'
      ).default
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/clipboardManager.ts'
      ).default
      for (let index = 0; index < 1040; index++) {
        const saved = await db.promises.put({
          _id: `CLIPBOARD/performance-${index}`,
          type: 'text',
          hash: `perf-${index}`,
          content: index === 0 ? 'x'.repeat(512 * 1024) : '普通性能测试文本',
          timestamp: Date.now() + index
        })
        if (!saved.ok) throw new Error('Performance clipboard fixture was not saved')
      }
      const result = await manager.getHistory(1, 20)
      const previous = await db.promises.get('CLIPBOARD/performance-1')
      await db.promises.put({
        ...previous,
        content: 'https://example.com/performance-cache-change'
      })
      const changed = await manager.getHistory(1, 20, 'performance-cache-change')
      return {
        total: result.total,
        size: manager.categoryCache.size,
        changedCategory: changed.items[0]?.category,
        retainsText: [...manager.categoryCache.values()].some((entry) => 'content' in entry)
      }
    })
    expect(classification.total).toBeGreaterThanOrEqual(1040)
    expect(classification.size).toBeLessThanOrEqual(1024)
    expect(classification.retainsText).toBe(false)
    expect(classification.changedCategory).toBe('link')
    for (let round = 0; round < 6; round++) {
      const before = new Set(app.context().pages())
      const start = performance.now()
      const control = round % 2 === 0
      const launching = control
        ? app.evaluate(async ({ app }, pluginPath) => {
            const commands = process.mainModule!.require(
              app.getAppPath() + '/src/main/api/renderer/commands.ts'
            ).default
            // 对照保留的页面启动链，不改产品开关或线上路由。
            commands.launchParam = {
              code: 'web-search-text',
              type: 'over',
              payload: 'performance-menu'
            }
            return await commands.preparePluginLaunch(
              { path: pluginPath, featureCode: 'web-search-text' },
              { name: 'system' }
            )
          }, pluginPath)
        : main.evaluate(
            async (pluginPath) =>
              window.tabdo.launch({
                path: pluginPath,
                type: 'plugin',
                featureCode: 'web-search-text',
                param: { type: 'over', payload: 'performance-menu' }
              }),
            pluginPath
          )
      let menu: Page | undefined
      await expect
        .poll(() => {
          menu = app
            .context()
            .pages()
            .find((page) => !page.isClosed() && page.url().includes('quick-menu.html'))
          return !!menu
        })
        .toBe(true)
      await expect(menu!.getByRole('menuitem').first()).toBeVisible()
      if (!control)
        expect(
          app
            .context()
            .pages()
            .filter((page) => !before.has(page) && page.url().startsWith('http://127.0.0.1:15178'))
        ).toHaveLength(0)
      timings.push({
        operation: control ? 'text-search-menu-page-control' : 'text-search-menu',
        ms: performance.now() - start
      })
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().includes('quick-menu.html'))
          ?.close()
      })
      await launching
      await expect.poll(() => menu!.isClosed()).toBe(true)
      await expect
        .poll(
          () =>
            app
              .context()
              .pages()
              .filter((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178'))
              .length
        )
        .toBe(0)
    }
    // 以固定 600ms 系统复制延迟做同进程对照，只替换系统输入边界。
    await app.evaluate(({ app }) => {
      const panel = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/superPanelManager.ts'
      ).default
      const clipboard = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/clipboardManager.ts'
      ).default
      const native = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/native/index.ts'
      )
      ;(globalThis as any).__perfPrepare = panel.prepareWindow.bind(panel)
      ;(globalThis as any).__perfCopy = native.WindowManager.simulateKeyboardTap
      ;(globalThis as any).__perfWait = clipboard.waitForNextCopiedContent
      native.WindowManager.simulateKeyboardTap = () => true
      clipboard.waitForNextCopiedContent = () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                type: 'text',
                data: 'performance selection',
                sequence: 100,
                timestamp: Date.now()
              }),
            600
          )
        )
    })
    for (let round = 0; round < 6; round++) {
      await app.evaluate(({ app }) => {
        const panel = process.mainModule!.require(
          app.getAppPath() + '/src/main/core/superPanelManager.ts'
        ).default
        panel.hideWindow()
        panel.releaseIdleWindow()
      })
      const start = performance.now()
      await app.evaluate(
        ({ app }, parallel) => {
          const panel = process.mainModule!.require(
            app.getAppPath() + '/src/main/core/superPanelManager.ts'
          ).default
          panel.prepareWindow = parallel ? (globalThis as any).__perfPrepare : () => {}
          panel.capturePending = true
          void panel.onMouseTriggerAsync({ x: 160, y: 160 }, null, ++panel.triggerRevision)
        },
        round % 2 === 1
      )
      let panelPage: Page | undefined
      await expect
        .poll(() => {
          panelPage = app
            .context()
            .pages()
            .find((page) => !page.isClosed() && page.url().includes('super-panel.html'))
          return !!panelPage
        })
        .toBe(true)
      await expect(panelPage!.locator('.search-list .list-item').first()).toBeVisible()
      timings.push({
        operation: round % 2 === 1 ? 'selection-parallel' : 'selection-sequential-control',
        ms: performance.now() - start
      })
    }
    await app.evaluate(({ app }) => {
      const panel = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/superPanelManager.ts'
      ).default
      const clipboard = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/clipboardManager.ts'
      ).default
      const native = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/native/index.ts'
      )
      panel.prepareWindow = (globalThis as any).__perfPrepare
      native.WindowManager.simulateKeyboardTap = (globalThis as any).__perfCopy
      clipboard.waitForNextCopiedContent = (globalThis as any).__perfWait
      panel.hideWindow()
    })
    await expect
      .poll(() =>
        app.evaluate(({ app }) => {
          const panel = process.mainModule!.require(
            app.getAppPath() + '/src/main/core/superPanelManager.ts'
          ).default
          return panel.currentClipboardContent === null && panel.pendingMessages.length === 0
        })
      )
      .toBe(true)
    // 验证真实闲置计时器，不用主动 GC 或修改产品回收时限制造内存收益。
    await expect
      .poll(
        () =>
          app.evaluate(
            ({ app }) =>
              process.mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
                .default.superPanelWindow === null
          ),
        { timeout: 40000, intervals: [1000] }
      )
      .toBe(true)
    const reclaimed = await snapshot()
    expect(reclaimed.contents).toBe(idle.contents)
    await app.evaluate(async ({ BrowserWindow }) => {
      const fixture = new BrowserWindow({ width: 180, height: 100, show: false, skipTaskbar: true })
      await fixture.loadURL('data:text/html,<body>Performance focus fixture</body>')
      ;(globalThis as any).__performanceFocusFixture = fixture
    })
    // 用真实主渲染匹配链测量面板首开和复用，不改写原生复制行为。
    for (let round = 0; round < 3; round++) {
      // 用没有宿主失焦恢复逻辑的测试窗口交接焦点，仍保留面板真实 blur 行为。
      await app.evaluate(() => {
        const fixture = (globalThis as any).__performanceFocusFixture
        fixture.show()
        fixture.focus()
      })
      await expect
        .poll(() => app.evaluate(() => (globalThis as any).__performanceFocusFixture.isFocused()))
        .toBe(true)
      const start = performance.now()
      await app.evaluate(({ app }) => {
        const panel = process.mainModule!.require(
          app.getAppPath() + '/src/main/core/superPanelManager.ts'
        ).default
        panel.showWindow(160, 160)
        panel.requestSearch({ type: 'text', text: '性能审查测试' })
      })
      let panelPage: Page | undefined
      await expect
        .poll(() => {
          panelPage = app
            .context()
            .pages()
            .find((page) => page.url().includes('super-panel.html'))
          return !!panelPage
        })
        .toBe(true)
      try {
        await expect(panelPage!.locator('.search-list .list-item').first()).toBeVisible()
      } catch (error) {
        console.log(
          'PANEL DIAGNOSTIC ' +
            JSON.stringify(
              await app.evaluate(({ app }) => {
                const panel = process.mainModule!.require(
                  app.getAppPath() + '/src/main/core/superPanelManager.ts'
                ).default
                return {
                  visible: panel.requestedVisible,
                  ready: panel.windowReady,
                  request: panel.activeSearchRequestId,
                  pending: panel.pendingMessages.length,
                  focused: panel.superPanelWindow?.isFocused()
                }
              })
            )
        )
        throw error
      }
      timings.push({
        operation: round === 0 ? 'panel-cold' : 'panel-warm',
        ms: performance.now() - start
      })
      await app.evaluate(({ app }) => {
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
          .default.hideWindow()
      })
    }
    await app.evaluate(() => (globalThis as any).__performanceFocusFixture.destroy())
    const released = await snapshot()
    const report = { idle, active, reclaimed, released, classification, registrations, timings }
    await fs.writeFile(testInfo.outputPath('performance.json'), JSON.stringify(report, null, 2))
    console.log('PERFORMANCE ' + JSON.stringify(report))
    expect(registrations.every((count) => count === 1)).toBe(true)
    expect(released.cachedViews).toBe(0)
  } finally {
    await fs.writeFile(testInfo.outputPath('timings.json'), JSON.stringify(timings, null, 2))
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
