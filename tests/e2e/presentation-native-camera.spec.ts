import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffprobe from 'ffprobe-static'

test('真实摄像头提供SystemRelativeTime，取消不遗留素材且正式采集首尾同帧', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows MediaFrameReader实际设备专项')
  test.setTimeout(120000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-native-camera-'))
  let app: ElectronApplication | undefined
  try {
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
    await expect
      .poll(() =>
        app!
          .context()
          .pages()
          .some((p) => p.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('超级面板', { exact: true }).first()).toBeVisible()
    await main.evaluate(async () => {
      const plugin = (await window.tabdo.getAllPlugins()).find((p) => p.name === 'system')!
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
            .some((p) => p.url().includes('windowType=hud-overlay')),
        { timeout: 30000 }
      )
      .toBe(true)
    const hud = app
      .context()
      .pages()
      .find((p) => p.url().includes('windowType=hud-overlay'))!
    await expect(hud.getByRole('button', { name: '录制', exact: true })).toBeVisible({
      timeout: 30000
    })
    const devices = await hud.evaluate(async () =>
      (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ label: d.label }))
    )
    test.skip(devices.length === 0, '此机器没有可用摄像头；保留硬件验收边界')
    const result = await hud.evaluate(async (label) => {
      const source = (
        await window.electronAPI.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1, height: 1 }
        })
      )[0]
      await window.electronAPI.selectSource(source)
      const started = performance.now()
      const prepared = await window.electronAPI.startNativeScreenRecording(source, {
        capturesSystemAudio: false,
        capturesMicrophone: false,
        capturesWebcam: true,
        webcamLabel: label,
        deferStart: true
      })
      return { prepared, elapsedMs: performance.now() - started }
    }, devices[0].label)
    expect(
      result.prepared.success,
      JSON.stringify(await hud.evaluate(() => window.electronAPI.getLastNativeCaptureDiagnostics()))
    ).toBe(true)
    expect(
      (await hud.evaluate(() => window.electronAPI.getCurrentRecordingSession())).session
    ).toBeFalsy()
    expect((await hud.evaluate(() => window.electronAPI.stopNativeScreenRecording())).success).toBe(
      true
    )
    const recordings = path.join(temporary, 'data/presentation-recorder/recordings')
    expect(await fs.readdir(recordings).catch(() => [])).toEqual([])
    // Keep physical-device media only in the isolated temporary directory; archive numerical evidence, never face frames.
    const captured = await hud.evaluate(async (label) => {
      const source = await window.electronAPI.getSelectedSource()
      const ready = await window.electronAPI.startNativeScreenRecording(source!, {
        capturesSystemAudio: false,
        capturesMicrophone: false,
        capturesWebcam: true,
        webcamLabel: label,
        deferStart: true
      })
      if (!ready.success) throw new Error(JSON.stringify(ready))
      const start = performance.timeOrigin + performance.now() + 40
      const committed = await window.electronAPI.commitNativeScreenRecording(start)
      if (!committed.success) throw new Error(JSON.stringify(committed))
      await new Promise((resolve) => setTimeout(resolve, 700))
      return window.electronAPI.stopNativeScreenRecording(
        performance.timeOrigin + performance.now() + 40
      )
    }, devices[0].label)
    expect(captured.success, JSON.stringify(captured)).toBe(true)
    expect(captured.webcamPath).toBeTruthy()
    const durations = [captured.path!, captured.webcamPath!].map((file) =>
      Number(
        JSON.parse(
          execFileSync(ffprobe.path, ['-v', 'error', '-show_format', '-of', 'json', file], {
            encoding: 'utf8',
            windowsHide: true
          })
        ).format.duration
      )
    )
    expect(durations[0]).toBeGreaterThan(0.6)
    expect(Math.abs(durations[0] - durations[1])).toBeLessThan(1 / 60)
    console.log(
      'NATIVE_CAMERA_PREPARE ' +
        JSON.stringify({
          elapsedMs: result.elapsedMs,
          frameClockAvailable: true,
          cancelledFiles: 0,
          durations
        })
    )
    await testInfo.attach('native-camera-prepare.json', {
      body: Buffer.from(
        JSON.stringify({
          elapsedMs: result.elapsedMs,
          frameClockAvailable: true,
          cancelledFiles: 0,
          durations
        })
      ),
      contentType: 'application/json'
    })
  } finally {
    await app?.close().catch(() => undefined)
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
})
