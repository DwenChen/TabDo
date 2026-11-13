import {
  test,
  expect,
  _electron as electron,
  type Page,
  type ElectronApplication
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('本地教程走真实关于入口，离线资源齐全且升级重启保留配置与插件', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(150000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-local-tutorial-'))
  const data = path.join(temporary, 'data')
  const pluginFile = path.join(data, 'plugins', 'tutorial-sentinel', 'keep.txt')
  let application: ElectronApplication | undefined
  const logs: string[] = []
  const remoteRequests: string[] = []
  const env = {
    ...process.env,
    TABDO_E2E: '1',
    TABDO_SOURCE_PREVIEW: '1',
    TABDO_PREVIEW_OPEN_SETTINGS: '1',
    TABDO_DATA_ROOT: data,
    TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
    TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
  }
  delete env.ELECTRON_RUN_AS_NODE
  /**
   * 从源码启动同一隔离资料，收集日志并等待真实插件正文。
   * @returns 已就绪的设置插件页面。
   */
  async function launch(): Promise<Page> {
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    application.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    application.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    const hostUrl = 'http://127.0.0.1:5174'
    await expect
      .poll(
        () =>
          application!
            .context()
            .pages()
            .some((page) => page.url().startsWith(hostUrl)),
        {
          timeout: 30_000
        }
      )
      .toBe(true)
    const main = application
      .context()
      .pages()
      .find((page) => page.url().startsWith(hostUrl))!
    await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 30_000 })
    await expect
      .poll(
        () =>
          application!
            .context()
            .pages()
            .some((page) => page.url().includes('15177')),
        { timeout: 30_000 }
      )
      .toBe(true)
    const settings = application
      .context()
      .pages()
      .find((page) => page.url().includes('15177'))!
    await expect(settings.locator('.setting-group-title').first()).toHaveText('超级面板', {
      timeout: 30000
    })
    return settings
  }
  try {
    let settings = await launch()
    // 新资料不再生成引导目录或全屏窗口；从宿主真实命令路由进入关于。
    expect(
      await fs.stat(path.join(data, 'usage-guide')).then(
        () => true,
        () => false
      )
    ).toBe(false)
    expect(
      await application!.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isFullScreen())
      )
    ).toBe(false)
    await application!.evaluate(({ app }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      db.dbPut('tutorial-preservation', { keep: true })
      db.dbPut('usage-guide-v1', { retained: true, offered: true })
      db.dbPut('super-panel-pinned', [])
    })
    await fs.mkdir(path.dirname(pluginFile), { recursive: true })
    await fs.writeFile(pluginFile, 'installed plugin data must survive')
    const setting = await settings.evaluate(
      async () =>
        (await window.tabdo.internal.getPlugins()).find((plugin) => plugin.name === 'setting')!
    )
    await application!
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:5174'))!
      .evaluate(
        (plugin) =>
          window.tabdo.launch({
            path: plugin.path,
            type: 'plugin',
            featureCode: 'ui.router?router=About',
            name: '关于'
          }),
        setting
      )
    await expect(settings.getByRole('button', { name: '阅读本地教程', exact: true })).toBeVisible()
    await expect(settings.getByRole('button', { name: '开始全屏引导', exact: true })).toHaveCount(0)
    await settings.getByRole('button', { name: '阅读本地教程', exact: true }).click()
    await expect(settings.getByRole('heading', { name: '本地教程', exact: true })).toBeVisible()
    await application!.context().route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !['127.0.0.1', 'localhost'].includes(url.hostname)
      ) {
        remoteRequests.push(url.href)
        return route.abort()
      }
      return route.continue()
    })
    const buttons = settings.getByRole('navigation', { name: '教程章节' }).getByRole('button')
    await expect(buttons).toHaveCount(16)
    await expect(settings.locator('.guide-article')).not.toContainText('阅读本地教程')
    const titles = await buttons.allTextContents()
    for (let index = 0; index < titles.length; index++) {
      await buttons.nth(index).click()
      await expect(buttons.nth(index)).toHaveAttribute('aria-current', 'page')
      await expect(settings.locator('.guide-article h2')).toHaveText(
        titles[index].trim().replace(/^\d+/, '').trim()
      )
      await expect(settings.locator('.guide-article img, .guide-article figure')).toHaveCount(0)
      await expect(settings.getByRole('heading', { name: '操作步骤', exact: true })).toBeAttached()
      expect(await settings.locator('.guide-article ol li').count()).toBeGreaterThanOrEqual(4)
    }
    expect(remoteRequests).toEqual([])
    await settings.getByRole('button', { name: '上一章', exact: true }).click()
    await expect(settings.locator('.guide-article h2')).toHaveText('备份与更换数据目录')
    await settings.getByRole('button', { name: '下一章', exact: true }).click()
    await expect(settings.locator('.guide-article h2')).toHaveText('用呼叫AI完成一次性任务')
    await settings.getByLabel('查找操作', { exact: true }).fill('收藏')
    expect(await buttons.count()).toBeGreaterThan(0)
    expect(await buttons.count()).toBeLessThan(titles.length)
    await settings.getByLabel('查找操作', { exact: true }).fill('不存在的操作xyz')
    await expect(settings.getByRole('status')).toHaveText('没有匹配章节，请换个关键词。')
    await settings.getByLabel('查找操作', { exact: true }).fill('')
    await buttons.nth(1).click()
    await expect(settings.locator('.guide-article h2')).toHaveText('查找与收藏复制记录')
    await settings.screenshot({ path: testInfo.outputPath('tutorial-light.png') })
    await settings.evaluate(() => window.tabdo.internal.setTheme('dark'))
    await expect(settings.locator('.guide-article h2')).toBeVisible()
    await settings.screenshot({ path: testInfo.outputPath('tutorial-dark.png') })
    expect(
      await settings
        .locator('.guide-body')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    ).toBe(true)
    await buttons.filter({ hasText: '录制带运镜的演示视频' }).click()
    await expect(settings.locator('.guide-article')).toContainText('无需另开剪辑工具')
    await settings.screenshot({ path: testInfo.outputPath('tutorial-presentation.png') })
    await settings.getByRole('button', { name: '返回关于', exact: true }).click()
    await expect(settings.getByRole('button', { name: '阅读本地教程', exact: true })).toBeVisible()
    expect(await settings.evaluate(() => 'usageGuide' in window.tabdo.internal)).toBe(false)
    await application!.close()
    application = undefined
    // 重启模拟已有资料升级；旧标记和显式空固定列表不能被重置。
    settings = await launch()
    const saved = await application!.evaluate(({ app, BrowserWindow }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      return {
        sentinel: db.dbGet('tutorial-preservation'),
        oldGuide: db.dbGet('usage-guide-v1'),
        pinned: db.dbGet('super-panel-pinned'),
        fullscreen: BrowserWindow.getAllWindows().some((window) => window.isFullScreen())
      }
    })
    expect(saved).toEqual({
      sentinel: { keep: true },
      oldGuide: { retained: true, offered: true },
      pinned: [],
      fullscreen: false
    })
    expect(await fs.readFile(pluginFile, 'utf8')).toBe('installed plugin data must survive')
    expect(
      await fs.stat(path.join(data, 'usage-guide')).then(
        () => true,
        () => false
      )
    ).toBe(false)
  } finally {
    await fs.writeFile(testInfo.outputPath('host.log'), logs.join(''))
    await application?.close().catch(() => {})
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3 })
  }
})
