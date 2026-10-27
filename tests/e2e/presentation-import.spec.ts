import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示编辑器空时间轴的加号可取消或导入视频，缩放窗口仍能看到视频条', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(120000)
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
    await frame.getByLabel('设置分类').getByText('动态效果', { exact: true }).click()
    const applyAutomatically = frame.getByRole('switch', {
      name: '自动为新录制应用缩放',
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
    // 自动应用关闭仍可主动识别，只有移动而没有点击的轨迹也应生成1.5倍缩放。
    await expect(frame.locator('[data-timeline-item][data-variant="zoom"]')).toHaveCount(0)
    await frame.getByRole('button', { name: '自动添加缩放', exact: true }).click()
    await expect(frame.locator('[data-timeline-item][data-variant="zoom"]')).not.toHaveCount(0)
    await expect(frame.locator('[data-timeline-item][data-variant="zoom"]').first()).toContainText(
      '1.5×'
    )
    await frame.getByLabel('编辑工具').getByLabel('摄像头', { exact: true }).click()
    const webcam = frame.locator('[data-webcam-settings]')
    await expect(webcam.getByText('这里调整成片中的摄像头画中画。', { exact: false })).toBeVisible()
    await expect(webcam.getByRole('slider', { name: '人像画面宽度', exact: true })).toHaveAttribute(
      'aria-describedby',
      /.+/
    )
    await expect(webcam.getByText('按成片较短边的百分比计算；', { exact: false })).toBeVisible()
    const advanced = frame.getByRole('switch', { name: '高级设置', exact: true })
    await advanced.focus()
    await advanced.press('Space')
    await expect(
      webcam.getByText('开启后，屏幕放大时人像会相应缩小，减少遮挡；关闭则保持人像大小。')
    ).toBeAttached()
    await expect(
      webcam.getByRole('switch', { name: '屏幕放大时缩小人像', exact: true })
    ).toBeAttached()
    await expect(webcam.getByLabel('左上', { exact: true })).toBeAttached()
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
