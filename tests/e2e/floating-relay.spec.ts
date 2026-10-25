import { test, expect, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

/**
 * 用系统鼠标把中转条目拖到独立接收窗口，验证实际操作系统交付。
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
      `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class RelayDrag { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e); }'; [RelayDrag]::SetProcessDPIAware() | Out-Null; [RelayDrag]::SetCursorPos(${from.x},${from.y}) | Out-Null; [RelayDrag]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 100; for($step=1;$step -le 20;$step++){[RelayDrag]::SetCursorPos([int](${from.x}+(${to.x}-${from.x})*$step/20),[int](${from.y}+(${to.y}-${from.y})*$step/20)) | Out-Null; Start-Sleep -Milliseconds 20}; Start-Sleep -Milliseconds 150; [RelayDrag]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`
    ],
    { windowsHide: true, stdio: 'pipe' }
  )
}

test('悬浮中转混合内容、排序追加、关闭销毁与宿主临时常驻', async ({
  browserName: _browserName
}, info) => {
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-relay-test-'))
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
  const app = await electron.launch({
    args: [path.join(root, 'scripts/preview-main.cjs')],
    cwd: root,
    env
  })
  const logs: string[] = []
  app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
  app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
  try {
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main
          .evaluate(() => window.tabdo.getAllPlugins())
          .then((list) => list.some((item) => item.name === 'system'))
      )
      .toBe(true)
    const plugins = await main.evaluate(() => window.tabdo.getAllPlugins())
    const plugin = plugins.find((item) => item.name === 'system')!
    /**
     * 从真实宿主指令进入工具，等待匹配的新页面。
     * @param code 工具功能码。
     * @returns 当前工具正文页面。
     */
    async function launch(code: string): Promise<Page> {
      await main.evaluate(
        ({ plugin, code }) =>
          window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: code, name: code }),
        { plugin, code }
      )
      const id = await app.evaluate(
        ({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
            .default.getCurrentPluginView()?.webContents.id
      )
      let current: Page | undefined
      await expect
        .poll(async () => {
          for (const page of app.context().pages())
            if (
              !page.isClosed() &&
              page.url().includes('15178') &&
              (await page.evaluate(() => (window as any).tabdo.getWebContentsId())) === id
            )
              current = page
          return !!current
        })
        .toBe(true)
      return current!
    }
    const tools = await launch('clipboard')
    await expect(main.getByRole('button', { name: '临时常驻', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(await tools.getByRole('button', { name: '临时常驻', exact: true }).count()).toBe(0)
    // 声明能力不会自动常驻，正文直接调用兼容API也不改变用户开关。
    expect(await tools.evaluate(() => (window as any).tabdo.setTemporaryResident(true))).toBe(false)
    await main.getByRole('button', { name: '临时常驻', exact: true }).click()
    const id = await tools.evaluate(() => (window as any).tabdo.getWebContentsId())
    const ownerId = await app.evaluate(
      ({ app }, id) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(id)?.id,
      id
    )
    let titlebar: Page | undefined
    await expect
      .poll(async () => {
        for (const page of app.context().pages()) {
          if (
            page.url().includes('detached-titlebar.html') &&
            (await (await app.browserWindow(page)).evaluate((win) => win.id)) === ownerId
          )
            titlebar = page
        }
        return !!titlebar
      })
      .toBe(true)
    await expect(titlebar!.getByRole('button', { name: '临时常驻', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await app.evaluate(
      ({ app }, id) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(id)
          .hide(),
      id
    )
    expect(tools.isClosed()).toBe(false)
    await app.evaluate(({ app }, id) => {
      const win = process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getWindowByPluginWebContents(id)
      win.show()
      win.focus()
    }, id)
    await tools.locator('.sidebar').getByRole('button', { name: '悬浮中转', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-text-float.html'))
      )
      .toBe(true)
    const relay = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-text-float.html'))!
    await expect(relay.locator('#empty')).toBeVisible()
    await expect(relay.locator('.entry')).toHaveCount(0)
    // 使用系统剪贴板真实写入，核对宿主采集到窗口的完整追加链。
    await app.evaluate(({ clipboard }) => clipboard.writeText('中转第一条'))
    await expect(relay.locator('.entry pre')).toHaveText(['中转第一条'])
    await app.evaluate(({ clipboard }) => clipboard.writeText('中转第二条'))
    await expect(relay.locator('.entry pre')).toHaveText(['中转第二条', '中转第一条'])
    await relay.getByRole('combobox', { name: '条目排序' }).selectOption('oldest')
    await expect(relay.locator('.entry pre')).toHaveText(['中转第一条', '中转第二条'])
    await expect(relay.getByRole('button', { name: '全选', exact: true })).toHaveCount(0)
    await expect(relay.locator('.reorder-handle + .delete-entry')).toHaveCount(2)
    await expect(relay.locator('.drag-handle')).toHaveCount(0)
    await expect(relay.locator('.entry input[type="checkbox"]')).toHaveCount(2)
    // 点击勾选列的边缘也只切换选择，不要求精确命中原生小方框。
    await relay
      .locator('.entry .selection-area')
      .nth(0)
      .click({ position: { x: 3, y: 3 } })
    await expect(relay.locator('.entry input').nth(0)).toBeChecked()
    await relay.locator('.entry input').nth(1).check()
    await expect(relay.locator('.entry[aria-selected="true"]')).toHaveCount(2)
    await relay.getByRole('button', { name: '复制选中' }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      '中转第一条\n\n中转第二条'
    )
    await relay.locator('.entry input').nth(0).uncheck()
    await relay.getByRole('button', { name: '上移条目' }).click()
    await expect(relay.getByRole('combobox', { name: '条目排序' })).toHaveValue('manual')
    await expect(relay.locator('.entry pre')).toHaveText(['中转第二条', '中转第一条'])
    await app.evaluate(({ clipboard }) => clipboard.writeText('中转第三条'))
    await expect(relay.locator('.entry pre')).toHaveText(['中转第二条', '中转第一条', '中转第三条'])
    await relay.locator('.entry').first().click()
    await relay
      .locator('.entry input')
      .nth(2)
      .click({ modifiers: ['Shift'] })
    await expect(relay.locator('.entry[aria-selected="true"]')).toHaveCount(3)
    await relay.keyboard.press('Control+a')
    await expect(relay.locator('.entry[aria-selected="true"]')).toHaveCount(0)
    const destination = relay.locator('.entry').filter({ hasText: '中转第三条' })
    const destinationBounds = (await destination.boundingBox())!
    await relay
      .locator('.entry')
      .filter({ hasText: '中转第二条' })
      .getByRole('button', { name: '拖动排序', exact: true })
      .dragTo(destination, { targetPosition: { x: 100, y: destinationBounds.height - 4 } })
    await expect(relay.locator('.entry pre')).toHaveText(['中转第一条', '中转第三条', '中转第二条'])
    await expect(relay.locator('#status')).toContainText('已调整顺序')
    await expect(relay.locator('#status')).toHaveText('', { timeout: 5000 })
    const png = await tools.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 100
      canvas.getContext('2d')!.fillRect(0, 0, 160, 100)
      return canvas.toDataURL()
    })
    await app.evaluate(
      ({ clipboard, nativeImage }, png) => clipboard.writeImage(nativeImage.createFromDataURL(png)),
      png
    )
    await expect(relay.locator('.thumbnail img')).toBeVisible()
    const imagePath = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('tools-text-float.html')
      )
      return win?.webContents.executeJavaScript(
        "document.querySelector('.thumbnail').click(); document.querySelector('#preview-image').src"
      )
    })
    await expect(relay.locator('#preview')).toBeVisible()
    await expect
      .poll(() =>
        relay
          .locator('#preview-image')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)
      )
      .toBe(160)
    await relay.getByRole('button', { name: '关闭图片预览' }).click()
    const file = path.join(temporary, '文件示例.txt')
    await fs.writeFile(file, '临时文件内容')
    await app.evaluate(
      ({ app }, file) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/utils/clipboardFiles.ts')
          .writeClipboardFiles([file]),
      file
    )
    await expect(relay.locator('.entry pre').last()).toHaveText('文件示例.txt')
    await expect(relay.locator('.entry')).toHaveCount(5)
    // 在真实剪贴板界面尝试混合选择，必须保留原选择并给出可见禁止反馈。
    await tools.locator('.tab-item').getByText('文本', { exact: true }).click()
    await tools.locator('.tab-item').getByText('全部', { exact: true }).click()
    const sourceText = tools
      .locator('.clipboard-item[data-content="中转第一条"]')
      .last()
      .locator('.selection-checkbox')
    const sourceFile = tools
      .locator('.clipboard-item')
      .filter({ hasText: '文件示例.txt' })
      .locator('.selection-checkbox')
    await sourceText.locator('..').click({ position: { x: 3, y: 3 } })
    await sourceFile.locator('..').click({ position: { x: 3, y: 3 } })
    await expect(sourceText).toBeChecked()
    await expect(sourceFile).not.toBeChecked()
    await expect(tools.locator('.floating-status')).toContainText('不能混合')
    // 相同错误再次触发也重置计时，旧计时器不能提前清除新反馈。
    await tools.waitForTimeout(2200)
    await sourceFile.locator('..').click({ position: { x: 3, y: 3 } })
    await tools.waitForTimeout(2000)
    await expect(tools.locator('.floating-status')).toContainText('不能混合')
    await expect(tools.locator('.floating-status')).toBeHidden({ timeout: 5000 })
    await sourceText.click()
    await relay.getByRole('combobox', { name: '条目排序' }).selectOption('newest')
    await relay.screenshot({ path: info.outputPath('relay-mixed.png') })
    const firstText = relay.locator('.entry').filter({ hasText: '中转第一条' })
    await firstText.click()
    await relay.getByRole('button', { name: '复制选中' }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('中转第一条')
    await app.evaluate(({ clipboard }) => clipboard.writeText('紧随复制的新条目'))
    await expect(relay.locator('.entry pre').filter({ hasText: '紧随复制的新条目' })).toBeVisible()
    // 两个明确的可见窗口，接收者读取真实文本插入和drop.files。
    await app.evaluate(async ({ BrowserWindow }) => {
      const source = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('tools-text-float.html')
      )!
      source.setBounds({ x: 20, y: 60, width: 380, height: 500 })
      source.setAlwaysOnTop(true)
      const receiver = new BrowserWindow({
        title: '中转拖放接收器',
        x: 700,
        y: 60,
        width: 320,
        height: 500,
        alwaysOnTop: true,
        webPreferences: { sandbox: true, contextIsolation: true }
      })
      await receiver.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<textarea id="target" style="width:95%;height:180px"></textarea><div id="files" style="height:200px;border:1px solid">拖入图片和文件</div><script>files.ondragover=e=>e.preventDefault();files.ondrop=e=>{e.preventDefault();files.textContent=[...e.dataTransfer.files].map(f=>f.name).join(",")}</script>'
          )
      )
      source.focus()
    })
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('data:text/html'))
      )
      .toBe(true)
    const receiver = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('data:text/html'))!
    await relay.evaluate(() => {
      ;(window as any).__dragLog = []
      for (const type of ['pointerdown', 'dragstart', 'dragend', 'pointerup'])
        document.addEventListener(
          type,
          (event) => {
            ;(window as any).__dragLog.push({
              type,
              target: (event.target as HTMLElement).className,
              text: (event.target as HTMLElement).textContent?.slice(0, 40),
              alt: (event as MouseEvent).altKey
            })
          },
          true
        )
    })
    /**
     * 把正文局部坐标转换为当前显示器物理鼠标坐标。
     * @param page 原生窗口的正文页面。
     * @param selector 拖放起点或接收区域。
     * @returns 可供系统输入使用的坐标。
     * @throws 目标条目不可见时抛错，不发出系统拖放操作。
     */
    async function screenPoint(page: Page, selector: string): Promise<{ x: number; y: number }> {
      const bounds = await page.locator(selector).boundingBox()
      if (!bounds) throw new Error('拖放元素不可见')
      return app.evaluate(
        ({ BrowserWindow, screen }, { url, bounds }) => {
          const win = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL() === url)!
          // CDP点击不等同于Windows激活；真实系统拖放前显式聚焦源窗口。
          if (url.includes('tools-text-float.html')) win.focus()
          const origin = win.getContentBounds()
          return screen.dipToScreenPoint({
            x: Math.round(origin.x + bounds.x + bounds.width / 2),
            y: Math.round(origin.y + bounds.y + Math.min(30, bounds.height / 2))
          })
        },
        { url: page.url(), bounds }
      )
    }
    await firstText.click()
    await relay.locator('.entry:has-text("中转第二条") input').check()
    // 从左侧整列尝试拖动，不得向外部接收器交付文本或文件。
    nativeDrag(
      await screenPoint(relay, '.entry:has(.thumbnail) .selection-area'),
      await screenPoint(receiver, '#target')
    )
    await expect(receiver.locator('#target')).toHaveValue('')
    expect(
      await relay.evaluate(() =>
        (window as any).__dragLog.some((event: { type: string }) => event.type === 'dragstart')
      )
    ).toBe(false)
    await expect(relay.locator('.entry[aria-selected="true"]')).toHaveCount(2)
    nativeDrag(
      await screenPoint(relay, '.entry:has-text("中转第一条") .entry-content'),
      await screenPoint(receiver, '#target')
    )
    await expect(receiver.locator('#target')).toHaveValue('中转第二条\n\n中转第一条')
    await relay.locator('.entry').filter({ hasText: '文件示例.txt' }).click()
    nativeDrag(
      await screenPoint(relay, '.entry:has-text("文件示例.txt") .entry-content'),
      await screenPoint(receiver, '#files')
    )
    await fs.writeFile(
      info.outputPath('relay-drag-events.json'),
      JSON.stringify(await relay.evaluate(() => (window as any).__dragLog), null, 2)
    )
    await expect(receiver.locator('#files')).toHaveText('文件示例.txt')
    await relay
      .locator('.entry:has(.thumbnail)')
      .click({ modifiers: ['Control'], position: { x: 200, y: 18 } })
    await expect(relay.locator('.entry[aria-selected="true"]')).toHaveCount(2)
    await relay.getByRole('button', { name: '复制选中' }).click()
    await expect(relay.locator('#status')).toContainText('不能混合')
    nativeDrag(
      await screenPoint(relay, '.entry:has(.thumbnail) .entry-content'),
      await screenPoint(receiver, '#files')
    )
    await expect(relay.locator('#status')).toContainText('不能混合')
    await expect(receiver.locator('#files')).toHaveText('文件示例.txt')
    await expect(relay.locator('#status')).toHaveText('', { timeout: 6000 })
    await expect(relay.locator('#status')).not.toHaveClass(/error/)
    await relay.locator('.entry:has-text("文件示例.txt") input').uncheck()
    nativeDrag(
      await screenPoint(relay, '.entry:has(.thumbnail) .entry-content'),
      await screenPoint(receiver, '#files')
    )
    await expect(receiver.locator('#files')).toContainText('.png')
    // 即使绕过界面，宿主也拒绝混合复制，系统剪贴板不被部分覆盖。
    const rejected = await relay.evaluate(async () => {
      const entries = [...document.querySelectorAll('.entry')]
      const text = entries
        .find((row) => row.textContent?.includes('中转第一条'))!
        .getAttribute('data-id')!
      const image = document.querySelector('.entry:has(.thumbnail)')!.getAttribute('data-id')!
      return (window as any).textFloat.invoke('copy', [text, image]).then(
        () => '',
        (error: Error) => error.message
      )
    })
    expect(rejected).toContain('不能混合')
    await receiver.close()
    const { fileURLToPath } = await import('node:url')
    await relay.locator('.entry:has(.thumbnail)').getByRole('button', { name: '删除条目' }).click()
    await expect(relay.locator('.thumbnail')).toHaveCount(0)
    await expect
      .poll(() =>
        fs.stat(fileURLToPath(imagePath!)).then(
          () => true,
          () => false
        )
      )
      .toBe(false)
    await relay.getByRole('button', { name: '清空', exact: true }).click()
    await expect(relay.locator('.entry')).toHaveCount(0)
    expect(await fs.readFile(file, 'utf8')).toBe('临时文件内容')
    await app.evaluate(({ clipboard }) => clipboard.writeText('清空后的复制'))
    await expect(relay.locator('.entry pre')).toHaveText(['清空后的复制'])
    await relay.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => relay.isClosed()).toBe(true)
    await expect
      .poll(() =>
        fs.stat(fileURLToPath(imagePath!)).then(
          () => true,
          () => false
        )
      )
      .toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe('临时文件内容')
    await tools.locator('.sidebar').getByRole('button', { name: '悬浮中转', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-text-float.html'))
      )
      .toBe(true)
    const reopened = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-text-float.html'))!
    await expect(reopened.locator('.entry')).toHaveCount(0)
    await reopened.getByRole('button', { name: '关闭', exact: true }).click()
    await titlebar!.getByRole('button', { name: '临时常驻', exact: true }).click()
    await expect.poll(() => tools.isClosed()).toBe(true)
    await expect.poll(() => titlebar!.isClosed()).toBe(true)
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'floating-relay',
          name: '悬浮中转'
        }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-text-float.html'))
      )
      .toBe(true)
    const commandWindow = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-text-float.html'))!
    await expect(commandWindow.locator('.entry')).toHaveCount(0)
    const commands = plugin.features.find((feature) => feature.code === 'floating-relay')!
      .cmds as any[]
    expect(commands.filter((cmd) => typeof cmd === 'object').map((cmd) => cmd.type)).toEqual([
      'over',
      'img',
      'files'
    ])
  } finally {
    await app.close()
    await fs.writeFile(info.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
