import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'

test('变焦片段的视频和镜头动画倍速', async ({ browserName: _browserName }, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-presentation-zoom-rates-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, '倍速样片.mp4')
    execFileSync(ffmpeg!, [
      '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', sample
    ], { windowsHide: true, stdio: 'ignore' })
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
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, sample)
    await frame.getByRole('dialog', { name: '演示项目', exact: true })
      .getByRole('button', { name: '导入', exact: true }).click()
    const clips = frame.locator('[data-variant="clip"]')
    await expect(clips).toHaveCount(1, { timeout: 30000 })
    await expect(frame.locator('[data-preview-frame] canvas').first()).toBeVisible({ timeout: 30000 })
    const iframe = tool.frames().find((item) => item.url().includes('presentation.html'))!
    const owner = await tool.evaluate(() => window.tabdo.getWebContentsId())
    const zoomRow = frame.locator('[data-timeline-row="row-zoom"] > div.relative')
    const zoomBox = (await zoomRow.boundingBox())!
    await tool.mouse.click(zoomBox.x + zoomBox.width * 0.22, zoomBox.y + zoomBox.height / 2)
    const videoRate = frame.getByRole('slider', { name: '视频倍速', exact: true })
    const animationRate = frame.getByRole('slider', { name: '镜头动画倍速', exact: true })
    await expect(videoRate).toHaveValue('1')
    await expect(animationRate).toHaveValue('1')
    await videoRate.press('Home')
    await animationRate.press('Home')
    await expect.poll(async () => (await iframe.evaluate(() => window.electronAPI.listProjectFiles())).entries.length, { timeout: 30000 })
      .toBe(1)
    const projectPath = (await iframe.evaluate(() => window.electronAPI.listProjectFiles())).entries[0].path

    /**
     * Read the on-disk editor after autosave.
     * @returns Current persisted project model.
     */
    async function saved() {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }

    await expect.poll(async () => (await saved()).zoomRegions[0]?.playbackRate).toBe(0.25)
    await expect.poll(async () => (await saved()).zoomRegions[0]?.animationRate).toBe(0.25)
    await expect(clips).toHaveCount(1)
    const undo = frame.getByRole('button', { name: '撤销', exact: true })
    const redo = frame.getByRole('button', { name: '重做', exact: true })
    await undo.click()
    await expect(animationRate).toHaveValue('1')
    await undo.click()
    await expect(videoRate).toHaveValue('1')
    await redo.click()
    await redo.click()
    await expect(animationRate).toHaveValue('0.25')
    await expect(videoRate).toHaveValue('0.25')
    await expect.poll(async () => (await saved()).zoomRegions[0]?.animationRate).toBe(0.25)
    const model = await saved()
    const zoom = model.zoomRegions[0]
    const editDuration = model.clipRegions[0].endMs / 1000
    const zoomDuration = (zoom.endMs - zoom.startMs) / 1000
    const outputDuration = editDuration + zoomDuration * (1 / zoom.playbackRate - 1)
    const progress = frame.getByRole('slider', { name: '播放进度', exact: true })
    await expect.poll(async () => Number(await progress.getAttribute('max'))).toBeCloseTo(outputDuration, 3)
    const scrub = (await progress.boundingBox())!
    const within = (zoom.startMs / 1000 + zoomDuration / zoom.playbackRate / 4) / outputDuration
    await tool.mouse.click(scrub.x + scrub.width * within, scrub.y + scrub.height / 2)
    const video = frame.locator('[data-presentation-source-video]')
    await expect(video).toHaveJSProperty('playbackRate', 0.25)
    await frame.getByRole('button', { name: '播放', exact: true }).click()
    await expect(video).toHaveJSProperty('paused', false)
    await frame.getByRole('button', { name: '暂停', exact: true }).click()

    /**
     * Capture the visible plugin surface after the inspector controls settle.
     * @param name Screenshot name in the Playwright archive.
     * @returns Resolves after the PNG is saved.
     */
    async function capture(name: string) {
      const screenshot = await app!.evaluate(async ({ webContents }, id) =>
        (await webContents.fromId(id)!.capturePage()).toPNG().toString('base64'), owner
      )
      await fs.writeFile(testInfo.outputPath(name), Buffer.from(screenshot, 'base64'))
    }
    await capture('zoom-rates-light.png')
    await app.evaluate(({ app }, id) => {
      const manager = process.mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts').default
      const window = manager.getWindowByPluginWebContents(id)
      if (window.isMaximized()) window.unmaximize()
      window.setSize(1000, 760)
    }, owner)
    await expect.poll(() => tool.evaluate(() => window.innerWidth)).toBeLessThan(1050)
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    await animationRate.scrollIntoViewIfNeeded()
    await expect(videoRate).toBeVisible()
    await expect(animationRate).toBeVisible()
    await capture('zoom-rates-dark-narrow.png')
    await iframe.evaluate(() => document.documentElement.classList.remove('dark'))

    const outputPath = path.join(temporary, '倍速导出.mp4')
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, outputPath)
    await frame.getByRole('button', { name: '导出', exact: true }).click()
    await frame.getByRole('button', { name: '导出视频', exact: true }).click()
    await expect.poll(async () => (await fs.stat(outputPath).catch(() => ({ size: 0 }))).size, { timeout: 120000 })
      .toBeGreaterThan(1000)
    const probe = JSON.parse(execFileSync(ffprobe.path, [
      '-v', 'error', '-show_streams', '-of', 'json', outputPath
    ], { encoding: 'utf8', windowsHide: true }))
    for (const kind of ['audio', 'video']) {
      const stream = probe.streams.find((entry) => entry.codec_type === kind)
      expect(Math.abs(Number(stream?.duration) - outputDuration)).toBeLessThan(0.15)
    }
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
