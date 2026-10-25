const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('textFloat', {
  /**
   * 从当前拖动手势发起原生文件拖放，不等待调用结果阻塞手势。
   * @param {string[]} ids 当前选择的条目标识，由宿主校验内容与归属。
   * @returns {void} 无返回值；失败通过onError反馈。
   */
  startDrag: (ids) => ipcRenderer.send('tools-text-float-drag', ids),
  invoke: (action, value) => ipcRenderer.invoke('tools-text-float', action, value),
  /**
   * 订阅宿主追加的中转条目。
   * @param {function(object[]): void} callback 收到条目的处理器。
   * @returns {function(): void} 取消本次订阅。
   */
  onAppend(callback) {
    const listener = (_event, texts) => callback(texts)
    ipcRenderer.on('tools-text-float-append', listener)
    return () => ipcRenderer.removeListener('tools-text-float-append', listener)
  },
  /**
   * 订阅容量或内容失败提示。
   * @param {function(string): void} callback 提示处理器。
   * @returns {function(): void} 取消订阅。
   */
  onError(callback) {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('tools-text-float-error', listener)
    return () => ipcRenderer.removeListener('tools-text-float-error', listener)
  }
})
