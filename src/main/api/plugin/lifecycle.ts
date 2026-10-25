import { ipcMain } from 'electron'
import type { PluginManager } from '../../managers/pluginManager'
import windowManager from '../../managers/windowManager'
import detachedWindowManager from '../../core/detachedWindowManager'
import {
  enableTemporaryResident,
  supportsTemporaryResident,
  isTemporaryResident,
  setTemporaryResident
} from '../../core/temporaryResidency'

/**
 * 插件生命周期API - 插件专用
 */
export class PluginLifecycleAPI {
  private pluginManager: PluginManager | null = null
  private launchParam: any = null
  private mainWindow: Electron.BrowserWindow | null = null

  public init(mainWindow: Electron.BrowserWindow, pluginManager: PluginManager): void {
    this.pluginManager = pluginManager
    this.mainWindow = mainWindow
    this.setupIPC()
  }

  public setLaunchParam(param: any): void {
    this.launchParam = param
  }

  /**
   * 注册按调用会话校验的进入、退出与临时常驻接口。
   * @returns 无返回值；各调用在所属窗口关闭后失效。
   */
  private setupIPC(): void {
    // 正文只声明能力；实际开关只能从受验证的宿主标题栏操作。
    ipcMain.handle('plugin:temporary-resident', (event, enabled?: boolean) => {
      if (!this.pluginManager?.getPluginInfoByWebContents(event.sender))
        throw new Error('当前插件会话不可用')
      if (enabled === undefined) return isTemporaryResident(event.sender)
      if (typeof enabled !== 'boolean') throw new TypeError('临时常驻开关必须是布尔值')
      enableTemporaryResident(event.sender, enabled)
      this.mainWindow?.webContents?.send('temporary-residency-changed')
      const owner = detachedWindowManager.getWindowByPluginWebContents(event.sender.id)
      owner?.webContents.send('temporary-residency-changed')
      if (!enabled && owner && (!owner.isVisible() || owner.isMinimized())) owner.close()
      return isTemporaryResident(event.sender)
    })
    ipcMain.handle('host:temporary-resident', async (event, toggle = false) => {
      const contents =
        event.sender === this.mainWindow?.webContents
          ? this.pluginManager?.getCurrentPluginView()?.webContents
          : detachedWindowManager.getPluginForTitlebar(event.sender)
      if (!contents || contents.isDestroyed()) return { supported: false, enabled: false }
      if (!toggle)
        return {
          supported: supportsTemporaryResident(contents),
          enabled: isTemporaryResident(contents)
        }
      if (!supportsTemporaryResident(contents)) throw new Error('当前会话未启用临时常驻特性')
      const enabled = !isTemporaryResident(contents)
      let owner = detachedWindowManager.getWindowByPluginWebContents(contents.id)
      if (enabled && !owner) {
        if (this.pluginManager?.getCurrentPluginView()?.webContents !== contents)
          throw new Error('仅前台或独立窗口支持临时常驻')
        const result = await this.pluginManager.detachCurrentPlugin()
        if (!result.success) throw new Error(result.error || '创建常驻窗口失败')
        owner = detachedWindowManager.getWindowByPluginWebContents(contents.id)
      }
      if (contents.isDestroyed() || (enabled && !owner)) throw new Error('插件窗口已关闭')
      setTemporaryResident(contents, enabled)
      owner?.webContents.send('temporary-residency-changed')
      this.mainWindow?.webContents?.send('temporary-residency-changed')
      // 用户取消即结束本次常驻独立会话；已登记任务仍沿普通关闭链收尾，不强制终止。
      if (!enabled && owner) {
        const closingWindow = owner
        setImmediate(() => {
          if (!closingWindow.isDestroyed()) closingWindow.close()
        })
      }
      return { supported: true, enabled }
    })
    // 插件进入事件
    ipcMain.handle('onPluginEnter', () => {
      console.log('[PluginLifecycle] 收到插件进入事件:', this.launchParam)
      return this.launchParam
    })

    // 退出插件
    ipcMain.handle('out-plugin', (event, isKill: boolean = false) => {
      console.log('[PluginLifecycle] out-plugin', isKill)
      const pluginInfo = this.pluginManager?.getPluginInfoByWebContents(event.sender)
      console.log('[PluginLifecycle] pluginInfo', pluginInfo)
      if (!pluginInfo) {
        return false
      }

      this.pluginManager?.hidePluginView()
      windowManager.notifyBackToSearch()
      // 主窗口获取焦点（确保前端的 focus() 调用能生效）
      this.mainWindow?.webContents.focus()

      if (isKill) {
        return this.pluginManager?.killPlugin(pluginInfo.path)
      } else {
        // 发送插件退出事件（isKill=false 表示正常退出）
        event.sender.send('plugin-out', false)
        return true
      }
    })
  }
}

export default new PluginLifecycleAPI()
