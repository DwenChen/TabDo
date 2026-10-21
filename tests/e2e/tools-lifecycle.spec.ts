import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * 在源码 Electron 中打开一个新的剪贴板工具会话，并等待正文记录稳定出现。
 * @param app 隔离的 Electron 应用。
 * @param main 宿主主页面。
 * @param pluginPath 内置工具源码目录。
 * @param text 应出现的正文记录。
 * @returns 已加载完成的工具页面。
 */
async function openTools(
  app: ElectronApplication,
  main: Page,
  pluginPath: string,
  text: string
): Promise<Page> {
  const previous = new Set(app.context().pages())
  await main.evaluate(async (pluginPath) => {
    await window.tabdo.launch({
      path: pluginPath,
      type: 'plugin',
      featureCode: 'clipboard',
      name: '剪贴板'
    })
  }, pluginPath)
  await app.evaluate(({ app }) => {
    const manager = process.mainModule!.require(
      app.getAppPath() + '/src/main/managers/windowManager.ts'
    ).default
    manager.getMainWindow().show()
    manager.getMainWindow().focus()
  })
  let tools: Page | undefined
  // 只选择本次剪贴板正文，不能把上一轮尚未完成导航的二维码页面误当作新页面。
  await expect
    .poll(async () => {
      for (const page of app.context().pages()) {
        if (
          previous.has(page) ||
          page.isClosed() ||
          !page.url().startsWith('http://127.0.0.1:15178')
        )
          continue
        if (
          await page
            .locator('.clipboard-app .clear-btn')
            .count()
            .catch(() => 0)
        ) {
          tools = page
          return true
        }
      }
      return false
    })
    .toBe(true)
  await expect(tools!.getByText(text, { exact: true })).toBeVisible()
  return tools!
}

test('tools release hidden runtimes, preserve background clipboard history and finish only registered tasks', async () => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-tool-lifecycle-'))
  let app: ElectronApplication | undefined
  try {
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
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const main = await app.firstWindow()
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
        .default.dbPut('auto-detach-plugin', [])
    })
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((p) => p.name === 'system')
        )
      )
      .toBe(true)
    await app.evaluate(async ({ app }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts'
      ).default
      await db.promises.put({
        _id: 'CLIPBOARD/lifecycle-seed',
        type: 'text',
        timestamp: Date.now(),
        content: '工具生命周期记录',
        hash: 'lifecycle-seed'
      })
    })
    const pluginPath = await main.evaluate(
      async () =>
        (await window.tabdo.getAllPlugins()).find((plugin) => plugin.name === 'system')!.path
    )
    const first = await openTools(app, main, pluginPath, '工具生命周期记录')
    // 同插件内切换也必须先退役旧视图，不能只替换 Vue 子组件。
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      const wm = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const retire = manager.retireToolsViewForLaunch.bind(manager)
      ;(globalThis as any).__toolsSwitches = []
      manager.retireToolsViewForLaunch = (...args) => {
        const previous = manager.getCurrentPluginView()
        retire(...args)
        if (previous && previous !== manager.getCurrentPluginView()) {
          ;(globalThis as any).__toolsSwitches.push({
            visible: previous.getVisible(),
            attached: wm.getMainWindow().contentView.children.includes(previous),
            cached: manager.getAllPluginViews().some((entry) => entry.view === previous)
          })
        }
      }
    })
    await main.evaluate(
      async (pluginPath) =>
        window.tabdo.launch({
          path: pluginPath,
          type: 'plugin',
          featureCode: 'qrcode-scan',
          name: '二维码扫描'
        }),
      pluginPath
    )
    await expect.poll(() => first.isClosed()).toBe(true)
    expect(await app.evaluate(() => (globalThis as any).__toolsSwitches)).toContainEqual({
      visible: false,
      attached: false,
      cached: false
    })
    // 旧页面可先销毁，新页面的导航提交稍后完成；等待真实正文对应页面出现。
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const qr = app
      .context()
      .pages()
      .find((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178'))!
    await expect(qr.getByText('选择图片', { exact: true })).toBeVisible()
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.getMainWindow()
        .hide()
    })
    await expect.poll(() => qr.isClosed()).toBe(true)

    // 只使用系统剪贴板写入，不手动调用采集方法，验证宿主全局监听仍在工作。
    const copied = '工具退出后的新复制-' + Date.now()
    await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), copied)
    await expect
      .poll(
        () =>
          app!.evaluate(async ({ app }, value) => {
            const manager = process.mainModule!.require(
              app.getAppPath() + '/src/main/managers/clipboardManager.ts'
            ).default
            return (await manager.getHistory(1, 30)).items.some((item) => item.content === value)
          }, copied),
        { timeout: 15_000 }
      )
      .toBe(true)
    const second = await openTools(app, main, pluginPath, copied)

    // 用真实保存 API 验证完整任务链；前台资源先释放，任务专属资源稍后释放。
    await second.evaluate(() => {
      const state = window as any
      state.__foregroundReleased = false
      window.toolsLifecycle.addCleanup(() => {
        state.__foregroundReleased = true
      })
      void window.toolsLifecycle.runTask(async (task) => {
        task.addCleanup(() => {
          state.__taskReleased = true
        })
        await new Promise<void>((resolve) => {
          state.__finishSave = resolve
        })
        await window.tabdo.db.promises.put({ _id: 'lifecycle-saved', value: '完整保存' })
      })
    })
    await main.evaluate(
      async (pluginPath) =>
        window.tabdo.launch({
          path: pluginPath,
          type: 'plugin',
          featureCode: 'qrcode-scan',
          name: '二维码扫描'
        }),
      pluginPath
    )
    await expect.poll(() => second.evaluate(() => (window as any).__foregroundReleased)).toBe(true)
    expect(second.isClosed()).toBe(false)
    expect(await second.evaluate(() => window.toolsLifecycle.signal.aborted)).toBe(true)
    const third = await openTools(app, main, pluginPath, copied)
    await second.evaluate(() => (window as any).__finishSave())
    await expect.poll(() => second.isClosed()).toBe(true)
    expect(third.isClosed()).toBe(false)
    expect(
      await third.evaluate(
        async () => (await window.tabdo.db.promises.get('lifecycle-saved')).value
      )
    ).toBe('完整保存')

    // 分离仍可见的工具不触发清理，最小化后立即退出并销毁独立窗口。
    await app.evaluate(async ({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      await manager.detachCurrentPlugin()
    })
    expect(third.isClosed()).toBe(false)
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getAllWindows()
        .find((w) => w.pluginName === 'system')
        .window.minimize()
    })
    await expect.poll(() => third.isClosed()).toBe(true)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
