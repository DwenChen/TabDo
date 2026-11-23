const { contextBridge, ipcRenderer } = require('electron')

// 选词窗口只暴露正文订阅、复制和关闭能力，不向页面开放任意 IPC 通道。
contextBridge.exposeInMainWorld('wordPicker', {
  /**
   * 订阅主进程推送的拆分结果。
   * @param {Function} callback 接收词语快照的回调。
   * @returns {Function} 取消订阅函数。
   */
  onData: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('word-picker-data', listener)
    return () => ipcRenderer.removeListener('word-picker-data', listener)
  },
  /**
   * 把选中的词语写入剪贴板并登记为文本记录。
   * @param {string} text 待复制的文本。
   * @returns {Promise<object>} 主进程复制结果。
   */
  copy: (text) => ipcRenderer.invoke('word-picker-copy', text),
  /**
   * 请求关闭当前选词窗口。
   * @returns {void}
   */
  close: () => ipcRenderer.send('word-picker-close')
})
