const { ipcRenderer } = require('electron')
const installUpstream = require('./presentation-preload.cjs')
/**
 * 安装当前会话的受限 IPC 桥接，并把监听与确认写入登记到工具生命周期。
 * @param {string} prefix 宿主生成的会话前缀。
 * @param {object} lifecycle 所属工具生命周期，覆盖层可省略。
 * @param {Window} destination 接收上游 API 的页面。
 * @returns {object} 当前演示 API。
 */
exports.install = function install(prefix, lifecycle, destination = window) {
  const subscribed = new Set()
  const ipc = {
    /**
     * 向本次会话发送异步请求。
     * @param {string} channel 上游通道名称。
     * @param {...unknown} args 本次输入。
     * @returns {Promise<unknown>} 所属服务的响应。
     */
    invoke(channel, ...args) {
      const operation = () => ipcRenderer.invoke(prefix + channel, ...args)
      // 确认保存、导出和导入沿完整请求收束；前台只读请求随会话销毁。
      return operation()
    },
    /**
     * 向本次会话发送无需响应的通知。
     * @param {string} channel 上游通道名称。
     * @param {...unknown} args 本次输入。
     * @returns {void} 无返回值。
     */
    send(channel, ...args) {
      ipcRenderer.send(prefix + channel, ...args)
    },
    /**
     * 在页面首帧读取本次会话的同步元数据。
     * @param {string} channel 上游通道名称。
     * @param {...unknown} args 本次输入。
     * @returns {unknown} 元数据响应。
     */
    sendSync(channel, ...args) {
      return ipcRenderer.sendSync(prefix + channel, ...args)
    },
    /**
     * 登记所属页面的服务通知监听。
     * @param {string} channel 通知名称。
     * @param {Function} listener 通知处理器。
     * @returns {object} 当前桥接适配器。
     */
    on(channel, listener) {
      ipcRenderer.on(channel, listener)
      subscribed.add([channel, listener])
      return ipc
    },
    /**
     * 解除当前页面登记的单个监听。
     * @param {string} channel 通知名称。
     * @param {Function} listener 原处理器。
     * @returns {object} 当前桥接适配器。
     */
    removeListener(channel, listener) {
      ipcRenderer.removeListener(channel, listener)
      for (const pair of subscribed)
        if (pair[0] === channel && pair[1] === listener) subscribed.delete(pair)
      return ipc
    },
    /**
     * 解除当前桥接拥有的同名监听，不触及其他工具。
     * @param {string} channel 通知名称。
     * @returns {void} 无返回值。
     */
    removeAllListeners(channel) {
      for (const pair of subscribed)
        if (pair[0] === channel) {
          ipcRenderer.removeListener(...pair)
          subscribed.delete(pair)
        }
    }
  }
  installUpstream(ipc, {
    /**
     * 将上游兼容 API 发布到本次受信任工具页面。
     * @param {string} key API 名称。
     * @param {object} value 当前会话的 API。
     * @returns {void} 无返回值。
     */
    exposeInMainWorld(key, value) {
      destination[key] = value
    }
  })
  const api = destination.electronAPI
  api.getShortcuts = () => ipcRenderer.invoke(prefix + 'tabdo-shortcuts')
  api.saveShortcuts = () =>
    Promise.resolve({ success: false, error: '请在 TabDo 设置的快捷键页调整' })
  api.getTabDoSettings = () => ipcRenderer.invoke(prefix + 'tabdo-settings')
  api.openTabDoShortcuts = () => window.tabdo?.redirectHotKeySetting?.()
  api.runNecessaryTask = (operation) =>
    lifecycle ? lifecycle.runTask(operation, 600000) : operation()
  /**
   * 撤销当前桥接仍持有的通知，退出与卸载可重复调用。
   * @returns {void} 无返回值。
   */
  const cleanup = () => {
    for (const pair of subscribed) ipcRenderer.removeListener(...pair)
    subscribed.clear()
  }
  lifecycle?.addCleanup(cleanup)
  destination.addEventListener('beforeunload', cleanup, { once: true })
  return api
}
