import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * 发送 Windows 原生中键按下与松开，覆盖真正的系统鼠标监听链路。
 * @param point 隔离测试窗口中的物理屏幕坐标。
 * @returns 无返回值。
 * @throws 原生输入辅助进程执行失败时抛出错误。
 */
function clickNativeMiddle(point: { x: number; y: number }): void {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class MiddleInput { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra); }'; [MiddleInput]::SetProcessDPIAware() | Out-Null; [MiddleInput]::SetCursorPos(${point.x},${point.y}) | Out-Null; [MiddleInput]::mouse_event(32,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 70; [MiddleInput]::mouse_event(64,0,0,0,[UIntPtr]::Zero)`
    ],
    { windowsHide: true, stdio: 'pipe' }
  )
}

test('built-in tools classify history, copy multiple items and match recent clipboard with middle click', async ({
  browserName: _browserName
}, testInfo) => {
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ztools-tools-e2e-'))
  let app: ElectronApplication | undefined
  try {
    const environment = {
      ...process.env,
      ZTOOLS_E2E: '1',
      ZTOOLS_SOURCE_PREVIEW: '1',
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
      .poll(
        () =>
          app!.evaluate(async ({ app, webContents }) => {
            await process
              .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
              .default.showSettings()
            return webContents
              .getAllWebContents()
              .some((c) => c.getURL().startsWith('http://127.0.0.1:15177'))
          }),
        { timeout: 30000 }
      )
      .toBe(true)
    const setting = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15177'))!
    const limit = setting.getByLabel('复制后中键匹配时限（秒）')
    await expect(limit).toHaveValue('5')
    await limit.fill('2')
    await limit.dispatchEvent('change')
    await expect
      .poll(() =>
        setting.evaluate(
          async () =>
            (await window.ztools.internal.dbGet('settings-general')).clipboardQuickMatchSeconds
        )
      )
      .toBe(2)
    const builtin = await main.evaluate(async () =>
      (await window.ztools.getAllPlugins()).find((p) => p.name === 'system')
    )
    expect(builtin?.title).toBe('工具')
    const screenshot = builtin!.features.find((f) => f.code === 'screenshot')!
    expect(screenshot.explain).toBe('截图')
    expect(screenshot.cmds).toEqual(['截图'])

    // 在隔离数据库中准备跨多页历史，验证分类发生在分页之前。
    await app.evaluate(async ({ app }) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts'
      ).default
      for (let i = 0; i < 65; i++)
        await db.promises.put({
          _id: 'CLIPBOARD/fixture-' + i,
          type: 'text',
          timestamp: Date.now() - i * 1000,
          content: '普通记录 ' + i,
          hash: 'fixture-' + i
        })
      await db.promises.put({
        _id: 'CLIPBOARD/code',
        type: 'text',
        timestamp: Date.now() - 80000,
        content: 'const answer = 42;\nconsole.log(answer)',
        hash: 'code'
      })
      await db.promises.put({
        _id: 'CLIPBOARD/link',
        type: 'text',
        timestamp: Date.now() - 90000,
        content: 'https://example.com/tools-test',
        hash: 'link'
      })
    })
    await main.evaluate(async (pluginPath) => {
      await window.ztools.launch({
        path: pluginPath,
        type: 'plugin',
        featureCode: 'clipboard',
        name: '剪贴板'
      })
    }, builtin!.path)
    // 程序化启动不会替测试恢复宿主焦点；先显示实际插件视图再执行指针操作。
    await app.evaluate(({ app }) => {
      const windowManager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const pluginManager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/pluginManager.ts'
      ).default
      windowManager.getMainWindow().show()
      windowManager.getMainWindow().focus()
      pluginManager.focusPluginView()
    })
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    let tools = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
    await expect(tools.getByText('普通记录 0', { exact: true })).toBeVisible()
    await tools.locator('.tab-item').getByText('代码', { exact: true }).click()
    await expect(tools.locator('.content-code')).toContainText('const answer = 42')
    await expect(tools.locator('.content-code .hljs-keyword').first()).toBeVisible()
    await fs.writeFile(
      testInfo.outputPath('tools-code.png'),
      Buffer.from(
        await app.evaluate(async ({ webContents }) =>
          (
            await webContents
              .getAllWebContents()
              .find((c) => c.getURL().startsWith('http://127.0.0.1:15178'))!
              .capturePage()
          )
            .toPNG()
            .toString('base64')
        ),
        'base64'
      )
    )
    await tools.locator('.tab-item').getByText('链接', { exact: true }).click()
    await expect(tools.locator('.content-link')).toHaveText('https://example.com/tools-test')
    await app.evaluate(({ shell }) => {
      ;(globalThis as any).__openedLinks = []
      shell.openExternal = async (url) => {
        ;(globalThis as any).__openedLinks.push(url)
      }
    })
    await tools.locator('.content-link').click()
    expect(await app.evaluate(() => (globalThis as any).__openedLinks)).toContain(
      'https://example.com/tools-test'
    )

    // 本地版本号低于上游门槛时，多选仍通过宿主写入 API 完成。
    await tools.locator('.tab-item').getByText('文本', { exact: true }).click()
    await expect(tools.getByText('普通记录 0', { exact: true })).toBeVisible()
    await expect(tools.locator('.clipboard-item.selected')).toHaveCount(0)
    await tools.locator('.selection-checkbox').nth(0).click()
    await tools.locator('.selection-checkbox').nth(1).click()
    await expect(tools.locator('.copy-btn .selection-count')).toHaveText('2')
    expect(await tools.locator('body').innerText()).not.toContain('请升级后使用')
    // 复制入口覆盖宿主搜索框持焦场景，不能只向插件正文注入快捷键。
    await main.locator('header input').click()
    await main.locator('header input').press('Control+c')
    await expect
      .poll(() => app!.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('普通记录 1')

    // 侧栏按钮同样复制全部已勾选条目，刷新列表后仍不自动选择最新记录。
    await main.evaluate(async (pluginPath) => {
      await window.ztools.launch({
        path: pluginPath,
        type: 'plugin',
        featureCode: 'clipboard',
        name: '剪贴板'
      })
    }, builtin!.path)
    // 复制已退出并销毁旧会话，再次进入必须操作重新创建的页面。
    await expect.poll(() => tools.isClosed()).toBe(true)
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    tools = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
    await expect(tools.getByText('普通记录 0', { exact: true })).toBeVisible()
    await expect(tools.locator('.copy-btn')).toBeDisabled()
    const selectedText = []
    for (const index of [2, 3]) {
      selectedText.push(
        await tools.locator('.clipboard-item').nth(index).locator('.content-text').innerText()
      )
      await tools.locator('.selection-checkbox').nth(index).click()
    }
    await expect(tools.locator('.copy-btn .selection-count')).toHaveText('2')
    await tools.locator('.copy-btn').click()
    await expect
      .poll(() => app!.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(selectedText.join('\n'))

    // 在独立前台窗口中通过系统鼠标输入触发，不能只向 EventEmitter 注入事件。
    const point = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const area = screen.getPrimaryDisplay().workArea
      const fixture = new BrowserWindow({
        x: area.x + 40,
        y: area.y + 40,
        width: 260,
        height: 140,
        frame: false,
        alwaysOnTop: true,
        show: false
      })
      await fixture.loadURL('data:text/html,<h1>Isolated middle click fixture</h1>')
      fixture.show()
      fixture.focus()
      ;(globalThis as any).__middleFixture = fixture
      return screen.dipToScreenPoint({ x: area.x + 140, y: area.y + 100 })
    })
    await app.evaluate(async ({ app, clipboard }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/clipboardManager.ts'
      ).default
      clipboard.writeText('https://example.com/recent')
      await manager.handleClipboardChange()
    })
    if (process.platform === 'win32') clickNativeMiddle(point)
    else
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/node_modules/uiohook-napi')
          .uIOhook.emit('mouseup', { button: 3 })
      )
    await expect
      .poll(() =>
        app!.evaluate(
          ({ app }) =>
            process.mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
              .default.currentClipboardContent?.text
        )
      )
      .toBe('https://example.com/recent')
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().includes('super-panel.html'))
      )
      .toBe(true)
    await app.evaluate(({ app }) => {
      const panel = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/superPanelManager.ts'
      ).default
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/clipboardManager.ts'
      ).default
      panel.hideWindow()
      manager.lastCopiedContent.timestamp = Date.now() - 3000
      panel.currentClipboardContent = null
      ;(globalThis as any).__middleFixture.focus()
    })
    if (process.platform === 'win32') clickNativeMiddle(point)
    else
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/node_modules/uiohook-napi')
          .uIOhook.emit('mouseup', { button: 3 })
      )
    expect(
      await app.evaluate(({ app }) => {
        const panel = process.mainModule!.require(
          app.getAppPath() + '/src/main/core/superPanelManager.ts'
        ).default
        return {
          visible: panel.superPanelWindow.isVisible(),
          content: panel.currentClipboardContent
        }
      })
    ).toEqual({ visible: false, content: null })

    if (process.platform === 'win32') {
      // 保留已有“中键单击打开面板”配置：复制过期后显示固定项，且不发出新的复制。
      await app.evaluate(({ app }, builtin) => {
        const db = process.mainModule!.require(
          app.getAppPath() + '/src/main/api/shared/database.ts'
        ).default
        db.dbPut('super-panel-pinned', [
          {
            path: builtin!.path,
            name: '剪贴板',
            type: 'plugin',
            pluginName: 'system',
            featureCode: 'clipboard'
          }
        ])
        const panel = process.mainModule!.require(
          app.getAppPath() + '/src/main/core/superPanelManager.ts'
        ).default
        panel.updateConfig({ enabled: true, mouseButton: 'middle', longPressMs: 0 })
        ;(globalThis as any).__middleFixture.focus()
      }, builtin)
      clickNativeMiddle(point)
      const panelPage = app
        .context()
        .pages()
        .find((p) => p.url().includes('super-panel.html'))!
      await expect(
        panelPage.locator('.pinned-grid').getByText('剪贴板', { exact: true })
      ).toBeVisible()
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
        'https://example.com/recent'
      )
      expect(
        await app.evaluate(
          ({ app }) =>
            process.mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
              .default.currentClipboardContent
        )
      ).toBeNull()

      // 从面板固定的内置条目启动剪贴板，验证实际转发链路和分类响应。
      await panelPage.locator('.pinned-grid .grid-item').filter({ hasText: '剪贴板' }).click()
      // 上一轮侧栏复制已关闭旧页面，固定指令会创建独立的新工具会话。
      await expect
        .poll(() =>
          app!
            .context()
            .pages()
            .some((p) => p.url().startsWith('http://127.0.0.1:15178'))
        )
        .toBe(true)
      tools = app
        .context()
        .pages()
        .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
      await expect(tools.getByText('普通记录 0', { exact: true })).toBeVisible()
      await tools.locator('.tab-item').getByText('代码', { exact: true }).click()
      await expect(tools.locator('.content-code')).toContainText('const answer = 42')

      // 原生中键监听与快速匹配共用中键单击时，新复制仍必须进入匹配模式。
      await app.evaluate(async ({ app, clipboard }) => {
        ;(globalThis as any).__middleFixture.focus()
        clipboard.writeText('https://example.com/native-middle')
        await process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/clipboardManager.ts')
          .default.handleClipboardChange()
      })
      clickNativeMiddle(point)
      await expect
        .poll(() =>
          app!.evaluate(
            ({ app }) =>
              process.mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
                .default.currentClipboardContent?.text
          )
        )
        .toBe('https://example.com/native-middle')
      await expect(panelPage.locator('.search-header .header-text')).toContainText('选中的文本')
    }
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
