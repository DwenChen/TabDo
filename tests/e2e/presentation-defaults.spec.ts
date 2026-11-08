import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示新项目默认值、逐栏重置及重开后的整轨拖动', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(300000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-editor-defaults-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, '新录制.mp4')
    execFileSync(
      ffmpeg!,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=15',
        '-t',
        '3',
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
        samples: [{ timeMs: 200, cx: 0.3, cy: 0.4, keyText: 'Ctrl + S' }]
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
     * 读取真实保存的项目，避免只验证控件外观。
     * @returns 当前项目文件中的编辑模型。
     */
    async function saved(): Promise<any> {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }
    /**
     * 使用真实鼠标从轨道名称拖到目标行，验证落点和保存。
     * @returns 拖动后保存的轨道顺序。
     */
    async function dragTrack(): Promise<string[]> {
      const button = frame.getByRole('button', { name: '调整按键轨道顺序', exact: true })
      const target = frame.locator('[data-timeline-row="row-clip"]')
      await button.scrollIntoViewIfNeeded()
      const from = (await button.boundingBox())!,
        to = (await target.boundingBox())!
      await tool.mouse.move(from.x + 25, from.y + from.height / 2)
      await tool.mouse.down()
      await tool.mouse.move(to.x + 25, to.y + 2, { steps: 12 })
      await expect(frame.getByTestId('timeline-track-drop-preview')).toBeVisible()
      await tool.mouse.up()
      await expect.poll(async () => (await saved()).trackOrder[0]).toBe('row-annotation-0')
      return (await saved()).trackOrder
    }
    await expect(frame.getByRole('button', { name: '调整按键轨道顺序', exact: true })).toBeVisible()
    const order = await dragTrack()
    await frame.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(async () => (await saved()).trackOrder).toEqual([])
    await frame.getByRole('button', { name: '重做', exact: true }).click()
    await expect.poll(async () => (await saved()).trackOrder).toEqual(order)
    // 完整重载编辑页面，确保拖动绑定在恢复后的新会话中依然可用。
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    // 重开项目后先还原排列，再用鼠标重复拖动。
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await frame
      .getByRole('button', { name: path.basename(projectPath, '.recordly'), exact: true })
      .click()
    await expect(frame.getByRole('dialog', { name: '演示项目', exact: true })).not.toBeVisible()
    await frame.getByRole('button', { name: '调整按键轨道顺序', exact: true }).press('ArrowDown')
    await expect.poll(async () => (await saved()).trackOrder[0]).not.toBe('row-annotation-0')
    const cancelOrder = (await saved()).trackOrder
    const cancelButton = frame.getByRole('button', { name: '调整按键轨道顺序', exact: true })
    const cancelFrom = (await cancelButton.boundingBox())!,
      cancelTo = (await frame.locator('[data-timeline-row="row-clip"]').boundingBox())!
    await tool.mouse.move(cancelFrom.x + 25, cancelFrom.y + cancelFrom.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(cancelTo.x + 25, cancelTo.y + 2, { steps: 8 })
    await expect(frame.getByTestId('timeline-track-drop-preview')).toBeVisible()
    await cancelButton.press('Escape')
    await tool.mouse.up()
    await expect(frame.getByTestId('timeline-track-drop-preview')).toHaveCount(0)
    expect((await saved()).trackOrder).toEqual(cancelOrder)
    await dragTrack()
    await tool.screenshot({ path: testInfo.outputPath('reopened-track-drag.png') })
    const defaults = await iframe.evaluate(async () => {
      const { createDefaultProjectEditor } = await import(
        '/presentation/src/components/video-editor/editorDefaults.ts' as string
      )
      return createDefaultProjectEditor()
    })
    const original = JSON.parse(await fs.readFile(projectPath, 'utf8'))
    const edited = {
      ...original.editor,
      wallpaper: '#123456',
      shadowIntensity: 0.1,
      backgroundBlur: 3,
      backgroundBorderRadius: 20,
      borderRadius: 18,
      padding: { top: 5, bottom: 10, left: 15, right: 25, linked: false },
      aspectRatio: '4:3',
      cropRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      showCursor: false,
      cursorSize: 4,
      cursorClickEffect: 'ripple',
      connectZooms: false,
      zoomInDurationMs: 180,
      zoomOutDurationMs: 180,
      zoomInOverlapMs: 50,
      connectedZoomGapMs: 20,
      connectedZoomDurationMs: 500,
      zoomInEasing: 'linear',
      cameraSpringMassMultiplier: 2,
      webcam: {
        ...defaults.webcam,
        enabled: false,
        sourcePath: sample,
        width: 25,
        height: 70,
        mirror: false,
        roundness: 10,
        shadow: 0.8,
        positionX: 0.3,
        timeOffsetMs: 100,
        sourceDurationMs: 3000,
        segments: [{ id: 'cam-1', startMs: 200, endMs: 2500, sourceStartMs: 100 }]
      },
      autoCaptions: [{ id: 'caption-1', text: '保留字幕', startMs: 0, endMs: 1800 }],
      autoCaptionSettings: {
        ...defaults.autoCaptionSettings,
        enabled: true,
        language: 'zh',
        fontSize: 60,
        animationStyle: 'pop'
      },
      zoomRegions: [
        {
          id: 'zoom-1',
          startMs: 0,
          endMs: 1800,
          depth: 6,
          mode: 'manual',
          focus: { cx: 0.3, cy: 0.4 }
        }
      ]
    }
    await fs.writeFile(projectPath, JSON.stringify({ ...original, editor: edited }))
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    await expect.poll(async () => (await saved()).cursorSize).toBe(4)
    const undo = frame.getByRole('button', { name: '撤销', exact: true }),
      redo = frame.getByRole('button', { name: '重做', exact: true })
    const scopes = [
      [
        '场景',
        [
          'wallpaper',
          'shadowIntensity',
          'backgroundBlur',
          'backgroundBorderRadius',
          'borderRadius',
          'padding',
          'aspectRatio'
        ]
      ],
      ['光标', ['showCursor', 'cursorSize', 'cursorClickEffect', 'cursorSway']],
      ['摄像头', ['webcam']],
      ['字幕', ['autoCaptionSettings']],
      [
        '缩放',
        [
          'connectZooms',
          'zoomInDurationMs',
          'zoomOutDurationMs',
          'zoomInOverlapMs',
          'connectedZoomGapMs',
          'connectedZoomDurationMs',
          'zoomInEasing',
          'cameraSpringMassMultiplier'
        ]
      ]
    ] as const
    for (const [name, fields] of scopes) {
      if (name === '缩放') await frame.locator('[data-variant="zoom"]').click()
      else await frame.getByLabel('编辑工具').getByLabel(name, { exact: true }).click()
      const before = await saved()
      const expected = Object.fromEntries(fields.map((key) => [key, defaults[key]]))
      if (name === '摄像头')
        expected.webcam = {
          ...defaults.webcam,
          enabled: true,
          sourcePath: before.webcam.sourcePath,
          sourceDurationMs: before.webcam.sourceDurationMs,
          timeOffsetMs: before.webcam.timeOffsetMs,
          segments: before.webcam.segments
        }
      await frame.getByRole('button', { name: '重置当前设置', exact: true }).click()
      await expect
        .poll(async () => {
          const value = await saved()
          return Object.fromEntries(fields.map((key) => [key, value[key]]))
        })
        .toEqual(expected)
      const after = await saved()
      expect(after.cropRegion).toEqual(edited.cropRegion)
      expect(after.autoCaptions).toEqual(edited.autoCaptions)
      if (name === '缩放')
        expect(after.zoomRegions[0]).toEqual({ ...before.zoomRegions[0], depth: 2, mode: 'auto' })
      await undo.click()
      await expect
        .poll(async () => {
          const value = await saved()
          return Object.fromEntries(fields.map((key) => [key, value[key]]))
        })
        .toEqual(Object.fromEntries(fields.map((key) => [key, before[key]])))
      await redo.click()
      await expect
        .poll(async () => {
          const value = await saved()
          return Object.fromEntries(fields.map((key) => [key, value[key]]))
        })
        .toEqual(expected)
    }
    await tool.screenshot({ path: testInfo.outputPath('reset-zoom-defaults.png') })
    // 裁剪重置恢复全幅和自由比例；取消、完成及一次撤销重做沿同一历史链。
    await frame.getByRole('button', { name: '裁剪视频', exact: true }).click()
    const cropDialog = frame.getByRole('dialog', { name: '裁剪视频', exact: true })
    await cropDialog.getByRole('button', { name: '重新框选', exact: true }).click()
    await cropDialog.getByRole('button', { name: '重置裁剪', exact: true }).click()
    await expect(cropDialog.getByRole('button', { name: '重新框选', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await cropDialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect.poll(async () => (await saved()).cropRegion).toEqual(edited.cropRegion)
    await frame.getByRole('button', { name: '裁剪视频', exact: true }).click()
    await cropDialog.getByRole('button', { name: '重置裁剪', exact: true }).click()
    await cropDialog.getByRole('button', { name: '完成', exact: true }).click()
    await expect.poll(async () => (await saved()).cropRegion).toEqual(defaults.cropRegion)
    await undo.click()
    await expect.poll(async () => (await saved()).cropRegion).toEqual(edited.cropRegion)
    await redo.click()
    await expect.poll(async () => (await saved()).cropRegion).toEqual(defaults.cropRegion)
    await undo.click()
    await expect.poll(async () => (await saved()).cropRegion).toEqual(edited.cropRegion)
    // 将旧项目外观写进旧偏好后切换新录制，验证新项目不继承外观或剪辑。
    await iframe.evaluate(
      async ({ sample, edited }) => {
        const { saveEditorPreferences } = await import(
          '/presentation/src/components/video-editor/editorPreferences.ts' as string
        )
        saveEditorPreferences(edited)
        await window.electronAPI.setCurrentRecordingSession(
          { videoPath: sample, webcamPath: null, timeOffsetMs: 0 },
          { preserveProjectPath: false }
        )
      },
      { sample, edited }
    )
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    await expect
      .poll(
        async () =>
          (await iframe.evaluate(async () => (await window.electronAPI.listProjectFiles()).entries))
            .length
      )
      .toBeGreaterThan(library.entries.length)
    const freshLibrary = await iframe.evaluate(async () => window.electronAPI.listProjectFiles())
    const freshPath = freshLibrary.entries.find((entry) => entry.path !== projectPath)!.path
    const fresh = JSON.parse(await fs.readFile(freshPath, 'utf8')).editor
    for (const key of [
      'wallpaper',
      'padding',
      'aspectRatio',
      'cursorSize',
      'showCursor',
      'cropRegion',
      'autoCaptionSettings',
      'trackOrder'
    ])
      expect(fresh[key]).toEqual(defaults[key])
    expect(fresh.webcam.sourcePath).toBeNull()
    expect(fresh.autoCaptions).toEqual([])
    expect((await saved()).cropRegion).toEqual(edited.cropRegion)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
