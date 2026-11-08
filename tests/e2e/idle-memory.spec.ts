import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('演示录屏及日常工具退出后回收所属页面和运行时，记录同机闲时内存', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(480000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-idle-memory-'))
  let app: ElectronApplication | undefined
  const reports: unknown[] = []
  const logs: string[] = []
  const timings: Array<{ scenario: string; phase: string; ms: number }> = []
  let timingSummary: { medianWarm: number; medianRecovered: number } | null = null
  try {
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    const plugin = await main.evaluate(
      async () => (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')!
    )
    // 等首次设置装载完再关闭，基线只包含宿主常驻页。
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().includes('15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().includes('15177'))!
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible({
      timeout: 30000
    })
    const settingsOwner = await settings.evaluate(() => window.tabdo.getWebContentsId())
    await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner)
          .close(),
      settingsOwner
    )
    await expect.poll(() => settings.isClosed()).toBe(true)
    await main.waitForTimeout(2000)
    /**
     * 采集同一进程的真实工作集、私有内存、主进程堆和存活页面，不强制GC。
     * @param stage 测量阶段。
     * @returns 本应用全部Electron进程工作集字节总和；完整快照已加入报告。
     */
    async function snapshot(stage: string): Promise<number> {
      const report = await app!.evaluate(async ({ app, webContents, BrowserWindow }, stage) => {
        const commands = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/renderer/commands.ts'
        ).default
        const lifecycle = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/plugin/lifecycle.ts'
        ).default
        return {
          stage,
          time: Date.now(),
          main: await process.getProcessMemoryInfo(),
          heap: process.memoryUsage(),
          inputReferences: {
            launch: commands.getLaunchParam()?.payload?.length || 0,
            lifecycle: lifecycle.launchParam?.payload?.length || 0,
            lastMatch: commands.lastMatchState?.pastedImage?.length || 0
          },
          metrics: app
            .getAppMetrics()
            .map(({ pid, type, memory, serviceName }) => ({ pid, type, memory, serviceName })),
          pages: webContents
            .getAllWebContents()
            .map((page) => ({ id: page.id, url: page.getURL() })),
          windows: BrowserWindow.getAllWindows().map((window) => ({
            id: window.id,
            visible: window.isVisible(),
            minimized: window.isMinimized()
          }))
        }
      }, stage)
      const workingSetBytes = report.metrics.reduce(
        (sum, item) => sum + item.memory.workingSetSize * 1024,
        0
      )
      const privateBytes = report.metrics.reduce(
        (sum, item) => sum + item.memory.privateBytes * 1024,
        0
      )
      const idleGoal = ['settings-idle-15s', 'idle-35s', 'idle-65s'].includes(stage)
      const targets = idleGoal
        ? { workingSet: workingSetBytes < 100_000_000, privateCommit: privateBytes < 100_000_000 }
        : null
      // 100MB分别记录目标结果，不以工作集下降替代私有提交释放或中断后续资源/时延验收。
      reports.push({ ...report, workingSetBytes, privateBytes, targets })
      if (idleGoal)
        console.log(
          'IDLE_MEMORY_GOAL ' + JSON.stringify({ stage, workingSetBytes, privateBytes, targets })
        )
      await fs.writeFile(testInfo.outputPath('memory.json'), JSON.stringify(reports, null, 2))
      return workingSetBytes
    }
    await snapshot('baseline')
    /**
     * 从真实宿主入口测量设置正文可见耗时，排除初次Vite模块编译。
     * @param phase 热重开或闲置回收后重开。
     * @returns 正文已经可见的设置页面。
     */
    async function openSettings(phase: string): Promise<Page> {
      const started = performance.now()
      await app!.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
          .default.showSettings()
      )
      await expect
        .poll(() =>
          app!
            .context()
            .pages()
            .some((page) => page.url().includes('15177'))
        )
        .toBe(true)
      const page = app!
        .context()
        .pages()
        .find((page) => page.url().includes('15177'))!
      await expect(page.getByText('鼠标按键弹出', { exact: true })).toBeVisible({ timeout: 30000 })
      timings.push({ scenario: 'settings', phase, ms: performance.now() - started })
      return page
    }
    /**
     * 明确关闭当前独立页，等待所属WebContents退出后再进入下一次测量。
     * @param page 本次页面。
     * @returns 页面销毁完成后的Promise。
     */
    async function closePage(page: Page): Promise<void> {
      const owner = await page.evaluate(() => window.tabdo.getWebContentsId())
      await app!.evaluate(
        ({ app }, owner) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.getWindowByPluginWebContents(owner)
            .close(),
        owner
      )
      await expect.poll(() => page.isClosed()).toBe(true)
    }
    // 设置页反复打开真实正文后明确关闭，单独测量不依赖录屏顺带触发回收。
    for (let round = 0; round < 3; round++) {
      await closePage(await openSettings('warm'))
    }
    await main.waitForTimeout(15000)
    await snapshot('settings-idle-15s')
    for (let round = 0; round < 3; round++) {
      if (round > 0) await main.waitForTimeout(15000)
      await closePage(await openSettings('after-idle'))
    }
    for (let round = 0; round < 3; round++) {
      const hudStarted = performance.now()
      await main.evaluate(
        (plugin) =>
          window.tabdo.launch({
            path: plugin.path,
            type: 'plugin',
            featureCode: 'presentation-recorder'
          }),
        plugin
      )
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
      await expect(hud.getByRole('button', { name: '录制', exact: true })).toBeVisible({
        timeout: 30000
      })
      timings.push({
        scenario: 'presentation-hud',
        phase: round === 0 ? 'first' : 'warm',
        ms: performance.now() - hudStarted
      })
      // 验证串行打开复用同一临时分区，而不是只观察旧页面已经关闭。
      const partitions = await app.evaluate(({ webContents }) => {
        const seen = ((globalThis as any).__idleCaptureSessions ??= new Set())
        seen.add(
          webContents
            .getAllWebContents()
            .find((page) => page.getURL().includes('windowType=hud-overlay'))!.session
        )
        return seen.size
      })
      expect(partitions).toBe(process.env.TABDO_MEMORY_CONTROL === '1' ? round + 1 : 1)
      if (round === 1) {
        await hud.evaluate(async () => {
          const sources = await window.electronAPI.getSources({
            types: ['screen'],
            thumbnailSize: { width: 0, height: 0 }
          })
          await window.electronAPI.selectSource(sources[0])
        })
        await hud.getByRole('button', { name: '录制', exact: true }).click()
        await expect(hud.getByRole('button', { name: '停止', exact: true })).toBeVisible({
          timeout: 30000
        })
        await hud.waitForTimeout(1500)
        await hud.getByRole('button', { name: '停止', exact: true }).click()
      } else {
        await hud.getByRole('button', { name: '演示编辑器', exact: true }).click()
      }
      const tool = app
        .context()
        .pages()
        .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
      if (round === 1)
        await expect(
          tool.frameLocator('iframe').locator('.editor-preview-frame canvas').first()
        ).toBeVisible({ timeout: 60000 })
      else
        await expect(
          tool.frameLocator('iframe').getByRole('button', { name: '开始录制', exact: true })
        ).toBeVisible({ timeout: 60000 })
      await snapshot('presentation-active-' + round)
      const owner = await tool.evaluate(() => window.tabdo.getWebContentsId())
      await app.evaluate(
        ({ app }, owner) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.getWindowByPluginWebContents(owner)
            .close(),
        owner
      )
      await expect.poll(() => tool.isClosed(), { timeout: 15000 }).toBe(true)
      await expect.poll(() => hud.isClosed()).toBe(true)
      await expect
        .poll(
          () =>
            app!.evaluate(({ app }) =>
              process
                .mainModule!.require(app.getAppPath() + '/src/main/core/presentationRecorder.ts')
                .hasPresentationSessions()
            ),
          { timeout: 15000 }
        )
        .toBe(false)
      await snapshot('presentation-closed-' + round)
    }
    // 相邻工具也经过真实路由、正文装载和退出，避免只覆盖录屏入口。
    for (const [featureCode, selector] of [
      ['clipboard', '.clipboard-app'],
      ['qrcode-scan', '.qr-page'],
      ['web-quick-open', '.quick-open']
    ] as const) {
      await main.evaluate(
        ({ plugin, featureCode }) =>
          window.tabdo.launch({
            path: plugin.path,
            type: 'plugin',
            featureCode
          }),
        { plugin, featureCode }
      )
      await expect
        .poll(() =>
          app!
            .context()
            .pages()
            .some((page) => page.url().startsWith('http://127.0.0.1:15178'))
        )
        .toBe(true)
      const tool = app
        .context()
        .pages()
        .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
      await expect(tool.locator(selector).first()).toBeAttached()
      if (featureCode === 'web-quick-open') {
        // 实际分配16MiB连续输入串，由宿主两处参数和持久匹配内存副本持有。
        const allocated = await app.evaluate(({ app }) => {
          const commands = process.mainModule!.require(
            app.getAppPath() + '/src/main/api/renderer/commands.ts'
          ).default
          const api = process.mainModule!.require(
            app.getAppPath() + '/src/main/api/index.ts'
          ).default
          const image =
            'data:image/png;base64,' + Buffer.alloc(12 * 1024 * 1024, 90).toString('base64')
          const input = { type: 'img', payload: image }
          commands.launchParam = input
          api.setLaunchParam(input)
          commands.lastMatchState = {
            searchQuery: 'memory-fixture',
            // 持久记录遵守现有1MiB文档上限，大启动输入独立验证内存释放。
            pastedImage: 'data:image/png;base64,' + Buffer.alloc(256 * 1024, 90).toString('base64'),
            pastedText: null,
            pastedFiles: null,
            timestamp: Date.now()
          }
          commands.lastMatchStatePersisted = false
          commands.saveLastMatchState()
          if (!commands.lastMatchStatePersisted) throw new Error('匹配夹具未成功持久化')
          return image.length
        })
        expect(allocated).toBeGreaterThan(16 * 1024 * 1024)
        await tool.evaluate(() => {
          void window.toolsLifecycle.runTask(async () => {
            await new Promise<void>((resolve) => {
              ;(window as any).__finishMemoryTask = resolve
            })
          })
        })
      }
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
          .default.hidePluginView()
      )
      if (featureCode === 'web-quick-open') {
        const reclaimed = logs.filter((line) => line.includes('[IdleMemory] 已归还')).length
        await main.waitForTimeout(12000)
        expect(tool.isClosed()).toBe(false)
        expect(logs.filter((line) => line.includes('[IdleMemory] 已归还')).length).toBe(reclaimed)
        await snapshot('necessary-task-pending')
        expect(
          await app.evaluate(
            ({ app }) =>
              process
                .mainModule!.require(app.getAppPath() + '/src/main/api/renderer/commands.ts')
                .default.getLaunchParam().payload.length
          )
        ).toBeGreaterThan(16 * 1024 * 1024)
        // 从主进程释放旧页的已登记任务，不通过插件路径误操作新会话。
        const owner = await tool.evaluate(() => window.tabdo.getWebContentsId())
        await app.evaluate(({ webContents }, owner) => {
          void webContents
            .fromId(owner)!
            .executeJavaScript('window.__finishMemoryTask()')
            .catch(() => {})
        }, owner)
      }
      await expect.poll(() => tool.isClosed()).toBe(true)
      await snapshot(featureCode + '-closed')
    }
    await main.waitForTimeout(35000)
    await snapshot('idle-35s')
    if (process.platform === 'win32') {
      expect(logs.some((line) => /\[IdleMemory\] 已归还冷工作集 [1-9]/.test(line))).toBe(true)
    }
    expect(await app.evaluate(({ webContents }) => webContents.getAllWebContents().length)).toBe(1)
    expect(
      await app.evaluate(({ app }) => {
        const commands = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/renderer/commands.ts'
        ).default
        const lifecycle = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/plugin/lifecycle.ts'
        ).default
        return {
          launch: commands.getLaunchParam(),
          match: commands.lastMatchState,
          lifecycle: lifecycle.launchParam
        }
      })
    ).toEqual({ launch: null, match: null, lifecycle: null })
    await main.waitForTimeout(30000)
    await snapshot('idle-65s')
    // 回收后重新打开设置并写入隔离资料，证明宿主、IPC和数据库仍可正常使用。
    const hudRestart = performance.now()
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'presentation-recorder'
        }),
      plugin
    )
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().includes('windowType=hud-overlay'))
      )
      .toBe(true)
    const reopenedHud = app
      .context()
      .pages()
      .find((page) => page.url().includes('windowType=hud-overlay'))!
    await expect(reopenedHud.getByRole('button', { name: '录制', exact: true })).toBeVisible()
    timings.push({
      scenario: 'presentation-hud',
      phase: 'after-idle',
      ms: performance.now() - hudRestart
    })
    const restartedTool = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    await closePage(restartedTool)
    await expect.poll(() => reopenedHud.isClosed()).toBe(true)
    await openSettings('verification')
    const restored = await main.evaluate(async () => {
      const state = await window.tabdo.restoreLastMatch()
      return { query: state?.searchQuery, bytes: state?.pastedImage?.length || 0 }
    })
    expect(restored.query).toBe('memory-fixture')
    expect(restored.bytes).toBeGreaterThan(256 * 1024)
    await main.evaluate(() => window.tabdo.dbPut('idle-memory-preserved', { value: 'retained' }))
    expect(await main.evaluate(() => window.tabdo.dbGet('idle-memory-preserved'))).toEqual({
      value: 'retained'
    })
    await snapshot('settings-reopened')
    // 开启速度与内存联合验收：同实例热重开与回收后重开分别取中位数。
    const warm = timings
      .filter((item) => item.scenario === 'settings' && item.phase === 'warm')
      .map((item) => item.ms)
      .sort((a, b) => a - b)
    const recovered = timings
      .filter((item) => item.scenario === 'settings' && item.phase === 'after-idle')
      .map((item) => item.ms)
      .sort((a, b) => a - b)
    const medianWarm = warm[Math.floor(warm.length / 2)]
    const medianRecovered = recovered[Math.floor(recovered.length / 2)]
    timingSummary = { medianWarm, medianRecovered }
    expect(medianRecovered).toBeLessThan(3000)
    expect(medianRecovered).toBeLessThanOrEqual(Math.max(medianWarm * 2, medianWarm + 400))
  } finally {
    await fs.writeFile(
      testInfo.outputPath('reopen-timings.json'),
      JSON.stringify({ timings, timingSummary }, null, 2)
    )
    await fs.writeFile(testInfo.outputPath('memory.json'), JSON.stringify(reports, null, 2))
    await fs.writeFile(testInfo.outputPath('host.log'), logs.join(''))
    await app?.close().catch(() => {})
    // 只清理本测试创建的隔离目录，不读写正式配置。
    expect(path.resolve(temporary).startsWith(path.join(os.tmpdir(), 'tabdo-idle-memory-'))).toBe(
      true
    )
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 })
  }
})
