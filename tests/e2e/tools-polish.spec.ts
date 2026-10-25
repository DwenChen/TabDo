import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('tool polish separates image floating, docks multi-text notes and restores original Finder categories', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(150000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-expanded-'))
  let application: ElectronApplication | undefined
  const logs: string[] = []
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
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const app = application,
      main = await app.firstWindow()
    // 等宿主装好 IPC 监听后再启动首个插件，避免冷启动时错过 opened 事件。
    await expect(main.locator('.plugin-host')).toBeAttached()
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    app
      .context()
      .on('page', (page) =>
        page.on('pageerror', (error) => logs.push('PAGE ERROR: ' + error.message))
      )
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((p) => p.name === 'system')
        )
      )
      .toBe(true)
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((p) => p.name === 'system')
    )
    const defaults = await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/api/shared/database.ts')
        .default.dbGet('auto-detach-plugin')
    )
    expect(defaults).not.toContain('system')
    /**
     * 通过系统鼠标坐标进入或离开便签，不伪造移动事件或页面悬停消息。
     * @param inside 是否进入当前便签。
     * @returns 鼠标移动完成后的 Promise。
     */
    async function moveNotePointer(inside: boolean): Promise<void> {
      await app.evaluate(({ app, BrowserWindow, screen }, inside) => {
        const win = BrowserWindow.getAllWindows().find((entry) => entry.getTitle() === '便签 1')!
        const b = win.getBounds(),
          area = screen.getDisplayMatching(b).workArea
        const physical = screen.dipToScreenPoint(
          inside
            ? { x: b.x + Math.floor(b.width / 2), y: b.y + Math.floor(b.height / 2) }
            : { x: area.x + area.width - 80, y: area.y + area.height - 80 }
        )
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
          .WindowManager.simulateMouseMove(physical.x, physical.y)
      }, inside)
    }
    /**
     * 确保便签选项面板已展开；贴靠状态变化可能已经把它收起。
     * @returns 面板展开后的 Promise。
     */
    async function openNoteOptions(): Promise<void> {
      const panel = note.locator('#note-options')
      if (!(await panel.isVisible())) await note.getByRole('button', { name: '便签选项' }).click()
      await expect(panel).toBeVisible()
    }
    /**
     * 从源码入口启动本轮工具，并等待新的工具正文。
     * @param code 工具指令标识。
     * @param param 用户匹配输入。
     * @returns 本次新建的工具页面。
     */
    async function launch(code: string, param?: any): Promise<Page> {
      await main.evaluate(
        async ({ plugin, code, param }) =>
          window.tabdo.launch({ path: plugin!.path, type: 'plugin', featureCode: code, param }),
        { plugin, code, param }
      )
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
      // 根据宿主当前 WebContents 身份选页，兼容同入口重入并排除收束旧页。
      const targetId = await app.evaluate(
        ({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
            .default.getCurrentPluginView()?.webContents.id
      )
      let current: Page | undefined
      await expect
        .poll(async () => {
          for (const page of app.context().pages()) {
            if (page.isClosed() || !page.url().startsWith('http://127.0.0.1:15178')) continue
            try {
              if (
                (await page.evaluate(() => (window as any).tabdo?.getWebContentsId())) === targetId
              ) {
                current = page
                return true
              }
            } catch {
              /* 退出中的旧会话不参与下一轮页面选择。 */
            }
          }
          return false
        })
        .toBe(true)
      return current!
    }
    /**
     * 直接保存工具 WebContentsView 的当前可见区域。
     * @param page 当前正文已稳定的工具页面。
     * @param name 截图文件名。
     * @returns 截图写入后的 Promise。
     */
    async function capture(page: Page, name: string): Promise<void> {
      const url = page.url()
      if (url.startsWith('http://127.0.0.1:15178'))
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-material', 'none')
          document.body.style.background = matchMedia('(prefers-color-scheme: dark)').matches
            ? '#202020'
            : '#ffffff'
        })
      await fs.writeFile(
        testInfo.outputPath(name),
        Buffer.from(
          await app.evaluate(
            async ({ webContents }, url) =>
              (
                await webContents
                  .getAllWebContents()
                  .find((entry) => entry.getURL() === url)!
                  .capturePage()
              )
                .toPNG()
                .toString('base64'),
            url
          ),
          'base64'
        )
      )
    }
    let tools = await launch('clipboard')
    await expect(tools.locator('.tab-item').first()).toBeVisible()
    const image = await tools.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 240
      const context = canvas.getContext('2d')!
      context.fillStyle = 'white'
      context.fillRect(0, 0, 600, 240)
      context.fillStyle = 'black'
      context.font = '30px sans-serif'
      context.fillText('Image annotation fixture', 40, 140)
      return canvas.toDataURL('image/png')
    })
    const imageFile = path.join(temporary, 'image fixture.png')
    await fs.writeFile(imageFile, Buffer.from(image.split(',')[1], 'base64'))
    // Existing file history is reclassified without changing its file-paste semantics.
    await app.evaluate(async ({ app }, file) => {
      const lmdb = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/lmdb/lmdbInstance.ts'
      ).default
      await lmdb.promises.put({
        _id: 'CLIPBOARD/fixture-image-file',
        type: 'file',
        timestamp: Date.now(),
        hash: 'image-file',
        preview: 'qr fixture.png',
        files: [{ path: file, name: 'qr fixture.png', isDirectory: false }]
      })
      await lmdb.promises.put({
        _id: 'CLIPBOARD/fixture-note',
        type: 'text',
        timestamp: Date.now() + 1,
        hash: 'note',
        content: '悬浮便签测试文字',
        preview: '悬浮便签测试文字'
      })
      await lmdb.promises.put({
        _id: 'CLIPBOARD/fixture-note-second',
        type: 'text',
        timestamp: Date.now() + 2,
        hash: 'note-second',
        content: '第二条选中的便签文字',
        preview: '第二条选中的便签文字'
      })
    }, imageFile)
    tools = await launch('clipboard')
    await expect(main.getByRole('button', { name: '插件操作', exact: true })).toHaveCount(0)
    await tools.locator('.tab-item').getByText('图像', { exact: true }).click()
    await expect(tools.locator('.image-preview img')).toHaveCount(1)
    await expect
      .poll(() =>
        tools.locator('.image-preview img').evaluate((img: HTMLImageElement) => img.naturalWidth)
      )
      .toBeGreaterThan(0)
    await tools.locator('.image-preview img').click({ button: 'right' })
    await tools.locator('.context-menu').getByText('悬浮固定', { exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-floating.html'))
      )
      .toBe(true)
    const imageFloat = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-floating.html'))!
    await expect(imageFloat.locator('#canvas')).toBeVisible()
    await expect
      .poll(() =>
        imageFloat.locator('#canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)
      )
      .toBe(600)
    await expect(imageFloat.locator('#image-tools')).toBeHidden()
    await expect(imageFloat.locator('#float-controls')).toBeVisible()
    await expect.poll(() => imageFloat.evaluate(() => innerHeight)).toBeLessThanOrEqual(248)
    const unchangedImage = await imageFloat
      .locator('#canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    await imageFloat.keyboard.press('t')
    await expect(imageFloat.getByLabel('标注文字')).toBeHidden()
    expect(
      await imageFloat
        .locator('#canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    ).toBe(unchangedImage)
    await capture(imageFloat, 'tools-image-float.png')
    await imageFloat.evaluate(() => (window as any).floating.invoke('close'))
    await expect.poll(() => imageFloat.isClosed()).toBe(true)
    await tools.locator('.image-preview img').click({ button: 'right' })
    await tools.locator('.context-menu').getByText('标记图片', { exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-floating.html'))
      )
      .toBe(true)
    const floating = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-floating.html'))!
    await expect(floating.locator('#canvas')).toBeVisible()
    await expect
      .poll(() => floating.locator('#canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width))
      .toBeGreaterThan(0)
    await expect(floating.locator('#status')).toContainText('Ctrl+S')
    const fitted = await floating.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      toolbar: document.getElementById('image-tools')!.offsetHeight
    }))
    // Windows 透明窗口首次显示的 DPI 换算允许少量客户区像素舍入。
    expect(Math.abs(fitted.width - 616)).toBeLessThanOrEqual(8)
    expect(Math.abs(fitted.height - (240 + fitted.toolbar + 16))).toBeLessThanOrEqual(8)
    await capture(floating, 'tools-image-toolbar-default.png')
    // 走窗口手柄使用的受限入口，避免绕过宿主保存的正常尺寸。
    await floating.evaluate(() =>
      (window as any).floating.invoke('resize', { width: 340, height: 520, direction: 'se' })
    )
    await expect.poll(() => floating.evaluate(() => innerWidth)).toBeLessThanOrEqual(342)
    await expect(floating.getByLabel('画笔颜色', { exact: true })).toBeVisible()
    await expect(floating.getByLabel('笔触大小', { exact: true })).toBeVisible()
    // 在修改画布和其他窗口之前保留窄窗口的实际可见正文。
    await floating.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await capture(floating, 'tools-image-toolbar-narrow.png')
    await fs.writeFile(
      testInfo.outputPath('annotation-toolbar-layout.json'),
      JSON.stringify(
        await floating.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          title: document.querySelector('.annotation-title')?.getBoundingClientRect().toJSON(),
          toolbar: document.getElementById('image-tools')!.getBoundingClientRect().toJSON()
        })),
        null,
        2
      )
    )
    await expect(floating.getByText('画笔设置', { exact: true })).toHaveCount(0)
    expect(await floating.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    )
    await expect(floating.getByLabel('基本配色')).toBeHidden()
    await floating.getByLabel('画笔颜色', { exact: true }).click()
    await floating.getByRole('button', { name: '蓝色', exact: true }).click()
    await expect(floating.getByLabel('基本配色')).toBeHidden()
    await expect(floating.locator('#color-preview')).toHaveCSS(
      'background-color',
      'rgb(0, 122, 255)'
    )
    await expect(floating.locator('[data-size]')).toHaveCount(5)
    await floating.getByRole('button', { name: '笔触 20 像素', exact: true }).click()
    await expect(
      floating.getByRole('button', { name: '笔触 20 像素', exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(floating.getByRole('button', { name: '查看', exact: true })).toHaveCount(0)
    await floating.getByRole('button', { name: '荧光笔', exact: true }).click()
    await expect(floating.locator('#color-preview')).toHaveCSS(
      'background-color',
      'rgb(238, 255, 0)'
    )
    await floating.getByRole('button', { name: '荧光笔颜色', exact: true }).click()
    await expect(floating.getByRole('button', { name: '黑色', exact: true })).toBeHidden()
    await expect(floating.getByRole('button', { name: '白色', exact: true })).toBeHidden()
    await floating.getByRole('button', { name: '绿色', exact: true }).click()
    await floating.getByRole('button', { name: '矩形', exact: true }).click()
    await expect(floating.locator('#color-preview')).toHaveCSS(
      'background-color',
      'rgb(0, 122, 255)'
    )
    await floating.getByRole('button', { name: '荧光笔', exact: true }).click()
    await expect(floating.locator('#color-preview')).toHaveCSS(
      'background-color',
      'rgb(52, 199, 89)'
    )
    await floating.getByRole('button', { name: '画笔', exact: true }).click()
    // 透明窗口的客户区与外框完全重合，不再保留系统标题栏和边框。
    expect(
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((entry) =>
          entry.webContents.getURL().includes('tools-floating.html')
        )!
        return {
          bounds: window.getBounds(),
          content: window.getContentBounds(),
          shadow: window.hasShadow()
        }
      })
    ).toEqual(expect.objectContaining({ shadow: false }))
    const bounds = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((entry) =>
        entry.webContents.getURL().includes('tools-floating.html')
      )!
      return [window.getBounds(), window.getContentBounds()]
    })
    expect(bounds[0].x).toBe(bounds[1].x)
    expect(bounds[0].y).toBe(bounds[1].y)
    // Windows 非整数缩放在 DIP/物理像素换算时可能相差 1px。
    expect(Math.abs(bounds[0].width - bounds[1].width)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds[0].height - bounds[1].height)).toBeLessThanOrEqual(1)
    // 最小宽度下每个操作仍处于工具栏的可见区域。
    expect(
      await floating.locator('#image-tools button, #size').evaluateAll((elements) =>
        elements
          .filter((element) => element.getBoundingClientRect().width)
          .every((element) => {
            const rect = element.getBoundingClientRect()
            return (
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.bottom <= document.getElementById('image-tools')!.getBoundingClientRect().bottom
            )
          })
      )
    ).toBe(true)
    const box = await floating.locator('#canvas').boundingBox()
    expect(box).toBeTruthy()
    await floating.mouse.move(box!.x + 20, box!.y + 20)
    await floating.mouse.down()
    await floating.mouse.move(box!.x + 70, box!.y + 65, { steps: 8 })
    await floating.mouse.up()
    await expect(floating.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
    // 真实点击画布并输入文字，防止焦点被画布默认行为立即抢走。
    await floating.getByRole('button', { name: '文字', exact: true }).click()
    const beforeText = await floating
      .locator('#canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    await floating.mouse.click(box!.x + 30, box!.y + 70)
    await expect(floating.getByLabel('标注文字')).toBeFocused()
    await floating.getByLabel('标注文字').fill('Annotation text')
    await floating.getByLabel('标注文字').press('Enter')
    await expect(floating.getByLabel('标注文字')).toBeHidden()
    expect(
      await floating.locator('#canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    ).not.toBe(beforeText)
    await floating.getByRole('button', { name: '复制图片' }).click()
    await expect(floating.locator('#status')).toHaveText('图片已复制')
    await capture(floating, 'tools-image-toolbar.png')
    // Tool runtime can be destroyed while the explicitly opened image window remains visible.
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.hideWindow()
    )
    await expect.poll(() => tools.isClosed()).toBe(true)
    await expect(floating.locator('#canvas')).toBeVisible()
    await floating.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => floating.isClosed()).toBe(true)

    tools = await launch('clipboard')
    await tools.locator('.tab-item').getByText('文本', { exact: true }).click()
    await expect(tools.getByRole('button', { name: '文字便签', exact: true })).toHaveCount(0)
    const textItem = tools.locator('.clipboard-item').filter({ hasText: '悬浮便签测试文字' })
    const secondText = tools.locator('.clipboard-item').filter({ hasText: '第二条选中的便签文字' })
    await textItem.locator('.selection-checkbox').check()
    await secondText.locator('.selection-checkbox').check()
    await expect(textItem.locator('.selection-checkbox')).toBeChecked()
    await textItem.getByRole('button', { name: '悬浮中转', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-text-float.html'))
      )
      .toBe(true)
    const textFloat = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-text-float.html'))!
    await textFloat.getByRole('combobox', { name: '条目排序' }).selectOption('oldest')
    await expect(textFloat.locator('.entry pre')).toHaveText([
      '第二条选中的便签文字',
      '悬浮便签测试文字'
    ])
    await textFloat.getByRole('button', { name: '关闭', exact: true }).click()
    // 便签贴靠专项从独立便签创建链验证，不再依赖剪贴板文字转交。
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/toolsFloating.ts')
        .openFloating({ type: 'text', text: '', newWindow: true })
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-floating.html'))
      )
      .toBe(true)
    const note = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-floating.html'))!
    await expect(note.getByLabel('便签内容')).toHaveValue('')
    await expect(note.locator('#note-label')).toHaveText('便签 1')
    await expect(note.locator('.frame')).toHaveCSS('background-color', 'rgb(243, 240, 189)')
    const noteSize = await note.evaluate(() => [innerWidth, innerHeight])
    expect(Math.abs(noteSize[0] - 300)).toBeLessThanOrEqual(1)
    expect(Math.abs(noteSize[1] - 280)).toBeLessThanOrEqual(1)
    await note.getByRole('button', { name: '保持置顶', exact: true }).click()
    await expect(note.locator('#note-top')).toHaveAttribute('aria-pressed', 'false')
    await note.getByRole('button', { name: '保持置顶', exact: true }).click()
    const west = (await note.locator('[data-resize="w"]').boundingBox())!
    await note.mouse.move(west.x + 2, west.y + west.height / 2)
    await note.mouse.down()
    await note.mouse.move(west.x + 52, west.y + west.height / 2, { steps: 5 })
    await note.mouse.up()
    await expect.poll(() => note.evaluate(() => innerWidth)).toBeLessThan(280)

    await note.getByRole('button', { name: '便签选项' }).click()
    await note.getByRole('button', { name: '天空蓝', exact: true }).click()
    await expect(note.locator('.frame')).toHaveCSS('background-color', 'rgb(189, 215, 243)')
    await note.getByLabel('便签内容').fill('本窗口临时编辑的便签\n关闭即结束，剪贴板原文保持不变。')
    await expect(note.locator('.frame')).toHaveCSS('clip-path', /polygon/)
    await note.getByRole('button', { name: '便签选项' }).click()
    await capture(note, 'tools-floating-note.png')
    await note.getByRole('button', { name: '新建便签', exact: true }).click()
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .filter((page) => page.url().includes('tools-floating.html')).length
      )
      .toBe(2)
    const nextNote = app
      .context()
      .pages()
      .find((page) => page !== note && page.url().includes('tools-floating.html'))!
    await expect(nextNote.getByLabel('便签内容')).toHaveValue('')
    await expect(nextNote.locator('#note-label')).toHaveText('便签 2')
    await expect(nextNote.locator('.frame')).toHaveCSS('background-color', 'rgb(193, 243, 189)')
    await nextNote.getByRole('button', { name: '关闭', exact: true }).click()
    // 在左侧工作区边缘贴靠；本专项不改动窗口坐标，只驱动页面在拖动释放时上报的动作。
    await app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((entry) => entry.getTitle() === '便签 1')!
      const area = screen.getDisplayMatching(window.getBounds()).workArea
      window.setPosition(area.x, area.y + 120)
    })
    await expect(note.locator('body')).toHaveAttribute('data-edge', 'left')
    await moveNotePointer(false)
    await expect(note.locator('body')).toHaveAttribute('data-edge', 'left')
    await expect(note.locator('body')).toHaveAttribute('data-dock', 'expanded')
    // 页面在拖动释放时上报 drag-end，宿主在尺寸稳定后收起为色签。
    await note.evaluate(() => (window as any).floating.invoke('drag-end'))
    await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed')
    // 竖排色签去掉标签里的空格；“便签1”之间的间距不再被拉开。
    await expect(note.locator('#note-dock-tab')).toHaveText('便签1')
    // 竖排色签的文字保持直立，编号 1 不能横躺。
    await expect(note.locator('#note-dock-tab')).toHaveCSS('text-orientation', 'upright')
    // Windows 的透明窗口尺寸在当前缩放下最多比 18 DIP 色签宽 2 DIP。
    await expect.poll(() => note.evaluate(() => innerWidth)).toBeLessThanOrEqual(22)
    await capture(note, 'tools-note-edge-tab.png')
    // 指针停在色签上不再自动展开，点击色签才解除贴靠。
    await moveNotePointer(true)
    await expect(note.locator('body')).toHaveAttribute('data-dock', 'collapsed')
    await note.locator('#note-dock-tab').click()
    await expect(note.locator('body')).toHaveAttribute('data-edge', '')
    await expect(note.getByLabel('便签内容')).toHaveValue(
      '本窗口临时编辑的便签\n关闭即结束，剪贴板原文保持不变。'
    )
    // 便签字号可调：改为 22 像素后正文立即跟随。
    await openNoteOptions()
    await note.getByLabel('便签字号').fill('22')
    await note.getByLabel('便签字号').dispatchEvent('change')
    await expect(note.getByLabel('便签内容')).toHaveCSS('font-size', '22px')
    await note.getByLabel('便签字号').fill('16')
    await note.getByLabel('便签字号').dispatchEvent('change')
    await expect(note.getByLabel('便签内容')).toHaveCSS('font-size', '16px')
    // 贴靠开关：关闭后移动到边缘不再登记贴靠，重新开启后恢复。
    const dockSwitch = note.getByLabel('贴靠屏幕边缘')
    await expect(dockSwitch).toBeChecked()
    await dockSwitch.uncheck()
    await expect(note.locator('body')).toHaveAttribute('data-edge', '')
    await app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((entry) => entry.getTitle() === '便签 1')!
      const area = screen.getDisplayMatching(window.getBounds()).workArea
      window.setPosition(area.x, area.y + 140)
    })
    await expect(note.locator('body')).toHaveAttribute('data-edge', '')
    await openNoteOptions()
    await dockSwitch.check()
    await expect(note.locator('body')).toHaveAttribute('data-edge', 'left')
    // 恢复至工作区内部，验证解除贴靠而非继续强制收起。
    await app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((entry) => entry.getTitle() === '便签 1')!
      const area = screen.getDisplayMatching(window.getBounds()).workArea
      window.setPosition(area.x + 200, area.y + 180)
    })
    await expect(note.locator('body')).toHaveAttribute('data-edge', '')
    await moveNotePointer(false)
    await expect(note.getByLabel('便签内容')).toBeVisible()
    await note.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => note.isClosed() && nextNote.isClosed()).toBe(true)
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/toolsFloating.ts')
        .openFloating({ type: 'text', text: '', newWindow: true })
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-floating.html'))
      )
      .toBe(true)
    const resetNote = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-floating.html'))!
    await expect(resetNote.locator('#note-label')).toHaveText('便签 1')
    await expect(resetNote.locator('.frame')).toHaveCSS('background-color', 'rgb(243, 240, 189)')
    await resetNote.getByRole('button', { name: '关闭', exact: true }).click()
    const searchFile = path.join(temporary, '搜索界面.txt')
    await fs.writeFile(searchFile, '文件搜索预览夹具')
    tools = await launch('local-search')
    await expect(tools.getByRole('button', { name: 'EXCEL', exact: true })).toBeVisible()
    await expect(tools.getByRole('status')).not.toContainText('正在查询', { timeout: 20000 })
    await expect(tools.locator('.finder-sidebar')).toBeVisible()
    // 连接真实 Everything 的电脑会立即列出文件，离线电脑则显示完整连接提示。
    await expect(tools.locator('.result-row, .search-empty').first()).toBeVisible()
    await capture(tools, 'tools-local-search.png')
    await tools.getByRole('button', { name: '文件搜索设置', exact: true }).click()
    await expect(
      tools.getByRole('heading', { name: 'Everything 安装与配置', exact: true })
    ).toBeVisible()
    await expect(tools.getByLabel('Everything 命名实例')).toHaveCount(0)
    expect(
      await tools
        .locator('.connection-panel')
        .evaluateAll((elements) =>
          elements.every((element) => element.scrollHeight <= element.clientHeight + 1)
        )
    ).toBe(true)
    await expect(tools.getByRole('heading', { name: '分组管理' })).toBeVisible()
    await tools.getByRole('heading', { name: '分组管理' }).scrollIntoViewIfNeeded()
    await capture(tools, 'tools-local-search-settings.png')
    await tools.getByRole('button', { name: '关闭文件搜索设置', exact: true }).click()
    // 仅替换 Everything 查询输出；预览仍真实读取隔离文件，验证列表与预览布局。
    await tools.evaluate((file) => {
      const bridge = (window as any).toolsFiles
      bridge.everything = async (input) => {
        ;(window as any).__searchInput = input
        ;((window as any).__searchCalls ||= []).push(input)
        return {
          state: 'ready',
          total: 1,
          items: [{ name: '搜索界面.txt', path: file, size: 24, isDirectory: false }]
        }
      }
    }, searchFile)
    // 空关键词时十个原分类立即查询；不需要先手动输入文件名。
    const categories = [
      ['文件夹', 'folder:'],
      ['EXCEL', 'ext:xls;xlsx;xlsm;csv'],
      ['WORD', 'ext:doc;docx;rtf'],
      ['PPT', 'ext:ppt;pptx'],
      ['PDF', 'ext:pdf'],
      ['图片', 'ext:jpg;jpeg;png;gif;webp;bmp;svg;ico'],
      ['视频', 'ext:mp4;mkv;avi;mov;wmv;flv;webm'],
      ['音频', 'ext:mp3;wav;flac;aac;ogg;m4a'],
      ['压缩文件', 'ext:zip;rar;7z;tar;gz;iso'],
      ['全部', '']
    ]
    for (const [label, rule] of categories) {
      await tools.getByRole('button', { name: label, exact: true }).click()
      await expect.poll(() => tools.evaluate(() => (window as any).__searchInput?.query)).toBe(rule)
      expect(await tools.evaluate(() => (window as any).__searchInput?.enumerate)).toBe(true)
    }
    await main.getByPlaceholder('全盘搜索', { exact: true }).fill('搜索界面')
    await expect(
      tools.getByRole('listbox', { name: '文件搜索结果' }).getByRole('option')
    ).toHaveCount(1)
    await tools.getByRole('listbox', { name: '文件搜索结果' }).getByRole('option').click()
    await tools.getByLabel('文件预览开关').locator('..').click()
    await expect(tools.locator('.search-preview pre')).toHaveText('文件搜索预览夹具')
    expect(
      await tools
        .locator('.finder-footer svg')
        .evaluateAll((elements) =>
          elements.every(
            (element) =>
              element.getBoundingClientRect().width <= 20 &&
              element.getBoundingClientRect().height <= 20
          )
        )
    ).toBe(true)
    await capture(tools, 'tools-local-search-results.png')
    await tools.getByRole('button', { name: '排序方式', exact: true }).click()
    await expect(tools.locator('.sort-option')).toHaveCount(8)
    await tools.getByRole('button', { name: '按名称升序', exact: true }).click()
    await expect.poll(() => tools.evaluate(() => (window as any).__searchInput?.sort)).toBe(1)
    const splitter = tools.getByTitle('拖动调整侧边栏宽度，双击恢复默认')
    const splitBox = (await splitter.boundingBox())!
    await tools.mouse.move(splitBox.x + 3, splitBox.y + 60)
    await tools.mouse.down()
    await tools.mouse.move(splitBox.x + 45, splitBox.y + 60, { steps: 5 })
    await tools.mouse.up()
    expect(
      await tools
        .locator('.finder-sidebar-pane')
        .evaluate((element) => element.getBoundingClientRect().width)
    ).toBeGreaterThan(90)
    await tools.getByRole('button', { name: 'PDF', exact: true }).click()
    await expect
      .poll(() => tools.evaluate(() => (window as any).__searchInput?.query))
      .toBe('搜索界面 ext:pdf')

    const pids = await app.evaluate(({ webContents }) => {
      const cp = process.mainModule!.require('node:child_process')
      const owner = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
        .getOSProcessId()
      return cp
        .execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.ParentProcessId -eq ${owner} } | Select-Object -ExpandProperty ProcessId`
          ],
          { encoding: 'utf8', windowsHide: true }
        )
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
    })
    expect(pids.length).toBe(1)
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.hideWindow()
    )
    await expect.poll(() => tools.isClosed()).toBe(true)
    await expect
      .poll(() =>
        app.evaluate(
          (_electron, pids) =>
            pids.some((pid) => {
              try {
                process.kill(pid, 0)
                return true
              } catch {
                return false
              }
            }),
          pids
        )
      )
      .toBe(false)
  } finally {
    await application?.close()
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
