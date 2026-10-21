import { expect, test, _electron as electron } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('region capture avoids the control bar and excludes it even after dragging inside', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(100000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-overlay-'))
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
    const output = path.join(temporary, 'overlay.mp4')
    const target = await app.evaluate(async ({ BrowserWindow, screen, shell }) => {
      shell.showItemInFolder = (file) => {
        ;(globalThis as any).__overlayRevealed = file
      }
      const display = screen.getPrimaryDisplay(),
        fixture = new BrowserWindow({
          x: display.bounds.x + 100,
          y: display.bounds.y + 100,
          width: 720,
          height: 460,
          frame: false,
          thickFrame: false,
          alwaysOnTop: true,
          show: true,
          webPreferences: { nodeIntegration: false }
        })
      await fixture.loadURL('data:text/html,<body style="margin:0;background:%2319c37d"></body>')
      ;(globalThis as any).__overlayFixture = fixture
      return {
        x: display.bounds.x + 160,
        y: display.bounds.y + 160,
        width: 420,
        height: 260,
        display: display.bounds
      }
    })
    await main.evaluate(
      async ({ plugin }) =>
        window.tabdo.launch({
          path: plugin!.path,
          type: 'plugin',
          featureCode: 'screen-recorder'
        }),
      { plugin }
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
          .some((p) => p.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const tools = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('http://127.0.0.1:15178'))!
    await expect(tools.locator('.source').first()).toBeVisible()
    await tools.evaluate((directory) => {
      const bridge = (window as any).toolsRecorder,
        original = bridge.start
      bridge.start = (options, signal) =>
        original(
          {
            ...options,
            countdown: 0,
            outputDirectory: directory,
            keyStyle: 'claymorphism',
            keyPosition: 'center'
          },
          signal
        )
    }, temporary)
    // 区域入口依原插件使用真实光标所在屏幕，使用 Windows 原生坐标定位测试底图。
    await app.evaluate(({ screen }, target) => {
      const point = screen.dipToScreenPoint({ x: target.x, y: target.y })
      const { execFileSync } = process.mainModule!.require('node:child_process')
      const source =
        'using System.Runtime.InteropServices; public class RecorderPointer { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'
      const command =
        "Add-Type -TypeDefinition '" +
        source +
        "'; [RecorderPointer]::SetProcessDPIAware() | Out-Null; [RecorderPointer]::SetCursorPos(" +
        point.x +
        ',' +
        point.y +
        ') | Out-Null'
      execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true })
    }, target)
    await tools.getByRole('tab', { name: '区域录制', exact: true }).click()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((p) => p.url().includes('recorder-region.html'))
      )
      .toBe(true)
    const selection = app
      .context()
      .pages()
      .find((p) => p.url().includes('recorder-region.html'))!
    const selectionBounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('recorder-region.html'))!
        .getBounds()
    )
    await fs.writeFile(
      testInfo.outputPath('capture-display.json'),
      JSON.stringify({ expected: target.display, selection: selectionBounds }, null, 2)
    )
    expect(selectionBounds.x).toBe(target.display.x)
    expect(selectionBounds.y).toBe(target.display.y)
    await expect(selection.getByText('拖动调整录制区域 · Enter 开始 · Esc 取消')).toBeVisible()
    await selection.mouse.move(target.x - target.display.x, target.y - target.display.y)
    await selection.mouse.down()
    await selection.mouse.move(
      target.x - target.display.x + target.width,
      target.y - target.display.y + target.height,
      { steps: 6 }
    )
    await selection.mouse.up().catch((error) => {
      if (!selection.isClosed()) throw error
    })
    // 松开鼠标只完成调整；原版交互要求显式确认才启动。
    expect(selection.isClosed()).toBe(false)
    expect(
      app
        .context()
        .pages()
        .some((p) => p.url().includes('recorder-control.html'))
    ).toBe(false)
    await expect(selection.getByLabel('选区宽度')).toHaveValue('420')
    await expect(selection.getByLabel('选区高度')).toHaveValue('260')
    await selection.getByLabel('点击', { exact: true }).check()
    await selection.getByLabel('按键', { exact: true }).check()
    await selection
      .getByRole('button', { name: '开始录制', exact: true })
      .click()
      .catch((error) => {
        if (!selection.isClosed()) throw error
      })
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((p) => p.url().includes('recorder-control.html'))
      )
      .toBe(true)
    const control = app
      .context()
      .pages()
      .find((p) => p.url().includes('recorder-control.html'))!
    await expect(control.locator('#status')).toHaveText(/00:0[1-9]/, { timeout: 25000 })
    const placement = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('recorder-control.html')
      )!
      const pixels = (await w.webContents.capturePage()).getBitmap()
      return {
        protected: w.isContentProtected(),
        bounds: w.getBounds(),
        cornerAlpha: pixels[3]
      }
    })
    expect(placement.protected).toBe(true)
    // getBackgroundColor 只返回 RGB，实际透明性必须检查捕获像素的 alpha。
    expect(placement.cornerAlpha).toBe(0)
    expect(placement.bounds.y).toBeGreaterThanOrEqual(target.y + target.height + 8)
    expect(
      await control.locator('main').evaluate((element) => getComputedStyle(element).borderRadius)
    ).toBe('12px')
    await control.screenshot({ path: testInfo.outputPath('rounded-control.png') })
    const effects = app
      .context()
      .pages()
      .find((p) => p.url().includes('recorder-effects.html'))!
    expect(effects).toBeTruthy()
    // 经宿主已有输入管理器传递真实原生键，检查效果层与专属订阅清理。
    await app.evaluate(({ app }) => {
      const { createRequire } = process.mainModule!.require('node:module')
      const { uIOhook, UiohookKey } = createRequire(app.getAppPath() + '/package.json')(
        'uiohook-napi'
      )
      ;(globalThis as any).__overlayFixture.focus()
      uIOhook.keyTap(UiohookKey.Shift)
    })
    await expect(effects.locator('#keys')).toContainText('Shift')
    await expect(effects.locator('#keys')).toHaveAttribute('data-style', 'claymorphism')
    expect(await effects.locator('#keys').evaluate((element) => element.style.top)).toBe('50%')
    await expect.poll(() => tools.isClosed()).toBe(true)
    // 故意把高辨识度色块控制条移入录区，核对视频像素，而不仅检查保护标志。
    await control.evaluate(() => {
      document.body.style.background = '#ff00ff'
      const main = document.querySelector('main')!
      main.setAttribute('style', 'background:#ff00ff;color:#ff00ff;border:0')
      for (const child of main.children) (child as HTMLElement).style.visibility = 'hidden'
    })
    await app.evaluate(
      ({ BrowserWindow }, target) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes('recorder-control.html'))!
          .setPosition(target.x + 30, target.y + 40),
      target
    )
    await expect(control.locator('#status')).toBeHidden()
    // 用原生捕获仍在运行的进度计时，避免额外定时器与生产 UI 互相依赖。
    await expect(effects.locator('#keys')).toHaveCSS('opacity', '0')
    // 按键效果本来就应进入视频；退场后再留出编码余量核对控制条排除。
    await app.evaluate(async () => new Promise((resolve) => setTimeout(resolve, 600)))
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('recorder-control.html'))!
        .close()
    )
    await expect.poll(() => control.isClosed(), { timeout: 15000 }).toBe(true)
    await expect.poll(() => effects.isClosed()).toBe(true)
    expect(
      await app.evaluate(({ app }) => {
        const manager = process.mainModule!.require(
          app.getAppPath() + '/src/main/core/globalInputManager.ts'
        ).default
        return (
          manager.consumers.has('tools-recorder') ||
          manager.listenersByConsumer.has('tools-recorder')
        )
      })
    ).toBe(false)
    const recordings = (await fs.readdir(temporary)).filter(
      (file) => file.startsWith('录屏助手_') && file.endsWith('.mp4')
    )
    expect(recordings).toHaveLength(1)
    expect(await app.evaluate(() => (globalThis as any).__overlayRevealed)).toBe(
      path.join(temporary, recordings[0])
    )
    await fs.rename(path.join(temporary, recordings[0]), output)
    await fs.writeFile(
      path.join(temporary, 'video.html'),
      '<video preload="auto" src="overlay.mp4"></video><canvas></canvas>'
    )
    const videoId = await app.evaluate(
      async ({ BrowserWindow }, file) => {
        const w = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } })
        await w.loadFile(file)
        ;(globalThis as any).__overlayVideo = w
        return w.webContents.id
      },
      path.join(temporary, 'video.html')
    )
    const frame = await app.evaluate(
      async ({ webContents }, id) =>
        webContents
          .fromId(id)!
          .executeJavaScript(
            `new Promise((resolve,reject)=>{const video=document.querySelector('video');const inspect=()=>{const canvas=document.querySelector('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let green=0,pink=0;for(let i=0;i<data.length;i+=4){if(data[i]<100&&data[i+1]>140&&data[i+2]<180)green++;if(data[i]>200&&data[i+1]<80&&data[i+2]>200)pink++}resolve({width:canvas.width,height:canvas.height,duration:video.duration,green:green/(data.length/4),pink:pink/(data.length/4),png:canvas.toDataURL('image/png')})};video.addEventListener('error',()=>reject(Error('视频解码失败')),{once:true});const seek=()=>{video.addEventListener('seeked',inspect,{once:true});video.currentTime=Math.max(0,video.duration-.3)};if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true})})`
          ),
      videoId
    )
    await fs.writeFile(
      testInfo.outputPath('recorded-frame.png'),
      Buffer.from(frame.png.split(',')[1], 'base64')
    )
    delete frame.png
    await fs.writeFile(testInfo.outputPath('overlay-frame.json'), JSON.stringify(frame, null, 2))
    expect(frame.width).toBeGreaterThan(400)
    expect(frame.height).toBeGreaterThan(250)
    expect(frame.green).toBeGreaterThan(0.97)
    expect(frame.pink).toBeLessThan(0.001)
    await app.evaluate(() => {
      ;(globalThis as any).__overlayVideo.destroy()
      ;(globalThis as any).__overlayFixture.destroy()
    })
  } finally {
    await fs.writeFile(testInfo.outputPath('overlay.log'), logs.join(''))
    await app.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
