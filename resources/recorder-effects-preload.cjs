const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('recorderEffects', {
  /**
   * 仅接收宿主投递的本会话输入效果，不暴露主动 IPC 或 Node。
   * @param {Function} receive 效果绘制回调。
   * @returns {void} 无返回值。
   */
  listen(receive) {
    ipcRenderer.on('recorder:effect', (_event, value) => receive(value))
  }
})
