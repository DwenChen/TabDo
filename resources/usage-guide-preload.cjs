const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('guide', {
  /**
   * 只发送受限引导动作，不提供伪造完成或任意工具执行入口。
   * @param {string | {type: 'layout', width: number, height: number}} action 当前显示的动作或提示卡尺寸。
   * @returns {Promise<void>} 动作处理完成后的 Promise。
   */
  action: (action) => ipcRenderer.invoke('usage-guide:action', action),
  /**
   * 订阅本次覆盖窗口的纯展示状态。
   * @param {Function} callback 状态接收函数。
   * @returns {Function} 注销当前订阅的函数。
   */
  onState(callback) {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('usage-guide:state', listener)
    return () => ipcRenderer.removeListener('usage-guide:state', listener)
  }
})
