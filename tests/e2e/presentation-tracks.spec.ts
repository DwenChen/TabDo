import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示独立音频摄像头按键轨道保存与场景注释渲染', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(240000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-presentation-import-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, '导入样片.mp4')
    execFileSync(
      ffmpeg!,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=15',
        '-t',
        '2',
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
          `sine=frequency=${frequency}:sample_rate=48000:duration=2`,
          '-c:a',
          'pcm_s16le',
          sample.replace('.mp4', `.${suffix}.wav`)
        ],
        { windowsHide: true, stdio: 'ignore' }
      )
    }
    await fs.writeFile(
      sample + '.cursor.json',
      JSON.stringify({
        version: 1,
        samples: Array.from({ length: 41 }, (_, i) => ({
          timeMs: i * 50,
          cx: 0.2 + i * 0.012,
          cy: 0.5,
          interactionType: 'move',
          keyText: i === 4 ? 'Ctrl + S' : i === 12 ? 'h' : i === 14 ? 'i' : undefined
        }))
      })
    )
    const cameraSample = path.join(temporary, 'camera-short.mp4')
    execFileSync(
      ffmpeg!,
      ['-y', '-i', sample, '-t', '1.5', '-an', '-c:v', 'libx264', cameraSample],
      { windowsHide: true, stdio: 'ignore' }
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
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
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
    await hud.getByRole('button', { name: '演示编辑器', exact: true }).click()
    const tool = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    tool.on('pageerror', (error) => console.log('PRESENTATION_PAGE_ERROR', error.message))
    tool.on('console', (message) => {
      if (message.type() === 'error') console.log('PRESENTATION_CONSOLE_ERROR', message.text())
    })
    const frame = tool.frameLocator('iframe')
    await expect(frame.getByText('演示编辑器', { exact: true })).toBeVisible({ timeout: 60000 })
    await frame.getByRole('button', { name: '设置', exact: true }).click()
    await expect(frame.getByLabel('设置分类').getByText('动态效果', { exact: true })).toHaveCount(0)
    await expect(frame.getByText('运动预设', { exact: true })).toHaveCount(0)
    await expect(frame.getByText('快捷键', { exact: true })).toHaveCount(0)
    await expect(frame.getByRole('switch', { name: '连接变焦', exact: true })).toHaveCount(0)
    const applyAutomatically = frame.getByRole('switch', {
      name: '自动为新录制应用变焦',
      exact: true
    })
    await applyAutomatically.focus()
    await applyAutomatically.press('Space')
    await expect(applyAutomatically).not.toBeChecked()
    await frame.getByRole('dialog', { name: '演示项目', exact: true }).press('Escape')
    const plus = frame.getByRole('button', { name: '导入视频', exact: true })
    await expect(plus).toBeVisible()
    await app.evaluate(({ dialog }) => {
      ;(globalThis as any).__presentationFileChoices = 0
      dialog.showOpenDialog = async () => {
        ;(globalThis as any).__presentationFileChoices++
        return { canceled: true, filePaths: [] }
      }
    })
    await plus.click()
    await expect
      .poll(() => app!.evaluate(() => (globalThis as any).__presentationFileChoices))
      .toBe(1)
    await expect(plus).toBeVisible()
    await app.evaluate(({ dialog }, sample) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sample] })
    }, sample)
    await plus.focus()
    await plus.press('Enter')
    await expect(frame.locator('[data-timeline-item][data-variant="clip"]').first()).toBeVisible({
      timeout: 30000
    })
    await expect(frame.getByTestId('timeline-ruler')).toBeVisible()
    const audioItems = frame.locator('[data-timeline-row^="row-audio-"] [data-variant="audio"]')
    // 录制按键在首次加载时入轨，无需打开侧栏或点击生成。
    await expect(frame.locator('[data-variant="annotation"]')).toHaveCount(3)
    await expect(frame.getByRole('button', { name: '添加缩放', exact: true })).toHaveCount(0)
    const zoomRow = frame.locator('[data-timeline-row="row-zoom"] > div.relative')
    const zoomItems = frame.locator('[data-variant="zoom"]')
    const zoomBounds = (await zoomRow.boundingBox())!
    // 鼠标在尾部不足两秒的空位显示实际区间，点击后起止与预览一致。
    await tool.mouse.move(
      zoomBounds.x + zoomBounds.width * 0.65,
      zoomBounds.y + zoomBounds.height / 2
    )
    const zoomPreview = frame.locator('[data-zoom-add-preview]')
    await expect(zoomPreview).toBeVisible()
    const previewStart = Number(await zoomPreview.getAttribute('data-start-ms'))
    const previewEnd = Number(await zoomPreview.getAttribute('data-end-ms'))
    await tool.mouse.click(
      zoomBounds.x + zoomBounds.width * 0.65,
      zoomBounds.y + zoomBounds.height / 2
    )
    await expect(zoomItems).toHaveCount(1)
    await expect(zoomItems.first()).toHaveAttribute('data-start-ms', String(previewStart))
    await expect(zoomItems.first()).toHaveAttribute('data-end-ms', String(previewEnd))
    expect(previewEnd).toBe(2000)
    await zoomItems.first().click()
    await expect(frame.getByRole('group', { name: '变焦通用设置' })).toBeVisible()
    await frame.getByRole('button', { name: '变焦通用设置', exact: true }).click()
    await expect(frame.getByText('此处无法放置缩放片段', { exact: true })).toHaveCount(0)
    // 已占用区间只选择，不重复添加。
    await expect(zoomItems).toHaveCount(1)
    await tool.mouse.move(
      zoomBounds.x + zoomBounds.width * 0.55,
      zoomBounds.y + zoomBounds.height / 2
    )
    await expect(zoomPreview).toBeVisible()
    const secondStart = Number(await zoomPreview.getAttribute('data-start-ms'))
    await tool.mouse.click(
      zoomBounds.x + zoomBounds.width * 0.55,
      zoomBounds.y + zoomBounds.height / 2
    )
    await expect(zoomItems).toHaveCount(2)
    await expect(zoomItems.last()).toHaveAttribute('data-start-ms', String(secondStart))
    await expect(zoomItems.last()).toHaveAttribute('data-end-ms', String(previewStart))
    await tool.screenshot({ path: testInfo.outputPath('zoom-pointer-placement.png') })
    for (const name of ['自动添加变焦', '分割选中片段', '播放', '预览音量']) {
      const button = frame.getByRole('button', { name, exact: true })
      await button.hover()
      await expect(frame.getByRole('tooltip')).toBeVisible()
      await tool.mouse.move(1, 1)
      await expect(frame.getByRole('tooltip')).toHaveCount(0)
    }
    await frame.getByRole('button', { name: '预览音量', exact: true }).click()
    await expect(frame.getByRole('dialog', { name: '预览音量', exact: true })).toBeVisible()
    await frame.getByRole('dialog', { name: '预览音量', exact: true }).press('Escape')
    await expect(audioItems).toHaveCount(2)
    for (const audioItem of await audioItems.all()) {
      await expect(audioItem).toHaveAttribute(
        'title',
        /(?:系统音频|麦克风).*0:00\.000.*0:02\.000.*时长 0:02\.000/
      )
    }
    await expect(frame.getByRole('button', { name: '音频独立编辑', exact: true })).toHaveCount(0)
    await expect(
      frame.locator('[data-timeline-row^="row-audio-"]').getByText('系统音频', { exact: true })
    ).toBeVisible()
    await expect(
      frame.locator('[data-timeline-row^="row-audio-"]').getByText('麦克风', { exact: true })
    ).toBeVisible()
    await audioItems.last().click()
    await expect(frame.getByLabel('音频素材起点', { exact: true })).toHaveCount(0)
    await audioItems.first().click()
    await expect(frame.getByRole('button', { name: '裁剪画面', exact: true })).toHaveCount(0)
    await expect(
      frame.getByRole('region', { name: '音频编辑' }).getByRole('spinbutton')
    ).toHaveCount(0)
    // 独立音频重置包含音量、响度和淡入淡出，保留素材与时间。
    const audioVolume = frame.getByRole('slider', { name: '音量', exact: true })
    await audioVolume.press('Home')
    await frame.getByRole('switch', { name: '响度归一化', exact: true }).press('Space')
    await frame.getByRole('slider', { name: '淡入', exact: true }).press('ArrowRight')
    await frame.getByRole('slider', { name: '淡出', exact: true }).press('ArrowRight')
    await frame.getByRole('button', { name: '重置音频设置', exact: true }).click()
    await expect(audioVolume).toHaveValue('1')
    await expect(frame.getByRole('switch', { name: '响度归一化', exact: true })).not.toBeChecked()
    for (const name of ['淡入', '淡出'])
      await expect(frame.getByRole('slider', { name, exact: true })).toHaveValue('0')
    for (const [name, count] of [
      ['淡入', 2],
      ['淡出', 3]
    ] as const) {
      const slider = frame.getByRole('slider', { name, exact: true })
      await slider.focus()
      await slider.press('Home')
      for (let i = 0; i < count; i++) await slider.press('ArrowRight')
    }
    const playhead = frame.getByTestId('playhead-cap')
    await playhead.focus()
    await playhead.press('Home')
    await expect(playhead).toHaveText('0:00.000')
    await playhead.press('Shift+ArrowRight')
    await expect(playhead).toHaveText('0:01.000')
    await frame.getByRole('button', { name: '分割选中片段', exact: true }).click()
    await expect(audioItems).toHaveCount(3)
    await audioItems.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '静音音频', exact: true }).click()
    await audioItems.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '恢复音量', exact: true }).click()
    await expect(frame.getByRole('button', { name: '在游标处分割音频', exact: true })).toHaveCount(
      0
    )
    await frame.getByLabel('编辑工具').getByLabel('按键', { exact: true }).click()
    // 右键选择声音片段可返回其起点；显示断言需明确定位到按键区间内。
    await playhead.press('Home')
    await playhead.press('Shift+ArrowRight')
    const showKeys = frame.getByRole('switch', { name: '显示按键输入', exact: true })
    await expect(showKeys).toBeChecked()
    await expect(frame.locator('[data-annotation-id^="keys-"]')).toHaveCount(1)
    await showKeys.press('Space')
    await expect(showKeys).not.toBeChecked()
    await expect(frame.locator('[data-annotation-id^="keys-"]')).toHaveCount(0)
    await expect(frame.locator('[data-variant="annotation"]')).toHaveCount(3)
    await showKeys.press('Space')
    await expect(showKeys).toBeChecked()
    await expect(frame.locator('[data-annotation-id^="keys-"]')).toHaveCount(1)
    await frame.getByText('机械键盘', { exact: true }).click()
    const keycapGaps = await frame
      .getByRole('grid', { name: '按键样式', exact: true })
      .getByRole('row')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const preview = button.querySelector('[data-keycap-preview]')!
          const label = button.querySelector('[data-keycap-label]')!
          return label.getBoundingClientRect().top - preview.getBoundingClientRect().bottom
        })
      )
    expect(keycapGaps).toHaveLength(5)
    expect(keycapGaps.every((gap) => gap >= 10)).toBe(true)
    await tool.screenshot({ path: testInfo.outputPath('keyboard-theme-spacing.png') })
    await expect(frame.locator('[data-variant="annotation"]')).toHaveCount(3)
    await showKeys.press('Space')
    await expect(showKeys).not.toBeChecked()
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    await app.evaluate(({ dialog }, sample) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sample] })
    }, cameraSample)
    await frame.getByRole('button', { name: '导入摄像头视频', exact: true }).click()
    await expect(frame.getByTestId('webcam-track')).toHaveCount(1)
    const cameraItems = frame.locator('[data-variant="webcam"]')
    await expect(cameraItems).toHaveCount(1)
    const screenStrip = frame.locator('[data-variant="clip"]').first().getByTestId('clip-filmstrip')
    const cameraStrip = cameraItems.first().getByTestId('clip-filmstrip')
    const iframe = tool.frames().find((f) => f.url().includes('presentation.html'))!
    await expect(screenStrip.locator('img').first()).toBeVisible({ timeout: 20000 })
    await expect(cameraStrip.locator('img').first()).toBeVisible({ timeout: 20000 })
    await expect(screenStrip).toHaveAttribute('data-pending', 'false', { timeout: 20000 })
    await expect(cameraStrip).toHaveAttribute('data-pending', 'false', { timeout: 20000 })
    const beforeFrames = await Promise.all(
      [screenStrip, cameraStrip].map((strip) =>
        strip
          .locator('img')
          .evaluateAll((images) => images.map((img) => (img as HTMLImageElement).src).join('|'))
      )
    )
    await frame.getByRole('button', { name: '放大时间轴', exact: true }).click()
    await frame.getByRole('button', { name: '放大时间轴', exact: true }).click()
    for (const [index, strip] of [screenStrip, cameraStrip].entries()) {
      await expect
        .poll(
          () =>
            strip
              .locator('img')
              .evaluateAll((images) =>
                images.map((img) => (img as HTMLImageElement).src).join('|')
              ),
          { timeout: 20000 }
        )
        .not.toBe(beforeFrames[index])
      const visible = await strip.evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        parentWidth: node.parentElement!.getBoundingClientRect().width
      }))
      expect(visible.width).toBeLessThan(visible.parentWidth)
      await expect(strip).toHaveAttribute('data-pending', 'false', { timeout: 20000 })
    }
    const pan = frame.getByLabel('时间轴横向滚动')
    for (const key of ['Home', 'End']) {
      await pan.focus()
      await pan.press(key)
      for (const strip of [screenStrip, cameraStrip])
        await expect(strip).toHaveAttribute('data-pending', 'false', { timeout: 20000 })
    }
    const statsBefore = await iframe.evaluate(async () =>
      (
        await import(
          '/presentation/src/components/video-editor/timeline/components/filmstrip/frameCache.ts' as string
        )
      ).getFilmstripCacheStats()
    )
    const warmPanMs: number[] = []
    for (const key of ['Home', 'End', 'Home', 'End']) {
      const started = Date.now()
      await pan.press(key)
      for (const strip of [screenStrip, cameraStrip])
        await expect(strip).toHaveAttribute('data-pending', 'false')
      warmPanMs.push(Date.now() - started)
    }
    const statsAfter = await iframe.evaluate(async () =>
      (
        await import(
          '/presentation/src/components/video-editor/timeline/components/filmstrip/frameCache.ts' as string
        )
      ).getFilmstripCacheStats()
    )
    expect(statsAfter.decodedFrames).toBe(statsBefore.decodedFrames)
    expect(statsAfter.decoders).toBe(2)
    expect(statsAfter.cachedFrames).toBeLessThanOrEqual(256)
    expect([...warmPanMs].sort((a, b) => a - b)[1]).toBeLessThan(300)
    console.log(
      'TIMELINE_FILMSTRIP_METRICS',
      JSON.stringify({ statsBefore, statsAfter, warmPanMs })
    )
    await tool.screenshot({ path: testInfo.outputPath('timeline-filmstrip-zoomed.png') })
    await frame.getByRole('button', { name: '适应全部', exact: true }).click()
    const viewportBounds = (await frame.getByTestId('timeline-scroll').boundingBox())!
    const visibleRows = await frame
      .locator('[data-timeline-row]:not([data-embedded])')
      .evaluateAll((rows) =>
        rows
          .map((row) => row.getBoundingClientRect())
          .filter((r) => r.height > 0)
          .sort((a, b) => a.top - b.top)
          .slice(0, 3)
          .map((r) => ({ top: r.top, bottom: r.bottom }))
      )
    expect(visibleRows).toHaveLength(3)
    expect(visibleRows[2].bottom).toBeLessThanOrEqual(viewportBounds.y + viewportBounds.height + 1)
    // 整轨排序使用真实标题拖动，与片段移动使用不同入口。
    const cameraHeader = frame.getByRole('button', { name: '调整摄像头轨道顺序', exact: true })
    const screenHeader = frame.getByRole('button', { name: '调整录屏轨道顺序', exact: true })
    expect(await cameraHeader.textContent()).not.toContain('⠿')
    const headerFrom = (await cameraHeader.boundingBox())!
    const headerTo = (await screenHeader.boundingBox())!
    await tool.mouse.move(headerFrom.x + headerFrom.width / 2, headerFrom.y + headerFrom.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(headerTo.x + headerTo.width / 2, headerTo.y + headerTo.height - 4, {
      steps: 8
    })
    await tool.mouse.move(headerTo.x + headerTo.width / 2, headerTo.y + headerTo.height - 4)
    await expect(frame.getByTestId('timeline-track-drop-preview')).toBeVisible()
    await expect(frame.getByTestId('timeline-track-drop-preview')).toHaveAttribute(
      'data-drop-edge',
      'after'
    )
    await tool.screenshot({ path: testInfo.outputPath('timeline-track-drop.png') })
    await tool.mouse.up()
    await expect(frame.getByTestId('timeline-track-drop-preview')).toHaveCount(0)
    await expect
      .poll(
        async () => (await cameraHeader.boundingBox())!.y - (await screenHeader.boundingBox())!.y
      )
      .toBeGreaterThan(0)
    await cameraHeader.focus()
    await cameraHeader.press('ArrowUp')
    await expect
      .poll(
        async () => (await cameraHeader.boundingBox())!.y - (await screenHeader.boundingBox())!.y
      )
      .toBeLessThan(0)
    await cameraItems.first().click()
    await expect(cameraItems.first().getByTestId('filmstrip-selection')).toBeVisible()
    await expect(frame.getByText('已选中', { exact: true })).toHaveCount(0)
    await playhead.press('Home')
    await playhead.press('Shift+ArrowRight')
    await frame.getByRole('button', { name: '分割选中片段', exact: true }).click()
    await expect(cameraItems).toHaveCount(2)
    await expect(frame.getByLabel('摄像头片段编辑')).toHaveCount(0)
    await expect(
      frame.getByRole('button', { name: '在游标处分割摄像头', exact: true })
    ).toHaveCount(0)
    await expect
      .poll(
        async () =>
          (await iframe.evaluate(async () => (await window.electronAPI.listProjectFiles()).entries))
            .length,
        { timeout: 20000 }
      )
      .toBeGreaterThan(0)
    const entries = await iframe.evaluate(
      async () => (await window.electronAPI.listProjectFiles()).entries
    )
    const projectPath = entries[0].path
    await expect
      .poll(
        async () => JSON.parse(await fs.readFile(projectPath, 'utf8')).editor.audioRegions?.length
      )
      .toBe(3)
    await expect
      .poll(
        async () =>
          JSON.parse(await fs.readFile(projectPath, 'utf8')).editor.webcam?.segments?.length
      )
      .toBe(2)
    const saved = JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    expect(saved.audioRegions).toHaveLength(3)
    expect(saved.audioRegions.some((item: any) => item.sourceStartMs === 1000)).toBe(true)
    expect(saved.keyboardDisplayEnabled).toBe(false)
    expect(saved.webcam.segments).toHaveLength(2)
    expect(saved.trackOrder.indexOf('webcam-row')).toBeLessThan(
      saved.trackOrder.indexOf('row-clip')
    )
    expect(saved.webcam.segments[1].sourceStartMs).toBe(1000)
    expect(saved.annotationRegions.map((item: any) => item.content)).toEqual(['Ctrl + S', 'h', 'i'])
    expect(
      saved.annotationRegions.every((item: any) => item.style.keycapStyle === 'mechanical')
    ).toBe(true)
    // Render actual scene effects and inspect pixels in the browser canvas.
    const effectPixels = await iframe.evaluate(async () => {
      const { renderAnnotations } = await import(
        '/presentation/src/lib/exporter/annotationRenderer.ts' as string
      )
      const canvas = document.createElement('canvas')
      canvas.width = 100
      canvas.height = 100
      const ctx = canvas.getContext('2d')!
      const base = {
        id: 'effect',
        startMs: 0,
        endMs: 1000,
        position: { x: 25, y: 25 },
        size: { width: 50, height: 50 },
        style: { borderRadius: 8 },
        zIndex: 1,
        blurIntensity: 70
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 100, 100)
      await renderAnnotations(ctx, [{ ...base, type: 'focus' }], 100, 100, 500, 1)
      const focus = [ctx.getImageData(0, 0, 1, 1).data[0], ctx.getImageData(50, 50, 1, 1).data[0]]
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 100, 100)
      ctx.fillStyle = '#000000'
      for (let x = 0; x < 100; x += 2) ctx.fillRect(x, 0, 1, 100)
      await renderAnnotations(ctx, [{ ...base, type: 'mosaic' }], 100, 100, 500, 1)
      const mosaic = [
        ctx.getImageData(50, 50, 1, 1).data[0],
        ctx.getImageData(51, 50, 1, 1).data[0]
      ]
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 100, 100)
      await renderAnnotations(
        ctx,
        [{ ...base, type: 'blur', blurColor: '#ff0000' }],
        100,
        100,
        500,
        1
      )
      const { OfflineAudioProcessor } = await import(
        '/presentation/src/lib/exporter/offlineAudioProcessor.ts' as string
      )
      const offline = new OfflineAudioContext(1, 48000, 48000)
      const buffer = offline.createBuffer(1, 96000, 48000)
      buffer.getChannelData(0).fill(0.8, 24000)
      const processor = new OfflineAudioProcessor()
      processor.scheduleRegionForChunk(
        offline,
        buffer,
        {
          id: 'sound',
          startMs: 0,
          endMs: 1000,
          sourceStartMs: 500,
          fadeInMs: 100,
          fadeOutMs: 100,
          volume: 1
        },
        [],
        0,
        1,
        true
      )
      const rendered = (await offline.startRendering()).getChannelData(0)
      const { DEFAULT_ANNOTATION_STYLE } = await import(
        '/presentation/src/components/video-editor/types.ts' as string
      )
      const keyCanvas = document.createElement('canvas')
      keyCanvas.width = 240
      keyCanvas.height = 100
      const keyContext = keyCanvas.getContext('2d')!
      await renderAnnotations(
        keyContext,
        [
          {
            ...base,
            type: 'keystroke',
            content: 'Ctrl + C',
            position: { x: 0, y: 0 },
            size: { width: 100, height: 100 },
            style: {
              ...DEFAULT_ANNOTATION_STYLE,
              backgroundColor: '#17172a',
              fontSize: 28,
              borderRadius: 10,
              keycapStyle: 'rgb'
            }
          }
        ],
        240,
        100,
        500,
        1
      )
      const keyPixels = keyContext.getImageData(0, 0, 240, 100).data
      let keycapAccentPixels = 0
      for (let index = 0; index < keyPixels.length; index += 4) {
        if (
          keyPixels[index] > keyPixels[index + 1] * 1.3 &&
          keyPixels[index + 2] > keyPixels[index + 1] * 1.3 &&
          keyPixels[index + 3] > 100
        )
          keycapAccentPixels++
      }
      const imageSource = document.createElement('canvas')
      imageSource.width = imageSource.height = 100
      imageSource.getContext('2d')!.fillStyle = '#ff0000'
      imageSource.getContext('2d')!.fillRect(0, 0, 100, 100)
      const imageOutput = document.createElement('canvas')
      imageOutput.width = imageOutput.height = 100
      const imageContext = imageOutput.getContext('2d')!
      await renderAnnotations(
        imageContext,
        [
          {
            ...base,
            type: 'image',
            content: imageSource.toDataURL(),
            position: { x: 0, y: 0 },
            size: { width: 100, height: 100 },
            style: { ...DEFAULT_ANNOTATION_STYLE, borderRadius: 30 }
          }
        ],
        100,
        100,
        500,
        1
      )
      return {
        keycapAccentPixels,
        imageCorner: [
          imageContext.getImageData(0, 0, 1, 1).data[3],
          imageContext.getImageData(50, 50, 1, 1).data[0]
        ],
        focus,
        mosaic,
        blur: Array.from(ctx.getImageData(50, 50, 1, 1).data),
        audio: [rendered[0], rendered[24000], rendered[47999]]
      }
    })
    expect(effectPixels.focus[0]).toBeLessThan(100)
    expect(effectPixels.focus[1]).toBe(255)
    expect(effectPixels.mosaic[0]).toBe(effectPixels.mosaic[1])
    expect(effectPixels.blur[1]).toBeGreaterThan(240)
    expect(effectPixels.audio[0]).toBeCloseTo(0, 2)
    expect(effectPixels.audio[1]).toBeGreaterThan(0.7)
    expect(effectPixels.audio[2]).toBeLessThan(0.01)
    expect(effectPixels.keycapAccentPixels).toBeGreaterThan(100)
    expect(effectPixels.imageCorner).toEqual([0, 255])
    await app.evaluate(({ dialog }, projectPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] })
    }, projectPath)
    await frame.getByRole('button', { name: '导入项目', exact: true }).click()
    await expect(frame.getByText(`已加载项目：${projectPath}`, { exact: true })).toBeVisible({
      timeout: 15000
    })
    await expect(frame.getByTestId('webcam-track')).toHaveCount(1)
    await expect(audioItems).toHaveCount(3)
    await frame.getByLabel('编辑工具').getByLabel('按键', { exact: true }).click()
    await expect(showKeys).not.toBeChecked()
    await expect(frame.locator('[data-variant="annotation"]')).toHaveCount(3)
    await showKeys.press('Space')
    await expect(showKeys).toBeChecked()
    await expect(
      frame.getByText('机械键盘', { exact: true }).locator('xpath=ancestor::*[@role="row"]')
    ).toHaveAttribute('aria-selected', 'true')
    await expect
      .poll(
        async () =>
          (await frame
            .getByRole('button', { name: '调整摄像头轨道顺序', exact: true })
            .boundingBox())!.y -
          (await frame
            .getByRole('button', { name: '调整录屏轨道顺序', exact: true })
            .boundingBox())!.y
      )
      .toBeLessThan(0)
    const reopened = JSON.parse(await fs.readFile(projectPath, 'utf8'))
    reopened.editor.annotationRegions.push({
      ...saved.annotationRegions[0],
      id: 'mosaic-preview',
      type: 'mosaic',
      position: { x: 25, y: 25 },
      size: { width: 30, height: 30 },
      startMs: 0,
      endMs: 2000,
      blurIntensity: 40
    })
    await fs.writeFile(projectPath, JSON.stringify(reopened))
    const effectProject = path.join(temporary, 'effects.recordly')
    await fs.writeFile(effectProject, JSON.stringify(reopened))
    await app.evaluate(({ dialog }, effectProject) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [effectProject] })
    }, effectProject)
    await expect(frame.locator('[data-webcam-overlay] video')).toHaveJSProperty('readyState', 4)
    await frame.getByRole('button', { name: '导入项目', exact: true }).click()
    const mosaicCanvas = frame.locator('[data-annotation-id="mosaic-preview"] canvas')
    await expect(mosaicCanvas).toBeVisible()
    await expect
      .poll(() =>
        mosaicCanvas.evaluate(
          (canvas: HTMLCanvasElement) =>
            canvas
              .getContext('2d')!
              .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)
              .data[3]
        )
      )
      .toBe(255)
    const mosaicRegion = frame.locator('[data-annotation-id="mosaic-preview"]')
    await mosaicRegion.click()
    const beforeDrag = (await mosaicRegion.boundingBox())!
    await tool.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(
      beforeDrag.x + beforeDrag.width / 2 + 20,
      beforeDrag.y + beforeDrag.height / 2 + 15,
      { steps: 5 }
    )
    await tool.mouse.up()
    await expect(mosaicRegion).toHaveAttribute('data-selected', 'true')
    await expect
      .poll(async () => (await mosaicRegion.boundingBox())!.x)
      .toBeGreaterThan(beforeDrag.x + 10)
    await tool.screenshot({ path: testInfo.outputPath('presentation-tracks.png') })
    const screenClips = frame.locator('[data-variant="clip"]')
    await playhead.focus()
    await playhead.press('Home')
    await playhead.press('Shift+ArrowRight')
    await playhead.press('ArrowRight')
    await expect(playhead).toHaveText('0:01.001')
    await playhead.press('ArrowLeft')
    await screenClips.first().click()
    await frame.getByRole('button', { name: '放大时间轴', exact: true }).click()
    await frame.getByRole('button', { name: '放大时间轴', exact: true }).click()
    await playhead.press('Shift+ArrowRight')
    await expect(frame.getByLabel('当前时间轴比例')).toHaveText('225%')
    await frame.getByRole('button', { name: '分割选中片段', exact: true }).click()
    await expect(screenClips).toHaveCount(2)
    await expect(frame.getByLabel('当前时间轴比例')).toHaveText('225%')
    await frame.getByRole('button', { name: '适应全部', exact: true }).click()
    const adjacent = await screenClips.evaluateAll((clips) =>
      clips.map((clip) => {
        const rect = clip.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      })
    )
    expect(Math.abs(adjacent[0].right - adjacent[1].left)).toBeLessThanOrEqual(1)
    await expect(frame.getByTestId('clip-seam-grip')).toHaveCount(0)
    await expect(screenClips.locator('[title^="调整"]')).toHaveCount(0)
    await screenClips.first().click()
    await expect(frame.getByRole('button', { name: '分割选中片段', exact: true })).toBeDisabled()
    await frame.getByRole('button', { name: '撤销', exact: true }).click()
    await expect(screenClips).toHaveCount(1)
    await screenClips.first().click()
    await expect(frame.getByRole('switch', { name: '显示原始音轨', exact: true })).toHaveCount(0)
    await screenClips.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '复制', exact: true }).click()
    await playhead.press('Home')
    await playhead.press('Shift+ArrowRight')
    await playhead.press('Shift+ArrowRight')
    await screenClips.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '粘贴', exact: true }).click()
    await expect(screenClips).toHaveCount(2)
    await screenClips.first().click({ button: 'right' })
    await expect(frame.getByRole('menuitem', { name: '向前移动', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('menuitem', { name: '向后移动', exact: true })).toHaveCount(0)
    await frame.getByRole('menu', { name: '片段操作' }).press('Escape')
    const movingId = await screenClips.first().getAttribute('data-item-id')
    const firstClipBox = (await screenClips.first().boundingBox())!
    const secondClipBox = (await screenClips.last().boundingBox())!
    await tool.mouse.move(
      firstClipBox.x + firstClipBox.width / 2,
      firstClipBox.y + firstClipBox.height / 2
    )
    await tool.mouse.down()
    await tool.mouse.move(
      secondClipBox.x + secondClipBox.width * 0.8,
      secondClipBox.y + secondClipBox.height / 2,
      { steps: 12 }
    )
    await expect(frame.getByTestId('timeline-item-drop-preview')).toBeVisible()
    await expect(frame.getByTestId('timeline-item-drop-preview')).toHaveAttribute(
      'data-drop-row',
      'row-clip'
    )
    await tool.screenshot({ path: testInfo.outputPath('timeline-item-drop.png') })
    await tool.mouse.up()
    await expect(frame.getByTestId('timeline-item-drop-preview')).toHaveCount(0)
    await expect
      .poll(() => frame.locator(`[data-item-id="${movingId}"]`).getAttribute('data-start-ms'))
      .toBe('2000')
    await screenClips.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect(screenClips).toHaveCount(1)
    // Scroll the real timeline: ruler and timestamp stay inside its viewport.
    const secondCamera = cameraItems.last()
    await secondCamera.scrollIntoViewIfNeeded()
    const cameraId = await secondCamera.getAttribute('data-item-id')
    const cameraFrom = (await secondCamera.boundingBox())!
    const cameraTo = (await cameraItems.first().boundingBox())!
    await tool.mouse.move(cameraFrom.x + cameraFrom.width / 2, cameraFrom.y + cameraFrom.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(cameraTo.x + cameraTo.width / 4, cameraTo.y + cameraTo.height / 2, {
      steps: 12
    })
    await tool.mouse.up()
    await expect
      .poll(() => frame.locator(`[data-item-id="${cameraId}"]`).getAttribute('data-start-ms'))
      .toBe('0')
    await expect
      .poll(
        async () =>
          JSON.parse(await fs.readFile(effectProject, 'utf8')).editor.webcam.segments.find(
            (segment: any) => segment.id === cameraId
          )?.sourceStartMs
      )
      .toBe(1000)
    const scroll = frame.getByTestId('timeline-scroll')
    const scrollBounds = (await scroll.boundingBox())!
    const rulerBefore = (await frame.getByTestId('timeline-ruler').boundingBox())!
    await scroll.hover()
    await tool.mouse.wheel(0, 450)
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    expect(
      Math.abs((await frame.getByTestId('timeline-ruler').boundingBox())!.y - rulerBefore.y)
    ).toBeLessThan(2)
    const capBounds = (await frame.getByTestId('playhead-cap').boundingBox())!
    expect(capBounds.y).toBeGreaterThanOrEqual(scrollBounds.y - 1)
    expect(capBounds.y + capBounds.height).toBeLessThan(scrollBounds.y + scrollBounds.height)
    // 刻度栏在滚动后必须自己接收鼠标，不能把点击穿透到下方片段。
    const selectionBeforeSeek = await frame
      .locator('[data-timeline-item][data-selected="true"]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('data-item-id')))
    await playhead.focus()
    await playhead.press('Home')
    const stickyRuler = frame.getByTestId('timeline-ruler')
    const stickyBox = (await stickyRuler.boundingBox())!
    await stickyRuler.click({ position: { x: stickyBox.width * 0.6, y: 16 } })
    await expect(playhead).not.toHaveText('0:00.000')
    await expect
      .poll(() =>
        frame
          .locator('[data-timeline-item][data-selected="true"]')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-item-id')))
      )
      .toEqual(selectionBeforeSeek)
    await expect(stickyRuler).toHaveCSS('pointer-events', 'auto')
    await tool.screenshot({ path: testInfo.outputPath('timeline-sticky-ruler-seek.png') })
    // 滚动后点击真实轨道留白，不能选择或拖动其他行的片段。
    const blank = await iframe.evaluate(() => {
      const viewport = document
        .querySelector('[data-testid="timeline-scroll"]')!
        .getBoundingClientRect()
      for (let y = viewport.top + 42; y < viewport.bottom - 4; y += 3) {
        const x = viewport.left + viewport.width * 0.4
        const target = document.elementFromPoint(x, y)
        if (
          target?.closest('[data-timeline-rows]') &&
          !target.closest('[data-timeline-item], button')
        )
          return { x, y }
      }
      return null
    })
    expect(blank).not.toBeNull()
    const frameOffset = (await tool.locator('iframe').boundingBox())!
    await tool.mouse.click(frameOffset.x + blank!.x, frameOffset.y + blank!.y)
    await expect
      .poll(() =>
        frame
          .locator('[data-timeline-item][data-selected="true"]')
          .evaluateAll((items) => items.map((item) => item.getAttribute('data-item-id')))
      )
      .toEqual(selectionBeforeSeek)
    await expect(playhead).not.toHaveText('0:01.000')
    await frame.getByTestId('timeline-ruler').dispatchEvent('wheel', {
      ctrlKey: true,
      deltaY: -300,
      clientX: scrollBounds.x + scrollBounds.width / 2,
      clientY: scrollBounds.y + 10
    })
    const horizontal = frame.getByLabel('时间轴横向滚动')
    await expect(horizontal).toBeEnabled()
    await horizontal.focus()
    await horizontal.press('End')
    expect(Number(await horizontal.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    await tool.screenshot({ path: testInfo.outputPath('timeline-scrolled.png') })
    // 比例滚动条支持真实拖动，轨道编辑菜单在明暗下使用不透明底色。
    await horizontal.press('Home')
    const scrollbarBox = (await horizontal.boundingBox())!
    await tool.mouse.move(scrollbarBox.x + 12, scrollbarBox.y + scrollbarBox.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(
      scrollbarBox.x + scrollbarBox.width - 12,
      scrollbarBox.y + scrollbarBox.height / 2,
      { steps: 8 }
    )
    await tool.mouse.up()
    expect(Number(await horizontal.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    await frame.getByRole('button', { name: '适应全部', exact: true }).click()
    await frame.getByRole('button', { name: '自动添加变焦', exact: true }).click()
    const zoomCount = await zoomItems.count()
    expect(zoomCount).toBeGreaterThan(0)
    for (const dark of [false, true]) {
      await iframe.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark)
      await zoomItems.first().click({ button: 'right' })
      const menu = frame.getByRole('menu', { name: '片段操作' })
      await expect(menu).toBeVisible()
      const connectedZoom = frame.getByRole('switch', { name: '连接变焦', exact: true })
      await expect(connectedZoom).toBeVisible()
      await expect
        .poll(() =>
          connectedZoom.evaluate((element) => {
            const surface = element.closest('[style*="opacity"]')
            return surface ? getComputedStyle(surface).opacity : '1'
          })
        )
        .toBe('1')
      expect(
        await menu.evaluate((element) => getComputedStyle(element).backgroundColor)
      ).not.toMatch(/rgba\(.*?, 0\)/)
      await tool.screenshot({
        path: testInfo.outputPath(dark ? 'timeline-menu-dark.png' : 'timeline-menu-light.png')
      })
      await menu.press('Escape')
    }
    await zoomItems.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect(zoomItems).toHaveCount(zoomCount - 1)
    await audioItems.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect(audioItems).toHaveCount(2)
    await expect
      .poll(
        async () => JSON.parse(await fs.readFile(effectProject, 'utf8')).editor.audioRegions.length
      )
      .toBe(2)
    // Removing the loaded project must drain autosave and leave no recreated .recordly file.
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await frame.getByRole('button', { name: '选择项目', exact: true }).click()
    await frame.getByRole('button', { name: '全选', exact: true }).click()
    await frame.getByRole('button', { name: '删除', exact: true }).click()
    await expect
      .poll(
        async () =>
          (await iframe.evaluate(async () => (await window.electronAPI.listProjectFiles()).entries))
            .length,
        { timeout: 30000 }
      )
      .toBe(0)
    expect(
      await iframe.evaluate(async () =>
        (
          await import(
            '/presentation/src/components/video-editor/timeline/components/filmstrip/frameCache.ts' as string
          )
        ).getFilmstripCacheStats()
      )
    ).toMatchObject({ sources: 0, decoders: 0, cachedFrames: 0 })
    await expect(frame.getByTestId('clip-filmstrip').locator('img')).toHaveCount(0)
    await expect
      .poll(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800))
        return (await fs.readdir(path.dirname(projectPath))).filter((name) =>
          name.endsWith('.recordly')
        ).length
      })
      .toBe(0)
    expect((await fs.stat(sample)).size).toBeGreaterThan(1000)
    // Delete raw media through the dashboard and verify all owned sidecars leave the source directory.
    const raw = await iframe.evaluate(
      async (data) => {
        const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
        return window.electronAPI.storeRecordedVideo(bytes.buffer, 'recording-1793250000000.mp4', {
          auxiliary: true
        })
      },
      (await fs.readFile(sample)).toString('base64')
    )
    expect(raw.success).toBe(true)
    expect(raw.path!.startsWith(temporary)).toBe(true)
    const stem = raw.path!.replace(/\.mp4$/, '')
    const sidecars = [
      stem + '-webcam.mp4',
      stem + '.system.wav',
      raw.path + '.cursor.json',
      stem + '.recording-diagnostics.json'
    ]
    await fs.copyFile(cameraSample, sidecars[0])
    await fs.copyFile(sample.replace('.mp4', '.system.wav'), sidecars[1])
    await fs.writeFile(sidecars[2], '{}')
    await fs.writeFile(sidecars[3], '{}')
    await frame.getByRole('button', { name: '原始录制', exact: true }).click()
    await frame.getByRole('button', { name: '选择要删除的录制', exact: true }).click()
    await frame.getByRole('button', { name: '全选', exact: true }).click()
    await frame.getByRole('button', { name: '删除', exact: true }).click()
    await expect
      .poll(() =>
        iframe.evaluate(async () => (await window.electronAPI.listRecordings(true)).value?.length)
      )
      .toBe(0)
    for (const file of [raw.path!, ...sidecars]) await expect(fs.stat(file)).rejects.toThrow()
    expect((await fs.stat(sample)).size).toBeGreaterThan(1000)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
