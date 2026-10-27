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

test('初始设置、快捷键、托盘和指令符合精简版约定，目录迁移退出校验后重启保留资料', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-settings-cleanup-'))
  const data = path.join(temporary, 'data'),
    target = path.join(temporary, '新 数据目录')
  const resultFile = path.join(temporary, 'restart-result.json'),
    probe = path.join(temporary, 'restart-probe.cjs')
  let application: ElectronApplication | undefined
  const logs: string[] = []
  try {
    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '1',
      TABDO_DATA_ROOT: data,
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete environment.ELECTRON_RUN_AS_NODE
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const app = application,
      main = await app.firstWindow()
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.locator('.setting-group-title').first()).toHaveText('超级面板')
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
    await expect(settings.getByLabel('当前数据与缓存目录')).toHaveText(data)
    await expect(settings.getByText('唤醒黑名单', { exact: true })).toHaveCount(0)
    await expect(settings.getByText('呼出快捷键', { exact: true })).toHaveCount(0)
    await expect(settings.getByRole('button', { name: '调试日志', exact: true })).toHaveCount(0)
    await expect(settings.locator('.developer-settings')).not.toHaveAttribute('open')
    await expect(settings.getByText('内部 API 授权插件', { exact: true })).not.toBeVisible()
    await settings.locator('.developer-settings summary').click()
    await expect(settings.getByText('内部 API 授权插件', { exact: true })).toBeVisible()
    await settings.locator('.developer-settings summary').click()

    const initial = await app.evaluate(({ app, globalShortcut, Menu }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      void manager.withBlurHideSuppressed(
        () =>
          new Promise((resolve) => {
            ;(globalThis as any).__cleanupFocus = resolve
          })
      )
      return {
        disabled: db.dbGet('disable-commands'),
        pinned: db.dbGet('super-panel-pinned'),
        hotkey: manager.getCurrentShortcut(),
        developerHotkey: globalShortcut.isRegistered('Ctrl+Shift+I'),
        defaultHotkey: globalShortcut.isRegistered('Alt+Z'),
        menu: Menu.getApplicationMenu() !== null,
        tray: manager.trayMenu.items.map((item: any) => item.label)
      }
    })
    expect(initial.pinned.map((item: any) => item.name)).toEqual([
      '截图',
      '剪贴板',
      '便签',
      '文件搜索',
      '录屏',
      '演示录屏'
    ])
    expect(initial.disabled).toContain('setting:function.plugin-market-search:插件市场搜索:over')
    expect(initial.disabled).toContain(
      'setting:function.install-plugin?router=PluginInstaller:安装插件:files'
    )
    expect(initial.hotkey).toBe('')
    expect(initial.defaultHotkey).toBe(false)
    expect(initial.developerHotkey).toBe(false)
    if (process.platform === 'win32') expect(initial.menu).toBe(false)
    expect(initial.tray).not.toContain('显示/隐藏设置')
    expect(initial.tray).toContain('游戏模式')
    const game = await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const dnd = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/dndManager.ts'
      ).default
      manager.trayMenu.items.find((item: any) => item.label === '游戏模式').click()
      const ignored = dnd.shouldIgnoreHotkeys()
      manager.trayMenu.items.find((item: any) => item.label.startsWith('游戏模式')).click()
      return { ignored, restored: dnd.shouldIgnoreHotkeys() }
    })
    expect(game).toEqual({ ignored: true, restored: false })

    /**
     * 等待稳定正文后直接捕获设置插件当前可见区域。
     * @param name 截图文件名。
     * @returns 图片写入后的 Promise。
     */
    async function capture(name: string): Promise<void> {
      await settings.evaluate(() => {
        document.documentElement.setAttribute('data-material', 'none')
        document.body.style.background = '#ffffff'
      })
      await settings.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      const encoded = await app.evaluate(
        async ({ webContents }, url) =>
          (
            await webContents
              .getAllWebContents()
              .find((item) => item.getURL() === url)!
              .capturePage()
          )
            .toPNG()
            .toString('base64'),
        settings.url()
      )
      await fs.writeFile(testInfo.outputPath(name), Buffer.from(encoded, 'base64'))
    }
    await settings.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('*')) {
        if (element.scrollHeight > element.clientHeight) element.scrollTop = 0
      }
    })
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeInViewport()
    await capture('general-settings.png')
    await settings.getByRole('button', { name: '快捷键', exact: true }).click()
    await expect(settings.getByText('设置页呼出快捷键', { exact: true })).toBeVisible()
    await expect(settings.locator('.built-in input[type="checkbox"]')).toHaveCount(8)
    expect(
      await settings
        .locator('.built-in input[type="checkbox"]')
        .evaluateAll((inputs) => inputs.every((input) => !(input as HTMLInputElement).checked))
    ).toBe(true)
    await expect(settings.getByLabel('全屏时暂停快捷键')).not.toBeChecked()
    await expect(settings.locator('.hotkey-input')).toHaveText('默认关闭，点击录制')
    await capture('builtin-shortcuts.png')

    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')
    )
    expect(plugin?.features?.some((item: any) => item.code === 'add-to-wakeup-blacklist')).toBe(
      false
    )
    expect(
      await settings.evaluate(() => typeof (window.tabdo.internal as any).updateWakeupBlacklist)
    ).toBe('undefined')
    /**
     * 启动一个新的工具正文，用真实宿主按键验证开关。
     * @returns 剪贴板工具页面。
     */
    async function openClipboard(): Promise<Page> {
      const previous = new Set(app.context().pages())
      await main.evaluate(
        (plugin) =>
          window.tabdo.launch({ path: plugin!.path, type: 'plugin', featureCode: 'clipboard' }),
        plugin
      )
      await expect
        .poll(() =>
          app
            .context()
            .pages()
            .some((page) => !previous.has(page) && page.url().startsWith('http://127.0.0.1:15178'))
        )
        .toBe(true)
      const page = app
        .context()
        .pages()
        .find((page) => !previous.has(page) && page.url().startsWith('http://127.0.0.1:15178'))!
      await expect(page.locator('.clipboard-app .clear-btn')).toBeAttached()
      return page
    }
    /**
     * 聚焦原生宿主和工具视图，确保按键经过真实 before-input-event。
     * @returns 焦点转移完成后的 Promise。
     */
    async function focusTool(): Promise<void> {
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
    }
    const tools = await openClipboard()
    await focusTool()
    expect(
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
          .WindowManager.simulateKeyboardTap('d', 'ctrl')
      )
    ).toBe(true)
    expect(
      await app.evaluate(
        ({ app }) =>
          [
            ...process
              .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
              .default.detachedWindowMap.values()
          ].filter((item: any) => item.pluginName === 'system').length
      )
    ).toBe(0)
    const detach = settings.getByLabel('分离插件到独立窗口', { exact: true })
    await detach.locator('..').click()
    await expect(detach).toBeChecked()
    await expect
      .poll(() =>
        app.evaluate(
          ({ app }) =>
            process
              .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
              .default.dbGet('settings-general')?.builtinAppShortcutsEnabled?.detach
        )
      )
      .toBe(true)
    await focusTool()
    expect(
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
          .WindowManager.simulateKeyboardTap('d', 'ctrl')
      )
    ).toBe(true)
    await expect
      .poll(() =>
        app.evaluate(
          ({ app }) =>
            [
              ...process
                .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
                .default.detachedWindowMap.values()
            ].filter((item: any) => item.pluginName === 'system').length
        )
      )
      .toBe(1)
    await app.evaluate(({ app }) => {
      const windows = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/detachedWindowManager.ts'
      ).default
      for (const item of windows.detachedWindowMap.values())
        if (item.pluginName === 'system') item.window.close()
    })
    await expect.poll(() => tools.isClosed()).toBe(true)
    await detach.locator('..').click()
    await expect(detach).not.toBeChecked()

    // 调试日志不留可进入路由和旧服务入口，应用文件日志仍可用。
    await settings.evaluate(() => {
      location.hash = '/debug'
    })
    await expect(settings.getByText('调试控制台', { exact: true })).toHaveCount(0)
    expect(await settings.evaluate(() => typeof (window.tabdo.internal as any).logEnable)).toBe(
      'undefined'
    )
    await settings.getByRole('button', { name: '所有指令', exact: true }).click()
    await settings
      .locator('.source-item')
      .filter({ has: settings.locator('.source-name').getByText('设置', { exact: true }) })
      .click()
    await expect(settings.locator('.command-list .command-tag')).not.toHaveCount(0)
    expect(
      await settings
        .locator('.command-list .command-tag')
        .evaluateAll((tags) => tags.every((tag) => tag.classList.contains('disabled')))
    ).toBe(true)
    await settings.getByRole('button', { name: /匹配指令/ }).click()
    expect(
      await settings
        .locator('.command-list .command-tag')
        .evaluateAll(
          (tags) => tags.length > 0 && tags.every((tag) => tag.classList.contains('disabled'))
        )
    ).toBe(true)

    // 注入隔离的已安装插件、私有内容和宿主路径，供真实退出与重启验证。
    await app.evaluate(({ app }, directory) => {
      const fs = process.mainModule!.require('node:fs'),
        path = process.mainModule!.require('node:path')
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      const pluginPath = path.join(directory, 'plugins', 'fixture-installed')
      fs.mkdirSync(pluginPath, { recursive: true })
      fs.writeFileSync(
        path.join(pluginPath, 'plugin.json'),
        JSON.stringify({ name: 'fixture-installed', version: '1.2.3', features: [] })
      )
      fs.mkdirSync(path.join(directory, 'plugins-data', 'fixture-installed'), { recursive: true })
      fs.writeFileSync(
        path.join(directory, 'plugins-data', 'fixture-installed', 'content.bin'),
        Buffer.from([0, 1, 2, 255])
      )
      db.dbPut('plugins', [
        ...db.dbGet('plugins'),
        { name: 'fixture-installed', version: '1.2.3', path: pluginPath, features: [] }
      ])
      db.dbPut('migration-fixture', { value: 'preserve-this', path: pluginPath })
    }, data)
    const bad = path.join(temporary, 'nonempty')
    await fs.mkdir(bad)
    await fs.writeFile(path.join(bad, 'keep'), 'existing')
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
    }, bad)
    await settings.getByRole('button', { name: '通用设置', exact: true }).click()
    await settings.getByRole('button', { name: '更改目录', exact: true }).click()
    await settings.getByRole('button', { name: '迁移并重启', exact: true }).click()
    await expect(settings.locator('.data-location-setting p[role="status"]')).toContainText(
      '空文件夹'
    )
    expect(await fs.readFile(path.join(bad, 'keep'), 'utf8')).toBe('existing')
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    }, target)
    await settings.getByRole('button', { name: '更改目录', exact: true }).click()
    await settings.getByRole('button', { name: '迁移并重启', exact: true }).click()
    expect(await fs.stat(data).then(() => true)).toBe(true)
    expect(
      await fs.access(path.join(data, '.data-location.json')).then(
        () => true,
        () => false
      )
    ).toBe(false)

    // 重启探针实际加载同一源码应用并打开迁移后的数据库，再通过正常退出清理。
    await fs.writeFile(
      probe,
      `const fs=require('node:fs');const {app}=require('electron');require(${JSON.stringify(path.join(root, 'scripts/preview-main.cjs'))});let count=0;const timer=setInterval(()=>{try{const db=require(${JSON.stringify(path.join(root, 'src/main/api/shared/database.ts'))}).default;if(fs.existsSync(require('node:path').join(app.getPath('userData'),'.migration.json')))throw Error('migration pending');const fixture=db.dbGet('migration-fixture');if(!fixture)throw Error('not ready');const result={pid:process.pid,root:app.getPath('userData'),sessionRoot:app.getPath('sessionData'),fixture,plugins:db.dbGet('plugins'),pinned:db.dbGet('super-panel-pinned'),private:Array.from(fs.readFileSync(require('node:path').join(app.getPath('userData'),'plugins-data/fixture-installed/content.bin')))};fs.writeFileSync(${JSON.stringify(resultFile)},JSON.stringify(result));clearInterval(timer);require(${JSON.stringify(path.join(root, 'src/main/managers/windowManager.ts'))}).default.setQuitting(true);app.quit()}catch(error){if(++count>160){clearInterval(timer);fs.writeFileSync(${JSON.stringify(resultFile)},JSON.stringify({error:String(error),pid:process.pid}));app.quit()}}},250);`
    )
    await app.evaluate(({ dialog, app }, probe) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
      const cp = process.mainModule!.require('node:child_process'),
        fs = process.mainModule!.require('node:fs'),
        spawn = cp.spawn
      cp.spawn = function (executable: any, args: any, options: any): any {
        if (args?.[0]?.endsWith('data-location-worker.cjs')) {
          const job = JSON.parse(fs.readFileSync(args[1], 'utf8'))
          if (
            job.args?.[0] !== app.getAppPath() + '/scripts/preview-main.cjs' &&
            !job.args?.[0]?.endsWith('preview-main.cjs')
          )
            throw Error('Unexpected restart arguments')
          job.args = [probe]
          fs.writeFileSync(args[1], JSON.stringify(job))
        }
        return spawn.call(this, executable, args, options)
      }
    }, probe)
    const exit = new Promise<number | null>((resolve) =>
      app.process().once('exit', (code) => resolve(code))
    )
    await settings.getByRole('button', { name: '迁移并重启', exact: true }).click()
    // 释放 Playwright 的 Node 调试连接，宿主才能退出并交由离线工作进程继续。
    await app.close()
    application = undefined
    expect(await exit).toBe(0)
    await expect
      .poll(
        () =>
          fs.access(resultFile).then(
            () => true,
            () => false
          ),
        { timeout: 45000 }
      )
      .toBe(true)
    const restarted = JSON.parse(await fs.readFile(resultFile, 'utf8'))
    expect(restarted.error).toBeUndefined()
    expect(restarted.root).toBe(target)
    expect(restarted.sessionRoot).toBe(target)
    expect(restarted.sessionRoot).toBe(target)
    expect(restarted.fixture).toEqual({
      value: 'preserve-this',
      path: path.join(target, 'plugins', 'fixture-installed')
    })
    expect(restarted.plugins.find((item: any) => item.name === 'fixture-installed')).toMatchObject({
      version: '1.2.3',
      path: path.join(target, 'plugins', 'fixture-installed')
    })
    expect(restarted.private).toEqual([0, 1, 2, 255])
    expect(restarted.pinned.map((item: any) => item.featureCode)).toEqual(
      initial.pinned.map((item: any) => item.featureCode)
    )
    expect(
      await fs.readFile(path.join(data, 'plugins-data', 'fixture-installed', 'content.bin'))
    ).toEqual(Buffer.from([0, 1, 2, 255]))
    await expect
      .poll(
        () => {
          try {
            process.kill(restarted.pid, 0)
            return false
          } catch {
            return true
          }
        },
        { timeout: 15000 }
      )
      .toBe(true)
    await fs.writeFile(
      testInfo.outputPath('relocation-result.json'),
      JSON.stringify(restarted, null, 2)
    )
  } finally {
    await fs.writeFile(testInfo.outputPath('settings-cleanup.log'), logs.join(''))
    if (application?.process().exitCode === null) await application.close().catch(() => {})
    if (
      await fs.access(resultFile).then(
        () => true,
        () => false
      )
    ) {
      const result = JSON.parse(await fs.readFile(resultFile, 'utf8'))
      if (result.pid)
        try {
          process.kill(result.pid)
        } catch {
          /* 已正常退出 */
        }
    }
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  }
})
