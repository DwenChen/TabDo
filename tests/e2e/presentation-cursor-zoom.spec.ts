import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示高倍率光标尺寸与原有剪辑工具', async ({ browserName: _browserName }, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-presentation-cursor-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, '光标样片.mp4')
    execFileSync(ffmpeg!, [
      '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
      '-vf', 'drawbox=x=190:y=105:w=260:h=150:color=0x707070:t=fill',
      '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sample
    ], { windowsHide: true, stdio: 'ignore' })
    await fs.writeFile(sample + '.cursor.json', JSON.stringify({
      version: 1,
      samples: Array.from({ length: 61 }, (_, index) => ({
        timeMs: index * 100, cx: 0.5, cy: 0.5, cursorType: 'text', interactionType: 'move'
      }))
    }))
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
    app = await electron.launch({ args: [path.join(root, 'scripts/preview-main.cjs')], cwd: root, env })
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 30000 })
    await main.evaluate(async () => {
      const plugin = (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')!
      await window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'presentation-recorder' })
    })
    const editorButton = () => app!.context().pages().find((page) => page.url().includes('windowType=hud-overlay'))
    await expect.poll(() => !!editorButton(), { timeout: 30000 }).toBe(true)
    await editorButton()!.getByRole('button', { name: '演示编辑器', exact: true }).click()
    const tool = app.context().pages().find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    tool.on('pageerror', (error) => console.log('PRESENTATION_PAGE_ERROR', error.stack))
    const frame = tool.frameLocator('iframe')
    await frame.getByRole('dialog', { name: '演示项目', exact: true }).press('Escape')
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, sample)
    await frame.getByRole('button', { name: '导入视频', exact: true }).click()
    const clips = frame.locator('[data-variant="clip"]')
    await expect(clips).toHaveCount(1, { timeout: 30000 })
    await expect(frame.locator('[data-preview-frame] canvas').first()).toBeVisible({ timeout: 30000 })
    const iframe = tool.frames().find((item) => item.url().includes('presentation.html'))!
    const owner = await tool.evaluate(() => window.tabdo.getWebContentsId())
    await expect.poll(async () => (await iframe.evaluate(() => window.electronAPI.listProjectFiles())).entries.length)
      .toBe(1)
    const projectPath = (await iframe.evaluate(() => window.electronAPI.listProjectFiles())).entries[0].path

    /**
     * Read the on-disk editor after autosave.
     * @returns Current persisted project model.
     */
    async function saved() {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }

    /**
     * Capture the plugin and measure contrasting I-beam pixels inside the gray fixture.
     * @param name Screenshot name in the Playwright archive.
     * @returns Height of the recorded cursor in screenshot pixels.
     */
    async function captureCursor(name: string) {
      const box = (await frame.locator('[data-preview-frame] canvas').first().boundingBox())!
      const viewport = await tool.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      const center = {
        x: (box.x + box.width / 2) / viewport.width,
        y: (box.y + box.height / 2) / viewport.height
      }
      const capture = await app!.evaluate(async ({ webContents }, { owner, center }) => {
        const image = await webContents.fromId(owner)!.capturePage()
        const { width, height } = image.getSize()
        const bitmap = image.toBitmap()
        const cx = Math.round(center.x * width)
        const cy = Math.round(center.y * height)
        const backgroundOffset = ((cy - 25) * width + cx - 20) * 4
        const background =
          (bitmap[backgroundOffset] + bitmap[backgroundOffset + 1] + bitmap[backgroundOffset + 2]) / 3
        let top = cy + 28
        let bottom = cy - 28
        for (let y = cy - 27; y <= cy + 27; y++) {
          for (let x = cx - 21; x <= cx + 21; x++) {
            const offset = (y * width + x) * 4
            const brightness = (bitmap[offset] + bitmap[offset + 1] + bitmap[offset + 2]) / 3
            if (Math.abs(brightness - background) > 38) {
              top = Math.min(top, y)
              bottom = Math.max(bottom, y)
            }
          }
        }
        return { png: image.toPNG().toString('base64'), cursorHeight: bottom - top + 1 }
      }, { owner, center })
      await fs.writeFile(testInfo.outputPath(name), Buffer.from(capture.png, 'base64'))
      return capture.cursorHeight
    }

    const seekbar = frame.getByRole('slider', { name: '播放进度', exact: true })
    const video = frame.locator('video').first()
    /**
     * Seek through the real preview control and wait for its video frame to settle.
     * @param seconds Edit timeline time for the unsplit fixture.
     * @returns Resolves when the paused media element reaches that time.
     */
    async function seek(seconds: number) {
      const bounds = (await seekbar.boundingBox())!
      await tool.mouse.click(bounds.x + bounds.width * (seconds / 6), bounds.y + bounds.height / 2)
      await expect.poll(() => video.evaluate((element: HTMLVideoElement, target) =>
        Math.abs(element.currentTime - target) < 0.08 && !element.seeking, seconds
      )).toBe(true)
    }

    const zoomRow = frame.locator('[data-timeline-row="row-zoom"] > div.relative')
    const zoomBox = (await zoomRow.boundingBox())!
    await tool.mouse.click(zoomBox.x + zoomBox.width * 0.22, zoomBox.y + zoomBox.height / 2)
    const zoomSlider = frame.getByRole('slider', { name: '变焦倍率', exact: true })
    await zoomSlider.press('Home')
    await expect.poll(async () => (await saved()).zoomRegions[0]?.scale).toBe(1)
    const zoom = (await saved()).zoomRegions[0]
    const mid = (zoom.startMs + zoom.endMs) / 2000
    await seek(mid)
    const normalHeight = await captureCursor('cursor-1x.png')
    await zoomSlider.press('End')
    await expect.poll(async () => (await saved()).zoomRegions[0]?.scale).toBe(5)
    await seek(mid)
    const zoomedHeight = await captureCursor('cursor-5x.png')
    expect(normalHeight).toBeGreaterThan(6)
    expect(zoomedHeight / normalHeight).toBeGreaterThan(1.08)
    expect(zoomedHeight / normalHeight).toBeLessThan(1.5)

    await expect(frame.getByRole('button', { name: '调速', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('button', { name: '自动添加变焦', exact: true })).toBeVisible()
    await expect(frame.getByRole('button', { name: '分割选中片段', exact: true })).toBeVisible()
    const undo = frame.getByRole('button', { name: '撤销', exact: true })
    const redo = frame.getByRole('button', { name: '重做', exact: true })
    await undo.click()
    await expect.poll(async () => (await saved()).zoomRegions[0]?.scale).toBe(1)
    await redo.click()
    await expect.poll(async () => (await saved()).zoomRegions[0]?.scale).toBe(5)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
