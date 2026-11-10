import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('遮罩控件、片段选区、重开拖动光标与预览导出尾边界', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(240000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-editor-boundaries-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, '演示回归.mp4')
    execFileSync(
      ffmpeg!,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=15',
        '-t',
        '8',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        sample
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    for (const [suffix, frequency] of [
      ['system', 440],
      ['mic', 880]
    ]) {
      execFileSync(
        ffmpeg!,
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=${frequency}:sample_rate=48000:duration=8`,
          '-c:a',
          'pcm_s16le',
          sample.replace('.mp4', `.${suffix}.wav`)
        ],
        { windowsHide: true, stdio: 'ignore' }
      )
    }
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
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 30000 })
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
    await app
      .context()
      .pages()
      .find((page) => page.url().includes('windowType=hud-overlay'))!
      .getByRole('button', { name: '演示编辑器', exact: true })
      .click()
    const tool = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    const frame = tool.frameLocator('iframe')
    tool.on('pageerror', (error) => console.log('PRESENTATION_PAGE_ERROR', error.stack))
    tool.on('console', (message) => {
      if (message.type() === 'error') console.log('PRESENTATION_CONSOLE_ERROR', message.text())
    })
    await expect(frame.getByText('演示编辑器', { exact: true })).toBeVisible({ timeout: 60000 })
    await frame.getByRole('dialog', { name: '演示项目', exact: true }).press('Escape')
    await app.evaluate(({ dialog }, sample) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sample] })
    }, sample)
    await frame.getByRole('button', { name: '导入视频', exact: true }).click()
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    await expect(frame.locator('[data-variant="audio"]')).toHaveCount(2)
    const iframe = tool.frames().find((item) => item.url().includes('presentation.html'))!
    await expect
      .poll(
        async () =>
          (await iframe.evaluate(async () => window.electronAPI.listProjectFiles())).entries.length,
        { timeout: 30000 }
      )
      .toBeGreaterThan(0)
    const projectPath = (await iframe.evaluate(async () => window.electronAPI.listProjectFiles()))
      .entries[0].path
    /**
     * 读取实际自动保存模型，核对遮罩参数及撤销重做后的状态。
     * @returns 当前项目编辑参数。
     */
    async function saved(): Promise<any> {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }
    const initial = JSON.parse(await fs.readFile(projectPath, 'utf8'))
    const { DEFAULT_ANNOTATION_STYLE, DEFAULT_KEYBOARD_STYLE } = await iframe.evaluate(async () => {
      const { DEFAULT_ANNOTATION_STYLE } = await import(
        '/presentation/src/components/video-editor/types.ts' as string
      )
      const { DEFAULT_KEYBOARD_STYLE } = await import(
        '/presentation/src/components/video-editor/keyboardDisplay.ts' as string
      )
      return { DEFAULT_ANNOTATION_STYLE, DEFAULT_KEYBOARD_STYLE }
    })
    const note = {
      id: 'mask-tail',
      type: 'blur',
      content: '',
      startMs: 0,
      endMs: 8000,
      position: { x: 10, y: 15 },
      size: { width: 30, height: 30 },
      zIndex: 1,
      trackIndex: 0,
      style: {
        ...DEFAULT_ANNOTATION_STYLE,
        borderRadius: 32,
        maskShape: 'rectangle',
        enterAnimation: 'none',
        exitAnimation: 'none'
      }
    }
    initial.editor.annotationRegions = [
      note,
      {
        ...note,
        id: 'text-tail',
        type: 'text',
        content: '结尾注释',
        position: { x: 50, y: 40 },
        trackIndex: 1
      },
      {
        ...note,
        id: 'keys-tail',
        type: 'keystroke',
        content: 'Space',
        startMs: 7000,
        trackIndex: 2,
        position: { x: 20, y: 80 },
        style: DEFAULT_KEYBOARD_STYLE
      },
      { ...note, id: 'short-note', type: 'text', content: '提前结束', endMs: 7999, trackIndex: 3 },
      { ...note, id: 'cut-before', type: 'text', content: '切口前', endMs: 4000, trackIndex: 4 },
      { ...note, id: 'cut-after', type: 'text', content: '切口后', startMs: 4000, trackIndex: 4 }
    ]
    initial.editor.zoomRegions = [
      {
        id: 'tail-zoom',
        startMs: 0,
        endMs: 8000,
        depth: 1,
        scale: 1.5,
        mode: 'manual',
        focus: { cx: 0.5, cy: 0.5 }
      }
    ]
    initial.editor.autoCaptions = [
      { id: 'tail-caption', startMs: 0, endMs: 8000, text: '结尾字幕' }
    ]
    initial.editor.autoCaptionSettings.enabled = true
    initial.editor.autoCaptionSettings.animationStyle = 'none'
    await fs.writeFile(projectPath, JSON.stringify(initial))
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    const cap = frame.getByTestId('playhead-cap')
    const mask = frame.locator('[data-item-id="mask-tail"]')
    const undo = frame.getByRole('button', { name: '撤销', exact: true })
    const redo = frame.getByRole('button', { name: '重做', exact: true })
    await expect(mask).toBeVisible({ timeout: 30000 })
    await expect(frame.locator('[data-preview-frame] canvas').first()).toBeVisible({
      timeout: 30000
    })
    // 三类遮罩均只在矩形时显示圆角；隐藏控件不删除已保存数值。
    for (const type of ['模糊', '马赛克', '聚焦']) {
      await mask.click()
      await expect(mask).toHaveAttribute('data-selected', 'true')
      await frame
        .getByLabel('标注类型', { exact: true })
        .getByRole('row', { name: type, exact: true })
        .click()
      await frame
        .getByLabel('遮罩形状', { exact: true })
        .getByRole('row', { name: '矩形', exact: true })
        .click()
      await expect(frame.getByRole('slider', { name: '圆角', exact: true })).toBeVisible()
      for (const shape of ['圆形', '手绘涂抹']) {
        await frame
          .getByLabel('遮罩形状', { exact: true })
          .getByRole('row', { name: shape, exact: true })
          .click()
        await expect(frame.getByRole('slider', { name: '圆角', exact: true })).toHaveCount(0)
      }
      await undo.click()
      await expect(
        frame.getByLabel('遮罩形状').getByRole('row', { name: '圆形', exact: true })
      ).toHaveAttribute('aria-selected', 'true')
      await redo.click()
      await frame.getByLabel('遮罩形状').getByRole('row', { name: '矩形', exact: true }).click()
      await expect(frame.getByRole('slider', { name: '圆角', exact: true })).toHaveValue('32')
    }
    // 明暗模式和不同轨道共用可见选区环，选中时两端手柄持续出现。
    for (const dark of [false, true]) {
      await iframe.evaluate((dark) => {
        // 演示页会持续跟随所属宿主，两个文档都切换，避免一秒后被宿主恢复。
        for (const root of [document.documentElement, window.parent.document.documentElement]) {
          root.classList.toggle('dark', dark)
          root.dataset.theme = dark ? 'dark' : 'light'
        }
      }, dark)
      for (const variant of ['zoom', 'annotation', 'audio', 'clip']) {
        const item = frame.locator('[data-variant="' + variant + '"]').first()
        await item.click()
        const ring = await item.locator('.timeline-block').evaluate((node) => {
          const style = getComputedStyle(node, '::after')
          return {
            content: style.content,
            width: parseFloat(style.borderTopWidth),
            dpr: window.devicePixelRatio,
            color: style.borderTopColor,
            z: style.zIndex
          }
        })
        expect(ring.content).not.toBe('none')
        // Chromium按设备像素取整边框，非整数DPI下计算宽度可能略小于2 CSS px。
        expect(ring.width).toBeGreaterThanOrEqual(2 - 1 / ring.dpr)
        expect(ring.width).toBeLessThanOrEqual(2)
        expect(ring.color).toBe(dark ? 'rgb(224, 239, 255)' : 'rgb(21, 62, 117)')
        expect(ring.z).toBe('30')
        if (variant !== 'clip') {
          await tool.mouse.move(1, 1)
          await expect(item.getByTitle('调整左侧长度')).toHaveCSS('opacity', '1')
          await expect(item.getByTitle('调整右侧长度')).toHaveCSS('opacity', '1')
        }
      }
      await mask.click()
      await tool.screenshot({
        path: testInfo.outputPath('selection-' + (dark ? 'dark' : 'light') + '.png')
      })
    }
    // 全片终点保留覆盖到尾部的注释、按键及字幕，短注释不会恢复。
    await cap.press('Home')
    for (let index = 0; index < 4; index++) await cap.press('Shift+ArrowRight')
    await expect(frame.locator('[data-annotation-id="cut-before"]')).toHaveCount(0)
    await expect(frame.locator('[data-annotation-id="cut-after"]')).toBeVisible()
    for (let index = 0; index < 4; index++) await cap.press('Shift+ArrowRight')
    await expect(cap).toHaveText('0:08.000')
    for (const id of ['mask-tail', 'text-tail', 'keys-tail', 'cut-after'])
      await expect(frame.locator('[data-annotation-id="' + id + '"]')).toBeVisible()
    await expect(frame.locator('[data-annotation-id="short-note"]')).toHaveCount(0)
    await expect(
      frame.locator('[data-preview-frame]').getByText('结尾字幕', { exact: true })
    ).toBeVisible()
    await tool.screenshot({ path: testInfo.outputPath('preview-terminal.png') })
    // 两套真实合成器在终点取样和最后输出帧均显示注释，结束边界不延长。
    const pipelines = await iframe.evaluate(async () => {
      const { FrameRenderer: Standard } = await import(
        '/presentation/src/lib/exporter/frameRenderer.ts' as string
      )
      const { FrameRenderer: Modern } = await import(
        '/presentation/src/lib/exporter/modernFrameRenderer.ts' as string
      )
      const { resolvePreviewFrameSample } = await import(
        '/presentation/src/components/video-editor/videoPlayback/previewSample.ts' as string
      )
      const { DEFAULT_ANNOTATION_STYLE } = await import(
        '/presentation/src/components/video-editor/types.ts' as string
      )
      const source = document.createElement('canvas')
      source.width = 240
      source.height = 135
      source.getContext('2d')!.fillStyle = '#2060a0'
      source.getContext('2d')!.fillRect(0, 0, 240, 135)
      const marker = document.createElement('canvas')
      marker.width = 16
      marker.height = 16
      marker.getContext('2d')!.fillStyle = '#ff0000'
      marker.getContext('2d')!.fillRect(0, 0, 16, 16)
      const sample = resolvePreviewFrameSample(1, 1, [
        { id: 'clip', startMs: 0, endMs: 1000, speed: 1 }
      ])
      const results: Array<{ name: string; backend: string; counts: number[] }> = []
      for (const [name, Renderer] of [
        ['standard', Standard],
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
                id: 'tail',
                type: 'image',
                content: marker.toDataURL(),
                startMs: 0,
                endMs: 1000,
                position: { x: 10, y: 10 },
                size: { width: 80, height: 80 },
                zIndex: 1,
                style: {
                  ...DEFAULT_ANNOTATION_STYLE,
                  backgroundColor: '#ff0000',
                  color: '#ffffff',
                  enterAnimation: 'none',
                  exitAnimation: 'none'
                }
              }
            ]
          })
          await renderer.initialize()
          const counts: number[] = []
          try {
            for (const timestamp of [(1000 - 1000 / 60) * 1000, sample.timelineTime * 1e6, 1e6]) {
              const video = new VideoFrame(source, { timestamp })
              try {
                await renderer.renderFrame(video, timestamp)
              } finally {
                video.close()
              }
              const output = document.createElement('canvas')
              output.width = 240
              output.height = 135
              const context = output.getContext('2d')!
              context.drawImage(renderer.getCanvas(), 0, 0)
              const data = context.getImageData(0, 0, 240, 135).data
              let red = 0
              for (let i = 0; i < data.length; i += 4)
                if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) red++
              counts.push(red)
            }
          } finally {
            renderer.destroy()
          }
          results.push({ name, backend, counts })
        }
      }
      return results
    })
    await fs.writeFile(
      testInfo.outputPath('terminal-export-pixels.json'),
      JSON.stringify(pipelines, null, 2)
    )
    for (const result of pipelines) {
      expect(result.counts[0], result.name + '/' + result.backend).toBeGreaterThan(1000)
      expect(result.counts[1]).toBe(result.counts[0])
      expect(result.counts[2]).toBe(0)
    }
    // 多次重开后拖动经过片段和预览；手势样式保持同一节点，不随定位反复拆装。
    for (let reopen = 0; reopen < 2; reopen++) {
      await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
      await expect(mask).toBeVisible({ timeout: 30000 })
      await cap.press('Home')
      const box = (await cap.boundingBox())!
      await tool.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await tool.mouse.down()
      await expect(frame.locator('style[data-timeline-drag-cursor]')).toHaveCount(1)
      const cursorStyle = await frame.locator('style[data-timeline-drag-cursor]').elementHandle()
      for (const target of [
        mask,
        frame.locator('[data-preview-frame]'),
        frame.locator('[data-item-id="tail-zoom"]')
      ]) {
        const point = (await target.boundingBox())!
        await tool.mouse.move(point.x + point.width / 2, point.y + point.height / 2, { steps: 6 })
        expect(await cursorStyle!.evaluate((node) => node.isConnected)).toBe(true)
        expect(await target.evaluate((node) => getComputedStyle(node).cursor)).toBe('ew-resize')
      }
      await tool.mouse.up()
      await expect(frame.locator('style[data-timeline-drag-cursor]')).toHaveCount(0)
      await expect(frame.locator('[data-preview-frame]')).toHaveCSS('cursor', 'default')
      // 失焦和Escape都终止手势，后续松开不改变历史。
      for (const cancel of ['blur', 'escape']) {
        const point = (await cap.boundingBox())!
        await tool.mouse.move(point.x + point.width / 2, point.y + point.height / 2)
        await tool.mouse.down()
        await expect(frame.locator('style[data-timeline-drag-cursor]')).toHaveCount(1)
        if (cancel === 'blur') await iframe.evaluate(() => window.dispatchEvent(new Event('blur')))
        else await cap.press('Escape')
        await expect(frame.locator('style[data-timeline-drag-cursor]')).toHaveCount(0)
        await tool.mouse.up()
      }
    }
    await expect.poll(async () => (await saved()).annotationRegions[0].style.borderRadius).toBe(32)
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.maskShape)
      .toBe('rectangle')
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
