import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

test('演示真实视频解码队列满时可反复退出且不留下解码器', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(root, '.local/source-preview-runtime-'))
  let app: ElectronApplication | undefined
  try {
    const sample = path.join(temporary, 'decoder.mp4')
    execFileSync(
      ffmpeg!,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=128x72:rate=60',
        '-t',
        '4',
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
    await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 30000 })
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((page) => page.url().startsWith('http://127.0.0.1:15177')),
        { timeout: 30000 }
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('超级面板', { exact: true }).first()).toBeVisible({
      timeout: 30000
    })
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
    await expect(hud.getByRole('button', { name: '录制', exact: true })).toBeVisible({
      timeout: 30000
    })
    const observations = await hud.evaluate(async (file) => {
      // 经正式项目入口登记用户选择的素材，再使用受限媒体服务读取。
      await window.electronAPI.setCurrentVideoPath(file)
      const { ForwardFrameSource } = await import(
        '/presentation/src/lib/exporter/forwardFrameSource.ts' as string
      )
      const values: Array<{ frames: number; shutdownMs: number; state: string }> = []
      for (let attempt = 0; attempt < 5; attempt++) {
        const source = new ForwardFrameSource()
        try {
          await source.initialize(file)
          const deadline = performance.now() + 10000
          // 等待真实WebCodecs输出填满队列，确保确实经过生产者背压边界。
          while (source.pendingFrames.length <= 32 && performance.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          const frames = source.pendingFrames.length
          if (frames <= 32) throw new Error(`Decoder queue did not fill: ${frames}`)
          const decoder = source.decoder
          const started = performance.now()
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              source.destroy(),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Decoder shutdown blocked')), 3000)
              })
            ])
          } finally {
            clearTimeout(timer)
          }
          values.push({ frames, shutdownMs: performance.now() - started, state: decoder.state })
          if (source.pendingFrames.length || source.decoder || source.demuxer)
            throw new Error('Decoder resources remained after retirement')
          if ((await source.getFrameAtTime(0)) !== null) throw new Error('Cancelled source revived')
        } finally {
          await source.destroy()
        }
      }
      const { FrameRenderer: Legacy } = await import(
        '/presentation/src/lib/exporter/frameRenderer.ts' as string
      )
      const { FrameRenderer: Modern } = await import(
        '/presentation/src/lib/exporter/modernFrameRenderer.ts' as string
      )
      for (const Renderer of [Legacy, Modern]) {
        for (const kind of ['camera', 'background']) {
          const original = window.electronAPI.getLocalMediaUrl
          let resume!: () => void
          const gate = new Promise<void>((resolve) => {
            resume = resolve
          })
          window.electronAPI.getLocalMediaUrl = async (path) => {
            await gate
            return original(path)
          }
          const renderer = new Renderer({
            width: 128,
            height: 72,
            videoWidth: 128,
            videoHeight: 72,
            webcam: { enabled: true },
            webcamUrl: file
          })
          try {
            renderer.resolveWallpaperForExport = async () => file
            const preparing = (
              kind === 'camera' ? renderer.setupWebcamSource() : renderer.setupBackground()
            ).then(
              () => 'revived',
              (error) => error.name
            )
            await Promise.resolve()
            renderer.destroy()
            resume()
            if ((await preparing) !== 'AbortError')
              throw new Error('Camera preparation revived after renderer retirement')
            if (
              renderer.webcamForwardFrameSource ||
              renderer.webcamVideoElement ||
              renderer.backgroundForwardFrameSource ||
              renderer.backgroundVideoElement ||
              renderer.backgroundSprite
            )
              throw new Error('Retired renderer retained camera media')
          } finally {
            resume()
            window.electronAPI.getLocalMediaUrl = original
            renderer.destroy()
          }
        }
      }
      return values
    }, sample)
    expect(observations).toHaveLength(5)
    expect(observations.every((value) => value.frames > 32 && value.state === 'closed')).toBe(true)
    await testInfo.attach('decoder-retirement.json', {
      body: Buffer.from(JSON.stringify(observations, null, 2)),
      contentType: 'application/json'
    })
  } finally {
    await app?.close().catch(() => undefined)
  }
  // 仅回收本用例已成功消费的隔离资料与可重建样片。
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
})
