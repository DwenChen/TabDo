const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('quickMenu', {
  /**
   * 接收本次请求启用的网站列表。
   * @param {Function} callback 网站列表处理器。
   * @returns {void} 无返回值。
   */
  onItems(callback) {
    ipcRenderer.on('tools-web:items', (_, items) => callback(items))
    ipcRenderer.send('tools-web:ready')
  },
  /**
   * 提交网站选择，宿主验证本窗口和网站标识。
   * @param {string} id 网站标识，空串表示取消。
   * @returns {void} 无返回值。
   */
  select(id) {
    ipcRenderer.send('tools-web:selection', id)
  }
})
