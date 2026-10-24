const { ToolLifecycle } = require('./tool-lifecycle.cjs')

// 在页面加载前创建作用域，退出发生于 Vue 挂载前也可以及时完成清理。
const lifecycle = window.tabdo?.lifecycle || new ToolLifecycle()
window.toolsLifecycle = lifecycle
const { clipboard, webUtils, ipcRenderer } = require('electron')
const { readImage, createFilesBridge } = require('./tools-files.cjs')
const { pathToFileURL } = require('node:url')
window.toolsFiles = createFilesBridge(lifecycle)
window.toolsMedia = {
  /**
   * 在独立进程执行读图或已登记的媒体批次，所属监听随请求结束释放。
   * @param {object} request 有界操作和文件来源。
   * @param {AbortSignal} signal 前台或必要任务取消信号。
   * @param {Function} progress 进度回调。
   * @returns {Promise<object[]>} 媒体行与结果。
   */
  async run(request, signal, progress) {
    const id = crypto.randomUUID()
    /**
     * 取消此页面的这一次请求。
     * @returns {void} 无返回值。
     */
    const cancel = () => void ipcRenderer.invoke('internal:tools-media-cancel', id).catch(() => {})
    /**
     * 只把当前请求的进度交给仍存活的回调。
     * @param {object} _event IPC 事件。
     * @param {string} requestId 请求身份。
     * @param {object} value 进度内容。
     * @returns {void} 无返回值。
     */
    const receive = (_event, requestId, value) => {
      if (requestId === id && !signal?.aborted) progress?.(value)
    }
    if (signal?.aborted) throw new Error('处理已取消')
    ipcRenderer.on('internal:tools-media-progress', receive)
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      return await ipcRenderer.invoke('internal:tools-media', { ...request, id })
    } finally {
      signal?.removeEventListener('abort', cancel)
      ipcRenderer.removeListener('internal:tools-media-progress', receive)
    }
  }
}
window.toolsQuickOpen = {
  /**
   * 执行已登记的网页搜索，取消时只终止本次菜单或上传。
   * @param {object} request 搜索输入与网站配置。
   * @param {AbortSignal} signal 必要任务的取消信号。
   * @returns {Promise<object>} 默认浏览器的打开结果。
   */
  async launch(request, signal) {
    /**
     * 取消本请求的菜单或上传。
     * @returns {void} 无返回值。
     */
    const cancel = () =>
      void ipcRenderer.invoke('internal:tools-web-cancel', request.id).catch(() => {})
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      if (signal?.aborted) return { cancelled: true }
      return await ipcRenderer.invoke('internal:tools-web-open', request)
    } finally {
      signal?.removeEventListener('abort', cancel)
    }
  }
}
window.toolsRecorder = {
  /**
   * 主动停止当前录屏并等待保存收尾。
   * @returns {Promise<void>} 保存完成后的 Promise。
   */
  stop() {
    return ipcRenderer.invoke('internal:tools-recorder-stop')
  },
  /**
   * 列举可录制的屏幕与窗口，不保留捕获流。
   * @param {string} mode 全屏或窗口模式。
   * @returns {Promise<object>} 系统支持状态与来源缩略图。
   */
  sources(mode = 'screen') {
    return ipcRenderer.invoke('internal:tools-recorder-sources', mode)
  },
  /**
   * 将纯录制选项交给独立控制条；旧工具页面随后可以销毁。
   * @param {object} options 录制来源、声音与鼠标选项。
   * @param {AbortSignal} signal 启动任务的取消信号。
   * @returns {Promise<object>} 启动结果。
   */
  async start(options, signal) {
    /**
     * 取消本请求尚未转交的录制启动链。
     * @returns {void} 无返回值。
     */
    const cancel = () =>
      void ipcRenderer.invoke('internal:tools-recorder-cancel', options.id).catch(() => {})
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      if (signal?.aborted) return { cancelled: true }
      return await ipcRenderer.invoke('internal:tools-recorder-start', options)
    } finally {
      signal?.removeEventListener('abort', cancel)
    }
  }
}
window.toolsProvider = {
  /**
   * 正确编码本地路径中的空格、井号与 Unicode 字符。
   * @param {string} file 本地绝对路径。
   * @returns {string} 文件 URL。
   */
  fileUrl(file) {
    return pathToFileURL(file).href
  },
  /**
   * 读取普通文字供用户主动悬浮为便签。
   * @returns {string} 当前剪贴板文字。
   */
  clipboardText() {
    return clipboard.readText()
  },
  /**
   * 读取剪贴板图片，兼容资源管理器复制的图片文件。
   * @returns {string} 图片 data URI，无图片时返回空串。
   */
  clipboardImage() {
    const files = window.tabdo.getCopyedFiles?.() || []
    if (files[0]?.path && /\.(png|jpe?g|gif|bmp|webp)$/i.test(files[0].path)) {
      try {
        return readImage(files[0].path)
      } catch {
        return ''
      }
    }
    const image = clipboard.readImage()
    return image.isEmpty() || clipboard.readText().trim() ? '' : image.toDataURL()
  },
  /**
   * 通过 Electron 获取用户拖入或选择的原生 File 对应的本地文件路径。
   * @param {File} file 用户选择的文件对象。
   * @returns {string} 文件的本地绝对路径。
   */
  filePath(file) {
    return webUtils.getPathForFile(file)
  },
  /**
   * 读取宿主传入的图片路径，为页面提供可显示的 data URI。
   * @param {string} file 用户明确选中的图片路径。
   * @returns {string} 图片 data URI。
   * @throws {Error} 输入不是支持的图片或读取失败时抛出。
   */
  readImage(file) {
    return readImage(file)
  }
}
// 捕获本次会话，避免旧文档的卸载事件通过 window 引用清理后续新会话。
window.addEventListener('beforeunload', () => void lifecycle.dispose(), { once: true })
