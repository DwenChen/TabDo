import {
  test,
  expect,
  _electron as electron,
  chromium,
  type Browser,
  type ElectronApplication
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'

/**
 * 为首次欢迎页的独立源码实例分配回环调试端口。
 * @returns 已释放的空闲端口号。
 */
async function availablePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

test('引导资源缺失不占用桌面，物理资源首帧回执后才显示并能退出', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(60000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-guide-startup-'))
  // 可对已同步预览的物理资源执行同一加载探针；Electron 主程序仍直接加载源码。
  const resources = process.env.TABDO_TEST_GUIDE_RESOURCE_ROOT || path.join(root, 'resources')
  const missing = path.join(temporary, 'missing')
  const scriptMissing = path.join(temporary, 'script-missing')
  await fs.mkdir(missing)
  await fs.mkdir(scriptMissing)
  for (const file of ['usage-guide.html', 'usage-guide.css', 'usage-guide-preload.cjs'])
    await fs.copyFile(path.join(resources, file), path.join(scriptMissing, file))
  let app: ElectronApplication | undefined
  try {
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
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    const application = app
    await expect((await app.firstWindow()).locator('.plugin-host')).toBeAttached()

    /**
     * 在源码主进程创建受控覆盖窗口，启动失败与结束结果只记录在本次测试内。
     * @param resourceRoot 本次探针加载的真实物理资源目录。
     * @returns 构造返回时是否已有覆盖窗口可见。
     */
    async function createProbe(resourceRoot: string): Promise<boolean> {
      return application.evaluate(
        ({ app, BrowserWindow }, { resourceRoot, workspace }) => {
          const { UsageGuideWalkthrough } = process.mainModule!.require(
            app.getAppPath() + '/src/main/core/usageGuideWalkthrough.ts'
          )
          const probe = { errors: [] as string[], finished: 0, controller: null as any }
          ;(global as any).__guideStartupProbe = probe
          probe.controller = new UsageGuideWalkthrough({
            workspace,
            resourceRoot,
            launchTool: async () => {
              throw new Error('启动探针不进入工具课程')
            },
            openSettings: async () => {
              throw new Error('启动探针不进入设置课程')
            },
            finish: () => {
              probe.finished++
            },
            fail: (message) => {
              probe.errors.push(message)
            }
          })
          return BrowserWindow.getAllWindows().some(
            (window) => window.getTitle() === 'TabDo 使用引导' && window.isVisible()
          )
        },
        { resourceRoot, workspace: temporary }
      )
    }

    expect(await createProbe(missing)).toBe(false)
    await expect
      .poll(() => application.evaluate(() => (global as any).__guideStartupProbe.errors.length))
      .toBe(1)
    expect(
      await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter((window) => window.getTitle() === 'TabDo 使用引导')
            .length
      )
    ).toBe(0)

    // 文档加载成功而脚本缺失也不能显示空白覆盖层；超时必须释放并给出诊断。
    expect(await createProbe(scriptMissing)).toBe(false)
    await expect
      .poll(() => application.evaluate(() => (global as any).__guideStartupProbe.errors.join('')), {
        timeout: 15000
      })
      .toContain('加载超时')
    expect(
      await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter((window) => window.getTitle() === 'TabDo 使用引导')
            .length
      )
    ).toBe(0)

    expect(await createProbe(resources)).toBe(false)
    await expect
      .poll(() =>
        application
          .context()
          .pages()
          .some((page) => page.url().endsWith('usage-guide.html'))
      )
      .toBe(true)
    const overlay = application
      .context()
      .pages()
      .find((page) => page.url().endsWith('usage-guide.html'))!
    await expect(overlay.getByRole('heading', { name: '在桌面上，亲手试一遍' })).toBeVisible()
    await expect(overlay.locator('#welcome .workspace')).toHaveText(temporary)
    expect(
      await overlay.locator('#welcome').evaluate((element) => getComputedStyle(element).position)
    ).toBe('fixed')
    await expect
      .poll(() =>
        application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (window) => window.getTitle() === 'TabDo 使用引导' && window.isVisible()
          )
        )
      )
      .toBe(true)
    await overlay.screenshot({ path: testInfo.outputPath('physical-guide-welcome.png') })
    await overlay.getByRole('button', { name: '暂不学习，退出引导', exact: true }).click()
    await expect
      .poll(() => application.evaluate(() => (global as any).__guideStartupProbe.finished))
      .toBe(1)
    expect(
      await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter((window) => window.getTitle() === 'TabDo 使用引导')
            .length
      )
    ).toBe(0)
  } finally {
    await app
      ?.evaluate(() => (global as any).__guideStartupProbe?.controller.dispose())
      .catch(() => {})
    await app?.close().catch(() => {})
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 })
  }
})

