import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'

test('演示编辑器空时间轴的加号可取消或导入视频，缩放窗口仍能看到视频条', async ({
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
          interactionType: 'move'
        }))
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
    // 从录制同名伴随素材自动识别系统与麦克风音轨，无需手动添加。
    await expect(
      frame.locator('[data-timeline-panel]').getByText('系统音频', { exact: true })
    ).toBeVisible({ timeout: 20000 })
    await expect(
      frame.locator('[data-timeline-panel]').getByText('麦克风', { exact: true })
    ).toBeVisible()
    await frame.locator('[data-timeline-item][data-variant="clip"]').first().click()
    await expect(frame.getByRole('switch', { name: '显示原始音轨', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('switch', { name: '将片段静音', exact: true })).toHaveCount(0)
    await frame
      .locator('[data-timeline-item][data-variant="clip"]')
      .first()
      .click({ button: 'right' })
    await expect(frame.getByRole('menuitem', { name: '复制', exact: true })).toBeVisible()
    await expect(frame.getByRole('menuitem', { name: '粘贴', exact: true })).toBeVisible()
    await frame.getByRole('menu', { name: '片段操作' }).press('Escape')
    // 自动应用关闭仍可主动识别，只有移动而没有点击的轨迹也应生成1.5倍缩放。
    await expect(frame.locator('[data-timeline-item][data-variant="zoom"]')).toHaveCount(0)
    await frame.getByRole('button', { name: '自动添加变焦', exact: true }).click()
    await expect(frame.locator('[data-timeline-item][data-variant="zoom"]')).not.toHaveCount(0)
    await expect(frame.locator('[data-timeline-item][data-variant="zoom"]').first()).toContainText(
      '1.5×'
    )
    await frame.locator('[data-timeline-item][data-variant="zoom"]').first().click()
    const zoomGeneral = frame.getByRole('button', { name: '变焦通用设置', exact: true })
    await expect(zoomGeneral).toHaveAttribute('aria-expanded', 'false')
    await zoomGeneral.click()
    const connect = frame.getByRole('switch', { name: '连接变焦', exact: true })
    await expect(connect).toBeChecked()
    const effects = frame.getByLabel('运动效果', { exact: true })
    await expect(effects.locator('[data-selected]')).toHaveText('平滑')
    await expect(frame.getByRole('switch', { name: '经典动画', exact: true })).toHaveCount(0)
    await expect(frame.getByRole('button', { name: '高级设置', exact: true })).toHaveCount(0)
    await effects.getByText('专注', { exact: true }).click()
    await expect(effects.locator('[data-selected]')).toHaveText('专注')
    await connect.focus()
    await connect.press('Space')
    await expect(connect).not.toBeChecked()
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    const webcam = frame.locator('[data-webcam-settings]')
    await expect(webcam.getByText('这里调整成片中的摄像头画中画。', { exact: false })).toHaveCount(
      0
    )
    await expect(webcam.getByRole('slider', { name: '人像画面宽度', exact: true })).toHaveCount(0)
    await expect(webcam.getByText('当前摄像头视频文件', { exact: true })).toHaveCount(0)
    await app.evaluate(({ dialog }, sample) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [sample] })
    }, sample)
    await webcam.getByRole('button', { name: '导入摄像头视频', exact: true }).click()
    const bubble = frame.locator('[data-webcam-overlay]')
    await expect(bubble).toBeVisible()
    await expect(bubble.locator('video')).toHaveJSProperty('readyState', 4)
    await expect(webcam.getByRole('slider', { name: '人像画面宽度', exact: true })).toHaveAttribute(
      'aria-describedby',
      /.+/
    )
    await expect(webcam.getByText('按成片较短边的百分比计算；', { exact: false })).toBeVisible()
    await expect(webcam.getByLabel('左上', { exact: true })).toHaveCount(0)
    await expect(webcam.getByRole('slider', { name: '圆角', exact: true })).toHaveValue('100')
    const before = (await bubble.boundingBox())!
    const stage = (await frame.locator('[data-preview-overlay]').boundingBox())!
    // 通过真实预览指针拖动，保留抓取偏移并测试超出画面的边界。
    await tool.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(stage.x + stage.width * 0.38, stage.y + stage.height * 0.42, {
      steps: 12
    })
    await tool.mouse.up()
    await expect.poll(async () => (await bubble.boundingBox())!.x).toBeLessThan(before.x - 10)
    const moved = (await bubble.boundingBox())!
    expect(Math.abs(moved.y - before.y)).toBeGreaterThan(10)
    const advanced = frame.getByRole('button', { name: '高级设置', exact: true })
    await advanced.focus()
    await advanced.press('Enter')
    await expect(
      webcam.getByText('开启后，屏幕放大时人像会相应缩小，减少遮挡；关闭则保持人像大小。')
    ).toBeAttached()
    await expect(
      webcam.getByRole('switch', { name: '屏幕放大时缩小人像', exact: true })
    ).toBeAttached()
    const advancedOptions = webcam.locator('[data-advanced-settings]')
    await expect(webcam.getByRole('slider', { name: '圆角', exact: true })).toHaveValue('100')
    const iframe = tool.frames().find((f) => f.url().includes('presentation.html'))!
    expect(
      await iframe.evaluate(() => {
        const group = document.querySelector('[data-webcam-settings] [data-advanced-settings]')!
        const upload = Array.from(document.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('替换摄像头视频')
        )!
        return Boolean(upload.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING)
      })
    ).toBe(true)
    for (const name of ['水平位置', '垂直位置', '距画面边缘'])
      await expect(webcam.getByRole('slider', { name, exact: true })).toHaveCount(0)
    const projects = await iframe.evaluate(
      async () => (await window.electronAPI.listProjectFiles()).entries
    )
    const projectPath = projects[0].path
    await expect
      .poll(
        async () => JSON.parse(await fs.readFile(projectPath, 'utf8')).editor.webcam.positionPreset
      )
      .toBe('custom')
    const saved = JSON.parse(await fs.readFile(projectPath, 'utf8')).editor
    expect(saved.connectZooms).toBe(false)
    expect(saved.zoomInDurationMs).toBe(200)
    expect(saved.zoomOutDurationMs).toBe(200)
    expect(saved.webcam.positionX).toBeGreaterThanOrEqual(0)
    expect(saved.webcam.positionX).toBeLessThan(1)
    expect(saved.webcam.positionY).toBeGreaterThanOrEqual(0)
    expect(saved.webcam.positionY).toBeLessThan(1)
    // 重新打开项目，运动效果和自由位置仍应保留。
    await app.evaluate(({ dialog }, projectPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] })
    }, projectPath)
    await frame.getByRole('button', { name: '导入项目', exact: true }).click()
    await expect(bubble).toBeVisible()
    await expect.poll(async () => (await bubble.boundingBox())!.x).toBeCloseTo(moved.x, 0)
    // 取消正在进行的指针拖动应回滚，且不会把预览缩放焦点拖走。
    await tool.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(stage.x - 50, stage.y - 50, { steps: 8 })
    await expect.poll(async () => (await bubble.boundingBox())!.x).toBeGreaterThanOrEqual(stage.x)
    await bubble.dispatchEvent('pointercancel', { pointerId: 1 })
    await tool.mouse.up()
    await expect.poll(async () => (await bubble.boundingBox())!.x).toBeCloseTo(moved.x, 0)
    // 光标、字幕与场景的普通内容顺序不因高级开关而改变。
    for (const [name, slider] of [
      ['光标', '光标大小'],
      ['字幕', '字号']
    ]) {
      await frame.getByLabel('编辑工具').getByLabel(name, { exact: true }).click()
      // 等待分类切换动画结束后的正文控件，避免读取仍在离场的上一个页面。
      await expect(frame.getByRole('slider', { name: slider, exact: true })).toBeVisible()
      const controls = await iframe.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '.editor-inspector input, .editor-inspector button, .editor-inspector [role="slider"]'
          )
        )
          .filter((e) => !e.closest('[data-advanced-settings]'))
          .map((e) => e.getAttribute('aria-label') || e.textContent)
      )
      await advanced.focus()
      await advanced.press('Enter')
      await expect(frame.locator('.editor-inspector [data-advanced-settings]')).toHaveCount(1)
      expect(
        await iframe.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              '.editor-inspector input, .editor-inspector button, .editor-inspector [role="slider"]'
            )
          )
            .filter((e) => !e.closest('[data-advanced-settings]'))
            .map((e) => e.getAttribute('aria-label') || e.textContent)
        )
      ).toEqual(controls)
      expect(
        await iframe.evaluate(() => {
          const area = document.querySelector('.editor-inspector')!
          const groups = Array.from(area.querySelectorAll('[data-advanced-settings]'))
          return groups.every(
            (group) =>
              !Array.from(area.querySelectorAll('input, button, [role="slider"]')).some(
                (e) =>
                  !e.closest('[data-advanced-settings]') &&
                  Boolean(group.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)
              )
          )
        })
      ).toBe(true)
    }
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    await expect(webcam.getByRole('slider', { name: '人像画面宽度', exact: true })).toBeVisible()
    const owner = await tool.evaluate(() => window.tabdo.getWebContentsId())
    const ownerId = await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner).id,
      owner
    )
    let titlebar
    for (const page of app.context().pages()) {
      if (
        page.url().includes('detached-titlebar.html') &&
        (await (await app.browserWindow(page)).evaluate((window) => window.id)) === ownerId
      )
        titlebar = page
    }
    expect(titlebar).toBeTruthy()
    await expect(titlebar!.locator('body')).toContainText('演示编辑器')
    await fs.writeFile(
      testInfo.outputPath('presentation-webcam-settings.png'),
      Buffer.from(
        await app.evaluate(
          async ({ webContents }, id) =>
            (await webContents.fromId(id)!.capturePage()).toPNG().toString('base64'),
          owner
        ),
        'base64'
      )
    )
    // 独立改变宽高，再整体放大时保持当前比例。
    const lock = webcam.getByRole('switch', { name: '保持宽高比例', exact: true })
    await lock.focus()
    await lock.press('Space')
    const widthControl = webcam.getByRole('slider', { name: '人像画面宽度', exact: true })
    const heightControl = webcam.getByRole('slider', { name: '人像画面高度', exact: true })
    await widthControl.focus()
    await widthControl.press('ArrowLeft')
    await expect(widthControl).toHaveValue('39')
    await expect(heightControl).toHaveValue('40')
    await heightControl.focus()
    await heightControl.press('ArrowRight')
    await expect(heightControl).toHaveValue('41')
    await expect(webcam.getByRole('slider', { name: '整体缩放', exact: true })).toHaveCount(0)
    await lock.press('Space')
    await widthControl.press('End')
    await expect(heightControl).toHaveValue('100')
    expect(
      Number(await widthControl.inputValue()) / Number(await heightControl.inputValue())
    ).toBeCloseTo(39 / 41, 1)
    await expect(frame.getByRole('button', { name: '高级设置', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    const headerReset = frame.getByRole('button', { name: '重置当前设置', exact: true })
    expect(await headerReset.evaluate((element) => Boolean(element.closest('header')))).toBe(true)
    await headerReset.click()
    await expect(widthControl).toHaveValue('40')
    await expect(heightControl).toHaveValue('40')
    await expect(bubble).toBeVisible()
    // 圆角独立保存到项目，并验证预览外层实际获得圆角裁切。
    await frame.getByLabel('编辑工具').getByLabel('场景', { exact: true }).click()
    const backgroundRadius = frame.getByRole('slider', { name: '背景圆角', exact: true })
    await backgroundRadius.focus()
    await backgroundRadius.press('ArrowRight')
    await backgroundRadius.press('ArrowRight')
    await frame.getByRole('slider', { name: '录屏圆角', exact: true }).focus()
    await frame.getByRole('slider', { name: '录屏圆角', exact: true }).press('ArrowRight')
    await expect
      .poll(() =>
        iframe.evaluate(() =>
          parseFloat(
            getComputedStyle(document.querySelector('[data-preview-frame]')!).borderTopLeftRadius
          )
        )
      )
      .toBeGreaterThan(0)
    // 裁剪支持角点缩放、整体移动、比例与反向框选，取消恢复原范围。
    await frame.getByRole('button', { name: '裁剪视频', exact: true }).click()
    const cropDialog = frame.getByRole('dialog', { name: '裁剪视频', exact: true })
    await expect(cropDialog).toBeVisible()
    await cropDialog.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined))
      )
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
    })
    await expect(cropDialog.locator('[data-crop-handle]')).toHaveCount(8)
    const cropBounds = (await cropDialog.locator('[data-crop-canvas]').boundingBox())!
    const corner = (await cropDialog.locator('[data-crop-handle="se"]').boundingBox())!
    await tool.mouse.move(corner.x + corner.width / 4, corner.y + corner.height / 4)
    await tool.mouse.down()
    await tool.mouse.move(
      cropBounds.x + cropBounds.width * 0.75,
      cropBounds.y + cropBounds.height * 0.75,
      { steps: 8 }
    )
    await tool.mouse.up()
    const selection = cropDialog.locator('[data-crop-selection]')
    const cropped = (await selection.boundingBox())!
    expect(cropped.width).toBeLessThan(cropBounds.width * 0.9)
    await tool.mouse.move(cropped.x + cropped.width / 2, cropped.y + cropped.height / 2)
    await tool.mouse.down()
    await tool.mouse.move(cropped.x + cropped.width / 2 + 20, cropped.y + cropped.height / 2 + 15, {
      steps: 5
    })
    await tool.mouse.up()
    expect((await selection.boundingBox())!.x).toBeGreaterThan(cropped.x + 10)
    await cropDialog.getByLabel('裁剪比例').getByText('1:1', { exact: true }).click()
    const square = (await selection.boundingBox())!
    expect(square.width / square.height).toBeCloseTo(1, 1)
    await fs.writeFile(
      testInfo.outputPath('presentation-crop-controls.png'),
      Buffer.from(
        await app.evaluate(
          async ({ webContents }, id) =>
            (await webContents.fromId(id)!.capturePage()).toPNG().toString('base64'),
          owner
        ),
        'base64'
      )
    )
    await cropDialog.getByRole('button', { name: '重新框选', exact: true }).click()
    await tool.mouse.move(
      cropBounds.x + cropBounds.width * 0.8,
      cropBounds.y + cropBounds.height * 0.8
    )
    await tool.mouse.down()
    await tool.mouse.move(
      cropBounds.x + cropBounds.width * 0.3,
      cropBounds.y + cropBounds.height * 0.3,
      { steps: 8 }
    )
    await tool.mouse.up()
    await cropDialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(cropDialog).toHaveCount(0)
    await expect
      .poll(async () => JSON.parse(await fs.readFile(projectPath, 'utf8')).editor.cropRegion)
      .toEqual({ x: 0, y: 0, width: 1, height: 1 })
    // 实际导出包含音频而非仅显示轨道；最终帧背景圆角保留。
    const exportPath = path.join(temporary, '圆角与双声道.mp4')
    await app.evaluate(({ dialog }, exportPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath })
    }, exportPath)
    await frame.getByRole('button', { name: '导出', exact: true }).click()
    await frame.getByRole('button', { name: '导出视频', exact: true }).click()
    await expect
      .poll(async () => (await fs.stat(exportPath).catch(() => ({ size: 0 }))).size, {
        timeout: 120000
      })
      .toBeGreaterThan(1000)
    const output = JSON.parse(
      execFileSync(ffprobe.path, ['-v', 'error', '-show_streams', '-of', 'json', exportPath], {
        encoding: 'utf8',
        windowsHide: true
      })
    )
    expect(output.streams.some((stream) => stream.codec_type === 'audio')).toBe(true)
    const sound = execFileSync(
      ffmpeg!,
      ['-v', 'error', '-i', exportPath, '-t', '1', '-vn', '-f', 's16le', '-ac', '1', '-'],
      { windowsHide: true, maxBuffer: 1000000 }
    )
    let energy = 0
    for (let i = 0; i < sound.length; i += 2) energy += sound.readInt16LE(i) ** 2
    expect(Math.sqrt(energy / (sound.length / 2))).toBeGreaterThan(100)
    const pixels = execFileSync(
      ffmpeg!,
      [
        '-v',
        'error',
        '-i',
        exportPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=320:180',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-'
      ],
      { windowsHide: true, maxBuffer: 1000000 }
    )
    expect(Math.max(...pixels.subarray(0, 3))).toBeLessThan(25)
    for (const size of [
      { width: 1180, height: 754 },
      { width: 980, height: 580 }
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { id, size }) =>
          BrowserWindow.fromId(id)!.setSize(size.width, size.height),
        { id: ownerId, size }
      )
      await expect
        .poll(() =>
          tool
            .frames()
            .find((f) => f.url().includes('presentation.html'))!
            .evaluate(() => {
              const timeline = document
                .querySelector('[data-timeline-panel]')!
                .getBoundingClientRect()
              return (
                timeline.top >= 0 && timeline.bottom <= innerHeight + 1 && timeline.height >= 160
              )
            })
        )
        .toBe(true)
    }
    await fs.writeFile(
      testInfo.outputPath('presentation-import-timeline.png'),
      Buffer.from(
        await app.evaluate(
          async ({ webContents }, id) =>
            (await webContents.fromId(id)!.capturePage()).toPNG().toString('base64'),
          owner
        ),
        'base64'
      )
    )
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
