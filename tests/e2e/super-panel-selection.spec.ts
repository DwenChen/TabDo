import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * 发送真实系统鼠标事件，覆盖原生中键钩子和窗口外左键点击。
 * @param point 中键触发点的物理坐标。
 * @param outside 可选的后续窗口外点击点；中键松开 50ms 后点击。
 * @param leftOnly 是否只发送左键。
 * @returns 无返回值。
 * @throws 输入辅助进程失败时抛出错误。
 */
function nativeClick(
  point: { x: number; y: number },
  outside?: { x: number; y: number },
  leftOnly = false
): void {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PanelInput { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra); }';
[PanelInput]::SetProcessDPIAware() | Out-Null; [PanelInput]::SetCursorPos(${point.x},${point.y}) | Out-Null;
[PanelInput]::mouse_event(${leftOnly ? 2 : 32},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [PanelInput]::mouse_event(${leftOnly ? 4 : 64},0,0,0,[UIntPtr]::Zero);
${outside ? `Start-Sleep -Milliseconds 50; [PanelInput]::SetCursorPos(${outside.x},${outside.y}) | Out-Null; [PanelInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [PanelInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero);` : ''}`
    ],
    { windowsHide: true, stdio: 'pipe' }
  )
}

test('middle click matches current text and files, and outside clicks dismiss focused, inactive and pending panels', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows native middle and clipboard file events')
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ztools-panel-selection-'))
  let app: ElectronApplication | undefined
  try {
    const file = path.join(temporary, 'selected.txt')
    await fs.writeFile(file, 'Selected file fixture')
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
      env: environment,
      cwd: root
    })
    // 保留原生输入链路的宿主日志，失败时可区分钩子、焦点、复制和通知顺序。
    const mainLog = testInfo.outputPath('main-process.log')
    fsSync.mkdirSync(path.dirname(mainLog), { recursive: true })
    app.process().stdout?.on('data', (chunk) => fsSync.appendFileSync(mainLog, chunk))
    app.process().stderr?.on('data', (chunk) => fsSync.appendFileSync(mainLog, chunk))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    const points = await app.evaluate(
      async ({ app, BrowserWindow, ipcMain, screen, clipboard }, file) => {
        const panel = process.mainModule!.require(
          app.getAppPath() + '/src/main/core/superPanelManager.ts'
        ).default
        panel.updateConfig({ enabled: true, mouseButton: 'middle', longPressMs: 0 })
        const area = screen.getPrimaryDisplay().workArea
        const fixture = new BrowserWindow({
          x: area.x + 30,
          y: area.y + 30,
          width: 850,
          height: 620,
          frame: false,
          alwaysOnTop: true,
          show: false,
          webPreferences: { nodeIntegration: true, contextIsolation: false }
        })
        await fixture.loadURL(
          `data:text/html,<body style="background:white;padding:20px"><p id="selected">https://example.com/selected</p><p>Selection source fixture</p><script>window.copyMode='text';document.addEventListener('copy',e=>{if(window.copyMode==='text')return;e.preventDefault();if(window.copyMode==='files')require('electron').ipcRenderer.send('fixture-copy-files')})</script></body>`
        )
        ;(globalThis as any).__selectionFixture = fixture
        ;(globalThis as any).__fileCopies = 0
        ipcMain.on('fixture-copy-files', (event) => {
          if (event.sender !== fixture.webContents) return
          setTimeout(() => {
            process
              .mainModule!.require(app.getAppPath() + '/src/main/utils/clipboardFiles.ts')
              .writeClipboardFiles([file])
            ;(globalThis as any).__fileCopies++
          }, 300)
        })
        const manager = process.mainModule!.require(
          app.getAppPath() + '/src/main/managers/clipboardManager.ts'
        ).default
        // 等待真实原生通知完成播种，避免手动采集与迟到的同一通知伪装成“下一次复制”。
        const seeded = manager.waitForNextCopiedContent(manager.getLastCopiedSequence(), 5_000)
        clipboard.writeText('old clipboard must not replace selection')
        if (!(await seeded)) throw new Error('Native clipboard seed notification did not arrive')
        manager.lastCopiedContent.timestamp = Date.now() - 60000
        fixture.show()
        fixture.focus()
        fixture.webContents.focus()
        return {
          trigger: screen.dipToScreenPoint({ x: area.x + 180, y: area.y + 140 }),
          outside: screen.dipToScreenPoint({ x: area.x + 720, y: area.y + 440 })
        }
      },
      file
    )
    const fixturePage = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('data:text/html'))!
    // Windows 可能延迟或拒绝纯程序化前台请求；先真实点击夹具，再建立选区。
    nativeClick(points.trigger, undefined, true)
    await expect
      .poll(() => app!.evaluate(() => (globalThis as any).__selectionFixture.isFocused()))
      .toBe(true)
    await expect.poll(() => fixturePage.evaluate(() => document.hasFocus())).toBe(true)
    await fixturePage.evaluate(() => {
      const range = document.createRange()
      range.selectNodeContents(document.getElementById('selected')!)
      getSelection()!.removeAllRanges()
      getSelection()!.addRange(range)
    })
    await expect
      .poll(() => fixturePage.evaluate(() => getSelection()?.toString()))
      .toBe('https://example.com/selected')
    nativeClick(points.trigger)
    await expect
      .poll(() =>
        app!.evaluate(
          ({ app }) =>
            process.mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
              .default.currentClipboardContent?.text
        )
      )
      .toBe('https://example.com/selected')
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().includes('super-panel.html'))
      )
      .toBe(true)
    const panelPage = app
      .context()
      .pages()
      .find((p) => p.url().includes('super-panel.html'))!
    await expect(panelPage.locator('.search-header .header-text')).toContainText('选中的文本')
    await expect(panelPage.getByText('打开网址', { exact: true }).first()).toBeVisible()
    nativeClick(points.outside, undefined, true)
    await expect
      .poll(() =>
        app!.evaluate(({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
            .default.superPanelWindow.isVisible()
        )
      )
      .toBe(false)

    // 真实 Ctrl+C 事件请求写入 CF_HDROP，300ms 延迟覆盖 Explorer 等较慢的文件复制。
    await fixturePage.evaluate(() => {
      getSelection()!.removeAllRanges()
      ;(window as any).copyMode = 'files'
    })
    await app.evaluate(() => {
      ;(globalThis as any).__selectionFixture.focus()
      ;(globalThis as any).__selectionFixture.webContents.focus()
    })
    nativeClick(points.trigger)
    await expect
      .poll(() =>
        app!.evaluate(
          ({ app }) =>
            process.mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
              .default.currentClipboardContent?.files?.[0]?.path
        )
      )
      .toBe(file)
    await expect(panelPage.locator('.search-header .header-text')).toContainText('选中的文件 1 个')
    nativeClick(points.outside, undefined, true)
    await expect
      .poll(() =>
        app!.evaluate(({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
            .default.superPanelWindow.isVisible()
        )
      )
      .toBe(false)

    // 模拟 Windows 拒绝前台焦点：面板可见但一直没有焦点，不能只依赖 blur 关闭。
    await fixturePage.evaluate(() => {
      ;(window as any).copyMode = 'none'
    })
    await app.evaluate(({ app }) => {
      const panel = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/superPanelManager.ts'
      ).default
      const win = panel.superPanelWindow
      win.show = win.showInactive.bind(win)
      win.focus = () => undefined
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/clipboardManager.ts'
      ).default
      manager.lastCopiedContent.timestamp = Date.now() - 60000
      ;(globalThis as any).__selectionFixture.focus()
      ;(globalThis as any).__selectionFixture.webContents.focus()
    })
    for (let i = 0; i < 2; i++) {
      nativeClick(points.trigger)
      await expect(panelPage.locator('.pinned-header')).toBeVisible()
      expect(
        await app.evaluate(({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
            .default.superPanelWindow.isFocused()
        )
      ).toBe(false)
      nativeClick(points.outside, undefined, true)
      await expect
        .poll(() =>
          app!.evaluate(({ app }) =>
            process
              .mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
              .default.superPanelWindow.isVisible()
          )
        )
        .toBe(false)
    }

    // 复制尚未返回时点击外部，后续文件事件不得再次显示面板。
    await fixturePage.evaluate(() => {
      ;(window as any).copyMode = 'files'
    })
    await app.evaluate(() => {
      ;(globalThis as any).__selectionFixture.focus()
      ;(globalThis as any).__selectionFixture.webContents.focus()
    })
    nativeClick(points.trigger, points.outside)
    await expect.poll(() => app!.evaluate(() => (globalThis as any).__fileCopies)).toBe(2)
    expect(
      await app.evaluate(({ app }) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/superPanelManager.ts')
          .default.superPanelWindow.isVisible()
      )
    ).toBe(false)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
