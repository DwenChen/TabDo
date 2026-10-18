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
    await window.ztools.launch({
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
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((p) => !previous.has(p) && p.url().startsWith('http://127.0.0.1:15178'))
    )
    .toBe(true)
  const tools = app
    .context()
    .pages()
    .find((p) => !previous.has(p) && p.url().startsWith('http://127.0.0.1:15178'))!
  await expect(tools.getByText(text, { exact: true })).toBeVisible()
  return tools
}

test('tools release hidden runtimes, preserve background clipboard history and finish only registered tasks', async () => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ztools-tool-lifecycle-'))
  let app: ElectronApplication | undefined
  try {
    const environment = {
      ...process.env,
      ZTOOLS_E2E: '1',
      ZTOOLS_SOURCE_PREVIEW: '1',
      ZTOOLS_PREVIEW_OPEN_SETTINGS: '0',
      ZTOOLS_DATA_ROOT: path.join(temporary, 'data'),
      ZTOOLS_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      ZTOOLS_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete environment.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const main = await app.firstWindow()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.ztools.getAllPlugins()).some((p) => p.name === 'system')
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
        (await window.ztools.getAllPlugins()).find((plugin) => plugin.name === 'system')!.path
    )
    const first = await openTools(app, main, pluginPath, '工具生命周期记录')
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.getMainWindow()
        .hide()
    })
    await expect.poll(() => first.isClosed()).toBe(true)

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
        await window.ztools.db.promises.put({ _id: 'lifecycle-saved', value: '完整保存' })
      })
    })
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
        .default.hidePluginView()
    })
    await expect.poll(() => second.evaluate(() => (window as any).__foregroundReleased)).toBe(true)
    expect(second.isClosed()).toBe(false)
    expect(await second.evaluate(() => window.toolsLifecycle.signal.aborted)).toBe(true)
    const third = await openTools(app, main, pluginPath, copied)
    await second.evaluate(() => (window as any).__finishSave())
    await expect.poll(() => second.isClosed()).toBe(true)
    expect(third.isClosed()).toBe(false)
    expect(
      await third.evaluate(
        async () => (await window.ztools.db.promises.get('lifecycle-saved')).value
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
