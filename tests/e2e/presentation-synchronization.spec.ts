import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import { findDiagnosticTone } from '../fixtures/diagnostic-tone'

/**
 * Decode the sixteen-bit frame timecode at the center of a captured video.
 * @param file Actual saved recording, never a mocked duration or frame.
 * @param seconds Position on the common recording timeline.
 * @returns Source capture clock expressed in sixty-Hertz ticks.
 */
function readTimecode(file: string, seconds: number): number {
  const bytes = execFileSync(
    ffmpeg!,
    [
      '-v',
      'error',
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `fps=60,trim=start_frame=${Math.floor(seconds * 60)}:end_frame=${Math.floor(seconds * 60) + 1},scale=160:90`,
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      '-'
    ],
    { windowsHide: true }
  )
  let value = 0
  for (let bit = 0; bit < 16; bit++) {
    const index = (45 * 160 + bit * 10 + 5) * 3
    if (bytes[index] > 128) value |= 1 << bit
  }
  return value
}

/**
 * Locate a real tone pulse near an expected sample position.
 * @param file Saved system or selected microphone companion.
 * @param expectedMs Scheduled pulse on the common clock.
 * @returns 专用短音的实际PCM起点，单位毫秒，不把背景非静音作为匹配。
 * @throws {Error} 缺少背景声阳性对照或没有可靠短音匹配时抛出。
 */
function readPulse(file: string, expectedMs: number): number {
  const pcm = execFileSync(
    ffmpeg!,
    ['-v', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
    { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
  )
  const first = Math.max(0, Math.floor((expectedMs - 150) * 48))
  const last = Math.min(pcm.length / 4, Math.ceil((expectedMs + 150) * 48))
  const samples = new Float32Array(
    pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)
  )
  const background = samples.slice(first, Math.min(first + 480, samples.length))
  const backgroundRms = Math.sqrt(
    background.reduce((sum, value) => sum + value * value, 0) / background.length
  )
  if (!(backgroundRms > 0.003))
    throw new Error('Missing captured background-audio positive control')
  const match = findDiagnosticTone(samples, 48000, first, last)
  if (match) {
    console.log(
      'CAPTURE_PULSE_MATCH ' +
        JSON.stringify({
          expectedMs,
          actualMs: match.sample / 48,
          correlation: match.correlation,
          backgroundRms
        })
    )
    return match.sample / 48
  }
  throw new Error('No positive audio pulse found near ' + expectedMs + ' in ' + path.basename(file))
}

/**
 * Read or explicitly restore the test's Windows output mute state, without changing volume.
 * @param root Source workspace.
 * @param action Read-only query or an authorized mute transition.
 * @returns Actual mute state and unchanged scalar volume.
 */
function audioState(
  root: string,
  action: 'read' | 'mute' | 'unmute'
): { muted: boolean; volume: number } {
  return JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'tests/fixtures/windows-audio-state.ps1'),
        action
      ],
      { encoding: 'utf8', windowsHide: true }
    )
  )
}

/**
 * Play an owned pulse and observe its real PCM capture time through an independent WASAPI client.
 * @param root Source workspace containing the compiled capture helper.
 * @returns 独立WASAPI客户端中匹配到的专用短音起点，单位epoch毫秒。
 */
function referencePulse(root: string): number {
  const output = execFileSync(
    path.join(root, 'resources/presentation/native/bin/win32-x64/wgc-capture.exe'),
    ['--test-tone'],
    { encoding: 'utf8', windowsHide: true, env: { ...process.env, TABDO_E2E: '1' } }
  )
  return JSON.parse(output).firstSampleEpochMs
}

