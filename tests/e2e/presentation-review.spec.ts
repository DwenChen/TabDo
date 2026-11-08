import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示编辑历史连续恢复、箭头外观、批量归类与缺失素材关联管理', async ({
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
    const undo = frame.getByRole('button', { name: '撤销', exact: true })
    const redo = frame.getByRole('button', { name: '重做', exact: true })
    const keys = frame.getByLabel('编辑工具').getByLabel('按键', { exact: true })
    await keys.click()
    await expect(frame.getByText('按键显示', { exact: true })).toHaveCount(0)
    await frame.getByText('机械键盘', { exact: true }).click()
    const mechanical = frame.getByRole('row', { name: '机械键盘', exact: true })
    await expect(mechanical).toHaveAttribute('aria-selected', 'true')
    expect(await mechanical.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe('none')
    const show = frame.getByRole('switch', { name: '显示按键输入', exact: true })
    await show.press('Space')
    await expect.poll(async () => (await saved()).keyboardDisplayEnabled).toBe(false)
    await frame.getByRole('button', { name: '重置按键设置', exact: true }).click()
    await expect(show).toBeChecked()
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.keycapStyle)
      .toBe('simple')
    await undo.click()
    await expect(show).not.toBeChecked()
    await expect
      .poll(async () => (await saved()).annotationRegions[0].style.keycapStyle)
      .toBe('mechanical')
    // 切换选区与侧栏不消费历史，也不使重做失效。
    await frame.locator('[data-variant="clip"]').click()
    await expect(redo).toBeEnabled()
    await redo.click()
    await keys.click()
    await expect(show).toBeChecked()
    // 一次连续拖动包含多个数值回调，撤销一次应恢复拖动前的外观。
    await frame.getByLabel('编辑工具').getByLabel('光标', { exact: true }).click()
    const cursorBefore = (await saved()).cursorSize
    const sizeSlider = frame.getByRole('slider', { name: '光标大小', exact: true })
    const trackBounds = await sizeSlider.evaluate((node) => {
      const track = node
        .closest('[data-slot="slider"]')!
        .querySelector('[data-slot="slider-track"]')!
      const rect = track.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
    const offset = (await tool.locator('iframe').boundingBox())!
    await tool.mouse.move(
      offset.x + trackBounds.x + trackBounds.width * 0.2,
      offset.y + trackBounds.y + trackBounds.height / 2
    )
    await tool.mouse.down()
    await tool.mouse.move(
      offset.x + trackBounds.x + trackBounds.width * 0.7,
      offset.y + trackBounds.y + trackBounds.height / 2,
      { steps: 8 }
    )
    await tool.mouse.up()
    await expect.poll(async () => (await saved()).cursorSize).not.toBe(cursorBefore)
    await undo.click()
    await expect.poll(async () => (await saved()).cursorSize).toBe(cursorBefore)
    await redo.click()
    // 轨道排列可连续撤销/重做，单纯切换选区不增加步骤。
    const beforeOrder = (await saved()).trackOrder
    const orderButton = frame.getByRole('button', { name: '调整按键轨道顺序', exact: true })
    await orderButton.press('ArrowUp')
    await expect.poll(async () => (await saved()).trackOrder).not.toEqual(beforeOrder)
    const afterOrder = (await saved()).trackOrder
    await undo.click()
    await expect.poll(async () => (await saved()).trackOrder).toEqual(beforeOrder)
    await frame.locator('[data-variant="clip"]').click()
    await redo.click()
    await expect.poll(async () => (await saved()).trackOrder).toEqual(afterOrder)
    // 摄像头的分割属于同一历史链，撤销/重做恢复真实独立区间。
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    await frame.getByRole('button', { name: '导入摄像头视频', exact: true }).click()
    const cameras = frame.locator('[data-variant="webcam"]')
    await expect(cameras).toHaveCount(1)
    await cameras.first().click()
    await expect(cameras.first()).toHaveAttribute('data-selected', 'true')
    const playhead = frame.getByTestId('playhead-cap')
    await playhead.press('Home')
    await playhead.press('Shift+ArrowRight')
    await expect(cameras.first()).toHaveAttribute('data-selected', 'true')
    await frame.getByRole('button', { name: '分割选中片段', exact: true }).click()
    await expect(cameras).toHaveCount(2)
    await undo.click()
    await expect(cameras).toHaveCount(1)
    await redo.click()
    await expect(cameras).toHaveCount(2)
    // 缩放重置同时作用于当前倍率/模式、连接开关和运动效果。
    const zoomRow = frame.locator('[data-timeline-row="row-zoom"] > div.relative')
    const bounds = (await zoomRow.boundingBox())!
    await tool.mouse.click(bounds.x + bounds.width * 0.45, bounds.y + bounds.height / 2)
    await expect(frame.locator('[data-variant="zoom"]')).toHaveCount(1)
    await frame.getByRole('slider', { name: '变焦倍率', exact: true }).press('End')
    await frame.getByRole('button', { name: '变焦通用设置', exact: true }).click()
    await frame.getByRole('switch', { name: '连接变焦', exact: true }).press('Space')
    await frame.getByLabel('运动效果', { exact: true }).getByText('专注', { exact: true }).click()
    await expect.poll(async () => (await saved()).connectZooms).toBe(false)
    await frame.getByRole('button', { name: '重置当前设置', exact: true }).click()
    await expect
      .poll(async () => ({
        depth: (await saved()).zoomRegions[0].depth,
        connect: (await saved()).connectZooms
      }))
      .toEqual({ depth: 2, connect: true })
    await undo.click()
    await expect
      .poll(async () => ({
        scale: (await saved()).zoomRegions[0].scale,
        connect: (await saved()).connectZooms
      }))
      .toEqual({ scale: 5, connect: false })
    await redo.click()
    await frame.getByRole('button', { name: '添加图层', exact: true }).click()
    await frame.getByRole('menuitem', { name: '注释', exact: true }).click()
    await frame.getByRole('row', { name: '箭头', exact: true }).click()
    await expect(frame.getByText('快捷键与提示', { exact: true })).toHaveCount(0)
    await expect(frame.getByLabel('箭头方向', { exact: true })).toHaveCount(0)
    await expect(frame.getByRole('slider', { name: '旋转', exact: true })).toBeVisible()
    await frame.getByRole('row', { name: '饱满箭头', exact: true }).click()
    await expect(frame.getByRole('row', { name: '饱满箭头', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      await frame
        .getByRole('row', { name: '饱满箭头', exact: true })
        .evaluate((node) => getComputedStyle(node).boxShadow)
    ).not.toBe('none')
    await expect(frame.getByRole('row', { name: '直线箭头', exact: true })).toHaveAttribute(
      'aria-selected',
      'false'
    )
    await expect
      .poll(
        async () =>
          (await saved()).annotationRegions.find((item: any) => item.type === 'figure')?.figureData
            .arrowStyle
      )
      .toBe('solid')
    const arrows = await iframe.evaluate(
      async (editor) => {
        const { renderAnnotations } = await import(
          '/presentation/src/lib/exporter/annotationRenderer.ts' as string
        )
        const item = editor.annotationRegions.find((item: any) => item.type === 'figure')
        const counts = []
        for (const arrowStyle of ['line', 'solid', 'double', 'dashed']) {
          const canvas = document.createElement('canvas')
          canvas.width = 160
          canvas.height = 160
          const context = canvas.getContext('2d')!
          await renderAnnotations(
            context,
            [
              {
                ...item,
                position: { x: 0, y: 0 },
                size: { width: 100, height: 100 },
                figureData: { ...item.figureData, arrowStyle }
              }
            ],
            160,
            160,
            item.startMs + 1,
            1
          )
          const data = context.getImageData(0, 0, 160, 160).data
          counts.push(
            Array.from(data).filter((_value, index) => index % 4 === 3 && data[index] > 0).length
          )
        }
        return counts
      },
      await saved()
    )
    expect(arrows.every((count) => count > 0)).toBe(true)
    expect(new Set(arrows).size).toBe(4)
    await tool.screenshot({ path: testInfo.outputPath('compact-arrow-inspector.png') })
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    expect(
      await frame
        .getByRole('row', { name: '饱满箭头', exact: true })
        .evaluate((node) => getComputedStyle(node).boxShadow)
    ).not.toBe('none')
    await tool.screenshot({ path: testInfo.outputPath('compact-arrow-inspector-dark.png') })
    await iframe.evaluate(() => document.documentElement.classList.remove('dark'))
    // 建立同一录制的多个项目，验证多选归类与真实缺失素材管理。
    const raw = await iframe.evaluate(
      async (bytes) =>
        window.electronAPI.storeRecordedVideo(
          Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)).buffer,
          'recording-1793879000000.mp4',
          { auxiliary: true }
        ),
      (await fs.readFile(sample)).toString('base64')
    )
    expect(raw.success).toBe(true)
    const data = JSON.parse(await fs.readFile(projectPath, 'utf8'))
    const associatedPaths = ['关联项目一', '关联项目二'].map((name) =>
      path.join(library.projectsDir!, name + '.recordly')
    )
    for (const file of associatedPaths)
      await fs.writeFile(file, JSON.stringify({ ...data, videoPath: raw.path }))
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await expect(frame.getByRole('button', { name: '关联项目一', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: '新建文件夹', exact: true }).click()
    await frame.getByRole('button', { name: '选择项目', exact: true }).click()
    for (const name of ['关联项目一', '关联项目二'])
      await frame.getByRole('button', { name, exact: true }).click()
    await frame.getByRole('button', { name: '加入文件夹', exact: true }).click()
    await frame.getByRole('menuitem', { name: '未命名文件夹', exact: true }).click()
    await frame.getByText('取消', { exact: true }).click()
    await frame
      .getByLabel('项目导航')
      .getByRole('button', { name: '未命名文件夹', exact: true })
      .click()
    await expect(
      frame
        .getByRole('list', { name: '我的项目' })
        .getByRole('button', { name: /^关联项目[一二]$/ })
    ).toHaveCount(2)
    await frame.getByRole('button', { name: '项目操作：关联项目一', exact: true }).click()
    await expect(frame.getByRole('menuitem', { name: 'Share', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('menuitem', { name: '打开项目', exact: true })).toBeVisible()
    await frame.getByRole('menuitem', { name: '打开项目', exact: true }).press('Escape')
    await frame.getByRole('button', { name: '关联项目一', exact: true }).click()
    await expect(frame.getByRole('dialog', { name: '演示项目', exact: true })).not.toBeVisible()
    await expect(frame.locator('[data-variant="clip"]')).toHaveCount(1)
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await frame.getByRole('button', { name: '原始录制', exact: true }).click()
    const rawEntry = (await iframe.evaluate(
      async () => (await window.electronAPI.listRecordings(true)).value
    ))!.find((item) => item.path === raw.path)!
    await frame.getByRole('button', { name: `项目操作：${rawEntry.name}`, exact: true }).click()
    await frame.getByRole('menuitem', { name: '删除原始录制', exact: true }).click()
    const warning = frame.getByRole('dialog', { name: '删除录制的关联提示', exact: true })
    await expect(warning.getByText('关联项目一', { exact: true })).toBeVisible()
    await warning.getByRole('button', { name: '保留素材', exact: true }).click()
    expect((await fs.stat(raw.path!)).size).toBeGreaterThan(0)
    await frame.getByRole('button', { name: `项目操作：${rawEntry.name}`, exact: true }).click()
    await frame.getByRole('menuitem', { name: '删除原始录制', exact: true }).click()
    await warning.getByRole('button', { name: '仍然删除素材', exact: true }).click()
    await expect
      .poll(
        async () =>
          fs.access(raw.path!).then(
            () => true,
            () => false
          ),
        { timeout: 30000 }
      )
      .toBe(false)
    await frame.getByLabel('项目导航').getByRole('button', { name: '项目', exact: true }).click()
    await frame.getByRole('button', { name: '关联项目一', exact: true }).click()
    const problem = frame.getByRole('dialog', { name: '项目素材提示', exact: true })
    await expect(problem).toBeVisible()
    await expect(problem.getByText(/项目引用的素材已删除或移动/)).toBeVisible()
    await tool.screenshot({ path: testInfo.outputPath('missing-media-associated-dialog.png') })
    await problem.getByRole('button', { name: '删除项目', exact: true }).click()
    await expect
      .poll(
        async () =>
          fs.access(associatedPaths[0]).then(
            () => true,
            () => false
          ),
        { timeout: 30000 }
      )
      .toBe(false)
    expect((await fs.stat(associatedPaths[1])).size).toBeGreaterThan(0)
    await frame.getByLabel('项目导航').getByRole('button', { name: '设置', exact: true }).click()
    await expect(frame.getByRole('alert')).toHaveCount(0)
    await expect(
      frame.getByText(/Project video file not found|Share|Loading recordings/)
    ).toHaveCount(0)
    expect(pageErrors).toEqual([])
    expect((await fs.stat(sample)).size).toBeGreaterThan(0)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
