import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('全屏、实体键帽、手绘遮罩、动画保存与逐帧导出', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(240000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-visual-effects-'))
  let app: ElectronApplication | undefined
  const logs: string[] = []
  try {
    const sample = path.join(temporary, '视觉样片.mp4')
    execFileSync(
      ffmpeg!,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=15',
        '-t',
        '5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        sample
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    await fs.writeFile(
      sample + '.cursor.json',
      JSON.stringify({
        version: 1,
        samples: ['a', 'Space', 'Ctrl + S', 'Enter'].map((keyText, index) => ({
          timeMs: 200 + index * 200,
          cx: 0.4,
          cy: 0.4,
          keyText
        }))
      })
    )
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
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
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    app.context().on('page', (page) => {
      page.on('pageerror', (error) => logs.push(`${page.url()}: ${error.stack}`))
      page.on('console', (event) => {
        if (event.type() === 'error') logs.push(event.text())
      })
    })
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((page) => page.url().startsWith('http://127.0.0.1:15177')),
        { timeout: 30000 }
      )
      .toBe(true)
    await expect(
      app
        .context()
        .pages()
        .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
        .getByText('超级面板', { exact: true })
        .first()
    ).toBeVisible({ timeout: 30000 })
    await main.evaluate(async () => {
      const plugin = (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')!
      await window.tabdo.launch({
        path: plugin.path,
        type: 'plugin',
        featureCode: 'presentation-recorder'
      })
    })
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((page) => page.url().includes('windowType=hud-overlay')),
        { timeout: 30000 }
      )
      .toBe(true)
    const hud = app
      .context()
      .pages()
      .find((page) => page.url().includes('windowType=hud-overlay'))!
    await expect(hud.getByRole('button', { name: '演示编辑器', exact: true })).toBeVisible({
      timeout: 30000
    })
    await expect(hud.locator('[data-keyboard-capture="off"] > svg')).toHaveCount(2)
    await hud.getByRole('button', { name: '演示编辑器', exact: true }).click()
    const tool = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    const errors: string[] = []
    tool.on('pageerror', (error) => errors.push(error.message))
    const frame = tool.frameLocator('iframe')
    await expect(frame.getByRole('dialog', { name: '演示项目', exact: true })).toBeVisible({
      timeout: 60000
    })
    await frame.getByRole('dialog', { name: '演示项目', exact: true }).press('Escape')
    // 主进程闲置回收偶尔丢弃调试器结果；仅重试同一项幂等对话框夹具设置。
    await expect
      .poll(
        async () => {
          try {
            return await app!.evaluate(({ dialog }, file) => {
              dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
              return true
            }, sample)
          } catch (error) {
            if (String(error).includes('Resulting promise was garbage collected')) return false
            throw error
          }
        },
        { timeout: 10000 }
      )
      .toBe(true)
    await frame.getByRole('button', { name: '导入视频', exact: true }).click()
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    const iframe = tool.frames().find((item) => item.url().includes('presentation.html'))!
    await expect
      .poll(
        async () =>
          (await iframe.evaluate(async () => window.electronAPI.listProjectFiles())).entries.length
      )
      .toBeGreaterThan(0)
    const projectPath = (await iframe.evaluate(async () => window.electronAPI.listProjectFiles()))
      .entries[0].path
    /**
     * 读取实际自动保存模型，核对参数与历史是否进入持久链。
     * @returns 当前项目编辑状态。
     */
    async function saved(): Promise<any> {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }
    const cap = frame.getByTestId('playhead-cap')
    await expect.poll(async () => (await saved()).annotationRegions.length).toBe(4)
    await cap.press('Home')
    await cap.press('Shift+ArrowRight')
    await expect(frame.locator('[data-keycaps]')).toHaveCount(1)
    await expect(frame.locator('[data-keycaps]')).toHaveAttribute('aria-label', 'A ␣ Ctrl S ↵')
    expect(
      await frame.locator('[data-preview-frame]').evaluate((node) => getComputedStyle(node).cursor)
    ).toBe('default')
    // 全屏复用同一画布，退出后仍能继续调整原项目。
    await expect(
      frame.locator('[data-preview-frame]').getByRole('button', { name: '全屏预览', exact: true })
    ).toHaveCount(0)
    const volumeBounds = (await frame
      .getByRole('button', { name: '预览音量', exact: true })
      .boundingBox())!
    const fullscreenBounds = (await frame
      .getByRole('button', { name: '全屏预览', exact: true })
      .boundingBox())!
    expect(fullscreenBounds.x).toBeGreaterThan(volumeBounds.x)
    await iframe.evaluate(() => {
      ;(window as any).__previewVideo = document.querySelector('video')
    })
    await frame.getByRole('button', { name: '全屏预览', exact: true }).click()
    await expect.poll(() => iframe.evaluate(() => !!document.fullscreenElement)).toBe(true)
    await expect(frame.getByRole('button', { name: '播放全屏预览', exact: true })).toBeVisible()
    const progress = frame.getByRole('slider', { name: '全屏播放进度', exact: true })
    const progressBounds = (await progress.boundingBox())!
    await tool.mouse.click(
      progressBounds.x + progressBounds.width * 0.2,
      progressBounds.y + progressBounds.height / 2
    )
    await expect
      .poll(() => iframe.evaluate(() => document.querySelector('video')!.currentTime))
      .toBeCloseTo(1, 0)
    await tool.screenshot({ path: testInfo.outputPath('fullscreen-keycaps.png') })
    await frame.getByRole('button', { name: '退出全屏预览', exact: true }).click()
    await expect.poll(() => iframe.evaluate(() => !!document.fullscreenElement)).toBe(false)
    expect(
      await iframe.evaluate(
        () => (window as any).__previewVideo === document.querySelector('video')
      )
    ).toBe(true)
    await expect(frame.getByRole('slider', { name: '播放进度', exact: true })).toBeVisible()
    // 模拟本地嵌套页面拒绝 DOM 全屏：必须走真实宿主窗口并通过 Esc 恢复。
    await iframe.evaluate(() => {
      ;(window as any).__originalFullscreen = Element.prototype.requestFullscreen
      Element.prototype.requestFullscreen = () =>
        Promise.reject(new TypeError('Fullscreen blocked'))
    })
    await frame.getByRole('button', { name: '全屏预览', exact: true }).click()
    await expect(frame.locator('[data-fullscreen-preview="true"]')).toBeVisible()
    await expect(frame.getByRole('button', { name: '导入项目', exact: true })).not.toBeVisible()
    await expect
      .poll(() =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((w) => w.isFullScreen())
        )
      )
      .toBe(true)
    await tool.screenshot({ path: testInfo.outputPath('native-fullscreen-fallback.png') })
    const fullView = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((window) => window.isFullScreen())!
      const view = win.contentView.children.find((child) => 'webContents' in child)!
      return { view: view.getBounds(), content: win.getContentBounds() }
    })
    expect(fullView.view.y).toBe(0)
    expect(fullView.view.height).toBe(fullView.content.height)
    await frame.getByRole('slider', { name: '全屏播放进度', exact: true }).press('Home')
    await expect
      .poll(() => iframe.evaluate(() => document.querySelector('video')!.currentTime))
      .toBeCloseTo(0, 1)
    await frame.getByRole('button', { name: '退出全屏预览', exact: true }).press('Escape')
    await expect(frame.locator('[data-fullscreen-preview="true"]')).toHaveCount(0)
    await expect
      .poll(() =>
        app!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((w) => w.isFullScreen())
        )
      )
      .toBe(false)
    // 两条路径同时失败也只产生局部提示，关闭提示后可继续编辑同一项目。
    await iframe.evaluate(() => {
      ;(window as any).__nativeFullscreen = window.electronAPI.setPreviewFullscreen
      window.electronAPI.setPreviewFullscreen = () =>
        Promise.reject(new Error('Native fullscreen blocked'))
    })
    await frame.getByRole('button', { name: '全屏预览', exact: true }).click()
    await expect(frame.locator('.presentation-preview-fullscreen [role="status"]')).toContainText(
      '无法切换全屏预览'
    )
    await frame.getByRole('button', { name: '关闭全屏提示', exact: true }).click()
    await expect(frame.getByText('无法切换全屏预览，请重试。', { exact: true })).toHaveCount(0)
    await iframe.evaluate(() => {
      Element.prototype.requestFullscreen = (window as any).__originalFullscreen
      window.electronAPI.setPreviewFullscreen = (window as any).__nativeFullscreen
    })
    await cap.press('Home')
    await cap.press('Shift+ArrowRight')
    await frame.getByLabel('编辑工具').getByLabel('按键', { exact: true }).click()
    await frame.getByRole('row', { name: '机械键盘', exact: true }).click()
    const gap = frame.getByRole('slider', { name: '按键分组最大间隔', exact: true })
    await gap.focus()
    await gap.press('ArrowLeft')
    await expect.poll(async () => (await saved()).annotationRegions[0].style.inputGapMs).toBe(750)
    await expect(frame.getByRole('slider', { name: '显示区域高度', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('slider', { name: '字号', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('combobox', { name: '进入效果', exact: true })).toHaveValue('none')
    await expect(frame.getByRole('slider', { name: '动画时长', exact: true })).toHaveCount(0)
    const size = frame.getByRole('slider', { name: '键帽大小', exact: true })
    const originalSize = (await saved()).annotationRegions[0].size
    await size.focus()
    await size.press('ArrowRight')
    await expect.poll(async () => (await saved()).annotationRegions[0].style.keycapScale).toBe(1.05)
    await expect
      .poll(async () => (await saved()).annotationRegions[0].size.height)
      .toBeCloseTo(originalSize.height * 1.05)
    const originalColor = (await saved()).annotationRegions[0].style.color
    const originalBackground = (await saved()).annotationRegions[0].style.backgroundColor
    await frame.getByRole('button', { name: '按键文字颜色', exact: true }).click()
    await expect(frame.getByRole('dialog', { name: '按键文字颜色', exact: true })).toBeVisible()
    await expect(
      frame
        .getByRole('dialog', { name: '按键文字颜色', exact: true })
        .getByText('十六进制颜色', { exact: true })
    ).toBeVisible()
    const textColorMenu = frame.getByRole('dialog', { name: '按键文字颜色', exact: true })
    const hexColor = textColorMenu.getByRole('textbox')
    await expect(hexColor).toBeInViewport()
    await hexColor.fill('#FFFFFF')
    await hexColor.press('Tab')
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.color.toLowerCase())
      .toBe('#ffffff')
    await tool.screenshot({
      path: testInfo.outputPath('keyboard-color-picker.png'),
      animations: 'disabled'
    })
    await frame.getByRole('dialog', { name: '按键文字颜色', exact: true }).press('Escape')
    await frame.getByRole('button', { name: '撤销', exact: true }).click()
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.color)
      .toBe(originalColor)
    await frame.getByRole('button', { name: '按键底色', exact: true }).click()
    await frame
      .getByRole('dialog', { name: '按键底色', exact: true })
      .getByRole('button', { name: '清除背景', exact: true })
      .click()
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.backgroundColor)
      .toBe('transparent')
    await frame.getByRole('dialog', { name: '按键底色', exact: true }).press('Escape')
    await frame.getByRole('button', { name: '撤销', exact: true }).click()
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.backgroundColor)
      .toBe(originalBackground)
    const undo = frame.getByRole('button', { name: '撤销', exact: true }),
      redo = frame.getByRole('button', { name: '重做', exact: true })
    await undo.click()
    await expect.poll(async () => (await saved()).annotationRegions[0].size.height).toBe(10)
    await redo.click()
    await expect
      .poll(async () => (await saved()).annotationRegions[0].size.height)
      .toBeCloseTo(originalSize.height * 1.05)
    await frame.getByRole('switch', { name: '连接相邻输入', exact: true }).press('Space')
    await expect(frame.locator('[data-keycaps]')).toHaveAttribute('aria-label', '↵')
    await frame.getByRole('switch', { name: '连接相邻输入', exact: true }).press('Space')
    await frame.getByRole('combobox', { name: '进入效果', exact: true }).selectOption('slide')
    await expect(frame.getByRole('slider', { name: '动画时长', exact: true })).toBeVisible()
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.enterAnimation)
      .toBe('slide')
    await tool.screenshot({ path: testInfo.outputPath('keyboard-inspector.png') })
    await frame.getByLabel('编辑工具').getByLabel('光标', { exact: true }).click()
    await expect(frame.getByLabel('光标样式', { exact: true }).getByRole('row')).toHaveCount(6)
    for (const label of ['蓝晶', '果冻', '珍珠', '折纸'])
      await expect(frame.getByRole('row', { name: label, exact: true })).toHaveCount(0)
    // 新建遮罩后手绘，确认一笔只占一个历史步骤。
    await frame.getByRole('button', { name: '添加图层', exact: true }).click()
    await frame.getByRole('menuitem', { name: '注释', exact: true }).click()
    await frame
      .getByLabel('标注类型', { exact: true })
      .getByRole('row', { name: '模糊', exact: true })
      .click()
    await expect
      .poll(async () => (await saved()).annotationRegions.some((a) => a.type === 'blur'))
      .toBe(true)
    await frame
      .getByLabel('遮罩形状', { exact: true })
      .getByRole('row', { name: '圆形', exact: true })
      .click()
    await frame.getByRole('combobox', { name: '进入效果', exact: true }).selectOption('fade')
    await frame.getByRole('combobox', { name: '退出效果', exact: true }).selectOption('wipe')
    await frame
      .getByLabel('遮罩形状', { exact: true })
      .getByRole('row', { name: '手绘涂抹', exact: true })
      .click()
    await frame.getByRole('button', { name: '涂抹遮罩', exact: true }).click()
    const box = (await frame.locator('[data-annotation-id][data-selected="true"]').boundingBox())!
    await tool.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
    await tool.mouse.down()
    await tool.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 8 })
    await tool.mouse.up()
    await expect
      .poll(
        async () =>
          (await saved()).annotationRegions.find((a) => a.type === 'blur')?.style.maskStrokes
            ?.length
      )
      .toBe(1)
    await undo.click()
    await expect
      .poll(
        async () =>
          (await saved()).annotationRegions.find((a) => a.type === 'blur').style.maskStrokes
            ?.length ?? 0
      )
      .toBe(0)
    await redo.click()
    await expect
      .poll(
        async () =>
          (await saved()).annotationRegions.find((a) => a.type === 'blur').style.maskStrokes?.length
      )
      .toBe(1)
    await frame.getByRole('button', { name: '完成涂抹', exact: true }).click()
    await tool.screenshot({ path: testInfo.outputPath('brush-mask-light.png') })
    await frame
      .getByLabel('标注类型', { exact: true })
      .getByRole('row', { name: '箭头', exact: true })
      .click()
    await frame.getByRole('row', { name: '弧形箭头', exact: true }).click()
    await expect
      .poll(
        async () =>
          (await saved()).annotationRegions.find((a) => a.type === 'figure')?.figureData?.color
      )
      .toBe('#ffffff')
    await expect
      .poll(
        async () => (await saved()).annotationRegions.find((a) => a.type === 'figure')?.size.width
      )
      .toBe(16)
    await expect(frame.getByRole('slider', { name: '线宽', exact: true })).toBeVisible()
    await expect(frame.getByLabel('箭头外观', { exact: true }).getByRole('row')).toHaveCount(6)
    await expect
      .poll(
        async () =>
          (await saved()).annotationRegions.find((a) => a.type === 'figure')?.figureData?.arrowStyle
      )
      .toBe('cartoon')
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    await cap.press('Shift+ArrowRight')
    await tool.screenshot({ path: testInfo.outputPath('cartoon-arrow-dark.png') })
    const zoomTrack = frame.locator('[data-timeline-row="row-zoom"] > div.relative')
    const zoomBounds = (await zoomTrack.boundingBox())!
    await tool.mouse.click(
      zoomBounds.x + zoomBounds.width * 0.25,
      zoomBounds.y + zoomBounds.height / 2
    )
    await frame.getByRole('button', { name: '变焦通用设置', exact: true }).click()
    const zoomGap = frame.getByRole('slider', { name: '变焦衔接最大间隔', exact: true })
    await zoomGap.focus()
    await zoomGap.press('ArrowRight')
    await expect.poll(async () => (await saved()).connectedZoomGapMs).toBe(1600)
    // 检查实际画布像素：形状裁剪、涂抹孔洞、键帽和贴纸在导出链可绘制。
    const materials = await iframe.evaluate(async () => {
      const { ARROW_STYLES, ARROW_DIRECTIONS } = await import(
        '/presentation/src/components/video-editor/arrowGeometry.ts' as string
      )
      const { getArrowImageSource } = await import(
        '/presentation/src/components/video-editor/arrowAppearance.ts' as string
      )
      const { renderAnnotations, preloadAnnotationAssets } = await import(
        '/presentation/src/lib/exporter/annotationRenderer.ts' as string
      )
      const { DEFAULT_ANNOTATION_STYLE } = await import(
        '/presentation/src/components/video-editor/types.ts' as string
      )
      const sheet = document.createElement('canvas')
      sheet.width = 900
      sheet.height = 550
      const display = sheet.getContext('2d')!
      display.fillStyle = '#f1f5f9'
      display.fillRect(0, 0, 450, sheet.height)
      display.fillStyle = '#121827'
      display.fillRect(450, 0, 450, sheet.height)
      const scratch = document.createElement('canvas')
      scratch.width = 360
      scratch.height = 120
      const ctx = scratch.getContext('2d')!
      const results: Array<{ style: string; changed: number; directions: number[] }> = []
      /**
       * 装载实际 SVG 源，作为独立材质图和导出比较的输入。
       * @param source 图片 URL。
       * @returns 完成解码的图片；加载失败时使专项失败。
       */
      async function image(source: string): Promise<HTMLImageElement> {
        const node = new Image()
        node.src = source
        await node.decode()
        return node
      }
      for (const [index, [style, label]] of Object.entries(ARROW_STYLES).entries()) {
        const original = await image(
          getArrowImageSource({ arrowStyle: style, color: '#2563eb', strokeWidth: 4 })
        )
        const recolored = await image(
          getArrowImageSource({ arrowStyle: style, color: '#ef4444', strokeWidth: 4 })
        )
        display.fillStyle = '#475569'
        display.font = '14px sans-serif'
        display.fillText(String(label), 18, index * 88 + 28)
        display.drawImage(original, 80, index * 88 + 7, 350, 78)
        display.drawImage(recolored, 530, index * 88 + 7, 350, 78)
        ctx.clearRect(0, 0, 360, 120)
        ctx.drawImage(original, 0, 0, 360, 120)
        const before = ctx.getImageData(0, 0, 360, 120).data
        ctx.clearRect(0, 0, 360, 120)
        ctx.drawImage(recolored, 0, 0, 360, 120)
        const after = ctx.getImageData(0, 0, 360, 120).data
        const changed = Array.from(before).filter(
          (n, i) => i % 4 !== 3 && Math.abs(n - after[i]) > 30
        ).length
        const directions: number[] = []
        for (const direction of Object.keys(ARROW_DIRECTIONS)) {
          const arrow = {
            id: 'vector',
            type: 'figure',
            startMs: 0,
            endMs: 1000,
            position: { x: 0, y: 0 },
            size: { width: 100, height: 100 },
            content: '',
            style: DEFAULT_ANNOTATION_STYLE,
            zIndex: 1,
            figureData: {
              arrowStyle: style,
              color: '#2563eb',
              strokeWidth: 4,
              arrowDirection: direction
            }
          }
          const assets = await preloadAnnotationAssets([arrow])
          ctx.clearRect(0, 0, 360, 120)
          await renderAnnotations(ctx, [arrow], 360, 120, 500, 1, assets)
          const rgba = ctx.getImageData(0, 0, 360, 120).data
          directions.push(Array.from(rgba).filter((n, i) => i % 4 === 3 && n > 0).length)
          // 阴影和旋转后的尖角不能碰到输出边缘。
          for (let x = 0; x < 360; x++)
            if (rgba[x * 4 + 3] || rgba[(119 * 360 + x) * 4 + 3])
              throw new Error(`${style}/${direction}: clipped vertical edge`)
          for (let y = 0; y < 120; y++)
            if (rgba[y * 360 * 4 + 3] || rgba[(y * 360 + 359) * 4 + 3])
              throw new Error(`${style}/${direction}: clipped horizontal edge`)
        }
        results.push({ style, changed, directions })
      }
      return { results, sheet: sheet.toDataURL('image/png') }
    })
    expect(materials.results).toHaveLength(6)
    for (const item of materials.results) {
      expect(item.changed).toBeGreaterThan(100)
      expect(item.directions).toHaveLength(8)
      for (const pixels of item.directions) expect(pixels).toBeGreaterThan(40)
    }
    await fs.writeFile(
      testInfo.outputPath('svg-materials.png'),
      Buffer.from(materials.sheet.split(',')[1], 'base64')
    )
    await fs.writeFile(
      testInfo.outputPath('svg-materials.json'),
      JSON.stringify({ results: materials.results }, null, 2)
    )
    const pixels = await iframe.evaluate(async () => {
      const { renderAnnotations, preloadAnnotationAssets } = await import(
        '/presentation/src/lib/exporter/annotationRenderer.ts' as string
      )
      const { drawKeycaps } = await import(
        '/presentation/src/components/video-editor/keyboardDisplay.ts' as string
      )
      const { DEFAULT_ANNOTATION_STYLE } = await import(
        '/presentation/src/components/video-editor/types.ts' as string
      )
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 120
      const ctx = canvas.getContext('2d')!
      const base = {
        id: 'effect',
        type: 'focus',
        startMs: 0,
        endMs: 1000,
        content: '',
        position: { x: 25, y: 25 },
        size: { width: 50, height: 50 },
        style: { ...DEFAULT_ANNOTATION_STYLE, borderRadius: 0 },
        zIndex: 1,
        blurIntensity: 80
      }
      /**
       * 读取单个像素的红色通道。
       * @param x 横坐标。
       * @param y 纵坐标。
       * @returns 红色通道亮度。
       */
      function red(x: number, y: number): number {
        return ctx.getImageData(x, y, 1, 1).data[0]
      }
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 120, 120)
      await renderAnnotations(
        ctx,
        [{ ...base, style: { ...base.style, maskShape: 'ellipse' } }],
        120,
        120,
        500
      )
      const ellipse = [red(60, 60), red(31, 31), red(10, 10)]
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 120, 120)
      await renderAnnotations(
        ctx,
        [
          {
            ...base,
            style: {
              ...base.style,
              maskShape: 'brush',
              maskBrushSize: 25,
              maskStrokes: [
                [
                  { x: 10, y: 10 },
                  { x: 90, y: 90 }
                ]
              ]
            }
          }
        ],
        120,
        120,
        500
      )
      const brush = [red(60, 60), red(60, 35)]
      const arrow = {
        ...base,
        type: 'figure',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
        figureData: {
          arrowDirection: 'up-right',
          arrowStyle: 'cartoon',
          color: '#000',
          strokeWidth: 4
        }
      }
      const assets = await preloadAnnotationAssets([arrow])
      ctx.clearRect(0, 0, 120, 120)
      await renderAnnotations(ctx, [arrow], 120, 120, 500, 1, assets)
      const sticker = Array.from(ctx.getImageData(0, 0, 120, 120).data).filter(
        (n, i) => i % 4 === 3 && n > 0
      ).length
      ctx.clearRect(0, 0, 120, 120)
      const key = {
        ...base,
        type: 'keystroke',
        content: 'Space',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
        style: {
          ...base.style,
          fontSize: 32,
          keycapStyle: 'clay',
          enterAnimation: 'pop',
          exitAnimation: 'fade'
        }
      }
      await renderAnnotations(ctx, [key], 120, 120, 500)
      const keyPixels = Array.from(ctx.getImageData(0, 0, 120, 120).data).filter(
        (n, i) => i % 4 === 3 && n > 0
      ).length
      ctx.clearRect(0, 0, 120, 120)
      await renderAnnotations(
        ctx,
        [{ ...key, style: { ...key.style, enterAnimation: 'fade' } }],
        120,
        120,
        0
      )
      const invisibleStart = Array.from(ctx.getImageData(0, 0, 120, 120).data).every(
        (n, i) => i % 4 !== 3 || n === 0
      )
      const edgeAlpha: number[] = []
      for (const keycapStyle of ['simple', 'apple', 'clay', 'mechanical', 'rgb']) {
        const small = document.createElement('canvas')
        small.width = 80
        small.height = 28
        const paint = small.getContext('2d')!
        drawKeycaps(
          paint,
          {
            ...key,
            content: 'Ctrl + Shift + S',
            style: { ...key.style, backgroundColor: '#17172a', fontSize: 16, keycapStyle }
          },
          80,
          28,
          1
        )
        const rgba = paint.getImageData(0, 0, 80, 28).data
        edgeAlpha.push(
          Math.max(
            ...Array.from({ length: 80 * 28 }, (_, index) =>
              index % 80 === 0 || index % 80 === 79 || index < 80 || index >= 80 * 27
                ? rgba[index * 4 + 3]
                : 0
            )
          )
        )
      }
      return { ellipse, brush, sticker, keyPixels, invisibleStart, edgeAlpha }
    })
    expect(pixels.ellipse[0]).toBe(255)
    expect(pixels.ellipse[1]).toBeLessThan(80)
    expect(pixels.ellipse[2]).toBeLessThan(80)
    expect(pixels.brush[0]).toBe(255)
    expect(pixels.brush[1]).toBeLessThan(80)
    expect(pixels.sticker).toBeGreaterThan(1000)
    expect(pixels.keyPixels).toBeGreaterThan(1000)
    expect(pixels.invisibleStart).toBe(true)
    expect(pixels.edgeAlpha).toEqual([0, 0, 0, 0, 0])
    const pipelines = await iframe.evaluate(async () => {
      const { FrameRenderer: Legacy } = await import(
        '/presentation/src/lib/exporter/frameRenderer.ts' as string
      )
      const { FrameRenderer: Modern } = await import(
        '/presentation/src/lib/exporter/modernFrameRenderer.ts' as string
      )
      const { DEFAULT_KEYBOARD_STYLE } = await import(
        '/presentation/src/components/video-editor/keyboardDisplay.ts' as string
      )
      const source = document.createElement('canvas')
      source.width = 240
      source.height = 135
      source.getContext('2d')!.fillStyle = '#2060a0'
      source.getContext('2d')!.fillRect(0, 0, 240, 135)
      const results: Array<{
        renderer: string
        backend: string
        changed: number
        boundary: number
      }> = []
      for (const [name, Renderer] of [
        ['standard', Legacy],
        ['modern', Modern]
      ] as const) {
        for (const backend of ['webgl', ...('gpu' in navigator ? ['webgpu'] : [])]) {
          const renderer = new Renderer({
            width: 240,
            height: 135,
            videoWidth: 240,
            videoHeight: 135,
            wallpaper: '#2060a0',
            zoomRegions: [],
            cropRegion: { x: 0, y: 0, width: 1, height: 1 },
            padding: 0,
            showShadow: false,
            shadowIntensity: 0,
            backgroundBlur: 0,
            showCursor: false,
            preferredRenderBackend: backend,
            annotationRegions: [
              {
                id: 'key',
                type: 'keystroke',
                startMs: 0,
                endMs: 1000,
                content: 'Space',
                position: { x: 0, y: 0 },
                size: { width: 100, height: 100 },
                style: {
                  ...DEFAULT_KEYBOARD_STYLE,
                  keycapStyle: 'clay',
                  enterAnimation: 'pop',
                  exitAnimation: 'fade'
                },
                zIndex: 1
              }
            ]
          })
          await renderer.initialize()
          const frames: Uint8ClampedArray[] = []
          try {
            for (const timestamp of [0, 500000, 1000000]) {
              const video = new VideoFrame(source, { timestamp })
              try {
                await renderer.renderFrame(video, timestamp)
              } finally {
                video.close()
              }
              const output = document.createElement('canvas')
              output.width = 240
              output.height = 135
              output.getContext('2d')!.drawImage(renderer.getCanvas(), 0, 0)
              frames.push(output.getContext('2d')!.getImageData(0, 0, 240, 135).data)
            }
            results.push({
              renderer: name,
              backend,
              changed: frames[1].filter((value, i) => Math.abs(value - frames[0][i]) > 5).length,
              boundary: frames[2].filter((value, i) => Math.abs(value - frames[0][i]) > 5).length
            })
          } finally {
            renderer.destroy()
          }
        }
      }
      return results
    })
    await fs.writeFile(
      testInfo.outputPath('export-pipelines.json'),
      JSON.stringify(pipelines, null, 2)
    )
    for (const result of pipelines) {
      expect(result.changed, `${result.renderer}/${result.backend}`).toBeGreaterThan(100)
      expect(result.boundary).toBe(0)
    }
    const zoomGapPixels = await iframe.evaluate(async () => {
      const { FrameRenderer: Legacy } = await import(
        '/presentation/src/lib/exporter/frameRenderer.ts' as string
      )
      const { FrameRenderer: Modern } = await import(
        '/presentation/src/lib/exporter/modernFrameRenderer.ts' as string
      )
      const source = document.createElement('canvas')
      source.width = 240
      source.height = 135
      const paint = source.getContext('2d')!
      for (let y = 0; y < 135; y += 15)
        for (let x = 0; x < 240; x += 15) {
          paint.fillStyle = (x / 15 + y / 15) % 2 ? '#165d8c' : '#fae9a7'
          paint.fillRect(x, y, 15, 15)
        }
      const regions = [
        {
          id: 'left',
          startMs: 0,
          endMs: 3000,
          depth: 2,
          scale: 2,
          mode: 'manual',
          focus: { cx: 0.4, cy: 0.5 },
          camera: { mode: '3d', yaw: 25, pitch: 5 }
        },
        {
          id: 'right',
          startMs: 4600,
          endMs: 7600,
          depth: 2,
          scale: 2,
          mode: 'manual',
          focus: { cx: 0.6, cy: 0.5 },
          camera: { mode: '3d', yaw: -15, pitch: 5 }
        }
      ]
      const results = []
      for (const [name, Renderer] of [
        ['standard', Legacy],
        ['modern', Modern]
      ] as const) {
        const frames: Uint8ClampedArray[] = []
        for (const gap of [1599, 1600]) {
          const renderer = new Renderer({
            width: 240,
            height: 135,
            videoWidth: 240,
            videoHeight: 135,
            wallpaper: '#111827',
            zoomRegions: regions,
            cropRegion: { x: 0, y: 0, width: 1, height: 1 },
            padding: 0,
            showShadow: false,
            shadowIntensity: 0,
            backgroundBlur: 0,
            showCursor: false,
            preferredRenderBackend: 'webgl',
            connectZooms: true,
            connectedZoomGapMs: gap,
            zoomInDurationMs: 100,
            zoomOutDurationMs: 100,
            zoomClassicMode: true
          })
          await renderer.initialize()
          const video = new VideoFrame(source, { timestamp: 4100000 })
          try {
            await renderer.renderFrame(video, 4100000)
            const output = document.createElement('canvas')
            output.width = 240
            output.height = 135
            const ctx = output.getContext('2d')!
            ctx.drawImage(renderer.getCanvas(), 0, 0)
            frames.push(ctx.getImageData(0, 0, 240, 135).data)
          } finally {
            video.close()
            renderer.destroy()
          }
        }
        results.push({
          renderer: name,
          changed: frames[0].filter((value, index) => Math.abs(value - frames[1][index]) > 20)
            .length
        })
      }
      return results
    })
    for (const result of zoomGapPixels)
      expect(result.changed, `${result.renderer} uses configured zoom gap`).toBeGreaterThan(300)
    await fs.writeFile(
      testInfo.outputPath('zoom-gap-pixels.json'),
      JSON.stringify(zoomGapPixels, null, 2)
    )
    const before = await saved()
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    await expect(frame.locator('[data-preview-frame]')).toBeVisible({ timeout: 30000 })
    await expect
      .poll(
        () =>
          iframe.evaluate(() =>
            Array.from(document.querySelectorAll('video')).some((video) => video.readyState >= 2)
          ),
        { timeout: 30000 }
      )
      .toBe(true)
    await expect
      .poll(async () => (await saved()).annotationRegions)
      .toMatchObject(before.annotationRegions)
    expect(errors).toEqual([])
  } finally {
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join('\n'))
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
