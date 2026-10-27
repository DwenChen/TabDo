import type { ElectronApplication } from '@playwright/test'

/**
 * 记录真实任务栏 setter 调用；Electron 没有对应 getter，原方法仍正常执行。
 * @param application 当前隔离 Electron 实例。
 * @returns 测试观察器登记完成后的 Promise。
 */
export async function trackWindowIdentities(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ app, BrowserWindow, nativeImage }) => {
    // Electron 的全局窗口枚举不包含派生类；保留原生创建事件中的同一实例。
    const windows = new Map<number, Electron.BrowserWindow>()
    ;(globalThis as any).__testIdentityWindows = windows
    /**
     * 观察实际原生设置，保留原方法调用及错误。
     * @param window 待观察的隔离测试窗口。
     * @returns 无返回值。
     */
    const track = (window: Electron.BrowserWindow): void => {
      windows.set(window.id, window)
      window.once('closed', () => windows.delete(window.id))
      const original = window.setSkipTaskbar.bind(window)
      const originalIcon = window.setIcon.bind(window)
      window.setSkipTaskbar = (skip): void => {
        original(skip)
        ;(window as any).__testSkipTaskbar = skip
      }
      window.setIcon = (icon): void => {
        originalIcon(icon)
        const image = typeof icon === 'string' ? nativeImage.createFromPath(icon) : icon
        ;(window as any).__testIconPng = image.toPNG().toString('base64')
      }
      if (process.platform === 'win32') {
        const originalDetails = window.setAppDetails.bind(window)
        window.setAppDetails = (details): void => {
          originalDetails(details)
          ;(window as any).__testAppId = details.appId
        }
      }
    }
    BrowserWindow.getAllWindows().forEach(track)
    app.on('browser-window-created', (_event, window) => track(window))
  })
}

/**
 * 同时读取最后一次真实任务栏设置和 Windows 实际窗口图标句柄。
 * @param application 当前隔离的源码 Electron 实例。
 * @param windowId 目标原生窗口 ID。
 * @param featureCode 可选的预期功能图标，核对实际传入原生 setter 的像素。
 * @returns 真实窗口的任务栏与图标状态。
 */
export async function readWindowIdentity(
  application: ElectronApplication,
  windowId: number,
  featureCode?: string
): Promise<{
  skipTaskbar: boolean
  title: string
  nativeIcons: Array<{ sent: boolean; present: boolean }>
  iconMatchesFeature?: boolean
  appId?: string
}> {
  return application.evaluate(
    async ({ app, BrowserWindow, nativeImage }, { id, code }) => {
      const window = BrowserWindow.fromId(id) ?? (globalThis as any).__testIdentityWindows?.get(id)
      const handle = window.getNativeWindowHandle()
      const hwnd =
        handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE())
      const output =
        process.platform === 'win32'
          ? await new Promise<string>((resolve, reject) => {
              process
                .mainModule!.require('node:child_process')
                .execFile(
                  'powershell.exe',
                  [
                    '-NoLogo',
                    '-NoProfile',
                    '-NonInteractive',
                    '-File',
                    app.getAppPath() + '/tests/fixtures/native-window-icon.ps1',
                    hwnd
                  ],
                  { windowsHide: true, timeout: 15000 },
                  (error: Error | null, stdout: string) => (error ? reject(error) : resolve(stdout))
                )
            })
          : '[]'
      return {
        skipTaskbar: (window as any).__testSkipTaskbar,
        title: window.getTitle(),
        appId: (window as any).__testAppId,
        nativeIcons: JSON.parse(output),
        iconMatchesFeature: code
          ? (window as any).__testIconPng ===
            nativeImage
              .createFromPath(
                app.getAppPath() + `/internal-plugins/system/public/icons/${code}.png`
              )
              .toPNG()
              .toString('base64')
          : undefined
      }
    },
    { id: windowId, code: featureCode }
  )
}
