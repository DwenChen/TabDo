import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

interface NativeBorderProbe {
  visible: boolean
  border: [number, number, number, number]
  target: [number, number, number, number]
  scale: number
}

/**
 * 通过 Win32 枚举原生边框窗口，读取其可见状态和物理像素边界。
 * @param targetHwnd 被置顶窗口句柄。
 * @returns 边框状态；辅助进程尚未创建边框时返回 null。
 */
function readNativeBorder(targetHwnd: number): NativeBorderProbe | null {
  const title = `TabDoAotBorder|${targetHwnd}`
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public struct HostProbeRect { public int Left, Top, Right, Bottom; }
public static class HostProbe {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr lparam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr lparam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out HostProbeRect rect);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out HostProbeRect rect, int size);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
}
"@
[HostProbe]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
$target = [IntPtr]${targetHwnd}
$targetRect = New-Object HostProbeRect
$targetHr = [HostProbe]::DwmGetWindowAttribute($target, 9, [ref]$targetRect, 16)
if ($targetHr -ne 0) { [HostProbe]::GetWindowRect($target, [ref]$targetRect) | Out-Null }
$script:matched = [IntPtr]::Zero
$callback = [HostProbe+EnumProc]{
  param($hwnd, $lparam)
  $text = New-Object System.Text.StringBuilder 256
  [HostProbe]::GetWindowText($hwnd, $text, 256) | Out-Null
  if ($text.ToString() -eq '${title}') { $script:matched = $hwnd }
  return $true
}
[HostProbe]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
if ($script:matched -eq [IntPtr]::Zero) { Write-Output 'null'; exit 0 }
$borderRect = New-Object HostProbeRect
[HostProbe]::GetWindowRect($script:matched, [ref]$borderRect) | Out-Null
$scale = [HostProbe]::GetDpiForWindow($target) / 96.0
$visible = [HostProbe]::IsWindowVisible($script:matched)
Write-Output ('{"visible":' + $visible.ToString().ToLower() + ',"border":[' + $borderRect.Left + ',' + $borderRect.Top + ',' + $borderRect.Right + ',' + $borderRect.Bottom + '],"target":[' + $targetRect.Left + ',' + $targetRect.Top + ',' + $targetRect.Right + ',' + $targetRect.Bottom + '],"scale":' + $scale.ToString('0.###') + '}')
`
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true }
  ).trim()
  const line = output.split(/\r?\n/).filter(Boolean).pop() || ''
  if (!line || line === 'null') return null
  return JSON.parse(line) as NativeBorderProbe
}

test('唤醒与窗口置顶作为宿主服务接入设置、托盘和全局快捷键', async ({
  browserName: _browserName
}, testInfo) => {
  test.skip(process.platform !== 'win32', '窗口置顶使用 Windows 全局快捷键')
  test.setTimeout(150000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-host-services-'))
  let application: ElectronApplication | undefined
  const logs: string[] = []
  try {
    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '1',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete environment.ELECTRON_RUN_AS_NODE
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const app = application
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached()
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))

    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    // 首次运行 Vite 需要编译设置页路由，冷启动时放宽等待时间。
    await expect(settings.getByText('唤醒', { exact: true }).first()).toBeVisible({
      timeout: 15000
    })
    await expect(settings.getByText('窗口置顶', { exact: true }).first()).toBeVisible()
    await expect(settings.getByText('置顶样式与快捷键')).toHaveCount(0)

    // 总开关启用后才出现可折叠的置顶外观与快捷键入口。
    const pinToggle = settings.getByLabel('窗口置顶')
    await pinToggle.evaluate((element: HTMLInputElement) => element.click())
    await expect(settings.getByText('置顶样式与快捷键')).toBeVisible()
    await expect(settings.getByText('置顶时播放声音')).toBeVisible()
    await expect(settings.getByText('固定窗口时播放系统提示音')).toBeVisible()
    await expect(settings.getByText('当前窗口置顶的触发快捷键')).toBeVisible()
    await expect(settings.getByText('前往快捷键设置')).toBeVisible()
    await expect(settings.getByText('显示高亮边框')).toBeVisible()
    // 关闭边框开关后隐藏外观子项，重新开启后恢复。
    const borderToggle = settings.getByLabel('显示高亮边框')
    await borderToggle.evaluate((element: HTMLInputElement) => element.click())
    await expect(settings.getByText('边框颜色', { exact: true })).toBeHidden()
    await borderToggle.evaluate((element: HTMLInputElement) => element.click())
    await expect(settings.getByText('边框颜色', { exact: true })).toBeVisible()
    await settings.getByText('置顶样式与快捷键').click()
    await expect(settings.getByText('置顶时播放声音')).toBeHidden()
    await settings.getByText('置顶样式与快捷键').click()
    // 点击面板外部不再收起；滚动到面板完全离开可视区域后才自动收起。
    await settings.getByText('窗口置顶', { exact: true }).first().click()
    await expect(settings.getByText('置顶时播放声音')).toBeVisible()
    await settings
      .locator('.content-panel')
      .evaluate((element) => (element.scrollTop = element.scrollHeight))
    await expect(settings.getByText('置顶时播放声音')).toBeHidden()
    await settings.locator('.content-panel').evaluate((element) => (element.scrollTop = 0))
    // 切换到其他设置页再返回时，展开面板保持收起状态。
    await settings.getByText('置顶样式与快捷键').click()
    await expect(settings.getByText('置顶时播放声音')).toBeVisible()
    await settings.locator('.settings-sidebar').getByRole('button', { name: '快捷键' }).click()
    await settings.locator('.settings-sidebar').getByRole('button', { name: '通用设置' }).click()
    await expect(settings.getByText('置顶时播放声音')).toBeHidden()
    await settings.getByText('置顶样式与快捷键').click()
    await expect(settings.getByText('窗口置顶已启用', { exact: false })).toBeHidden({
      timeout: 8000
    })
    await settings.getByText('当前窗口置顶的触发快捷键').scrollIntoViewIfNeeded()
    await settings.screenshot({ path: testInfo.outputPath('always-on-top-settings.png') })
    await pinToggle.evaluate((element: HTMLInputElement) => element.click())

    // 直接固定宿主主窗口，验证原生边框在数秒后仍可见，并与窗口边界保持贴合。
    const borderProbe = await app.evaluate(async ({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const border = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/alwaysOnTopBorder.ts'
      ).default
      const target = manager.getMainWindow()
      if (!target) return null
      // 设置页打开时主窗口可能已隐藏，先无焦点显示以模拟真实置顶场景。
      target.showInactive()
      await new Promise((resolve) => setTimeout(resolve, 300))
      const handle = target.getNativeWindowHandle()
      const hwnd =
        handle.length >= 8 ? Number(handle.readBigUInt64LE(0)) : handle.readUInt32LE(0)
      border.pin(
        hwnd,
        null,
        {
          colorMode: 'custom',
          color: '#22C55E',
          opacity: 100,
          thickness: 3,
          roundedCorners: true
        },
        false
      )
      return { hwnd, tracked: border.getTrackedHandles().length }
    })
    expect(borderProbe).not.toBeNull()
    expect(borderProbe?.tracked).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const nativeBorder = readNativeBorder(borderProbe!.hwnd)
    expect(nativeBorder).not.toBeNull()
    expect(nativeBorder?.visible).toBe(true)
    // 边框窗口向外扩展 3 DIP，物理坐标换算后与目标窗口偏差不超过 2px。
    const pad = Math.round(3 * nativeBorder!.scale)
    expect(Math.abs(nativeBorder!.border[0] - (nativeBorder!.target[0] - pad))).toBeLessThanOrEqual(2)
    expect(Math.abs(nativeBorder!.border[1] - (nativeBorder!.target[1] - pad))).toBeLessThanOrEqual(2)
    expect(Math.abs(nativeBorder!.border[2] - (nativeBorder!.target[2] + pad))).toBeLessThanOrEqual(2)
    expect(Math.abs(nativeBorder!.border[3] - (nativeBorder!.target[3] + pad))).toBeLessThanOrEqual(2)
    await app.evaluate(async ({ app }, hwnd) => {
      process.mainModule!
        .require(app.getAppPath() + '/src/main/core/alwaysOnTopBorder.ts')
        .default.unpin(hwnd)
    }, borderProbe!.hwnd)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(readNativeBorder(borderProbe!.hwnd)).toBeNull()

    const initialTray = await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const menu = manager.trayMenu
      const awake = menu?.items.find((item: any) => item.label?.startsWith('唤醒'))
      return {
        labels: menu?.items.map((item: any) => item.label),
        awakeSubmenu: awake?.submenu?.items.map((item: any) => item.label),
        awakeTypes: awake?.submenu?.items.map((item: any) => item.type)
      }
    })
    expect(initialTray.labels).toContain('唤醒')
    expect(initialTray.awakeSubmenu).toEqual(
      expect.arrayContaining(['启用唤醒', '保持屏幕点亮', '持续时间'])
    )
    // 普通菜单项配合文字勾选，避免原生勾选列在二级菜单左侧留下大片空白。
    expect(initialTray.awakeTypes).not.toEqual(expect.arrayContaining(['checkbox', 'radio']))

    const enabled = await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const database = process.mainModule!.require(
        app.getAppPath() + '/src/main/api/shared/database.ts'
      ).default
      const result = manager.setAwakeEnabled(true)
      const menu = manager.trayMenu
      const awake = menu?.items.find((item: any) => item.label?.startsWith('唤醒'))
      return {
        state: result.state,
        showTrayIcon: database.dbGet('settings-general')?.showTrayIcon,
        awakeLabel: awake?.label,
        awakeSubmenu: awake?.submenu?.items.map((item: any) => item.label),
        keepDisplayItem: awake?.submenu?.items.find((item: any) =>
          item.label?.startsWith('保持屏幕点亮')
        )?.enabled
      }
    })
    expect(enabled.state.enabled).toBe(true)
    expect(enabled.showTrayIcon).toBe(true)
    expect(enabled.awakeLabel).toBe('唤醒 ✓')
    expect(enabled.awakeSubmenu).toContain('启用唤醒 ✓')
    expect(enabled.keepDisplayItem).toBe(true)

    const disabled = await app.evaluate(({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      return manager.setAwakeEnabled(false).state
    })
    expect(disabled.enabled).toBe(false)

    const shortcut = await app.evaluate(({ app, globalShortcut }) => {
      const serviceModule = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/alwaysOnTopService.ts'
      )
      const service = serviceModule.default
      const accelerator = serviceModule.ALWAYS_ON_TOP_ACCELERATOR
      const result = service.setEnabled(true)
      const registered = globalShortcut.isRegistered(accelerator)
      service.setEnabled(false)
      return { result, registered, accelerator }
    })
    expect(shortcut.result.success).toBe(true)
    expect(shortcut.registered).toBe(true)
    expect(shortcut.accelerator).toBe('Super+Control+F12')

    const toggledOn = await app.evaluate(async ({ app }) => {
      const manager = process.mainModule!.require(
        app.getAppPath() + '/src/main/managers/windowManager.ts'
      ).default
      const service = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/alwaysOnTopService.ts'
      ).default
      const border = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/alwaysOnTopBorder.ts'
      ).default
      manager.getMainWindow().show()
      manager.getMainWindow().focus()
      await new Promise((resolve) => setTimeout(resolve, 300))
      const result = await service.toggleForegroundWindow()
      // 追踪进程启动需要短暂时间，等待边框登记完成后再核对。
      await new Promise((resolve) => setTimeout(resolve, 800))
      return { ...result, tracked: border.getTrackedHandles().length }
    })
    expect(toggledOn.success).toBe(true)
    expect(typeof toggledOn.topmost).toBe('boolean')
    expect(toggledOn.tracked).toBe(toggledOn.topmost ? 1 : 0)

    // 不假设测试窗口的初始置顶状态，第二次切换必须与第一次相反。
    const toggledOff = await app.evaluate(async ({ app }) => {
      const service = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/alwaysOnTopService.ts'
      ).default
      const border = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/alwaysOnTopBorder.ts'
      ).default
      const result = await service.toggleForegroundWindow()
      await new Promise((resolve) => setTimeout(resolve, 300))
      return { ...result, tracked: border.getTrackedHandles().length }
    })
    expect(toggledOff.success).toBe(true)
    expect(toggledOff.topmost).toBe(!toggledOn.topmost)
    expect(toggledOff.tracked).toBe(toggledOff.topmost ? 1 : 0)

    // 截图和退出前统一释放覆盖层，避免顶层透明窗口影响设置页截图。
    await app.evaluate(({ app }) => {
      process.mainModule!.require(
        app.getAppPath() + '/src/main/core/alwaysOnTopBorder.ts'
      ).default.stop()
    })

    await settings.getByText('唤醒', { exact: true }).first().scrollIntoViewIfNeeded()
    await settings.screenshot({ path: testInfo.outputPath('host-services-settings.png') })
  } finally {
    await fs.writeFile(testInfo.outputPath('host-services.log'), logs.join(''))
    await application?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
