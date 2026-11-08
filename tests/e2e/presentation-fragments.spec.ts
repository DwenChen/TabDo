import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示所有片段复制粘贴、注释移动旋转及连续撤销重做', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(300000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-editor-review-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, '样片.mp4')
    execFileSync(
      ffmpeg!,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=15',
        '-t',
        '6',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        sample
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    const audioPath = path.join(temporary, 'sound.wav')
    execFileSync(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', audioPath], {
      windowsHide: true,
      stdio: 'ignore'
    })
    await fs.writeFile(
      sample + '.cursor.json',
      JSON.stringify({
        version: 1,
        samples: [
          { timeMs: 200, cx: 0.3, cy: 0.4, keyText: 'Ctrl + S' },
          { timeMs: 600, cx: 0.5, cy: 0.5, keyText: 'A' }
        ]
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
    const pageErrors: string[] = []
    tool.on('pageerror', (error) => pageErrors.push(error.message))
    const frame = tool.frameLocator('iframe')
    await expect(frame.getByText('演示编辑器', { exact: true })).toBeVisible({ timeout: 60000 })
    await frame.getByRole('dialog', { name: '演示项目', exact: true }).press('Escape')
    await app.evaluate(({ dialog }, sample) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sample] })
    }, sample)
    await frame.getByRole('button', { name: '导入视频', exact: true }).click()
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    const iframe = tool.frames().find((item) => item.url().includes('presentation.html'))!
    await expect
      .poll(
        async () =>
          (await iframe.evaluate(async () => (await window.electronAPI.listProjectFiles()).entries))
            .length
      )
      .toBeGreaterThan(0)
    const library = await iframe.evaluate(async () => window.electronAPI.listProjectFiles())
    const projectPath = library.entries[0].path
    /**
     * 读取实际自动保存模型，断言 UI 操作确实进入持久编辑链。
     * @returns 当前保存的编辑参数。
     */
    async function saved(): Promise<any> {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }
    const initial = JSON.parse(await fs.readFile(projectPath, 'utf8'))
    const seededPath = path.join(library.projectsDir!, '片段回归.recordly')
    const note = {
      id: 'note',
      startMs: 500,
      endMs: 1500,
      type: 'figure',
      content: '',
      rotation: 0,
      position: { x: 30, y: 40 },
      size: { width: 25, height: 15 },
      zIndex: 2,
      trackIndex: 0,
      style: {
        fontSize: 32,
        color: '#fff',
        backgroundColor: 'transparent',
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center',
        borderRadius: 8
      },
      figureData: { arrowDirection: 'right', arrowStyle: 'solid', color: '#ff0000', strokeWidth: 4 }
    }
    const seeded = {
      ...initial,
      projectId: crypto.randomUUID(),
      editor: {
        ...initial.editor,
        clipRegions: [{ id: 'footage', startMs: 0, endMs: 6000, sourceStartMs: 0, speed: 1 }],
        sourceAudioTrackSettingsByClip: { footage: { system: { volume: 0.6, normalize: true } } },
        zoomRegions: [
          {
            id: 'zoom',
            startMs: 2000,
            endMs: 2500,
            depth: 2,
            focus: { cx: 0.5, cy: 0.5 },
            mode: 'manual'
          }
        ],
        annotationRegions: [note],
        audioRegions: [
          {
            id: 'sound',
            audioPath,
            startMs: 0,
            endMs: 500,
            sourceStartMs: 200,
            volume: 0.7,
            fadeInMs: 20,
            trackIndex: 0
          }
        ],
        autoCaptions: [
          {
            id: 'caption',
            startMs: 3000,
            endMs: 3500,
            text: '回归字幕',
            words: [
              { startMs: 3000, endMs: 3200, text: '回归' },
              { startMs: 3200, endMs: 3500, text: '字幕' }
            ]
          }
        ],
        autoCaptionSettings: { ...initial.editor.autoCaptionSettings, enabled: true },
        webcam: {
          ...initial.editor.webcam,
          enabled: true,
          sourcePath: sample,
          sourceDurationMs: 6000,
          segments: [{ id: 'camera', startMs: 0, endMs: 500, sourceStartMs: 1000 }]
        }
      }
    }
    await fs.writeFile(seededPath, JSON.stringify(seeded))
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    const selectProjects = frame.getByRole('button', { name: '选择项目', exact: true })
    await expect(selectProjects.locator('svg')).toBeVisible()
    await frame.getByRole('button', { name: '片段回归', exact: true }).click()
    await expect(frame.locator('[data-item-id="note"]')).toBeVisible()
    /**
     * 读取当前测试项目的自动保存状态。
     * @returns 沿真实保存链写出的编辑模型。
     */
    async function state(): Promise<any> {
      return JSON.parse(await fs.readFile(seededPath, 'utf8')).editor
    }
    const undo = frame.getByRole('button', { name: '撤销', exact: true }),
      redo = frame.getByRole('button', { name: '重做', exact: true })
    const playhead = frame.getByTestId('playhead-cap')
    const noteItem = frame.locator('[data-item-id="note"]')
    await noteItem.click()
    const overlay = frame.locator('[data-annotation-id="note"]')
    await expect(overlay).toBeVisible()
    await expect(frame.getByLabel('箭头方向', { exact: true })).toHaveCount(0)
    // 真正移动导轨片段到游标原位置以外，验证预览和一次撤销/重做。
    const rect = (await noteItem.boundingBox())!
    await tool.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(rect.x + rect.width * 2.2, rect.y + rect.height / 2, { steps: 12 })
    await tool.mouse.up()
    await expect
      .poll(async () => (await state()).annotationRegions[0].startMs)
      .toBeGreaterThan(1500)
    const moved = (await state()).annotationRegions[0].startMs
    await expect(overlay).toBeVisible()
    await undo.click()
    await expect.poll(async () => (await state()).annotationRegions[0].startMs).toBe(500)
    await expect(overlay).toBeVisible()
    await redo.click()
    await expect.poll(async () => (await state()).annotationRegions[0].startMs).toBe(moved)
    await expect(overlay).toBeVisible()
    // 编辑框绕中心旋转约九十度，结束时只发布一个历史步骤。
    const handle = (await frame
      .getByRole('button', { name: '旋转注释', exact: true })
      .boundingBox())!
    const box = (await overlay.boundingBox())!,
      cx = box.x + box.width / 2,
      cy = box.y + box.height / 2
    const radius = cy - (handle.y + handle.height / 2)
    await tool.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(cx + radius, cy, { steps: 12 })
    await tool.mouse.up()
    await expect.poll(async () => (await state()).annotationRegions[0].rotation).toBeGreaterThan(85)
    const rotated = (await state()).annotationRegions[0].rotation
    expect(rotated).toBeLessThan(95)
    await undo.click()
    await expect(overlay).toHaveAttribute('data-rotation', '0')
    await redo.click()
    await expect
      .poll(async () => Number(await overlay.getAttribute('data-rotation')))
      .toBeCloseTo(rotated, 2)
    const originalSize = (await state()).annotationRegions[0].size
    const resize = (await frame
      .getByRole('button', { name: '调整注释右下角', exact: true })
      .boundingBox())!
    await tool.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(resize.x + resize.width / 2 - 12, resize.y + resize.height / 2 + 18, {
      steps: 6
    })
    await tool.mouse.up()
    await expect
      .poll(async () => (await state()).annotationRegions[0].size)
      .not.toEqual(originalSize)
    await undo.click()
    await expect.poll(async () => (await state()).annotationRegions[0].size).toEqual(originalSize)
    await redo.click()
    // 用户手动浏览片段外时仍可离开注释，不会被定位逻辑锁住。
    await playhead.press('Home')
    await expect(overlay).toHaveCount(0)
    // 如果已经选中同一对象，点击片段也应定位；先切视频再回来覆盖普通选择。
    await frame.locator('[data-item-id="footage"]').click()
    await noteItem.click()
    await expect(overlay).toBeVisible()
    await tool.screenshot({ path: testInfo.outputPath('rotated-annotation.png') })
    // Escape 丢弃未发布旋转，且保持重做链；同一对象单击不占用历史。
    await overlay.click()
    await expect(frame.getByRole('button', { name: '旋转注释', exact: true })).toBeVisible()
    const cancelHandle = (await frame
      .getByRole('button', { name: '旋转注释', exact: true })
      .boundingBox())!
    await tool.mouse.move(
      cancelHandle.x + cancelHandle.width / 2,
      cancelHandle.y + cancelHandle.height / 2
    )
    await tool.mouse.down()
    await tool.mouse.move(cancelHandle.x + 30, cancelHandle.y + 30, { steps: 5 })
    await frame.locator('body').press('Escape')
    await tool.mouse.up()
    await expect
      .poll(async () => (await state()).annotationRegions[0].rotation)
      .toBeCloseTo(rotated, 2)
    const pixels = await iframe.evaluate(
      async (editor) => {
        const { renderAnnotations, renderAnnotationToCanvas } = await import(
          '/presentation/src/lib/exporter/annotationRenderer.ts' as string
        )
        const source = editor.annotationRegions.find((item: any) => item.id === 'note')
        const result = []
        for (const type of ['text', 'image', 'figure', 'blur', 'mosaic', 'focus']) {
          const img = document.createElement('canvas')
          img.width = 40
          img.height = 20
          img.getContext('2d')!.fillRect(0, 0, 40, 20)
          const item = {
            ...source,
            type,
            content: type === 'image' ? img.toDataURL() : '测试',
            rotation: 45,
            position: { x: 25, y: 40 },
            size: { width: 50, height: 20 }
          }
          const canvas = document.createElement('canvas')
          canvas.width = 160
          canvas.height = 160
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#0055aa'
          ctx.fillRect(0, 0, 160, 160)
          await renderAnnotations(ctx, [item], 160, 160, item.startMs + 1, 1)
          const bytes = ctx.getImageData(0, 0, 160, 160).data
          const sprite = await renderAnnotationToCanvas(item, 80, 32, 1)
          result.push({
            type,
            visible: bytes.some((value, index) => index % 4 === 0 && value !== 0),
            sprite: !!sprite,
            transform: ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => Number(ctx.getTransform()[key]))
          })
        }
        // 实心右向箭头在90度旋转后，输出像素应从横向变为纵向。
        const extents = []
        for (const rotation of [0, 90]) {
          const canvas = document.createElement('canvas')
          canvas.width = 160
          canvas.height = 160
          const ctx = canvas.getContext('2d')!
          await renderAnnotations(
            ctx,
            [{ ...source, rotation, position: { x: 20, y: 20 }, size: { width: 60, height: 60 } }],
            160,
            160,
            source.startMs + 1,
            1
          )
          const bytes = ctx.getImageData(0, 0, 160, 160).data,
            xs = [],
            ys = []
          for (let y = 0; y < 160; y++)
            for (let x = 0; x < 160; x++)
              if (bytes[(y * 160 + x) * 4 + 3]) {
                xs.push(x)
                ys.push(y)
              }
          extents.push([Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)])
        }
        const { FrameRenderer } = await import(
          '/presentation/src/lib/exporter/modernFrameRenderer.ts' as string
        )
        const modern = []
        for (const rotation of [0, 90]) {
          const renderer = new FrameRenderer({
            width: 160,
            height: 160,
            videoWidth: 160,
            videoHeight: 160,
            wallpaper: '#000000',
            zoomRegions: [],
            showShadow: false,
            shadowIntensity: 0,
            backgroundBlur: 0,
            padding: 0,
            cropRegion: { x: 0, y: 0, width: 1, height: 1 },
            showCursor: false,
            previewWidth: 160,
            previewHeight: 160,
            annotationRegions: [
              { ...source, rotation, position: { x: 20, y: 20 }, size: { width: 60, height: 60 } }
            ]
          })
          const canvas = document.createElement('canvas')
          canvas.width = 160
          canvas.height = 160
          canvas.getContext('2d')!.fillRect(0, 0, 160, 160)
          const video = new VideoFrame(canvas, { timestamp: 0 })
          try {
            await renderer.initialize()
            await renderer.renderFrame(video, (source.startMs + 1) * 1000)
            const bytes = renderer.capturePixelsForNativeExport()!,
              xs = [],
              ys = []
            for (let y = 0; y < 160; y++)
              for (let x = 0; x < 160; x++) {
                const at = (y * 160 + x) * 4
                if (bytes[at] > 150 && bytes[at + 1] < 80 && bytes[at + 2] < 80) {
                  xs.push(x)
                  ys.push(y)
                }
              }
            modern.push([Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)])
          } finally {
            video.close()
            renderer.destroy()
          }
        }
        return { result, extents, modern }
      },
      await state()
    )
    expect(pixels.extents[0][0]).toBeGreaterThan(pixels.extents[0][1])
    expect(pixels.extents[1][1]).toBeGreaterThan(pixels.extents[1][0])
    expect(pixels.modern[0][0]).toBeGreaterThan(pixels.modern[0][1])
    expect(pixels.modern[1][1]).toBeGreaterThan(pixels.modern[1][0])
    expect(pixels.result.every((item) => item.transform.join(',') === '1,0,0,1,0,0')).toBe(true)
    expect(
      pixels.result
        .filter((item) => ['text', 'image', 'figure'].includes(item.type))
        .every((item) => item.sprite)
    ).toBe(true)
    // 每种导轨执行复制、粘贴、撤销重做、删除及撤销重做；复制本身不增加项目编辑。
    for (const [variant, originalId, field] of [
      ['annotation', 'note', 'annotationRegions'],
      ['audio', 'sound', 'audioRegions'],
      ['zoom', 'zoom', 'zoomRegions'],
      ['webcam', 'camera', 'webcam'],
      ['caption', 'caption', 'autoCaptions']
    ] as const) {
      const items = frame.locator('[data-variant="' + variant + '"]')
      const original =
        variant === 'caption' ? items.first() : frame.locator('[data-item-id="' + originalId + '"]')
      const before = await state(),
        list = field === 'webcam' ? before.webcam.segments : before[field],
        count = list.length
      await original.click({ button: 'right' })
      await expect(frame.getByRole('menuitem', { name: '复制', exact: true })).toBeVisible()
      await expect(frame.getByRole('menuitem', { name: '删除片段', exact: true })).toBeVisible()
      await frame.getByRole('menuitem', { name: '复制', exact: true }).click()
      await playhead.press('Home')
      await original.click({ button: 'right' })
      await frame.getByRole('menuitem', { name: '粘贴', exact: true }).click()
      /**
       * 读取当前类型实际落盘的片段集合。
       * @returns 摄像头区间或当前独立轨道的片段。
       */
      const readList = async (): Promise<any[]> => {
        const value = await state()
        return field === 'webcam' ? value.webcam.segments : value[field]
      }
      await expect.poll(async () => (await readList()).length).toBe(count + 1)
      const copied = (await readList()).find(
        (item: any) => !list.some((old: any) => old.id === item.id)
      )
      expect(copied.id).not.toBe(originalId)
      if (variant === 'annotation') {
        expect(copied.rotation).toBeCloseTo(rotated, 2)
        expect(copied.figureData).toEqual(list[0].figureData)
      }
      if (variant === 'audio' || variant === 'webcam')
        expect(copied.sourceStartMs).toBe(list[0].sourceStartMs)
      if (variant === 'caption')
        expect(copied.words.map((word: any) => word.endMs - word.startMs)).toEqual([200, 300])
      await undo.click()
      await expect.poll(async () => (await readList()).length).toBe(count)
      await redo.click()
      await expect.poll(async () => (await readList()).length).toBe(count + 1)
      const copiedItem =
        variant === 'caption'
          ? frame.locator('[data-variant="caption"][data-item-id*="' + copied.id + '"]')
          : frame.locator('[data-item-id="' + copied.id + '"]')
      await copiedItem.click({ button: 'right' })
      await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
      await expect.poll(async () => (await readList()).length).toBe(count)
      await undo.click()
      await expect.poll(async () => (await readList()).length).toBe(count + 1)
      await redo.click()
      await expect.poll(async () => (await readList()).length).toBe(count)
      if (variant === 'audio') {
        await expect(frame.locator('.editor-inspector').getByText('Audio', { exact: true })).toHaveCount(0)
        await expect(frame.locator('.editor-inspector').getByText('音频', { exact: true }).first()).toBeVisible()
      }
    }
    await frame.locator('[data-item-id="camera"]').click()
    await expect(frame.getByRole('button', { name: '移除摄像头视频', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('button', { name: '替换摄像头视频', exact: true })).toBeVisible()
    await frame.locator('[data-item-id="zoom"]').click()
    const common = frame.getByRole('group', { name: '变焦通用设置', exact: true })
    await common.getByRole('button', { name: '变焦通用设置', exact: true }).click()
    expect(
      await common
        .getByText('连接变焦', { exact: true })
        .evaluate((node) => getComputedStyle(node).fontSize)
    ).toBe('12px')
    expect(
      await common
        .getByText('运动效果', { exact: true })
        .evaluate((node) => getComputedStyle(node).fontSize)
    ).toBe('12px')
    expect(
      await common
        .getByText('平滑', { exact: true })
        .evaluate((node) => getComputedStyle(node).fontSize)
    ).toBe('12px')
    await common.getByText('运动效果', { exact: true }).scrollIntoViewIfNeeded()
    await tool.screenshot({ path: testInfo.outputPath('consistent-settings.png') })
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    await tool.screenshot({ path: testInfo.outputPath('consistent-settings-dark.png') })
    await iframe.evaluate(() => document.documentElement.classList.remove('dark'))
    const footage = frame.locator('[data-item-id="footage"]')
    await footage.click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '复制', exact: true }).click()
    await playhead.press('Home')
    await playhead.press('Shift+ArrowRight')
    await footage.click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '粘贴', exact: true }).click()
    await expect.poll(async () => (await state()).clipRegions.length).toBe(3)
    const sequence = (await state()).clipRegions
    expect(sequence.map((clip: any) => clip.sourceStartMs)).toEqual([0, 0, 1000])
    const pastedState = await state()
    expect(pastedState.annotationRegions.find((item: any) => item.id === 'note').startMs).toBe(
      moved + 6000
    )
    expect(
      pastedState.annotationRegions.find((item: any) => item.id === 'note').rotation
    ).toBeCloseTo(rotated, 2)
    for (const clip of sequence)
      expect(pastedState.sourceAudioTrackSettingsByClip[clip.id]).toEqual(
        pastedState.sourceAudioTrackSettingsByClip.footage
      )
    await undo.click()
    await expect.poll(async () => (await state()).clipRegions.length).toBe(1)
    await redo.click()
    await expect.poll(async () => (await state()).clipRegions).toEqual(sequence)
    // 保存重开后仍保留旋转和副本源偏移，切换项目清理旧片段剪贴板。
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await frame.getByRole('button', { name: library.entries[0].name, exact: true }).click()
    await expect(frame.getByRole('dialog', { name: '演示项目', exact: true })).not.toBeVisible()
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await frame.getByRole('button', { name: '片段回归', exact: true }).click()
    await expect(frame.getByRole('dialog', { name: '演示项目', exact: true })).not.toBeVisible()
    await expect(frame.locator('[data-variant="clip"]')).toHaveCount(3)
    await expect
      .poll(
        async () =>
          (await state()).annotationRegions.find((item: any) => item.id === 'note').rotation
      )
      .toBeCloseTo(rotated, 2)
    await frame.getByRole('button', { name: '16:9', exact: true }).click()
    await expect(frame.getByRole('menuitem', { name: '原始', exact: true })).toBeVisible()
    await expect(frame.getByRole('menuitem', { name: /^native$/i })).toHaveCount(0)
    await frame.getByRole('menuitem', { name: '原始', exact: true }).click()
    await expect.poll(async () => (await state()).aspectRatio).toBe('native')
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await frame.getByLabel('项目导航').getByRole('button', { name: '设置', exact: true }).click()
    await frame.getByLabel('设置分类').getByText('文件', { exact: true }).click()
    await expect(frame.getByText('所有项目及编辑改动始终自动保存。', { exact: true })).toHaveCount(0)
    await expect(frame.getByText('用于新建项目；已有项目继续保存在原位置。', { exact: true })).toBeVisible()
    expect(pageErrors).toEqual([])
  } finally {
    if (app) await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
