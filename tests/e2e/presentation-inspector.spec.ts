import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示编辑侧栏统一层级、折叠、留白与摄像头精简', async ({
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
    const undo = frame.getByRole('button', { name: '撤销', exact: true }),
      redo = frame.getByRole('button', { name: '重做', exact: true })
    const inspector = frame.locator('.editor-inspector')
    /**
     * 读取界面元素实际使用的字号和颜色。
     * @param node 当前渲染后的元素。
     * @returns 可跨主题比较的字体与颜色。
     */
    const typography = (node: Element): { size: string; color: string } => ({
      size: getComputedStyle(node).fontSize,
      color: getComputedStyle(node).color
    })
    await frame.getByLabel('编辑工具').getByLabel('场景', { exact: true }).click()
    await expect(frame.getByRole('button', { name: '高级设置', exact: true })).toHaveCount(0)
    const screenRadius = frame.getByRole('slider', { name: '录屏圆角', exact: true })
    const shadow = frame.getByRole('slider', { name: '阴影', exact: true })
    await expect(screenRadius).toBeVisible()
    expect(
      await screenRadius.evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(
            document.querySelector('[data-scene-layout] [aria-label="阴影"]')!
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      )
    ).toBe(true)
    const link = frame.getByRole('switch', { name: '联动各边留白', exact: true }),
      remove = frame.getByRole('switch', { name: '移除背景', exact: true })
    await expect(link).toBeChecked()
    const linkedBefore = (await saved()).padding
    await link.press('Space')
    const padding = frame.getByLabel('内边距设置', { exact: true })
    await expect(padding.getByText('内边距', { exact: true })).toBeVisible()
    await expect(padding.getByRole('slider')).toHaveCount(4)
    const top = padding.getByRole('slider').first()
    await top.press('ArrowRight')
    await expect.poll(async () => (await saved()).padding.top).toBe(linkedBefore.top + 1)
    expect((await saved()).padding.bottom).toBe(linkedBefore.bottom)
    await undo.click()
    await expect.poll(async () => (await saved()).padding.top).toBe(linkedBefore.top)
    await undo.click()
    await expect(link).toBeChecked()
    await redo.click()
    await expect(link).not.toBeChecked()
    await redo.click()
    await expect.poll(async () => (await saved()).padding.top).toBe(linkedBefore.top + 1)
    const muted = await Promise.all(
      [link, remove].map((item) =>
        item.evaluate(
          (node) =>
            getComputedStyle(node.closest('section')!.querySelector('.inspector-control-label')!)
              .color
        )
      )
    )
    expect(muted[0]).toBe(muted[1])
    expect(
      await link.evaluate((node) =>
        Boolean(
          node
            .closest('section')!
            .compareDocumentPosition(
              document.querySelector('[aria-label="移除背景"]')!.closest('section')!
            ) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      )
    ).toBe(true)
    await link.scrollIntoViewIfNeeded()
    await tool.screenshot({ path: testInfo.outputPath('scene-padding.png') })
    // 场景移除裁剪入口后，当前分类重置也应保留已确认的裁剪范围。
    await frame.getByRole('button', { name: '裁剪视频', exact: true }).click()
    const cropDialog = frame.getByRole('dialog', { name: '裁剪视频', exact: true })
    await cropDialog.getByText('1:1', { exact: true }).click()
    await cropDialog.getByRole('button', { name: '完成', exact: true }).click()
    await expect.poll(async () => (await saved()).cropRegion.width).toBeLessThan(1)
    const cropBeforeReset = (await saved()).cropRegion
    await screenRadius.scrollIntoViewIfNeeded()
    await screenRadius.press('ArrowRight')
    await expect.poll(async () => (await saved()).borderRadius).toBeGreaterThan(0)
    const editedRadius = (await saved()).borderRadius
    await frame.getByRole('button', { name: '重置当前设置', exact: true }).click()
    await expect.poll(async () => (await saved()).borderRadius).not.toBe(editedRadius)
    expect((await saved()).cropRegion).toEqual(cropBeforeReset)
    await frame.getByLabel('编辑工具').getByLabel('按键', { exact: true }).click()
    await expect(inspector.getByText('机械键盘', { exact: true })).toBeVisible()
    const keyboardScroll = await inspector.locator('.inspector-scroll').evaluate((node) => ({
      width: getComputedStyle(node).scrollbarWidth,
      gutter: getComputedStyle(node).scrollbarGutter
    }))
    expect(keyboardScroll).toEqual({ width: 'thin', gutter: 'stable' })
    await tool.screenshot({ path: testInfo.outputPath('keyboard-scrollbar.png') })
    await frame.getByLabel('编辑工具').getByLabel('光标', { exact: true }).click()
    const cursorAdvanced = frame.getByRole('button', { name: '高级设置', exact: true })
    await expect(cursorAdvanced).toHaveAttribute('aria-expanded', 'false')
    await cursorAdvanced.click()
    const first = inspector.locator('[data-advanced-settings]').first()
    expect(await first.evaluate((node) => getComputedStyle(node).paddingTop)).toBe('12px')
    expect((await cursorAdvanced.evaluate(typography)).size).toBe('13px')
    const loop = frame.getByRole('switch', { name: '循环光标', exact: true })
    const loopLayout = await loop.evaluate((node) => {
      const row = node.closest('section')!,
        title = row.querySelector('.inspector-control-label')!,
        description = row.querySelector('.inspector-description')!
      const a = title.getBoundingClientRect(),
        b = row.querySelector('[data-slot="switch-control"]')!.getBoundingClientRect()
      return {
        title: getComputedStyle(title).fontSize,
        description: getComputedStyle(description).fontSize,
        titleColor: getComputedStyle(title).color,
        descriptionColor: getComputedStyle(description).color,
        offset: Math.abs(a.y + a.height / 2 - b.y - b.height / 2)
      }
    })
    expect(loopLayout.title).toBe('12px')
    expect(loopLayout.description).toBe('11px')
    expect(loopLayout.titleColor).not.toBe(loopLayout.descriptionColor)
    expect(loopLayout.offset).toBeLessThanOrEqual(2)
    expect(
      await inspector.locator('.inspector-scroll').evaluate((node) => ({
        width: getComputedStyle(node).scrollbarWidth,
        gutter: getComputedStyle(node).scrollbarGutter
      }))
    ).toEqual(keyboardScroll)
    await loop.scrollIntoViewIfNeeded()
    await tool.screenshot({ path: testInfo.outputPath('cursor-advanced.png') })
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    const camera = frame.locator('[data-webcam-settings]')
    await expect(camera.getByText('这里调整成片中的摄像头画中画。', { exact: false })).toHaveCount(
      0
    )
    await expect(camera.getByRole('slider', { name: '整体缩放', exact: true })).toHaveCount(0)
    await expect(camera.getByRole('slider', { name: '圆角', exact: true })).toHaveCount(0)
    await expect(camera.getByRole('slider', { name: '阴影', exact: true })).toHaveCount(0)
    await camera.getByRole('button', { name: '导入摄像头视频', exact: true }).click()
    await expect(frame.locator('[data-webcam-overlay]')).toBeVisible()
    await expect(camera.getByRole('slider', { name: '圆角', exact: true })).toHaveValue('100')
    await expect(camera.getByRole('slider', { name: '阴影', exact: true })).toBeVisible()
    const cameraShadow = camera.getByRole('slider', { name: '阴影', exact: true })
    const originalShadow = (await saved()).webcam.shadow
    await cameraShadow.press('ArrowRight')
    await expect
      .poll(async () => (await saved()).webcam.shadow)
      .toBeCloseTo(originalShadow + 0.01, 2)
    await undo.click()
    await expect.poll(async () => (await saved()).webcam.shadow).toBe(originalShadow)
    await redo.click()
    await expect
      .poll(async () => (await saved()).webcam.shadow)
      .toBeCloseTo(originalShadow + 0.01, 2)
    const currentFile = camera.getByText('当前摄像头视频文件', { exact: true })
    expect((await currentFile.evaluate(typography)).size).toBe('12px')
    const advanced = frame.getByRole('button', { name: '高级设置', exact: true })
    await advanced.click()
    await expect(
      camera.locator('[data-advanced-settings]').getByRole('slider', { name: '圆角', exact: true })
    ).toHaveCount(0)
    for (const name of ['水平位置', '垂直位置', '距画面边缘'])
      await expect(camera.getByRole('slider', { name, exact: true })).toHaveCount(0)
    const react = camera.getByRole('switch', { name: '屏幕放大时缩小人像', exact: true })
    await react.scrollIntoViewIfNeeded()
    const row = react.locator('xpath=ancestor::section[1]')
    expect((await row.locator('.inspector-control-label').evaluate(typography)).size).toBe('12px')
    expect((await row.locator('.inspector-description').evaluate(typography)).size).toBe('11px')
    await tool.screenshot({ path: testInfo.outputPath('camera-advanced.png') })
    await iframe.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(row.locator('.inspector-control-label')).toHaveCSS(
      'color',
      await inspector.evaluate((node) => getComputedStyle(node).color)
    )
    await tool.screenshot({ path: testInfo.outputPath('camera-advanced-dark.png') })
    await iframe.evaluate(() => document.documentElement.classList.remove('dark'))
    const zoomRow = frame.locator('[data-timeline-row="row-zoom"] > div.relative'),
      zoomBox = (await zoomRow.boundingBox())!
    await tool.mouse.click(zoomBox.x + zoomBox.width * 0.45, zoomBox.y + zoomBox.height / 2)
    const general = frame.getByRole('button', { name: '变焦通用设置', exact: true })
    await expect(general).toHaveAttribute('aria-expanded', 'false')
    await expect(frame.getByRole('switch', { name: '连接变焦', exact: true })).toHaveCount(0)
    await general.click()
    expect((await general.evaluate(typography)).size).toBe('13px')
    const connect = frame.getByRole('switch', { name: '连接变焦', exact: true })
    await expect(connect).toBeChecked()
    await connect.press('Space')
    await expect(connect).not.toBeChecked()
    await undo.click()
    await expect(connect).toBeChecked()
    await redo.click()
    await expect(connect).not.toBeChecked()
    const group = frame.getByRole('group', { name: '变焦通用设置', exact: true })
    expect((await group.getByText('连接变焦', { exact: true }).evaluate(typography)).size).toBe(
      '12px'
    )
    expect((await group.locator('.inspector-description').evaluate(typography)).size).toBe('11px')
    await connect.scrollIntoViewIfNeeded()
    await tool.screenshot({ path: testInfo.outputPath('zoom-general.png') })
    await general.click()
    await expect(connect).toHaveCount(0)
    expect(pageErrors).toEqual([])
  } finally {
    if (app) await app.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
