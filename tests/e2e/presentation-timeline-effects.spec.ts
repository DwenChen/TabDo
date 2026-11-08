import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('关联轨道重排、全部片段起点定位及连续注释可见性', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(240000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-timeline-effects-'))
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
     * 读取实际自动保存模型，核对删除、重置及历史状态。
     * @returns 当前项目编辑参数。
     */
    async function saved(): Promise<any> {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    await expect(frame.getByRole('slider', { name: '人像画面宽度', exact: true })).toHaveCount(0)
    await frame.getByRole('button', { name: '导入摄像头视频', exact: true }).click()
    await expect(frame.locator('[data-variant="webcam"]')).toHaveCount(1)
    await expect.poll(async () => (await saved()).webcam.segments?.length).toBe(1)
    const initial = JSON.parse(await fs.readFile(projectPath, 'utf8'))
    initial.editor.zoomRegions = [
      { id: 'cross-zoom', startMs: 1000, endMs: 5000, depth: 2, scale: 1.41, mode: 'manual', focus: { cx: 0.5, cy: 0.5 } },
      { id: 'other-zoom', startMs: 6000, endMs: 7000, depth: 1, mode: 'auto', focus: { cx: 0.5, cy: 0.5 } },
      { id: 'tiny-zoom', startMs: 7990, endMs: 8000, depth: 1, mode: 'auto', focus: { cx: 0.5, cy: 0.5 } }
    ]
    initial.editor.annotationRegions = []
    initial.editor.autoCaptions = [{ id: 'caption', startMs: 1000, endMs: 5000, text: '关联字幕' }]
    initial.editor.webcam.segments = [{ id: 'camera', startMs: 500, endMs: 7500, sourceStartMs: 0 }]
    initial.editor.audioRegions[0].startMs = 700
    initial.editor.audioRegions[0].endMs = 7500
    await fs.writeFile(projectPath, JSON.stringify(initial))
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    const cap = frame.getByTestId('playhead-cap')
    const clips = frame.locator('[data-variant="clip"]')
    const notes = frame.locator('[data-variant="annotation"]')
    const zooms = frame.locator('[data-variant="zoom"]')
    const undo = frame.getByRole('button', { name: '撤销', exact: true })
    const redo = frame.getByRole('button', { name: '重做', exact: true })
    await expect(clips).toHaveCount(1)
    await expect(frame.locator('[data-item-id="cross-zoom"]')).toContainText('2D · 1.41×', { timeout: 30000 })
    await expect(frame.locator('[data-item-id="cross-zoom"] .zoom-mode')).toHaveText('手动')
    await expect(frame.locator('[data-item-id="tiny-zoom"]')).toHaveAttribute('data-start-ms', '7990')
    // 同一游标连续新增，所有片段都有独立可见轨道，最后选区自动滚动到视口。
    for (let index = 0; index < 6; index++) {
      await cap.press('Home')
      await frame.getByRole('button', { name: '添加图层', exact: true }).click()
      await frame.getByRole('menuitem', { name: '注释', exact: true }).click()
      await expect(notes).toHaveCount(index + 1)
      await expect(notes.locator('[data-annotation-icon="text"]')).toHaveCount(index + 1)
      const selected = frame.locator('[data-variant="annotation"][data-selected="true"]')
      await expect(selected).toBeInViewport()
    }
    await expect.poll(async () => new Set((await saved()).annotationRegions.map((note) => note.trackIndex)).size).toBe(6)
    const types = [['figure', '箭头'], ['image', '图片'], ['blur', '模糊'], ['mosaic', '马赛克'], ['focus', '聚焦']] as const
    const ids = await notes.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-id')!))
    for (let index = 0; index < types.length; index++) {
      const item = frame.locator(`[data-item-id="${ids[index]}"]`)
      await item.click()
      await frame.getByLabel('标注类型', { exact: true }).getByRole('row', { name: types[index][1], exact: true }).click()
      await expect(item.locator(`[data-annotation-icon="${types[index][0]}"]`)).toBeVisible()
      await expect.poll(async () => (await saved()).annotationRegions.find((note) => note.id === ids[index])?.type).toBe(types[index][0])
    }
    await undo.click()
    await expect(frame.locator(`[data-item-id="${ids[4]}"] [data-annotation-icon="text"]`)).toBeVisible()
    await redo.click()
    await expect(frame.locator(`[data-item-id="${ids[4]}"] [data-annotation-icon="focus"]`)).toBeVisible()
    // 真实分割四段录屏；先选片段，再定位切点，选择本身始终返回起点。
    for (const seconds of [2, 4, 6]) {
      await clips.last().click()
      await cap.press('Home')
      for (let second = 0; second < seconds; second++) await cap.press('Shift+ArrowRight')
      await frame.getByRole('button', { name: '分割选中片段', exact: true }).click()
    }
    await expect(clips).toHaveCount(4)
    await expect.poll(async () => (await saved()).clipRegions.length).toBe(4)
    const before = await saved()
    const noteModel = before.annotationRegions
    const originalClipIds = before.clipRegions.map((clip) => clip.id)
    const moving = frame.locator(`[data-item-id="${originalClipIds[1]}"]`)
    const last = frame.locator(`[data-item-id="${originalClipIds[3]}"]`)
    const from = (await moving.boundingBox())!, to = (await last.boundingBox())!
    await tool.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(to.x + to.width * 0.85, to.y + to.height / 2, { steps: 12 })
    await expect(frame.getByTestId('timeline-item-drop-preview')).toBeVisible()
    await tool.mouse.up()
    await expect.poll(async () => (await saved()).clipRegions.map((clip) => clip.id)).toEqual([originalClipIds[0], originalClipIds[2], originalClipIds[3], originalClipIds[1]])
    const moved = await saved()
    const spans = moved.zoomRegions.map((region) => [region.startMs, region.endMs]).sort((a, b) => a[0] - b[0])
    expect(spans).toEqual([[1000, 3000], [4000, 5000], [5990, 6000], [6000, 8000]])
    expect(moved.audioRegions).toEqual(before.audioRegions)
    expect(moved.webcam).toEqual(before.webcam)
    expect(moved.annotationRegions).toEqual(noteModel)
    expect(moved.autoCaptions).toEqual(before.autoCaptions)
    await expect(frame.locator('[data-variant="caption"]')).toHaveCount(3)
    await undo.click()
    await expect.poll(async () => (await saved()).zoomRegions).toEqual(before.zoomRegions)
    await redo.click()
    await expect.poll(async () => (await saved()).zoomRegions).toEqual(moved.zoomRegions)
    // 不同类型和重复点击都精确回到当前可见片段起点，游标位于段内也不例外。
    for (const variant of ['clip', 'webcam', 'audio', 'zoom', 'caption', 'annotation']) {
      const item = frame.locator(`[data-variant="${variant}"]`).first()
      const startMs = Number(await item.getAttribute('data-start-ms'))
      await item.click()
      await cap.press('ArrowRight')
      await item.click()
      const expected = `0:${String(Math.floor(startMs / 1000)).padStart(2, '0')}.${String(startMs % 1000).padStart(3, '0')}`
      await expect(cap).toHaveText(expected)
    }
    await expect.poll(async () => (await saved()).zoomRegions).toEqual(moved.zoomRegions)
    await tool.screenshot({ path: testInfo.outputPath('timeline-effects-light.png') })
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    await tool.screenshot({ path: testInfo.outputPath('timeline-effects-dark.png') })
    // 删除录屏缩短成片后，独立声音和摄像头模型仍原样保留，不在渲染时裁剪或平移。
    await clips.last().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect.poll(async () => (await saved()).clipRegions.length).toBe(3)
    expect((await saved()).audioRegions).toEqual(moved.audioRegions)
    expect((await saved()).webcam).toEqual(moved.webcam)
    await undo.click()
    await expect.poll(async () => (await saved()).clipRegions.length).toBe(4)
    const final = await saved()
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    await expect(clips).toHaveCount(4)
    await expect(notes).toHaveCount(6)
    await expect(zooms).toHaveCount(4)
    await expect(frame.locator('[data-item-id="tiny-zoom"]')).toHaveAttribute('data-start-ms', '5990')
    const reopened = await saved()
    // 重开可以补齐rotation等缺省字段，已有时间、类型、素材和外观值必须完整保留。
    for (const key of ['clipRegions', 'zoomRegions', 'annotationRegions', 'audioRegions', 'webcam', 'autoCaptions']) expect(reopened[key]).toMatchObject(final[key])
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
