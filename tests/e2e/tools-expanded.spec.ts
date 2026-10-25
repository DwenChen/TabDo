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
import qrFixture from '../fixtures/tools-qr.json'

test('expanded tools classify image files, rename safely, scan QR and own floating windows', async ({
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
    // 此专项检查工具内容，外部桌面焦点不应中断扫码或设置验证；显式隐藏仍正常执行。
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      void manager.withBlurHideSuppressed(
        () =>
          new Promise((resolve) => {
            ;(globalThis as any).__releaseExpandedFocus = resolve
          })
      )
    })
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
      await expect
        .poll(() =>
          app
            .context()
            .pages()
            .some((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178'))
        )
        .toBe(true)
      return app
        .context()
        .pages()
        .find((page) => !page.isClosed() && page.url().startsWith('http://127.0.0.1:15178'))!
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
    // Real QR pixels are generated from a fixed matrix, then decoded by the actual Worker.
    await app.evaluate(({ clipboard }) => clipboard.writeText('二维码空状态验证'))
    let tools = await launch('qrcode-scan')
    // 子组件不再自带标题与说明，入口控件即正文内容。
    await expect(tools.getByText('选择图片', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(tools.locator('.qr-empty')).toBeVisible()
    await expect(tools.getByRole('button', { name: '复制内容', exact: true })).toBeDisabled()
    // 空态就保留左右两栏，扫描结束后不再改变布局方向或窗口比例。
    await expect
      .poll(() =>
        tools.evaluate(() => document.querySelector('.qr-page')!.clientHeight <= innerHeight)
      )
      .toBe(true)
    await capture(tools, 'tools-qr-empty.png')
    const image = await tools.evaluate((matrix) => {
      const scale = 8,
        canvas = document.createElement('canvas')
      canvas.width = canvas.height = matrix.length * scale
      const context = canvas.getContext('2d')!
      context.fillStyle = 'white'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'black'
      matrix.forEach((row, y) =>
        row.forEach((filled, x) => {
          if (filled) context.fillRect(x * scale, y * scale, scale, scale)
        })
      )
      return canvas.toDataURL('image/png')
    }, qrFixture.matrix)
    const imageFile = path.join(temporary, 'qr fixture.png')
    await fs.writeFile(imageFile, Buffer.from(image.split(',')[1], 'base64'))
    await tools.locator('input[type=file]').setInputFiles(imageFile)
    await expect(tools.getByLabel('二维码内容')).toHaveValue(qrFixture.text)
    const qrGeometry = await tools.evaluate(() => {
      const left = document.querySelector('.qr-source')!.getBoundingClientRect()
      const right = document.querySelector('.qr-result')!.getBoundingClientRect()
      const image = document.querySelector('.qr-image') as HTMLImageElement
      const box = image.getBoundingClientRect()
      const renderedWidth = Math.min(
        box.width,
        (box.height * image.naturalWidth) / image.naturalHeight
      )
      return {
        separated: left.right < right.left,
        aligned: Math.abs(left.top - right.top) <= 1,
        imageFill: renderedWidth / left.width,
        overflow: document.documentElement.scrollWidth > innerWidth
      }
    })
    expect(qrGeometry).toEqual({
      separated: true,
      aligned: true,
      imageFill: expect.any(Number),
      overflow: false
    })
    expect(qrGeometry.imageFill).toBeGreaterThan(0.85)
    await expect.poll(() => main.evaluate(() => innerWidth / innerHeight)).toBeLessThan(1.35)
    await tools.getByRole('button', { name: '复制内容', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(qrFixture.text)
    await app.evaluate(({ shell }) => {
      ;(globalThis as any).__toolLinks = []
      shell.openExternal = async (url) => {
        ;(globalThis as any).__toolLinks.push(url)
      }
    })
    await tools.getByRole('link', { name: /默认浏览器打开/ }).click()
    expect(await app.evaluate(() => (globalThis as any).__toolLinks)).toContain(qrFixture.text)
    await capture(tools, 'tools-qr.png')
    await tools.emulateMedia({ colorScheme: 'dark' })
    await expect(tools.locator('.qr-page')).toHaveCSS('color', 'rgb(224, 224, 224)')
    await capture(tools, 'tools-qr-dark.png')
    await tools.emulateMedia({ colorScheme: 'light' })

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
    }, imageFile)
    tools = await launch('clipboard')
    const referenceFont = await tools
      .locator('.clipboard-app')
      .evaluate((element) => getComputedStyle(element).fontFamily)
    await expect(main.getByRole('button', { name: '插件操作', exact: true })).toHaveCount(0)
    await tools.locator('.tab-item').getByText('图像', { exact: true }).click()
    await expect(tools.locator('.image-preview img')).toHaveCount(1)
    await expect
      .poll(() =>
        tools.locator('.image-preview img').evaluate((img: HTMLImageElement) => img.naturalWidth)
      )
      .toBeGreaterThan(0)
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
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes('tools-floating.html'))!
        .setSize(340, 520)
    )
    await expect(floating.getByLabel('画笔颜色', { exact: true })).toBeVisible()
    await expect(floating.getByLabel('笔触大小', { exact: true })).toBeVisible()
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

    // 文本悬浮与便签分离，具体选择与追加由 clipboard-interactions 专项覆盖。
    tools = await launch('floating-relay', { type: 'over', payload: '匹配文字优先于剪贴板图片' })
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-text-float.html'))
      )
      .toBe(true)
    const matchedText = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-text-float.html'))!
    await expect(matchedText.locator('.entry pre')).toHaveText(['匹配文字优先于剪贴板图片'])
    await matchedText.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => matchedText.isClosed()).toBe(true)

    // 独立指令创建空白便签；编辑区内 Ctrl+N 可主动再建一张。
    tools = await launch('sticky-note')
    // 入口在转交到独立窗口后可立即退役，验收目标是独立便签正文。
    expect(plugin!.features.some((entry) => entry.code === 'sticky-note')).toBe(true)
    // 只开独立窗口的子组件声明为 mainHide，面板或快捷键启动时不再闪出宿主页面。
    expect(
      await app.evaluate(({ app }, pluginPath) => {
        const manager = process.mainModule!.require(
          app.getAppPath() + '/src/main/managers/pluginManager.ts'
        ).default
        return ['sticky-note', 'float-content', 'image-annotate'].map((code) =>
          manager.shouldKeepMainWindowHidden(pluginPath, code)
        )
      }, plugin!.path)
    ).toEqual([true, true, true])
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-floating.html'))
      )
      .toBe(true)
    // 转交完成后入口页面立即退役，宿主窗口随之隐藏。
    await expect
      .poll(() =>
        app.evaluate(({ app }) =>
          process
            .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
            .default.getMainWindow()
            .isVisible()
        )
      )
      .toBe(false)
    const standaloneNote = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-floating.html'))!
    await expect(standaloneNote.getByLabel('便签内容')).toHaveValue('')
    await standaloneNote.getByLabel('便签内容').press('Control+n')
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .filter((page) => page.url().includes('tools-floating.html')).length
      )
      .toBe(2)
    const shortcutNote = app
      .context()
      .pages()
      .find((page) => page !== standaloneNote && page.url().includes('tools-floating.html'))!
    await expect(shortcutNote.getByLabel('便签内容')).toHaveValue('')
    await shortcutNote.getByRole('button', { name: '关闭', exact: true }).click()
    await standaloneNote.getByRole('button', { name: '关闭', exact: true }).click()
    await expect.poll(() => standaloneNote.isClosed() && shortcutNote.isClosed()).toBe(true)

    // 首张窗口尚在异步加载时连续收到文字，也必须合并到同一会话且不丢条目。
    const queuedIds = await app.evaluate(async ({ app }) => {
      const { openFloating } = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/toolsFloating.ts'
      )
      return Promise.all([
        openFloating({ type: 'text', text: '初始化条目' }),
        openFloating({ type: 'text', text: '排队追加条目' })
      ])
    })
    expect(queuedIds[0]).toBe(queuedIds[1])
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('tools-floating.html'))
      )
      .toBe(true)
    const queuedNote = app
      .context()
      .pages()
      .find((page) => page.url().includes('tools-floating.html'))!
    await expect(queuedNote.getByLabel('便签内容')).toHaveValue('初始化条目\n\n排队追加条目')
    await queuedNote.getByRole('button', { name: '关闭', exact: true }).click()

    const renameFile = path.join(temporary, 'before.txt')
    await fs.writeFile(renameFile, 'rename data')
    tools = await launch('file-renamer', {
      type: 'files',
      payload: [{ path: renameFile, name: 'before.txt', isDirectory: false }]
    })
    await expect(tools.locator('.rename-preview')).toBeVisible()
    await expect(tools.locator('.file-row')).toHaveCount(1)
    await expect(tools.locator('.rename-tabs button')).toHaveText([
      '自动编号',
      '查找替换',
      '规则清理',
      '插入内容',
      '手动编辑',
      '智能重命名'
    ])
    await expect(tools.locator('.number-panel .number-card')).toBeVisible()
    await expect(tools.locator('.file-name')).toHaveCSS('font-family', referenceFont)
    await expect(tools.getByLabel('编号前缀')).toHaveCSS('font-family', referenceFont)
    await expect(tools.locator('.rename-tabs button.active')).toHaveCSS('color', 'rgb(5, 150, 105)')
    await expect(tools.getByRole('button', { name: '执行重命名' })).toHaveCSS(
      'background-color',
      'rgb(5, 150, 105)'
    )
    await tools.getByLabel('编号前缀').fill('课程_')
    await expect(tools.locator('.target-name')).toHaveText('课程_001.txt')
    await tools.getByLabel('序号类型', { exact: true }).selectOption('chinese-lower')
    await expect(tools.locator('.target-name')).toHaveText('课程_一.txt')
    expect(
      await tools.locator('.rename-preview').evaluate((el) => el.getBoundingClientRect().height)
    ).toBeGreaterThan(180)
    await capture(tools, 'tools-renamer-numbering.png')
    await tools.emulateMedia({ colorScheme: 'dark' })
    await expect(tools.locator('.file-name')).toHaveCSS('color', 'rgb(224, 224, 224)')
    await expect(tools.locator('.file-name')).toHaveCSS('font-family', referenceFont)
    await capture(tools, 'tools-renamer-dark.png')
    await tools.emulateMedia({ colorScheme: 'light' })
    await tools.getByLabel('启用自动编号').uncheck()
    await tools.getByRole('button', { name: '查找替换', exact: true }).click()
    await expect(tools.locator('.replace-panel .input-row')).toBeVisible()
    await tools.getByPlaceholder('输入要查找的字符...').fill('before')
    await tools.getByPlaceholder('输入替换目标内容...').fill('renamed')
    await expect(tools.locator('.target-name')).toHaveText('renamed.txt')
    await capture(tools, 'tools-renamer-replace.png')
    await tools.getByLabel('启用查找替换').uncheck()
    await tools.getByRole('button', { name: '规则清理', exact: true }).click()
    await expect(tools.getByLabel('启用大小写转换')).toBeVisible()
    await tools.getByLabel('启用规则清理').check()
    await tools.getByLabel('启用大小写转换').check()
    await tools.getByLabel('大小写模式').selectOption('upper')
    await expect(tools.locator('.target-name')).toHaveText('BEFORE.txt')
    await tools.getByRole('button', { name: '扩展名处理', exact: true }).click()
    await expect(tools.getByLabel('启用扩展名处理')).toBeVisible()
    await expect(tools.getByLabel('启用大小写转换')).toBeHidden()
    await tools.getByLabel('启用扩展名处理').check()
    await tools.getByLabel('新扩展名').fill('md')
    await expect(tools.locator('.target-name')).toHaveText('BEFORE.md')
    await capture(tools, 'tools-renamer-clean.png')
    await tools.getByLabel('启用规则清理').uncheck()
    await tools.getByRole('button', { name: '插入内容' }).click()
    await tools.getByLabel('启用插入内容').check()
    await tools.getByRole('button', { name: '开头', exact: true }).click()
    await tools.getByLabel('插入文本').fill('after_')
    await expect(tools.locator('.target-name').first()).toHaveText('after_before.txt')
    // 单击直接执行仍须先校验，目标占用时不改动原文件，也不能覆盖目标文件。
    const occupiedTarget = path.join(temporary, 'after_before.txt')
    await fs.writeFile(occupiedTarget, 'existing target')
    await tools.getByRole('button', { name: '刷新预览', exact: true }).click()
    await expect(tools.locator('.error-tag')).toHaveText('目标已存在')
    await expect(tools.getByRole('button', { name: '执行重命名' })).toBeDisabled()
    expect(await fs.readFile(renameFile, 'utf8')).toBe('rename data')
    expect(await fs.readFile(occupiedTarget, 'utf8')).toBe('existing target')
    await fs.unlink(occupiedTarget)
    await tools.getByRole('button', { name: '刷新预览', exact: true }).click()
    await tools.getByRole('button', { name: '执行重命名' }).click()
    await expect(tools.getByRole('dialog', { name: '确认重命名' })).toHaveCount(0)
    await expect(tools.locator('.rename-message > span')).toHaveText('已重命名 1 项')
    expect(await fs.readFile(path.join(temporary, 'after_before.txt'), 'utf8')).toBe('rename data')
    await tools.getByRole('button', { name: '撤销重命名' }).click()
    await expect(tools.locator('.rename-message > span')).toHaveText('已撤销上次改名')
    expect(await fs.readFile(renameFile, 'utf8')).toBe('rename data')
    await capture(tools, 'tools-renamer.png')
    await tools.getByRole('button', { name: '手动编辑', exact: true }).click()
    await expect(tools.getByLabel('before.txt 的新文件名')).toBeVisible()
    await expect(tools.getByLabel('before.txt 的新文件名')).toHaveCSS('font-family', referenceFont)
    await tools.getByLabel('before.txt 的新文件名').fill('invalid/name.txt')
    await expect(tools.getByRole('button', { name: '执行重命名' })).toBeDisabled()
    await expect(tools.locator('.error-tag')).toHaveText('文件名无效')
    await tools.getByLabel('before.txt 的新文件名').fill('manual.txt')
    await expect(tools.getByRole('button', { name: '执行重命名' })).toBeEnabled()
    await capture(tools, 'tools-renamer-manual.png')
    await tools.getByRole('button', { name: '智能重命名', exact: true }).click()
    await expect(tools.getByLabel('智能重命名描述')).toBeVisible()
    await tools.getByRole('button', { name: '刷新模型', exact: true }).click()
    await expect(tools.locator('.rename-message')).toContainText('未检测到可用 AI 模型')
    await expect(tools.locator('.rename-message')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    )
    expect(
      await tools.locator('.rename-message').evaluate((element) => {
        const preview = document.querySelector('.rename-preview')!.getBoundingClientRect()
        return element.getBoundingClientRect().top >= preview.bottom
      })
    ).toBe(true)
    await capture(tools, 'tools-renamer-smart.png')

    tools = await launch('local-search')
    await expect(tools.getByRole('status')).not.toContainText('正在查询', { timeout: 20000 })
    await expect(tools.locator('.finder-sidebar')).toBeVisible()
    // 已连接 Everything 的电脑会立即列出文件，离线电脑显示完整连接指引。
    await expect(tools.locator('.result-row, .search-empty').first()).toBeVisible()
    await capture(tools, 'tools-local-search.png')
    await tools.getByRole('button', { name: '文件搜索设置', exact: true }).click()
    await expect(tools.getByLabel('Everything 命名实例')).toHaveCount(0)
    await expect(tools.getByLabel('搜索方式')).toContainText('使用正则表达式')
    await expect(tools.getByLabel('搜索方式')).toContainText('Report 与 report')
    await tools
      .getByLabel('搜索方式')
      .getByRole('checkbox', { name: /^使用正则表达式/ })
      .check()
    await tools
      .getByLabel('搜索方式')
      .getByRole('checkbox', { name: /^区分大小写/ })
      .check()
    expect(
      await tools.evaluate(() => window.tabdo.dbStorage.getItem('local-search-preferences'))
    ).toMatchObject({ regex: true, matchCase: true })
    await expect(tools.getByLabel('Everything 连接指引').getByRole('checkbox')).toHaveCount(0)
    await expect(
      tools.getByRole('button', { name: '文件搜索设置', exact: true }).locator('svg')
    ).toHaveCount(1)
    await expect(tools.getByRole('button', { name: '关闭文件搜索设置', exact: true })).toHaveCount(
      1
    )
    await expect(tools.locator('.settings-drawer')).toHaveCSS('opacity', '1')
    await tools
      .locator('.settings-drawer')
      .evaluate((element) =>
        Promise.allSettled(element.getAnimations().map((animation) => animation.finished))
      )
    await capture(tools, 'tools-search-settings.png')
    await tools.getByRole('button', { name: '关闭文件搜索设置', exact: true }).click()

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
    // A long translation keeps its complete text and supports scrolling.
    await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/superPanelManager.ts'
      ).default
      manager.showWindow(100, 100)
      manager.sendToSuperPanel('super-panel-data', {
        type: 'search',
        results: [],
        clipboardContent: { type: 'text', text: 'scrolling source' }
      })
      manager.sendToSuperPanel('super-panel-translation', {
        sourceText: 'scrolling source',
        text: '这是长翻译内容。\n'.repeat(100) + '完整译文末尾'
      })
    })
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().includes('super-panel.html'))
      )
      .toBe(true)
    const panel = app
      .context()
      .pages()
      .find((page) => page.url().includes('super-panel.html'))!
    await expect(panel.getByLabel('翻译结果')).toContainText('完整译文末尾')
    expect(
      await panel.getByLabel('翻译结果').evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return (
          element.scrollHeight > element.clientHeight &&
          element.scrollTop > 0 &&
          getComputedStyle(element).userSelect === 'text'
        )
      })
    ).toBe(true)
    const floatingCommands = plugin!.features.find((entry) => entry.code === 'float-content')!
      .cmds as any[]
    expect(
      (plugin!.features.find((entry) => entry.code === 'floating-relay')!.cmds as any[]).find(
        (cmd) => cmd.type === 'over'
      )?.label
    ).toBe('悬浮中转')
    expect(floatingCommands.find((cmd) => cmd.type === 'img')?.label).toBe('悬浮图片')
    await capture(panel, 'tools-translation-scroll.png')
    expect(
      plugin!.features
        .filter((entry) => ['image-annotate', 'float-content', 'qrcode-scan'].includes(entry.code))
        .every(
          (entry) =>
            entry.cmds.some((cmd: any) => cmd.type === 'img') &&
            entry.cmds.some((cmd: any) => cmd.type === 'files')
        )
    ).toBe(true)
  } finally {
    await application?.close()
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
