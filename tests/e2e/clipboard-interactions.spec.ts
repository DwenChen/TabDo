import {
  test,
  expect,
  _electron as electron,
  type Page,
  type ElectronApplication
} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

/**
 * 用系统鼠标跨原生窗口拖放，实际验证操作系统接收文本及文件。
 * @param from 物理像素起点。
 * @param to 物理像素终点。
 * @returns 无返回值。
 * @throws 原生输入辅助进程失败时抛错。
 */
function nativeDrag(from: { x: number; y: number }, to: { x: number; y: number }): void {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DragInput { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e); }'; [DragInput]::SetProcessDPIAware() | Out-Null; [DragInput]::SetCursorPos(${from.x},${from.y}) | Out-Null; [DragInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 100; for($step=1;$step -le 20;$step++){[DragInput]::SetCursorPos([int](${from.x}+(${to.x}-${from.x})*$step/20),[int](${from.y}+(${to.y}-${from.y})*$step/20)) | Out-Null; Start-Sleep -Milliseconds 20}; Start-Sleep -Milliseconds 150; [DragInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`
    ],
    { windowsHide: true, stdio: 'pipe' }
  )
}

test('剪贴板独立条目悬浮、多图悬浮、跨窗口拖放、临时常驻及便签编辑', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-clipboard-interactions-'))
  let app: ElectronApplication | undefined
  const logs: string[] = []
  try {
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '1',
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
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    app
      .context()
      .on('page', (page) =>
        page.on('pageerror', (error) => logs.push('PAGE ERROR ' + error.message))
      )
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
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
    await expect(settings.locator('.setting-group-title').first()).toHaveText('超级面板')
    // 从真实设置正文检查数字输入、下拉及按钮的同高与材质，而非只检查样式源码。
    for (const theme of ['light', 'dark'] as const) {
      await app.evaluate(({ nativeTheme }, theme) => {
        nativeTheme.themeSource = theme
      }, theme)
      for (const material of ['mica', 'acrylic', 'none']) {
        await settings.evaluate((material) => {
          document.documentElement.setAttribute('data-material', material)
        }, material)
        const controls = await settings
          .locator(
            '.setting-control .input, .setting-control .btn:not(.btn-icon), .setting-control .select-trigger'
          )
          .evaluateAll((elements) =>
            elements
              .filter((element) => element.getBoundingClientRect().height)
              .map((element) => ({
                height: element.getBoundingClientRect().height,
                background: getComputedStyle(element).backgroundColor,
                control: getComputedStyle(element).getPropertyValue('--control-bg').trim(),
                tag: element.tagName
              }))
          )
        expect(controls.length).toBeGreaterThan(5)
        for (const control of controls) {
          expect(control.height).toBe(34)
          if (control.tag === 'INPUT' && material !== 'none')
            expect(control.background).not.toBe('rgb(255, 255, 255)')
        }
      }
    }
    const plugins = await main.evaluate(() => window.tabdo.getAllPlugins())
    const plugin = plugins.find((entry) => entry.name === 'system')!
    const setting = plugins.find((entry) => entry.name === 'setting')!
    await main.evaluate(
      (setting) =>
        window.tabdo.launch({
          path: setting.path,
          type: 'plugin',
          featureCode: 'ui.router?router=About',
          name: '关于'
        }),
      setting
    )
    const tutorial = settings.getByRole('button', { name: '阅读本地图文教程', exact: true })
    await expect(tutorial).toBeVisible()
    const buttons = await settings.locator('.about-panel .btn').evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element)
        return {
          height: element.getBoundingClientRect().height,
          background: style.backgroundColor,
          border: style.borderRadius,
          padding: style.padding
        }
      })
    )
    expect(buttons.length).toBeGreaterThan(4)
    for (const button of buttons) expect(button).toEqual(buttons[0])
    await settings.screenshot({ path: info.outputPath('about-controls.png') })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes('15177'))
        ?.close()
    })

    /**
     * 通过宿主真实命令入口打开工具并定位其页面身份。
     * @param code 工具功能码。
     * @returns 已显示的工具页。
     */
    async function launch(code: string): Promise<Page> {
      await main.evaluate(
        ({ plugin, code }) =>
          window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: code, name: code }),
        { plugin, code }
      )
      await app!.evaluate(({ app }) => {
        const wm = process.mainModule!.require(
          app.getAppPath() + '/src/main/managers/windowManager.ts'
        ).default
        wm.getMainWindow().show()
        wm.getMainWindow().focus()
        process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
          .default.focusPluginView()
      })
      const id = await app!.evaluate(
        ({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
            .default.getCurrentPluginView()?.webContents.id
      )
      let result: Page | undefined
      await expect
        .poll(async () => {
          for (const page of app!.context().pages()) {
            if (
              !page.isClosed() &&
              page.url().includes('15178') &&
              (await page.evaluate(() => (window as any).tabdo.getWebContentsId())) === id
            )
              result = page
          }
          return !!result
        })
        .toBe(true)
      return result!
    }
    const tools = await launch('clipboard')
    // 图像路径属于隔离夹具，native startDrag 不创建临时图片或更改剪贴板。
    const image = await tools.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 80
      canvas.getContext('2d')!.fillRect(0, 0, 120, 80)
      return canvas.toDataURL()
    })
    const paths = [path.join(temporary, 'one.png'), path.join(temporary, 'two.png')]
    for (const file of paths) await fs.writeFile(file, Buffer.from(image.split(',')[1], 'base64'))
    await app.evaluate(async ({ app }, paths) => {
      const db = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts'
      ).default
      for (const [index, text] of ['条目甲', '条目乙', '条目丙'].entries())
        await db.promises.put({
          _id: `CLIPBOARD/text-${index}`,
          type: 'text',
          timestamp: Date.now() - index * 1000,
          content: text,
          hash: `text-${index}`
        })
      for (const [index, file] of paths.entries())
        await db.promises.put({
          _id: `CLIPBOARD/image-${index}`,
          type: 'image',
          timestamp: Date.now() - 10000 - index * 1000,
          imagePath: file,
          hash: `image-${index}`,
          resolution: '120×80'
        })
    }, paths)
    await tools.locator('.tab-item').getByText('文本', { exact: true }).click()
    await expect(tools.locator('.clipboard-item')).toHaveCount(3)
    await tools.locator('.selection-checkbox').nth(0).check()
    await tools.locator('.selection-checkbox').nth(1).check()
    await expect(tools.locator('.relay-btn .selection-count')).toHaveText('2')
    await expect(tools.locator('.relay-btn')).toHaveClass(/has-selection/)
    await tools.locator('.sidebar').getByRole('button', { name: '悬浮中转', exact: true }).click()
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().includes('tools-text-float.html'))
      )
      .toBe(true)
    const textFloat = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-text-float.html'))!
    await expect(textFloat.locator('.entry')).toHaveCount(2)
    await textFloat.getByRole('combobox', { name: '条目排序' }).selectOption('oldest')
    await expect(textFloat.locator('.entry pre')).toHaveText(['条目甲', '条目乙'])
    await textFloat.locator('.entry').first().click()
    await textFloat
      .locator('.entry')
      .nth(1)
      .click({ modifiers: ['Control'] })
    await textFloat.getByRole('button', { name: '复制选中' }).click()
    await expect(textFloat.locator('.entry[aria-selected="true"]')).toHaveCount(2)
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('条目甲\n\n条目乙')
    await tools
      .locator('.clipboard-item[data-content="条目丙"]')
      .getByRole('button', { name: '悬浮中转', exact: true })
      .click()
    await expect(textFloat.locator('.entry')).toHaveCount(3)
    await textFloat.screenshot({ path: info.outputPath('text-float.png') })
    // 启用原生临时常驻，保留选择与页面身份，并允许主宿主切换到其他工具。
    await main.getByRole('button', { name: '临时常驻', exact: true }).click()
    let residentTitlebar: Page | undefined
    await expect
      .poll(async () => {
        for (const page of app!.context().pages())
          if (
            page.url().includes('detached-titlebar.html') &&
            (await page
              .locator('.plugin-name')
              .textContent()
              .catch(() => '')) === '剪贴板'
          )
            residentTitlebar = page
        return !!residentTitlebar
      })
      .toBe(true)
    await expect(
      residentTitlebar!.getByRole('button', { name: '临时常驻', exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    const toolId = await tools.evaluate(() => (window as any).tabdo.getWebContentsId())
    await app.evaluate(({ app }, id) => {
      const dm = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/detachedWindowManager.ts'
      ).default
      dm.getWindowByPluginWebContents(id).minimize()
    }, toolId)
    expect(tools.isClosed()).toBe(false)
    expect(await tools.evaluate(() => (window as any).tabdo.isTemporaryResident())).toBe(true)
    await app.evaluate(
      ({ app }, id) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(id)
          .hide(),
      toolId
    )
    expect(tools.isClosed()).toBe(false)
    await app.evaluate(({ app }, id) => {
      const win = process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getWindowByPluginWebContents(id)
      win.restore()
      win.setAlwaysOnTop(true)
      win.setBounds({ x: 20, y: 80, width: 560, height: 480 })
      win.show()
      win.focus()
    }, toolId)
    // 真实的外部接收窗口：文字使用浏览器默认插入，文件使用 drop.files。
    await app.evaluate(async ({ BrowserWindow }) => {
      const receiver = new BrowserWindow({
        title: '隔离拖放接收器',
        x: 650,
        y: 80,
        width: 340,
        height: 480,
        alwaysOnTop: true,
        webPreferences: { contextIsolation: true, sandbox: true }
      })
      await receiver.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<textarea id="target" style="width:95%;height:150px"></textarea><div id="files" style="height:200px;border:1px solid">拖入图片</div><script>document.getElementById("files").ondragover=e=>e.preventDefault();document.getElementById("files").ondrop=e=>{e.preventDefault();document.getElementById("files").textContent=[...e.dataTransfer.files].map(f=>f.name).join(",")}</script>'
          )
      )
    })
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().startsWith('data:text/html'))
      )
      .toBe(true)
    const receiver = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('data:text/html'))!
    for (const page of [tools, receiver])
      await page.evaluate(() => {
        ;(window as any).__dragEvents = []
        for (const type of ['pointerdown', 'dragstart', 'dragenter', 'dragover', 'drop', 'dragend'])
          document.addEventListener(
            type,
            (event: any) => {
              ;(window as any).__dragEvents.push({
                type,
                x: event.clientX,
                y: event.clientY,
                target: event.target.className || event.target.id,
                text: event.dataTransfer?.getData('text/plain')
              })
            },
            true
          )
      })
    await textFloat.getByRole('button', { name: '关闭', exact: true }).click()
    /**
     * 将页面内可见元素的中心转换为原生鼠标物理坐标。
     * @param page 所属页面。
     * @param selector 目标元素选择器。
     * @returns 屏幕物理坐标。
     */
    async function screenPoint(page: Page, selector: string): Promise<{ x: number; y: number }> {
      const rect = (await page.locator(selector).first().boundingBox())!
      const url = page.url()
      return app!.evaluate(
        ({ BrowserWindow, screen, app }, { rect, url, toolId }) => {
          const win = url.includes('15178')
            ? process
                .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
                .default.getWindowByPluginWebContents(toolId)
            : BrowserWindow.getAllWindows().find((entry) => entry.webContents.getURL() === url)!
          const bounds = win.getContentBounds()
          // 分离页面位于原生标题栏 WebContentsView 下方。
          const top = url.includes('15178')
            ? win.contentView.children
                .find((view: any) => view.webContents?.id === toolId)
                .getBounds().y
            : 0
          return screen.dipToScreenPoint({
            x: Math.round(bounds.x + rect.x + rect.width / 2),
            y: Math.round(bounds.y + top + rect.y + Math.min(rect.height / 2, 30))
          })
        },
        { rect, url, toolId }
      )
    }
    await app.evaluate(
      ({ app }, id) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(id)
          .focus(),
      toolId
    )
    await fs.writeFile(
      info.outputPath('drag-windows.json'),
      JSON.stringify(
        await app.evaluate(({ BrowserWindow, screen }) => ({
          displays: screen.getAllDisplays(),
          windows: BrowserWindow.getAllWindows().map((win) => ({
            title: win.getTitle(),
            bounds: win.getBounds(),
            content: win.getContentBounds(),
            visible: win.isVisible(),
            focused: win.isFocused()
          }))
        })),
        null,
        2
      )
    )
    await fs.writeFile(
      info.outputPath('desktop-before-drag.png'),
      Buffer.from(
        await app.evaluate(async ({ desktopCapturer }) =>
          (
            await desktopCapturer.getSources({
              types: ['screen'],
              thumbnailSize: { width: 1920, height: 1080 }
            })
          )[0].thumbnail
            .toPNG()
            .toString('base64')
        ),
        'base64'
      )
    )
    const dragA = tools.locator('.clipboard-item[data-content="条目甲"]')
    const dragB = tools.locator('.clipboard-item[data-content="条目乙"]').last()
    // 复制浮窗文本会被全局采集为新记录；明确重选原始两行。
    await dragA.click()
    await dragB.click({ modifiers: ['Control'] })
    await expect(dragA).toHaveAttribute('aria-selected', 'true')
    await expect(dragB).toHaveAttribute('aria-selected', 'true')
    nativeDrag(
      await screenPoint(tools, '.clipboard-item[data-content="条目甲"]'),
      await screenPoint(receiver, '#target')
    )
    await fs.writeFile(
      info.outputPath('text-drag-events.json'),
      JSON.stringify(
        {
          source: await tools.evaluate(() => (window as any).__dragEvents),
          target: await receiver.evaluate(() => (window as any).__dragEvents)
        },
        null,
        2
      )
    )
    await expect(receiver.locator('#target')).toHaveValue('条目甲\n条目乙')
    await tools.locator('.tab-item').getByText('图像', { exact: true }).click()
    await expect(tools.locator('.clipboard-item')).toHaveCount(2)
    await tools.locator('.selection-checkbox').nth(0).check()
    await tools.locator('.selection-checkbox').nth(1).check()
    await tools.getByRole('button', { name: '悬浮固定', exact: true }).first().click()
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .filter((page) => page.url().includes('tools-floating.html')).length
      )
      .toBe(2)
    for (const page of app
      .context()
      .pages()
      .filter((page) => page.url().includes('tools-floating.html'))) {
      await expect(page.locator('#canvas')).toBeVisible()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
    }
    await app.evaluate(
      ({ app }, id) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(id)
          .focus(),
      toolId
    )
    nativeDrag(await screenPoint(tools, '.clipboard-item'), await screenPoint(receiver, '#files'))
    await expect(receiver.locator('#files')).toHaveText('one.png,two.png')
    expect(tools.isClosed()).toBe(false)
    await residentTitlebar!.getByRole('button', { name: '临时常驻', exact: true }).click()
    await expect.poll(() => tools.isClosed()).toBe(true)
    await expect.poll(() => residentTitlebar!.isClosed()).toBe(true)
    await expect.poll(() => textFloat.isClosed()).toBe(true)
    // 独立便签与文本浮窗互相隔离，字号手动输入不会被逐字符夹断。
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'sticky-note',
          name: '便签'
        }),
      plugin
    )
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().includes('tools-floating.html'))
      )
      .toBe(true)
    const note = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-floating.html'))!
    await expect(note.getByLabel('便签内容')).toHaveCSS('font-size', '14px')
    await note.getByRole('button', { name: '便签选项' }).click()
    const font = note.getByLabel('便签字号')
    await font.fill('')
    await font.pressSequentially('18')
    await expect(font).toHaveValue('18')
    await font.press('Tab')
    await expect(note.getByLabel('便签内容')).toHaveCSS('font-size', '18px')
    await note.getByRole('button', { name: '便签选项' }).click()
    await note.getByLabel('便签内容').fill('')
    await note.getByLabel('便签内容').pressSequentially('ABC')
    await note.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(note.getByLabel('便签内容')).not.toHaveValue('ABC')
    await note.getByRole('button', { name: '重做', exact: true }).click()
    await expect(note.getByLabel('便签内容')).toHaveValue('ABC')
    await note.getByLabel('便签内容').fill('便签编辑内容')
    // 核对真实 context-menu 事件构建出的原生菜单，并执行其编辑角色。
    await app.evaluate(({ Menu }) => {
      const original = Menu.prototype.popup
      ;(globalThis as any).__menuPopup = original
      Menu.prototype.popup = function (options) {
        ;(globalThis as any).__noteMenu = this
        return original.call(this, options)
      }
    })
    await note.getByLabel('便签内容').press('Control+a')
    await note.getByLabel('便签内容').click({ button: 'right' })
    const labels = await app.evaluate(() =>
      (globalThis as any).__noteMenu.items.map((item: any) => item.label)
    )
    expect(labels).toEqual(['剪切', '复制', '粘贴'])
    await app.evaluate(({ BrowserWindow }) => {
      const menu = (globalThis as any).__noteMenu
      const win = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('tools-floating.html')
      )!
      menu.closePopup()
      win.focus()
      win.webContents.focus()
      const copyItem = menu.items.find((item: any) => item.label === '复制')
      copyItem.click(copyItem, win)
    })
    await expect
      .poll(() => app!.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('便签编辑内容')
    await app.evaluate(({ clipboard, BrowserWindow }) => {
      const menu = (globalThis as any).__noteMenu
      const win = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('tools-floating.html')
      )!
      clipboard.writeText('右键粘贴内容')
      const pasteItem = menu.items.find((item: any) => item.label === '粘贴')
      pasteItem.click(pasteItem, win)
    })
    await expect(note.getByLabel('便签内容')).toHaveValue('右键粘贴内容')
    await note.screenshot({ path: info.outputPath('note-edited.png') })
    // 初始化期间的连续追加归同一浮窗；新文本窗口不能写入已有便签。
    const queue = await app.evaluate(async ({ app }) => {
      const { openFloating } = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/toolsFloating.ts'
      )
      return Promise.all([
        openFloating({ type: 'text-list', texts: ['首批文本'] }),
        openFloating({ type: 'text-list', texts: ['初始化期间追加'] })
      ])
    })
    expect(queue[0]).toBe(queue[1])
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((page) => page.url().includes('tools-text-float.html'))
      )
      .toBe(true)
    const queuedFloat = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-text-float.html'))!
    await queuedFloat.getByRole('combobox', { name: '条目排序' }).selectOption('oldest')
    await expect(queuedFloat.locator('.entry pre')).toHaveText(['首批文本', '初始化期间追加'])
    await expect(note.getByLabel('便签内容')).toHaveValue('右键粘贴内容')
    await queuedFloat.getByRole('button', { name: '关闭', exact: true }).click()
    await note.getByRole('button', { name: '关闭', exact: true }).click()
    const reopenedTools = await launch('clipboard')
    await expect(main.getByRole('button', { name: '临时常驻', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await main.getByRole('button', { name: '临时常驻', exact: true }).click()
    await expect
      .poll(() => reopenedTools.evaluate(() => (window as any).tabdo.isTemporaryResident()))
      .toBe(true)
    const reopenedId = await reopenedTools.evaluate(() => (window as any).tabdo.getWebContentsId())
    await app.evaluate(
      ({ app }, id) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(id)
          .close(),
      reopenedId
    )
    await expect.poll(() => reopenedTools.isClosed()).toBe(true)
  } finally {
    await fs.writeFile(info.outputPath('clipboard-interactions.log'), logs.join(''))
    if (app) await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
