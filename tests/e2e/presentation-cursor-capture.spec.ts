import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import sharp from 'sharp'

/**
 * 统计白底图中的深色像素，为实际系统指针和原始录制使用同一检测器。
 * @param pixels RGB或RGBA像素。
 * @param channels 每像素通道数。
 * @returns 深色像素数量。
 */
function countDarkPixels(pixels: Buffer, channels: number): number {
  let dark = 0
  for (let i = 0; i < pixels.length; i += channels)
    if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100) dark++
  return dark
}

test('系统指针位图可检测且可见时，WGC原始整屏帧不包含该指针', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows WGC专项')
  test.setTimeout(150000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-cursor-capture-'))
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
    const fixture = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const display = screen.getPrimaryDisplay()
      const window = new BrowserWindow({
        ...display.bounds,
        frame: false,
        show: false,
        backgroundColor: '#ffffff'
      })
      await window.loadURL(
        'data:text/html,<title>capture-positive-control</title><style>html,body{background:white;margin:0;width:100%;height:100%;cursor:default}i{position:absolute;left:0;top:0;width:2px;height:2px}</style><i></i><script>let tick=0;function step(){document.querySelector("i").style.background=(tick++%2)?"black":"white";requestAnimationFrame(step)}step()</script>'
      )
      window.setAlwaysOnTop(true, 'screen-saver')
      window.setFullScreen(true)
      window.show()
      window.focus()
      return {
        handle: window.getNativeWindowHandle().readBigUInt64LE().toString(),
        point: screen.dipToScreenPoint({
          x: display.bounds.x + display.bounds.width / 2,
          y: display.bounds.y + display.bounds.height / 2
        })
      }
    })
    const source = await hud.evaluate(
      async () =>
        (
          await window.electronAPI.getSources({
            types: ['screen'],
            thumbnailSize: { width: 0, height: 0 }
          })
        )[0]
    )
    await hud.evaluate((source) => window.electronAPI.selectSource(source), source)
    const recording = await hud.evaluate(
      (source) =>
        window.electronAPI.startNativeScreenRecording(source, {
          capturesSystemAudio: true,
          capturesMicrophone: false
        }),
      source
    )
    expect(recording.success).toBe(true)
    // 阳性对照是当前系统指针的真实位图，单独标记，不伪装成产品捕获帧。
    const positivePath = testInfo.outputPath('native-cursor-positive.png')
    const stateText = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Drawing;Add-Type 'using System;using System.Runtime.InteropServices;public struct Point{public int X,Y;}public struct CursorInfo{public int Size,Flags;public IntPtr Cursor;public Point Point;}public class Probe{[DllImport("user32.dll")]public static extern bool SetPhysicalCursorPos(int x,int y);[DllImport("user32.dll")]public static extern bool GetCursorInfo(ref CursorInfo i);[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(Point p);[DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr w,uint f);[DllImport("user32.dll")]public static extern bool DrawIconEx(IntPtr dc,int x,int y,IntPtr icon,int w,int h,uint step,IntPtr brush,uint flags);}';[Probe]::SetPhysicalCursorPos(${fixture.point.x},${fixture.point.y})|Out-Null;Start-Sleep -Milliseconds 300;$c=New-Object CursorInfo;$c.Size=[Runtime.InteropServices.Marshal]::SizeOf($c);[Probe]::GetCursorInfo([ref]$c)|Out-Null;$b=New-Object Drawing.Bitmap 180,180;$g=[Drawing.Graphics]::FromImage($b);$g.Clear([Drawing.Color]::White);$dc=$g.GetHdc();$draw=[Probe]::DrawIconEx($dc,60,60,$c.Cursor,64,64,0,[IntPtr]::Zero,3);$g.ReleaseHdc($dc);$b.Save($env:TABDO_CURSOR_POSITIVE,[Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$b.Dispose();@{flags=$c.Flags;draw=$draw;handle=[Probe]::GetAncestor([Probe]::WindowFromPoint($c.Point),2).ToInt64().ToString()}|ConvertTo-Json -Compress;Start-Sleep -Milliseconds 1000`
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        env: { ...process.env, TABDO_CURSOR_POSITIVE: positivePath }
      }
    )
    const state = JSON.parse(stateText.trim())
    expect(state.flags & 1).toBe(1)
    expect(state.draw).toBe(true)
    expect(state.handle).toBe(fixture.handle)
    const positive = await sharp(positivePath).removeAlpha().raw().toBuffer()
    expect(countDarkPixels(positive, 3)).toBeGreaterThan(20)
    const stopped = await hud.evaluate(() => window.electronAPI.stopNativeScreenRecording())
    expect(stopped.success).toBe(true)
    await hud.evaluate(() => window.electronAPI.setRecordingState(false))
    const pixels = execFileSync(
      ffmpeg!,
      [
        '-v',
        'error',
        '-ss',
        '0.5',
        '-i',
        stopped.path!,
        '-frames:v',
        '1',
        '-vf',
        'crop=180:180:(iw-180)/2:(ih-180)/2',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-'
      ],
      { windowsHide: true }
    )
    expect(pixels.length).toBe(180 * 180 * 3)
    expect(countDarkPixels(pixels, 3)).toBe(0)
    await sharp(pixels, { raw: { width: 180, height: 180, channels: 3 } })
      .png()
      .toFile(testInfo.outputPath('wgc-raw-frame.png'))
    console.log(
      'NATIVE_CURSOR_EXCLUSION',
      JSON.stringify({
        positivePixels: countDarkPixels(positive, 3),
        recordedPixels: countDarkPixels(pixels, 3),
        duration: (stopped as any).durationMs,
        leading: (stopped as any).leadingMs
      })
    )
    const discarded = await hud.evaluate(
      (file) => window.electronAPI.deleteRecordingFile(file),
      stopped.path!
    )
    expect(discarded.success).toBe(true)
    const remaining = await fs.readdir(path.dirname(stopped.path!))
    expect(remaining.some((name) => name.startsWith(path.basename(stopped.path!, '.mp4')))).toBe(
      false
    )
    hud.evaluate(() => window.electronAPI.hudOverlayClose()).catch(() => {})
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
