const { spawn } = require('node:child_process')
const path = require('node:path')
const { createInterface } = require('node:readline')

/**
 * 为当前工具会话建立文件占用查询桥接。
 * PowerShell 辅助进程按次启动，退出或取消时结束，不保留常驻后台服务。
 * @param {object} lifecycle 当前工具的资源作用域。
 * @returns {object} 查询与结束进程的受限接口。
 */
function createFileLocksmithBridge(lifecycle) {
  let worker
  let lines
  let stderr = ''
  let nextId = 0
  let stopped = false
  let closing = null
  const pending = new Map()

  /**
   * 关闭辅助进程和全部待处理请求。
   * @returns {Promise<void>} 进程退出后的 Promise。
   */
  async function dispose() {
    if (stopped) return
    stopped = true
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(new Error('文件占用查询已取消'))
    }
    pending.clear()
    lines?.close()
    lines = undefined
    if (worker && worker.exitCode === null) {
      const child = worker
      const closed = new Promise((resolve) => child.once('close', resolve))
      child.stdin.end()
      child.kill()
      await closed
    }
    worker = undefined
    stderr = ''
  }

  lifecycle.addCleanup(dispose)

  /**
   * 按需启动 PowerShell 辅助进程。
   * @returns {void} 无返回值。
   * @throws 辅助进程无法启动时抛出。
   */
  function ensureWorker() {
    if (worker && worker.exitCode === null) return
    if (stopped || lifecycle.signal.aborted) throw new Error('工具已退出')
    worker = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(__dirname, 'file-locksmith.ps1')
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    lines = createInterface({ input: worker.stdout })
    worker.stderr.on('data', (data) => {
      stderr = (stderr + data).slice(-3000)
    })
    lines.on('line', (line) => {
      let response
      try {
        response = JSON.parse(line)
      } catch {
        return
      }
      const item = pending.get(response.id)
      if (!item) return
      clearTimeout(item.timer)
      pending.delete(response.id)
      if (response.ok === false) item.reject(new Error(response.error || '文件占用查询失败'))
      else item.resolve(response)
    })
    worker.once('error', (error) => {
      for (const item of pending.values()) {
        clearTimeout(item.timer)
        item.reject(error)
      }
      pending.clear()
    })
    worker.once('close', () => {
      const message = stderr.trim()
      for (const item of pending.values()) {
        clearTimeout(item.timer)
        item.reject(new Error(message || '文件占用辅助进程已退出'))
      }
      pending.clear()
      worker = undefined
      lines?.close()
      lines = undefined
    })
    worker.stdin.on('error', () => {})
  }

  /**
   * 发送一条有界请求并等待对应响应。
   * @param {string} action 操作名称。
   * @param {object} payload 操作参数。
   * @param {AbortSignal} signal 工具会话取消信号。
   * @param {number} timeoutMs 超时毫秒数。
   * @returns {Promise<object>} PowerShell 返回的结构化结果。
   */
  function request(action, payload, signal, timeoutMs) {
    if (closing) return closing.then(() => request(action, payload, signal, timeoutMs))
    if (signal?.aborted || lifecycle.signal.aborted) {
      return Promise.reject(new Error('文件占用查询已取消'))
    }
    try {
      ensureWorker()
    } catch (error) {
      return Promise.reject(error)
    }
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('文件占用查询超时'))
        void stop()
      }, timeoutMs)
      const onAbort = () => {
        pending.delete(id)
        clearTimeout(timer)
        reject(new Error('文件占用查询已取消'))
        void stop()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener('abort', onAbort)
          resolve(value)
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort)
          reject(error)
        },
        timer
      })
      worker.stdin.write(JSON.stringify({ ...payload, action, id }) + '\n')
    })
  }

  /**
   * 结束辅助进程，供子组件切换时快速收束。
   * @returns {Promise<void>} 进程退出后的 Promise。
   */
  function stop() {
    if (closing) return closing
    closing = dispose().finally(() => {
      closing = null
      // 前台取消后仍允许重新查询；只有整个工具会话退出时才保持停止。
      if (!lifecycle.signal.aborted) stopped = false
    })
    return closing
  }

  return {
    /**
     * 查询指定文件或文件夹被哪些进程占用。
     * @param {string[]} paths 用户匹配到的本地绝对路径。
     * @param {AbortSignal} signal 工具会话取消信号。
     * @returns {Promise<{processes: object[], errors: object[]}>} 进程与文件级错误。
     */
    scan(paths, signal) {
      if (!Array.isArray(paths) || !paths.length || paths.length > 20) {
        return Promise.reject(new Error('请选择 1–20 个文件或文件夹'))
      }
      // 大目录递归和分批注册可能超过半分钟，保留完整扫描但允许用户随时取消。
      return request('scan', { paths }, signal, 120000)
    },
    /**
     * 结束用户确认的进程。
     * @param {number[]} pids 目标进程 ID。
     * @param {AbortSignal} signal 必要任务取消信号。
     * @returns {Promise<{results: object[]}>} 逐进程结果。
     */
    kill(pids, signal) {
      if (!Array.isArray(pids) || !pids.length) {
        return Promise.reject(new Error('未指定要结束的进程'))
      }
      return request('kill', { pids }, signal, 15000)
    },
    stop
  }
}

module.exports = { createFileLocksmithBridge }
