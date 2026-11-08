import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

test('演示录制前输入开关、项目目录选择及原始素材回收边界', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(150000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(root, '.local/source-preview-recycle-'))
  let app: ElectronApplication | undefined
  const logs: string[] = []
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
      args: [
        path.join(root, 'scripts/preview-main.cjs'),
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream'
      ],
      cwd: root,
      env
    })
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    // 新资料首次启动会自动打开设置，等其正文就绪后再发工具命令，避免启动任务覆盖目标。
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
    const startupSettings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(startupSettings.getByText('超级面板', { exact: true }).first()).toBeVisible({
      timeout: 30000
    })
    await app.evaluate(() => {
      const childProcess = process.mainModule!.require('node:child_process')
      const custom = process.mainModule!.require('node:util').promisify.custom
      const original = childProcess.execFile
      /**
       * 保留普通子进程调用，只替换下方回收调用的异步入口。
       * @param args 原始execFile参数。
       * @returns 原始子进程句柄。
       */
      const intercepted = (...args): import('node:child_process').ChildProcess => original(...args)
      ;(globalThis as any).__recordingRecyclePaths = []
      // 只注入首个源访问拒绝，回退副本仍调用真实PowerShell与Windows回收站。
      intercepted[custom] = (file, args, options) => {
        const selected = options?.env?.TABDO_RECORDING_TRASH_PATH
        if (selected) {
          const paths = (globalThis as any).__recordingRecyclePaths as string[]
          paths.push(selected)
          if (paths.length === 1)
            return Promise.resolve({
              stdout: JSON.stringify({ success: false, hresult: '0x80270021' }),
              stderr: ''
            })
        }
        return original[custom](file, args, options)
      }
      childProcess.execFile = intercepted
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
    hud.on('pageerror', (error) => logs.push('HUD ERROR ' + error.stack))
    hud.on('console', (event) => {
      if (event.type() === 'error') logs.push('HUD CONSOLE ' + event.text())
    })
    await hud.evaluate(() =>
      window.electronAPI.setRecordingPreferences({ microphoneEnabled: true, webcamEnabled: true })
    )
    await hud.reload()
    await expect(hud.getByRole('button', { name: '选择录制来源', exact: true })).toBeEnabled()
    // 先让透明区域收到鼠标移动，建立与真实鼠标进入控制条相同的指针交互模式。
    await hud.mouse.move(1, 1)
    await hud.mouse.move(2, 2)
    // 从真实控制条验证提示可见，并检查弹层触发器仍能在提示包装后打开菜单。
    for (const [name, hint] of [
      ['选择录制来源', '选择录制来源'],
      ['启用系统音频', '启用系统音频'],
      ['禁用麦克风', '禁用麦克风'],
      ['禁用摄像头叠加', '禁用摄像头叠加'],
      ['录制按键', '录制按键：关'],
      ['倒计时延迟', '倒计时延迟'],
      ['录制', '录制'],
      ['演示编辑器', '演示编辑器'],
      ['隐藏 控制条', '隐藏 控制条'],
      ['关闭应用', '关闭应用']
    ]) {
      await hud.getByRole('button', { name, exact: true }).hover()
      await expect(hud.getByRole('tooltip', { name: hint, exact: true })).toBeVisible()
      await expect(hud.getByRole('tooltip', { name: hint, exact: true })).toBeInViewport()
    }
    await hud.getByRole('button', { name: '禁用摄像头叠加', exact: true }).hover()
    await expect(hud.getByRole('tooltip', { name: '禁用摄像头叠加', exact: true })).toBeVisible()
    // 等待新提示定位及旧提示退场，截图不包含提示切换中的重叠帧。
    await expect(
      hud.locator('[role="tooltip"][data-entering], [role="tooltip"][data-exiting]')
    ).toHaveCount(0)
    const hintBounds = await hud.getByRole('tooltip').boundingBox()
    const cameraBounds = await hud
      .getByRole('button', { name: '禁用摄像头叠加', exact: true })
      .boundingBox()
    expect(hintBounds!.y + hintBounds!.height).toBeLessThan(cameraBounds!.y)
    await hud.screenshot({ path: testInfo.outputPath('camera-hover-hint.png') })
    await hud.getByRole('button', { name: '禁用摄像头叠加', exact: true }).click()
    await expect(hud.getByRole('tooltip')).toHaveCount(0)
    const previewOn = hud.getByRole('button', { name: '悬浮预览已开启', exact: true })
    const previewOff = hud.getByRole('button', { name: '悬浮预览已关闭', exact: true })
    const floatingPreview = hud.locator('[data-hud-webcam-preview]')
    await expect(floatingPreview).toBeVisible()
    await expect(floatingPreview).toBeInViewport()
    await expect(floatingPreview.locator('video')).toHaveJSProperty('readyState', 4)
    const firstPreviewTime = await floatingPreview
      .locator('video')
      .evaluate((video: HTMLVideoElement) => video.currentTime)
    await expect
      .poll(() =>
        floatingPreview.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)
      )
      .toBeGreaterThan(firstPreviewTime)
    await expect(previewOn).toBeVisible()
    await expect(previewOn).toHaveAttribute('aria-pressed', 'true')
    const previewButton = await previewOn.boundingBox()
    const previewLabel = await previewOn.locator('span').last().boundingBox()
    expect(
      Math.abs(
        previewButton!.x + previewButton!.width / 2 - previewLabel!.x - previewLabel!.width / 2
      )
    ).toBeLessThan(1)
    await hud.screenshot({ path: testInfo.outputPath('floating-preview-enabled.png') })
    await previewOn.click()
    await expect(previewOff).toBeVisible()
    await expect(previewOff).toHaveAttribute('aria-pressed', 'false')
    await expect(floatingPreview).toHaveCount(0)
    await hud.screenshot({ path: testInfo.outputPath('floating-preview-disabled.png') })
    await previewOff.click()
    await expect(previewOn).toBeVisible()
    await hud.keyboard.press('Escape')
    await expect(hud.getByRole('button', { name: '关闭摄像头', exact: true })).toHaveCount(0)
    await expect(floatingPreview).toBeVisible()
    await expect(floatingPreview.locator('video')).toHaveJSProperty('readyState', 4)
    await hud.screenshot({ path: testInfo.outputPath('floating-preview-outside-menu.png') })
    await hud.getByRole('button', { name: '禁用麦克风', exact: true }).click()
    const micOff = hud.getByRole('button', { name: '关闭麦克风', exact: true }).last()
    await expect(micOff).toBeVisible()
    const micClass = await micOff.getAttribute('class')
    await micOff.click()
    await hud.getByRole('button', { name: '禁用摄像头叠加', exact: true }).click()
    const cameraOff = hud.getByRole('button', { name: '关闭摄像头', exact: true }).last()
    await expect(cameraOff).toBeVisible()
    expect(await cameraOff.getAttribute('class')).toBe(micClass)
    await hud.screenshot({ path: testInfo.outputPath('camera-off-menu.png') })
    await cameraOff.click()
    await expect(hud.getByRole('button', { name: '录制按键', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
      { timeout: 30000 }
    )
    await expect(hud.getByRole('button', { name: '录制鼠标', exact: true })).toHaveCount(0)
    await expect(hud.locator('[data-keyboard-capture="off"] > svg')).toHaveCount(2)
    await expect(
      hud.locator('[data-keyboard-capture="off"] > svg:last-child path').last()
    ).toHaveAttribute('d', 'M3 3L17 17')
    await hud.getByRole('button', { name: '录制按键', exact: true }).click()
    await expect(hud.getByRole('button', { name: '录制按键', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(hud.getByRole('button', { name: '录制鼠标', exact: true })).toHaveCount(0)
    const sound = await hud.getByRole('button', { name: '启用系统音频', exact: true }).boundingBox()
    const mic = await hud.getByRole('button', { name: '启用麦克风', exact: true }).boundingBox()
    expect(sound!.x + sound!.width).toBeLessThanOrEqual(mic!.x)
    await hud.screenshot({ path: testInfo.outputPath('idle-controls.png') })
    await hud.getByRole('button', { name: '演示编辑器', exact: true }).click()
    const tool = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    const frame = tool.frameLocator('iframe')
    await frame.getByRole('button', { name: '设置', exact: true }).click()
    await frame.getByLabel('设置分类').getByText('文件', { exact: true }).click()
    await expect(frame.getByText('项目保存目录', { exact: true })).toBeVisible()
    const selected = path.join(temporary, 'chosen-projects')
    const before = await tool.evaluate(() => window.electronAPI.getProjectsDirectory())
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
    })
    await frame.getByRole('button', { name: '更改目录', exact: true }).click()
    await expect
      .poll(() => tool.evaluate(() => window.electronAPI.getProjectsDirectory()))
      .toEqual(before)
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] })
    }, selected)
    await frame.getByRole('button', { name: '更改目录', exact: true }).click()
    await expect
      .poll(async () => (await tool.evaluate(() => window.electronAPI.getProjectsDirectory())).path)
      .toBe(selected)
    await expect(frame.getByText(selected, { exact: false })).toBeVisible()
    const created = await tool.evaluate(() =>
      window.electronAPI.createProjectFile({ version: 1, editor: {} })
    )
    expect(created.success).toBe(true)
    expect(path.dirname(created.path!)).toBe(selected)
    await tool.screenshot({ path: testInfo.outputPath('project-directory.png') })
    // 用独立夹具比较回收普通文件与暂存目录；不读取或删除用户素材。
    const library = (await tool.evaluate(() => window.electronAPI.getRecordingsDirectory())).path
    const raw = path.join(library, 'recording-1793750000000.webm')
    await fs.writeFile(raw, 'owned test source')
    await fs.writeFile(raw + '.cursor.json', '{}')
    const removed = await tool.evaluate(
      (file) => window.electronAPI.trashRecordingFiles([file]),
      raw
    )
    console.log('TRASH_RESULT', JSON.stringify(removed))
    expect(removed.success).toBe(true)
    const recyclePaths = await app.evaluate(
      () => (globalThis as any).__recordingRecyclePaths as string[]
    )
    expect(recyclePaths).toHaveLength(2)
    expect(recyclePaths[0]).toContain(library)
    expect(path.basename(recyclePaths[1])).toMatch(/^tabdo-recording-recycle-/)
    await expect(fs.stat(raw)).rejects.toThrow()
    await expect(fs.stat(raw + '.cursor.json')).rejects.toThrow()
    // 为独立按键录制准备真实窗口；系统指针排除由专项原始帧验证。
    const target = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const window = new BrowserWindow({ x: 80, y: 80, width: 650, height: 450, show: false })
      await window.loadURL(
        'data:text/html,<title>cursor-probe</title><style>html,body{margin:0;background:rgb(255,255,255);cursor:crosshair;height:100%}</style>'
      )
      window.setAlwaysOnTop(true, 'screen-saver')
      window.show()
      window.focus()
      const bounds = window.getContentBounds()
      return {
        id: window.id,
        point: screen.dipToScreenPoint({ x: bounds.x + 300, y: bounds.y + 200 })
      }
    })
    const source = await hud.evaluate(async () =>
      (
        await window.electronAPI.getSources({
          types: ['window'],
          thumbnailSize: { width: 0, height: 0 }
        })
      ).find((source) => source.name === 'cursor-probe')
    )
    expect(source).toBeTruthy()
    await hud.evaluate((source) => window.electronAPI.selectSource(source!), source)
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Add-Type 'using System;using System.Runtime.InteropServices;public class CursorProbe{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);}';[CursorProbe]::SetCursorPos(${target.point.x},${target.point.y})`
      ],
      { windowsHide: true }
    )
    await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)!.setAlwaysOnTop(false),
      target.id
    )
    await frame.getByRole('button', { name: '开始录制', exact: true }).click()
    await expect(hud.getByRole('button', { name: '录制按键', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(hud.getByRole('button', { name: '录制鼠标', exact: true })).toHaveCount(0)
    await hud.getByRole('button', { name: '倒计时延迟', exact: true }).click()
    await hud.getByText('无延迟', { exact: true }).click()
    await hud.getByRole('button', { name: '录制', exact: true }).click()
    await expect(hud.getByRole('button', { name: '停止', exact: true })).toBeVisible({
      timeout: 30000
    })
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Add-Type \'using System;using System.Runtime.InteropServices;public class KeyProbe{[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}\';[KeyProbe]::keybd_event(75,0,0,[UIntPtr]::Zero);[KeyProbe]::keybd_event(75,0,2,[UIntPtr]::Zero)'
      ],
      { windowsHide: true }
    )
    await expect(hud.locator('kbd')).toContainText('k')
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Add-Type \'using System;using System.Runtime.InteropServices;public class SpaceProbe{[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}\';[SpaceProbe]::keybd_event(32,0,0,[UIntPtr]::Zero);[SpaceProbe]::keybd_event(32,0,2,[UIntPtr]::Zero)'
      ],
      { windowsHide: true }
    )
    await expect(hud.locator('kbd')).toContainText('Space')
    /**
     * 向隔离录制目标发送真实物理键事件，并保证失败时也松开修饰键。
     * @param events Windows 虚拟键、扫描码及按下或松开标志。
     * @returns 无返回值；原生采集结果由控制条和保存遥测验收。
     */
    function injectKeys(events: number[][]): void {
      const commands = events
        .map(
          ([key, scan, flags]) =>
            `[ModifierProbe]::keybd_event(${key},${scan},${flags},[UIntPtr]::Zero)`
        )
        .join(';')
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Add-Type 'using System;using System.Runtime.InteropServices;public class ModifierProbe{[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);}';try{${commands}}finally{foreach($key in @(160,161,162,163,164,165)){[ModifierProbe]::keybd_event($key,0,2,[UIntPtr]::Zero)}}`
        ],
        { windowsHide: true }
      )
    }
    await app.evaluate(({ BrowserWindow }, id) => {
      BrowserWindow.fromId(id)!.focus()
      return true
    }, target.id)
    const probes: Array<[number[][], string]> = [
      [
        [
          [160, 42, 0],
          [160, 42, 2]
        ],
        'Shift'
      ],
      [
        [
          [161, 54, 0],
          [161, 54, 2]
        ],
        'Shift'
      ],
      [
        [
          [162, 29, 0],
          [162, 29, 2]
        ],
        'Ctrl'
      ],
      [
        [
          [164, 56, 0],
          [164, 56, 2]
        ],
        'Alt'
      ],
      [
        [
          [160, 42, 0],
          [65, 30, 0],
          [65, 30, 2],
          [160, 42, 2]
        ],
        'Shift + A'
      ],
      [
        [
          [162, 29, 0],
          [160, 42, 0],
          [83, 31, 0],
          [83, 31, 2],
          [160, 42, 2],
          [162, 29, 2]
        ],
        'Ctrl + Shift + S'
      ],
      [
        [
          [13, 28, 0],
          [13, 28, 2]
        ],
        'Enter'
      ],
      [
        [
          [37, 75, 1],
          [37, 75, 3]
        ],
        'ArrowLeft'
      ]
    ]
    for (const [events, text] of probes) {
      injectKeys(events)
      await expect(hud.locator('kbd')).toHaveText(text)
    }
    await hud.getByRole('button', { name: '停止', exact: true }).click()
    await expect
      .poll(
        async () => (await tool.evaluate(() => window.electronAPI.getCurrentVideoPath())).path,
        { timeout: 30000 }
      )
      .toMatch(/\.(webm|mp4)$/)
    const recording = await tool.evaluate(() => window.electronAPI.getCurrentVideoPath())
    const telemetry = JSON.parse(await fs.readFile(recording.path! + '.cursor.json', 'utf8'))
    expect(telemetry.samples.length).toBeGreaterThan(0)
    expect(telemetry.samples.some((sample) => sample.keyText)).toBe(true)
    expect(telemetry.samples.some((sample) => sample.keyText === 'Space')).toBe(true)
    expect(
      telemetry.samples.filter((sample) => sample.keyText === 'Shift').length
    ).toBeGreaterThanOrEqual(2)
    for (const [, text] of probes)
      expect(telemetry.samples.some((sample) => sample.keyText === text)).toBe(true)
    expect(telemetry.samples.some((sample) => sample.interactionType === 'move')).toBe(true)
    await expect(frame.locator('[data-preview-frame]')).toBeVisible({ timeout: 30000 })
    expect(
      await frame
        .locator('[data-preview-frame]')
        .evaluate((element) => getComputedStyle(element).cursor)
    ).toBe('default')
  } finally {
    await fs.writeFile(testInfo.outputPath('main.log'), logs.join(''))
    await app?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
