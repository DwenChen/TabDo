import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { PluginManager } from '../../managers/pluginManager'
import interconnectService from '../../core/interconnect/service'
import type { InterconnectConfig } from '@shared/interconnect'

/**
 * 校验调用者是否允许使用内置插件 API。
 * @param pluginManager 插件管理器；未初始化时放行主渲染进程。
 * @param event IPC 调用事件。
 * @returns 允许调用时返回 true。
 */
function canUseInternalApi(
  pluginManager: PluginManager | null,
  event: IpcMainInvokeEvent
): boolean {
  if (!pluginManager) return true
  const info = pluginManager.getPluginInfoByWebContents(event.sender)
  return !info || info.canUseInternalApi
}

/**
 * 注册互联服务的内部 IPC 通道。
 *
 * 只向内置设置页暴露配置、设备与传输快照，不传递证书私钥或套接字。
 *
 * @param pluginManager 当前插件管理器。
 * @returns 无返回值。
 */
export function registerInterconnectIpc(pluginManager: PluginManager | null): void {
  ipcMain.handle('internal:interconnect-get-state', async (event) => {
    if (!canUseInternalApi(pluginManager, event)) {
      return { success: false, error: '无权访问互联服务' }
    }
    return { success: true, state: interconnectService.getState() }
  })

  ipcMain.handle(
    'internal:interconnect-save-config',
    async (event, patch: Partial<InterconnectConfig>) => {
      if (!canUseInternalApi(pluginManager, event)) {
        return { success: false, error: '无权访问互联服务' }
      }
      if (!patch || typeof patch !== 'object') {
        return { success: false, error: '参数无效' }
      }
      try {
        const state = await interconnectService.saveConfig(patch)
        return { success: true, state }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : '保存配置失败'
        }
      }
    }
  )

  ipcMain.handle('internal:interconnect-refresh', async (event) => {
    if (!canUseInternalApi(pluginManager, event)) {
      return { success: false, error: '无权访问互联服务' }
    }
    try {
      const devices = await interconnectService.refreshDevices()
      return { success: true, devices, state: interconnectService.getState() }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '刷新设备失败'
      }
    }
  })

  ipcMain.handle('internal:interconnect-pair', async (event, deviceId: string, pair: boolean) => {
    if (!canUseInternalApi(pluginManager, event)) {
      return { success: false, error: '无权访问互联服务' }
    }
    if (typeof deviceId !== 'string') return { success: false, error: '设备无效' }
    return interconnectService.pairDevice(deviceId, pair === true)
  })

  ipcMain.handle('internal:interconnect-accept-pairing', async (event, deviceId: string) => {
    if (!canUseInternalApi(pluginManager, event)) {
      return { success: false, error: '无权访问互联服务' }
    }
    if (typeof deviceId !== 'string') return { success: false, error: '设备无效' }
    return interconnectService.acceptPairing(deviceId)
  })

  ipcMain.handle('internal:interconnect-sync-clipboard', async (event, deviceId?: string) => {
    if (!canUseInternalApi(pluginManager, event)) {
      return { success: false, error: '无权访问互联服务' }
    }
    return interconnectService.syncClipboard(typeof deviceId === 'string' ? deviceId : undefined)
  })

  ipcMain.handle('internal:interconnect-choose-download-dir', async (event) => {
    if (!canUseInternalApi(pluginManager, event)) {
      return { success: false, error: '无权访问互联服务' }
    }
    try {
      const directory = await interconnectService.chooseDownloadDir()
      return directory
        ? { success: true, directory, state: interconnectService.getState() }
        : { success: false, canceled: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '选择文件夹失败'
      }
    }
  })

  ipcMain.handle('internal:interconnect-open-download-dir', async (event) => {
    if (!canUseInternalApi(pluginManager, event)) {
      return { success: false, error: '无权访问互联服务' }
    }
    try {
      await interconnectService.openDownloadDir()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '打开文件夹失败'
      }
    }
  })

  // 进度窗的关闭按钮只关闭所属窗口，不停止仍在进行的传输任务。
  ipcMain.on('interconnect-progress-close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window && !window.isDestroyed()) window.close()
  })

  // 只允许当前传输面板清理已完成和失败记录，进行中的任务与文件不受影响。
  ipcMain.on('interconnect-clear-transfers', (event) => {
    if (!interconnectService.isProgressWindow(event.sender.id)) return
    interconnectService.clearTransferHistory()
  })

  // 面板只提交任务标识和文件序号，具体路径与设备状态仍由主进程校验。
  ipcMain.on('interconnect-retry-transfer', (_event, transferId: unknown) => {
    if (typeof transferId !== 'string') return
    void interconnectService.retryTransfer(transferId).then((result) => {
      if (result.success) return
      interconnectService.notify('互联传输', result.error || '重新发起失败')
    })
  })

  ipcMain.on('interconnect-reveal-file', (_event, transferId: unknown, fileIndex: unknown) => {
    if (typeof transferId !== 'string' || typeof fileIndex !== 'number') return
    const result = interconnectService.revealTransferFile(transferId, fileIndex)
    if (!result.success) interconnectService.notify('互联传输', result.error || '无法定位文件')
  })

  ipcMain.on('interconnect-choose-device', (_event, deviceId: unknown) => {
    if (typeof deviceId !== 'string' || !deviceId) return
    interconnectService.resolveDeviceChoice(deviceId)
  })
}
