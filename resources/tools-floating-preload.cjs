const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('floating', {
  /**
   * 订阅本次运行中整组便签的贴靠偏好。
   * @param {function(boolean): void} callback 开关状态接收者。
   * @returns {function(): void} 移除订阅的清理函数。
   */
  onDockPreference: (callback) => {
    const listener = (_event, enabled) => callback(enabled)
    ipcRenderer.on('tools-floating-dock-preference', listener)
    return () => ipcRenderer.removeListener('tools-floating-dock-preference', listener)
  },
  /**
   * 接收宿主根据系统坐标判断的鼠标进入状态，覆盖原生拖动区域。
   * @param {function(boolean): void} callback 接收鼠标是否处于窗口内。
   * @returns {function(): void} 移除订阅的清理函数。
   */
  onPointer: (callback) => {
    const listener = (_event, inside) => callback(inside)
    ipcRenderer.on('tools-floating-pointer', listener)
    return () => ipcRenderer.removeListener('tools-floating-pointer', listener)
  },
  /**
   * 订阅当前便签的边缘贴靠状态。
   * @param {function(object|null): void} callback 当前标签与展开状态的接收者。
   * @returns {function(): void} 移除订阅的清理函数。
   */
  onDock: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('tools-floating-dock', listener)
    return () => ipcRenderer.removeListener('tools-floating-dock', listener)
  },
  /**
   * 将有限的悬浮操作发给拥有当前窗口的宿主。
   * @param {string} action 操作名称。
   * @param {unknown} value 操作参数。
   * @returns {Promise<unknown>} 宿主操作结果。
   */
  invoke: (action, value) => ipcRenderer.invoke('tools-floating', action, value),
  /**
   * 只订阅本窗口的文字追加消息，页面退役时可立即解除监听。
   * @param {function(string[]): void} callback 接收本批新增文字的回调。
   * @returns {function(): void} 移除本次监听的清理函数。
   */
  onAppend: (callback) => {
    const listener = (_event, texts) => callback(texts)
    ipcRenderer.on('tools-floating-append', listener)
    return () => ipcRenderer.removeListener('tools-floating-append', listener)
  }
})
