import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('变焦文案、片段定位、时间尺上下文及摄像头删除重置', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(240000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-editor-followup-'))
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
    // 通过真实项目加载建立有界片段与不同于默认值的外观，UI操作继续走完整历史链。
    initial.editor.webcam = { ...initial.editor.webcam, width: 25, height: 25, roundness: 10 }
    initial.editor.zoomRegions = [
      {
        id: 'follow-zoom',
        startMs: 1000,
        endMs: 3000,
        depth: 2,
        scale: 1.41,
        mode: 'manual',
        focus: { cx: 0.5, cy: 0.5 }
      }
    ]
    initial.editor.annotationRegions = [
      {
        id: 'follow-note',
        startMs: 6000,
        endMs: 7000,
        type: 'text',
        content: '定位测试',
        position: { x: 30, y: 40 },
        size: { width: 25, height: 15 },
        zIndex: 1,
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
        }
      }
    ]
    await fs.writeFile(projectPath, JSON.stringify(initial))
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    const zoom = frame.locator('[data-variant="zoom"]')
    const camera = frame.locator('[data-variant="webcam"]')
    const cap = frame.getByTestId('playhead-cap')
    const undo = frame.getByRole('button', { name: '撤销', exact: true })
    const redo = frame.getByRole('button', { name: '重做', exact: true })
    const reset = frame.getByRole('button', { name: '重置当前设置', exact: true })
    await expect(zoom).toContainText('2D · 1.41×')
    await zoom.click()
    await expect(cap).toContainText('0:01.000')
    await expect(zoom).toHaveAttribute('title', /2D 镜头.*手动取景.*时长/)
    await expect(frame.getByRole('slider', { name: '变焦倍率', exact: true })).toBeVisible()
    await frame
      .getByLabel('镜头模式', { exact: true })
      .getByText('3D 镜头', { exact: true })
      .click()
    await expect(zoom).toContainText('3D · 1.41×')
    await expect(zoom).toHaveAttribute('title', /水平 -22°.*俯仰 13°.*焦距 50 mm.*景深关闭/)
    await expect(frame.getByRole('slider', { name: '光圈', exact: true })).toHaveCount(0)
    const depth = frame.getByRole('switch', { name: '景深', exact: true })
    await depth.press('Space')
    await frame.getByRole('slider', { name: '光圈', exact: true }).press('ArrowRight')
    await expect.poll(async () => (await saved()).zoomRegions[0]?.camera?.aperture).toBe(2.9)
    await expect(zoom).toHaveAttribute('title', /景深开启.*光圈 f\/2.9.*对焦/)
    await depth.press('Space')
    await expect(frame.getByRole('slider', { name: '光圈', exact: true })).toHaveCount(0)
    await expect.poll(async () => (await saved()).zoomRegions[0]?.camera?.depthOfField).toBe(false)
    await undo.click()
    await expect(depth).toBeChecked()
    await expect(frame.getByRole('slider', { name: '光圈', exact: true })).toHaveValue('2.9')
    await redo.click()
    await expect(depth).not.toBeChecked()
    await expect.poll(async () => (await saved()).zoomRegions[0]?.camera?.aperture).toBe(2.9)
    await cap.press('Home')
    await expect(cap).toContainText('0:00.000')
    await zoom.click()
    await expect(cap).toContainText('0:01.000')
    const ruler = frame.getByTestId('timeline-ruler')
    const rulerBox = (await ruler.boundingBox())!
    await tool.mouse.click(rulerBox.x + 80 + (rulerBox.width - 80) * 0.9, rulerBox.y + 12)
    await expect(cap).not.toContainText('0:01.000')
    await expect(frame.getByTestId('zoom-camera-controls')).toBeVisible()
    await frame.locator('[data-variant="annotation"]').click()
    await expect(cap).toContainText('0:06.000')
    await tool.mouse.click(rulerBox.x + 100, rulerBox.y + 12)
    await expect(
      frame.locator('.editor-inspector').getByText('注释', { exact: true })
    ).toBeVisible()
    await frame.locator('[data-variant="annotation"]').click()
    await expect(cap).toContainText('0:06.000')
    // 摄像头重置不得重跑旧音频迁移；删除音频后同样不能补出失效轨道。
    await camera.click()
    const beforeReset = await saved()
    await reset.click()
    await expect.poll(async () => (await saved()).webcam.width).toBe(40)
    expect((await saved()).clipRegions).toEqual(beforeReset.clipRegions)
    expect((await saved()).audioRegions).toEqual(beforeReset.audioRegions)
    await expect(frame.locator('[data-variant="audio"]')).toHaveCount(2)
    await expect(frame.getByRole('button', { name: '音频独立编辑', exact: true })).toHaveCount(0)
    await undo.click()
    await expect.poll(async () => (await saved()).webcam.width).toBe(25)
    await redo.click()
    await expect.poll(async () => (await saved()).webcam.width).toBe(40)
    await frame.locator('[data-variant="audio"]').first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect.poll(async () => (await saved()).audioRegions.length).toBe(1)
    await camera.click()
    await reset.click()
    await expect(frame.locator('[data-variant="audio"]')).toHaveCount(1)
    expect((await saved()).clipRegions.every((clip) => clip.showSourceAudio === false)).toBe(true)
    await cap.press('Home')
    for (let i = 0; i < 4; i++) await cap.press('Shift+ArrowRight')
    await frame.getByRole('button', { name: '分割选中片段', exact: true }).click()
    await expect(camera).toHaveCount(2)
    await camera.first().click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect(camera).toHaveCount(1)
    await expect.poll(async () => (await saved()).webcam.sourcePath).not.toBeNull()
    await camera.click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '复制', exact: true }).click()
    await camera.click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect(camera).toHaveCount(0)
    await expect(frame.getByTestId('webcam-track')).toHaveCount(0)
    await expect(frame.getByRole('slider', { name: '人像画面宽度', exact: true })).toHaveCount(0)
    await expect(frame.getByText('当前摄像头视频文件', { exact: true })).toHaveCount(0)
    await expect(frame.getByRole('button', { name: '导入摄像头视频', exact: true })).toBeVisible()
    await expect(reset).toBeDisabled()
    await expect.poll(async () => (await saved()).webcam.sourcePath).toBeNull()
    await fs.access(sample)
    await tool.screenshot({ path: testInfo.outputPath('camera-deleted-empty-inspector.png') })
    await undo.click()
    await expect(camera).toHaveCount(1)
    await expect(frame.getByRole('slider', { name: '人像画面宽度', exact: true })).toBeVisible()
    await redo.click()
    await expect(camera).toHaveCount(0)
    await expect(reset).toBeDisabled()
    // 删空后粘贴旧摄像头片段仍应恢复编辑控件，显式segments优先于历史空范围。
    await cap.press('Home')
    await zoom.click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '粘贴', exact: true }).click()
    await expect(camera).toHaveCount(1)
    await camera.click()
    await expect(frame.getByRole('slider', { name: '人像画面宽度', exact: true })).toBeVisible()
    await camera.click({ button: 'right' })
    await frame.getByRole('menuitem', { name: '删除片段', exact: true }).click()
    await expect.poll(async () => (await saved()).webcam.sourcePath).toBeNull()
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    await expect(frame.locator('[data-variant="audio"]')).toHaveCount(1)
    await expect(camera).toHaveCount(0)
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    await expect(frame.getByText('当前摄像头视频文件', { exact: true })).toHaveCount(0)
    await frame.getByRole('button', { name: '导入摄像头视频', exact: true }).click()
    await expect(camera).toHaveCount(1)
    await expect(frame.getByRole('slider', { name: '人像画面宽度', exact: true })).toBeVisible()
    await expect(frame.locator('[data-variant="audio"]')).toHaveCount(1)
    await tool.screenshot({ path: testInfo.outputPath('camera-reimport-light.png') })
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    await tool.screenshot({ path: testInfo.outputPath('camera-reimport-dark.png') })
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
