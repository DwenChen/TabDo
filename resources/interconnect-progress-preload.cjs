const { contextBridge, ipcRenderer } = require('electron')

// 进度窗只暴露订阅与关闭能力，不把任意 IPC 通道交给页面。
contextBridge.exposeInMainWorld('interconnectProgress', {
  /**
   * 订阅主进程推送的传输快照。
   * @param {Function} callback 接收最新快照的回调。
   * @returns {Function} 取消订阅函数。
   */
  onUpdate: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('interconnect-transfer-update', listener)
    return () => ipcRenderer.removeListener('interconnect-transfer-update', listener)
  },
  /**
   * 请求关闭当前进度窗。
   * @returns {void}
   */
  close: () => ipcRenderer.send('interconnect-progress-close'),
  /**
   * 清除已完成和失败的传输记录，不删除文件或进行中的任务。
   * @returns {void}
   */
  clearHistory: () => ipcRenderer.send('interconnect-clear-transfers'),
  /**
   * 重新发起失败的发件任务。
   * @param {string} transferId 任务标识。
   * @returns {void}
   */
  retryTransfer: (transferId) => ipcRenderer.send('interconnect-retry-transfer', transferId),
  /**
   * 在资源管理器中定位成功任务的本地文件。
   * @param {string} transferId 任务标识。
   * @param {number} fileIndex 文件序号。
   * @returns {void}
   */
  revealFile: (transferId, fileIndex) =>
    ipcRenderer.send('interconnect-reveal-file', transferId, fileIndex),
  /**
   * 提交多设备选择窗口中的目标设备。
   * @param {string} deviceId 设备标识。
   * @returns {void}
   */
  chooseDevice: (deviceId) => ipcRenderer.send('interconnect-choose-device', deviceId)
})