test('共同捕获时钟对齐实际屏幕/相机时间码、双音频脉冲及键鼠，暂停恢复不漂移', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows共同采集时钟专项')
  test.setTimeout(240000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-capture-clock-'))
  const anchor = Date.now() - 1000
  let app: ElectronApplication | undefined
  let recordedFiles: string[] = []
  let restoreMute = false
  const logs: string[] = []
  try {
    const initialAudio = audioState(root, 'read')
    if (process.env.TABDO_E2E_TEMP_UNMUTE === '1') {
      restoreMute = process.env.TABDO_E2E_RESTORE_AUDIO_MUTE === '1' || initialAudio.muted
      if (initialAudio.muted) audioState(root, 'unmute')
    }
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
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    // 初始化错误必须从覆盖层创建时开始记录，不能等控制条正文已出现后再监听。
    app.context().on('page', (page) => {
      page.on('pageerror', (error) => logs.push(`PAGE ERROR ${page.url()} ${error.stack}`))
      page.on('crash', () => logs.push(`PAGE CRASH ${page.url()}`))
      page.on('requestfailed', (request) =>
        logs.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`)
      )
      page.on('console', (event) => {
        if (event.type() === 'error') logs.push(`CONSOLE ${page.url()} ${event.text()}`)
      })
    })
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 30000 })
    await expect
      .poll(
        () =>
          app!
            .context()
            .pages()
            .some((p) => p.url().startsWith('http://127.0.0.1:15177')),
        { timeout: 30000 }
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('超级面板', { exact: true }).first()).toBeVisible({
      timeout: 30000
    })
    await app.evaluate(({ ipcMain }) => {
      ;(globalThis as any).__captureBoundaries = []
      const original = ipcMain.handle.bind(ipcMain)
      ipcMain.handle = (channel, listener): void => {
        original(channel, (...args) => {
          if (
            [
              'commit-native-screen-recording',
              'pause-native-screen-recording',
              'resume-native-screen-recording',
              'stop-native-screen-recording'
            ].some((suffix) => channel.endsWith(suffix))
          ) {
            ;(globalThis as any).__captureBoundaries.push({
              method: channel.split(':').at(-1),
              epochMs: args[1]
            })
          }
          return listener(...args)
        })
      }
    })
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
    await app.evaluate(({ webContents }) => {
      for (const page of webContents.getAllWebContents())
        if (page.getURL().includes('windowType=hud-overlay')) page.setBackgroundThrottling(false)
    })
    await expect(hud.getByRole('button', { name: '录制', exact: true })).toBeVisible({
      timeout: 30000
    })
    hud.on('console', (event) => logs.push('HUD ' + event.text()))
    hud.on('pageerror', (error) => logs.push('HUD ERROR ' + error.stack))
    // Only sensor sources are substituted. Native encoders, WGC, WASAPI and timeline placement remain real.
    const fixtureId = await app.evaluate(async ({ BrowserWindow }, anchor) => {
      const fixture = new BrowserWindow({
        title: '共同采集时间码',
        width: 640,
        height: 360,
        frame: false,
        show: false,
        webPreferences: {
          sandbox: true,
          backgroundThrottling: false,
          autoplayPolicy: 'no-user-gesture-required'
        }
      })
      await fixture.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            `<title>共同采集时间码</title><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh}</style><canvas width="640" height="360"></canvas><script>const anchor=${anchor};const c=document.querySelector('canvas').getContext('2d');function draw(){const code=Math.floor((performance.timeOrigin+performance.now()-anchor)*60/1000);for(let bit=0;bit<16;bit++){c.fillStyle=(code&(1<<bit))?'#fff':'#000';c.fillRect(bit*40,0,40,360)}requestAnimationFrame(draw)}draw();const audio=new AudioContext();const oscillator=audio.createOscillator();const gain=audio.createGain();oscillator.frequency.value=440;gain.gain.value=0.05;oscillator.connect(gain).connect(audio.destination);oscillator.start();addEventListener('pagehide',()=>{oscillator.stop();audio.close()},{once:true});</script>`
          )
      )
      fixture.show()
      fixture.webContents.setAudioMuted(false)
      // 故意保留非静音背景，旧阈值算法会误判；只让本夹具持有声音源。
      await fixture.webContents.executeJavaScript('audio.resume()', true)
      return fixture.id
    }, anchor)
    const source = await hud.evaluate(
      async () =>
        (
          await window.electronAPI.getSources({
            types: ['window'],
            thumbnailSize: { width: 1, height: 1 }
          })
        ).find((source) => source.name.includes('共同采集时间码'))!
    )
    expect(source).toBeTruthy()
    await hud.evaluate((source) => window.electronAPI.selectSource(source), source)
    // Substitute only device sources: camera uses real WGC reference pixels in an independent native encoder; two real WASAPI clients capture the same pulse.
    await hud.evaluate(() => {
      navigator.mediaDevices.enumerateDevices = async (): Promise<MediaDeviceInfo[]> => [
        {
          kind: 'videoinput',
          deviceId: 'sync-video',
          groupId: 'sync-reference',
          label: '同步参考视频',
          toJSON: () => ({})
        },
        {
          kind: 'audioinput',
          deviceId: 'sync-audio',
          groupId: 'sync-reference',
          label: '同步参考音频',
          toJSON: () => ({})
        }
      ]
    })
    await hud.getByRole('button', { name: '倒计时延迟', exact: true }).click()
    await hud.getByText('无延迟', { exact: true }).click()
    await hud.getByRole('button', { name: '启用系统音频', exact: true }).click()
    await hud.getByRole('button', { name: '启用麦克风', exact: true }).click()
    const mic = await hud.evaluate(
      async () =>
        (await navigator.mediaDevices.enumerateDevices()).find(
          (device) => device.kind === 'audioinput'
        )!.label
    )
    await hud.getByText(mic, { exact: true }).first().click()
    await hud.keyboard.press('Escape')
    await hud.getByRole('button', { name: '启用摄像头叠加', exact: true }).click()
    await hud.getByText('同步参考视频', { exact: true }).click()
    await hud.keyboard.press('Escape')
    await hud.getByRole('button', { name: '录制按键', exact: true }).click()
    await hud.evaluate(() => {
      document.addEventListener(
        'click',
        (event) => {
          if ((event.target as Element).closest('button[aria-label="录制"]'))
            (window as any).__captureClick = performance.timeOrigin + performance.now()
        },
        { capture: true, once: true }
      )
      const observer = new MutationObserver(() => {
        if (document.querySelector('button[aria-label="停止"]')) {
          ;(window as any).__captureUiReady = performance.timeOrigin + performance.now()
          observer.disconnect()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    })
    await hud.getByRole('button', { name: '录制', exact: true }).click()
    await expect(hud.getByRole('button', { name: '停止', exact: true })).toBeVisible({
      timeout: 15000
    })
    const uiTiming = await hud.evaluate(() => ({
      clicked: (window as any).__captureClick as number,
      ready: (window as any).__captureUiReady as number
    }))
    const startupMs = uiTiming.ready - uiTiming.clicked
    const start = await app.evaluate(
      () =>
        (globalThis as any).__captureBoundaries.find((b) =>
          b.method.endsWith('commit-native-screen-recording')
        ).epochMs as number
    )
    console.log(
      'CAPTURE_CLOCK_OBSERVATIONS ' +
        JSON.stringify({
          node: await app.evaluate(() => ({
            epoch: performance.timeOrigin + performance.now(),
            date: Date.now(),
            qpc: Number(process.hrtime.bigint()) / 1e6
          })),
          renderer: await hud.evaluate(() => ({
            epoch: performance.timeOrigin + performance.now(),
            date: Date.now()
          })),
          diagnostics: await hud.evaluate(() =>
            window.electronAPI.getLastNativeCaptureDiagnostics()
          )
        })
    )
    const firstPulse = referencePulse(root)
    // Real OS input follows the same timestamp origin used by physical recording.
    const point = await app.evaluate(({ BrowserWindow, screen }, id) => {
      const fixture = BrowserWindow.fromId(id)!
      fixture.focus()
      const b = fixture.getContentBounds()
      return screen.dipToScreenPoint({ x: b.x + 120, y: b.y + 150 })
    }, fixtureId)
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public class SyncInput{[DllImport("user32.dll")]public static extern bool SetPhysicalCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}\';' +
          `[SyncInput]::SetPhysicalCursorPos(${point.x},${point.y})|Out-Null;[SyncInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[SyncInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero);[SyncInput]::keybd_event(75,0,0,[UIntPtr]::Zero);[SyncInput]::keybd_event(75,0,2,[UIntPtr]::Zero)`
      ],
      { windowsHide: true }
    )
    await hud.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(hud.getByRole('button', { name: '恢复', exact: true })).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 450))
    await hud.getByRole('button', { name: '恢复', exact: true }).click()
    await expect(hud.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    const secondPulse = referencePulse(root)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const boundaries = await app.evaluate(
      () => (globalThis as any).__captureBoundaries as { method: string; epochMs: number }[]
    )
    const pause = boundaries.find((b) =>
      b.method.endsWith('pause-native-screen-recording')
    )!.epochMs
    const resume = boundaries.find((b) =>
      b.method.endsWith('resume-native-screen-recording')
    )!.epochMs
    await hud.getByRole('button', { name: '停止', exact: true }).click()
    const tool = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
    await expect
      .poll(
        () =>
          tool.evaluate(
            async () => (await window.electronAPI.getCurrentRecordingSession()).session?.webcamPath
          ),
        { timeout: 30000 }
      )
      .toBeTruthy()
    const session = (await tool.evaluate(
      async () => (await window.electronAPI.getCurrentRecordingSession()).session
    ))!
    const video = session.videoPath
    recordedFiles = [video, session.webcamPath!]
    const frame = tool.frameLocator('iframe')
    const cameraOverlay = frame.locator('[data-webcam-overlay]')
    await expect(frame.locator('[data-variant="clip"]').first()).toBeVisible({ timeout: 60000 })
    await expect(cameraOverlay.locator('video')).toHaveJSProperty('readyState', 4, {
      timeout: 30000
    })
    await expect(cameraOverlay).toBeVisible()
    const probe = JSON.parse(
      execFileSync(ffprobe.path, ['-v', 'error', '-show_format', '-of', 'json', video], {
        windowsHide: true,
        encoding: 'utf8'
      })
    )
    const duration = Number(probe.format.duration)
    const content: { time: number; screen: number; camera: number; expected: number }[] = []
    for (const time of [
      0.1,
      0.5,
      (pause - start) / 1000 - 0.1,
      (pause - start) / 1000 + 0.2,
      duration - 0.1
    ]) {
      const screen = readTimecode(video, time)
      const camera = readTimecode(session.webcamPath!, time)
      const wall = start + time * 1000 + (time * 1000 >= pause - start ? resume - pause : 0)
      const expected = Math.floor(((wall - anchor) * 60) / 1000)
      content.push({ time, screen, camera, expected })
      expect.soft(Math.abs(screen - camera), JSON.stringify(content)).toBeLessThanOrEqual(1)
      // JS paint time precedes desktop presentation; compare the independent captured reference frames above.
    }
    const companions = await tool.evaluate(
      async (file) => window.electronAPI.getVideoAudioFallbackPaths(file),
      video
    )
    expect(companions.paths).toHaveLength(2)
    recordedFiles.push(...companions.paths!)
    const pulses: { file: string; expected: number; actual: number }[] = []
    for (const file of companions.paths!)
      for (const epoch of [firstPulse, secondPulse]) {
        const expected = epoch - start - (epoch > resume ? resume - pause : 0)
        const actual = readPulse(file, expected)
        pulses.push({ file: path.basename(file), expected, actual })
        expect.soft(Math.abs(actual - expected), JSON.stringify(pulses)).toBeLessThan(1000 / 60)
      }
    const telemetry = JSON.parse(await fs.readFile(video + '.cursor.json', 'utf8'))
    expect(telemetry.samples.some((sample) => sample.keyText?.toUpperCase().includes('K'))).toBe(
      true
    )
    expect(telemetry.samples.some((sample) => sample.interactionType === 'click')).toBe(true)
    // 先核验采集文件，再静音验证播放结尾；预览阶段不向系统输出额外声音。
    await frame.getByRole('button', { name: '预览音量', exact: true }).click()
    await frame.getByRole('slider', { name: '预览音量', exact: true }).press('Home')
    await frame.getByRole('dialog', { name: '预览音量', exact: true }).press('Escape')
    // 实际播放到EOF，避开进度条10ms步长在部分素材上无法触及精确终点的问题。
    await frame.getByRole('slider', { name: '播放进度', exact: true }).press('Home')
    await frame.getByRole('button', { name: '播放', exact: true }).click()
    await expect(frame.getByRole('button', { name: '暂停', exact: true })).toBeVisible()
    await expect(frame.locator('[data-presentation-source-video]')).toHaveJSProperty(
      'ended',
      true,
      { timeout: 15000 }
    )
    await expect(frame.getByRole('button', { name: '播放', exact: true })).toBeVisible()
    await expect(cameraOverlay, '全片终点应与屏幕一起保留最后一帧相机').toBeVisible()
    await tool.screenshot({ path: testInfo.outputPath('camera-at-timeline-end.png') })
    // Cold hardware encoder initialization is included; the capture boundary must not wait for a UI exit animation.
    expect.soft(startupMs).toBeLessThan(2000)
    expect.soft(uiTiming.ready - start).toBeLessThan(100)
    console.log(
      'CAPTURE_CONTENT_SYNC ' +
        JSON.stringify({
          startupMs,
          captureLatencyMs: start - uiTiming.clicked,
          uiAfterCommitMs: uiTiming.ready - start,
          content,
          pulses
        })
    )
    await testInfo.attach('capture-content-sync.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            startupMs,
            captureLatencyMs: start - uiTiming.clicked,
            uiAfterCommitMs: uiTiming.ready - start,
            content,
            pulses
          },
          null,
          2
        )
      ),
      contentType: 'application/json'
    })
  } finally {
    if (restoreMute) expect(audioState(root, 'mute').muted).toBe(true)
    const logPath = testInfo.outputPath('capture-clock.log')
    await fs.writeFile(logPath, logs.join('\n'))
    await testInfo.attach('capture-clock.log', {
      path: logPath,
      contentType: 'text/plain'
    })
    for (const file of recordedFiles)
      await testInfo.attach(path.basename(file), { path: file }).catch(() => undefined)
    await app?.close().catch(() => undefined)
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
})
