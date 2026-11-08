import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffprobe from 'ffprobe-static'
import ffmpeg from 'ffmpeg-static'
import { readWindowIdentity, trackWindowIdentities } from '../fixtures/windowIdentity'

test('演示录屏直接显示原生控制条，编辑入口和录制交接正常并回收会话', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(300000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-presentation-'))
  let app: ElectronApplication | undefined
  const logs: string[] = []
  try {
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_E2E_NATIVE_CAMERA_REFERENCE: '1',
      TABDO_E2E_CAPTURE_MIC_LOOPBACK: '1',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs'), '--use-fake-device-for-media-stream'],
      cwd: root,
      env
    })
    await app.context().addInitScript(() => {
      ;(window as any).__presentationGpuDraws = 0
      for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
        for (const method of ['drawElements', 'drawArrays'] as const) {
          const original = type.prototype[method]
          type.prototype[method] = function (...args) {
            ;(window as any).__presentationGpuDraws++
            return original.apply(this, args)
          } as typeof original
        }
      }
    })
    await trackWindowIdentities(app)
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    // 在真实窗口播放视频，验证直接窗口捕获包含连续变化的解码画面。
    const moviePath = path.join(temporary, 'capture-movie.mp4')
    execFileSync(
      ffmpeg!,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=30',
        '-t',
        '3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        moviePath
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    const movieData = 'data:video/mp4;base64,' + (await fs.readFile(moviePath)).toString('base64')
    const captureFixtureId = await app.evaluate(async ({ BrowserWindow }, movieData) => {
      const fixture = new BrowserWindow({
        title: '窗口捕获验证',
        x: 90,
        y: 90,
        width: 620,
        height: 430,
        show: false,
        webPreferences: { sandbox: true }
      })
      await fixture.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<title>窗口捕获验证</title><style>body{margin:0;background:#fff}video{width:100%;height:100%;object-fit:fill;position:absolute}button{position:absolute;top:80px;left:80px}</style><video autoplay loop muted playsinline src="' +
              movieData +
              '"></video><button>录制点击目标</button>'
          )
      )
      fixture.show()
      return fixture.id
    }, movieData)
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((item) => item.name === 'system')
    )
    await app.evaluate(({ app }) => {
      ;(globalThis as any).__presentationShownWindows = []
      app.on('browser-window-created', (_event, window) =>
        window.on('show', () => {
          ;(globalThis as any).__presentationShownWindows.push(window.id)
        })
      )
    })
    const launchStarted = Date.now()
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin!.path,
          type: 'plugin',
          featureCode: 'presentation-recorder'
        }),
      plugin
    )
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((p) => p.url().startsWith('http://127.0.0.1:15178')),
        { timeout: 30000 }
      )
      .toBe(true)
    const tool = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
    tool.on('pageerror', (error) => logs.push('PAGE ERROR ' + error.stack))
    tool.on('console', (event) => {
      if (event.type() === 'error') logs.push('PAGE CONSOLE ' + event.text())
    })
    const frame = tool.frameLocator('iframe')
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((p) => p.url().includes('windowType=hud-overlay')),
        { timeout: 30000 }
      )
      .toBe(true)
    const hud = app
      .context()
      .pages()
      .find((p) => p.url().includes('windowType=hud-overlay'))!
    hud.on('pageerror', (error) => logs.push('HUD ERROR ' + error.stack))
    hud.on('console', (event) => logs.push('HUD ' + event.type() + ' ' + event.text()))
    await expect(hud.getByRole('button', { name: '录制', exact: true })).toBeVisible({
      timeout: 30000
    })
    logs.push('PERF launch-to-control-ms ' + (Date.now() - launchStarted))
    const nativeHud = await app.browserWindow(hud)
    const hudId = await nativeHud.evaluate((window) => window.id)
    const hudIdentity = await readWindowIdentity(app, hudId, 'presentation-recorder')
    expect(hudIdentity.skipTaskbar).toBe(false)
    expect(hudIdentity.iconMatchesFeature).toBe(true)
    if (process.platform === 'win32') {
      expect(hudIdentity.nativeIcons.some((icon) => icon.present)).toBe(true)
      expect(hudIdentity.appId).toBe('TabDo.Tool.presentation-recorder')
    }
    const availableSources = await hud.evaluate(() =>
      window.electronAPI.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 }
      })
    )
    logs.push(
      'WINDOW SOURCES ' + JSON.stringify(availableSources.map((s) => ({ id: s.id, name: s.name })))
    )
    expect(availableSources.some((source) => source.name.includes('窗口捕获验证'))).toBe(true)
    await hud.getByRole('button', { name: '选择录制来源', exact: true }).click()
    const picker = hud.locator('[data-source-menu]')
    await expect(picker.getByRole('heading', { name: '屏幕', exact: true })).toBeVisible()
    await expect(picker.getByRole('heading', { name: '应用窗口', exact: true })).toBeVisible()
    const targetRow = picker.getByRole('button', { name: '窗口捕获验证', exact: true })
    await expect(targetRow).toBeVisible()
    expect(
      app
        .context()
        .pages()
        .some((page) => page.url().includes('windowType=source-selector'))
    ).toBe(false)
    const menuBounds = await picker.boundingBox()
    const triggerBounds = await hud
      .getByRole('button', { name: '选择录制来源', exact: true })
      .boundingBox()
    expect(menuBounds!.width).toBeLessThanOrEqual(320)
    expect(menuBounds!.y + menuBounds!.height).toBeLessThan(triggerBounds!.y + 4)
    await fs.writeFile(
      testInfo.outputPath('presentation-source-list.png'),
      Buffer.from(
        await nativeHud.evaluate(
          async (window, rect) =>
            (
              await window.webContents.capturePage({
                x: Math.floor(rect.x),
                y: Math.floor(rect.y),
                width: Math.ceil(rect.width),
                height: Math.ceil(rect.height)
              })
            )
              .toPNG()
              .toString('base64'),
          menuBounds!
        ),
        'base64'
      )
    )
    // Esc、取消与再次展开均保留来源，菜单不创建额外原生窗口。
    await hud.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    expect(await hud.evaluate(() => window.electronAPI.getSelectedSource())).toBeNull()
    await hud.getByRole('button', { name: '选择录制来源', exact: true }).click()
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: '取消', exact: true }).click()
    await expect(picker).toHaveCount(0)
    await hud.getByRole('button', { name: '选择录制来源', exact: true }).click()
    const selection = hud
    const targetWindow = await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.getBounds(),
      captureFixtureId
    )
    const targetSource = availableSources.find((source) => source.name.includes('窗口捕获验证'))!
    await app.evaluate(({ app }) => {
      // 在原生显示事件捕获短时动画，避免CDP等待关闭列表时错过高亮。
      app.on('browser-window-created', (_event, window) => {
        window.once('show', async () => {
          if (!decodeURIComponent(window.webContents.getURL()).includes('class="border-wrap"'))
            return
          try {
            const image = await window.webContents.capturePage()
            const size = image.getSize()
            const bitmap = image.toBitmap()
            const centerAlpha =
              bitmap[
                (Math.floor(size.height / 2) * size.width + Math.floor(size.width / 2)) * 4 + 3
              ]
            const animation = await window.webContents.executeJavaScript(
              `({name:getComputedStyle(document.querySelector('.border-wrap')).animationName})`
            )
            ;(globalThis as any).__presentationHighlight = {
              id: window.id,
              bounds: window.getBounds(),
              centerAlpha,
              animation,
              image: image.toPNG().toString('base64')
            }
          } catch (error) {
            ;(globalThis as any).__presentationHighlight = { error: String(error) }
          }
        })
      })
    })
    await selection.getByRole('button', { name: '窗口捕获验证', exact: true }).click()
    await expect
      .poll(async () => (await hud.evaluate(() => window.electronAPI.getSelectedSource()))?.id, {
        timeout: 20000
      })
      .toBe(targetSource.id)
    // 高亮仅显示流动边缘；透明中心、鼠标穿透和短时销毁均检查真实窗口。
    await expect
      .poll(() => app!.evaluate(() => !!(globalThis as any).__presentationHighlight))
      .toBe(true)
    const highlight = await app.evaluate(() => (globalThis as any).__presentationHighlight)
    expect(highlight.error).toBeUndefined()
    expect(highlight.centerAlpha).toBe(0)
    // Windows可见窗口框与Electron包含调整边框的矩形有少量差异。
    expect(Math.abs(highlight.bounds.width - targetWindow.width)).toBeLessThan(24)
    expect(Math.abs(highlight.bounds.height - targetWindow.height)).toBeLessThan(24)
    expect(highlight.animation.name).toContain('spin')
    await fs.writeFile(
      testInfo.outputPath('presentation-source-highlight.png'),
      Buffer.from(highlight.image, 'base64')
    )
    await expect
      .poll(() =>
        app!.evaluate((_, id) => !(globalThis as any).__testIdentityWindows.has(id), highlight.id)
      )
      .toBe(true)
    await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.hide(),
      captureFixtureId
    )
    const owner = await tool.evaluate(() => window.tabdo.getWebContentsId())
    const ownerWindowId = await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner).id,
      owner
    )
    expect(
      await app.evaluate(
        (_, id) => (globalThis as any).__presentationShownWindows.includes(id),
        ownerWindowId
      )
    ).toBe(false)
    await expect.poll(() => nativeHud.evaluate((window) => window.isVisible())).toBe(true)
    await expect(tool.locator('iframe')).toHaveCount(0)
    await expect
      .poll(() =>
        app!.evaluate(({ app }, owner) => {
          const window = process
            .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
            .default.getWindowByPluginWebContents(owner)
          return !!window && !window.isVisible()
        }, owner)
      )
      .toBe(true)
    expect(await tool.evaluate(() => window.tabdo.enableTemporaryResident(true))).toBe(false)
    await expect(hud.getByRole('button', { name: '最近项目' })).toHaveCount(0)
    await expect(hud.getByRole('button', { name: '项目', exact: true })).toHaveCount(0)
    await fs.writeFile(
      testInfo.outputPath('presentation-control.png'),
      Buffer.from(
        await nativeHud.evaluate(async (window) =>
          (await window.webContents.capturePage()).toPNG().toString('base64')
        ),
        'base64'
      )
    )
    // 不抑制主窗口失焦：从真实控制条进入编辑主页，再由主页返回录制。
    await hud.getByRole('button', { name: '演示编辑器', exact: true }).click()
    await expect(frame.getByRole('button', { name: '开始录制', exact: true })).toBeVisible({
      timeout: 60000
    })
    await expect(frame.getByText('演示编辑器', { exact: true })).toBeVisible()
    await expect(
      frame.getByLabel('项目导航').getByRole('button', { name: '项目', exact: true })
    ).toBeVisible()
    await expect(frame.getByText('最近 7 天', { exact: true })).toBeVisible()
    await expect(frame.getByText('反馈', { exact: true })).toHaveCount(0)
    await expect(frame.getByText('Sign in', { exact: true })).toHaveCount(0)
    await frame.getByRole('button', { name: '设置', exact: true }).click()
    await expect(frame.getByLabel('设置分类')).toBeVisible()
    await expect(frame.getByLabel('设置分类').getByText('高级', { exact: true })).toHaveCount(0)
    await expect(frame.getByLabel('设置分类').getByText('权限', { exact: true })).toHaveCount(0)
    await expect(
      frame.getByLabel('项目导航').getByText('基于 Recordly / OpenScreen', { exact: true })
    ).toHaveCount(0)
    await frame.getByLabel('设置分类').getByText('文件', { exact: true }).click()
    await expect(frame.getByText('所有项目及编辑改动始终自动保存。', { exact: true })).toHaveCount(
      0
    )
    await expect(frame.getByRole('button', { name: '更改目录', exact: true })).toBeVisible()
    await expect(frame.getByText(/Named projects save automatically/)).toHaveCount(0)
    await frame.getByLabel('设置分类').getByText('通用', { exact: true }).click()
    await expect(
      frame.getByRole('switch', { name: '自动为新录制应用变焦', exact: true })
    ).toBeChecked()
    await fs.writeFile(
      testInfo.outputPath('presentation-home.png'),
      Buffer.from(
        await app.evaluate(
          async ({ webContents }, url) =>
            (
              await webContents
                .getAllWebContents()
                .find((w) => w.getURL() === url)!
                .capturePage()
            )
              .toPNG()
              .toString('base64'),
          tool.url()
        ),
        'base64'
      )
    )
    const returnStarted = Date.now()
    await nativeHud.evaluate((window) =>
      window.on('show', () => {
        ;(window as any).__lastControlShow = Date.now()
      })
    )
    await frame.getByRole('button', { name: '开始录制', exact: true }).evaluate((button) =>
      button.addEventListener(
        'pointerdown',
        () => {
          ;(window.parent as any).__returnControlClick = Date.now()
        },
        { once: true }
      )
    )
    await frame.getByRole('button', { name: '开始录制', exact: true }).click()
    await expect.poll(() => nativeHud.evaluate((window) => window.isVisible())).toBe(true)
    logs.push('PERF editor-to-control-ms ' + (Date.now() - returnStarted))
    logs.push(
      'PERF input-to-control-visible-ms ' +
        ((await nativeHud.evaluate((window) => (window as any).__lastControlShow)) -
          (await tool.evaluate(() => (window as any).__returnControlClick)))
    )
    await expect(tool.locator('iframe')).toHaveCount(0)
    // 从实际控件关闭倒计时，同时更新当前控制条状态，不能只写入下次启动的偏好。
    await hud.getByRole('button', { name: '倒计时延迟', exact: true }).click()
    await hud.getByText('无延迟', { exact: true }).click()
    const source = await hud.evaluate(async () => {
      const sources = await window.electronAPI.getSources({
        types: ['screen'],
        thumbnailSize: { width: 320, height: 180 }
      })
      await window.electronAPI.selectSource(sources[0])
      return sources[0]
    })
    expect(source.id).toMatch(/^screen:/)
    await expect(hud.getByRole('button', { name: '选择录制来源', exact: true })).toContainText(
      source.name
    )
    // 再通过原版窗口来源录制实际应用，不能把窗口选择悄悄退化为整屏捕获。
    await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.show(),
      captureFixtureId
    )
    const applicationSource = availableSources.find((source) =>
      source.name.includes('窗口捕获验证')
    )!
    await hud.evaluate((source) => window.electronAPI.selectSource(source), applicationSource)
    await expect(hud.getByRole('button', { name: '选择录制来源', exact: true })).toContainText(
      '窗口捕获验证'
    )
    const recordStarted = Date.now()
    await hud.getByRole('button', { name: '启用系统音频', exact: true }).click()
    await hud.getByRole('button', { name: '启用麦克风', exact: true }).click()
    const micLabel = await hud.evaluate(
      async () =>
        (await navigator.mediaDevices.enumerateDevices()).find(
          (device) => device.kind === 'audioinput'
        )!.label
    )
    await hud.getByText(micLabel, { exact: true }).first().click()
    await hud.keyboard.press('Escape')
    await hud.getByRole('button', { name: '录制按键', exact: true }).click()
    await expect(hud.getByRole('button', { name: '录制按键', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await hud.getByRole('button', { name: '启用摄像头叠加', exact: true }).click()
    await hud.getByText('fake_device_0', { exact: true }).click()
    await hud.keyboard.press('Escape')
    await hud.evaluate(() => {
      ;(window as any).__recordBoundaries = []
      for (const action of ['start', 'pause', 'resume', 'stop'] as const) {
        const original = MediaRecorder.prototype[action]
        MediaRecorder.prototype[action] = function (...args) {
          ;(window as any).__nativeCaptureStartedAt = Date.now()
          const boundary = { action, time: performance.now(), mime: this.mimeType }
          ;(window as any).__recordBoundaries.push(boundary)
          console.log('CAPTURE_BOUNDARY ' + JSON.stringify(boundary))
          return original.apply(this, args)
        }
      }
    })
    await hud.getByRole('button', { name: '录制', exact: true }).evaluate((button) => {
      button.addEventListener(
        'pointerdown',
        () => {
          ;(window as any).__recordClick = Date.now()
        },
        { once: true }
      )
      const observer = new MutationObserver(() => {
        if (document.querySelector('button[aria-label="停止"]')) {
          ;(window as any).__recordReady = Date.now()
          observer.disconnect()
        }
      })
      observer.observe(document.body, { subtree: true, childList: true })
    })
    await hud.getByRole('button', { name: '录制', exact: true }).click()
    await expect(hud.getByRole('button', { name: '停止', exact: true })).toBeVisible({
      timeout: 30000
    })
    const nativeCaptureStartedAt =
      process.platform === 'win32'
        ? await hud.evaluate(() => (window as any).__recordReady)
        : await hud.evaluate(() => (window as any).__nativeCaptureStartedAt)
    logs.push('PERF recording-start-ms ' + (Date.now() - recordStarted))
    logs.push(
      'PERF input-to-recording-visible-ms ' +
        (await hud.evaluate(() => (window as any).__recordReady - (window as any).__recordClick))
    )
    await expect(hud.getByLabel('按键录制已开启', { exact: true })).toBeVisible()
    const clickPoints = await app.evaluate(({ BrowserWindow, screen }, id) => {
      const fixture = BrowserWindow.fromId(id)!
      fixture.show()
      fixture.focus()
      const bounds = fixture.getContentBounds()
      return [
        { x: bounds.x + 120, y: bounds.y + 130 },
        { x: bounds.x + 180, y: bounds.y + 155 },
        { x: bounds.x + 220, y: bounds.y + 175 }
      ].map((point) => screen.dipToScreenPoint(point))
    }, captureFixtureId)
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class PresentationInput { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e); [DllImport("user32.dll")] public static extern void keybd_event(byte k,byte scan,uint flags,UIntPtr extra); }\'; ' +
          clickPoints
            .map(
              (point) =>
                `[PresentationInput]::SetCursorPos(${point.x},${point.y}) | Out-Null; [PresentationInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [PresentationInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 700`
            )
            .join('; ') +
          '; [PresentationInput]::keybd_event(75,0,0,[UIntPtr]::Zero); [PresentationInput]::keybd_event(75,0,2,[UIntPtr]::Zero)'
      ],
      { windowsHide: true }
    )
    await expect(hud.getByRole('status', { name: '录制中' })).toContainText(/00:0[2-9]/, {
      timeout: 15000
    })
    await hud.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(hud.getByRole('button', { name: '恢复', exact: true })).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 800))
    await hud.getByRole('button', { name: '恢复', exact: true }).click()
    await new Promise((resolve) => setTimeout(resolve, 700))
    await hud.getByRole('button', { name: '停止', exact: true }).click()
    await expect
      .poll(
        async () =>
          (await tool.evaluate(async () => window.electronAPI.getCurrentVideoPath())).path || '',
        { timeout: 30000 }
      )
      .toMatch(/\.(mp4|webm)$/)
    await expect(frame.getByRole('button', { name: '导入项目', exact: true })).toBeVisible({
      timeout: 60000
    })
    await expect(frame.getByRole('button', { name: '保存项目', exact: true })).toHaveCount(0)
    await expect(
      frame.getByLabel('编辑工具').getByRole('button', { name: '设置', exact: true })
    ).toHaveCount(0)
    await expect(
      frame.locator('[data-timeline-row^="row-audio-"] [data-variant="audio"]')
    ).toHaveCount(2)
    await expect(frame.getByTestId('webcam-track')).toHaveCount(1)
    await expect(frame.locator('[data-variant="webcam"]')).toHaveCount(1)
    for (const action of ['start', 'pause', 'resume', 'stop']) {
      const boundaries = logs
        .filter((line) => line.includes('CAPTURE_BOUNDARY '))
        .map((line) => JSON.parse(line.split('CAPTURE_BOUNDARY ')[1]))
        .filter((boundary) => boundary.action === action)
      // Windows相机使用显式PTS的WebCodecs，画面/系统声音使用WGC/WASAPI，MediaRecorder只处理麦克风。
      expect(boundaries).toHaveLength(process.platform === 'win32' ? 0 : 4)
      if (boundaries.length)
        expect(
          Math.max(...boundaries.map((boundary) => boundary.time)) -
            Math.min(...boundaries.map((boundary) => boundary.time))
        ).toBeLessThan(1000 / 60)
    }
    const recorded = await tool.evaluate(async () => window.electronAPI.getCurrentVideoPath())
    const cursor = JSON.parse(await fs.readFile(recorded.path + '.cursor.json', 'utf8'))
    expect(cursor.samples.some((sample) => Boolean(sample.keyText))).toBe(true)
    await expect
      .poll(() =>
        frame
          .locator('[data-preview-frame]')
          .evaluate((element) => getComputedStyle(element).cursor)
      )
      .toBe('default')
    const nativeVideo = JSON.parse(
      execFileSync(
        ffprobe.path,
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', recorded.path],
        {
          encoding: 'utf8',
          windowsHide: true
        }
      )
    )
    const captureVideo = nativeVideo.streams.find((stream) => stream.codec_type === 'video')
    const captureDurationMs = Number(captureVideo.duration ?? nativeVideo.format.duration) * 1000
    const telemetryEndMs = cursor.samples[cursor.samples.length - 1].timeMs
    expect(Number.isFinite(nativeCaptureStartedAt)).toBe(true)
    expect(cursor.samples[0].timeMs).toBeLessThan(100)
    // 停止后的封装不应延长轨迹；窗口录制不使用整屏裁剪。
    expect(Math.abs(telemetryEndMs - captureDurationMs)).toBeLessThan(250)
    logs.push('PERF capture-cursor-duration-delta-ms ' + (telemetryEndMs - captureDurationMs))
    const session = await tool.evaluate(
      async () => (await window.electronAPI.getCurrentRecordingSession()).session
    )
    expect(session?.webcamPath).toMatch(
      process.platform === 'win32' ? /-webcam\.mp4$/ : /-webcam\.webm$/
    )
    const cameraProbe = JSON.parse(
      execFileSync(
        ffprobe.path,
        ['-v', 'error', '-show_format', '-of', 'json', session!.webcamPath!],
        { encoding: 'utf8', windowsHide: true }
      )
    )
    expect(
      Math.abs(
        Number(cameraProbe.format.duration) * 1000 +
          (session?.timeOffsetMs ?? 0) -
          captureDurationMs
      )
    ).toBeLessThan(1000 / 60)
    const companions = await tool.evaluate(
      async (videoPath) => window.electronAPI.getVideoAudioFallbackPaths(videoPath),
      recorded.path!
    )
    expect(companions.paths).toHaveLength(2)
    for (const audioPath of companions.paths!) {
      const probe = JSON.parse(
        execFileSync(ffprobe.path, ['-v', 'error', '-show_format', '-of', 'json', audioPath], {
          encoding: 'utf8',
          windowsHide: true
        })
      )
      expect(Math.abs(Number(probe.format.duration) * 1000 - captureDurationMs)).toBeLessThan(
        1000 / 60
      )
      logs.push(
        'PERF aligned-audio-duration-ms ' +
          path.basename(audioPath) +
          ' ' +
          Number(probe.format.duration) * 1000
      )
    }
    const videoFrames = JSON.parse(
      execFileSync(
        ffprobe.path,
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-count_frames',
          '-show_entries',
          'stream=nb_read_frames',
          '-of',
          'json',
          recorded.path!
        ],
        { encoding: 'utf8', windowsHide: true }
      )
    )
    expect(
      Number(videoFrames.streams[0].nb_read_frames) / (captureDurationMs / 1000)
    ).toBeGreaterThan(15)
    const rawFrames = execFileSync(
      ffmpeg!,
      [
        '-v',
        'error',
        '-i',
        recorded.path!,
        '-vf',
        'fps=2,scale=16:16',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-'
      ],
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    )
    const frameBytes = 16 * 16 * 3
    const frames = Array.from({ length: Math.floor(rawFrames.length / frameBytes) }, (_, index) =>
      rawFrames.subarray(index * frameBytes, (index + 1) * frameBytes)
    )
    expect(frames.length).toBeGreaterThan(3)
    expect(
      frames.every((pixels) => pixels.reduce((sum, value) => sum + value, 0) / frameBytes > 25)
    ).toBe(true)
    expect(new Set(frames.map((pixels) => pixels.toString('base64'))).size).toBeGreaterThan(3)

    expect(
      Math.abs(captureVideo.width / captureVideo.height - targetWindow.width / targetWindow.height)
    ).toBeLessThan(0.2)
    expect(
      cursor.samples.some((point) => ['click', 'double-click'].includes(point.interactionType))
    ).toBe(true)
    await expect(frame.locator('[data-timeline-item][data-variant="zoom"]')).not.toHaveCount(0, {
      timeout: 15000
    })
    if (recorded.path)
      await fs.copyFile(
        recorded.path,
        testInfo.outputPath('recording' + path.extname(recorded.path!))
      )
    logs.push(
      'MEDIA ' +
        JSON.stringify(
          await tool
            .frames()
            .find((f) => f.url().includes('presentation.html'))!
            .evaluate(() =>
              Array.from(document.querySelectorAll('video')).map((v) => ({
                src: v.src,
                duration: v.duration,
                state: v.readyState,
                error: v.error?.message
              }))
            )
        )
    )
    await expect
      .poll(
        () =>
          tool
            .frames()
            .find((f) => f.url().includes('presentation.html'))!
            .evaluate(() =>
              Math.max(
                0,
                ...Array.from(document.querySelectorAll('video')).map((v) =>
                  Number.isFinite(v.duration) ? v.duration : 0
                )
              )
            )
            .catch(() => 0),
        { timeout: 30000 }
      )
      .toBeGreaterThan(1)
    await expect(frame.locator('.editor-preview-frame canvas').first()).toBeVisible({
      timeout: 30000
    })
    const editorFrame = tool.frames().find((f) => f.url().includes('presentation.html'))!
    await editorFrame.evaluate(async () => {
      const url =
        location.origin +
        '/presentation/src/components/video-editor/videoPlayback/cursorRenderer.ts'
      const { PixiCursorOverlay } = await import(url)
      const original = PixiCursorOverlay.prototype.update
      ;(window as any).__cursorFrameSamples = []
      const video = document.querySelector<HTMLVideoElement>('[data-presentation-source-video]')!
      let presentedMs = 0
      const readFrame = (_now: number, metadata: VideoFrameCallbackMetadata): void => {
        presentedMs = metadata.mediaTime * 1000
        video.requestVideoFrameCallback(readFrame)
      }
      video.requestVideoFrameCallback(readFrame)
      PixiCursorOverlay.prototype.update = function (...args) {
        original.apply(this, args)
        if (!video.paused) {
          ;(window as any).__cursorFrameSamples.push({
            timeMs: args[1],
            presentedMs,
            snapshot: this.getSmoothedCursorSnapshot()
          })
        }
      }
    })
    const play = frame.getByRole('button', { name: '播放', exact: true })
    await play.click()
    await expect
      .poll(() => editorFrame.evaluate(() => (window as any).__cursorFrameSamples.length))
      .toBeGreaterThan(15)
    await frame.getByRole('button', { name: '暂停', exact: true }).click()
    // Wait for the final camera corrective seek, then verify rendering really stays idle.
    await expect
      .poll(() =>
        editorFrame.evaluate(() =>
          [
            ...document.querySelectorAll<HTMLVideoElement>(
              'video[data-presentation-source-video], [data-webcam-overlay] video'
            )
          ]
            .filter((video) => !video.paused || video.seeking)
            .map((video) => ({
              src: video.src.split('path=')[1],
              paused: video.paused,
              seeking: video.seeking,
              time: video.currentTime
            }))
        )
      )
      .toEqual([])
    const synchronization = await editorFrame.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      const before = (window as any).__presentationGpuDraws
      await new Promise((resolve) => setTimeout(resolve, 250))
      return {
        before,
        after: (window as any).__presentationGpuDraws,
        frames: (window as any).__cursorFrameSamples
      }
    })
    expect(synchronization.before).toBeGreaterThan(0)
    expect(synchronization.after).toBe(synchronization.before)
    expect(synchronization.frames.some((sample) => sample.snapshot)).toBe(true)
    const maximumFrameOffsetMs = Math.max(
      ...synchronization.frames.map((sample) => Math.abs(sample.timeMs - sample.presentedMs))
    )
    await fs.writeFile(
      testInfo.outputPath('presentation-frame-timing.json'),
      JSON.stringify(synchronization, null, 2)
    )
    expect(maximumFrameOffsetMs).toBeLessThan(40)
    logs.push(
      'PERF presented-frame-offset-ms ' +
        maximumFrameOffsetMs +
        ' paused-gpu-draws ' +
        (synchronization.after - synchronization.before)
    )
    // 无手动保存动作，等待未命名录制项目自动落盘。
    await expect
      .poll(() =>
        tool.evaluate(async () => {
          const files = await window.electronAPI.listProjectFiles()
          return files.entries?.length || 0
        })
      )
      .toBeGreaterThan(0)
    const projectPath = await tool.evaluate(
      async () => (await window.electronAPI.listProjectFiles()).entries[0].path
    )
    const saved = JSON.parse(await fs.readFile(projectPath, 'utf8'))
    expect(saved.videoPath).toMatch(/\.(mp4|webm)$/)
    expect((await fs.stat(saved.videoPath)).size).toBeGreaterThan(1000)
    expect(saved.editor).toBeTruthy()
    expect(saved.editor.zoomRegions.every((region) => region.depth === 2)).toBe(true)
    // 展开默认收起的变焦通用设置，再由自动保存链持久化运动效果。
    await frame.locator('[data-timeline-item][data-variant="zoom"]').first().click()
    await frame.getByRole('button', { name: '变焦通用设置', exact: true }).click()
    await frame.getByLabel('运动效果', { exact: true }).getByText('专注', { exact: true }).click()
    await frame.getByLabel('运动效果', { exact: true }).getByText('平滑', { exact: true }).click()
    await expect(
      frame.getByLabel('运动效果', { exact: true }).locator('[data-selected]')
    ).toHaveText('平滑')
    await expect
      .poll(async () => JSON.parse(await fs.readFile(projectPath, 'utf8')).editor.zoomInDurationMs)
      .toBe(1522.575)
    // 原生对话框只替换路径选择；保存和编码仍执行真实实现。
    const exportPath = path.join(temporary, '演示导出.mp4')
    await app.evaluate(
      ({ dialog }, { projectPath, exportPath }) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectPath] })
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath })
      },
      { projectPath, exportPath }
    )
    await frame.getByRole('button', { name: '导入项目', exact: true }).click()
    await expect(frame.getByRole('button', { name: '导入项目', exact: true })).toBeVisible()
    await expect
      .poll(() => tool.evaluate(async () => window.electronAPI.getCurrentVideoPath()))
      .toEqual(recorded)
    await frame.getByRole('button', { name: '导出', exact: true }).click()
    await expect(frame.getByRole('button', { name: '导出视频', exact: true })).toBeVisible()
    await frame.getByRole('button', { name: '导出视频', exact: true }).click()
    await expect
      .poll(
        async () => {
          const failed = logs.find((line) => line.includes('PAGE CONSOLE Export error:'))
          if (failed) throw new Error(failed)
          return (await fs.stat(exportPath).catch(() => ({ size: 0 }))).size
        },
        {
          timeout: 120000
        }
      )
      .toBeGreaterThan(1000)
    const exported = JSON.parse(
      execFileSync(
        ffprobe.path,
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', exportPath],
        { encoding: 'utf8', windowsHide: true }
      )
    )
    expect(exported.streams.some((stream) => stream.codec_type === 'video')).toBe(true)
    expect(Number(exported.format.duration)).toBeGreaterThan(1)
    await fs.copyFile(exportPath, testInfo.outputPath('exported.mp4'))
    await fs.writeFile(
      testInfo.outputPath('presentation-editor.png'),
      Buffer.from(
        await app.evaluate(
          async ({ webContents }, url) =>
            (
              await webContents
                .getAllWebContents()
                .find((w) => w.getURL() === url)!
                .capturePage()
            )
              .toPNG()
              .toString('base64'),
          tool.url()
        ),
        'base64'
      )
    )
    const mediaUrl = (
      await tool.evaluate(
        async (file) => window.electronAPI.getLocalMediaUrl(file),
        saved.videoPath
      )
    ).url
    expect((await fetch(mediaUrl, { method: 'HEAD' })).ok).toBe(true)
    // 文件匹配进入新会话，上一会话端口随其退出释放，原始项目保留。
    await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner)
          .close(),
      owner
    )
    await expect.poll(() => tool.isClosed(), { timeout: 15000 }).toBe(true)
    await main.evaluate(
      ({ plugin, projectPath }) =>
        window.tabdo.launch({
          path: plugin!.path,
          type: 'plugin',
          featureCode: 'presentation-editor',
          param: {
            type: 'files',
            payload: [{ path: projectPath, name: '演示项目.recordly', isDirectory: false }]
          }
        }),
      { plugin, projectPath }
    )
    await expect.poll(() => tool.isClosed(), { timeout: 15000 }).toBe(true)
    await expect
      .poll(
        async () =>
          fetch(mediaUrl, { method: 'HEAD' }).then(
            () => false,
            () => true
          ),
        { timeout: 10000 }
      )
      .toBe(true)
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((p) => p.url().startsWith('http://127.0.0.1:15178') && !p.isClosed()),
        { timeout: 30000 }
      )
      .toBe(true)
    const reopened = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178') && !p.isClosed())!
    const imported = reopened.frameLocator('iframe')
    await expect(imported.getByRole('button', { name: '导入项目', exact: true })).toBeVisible({
      timeout: 30000
    })
    await expect
      .poll(() => reopened.evaluate(async () => window.electronAPI.getCurrentVideoPath()))
      .toEqual(recorded)
    expect(await reopened.evaluate(async () => window.electronAPI.getShortcuts())).toEqual({})
    // 主界面主题会更新嵌入编辑器；光标解释在实际设置内可见。
    await reopened.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
      document.documentElement.classList.add('dark')
    })
    await expect(imported.locator('html')).toHaveAttribute('data-theme', 'dark')
    await imported.getByLabel('光标', { exact: true }).click()
    await expect(imported.getByRole('slider', { name: '光标大小', exact: true })).toBeVisible()
    await imported.getByRole('button', { name: '高级设置', exact: true }).click()
    await expect(imported.getByLabel('高级设置', { exact: true })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    await expect(
      imported.getByText('循环播放时让光标轨迹首尾衔接，不影响系统鼠标。', { exact: true })
    ).toBeVisible()
    await reopened.evaluate(() => {
      document.documentElement.dataset.theme = 'light'
      document.documentElement.classList.remove('dark')
    })
    await expect(imported.locator('html')).toHaveAttribute('data-theme', 'light')
    // 从宿主配置启用一个动作，真实键盘输入可以控制播放，默认配置仍为空。
    await reopened.evaluate(async () =>
      window.tabdo.internal.dbPut('presentation-shortcuts', {
        playPause: { key: 'p', ctrl: true, shift: true, alt: false }
      })
    )
    await expect
      .poll(() => reopened.evaluate(async () => window.electronAPI.getShortcuts()))
      .toEqual({ playPause: { key: 'p', ctrl: true, shift: true, alt: false } })
    await imported.locator('.editor-preview-frame canvas').first().click()
    await expect
      .poll(
        async () => {
          await imported.locator('body').press('Control+Shift+p')
          return reopened
            .frames()
            .find((f) => f.url().includes('presentation.html'))!
            .evaluate(() => Array.from(document.querySelectorAll('video')).some((v) => !v.paused))
        },
        { timeout: 5000 }
      )
      .toBe(true)
    await imported.locator('body').press('Control+Shift+p')
    // 临时常驻默认关闭，隐藏可保留；用户取消时立即回收当前独立会话。
    const reopenedOwner = await reopened.evaluate(() => window.tabdo.getWebContentsId())
    const detachedId = await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner)?.id,
      reopenedOwner
    )
    let titlebar
    await expect
      .poll(async () => {
        for (const page of app!.context().pages())
          if (
            page.url().includes('detached-titlebar.html') &&
            (await (await app!.browserWindow(page)).evaluate((win) => win.id)) === detachedId
          )
            titlebar = page
        return !!titlebar
      })
      .toBe(true)
    await expect(titlebar!.getByRole('button', { name: '临时常驻', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await titlebar!.getByRole('button', { name: '临时常驻', exact: true }).click()
    await expect(titlebar!.getByRole('button', { name: '临时常驻', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner)
          .hide(),
      reopenedOwner
    )
    expect(reopened.isClosed()).toBe(false)
    await app.evaluate(
      ({ app }, owner) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(owner)
          .show(),
      reopenedOwner
    )
    await titlebar!.getByRole('button', { name: '临时常驻', exact: true }).click()
    await expect.poll(() => reopened.isClosed(), { timeout: 15000 }).toBe(true)
    expect(JSON.parse(await fs.readFile(projectPath, 'utf8')).videoPath).toEqual(saved.videoPath)
    // 空闲控制条同样遵守默认退出规则，不能把可见辅助窗口误当作永久后台常驻。
    for (const exit of ['close', 'minimize'] as const) {
      await main.evaluate(
        (plugin) =>
          window.tabdo.launch({
            path: plugin!.path,
            type: 'plugin',
            featureCode: 'presentation-recorder'
          }),
        plugin
      )
      await expect
        .poll(
          () =>
            app!
              .context()
              .pages()
              .some((page) => page.url().includes('windowType=hud-overlay') && !page.isClosed()),
          { timeout: 30000 }
        )
        .toBe(true)
      const idleHud = app
        .context()
        .pages()
        .find((page) => page.url().includes('windowType=hud-overlay') && !page.isClosed())!
      await expect(idleHud.getByRole('button', { name: '录制', exact: true })).toBeVisible({
        timeout: 30000
      })
      const idleTool = app
        .context()
        .pages()
        .find((page) => page.url().startsWith('http://127.0.0.1:15178') && !page.isClosed())!
      const idleMedia = (
        await idleTool.evaluate(
          async (file) => window.electronAPI.getLocalMediaUrl(file),
          saved.videoPath
        )
      ).url
      if (exit === 'close')
        await idleHud.getByRole('button', { name: '关闭应用', exact: true }).click()
      else await (await app.browserWindow(idleHud)).evaluate((window) => window.minimize())
      await expect.poll(() => idleTool.isClosed(), { timeout: 15000 }).toBe(true)
      await expect.poll(() => idleHud.isClosed()).toBe(true)
      await expect
        .poll(
          async () =>
            fetch(idleMedia, { method: 'HEAD' }).then(
              () => false,
              () => true
            ),
          { timeout: 10000 }
        )
        .toBe(true)
    }
    expect(logs.some((line) => line.includes('PAGE ERROR') || line.includes('HUD ERROR'))).toBe(
      false
    )
  } finally {
    const live = app
      ?.context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178') && !p.isClosed())
    if (live)
      await fs
        .writeFile(
          testInfo.outputPath('presentation-last.png'),
          Buffer.from(
            await app!.evaluate(
              async ({ webContents }, url) =>
                (
                  await webContents
                    .getAllWebContents()
                    .find((w) => w.getURL() === url)!
                    .capturePage()
                )
                  .toPNG()
                  .toString('base64'),
              live.url()
            ),
            'base64'
          )
        )
        .catch(() => {})
    await fs.writeFile(testInfo.outputPath('presentation.log'), logs.join(''))
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