test('首次安装自动欢迎可拒绝，退出并重启后不重复弹出且正式资料保留', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-guide-first-run-'))
  const data = path.join(temporary, 'data')
  const desktop = path.join(temporary, 'Desktop')
  const runs = path.join(data, 'usage-guide/runs')
  const port = await availablePort()
  await fs.mkdir(desktop)
  await fs.writeFile(path.join(desktop, '桌面原件.txt'), 'preserved')
  let app: ElectronApplication | undefined
  let guideBrowser: Browser | undefined
  const logs: string[] = []
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TABDO_E2E: '1',
    TABDO_E2E_GUIDE_FIRST_RUN: '1',
    TABDO_E2E_GUIDE_DEBUG_PORT: String(port),
    TABDO_E2E_GUIDE_DESKTOP: desktop,
    TABDO_SOURCE_PREVIEW: '1',
    TABDO_PREVIEW_OPEN_SETTINGS: '0',
    TABDO_DATA_ROOT: data,
    TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
    TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
  }
  delete env.ELECTRON_RUN_AS_NODE

  /**
   * 用同一份隔离资料启动真实源码入口，保留日志便于定位首次启动与重启差异。
   * @returns 启动完成的 Electron 实例。
   */
  async function launch(): Promise<ElectronApplication> {
    const result = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    result.process().stdout?.on('data', (value) => logs.push(String(value)))
    result.process().stderr?.on('data', (value) => logs.push(String(value)))
    await expect((await result.firstWindow()).locator('.plugin-host')).toBeAttached()
    return result
  }

  try {
    app = await launch()
    const firstApp = app
    await app.evaluate(({ app }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      db.dbPut('guide-startup-preserve', { userChoice: 'keep' })
    })
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok
          } catch {
            return false
          }
        },
        { timeout: 30000 }
      )
      .toBe(true)
    guideBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    await expect
      .poll(() =>
        guideBrowser!
          .contexts()
          .flatMap((context) => context.pages())
          .some((page) => page.url().endsWith('usage-guide.html'))
      )
      .toBe(true)
    const overlay = guideBrowser
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url().endsWith('usage-guide.html'))!
    await expect(overlay.getByRole('heading', { name: '在桌面上，亲手试一遍' })).toBeVisible()
    await expect(overlay.locator('body')).toHaveAttribute('data-phase', 'welcome')
    const directory = path.join(runs, (await fs.readdir(runs))[0])
    const owner = JSON.parse(await fs.readFile(path.join(directory, 'owner.json'), 'utf8'))
    expect(path.dirname(owner.workspace)).toBe(desktop)
    await overlay.screenshot({ path: testInfo.outputPath('first-install-auto-welcome.png') })
    await overlay.getByRole('button', { name: '暂不学习，退出引导', exact: true }).click()
    await expect.poll(async () => fs.readdir(runs)).toEqual([])
    await expect
      .poll(() =>
        fs.access(owner.workspace).then(
          () => false,
          () => true
        )
      )
      .toBe(true)
    // 正式关于窗在引导运行时已释放，退出后的新页面需要等待实际创建。
    await expect
      .poll(() =>
        firstApp
          .context()
          .pages()
          .some((page) => page.url().includes('15177'))
      )
      .toBe(true)
    const settings = firstApp
      .context()
      .pages()
      .find((page) => page.url().includes('15177'))!
    await expect(settings.locator('.about-panel .usage-guide')).toBeVisible()
    await expect
      .poll(() => settings.evaluate(() => window.tabdo.internal.usageGuide('status')))
      .toMatchObject({ running: false, report: { completed: [], skipped: [] } })
    await guideBrowser.close().catch(() => {})
    guideBrowser = undefined
    await app.close()
    app = await launch()
    // 重新打开关于仅展示可重进入口；已拒绝的首次选择不再创建子实例。
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/usageGuide.ts')
        .openUsageGuide()
    )
    const secondApp = app
    await expect
      .poll(() =>
        secondApp
          .context()
          .pages()
          .some((page) => page.url().includes('15177'))
      )
      .toBe(true)
    const about = app
      .context()
      .pages()
      .find((page) => page.url().includes('15177'))!
    await expect(about.getByRole('button', { name: '开始全屏引导', exact: true })).toBeVisible()
    await about.waitForTimeout(1500)
    expect(await about.evaluate(() => window.tabdo.internal.usageGuide('status'))).toMatchObject({
      running: false,
      report: { completed: [], skipped: [] }
    })
    expect(await fs.readdir(runs)).toEqual([])
    expect(await fs.readFile(path.join(desktop, '桌面原件.txt'), 'utf8')).toBe('preserved')
    expect(
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
          .default.dbGet('guide-startup-preserve')
      )
    ).toEqual({ userChoice: 'keep' })
  } finally {
    await guideBrowser?.close().catch(() => {})
    await app?.close().catch(() => {})
    await fs.writeFile(testInfo.outputPath('guide-first-run.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
