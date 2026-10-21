const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('recorder', {
  /**
   * 订阅本窗口拥有的录制状态。
   * @param {Function} callback 状态处理器。
   * @returns {void} 无返回值。
   */
  onState(callback) {
    ipcRenderer.on('recorder:state', (_, state) => callback(state))
    ipcRenderer.send('recorder:ready')
  },
  /**
   * 请求停止当前控制条拥有的录制。
   * @returns {void} 无返回值。
   */
  stop() {
    ipcRenderer.send('recorder:stop')
  },
  /**
   * 提交当前区域选择窗口内的相对坐标，空值表示取消。
   * @param {object|null} rect 所选矩形。
   * @returns {void} 无返回值。
   */
  select(rect) {
    ipcRenderer.send('recorder:region', rect)
  },
  /**
   * 获取所属区域选择器的初始选项，不访问入口工具页面。
   * @param {Function} callback 选项处理器。
   * @returns {void} 无返回值。
   */
  onRegion(callback) {
    ipcRenderer.on('recorder:region-options', (_, value) => callback(value))
    ipcRenderer.send('recorder:region-ready')
  }
})
