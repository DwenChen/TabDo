import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import sharp from 'sharp'

test('变焦镜头连续倍率、角度手势、保存历史及真实导出像素', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(300000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-zoom-camera-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, '镜头测试.mp4')
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
            .length,
        { timeout: 30000 }
      )
      .toBeGreaterThan(0)
    const projectPath = (await iframe.evaluate(async () => window.electronAPI.listProjectFiles()))
      .entries[0].path
    /**
     * 读取自动保存后的真实项目模型。
     * @returns 当前编辑模型。
     */
    async function saved(): Promise<any> {
      return JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    }
    const row = frame.locator('[data-timeline-row="row-zoom"] > div.relative')
    const bounds = (await row.boundingBox())!
    await tool.mouse.click(bounds.x + bounds.width * 0.25, bounds.y + bounds.height / 2)
    await expect(frame.locator('[data-variant="zoom"]')).toHaveCount(1)
    await expect.poll(async () => (await saved()).zoomRegions.length).toBe(1)
    await expect(frame.getByTestId('zoom-camera-controls')).toBeVisible()
    const slider = frame.getByRole('slider', { name: '变焦倍率', exact: true })
    await slider.press('Home')
    for (let i = 0; i < 41; i++) await slider.press('ArrowRight')
    await expect.poll(async () => (await saved()).zoomRegions[0].scale).toBeCloseTo(1.41, 5)
    await expect(frame.locator('[data-variant="zoom"]')).toContainText('1.41×')
    await frame
      .getByLabel('镜头模式', { exact: true })
      .getByText('3D 镜头', { exact: true })
      .click()
    await expect(frame.getByRole('slider', { name: '焦距', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: '镜头角度：斜向', exact: true }).click()
    await expect.poll(async () => (await saved()).zoomRegions[0].camera?.yaw).toBe(-22)
    const before = (await saved()).zoomRegions[0].camera
    const pad = frame.getByRole('group', { name: '拖动调整镜头角度', exact: true })
    const box = (await pad.boundingBox())!
    await tool.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 - 25, { steps: 14 })
    await tool.mouse.up()
    await expect.poll(async () => (await saved()).zoomRegions[0].camera.yaw).toBe(-4)
    const after = (await saved()).zoomRegions[0].camera
    await frame.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(async () => (await saved()).zoomRegions[0].camera).toEqual(before)
    await frame.getByRole('button', { name: '重做', exact: true }).click()
    await expect.poll(async () => (await saved()).zoomRegions[0].camera).toEqual(after)
    await frame.getByRole('button', { name: '镜头角度：斜向', exact: true }).click()
    await frame.getByRole('switch', { name: '景深', exact: true }).press('Space')
    await frame.getByRole('switch', { name: '屏幕反光', exact: true }).press('Space')
    await frame.getByRole('slider', { name: '焦距', exact: true }).press('ArrowRight')
    await frame.getByRole('slider', { name: '光圈', exact: true }).press('ArrowLeft')
    const focus = frame.getByRole('group', { name: '点按设置对焦点', exact: true })
    await focus.click({ position: { x: 30, y: 40 } })
    await expect.poll(async () => (await saved()).zoomRegions[0].camera.depthOfField).toBe(true)
    await expect.poll(async () => (await saved()).zoomRegions[0].camera.focus.cx).toBeLessThan(0.3)
    const configured = (await saved()).zoomRegions[0]
    expect(configured.camera).toMatchObject({
      mode: '3d',
      yaw: -22,
      pitch: 13,
      focalLength: 51,
      aperture: 2.7,
      reflection: true
    })
    expect(configured.camera.focus.cx).toBeLessThan(0.3)
    // 回到选中镜头的中间时间，等待真正的媒体帧再捕获当前插件正文。
    const cap = frame.getByTestId('playhead-cap')
    await cap.press('Home')
    for (let i = 0; i < 3; i++) await cap.press('Shift+ArrowRight')
    await pad.scrollIntoViewIfNeeded()
    await expect(frame.locator('canvas').first()).toBeVisible()
    await frame.getByLabel('镜头模式', { exact: true }).scrollIntoViewIfNeeded()
    await tool.screenshot({ path: testInfo.outputPath('zoom-mode-and-scale.png') })
    await pad.scrollIntoViewIfNeeded()
    await tool.screenshot({ path: testInfo.outputPath('zoom-camera-light.png') })
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    await tool.screenshot({ path: testInfo.outputPath('zoom-camera-dark.png') })
    await iframe.evaluate(() => document.documentElement.classList.remove('dark'))
    await frame.getByLabel('镜头模式', { exact: true }).getByText('2D', { exact: true }).click()
    await expect(frame.getByRole('slider', { name: '焦距', exact: true })).toHaveCount(0)
    await frame
      .getByLabel('镜头模式', { exact: true })
      .getByText('3D 镜头', { exact: true })
      .click()
    await expect.poll(async () => (await saved()).zoomRegions[0].camera).toEqual(configured.camera)
    // 完整卸载后从项目恢复，检验格式而非只检查当前React状态。
    await iframe.goto(iframe.url(), { waitUntil: 'domcontentloaded' })
    await expect(frame.locator('[data-variant="clip"]')).toBeVisible({ timeout: 30000 })
    await frame.getByRole('button', { name: '项目', exact: true }).click()
    await frame
      .getByRole('button', { name: path.basename(projectPath, '.recordly'), exact: true })
      .click()
    await frame.locator('[data-variant="zoom"]').click()
    await expect(slider).toHaveValue('1.41')
    await expect(frame.getByRole('switch', { name: '景深', exact: true })).toBeChecked()
    // 两套实际导出器与两种GPU后端渲染同一张高频网格，核对透视、光学参数与收尾。
    const pixels = await iframe.evaluate(async () => {
      const { FrameRenderer: Legacy } = await import(
        '/presentation/src/lib/exporter/frameRenderer.ts' as string
      )
      const { FrameRenderer: Modern } = await import(
        '/presentation/src/lib/exporter/modernFrameRenderer.ts' as string
      )
      const { normalizeZoomCamera } = await import(
        '/presentation/src/components/video-editor/zoomCamera.ts' as string
      )
      const source = document.createElement('canvas')
      source.width = 640
      source.height = 360
      const ctx = source.getContext('2d')!
      for (let y = 0; y < 360; y += 4)
        for (let x = 0; x < 640; x += 4) {
          ctx.fillStyle = (x / 4 + y / 4) % 2 ? '#f0e0b0' : '#205080'
          ctx.fillRect(x, y, 4, 4)
        }
      const results: any[] = []
      for (const Renderer of [Legacy, Modern]) {
        for (const backend of ['webgl', ...('gpu' in navigator ? ['webgpu'] : [])]) {
          const outputs: Uint8ClampedArray[] = []
          const debug: any[] = []
          for (const optical of [0, 1, 2, 3, 4, 5, 6]) {
            const region = {
              id: 'pixel',
              startMs: 0,
              endMs: 6000,
              depth: 2,
              scale: 1.41,
              focus: { cx: 0.5, cy: 0.5 },
              mode: 'manual',
              camera: normalizeZoomCamera({
                mode: optical ? '3d' : '2d',
                yaw: 35,
                pitch: 20,
                focalLength: optical >= 3 ? 100 : 50,
                aperture: optical >= 4 ? 16 : 1.4,
                depthOfField: optical >= 2,
                reflection: optical === 6,
                focus: optical >= 5 ? { cx: 0.85, cy: 0.7 } : { cx: 0.15, cy: 0.3 }
              })
            }
            const renderer = new Renderer({
              width: 640,
              height: 360,
              videoWidth: 640,
              videoHeight: 360,
              wallpaper: '#111111',
              zoomRegions: [region],
              cropRegion: { x: 0, y: 0, width: 1, height: 1 },
              padding: 15,
              showShadow: false,
              shadowIntensity: 0,
              backgroundBlur: 0,
              showCursor: false,
              zoomClassicMode: true,
              preferredRenderBackend: backend
            })
            await renderer.initialize()
            const videoFrame = new VideoFrame(source, { timestamp: 2000000 })
            let lensReleased = true
            try {
              await renderer.renderFrame(videoFrame, 2000000)
              const output = document.createElement('canvas')
              output.width = 640
              output.height = 360
              const out = output.getContext('2d')!
              out.drawImage(renderer.getCanvas(), 0, 0)
              outputs.push(out.getImageData(0, 0, 640, 360).data)
              debug.push({
                optical,
                image: output.toDataURL(),
                uniforms: (renderer as any).cameraContainer.filters?.map((filter: any) => ({
                  lens: Array.from(filter.resources.lens?.uniforms.uLens ?? []),
                  frame: Array.from(filter.resources.lens?.uniforms.uFrame ?? [])
                }))
              })
            } finally {
              const lens = (renderer as any).cameraContainer.filters?.find(
                (filter: any) => filter.resources.lens
              )
              videoFrame.close()
              renderer.destroy()
              lensReleased = !lens || (lens.resources === null && lens.groups === null)
            }
            if (!lensReleased) throw new Error('镜头滤镜未随导出实例释放')
          }
          const differences = outputs.slice(1).map((out, index) => {
            let delta = 0
            for (let i = 0; i < out.length; i += 4) delta += Math.abs(out[i] - outputs[index][i])
            return delta / (640 * 360)
          })
          results.push({
            renderer: Renderer === Legacy ? 'legacy' : 'modern',
            backend,
            differences,
            debug
          })
        }
      }
      return results
    })
    await fs.writeFile(testInfo.outputPath('render-pixels.json'), JSON.stringify(pixels, null, 2))
    for (const result of pixels)
      for (const item of result.debug)
        await fs.writeFile(
          testInfo.outputPath(`${result.renderer}-${result.backend}-${item.optical}.png`),
          Buffer.from(item.image.split(',')[1], 'base64')
        )
    for (const result of pixels)
      for (const delta of result.differences)
        expect(delta, `${result.renderer}/${result.backend}镜头参数应改变真实像素`).toBeGreaterThan(
          0.5
        )
    // 从原录屏坐标独立计算像素落点，防止用拉伸边缘或背景填充掩盖提前裁切。
    const coverage = await iframe.evaluate(async () => {
      const { FrameRenderer: Legacy } = await import(
        '/presentation/src/lib/exporter/frameRenderer.ts' as string
      )
      const { FrameRenderer: Modern } = await import(
        '/presentation/src/lib/exporter/modernFrameRenderer.ts' as string
      )
      const { normalizeZoomCamera } = await import(
        '/presentation/src/components/video-editor/zoomCamera.ts' as string
      )
      const source = document.createElement('canvas')
      source.width = 640
      source.height = 360
      const ctx = source.getContext('2d')!
      const image = ctx.createImageData(640, 360)
      for (let y = 0; y < 360; y++)
        for (let x = 0; x < 640; x++) {
          const i = (y * 640 + x) * 4
          image.data.set(
            [20 + Math.floor((x / 640) * 100), 180, 20 + Math.floor((y / 360) * 100), 255],
            i
          )
        }
      ctx.putImageData(image, 0, 0)
      const results: any[] = []
      for (const Renderer of [Legacy, Modern])
        for (const backend of ['webgl', ...('gpu' in navigator ? ['webgpu'] : [])]) {
          for (const scenario of [
            { name: 'center', scale: 3, focus: { cx: 0.5, cy: 0.5 } },
            { name: 'offset-crop', scale: 4, focus: { cx: 0.61, cy: 0.4 } },
            { name: 'left-edge', scale: 2, focus: { cx: 0.03, cy: 0.5 } },
            { name: 'right-edge', scale: 1.4, focus: { cx: 0.95, cy: 0.7 } }
          ]) {
            const region = {
              id: 'coverage',
              startMs: 0,
              endMs: 6000,
              depth: 2,
              scale: scenario.scale,
              focus: scenario.focus,
              mode: 'manual',
              camera: normalizeZoomCamera({
                mode: '3d',
                yaw: 35,
                pitch: 20,
                reflection: false,
                depthOfField: false
              })
            }
            const renderer = new Renderer({
              width: 640,
              height: 360,
              videoWidth: 640,
              videoHeight: 360,
              wallpaper: '#ff00ff',
              zoomRegions: [region],
              cropRegion:
                scenario.name === 'offset-crop'
                  ? { x: 0.15, y: 0.1, width: 0.7, height: 0.8 }
                  : { x: 0, y: 0, width: 1, height: 1 },
              padding: 15,
              borderRadius: 0,
              showShadow: false,
              shadowIntensity: 0,
              backgroundBlur: 0,
              showCursor: false,
              zoomMotionBlur: 0.6,
              zoomClassicMode: true,
              preferredRenderBackend: backend
            })
            await renderer.initialize()
            const videoFrame = new VideoFrame(source, { timestamp: 2000000 })
            try {
              await renderer.renderFrame(videoFrame, 2000000)
              const output = document.createElement('canvas')
              output.width = 640
              output.height = 360
              const out = output.getContext('2d')!
              out.drawImage(renderer.getCanvas(), 0, 0)
              const data = out.getImageData(0, 0, 640, 360).data
              const internal = renderer as any
              const camera = internal.cameraContainer
              const mask = internal.layoutCache.maskRect
              const sprite = internal.videoSprite
              let background = 0,
                checked = 0,
                mismatches = 0,
                outsideViewport = 0
              for (let i = 0; i < data.length; i += 4)
                if (data[i] > 245 && data[i + 1] < 10 && data[i + 2] > 245) background++
              // 使用三维平面的法线求射线交点，与生产着色器的二维联立求解独立。
              const yaw = (35 * Math.PI) / 180,
                pitch = (20 * Math.PI) / 180,
                distance = 50 / 36
              const sy = Math.sin(yaw),
                cy = Math.cos(yaw),
                sx = Math.sin(pitch),
                cx = Math.cos(pitch)
              for (let y = 4; y < 360; y += 8)
                for (let x = 4; x < 640; x += 8) {
                  const qx = (x + 0.5 - 320) / 640,
                    qy = (y + 0.5 - 180) / 640
                  const ray = (distance * cy * cx) / (cy * cx * distance + sy * cx * qx - sx * qy)
                  const rotatedX = ray * qx,
                    rotatedY = ray * qy,
                    rotatedZ = distance * (ray - 1)
                  const px = (cy * rotatedX - sy * rotatedZ) * 640 + 320
                  const py = (sy * sx * rotatedX + cx * rotatedY + cy * sx * rotatedZ) * 640 + 180
                  const localX = (px - camera.x) / camera.scale.x
                  const localY = (py - camera.y) / camera.scale.y
                  const edgeDistance = Math.min(
                    localX - mask.x,
                    localY - mask.y,
                    mask.x + mask.width - localX,
                    mask.y + mask.height - localY
                  )
                  if (Math.abs(edgeDistance) < 5) continue
                  const i = (y * 640 + x) * 4
                  const expected =
                    edgeDistance > 0
                      ? [
                          20 + Math.floor(((localX - sprite.x) / sprite.width) * 100),
                          180,
                          20 + Math.floor(((localY - sprite.y) / sprite.height) * 100)
                        ]
                      : [255, 0, 255]
                  checked++
                  if (edgeDistance > 0 && (px < 0 || py < 0 || px > 640 || py > 360))
                    outsideViewport++
                  if (expected.some((value, channel) => Math.abs(data[i + channel] - value) > 8))
                    mismatches++
                }
              // 切回二维必须恢复子滤镜原来的取样范围和裁切策略。
              const { releaseZoomCamera } = await import(
                '/presentation/src/components/video-editor/videoPlayback/zoomCameraFilter.ts' as string
              )
              releaseZoomCamera(camera)
              const clippingRestored = [
                internal.videoEffectsContainer,
                internal.videoContainer
              ].every((container) =>
                (container.filters ?? []).every((filter: any) => filter.clipToViewport)
              )
              results.push({
                renderer: Renderer === Legacy ? 'legacy' : 'modern',
                backend,
                scenario: scenario.name,
                background,
                checked,
                mismatches,
                outsideViewport,
                clippingRestored,
                image: output.toDataURL()
              })
            } finally {
              videoFrame.close()
              renderer.destroy()
            }
          }
        }
      return results
    })
    for (const result of coverage) {
      await fs.writeFile(
        testInfo.outputPath(`${result.renderer}-${result.backend}-${result.scenario}.png`),
        Buffer.from(result.image.split(',')[1], 'base64')
      )
      expect(result.checked).toBeGreaterThan(2000)
      expect(
        result.mismatches,
        `${result.renderer}/${result.backend}/${result.scenario}应采样原录屏坐标`
      ).toBeLessThan(result.checked * 0.01)
      expect(result.clippingRestored).toBe(true)
      expect(result.outsideViewport).toBeGreaterThan(0)
      if (result.scenario === 'center' || result.scenario === 'offset-crop')
        expect(result.background).toBe(0)
      else expect(result.background).toBeGreaterThan(1000)
    }
    await fs.writeFile(
      testInfo.outputPath('coverage-pixels.json'),
      JSON.stringify(
        coverage.map(({ image: _image, ...metrics }) => metrics),
        null,
        2
      )
    )
    await frame.getByRole('button', { name: '重置当前设置', exact: true }).click()
    await expect.poll(async () => (await saved()).zoomRegions[0].scale).toBeUndefined()
    await expect(frame.getByRole('slider', { name: '焦距', exact: true })).toHaveCount(0)
    await frame.getByRole('button', { name: '撤销', exact: true }).click()
    await expect.poll(async () => (await saved()).zoomRegions[0]).toEqual(configured)
    await frame.getByRole('button', { name: '重做', exact: true }).click()
    await frame.getByRole('button', { name: '撤销', exact: true }).click()
    await slider.press('End')
    await expect.poll(async () => (await saved()).zoomRegions[0].scale).toBe(5)
    await cap.press('Home')
    for (let i = 0; i < 3; i++) await cap.press('Shift+ArrowRight')
    // 读取浏览器实际合成的画面；非preserveDrawingBuffer画布在提交后会清空读回缓冲。
    await frame
      .locator('[data-preview-frame] > div')
      .first()
      .evaluate((element) => {
        const background = element as HTMLElement
        background.style.backgroundImage = 'none'
        background.style.backgroundColor = '#ff00ff'
        background.style.filter = 'none'
      })
    const preview = await frame
      .locator('[data-preview-frame] canvas')
      .screenshot({ path: testInfo.outputPath('zoom-preview-pixels.png') })
    const previewPixels = await sharp(preview).ensureAlpha().raw().toBuffer()
    let exposedBackground = 0
    for (let i = 0; i < previewPixels.length; i += 4) {
      if (previewPixels[i] > 245 && previewPixels[i + 1] < 10 && previewPixels[i + 2] > 245)
        exposedBackground++
    }
    expect(exposedBackground).toBe(0)
    await tool.screenshot({ path: testInfo.outputPath('zoom-full-recording-preview.png') })
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
