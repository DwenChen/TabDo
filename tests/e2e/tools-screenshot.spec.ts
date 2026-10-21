import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * 将隔离截图测试所需的指针操作发送到原生选区窗口。
 * @param script 固定测试指针动作。
 * @returns 指针辅助进程的标准输出。
 * @throws 原生窗口缺失或辅助进程失败时抛出错误。
 */
function nativePointer(script: string): string {
  return execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class CaptureInput { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern uint GetDpiForSystem(); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect); [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; } [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra); [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title); }';
[CaptureInput]::SetProcessDPIAware() | Out-Null;
${script}`
    ],
    { windowsHide: true, stdio: 'pipe', encoding: 'utf8' }
  )
}

test('native tools screenshot keeps editing and confirms silently without translation', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows native screenshot module')
  test.setTimeout(180_000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-screenshot-e2e-'))
  let app: ElectronApplication | undefined
  let collectedEvaluations = 0
  /**
   * 重试 Electron CDP 在原生大图分配触发 GC 时丢失的临时求值 Promise。
   * @returns 当前截图流程是否已成功结束。
   * @throws 非临时 GC 的 Electron 通信错误。
   */
  async function captureComplete(): Promise<boolean> {
    try {
      return await app!.evaluate(() => Boolean((globalThis as any).__captureResult?.success))
    } catch (failure) {
      if (!String(failure).includes('Resulting promise was garbage collected')) throw failure
      collectedEvaluations++
      return false
    }
  }
  try {
    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_LOG_LEVEL: 'debug',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete environment.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    await app.firstWindow()
    await expect
      .poll(
        () =>
          app!.evaluate(async ({ app, webContents }) => {
            await process
              .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
              .default.showSettings()
            return (
              webContents
                .getAllWebContents()
                .find((c) => c.getURL().startsWith('http://127.0.0.1:15177'))
                ?.executeJavaScript('document.body.innerText') || ''
            )
          }),
        { timeout: 30000 }
      )
      .toContain('开机自动启动')
    const dimensions = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const fixture = new BrowserWindow({
        ...screen.getPrimaryDisplay().bounds,
        frame: false,
        alwaysOnTop: true,
        backgroundColor: '#f4f7fb',
        show: false
      })
      await fixture.loadURL(
        'data:text/html,<body style="background:%23f4f7fb;font:32px sans-serif;padding:70px"><h1>Screenshot fixture</h1><p>Only isolated test content appears in this capture.</p></body>'
      )
      fixture.show()
      fixture.focus()
      ;(globalThis as any).__captureFixture = fixture
      return screen.getPrimaryDisplay()
    })
    const fixture = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('data:text/html'))!
    await expect(
      fixture.getByText('Only isolated test content appears in this capture.')
    ).toBeVisible()
    await app.evaluate(({ app, Notification }) => {
      ;(globalThis as any).__captureNotices = 0
      ;(globalThis as any).__nativeToolPids = []
      const childProcess = process.mainModule!.require('node:child_process')
      const originalSpawn = childProcess.spawn
      // 追踪真实工具进程，完成状态必须意味着操作系统已回收该进程。
      childProcess.spawn = (...args) => {
        const child = originalSpawn(...args)
        if (String(args[1]?.[0]).includes('tools-native-worker')) {
          ;(globalThis as any).__nativeToolPids.push(child.pid)
        }
        return child
      }
      Notification.prototype.show = () => {
        ;(globalThis as any).__captureNotices++
      }
      const command = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/renderer/systemCommands.ts'
      )
      ;(globalThis as any).__captureResult = null
      void command
        .executeSystemCommand('screenshot', { mainWindow: null, pluginManager: null })
        .then((result) => {
          ;(globalThis as any).__captureResult = result
        })
    })
    const factor = dimensions.scaleFactor
    const x = Math.round((dimensions.bounds.x + 120) * factor),
      y = Math.round((dimensions.bounds.y + 180) * factor)
    const endX = x + Math.round(680 * factor),
      endY = y + Math.round(240 * factor)
    nativePointer(
      `$capture = [IntPtr]::Zero; for($i=0; $i -lt 50; $i++) { $capture = [CaptureInput]::FindWindow('ZToolsScreenshotOverlay', 'Screenshot Overlay'); if($capture -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 50 }; if($capture -eq [IntPtr]::Zero) { throw 'Capture overlay not found' }; [CaptureInput]::SetCursorPos(${x},${y}); [CaptureInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 100; [CaptureInput]::SetCursorPos(${endX},${endY}); Start-Sleep -Milliseconds 100; [CaptureInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`
    )
    // 松开选区仍停留在编辑态，确认前不能回传最终结果。
    expect(await app.evaluate(() => (globalThis as any).__captureResult)).toBeNull()
    const preview = await app.evaluate(async ({ desktopCapturer }) => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      return sources[0].thumbnail.toPNG().toString('base64')
    })
    await fs.writeFile(
      testInfo.outputPath('native-screenshot-toolbar.png'),
      Buffer.from(preview, 'base64')
    )
    nativePointer(
      '[CaptureInput]::keybd_event(13,0,0,[UIntPtr]::Zero); [CaptureInput]::keybd_event(13,0,2,[UIntPtr]::Zero)'
    )
    await expect.poll(captureComplete, { timeout: 30_000 }).toBe(true)
    expect(await app.evaluate(() => (globalThis as any).__captureNotices)).toBe(0)
    const size = await app.evaluate(({ clipboard }) => clipboard.readImage().getSize())
    expect(size.width).toBeGreaterThan(500)
    expect(size.height).toBeGreaterThan(150)

    // 默认回归覆盖数万像素的长图；身份色带验证中间内容连续，不能只检查高度。
    const longEndY = Math.round((dimensions.bounds.y + dimensions.bounds.height - 130) * factor)
    const scrollSteps = 96
    const scrollDistance = 360
    // 不发送鼠标滚轮事件，模拟触控板或滚动条带来的页面滚动。
    await fixture.evaluate(() => {
      document.body.style.cssText = 'margin:0;padding:0;font:20px monospace'
      document.body.innerHTML = Array.from(
        { length: 2000 },
        (_, i) =>
          `<div style="height:64px;box-sizing:border-box;position:relative;display:grid;grid-template-columns:repeat(3,1fr);background:hsl(${(i * 31) % 360} 65% 85%);border-bottom:0"><i style="position:absolute;left:150px;top:0;width:16px;height:64px;background:rgb(${i & 255},${(i >>> 8) & 255},${(i * 73) & 255})"></i>${[0, 1, 2].map((j) => `<span>Row ${i} / Col ${j}: ${i * 137 + j * 29} — scroll capture</span>`).join('')}</div>`
      ).join('')
      window.scrollTo(0, 0)
    })
    await app.evaluate(({ app }) => {
      const command = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/renderer/systemCommands.ts'
      )
      ;(globalThis as any).__captureResult = null
      void command
        .executeSystemCommand('screenshot', { mainWindow: null, pluginManager: null })
        .then((result) => {
          ;(globalThis as any).__captureResult = result
        })
    })
    nativePointer(
      `$capture = [IntPtr]::Zero; for($i=0; $i -lt 50; $i++) { $capture = [CaptureInput]::FindWindow('ZToolsScreenshotOverlay', 'Screenshot Overlay'); if($capture -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 50 }; if($capture -eq [IntPtr]::Zero) { throw 'Capture overlay not found' }; [CaptureInput]::SetCursorPos(${x},${y}); [CaptureInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 100; [CaptureInput]::SetCursorPos(${endX},${longEndY}); Start-Sleep -Milliseconds 100; [CaptureInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 100;`
    )
    await fs.writeFile(
      testInfo.outputPath('before-long-toolbar.png'),
      Buffer.from(
        await app.evaluate(async ({ desktopCapturer }) =>
          (
            await desktopCapturer.getSources({
              types: ['screen'],
              thumbnailSize: { width: 1920, height: 1080 }
            })
          )[0].thumbnail
            .toPNG()
            .toString('base64')
        ),
        'base64'
      )
    )
    nativePointer(`
      $scale = [CaptureInput]::GetDpiForSystem() / 96.0; $btn = [Math]::Round(32*$scale); $gap = [Math]::Round($scale); $pad=[Math]::Round(6*$scale); $border=[Math]::Round($scale); $tw=16*($btn+$gap)-$gap+2*$pad+2*$border-2*($btn-[Math]::Floor($btn*3/8)); $left=${x}+(${endX - x}-$tw)/2; $bx=[int]($left+$pad+$border+8*($btn+$gap)+$btn/2); $by=[int](${longEndY}+[Math]::Round(6*$scale)+[Math]::Round(44*$scale)/2); [CaptureInput]::SetCursorPos($bx,$by); [CaptureInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [CaptureInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero);
      $toolbar=[IntPtr]::Zero; for($i=0; $i -lt 50; $i++) { $toolbar=[CaptureInput]::FindWindow('ZToolsLongCaptureToolbar','LongCaptureToolbar'); if($toolbar -ne [IntPtr]::Zero) { break }; Start-Sleep -Milliseconds 50 }; if($toolbar -eq [IntPtr]::Zero) { throw ('Long capture toolbar not found: scale=' + $scale + ', click=' + $bx + ',' + $by) }`)
    for (let step = 1; step <= scrollSteps; step++) {
      await fixture.evaluate(async (distance) => {
        window.scrollBy(0, distance)
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        // 原生采样节拍为 150ms；保留两个节拍供稳定性检测和拼接提交。
        await new Promise((resolve) => setTimeout(resolve, 450))
      }, scrollDistance)
    }
    nativePointer(
      `$toolbar=[CaptureInput]::FindWindow('ZToolsLongCaptureToolbar','LongCaptureToolbar'); $r=New-Object CaptureInput+Rect; [CaptureInput]::GetWindowRect($toolbar,[ref]$r) | Out-Null; [CaptureInput]::SetCursorPos($r.right-25,($r.top+$r.bottom)/2); [CaptureInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [CaptureInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`
    )
    await expect.poll(captureComplete, { timeout: 30_000 }).toBe(true)
    // 复用原生已编码的 PNG，测试本身也不重复读取和编码整张长图。
    const longCapture = await app.evaluate(() => ({
      size: (globalThis as any).__captureResult.bounds,
      image: (globalThis as any).__captureResult.image
    }))
    await fs.writeFile(
      testInfo.outputPath('long-screenshot.png'),
      Buffer.from(longCapture.image.split(',')[1], 'base64')
    )
    expect(longCapture.size.height).toBeGreaterThan(30_000)
    const continuity = await app.evaluate(({ clipboard }) => {
      const image = clipboard.readImage()
      const { width, height } = image.getSize()
      const bits = image.toBitmap()
      // 从原图色带定位身份列，兼容系统 DPI、窗口缩放与选区边缘舍入。
      let identityX = -1
      for (let x = 2; x < Math.min(width, 250) && identityX < 0; x++) {
        let matches = 0
        for (let y = 3; y < Math.min(512, height); y += 3) {
          const offset = (y * width + x) * 4
          if (bits[offset] === ((bits[offset + 2] * 73) & 255)) matches++
        }
        if (matches > 150) identityX = x
      }
      const rows: number[] = []
      if (identityX >= 0)
        for (let y = 0; y < height; y++) {
          const offset = (y * width + identityX) * 4
          // 忽略 DPI 插值产生的行边缘混色，只比较已知色带的精确行。
          if (bits[offset] !== ((bits[offset + 2] * 73) & 255)) continue
          const row = bits[offset + 2] + (bits[offset + 1] << 8)
          if (rows[rows.length - 1] !== row) rows.push(row)
        }
      const gaps = rows.flatMap((row, i) =>
        i > 0 && row !== rows[i - 1] + 1 ? [{ previous: rows[i - 1], row }] : []
      )
      return {
        width,
        height,
        identityX,
        checkedRows: rows.length,
        firstRow: rows[0],
        lastRow: rows[rows.length - 1],
        gaps: gaps.slice(0, 12),
        gapCount: gaps.length
      }
    })
    await fs.writeFile(
      testInfo.outputPath('long-screenshot-continuity.json'),
      JSON.stringify({ ...continuity, collectedEvaluations }, null, 2)
    )
    expect(continuity.identityX).toBeGreaterThanOrEqual(0)
    expect(continuity.gapCount).toBe(0)
    expect(continuity.checkedRows).toBeGreaterThan(400)
    expect(await app.evaluate(() => (globalThis as any).__captureNotices)).toBe(0)

    // 截图结束时不得留下原生模块进程，未使用的预抓帧也必须自动释放。
    expect(await app.evaluate(() => (globalThis as any).__nativeToolPids.length)).toBe(2)
    expect(
      await app.evaluate(() =>
        (globalThis as any).__nativeToolPids.every((pid) => {
          try {
            process.kill(pid, 0)
            return false
          } catch {
            return true
          }
        })
      )
    ).toBe(true)
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
        .ScreenCapture.prime()
    })
    await expect
      .poll(
        () =>
          app!.evaluate(() => {
            const pid = (globalThis as any).__nativeToolPids[2]
            if (!pid) return false
            try {
              process.kill(pid, 0)
              return false
            } catch {
              return true
            }
          }),
        { timeout: 5_000 }
      )
      .toBe(true)

    // 取色取消必须同时收束回调、active 状态和实际工作进程。
    await app.evaluate(({ app }) => {
      ;(globalThis as any).__pickerResult = null
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
        .ColorPicker.start((result) => {
          ;(globalThis as any).__pickerResult = result
        })
    })
    await app.evaluate(async ({ app }) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
        .ColorPicker.stop()
    })
    await expect
      .poll(() => app!.evaluate(() => (globalThis as any).__pickerResult?.success))
      .toBe(false)
    expect(
      await app.evaluate(
        ({ app }) =>
          process.mainModule!.require(app.getAppPath() + '/src/main/core/native/index.ts')
            .ColorPicker.isActive
      )
    ).toBe(false)
    expect(
      await app.evaluate(() =>
        (globalThis as any).__nativeToolPids.every((pid) => {
          try {
            process.kill(pid, 0)
            return false
          } catch {
            return true
          }
        })
      )
    ).toBe(true)
  } finally {
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
