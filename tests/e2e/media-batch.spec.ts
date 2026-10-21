import { test, expect, _electron as electron, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpeg from 'ffmpeg-static'
const execute = promisify(execFile)

test('media tools preserve the reference layout, process actual files, themes and task cleanup', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-media-e2e-')),
    output = path.join(temporary, 'output')
  await fs.mkdir(output)
  const first = path.join(temporary, '绿色.png'),
    second = path.join(temporary, 'second', '红色.png'),
    video = path.join(temporary, 'video.mp4')
  await fs.mkdir(path.dirname(second))
  await sharp({ create: { width: 96, height: 64, channels: 4, background: '#19c37d' } })
    .png()
    .toFile(first)
  await sharp({ create: { width: 96, height: 64, channels: 4, background: '#ef4444' } })
    .png()
    .toFile(second)
  await execute(
    ffmpeg!,
    [
      '-hide_banner',
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=160x120:r=15:d=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      video
    ],
    { windowsHide: true }
  )
  const original = await fs.readFile(first)
  const environment = {
    ...process.env,
    TABDO_E2E: '1',
    TABDO_SOURCE_PREVIEW: '1',
    TABDO_PREVIEW_OPEN_SETTINGS: '0',
    TABDO_DATA_ROOT: path.join(temporary, 'data'),
    TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
    TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
  }
  delete environment.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    args: [path.join(root, 'scripts/preview-main.cjs')],
    cwd: root,
    env: environment
  })
  const logs: string[] = []
  app.process().stdout?.on('data', (data) => logs.push(String(data)))
  app.process().stderr?.on('data', (data) => logs.push(String(data)))
  try {
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    await expect
      .poll(() =>
        main.evaluate(async () =>
          (await window.tabdo.getAllPlugins()).some((p) => p.name === 'system')
        )
      )
      .toBe(true)
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((p) => p.name === 'system')
    )
    /**
     * 从宿主进入本次新建的工具会话，等待旧视图真正关闭。
     * @param code 功能码。
     * @param files 用户匹配的本地文件。
     * @param matchedImage 无源路径的匹配图片。
     * @returns 新工具页面。
     */
    async function launch(code: string, files: string[] = [], matchedImage = ''): Promise<Page> {
      const old = app
        .context()
        .pages()
        .filter((p) => p.url().startsWith('http://127.0.0.1:15178'))
      await main.evaluate(
        async ({ plugin, code, files, matchedImage }) =>
          window.tabdo.launch({
            path: plugin!.path,
            type: 'plugin',
            featureCode: code,
            param: files.length
              ? {
                  type: 'files',
                  payload: files.map((file) => ({
                    path: file,
                    name: file.split(/[\\/]/).pop(),
                    isDirectory: false
                  }))
                }
              : matchedImage
                ? { type: 'img', payload: matchedImage }
                : undefined
          }),
        { plugin, code, files, matchedImage }
      )
      await app.evaluate(({ app }) => {
        const manager = process.mainModule!.require(
          app.getAppPath() + '/src/main/managers/windowManager.ts'
        ).default
        manager.getMainWindow().show()
        manager.getMainWindow().focus()
        process
          .mainModule!.require(app.getAppPath() + '/src/main/managers/pluginManager.ts')
          .default.focusPluginView()
      })
      await expect
        .poll(() =>
          app
            .context()
            .pages()
            .some((p) => !old.includes(p) && p.url().startsWith('http://127.0.0.1:15178'))
        )
        .toBe(true)
      const next = app
        .context()
        .pages()
        .find((p) => !old.includes(p) && p.url().startsWith('http://127.0.0.1:15178'))!
      await expect.poll(() => old.every((p) => p.isClosed())).toBe(true)
      return next
    }
    /**
     * 直接捕获稳定正文所在的插件视图，不拼接宿主窗口。
     * @param page 当前工具页面。
     * @param name 截图文件名。
     * @returns 保存截图后的 Promise。
     */
    async function capture(page: Page, name: string): Promise<void> {
      await page.evaluate(async () => {
        document.body.style.background = matchMedia('(prefers-color-scheme:dark)').matches
          ? '#202020'
          : '#fff'
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      const data = await app.evaluate(
        async ({ webContents }, url) =>
          (
            await webContents
              .getAllWebContents()
              .find((w) => w.getURL() === url)!
              .capturePage()
          )
            .toPNG()
            .toString('base64'),
        page.url()
      )
      await fs.writeFile(testInfo.outputPath(name), Buffer.from(data, 'base64'))
    }
    /**
     * 通过实际设置入口把测试输出定位到隔离目录。
     * @param page 当前工具页面。
     * @returns 设置完成后的 Promise。
     */
    async function configureOutput(page: Page): Promise<void> {
      await app.evaluate(({ dialog }, directory) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] })
      }, output)
      await page.getByRole('button', { name: '设置', exact: true }).click()
      await page.getByLabel('自定义目录', { exact: true }).check()
      await page.getByRole('button', { name: '更换', exact: true }).click()
      await expect(page.locator('.media-settings')).toContainText(output)
      await page.getByRole('button', { name: '关闭设置', exact: true }).click()
    }
    let tools = await launch('image-batch', [first, second])
    await expect(tools.locator('.media-row')).toHaveCount(2, { timeout: 20000 })
    await tools.getByRole('button', { name: '设置', exact: true }).click()
    await expect(tools.getByLabel('与源文件同级目录', { exact: true })).toBeChecked()
    await capture(tools, 'output-source-default.png')
    await tools.getByRole('button', { name: '关闭设置', exact: true }).click()
    await tools.getByRole('button', { name: '修改尺寸', exact: true }).click()
    await tools.getByLabel('宽度', { exact: true }).fill('50%')
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.getByRole('status')).toHaveText('处理完成：2 项成功', { timeout: 30000 })
    expect((await sharp(path.join(path.dirname(first), '绿色-resize.png')).metadata()).width).toBe(
      48
    )
    expect((await sharp(path.join(path.dirname(second), '红色-resize.png')).metadata()).width).toBe(
      48
    )
    expect(
      (await fs.readdir(path.dirname(first))).filter((name) => name.startsWith('.tabdo-media-'))
    ).toHaveLength(0)
    expect(
      (await fs.readdir(path.dirname(second))).filter((name) => name.startsWith('.tabdo-media-'))
    ).toHaveLength(0)
    await tools.getByRole('button', { name: '合并为 GIF', exact: true }).click()
    await tools.getByLabel('宽度', { exact: true }).fill('48')
    await tools.getByLabel('高度', { exact: true }).fill('32')
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.getByRole('status')).toHaveText('处理完成：1 项成功', { timeout: 30000 })
    expect(
      (
        await sharp(path.join(path.dirname(first), '合并结果-gif.gif'), {
          animated: true
        }).metadata()
      ).pages
    ).toBe(2)
    expect(
      await fs.stat(path.join(path.dirname(second), '合并结果-gif.gif')).catch(() => null)
    ).toBeNull()
    await configureOutput(tools)
    await expect(tools.locator('.media-batch')).toHaveCSS('font-size', '13px')
    const layout = await tools.evaluate(() => {
      const n = document.querySelector('nav')!.getBoundingClientRect(),
        p = document.querySelector('.media-parameters')!.getBoundingClientRect(),
        q = document.querySelector('.media-queue')!.getBoundingClientRect()
      return {
        nav: n.x,
        parameters: p.x,
        queue: q.x,
        overflow: document.documentElement.scrollWidth > innerWidth
      }
    })
    expect(layout.nav).toBeLessThan(layout.parameters)
    expect(layout.parameters).toBeLessThan(layout.queue)
    expect(layout.overflow).toBe(false)
    await capture(tools, 'images-light.png')
    const labels = await tools.locator('nav button').allTextContents()
    for (const label of labels) {
      await tools.getByRole('button', { name: label.trim(), exact: true }).click()
      await expect(tools.locator('.parameter-title')).toHaveText(label.trim())
    }
    await tools.getByRole('button', { name: '修改尺寸', exact: true }).click()
    // 延迟交付真实读图结果，验证快速换图取消旧请求且不会并行堆积进程。
    await tools.evaluate(() => {
      const runtime = window as any
      runtime.__mediaOriginalRun = runtime.toolsMedia.run.bind(runtime.toolsMedia)
      runtime.__previewBudget = { active: 0, peak: 0, cancelled: 0, calls: 0 }
      /**
       * 延迟真实读图的结算边界，以观察前台取消与并发预算。
       * @param request 媒体读取请求。
       * @param signal 该读取的取消信号。
       * @param progress 原有进度订阅。
       * @returns 原有读取结果。
       * @throws 原有读取失败时抛出。
       */
      runtime.toolsMedia.run = async (request, signal, progress) => {
        if (!request.preview) return runtime.__mediaOriginalRun(request, signal, progress)
        const budget = runtime.__previewBudget
        budget.active++
        budget.calls++
        budget.peak = Math.max(budget.peak, budget.active)
        try {
          const result = await runtime.__mediaOriginalRun(request, signal, progress)
          await new Promise((resolve) => setTimeout(resolve, 120))
          return result
        } finally {
          if (signal.aborted) budget.cancelled++
          budget.active--
        }
      }
    })
    await tools.getByRole('button', { name: '手动裁剪', exact: true }).click()
    await expect.poll(() => tools.evaluate(() => (window as any).__previewBudget.active)).toBe(1)
    await tools.evaluate(async () => {
      const rows = document.querySelectorAll('.media-row')
      for (let index = 0; index < 12; index++) {
        rows[index % 2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await new Promise(requestAnimationFrame)
      }
    })
    await expect.poll(() => tools.evaluate(() => (window as any).__previewBudget.active)).toBe(0)
    const budget = await tools.evaluate(() => (window as any).__previewBudget)
    expect(budget.peak).toBe(1)
    expect(budget.cancelled).toBeGreaterThan(0)
    expect(budget.calls).toBeGreaterThan(1)
    await expect(tools.locator('.media-row.active')).toContainText('红色')
    await tools.evaluate(() => {
      const runtime = window as any
      runtime.toolsMedia.run = runtime.__mediaOriginalRun
    })
    await tools.getByRole('button', { name: '修改尺寸', exact: true }).click()
    await tools.getByLabel('宽度', { exact: true }).fill('50%')
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.getByRole('status')).toHaveText('处理完成：2 项成功', { timeout: 30000 })
    const resized = (await fs.readdir(output)).filter((x) => x.includes('-resize'))
    expect(resized).toHaveLength(2)
    expect((await sharp(path.join(output, resized[0])).metadata()).width).toBe(48)
    expect(await fs.readFile(first)).toEqual(original)
    await tools.getByRole('button', { name: '合并为 GIF', exact: true }).click()
    await tools.getByLabel('宽度', { exact: true }).fill('48')
    await tools.getByLabel('高度', { exact: true }).fill('32')
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.getByRole('status')).toHaveText('处理完成：1 项成功', { timeout: 30000 })
    expect(
      (await sharp(path.join(output, '合并结果-gif.gif'), { animated: true }).metadata()).pages
    ).toBe(2)
    await tools.emulateMedia({ colorScheme: 'dark' })
    await expect(tools.locator('.media-batch')).toHaveCSS('color', 'rgb(224, 224, 224)')
    await capture(tools, 'images-dark.png')
    tools = await launch('video-batch', [video])
    await expect(tools.locator('.media-row')).toHaveCount(1, { timeout: 20000 })
    await expect(tools.locator('.media-row')).toContainText('160 × 120')
    await tools.getByRole('button', { name: '设置', exact: true }).click()
    await expect(tools.getByLabel('与源文件同级目录', { exact: true })).toBeChecked()
    await tools.getByRole('button', { name: '关闭设置', exact: true }).click()
    await tools.getByRole('button', { name: '修改尺寸', exact: true }).click()
    await tools.getByLabel('宽度', { exact: true }).fill('80')
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.getByRole('status')).toHaveText('处理完成：1 项成功', { timeout: 30000 })
    expect((await fs.stat(path.join(temporary, 'video-resize.mp4'))).size).toBeGreaterThan(100)
    await configureOutput(tools)
    await capture(tools, 'videos-light.png')
    const videoLabels = await tools.locator('nav button').allTextContents()
    for (const label of videoLabels) {
      await tools.getByRole('button', { name: label.trim(), exact: true }).click()
      await expect(tools.locator('.parameter-title')).toHaveText(label.trim())
    }
    await tools.getByRole('button', { name: '修改尺寸', exact: true }).click()
    await tools.getByLabel('宽度', { exact: true }).fill('80')
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.getByRole('status')).toHaveText('处理完成：1 项成功', { timeout: 30000 })
    expect((await fs.stat(path.join(output, 'video-resize.mp4'))).size).toBeGreaterThan(100)
    await tools.emulateMedia({ colorScheme: 'dark' })
    await capture(tools, 'videos-dark.png')
    // 用实际编码链取消正在执行的 GIF，等待暂存目录与工作进程退出。
    await tools.getByRole('button', { name: '转为动图', exact: true }).click()
    await tools.getByLabel('动图宽度', { exact: true }).fill('2048')
    await tools.getByLabel('每秒帧数', { exact: true }).fill('60')
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.getByRole('button', { name: '取消', exact: true })).toBeVisible()
    await tools.getByRole('button', { name: '取消', exact: true }).click()
    await expect(tools.getByRole('status')).toContainText('取消', { timeout: 15000 })
    expect((await fs.readdir(output)).filter((x) => x.startsWith('.tabdo-media-'))).toHaveLength(0)
    // 等待同级目录暂存区真实出现后取消，验证跨目录准备链也由宿主清理。
    await tools.getByRole('button', { name: '设置', exact: true }).click()
    await tools.getByLabel('与源文件同级目录', { exact: true }).check()
    await tools.getByRole('button', { name: '关闭设置', exact: true }).click()
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect
      .poll(async () =>
        (await fs.readdir(temporary)).some((name) => name.startsWith('.tabdo-media-'))
      )
      .toBe(true)
    await tools.getByRole('button', { name: '取消', exact: true }).click()
    await expect(tools.getByRole('status')).toContainText('取消', { timeout: 15000 })
    expect(
      (await fs.readdir(temporary)).filter((name) => name.startsWith('.tabdo-media-'))
    ).toHaveLength(0)
    const clipboardOutput = path.join(temporary, 'clipboard-output')
    await fs.mkdir(clipboardOutput)
    await app.evaluate(({ app }, directory) => {
      app.setPath('downloads', directory)
    }, clipboardOutput)
    tools = await launch('image-batch', [], 'data:image/png;base64,' + original.toString('base64'))
    await expect(tools.locator('.media-row')).toHaveCount(1)
    await tools.getByRole('button', { name: '设置', exact: true }).click()
    await tools.getByLabel('与源文件同级目录', { exact: true }).check()
    await tools.getByRole('button', { name: '关闭设置', exact: true }).click()
    await tools.getByRole('button', { name: /^开始处理/ }).click()
    await expect(tools.locator('.media-status')).toHaveText('处理完成：1 项成功', {
      timeout: 15000
    })
    expect(
      (await fs.readdir(clipboardOutput)).filter((file) => file.endsWith('.png'))
    ).toHaveLength(1)
    expect(
      (await fs.readdir(clipboardOutput)).filter((file) => file.startsWith('.tabdo-media-'))
    ).toHaveLength(0)
    tools = await launch('screen-recorder')
    await expect(tools.locator('.source').first()).toBeVisible({ timeout: 20000 })
    await expect(tools.locator('.countdown-options button')).toHaveText([
      '3 秒',
      '4 秒',
      '5 秒',
      '6 秒',
      '7 秒',
      '8 秒',
      '9 秒'
    ])
    const recorderGeometry = await tools.evaluate(() => ({
      source: document.querySelector('.screen-sources-box img')!.getBoundingClientRect().width,
      page: innerWidth,
      options: getComputedStyle(document.querySelector('.option-row')!).display
    }))
    expect(recorderGeometry.source).toBeGreaterThan(recorderGeometry.page * 0.3)
    expect(recorderGeometry.options).toBe('flex')
    await capture(tools, 'recorder-layout.png')
    await tools.getByRole('tab', { name: '窗口录制', exact: true }).click()
    await expect(tools.locator('.window-sources-box')).toBeVisible()
    await expect(tools.locator('.countdown-options')).toHaveCount(0)
    await expect(tools.getByLabel('鼠标点击效果', { exact: true })).toHaveCount(0)
    await capture(tools, 'recorder-windows.png')
    await tools.evaluate(() => {
      navigator.mediaDevices.enumerateDevices = async () => []
    })
    await tools.getByLabel('麦克风', { exact: true }).click()
    await expect(tools.getByRole('status')).toHaveText('麦克风未连接或未被识别')
    await expect(tools.getByLabel('麦克风', { exact: true })).not.toBeChecked()
    await tools.evaluate(() => {
      navigator.mediaDevices.enumerateDevices = async () => [
        { kind: 'audioinput' } as MediaDeviceInfo
      ]
    })
    await tools.getByLabel('麦克风', { exact: true }).click()
    await expect(tools.getByLabel('麦克风', { exact: true })).toBeChecked()
    await tools.getByLabel('麦克风', { exact: true }).uncheck()
    await tools.getByRole('tab', { name: '全屏录制', exact: true }).click()
    await expect(tools.locator('.screen-sources-box img').first()).toBeVisible()
    await tools.getByRole('button', { name: '录屏设置', exact: true }).click()
    await expect(tools.getByRole('dialog')).toBeVisible()
    await tools.getByLabel('录制质量').selectOption('high')
    await expect(tools.locator('.keyboard-types [role=radio]')).toHaveCount(5)
    await tools.getByRole('button', { name: '左键颜色', exact: true }).click()
    await tools.getByLabel('十六进制颜色', { exact: true }).fill('#aabbcc')
    await tools.getByLabel('十六进制颜色', { exact: true }).press('Tab')
    await tools.evaluate(() => {
      ;(window as any).tabdo.screenColorPick = async (callback) => callback({ hex: '#123456' })
    })
    await tools.getByRole('button', { name: '屏幕取色', exact: true }).click()
    await expect(tools.getByRole('dialog', { name: '选择颜色', exact: true })).toHaveCount(0)
    await expect(tools.getByRole('button', { name: '左键颜色', exact: true })).toHaveCSS(
      'background-color',
      'rgb(18, 52, 86)'
    )
    await tools.getByRole('radio', { name: 'Emoji 表情', exact: true }).click()
    await tools.getByRole('button', { name: '右键表情', exact: true }).click()
    await tools.getByRole('button', { name: '🚀', exact: true }).click()
    await expect(tools.getByRole('button', { name: '右键表情', exact: true })).toHaveText('🚀')
    await tools.getByRole('radio', { name: 'RGB 键盘', exact: true }).click()
    await tools.getByRole('radio', { name: '中', exact: true }).click()
    await capture(tools, 'recorder-settings.png')
    await tools.getByRole('button', { name: '关闭设置', exact: true }).click()
    await expect(tools.getByRole('dialog')).toHaveCount(0)
    await capture(tools, 'recorder-layout.png')
    await tools.evaluate(() => {
      void window.tabdo.outPlugin()
    })
    await expect.poll(() => tools.isClosed()).toBe(true)
  } finally {
    await fs.writeFile(testInfo.outputPath('media.log'), logs.join(''))
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
