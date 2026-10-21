const CLEANUP_TIMEOUT_MS = 5_000
const MAX_TASK_TIMEOUT_MS = 600_000

/**
 * 管理一个工具会话的临时资源，以及退到后台后必须完成的有限任务。
 */
class ToolLifecycle {
  /**
   * 创建独立会话；子任务使用自己的资源作用域，避免延长界面资源的生命周期。
   * @returns {ToolLifecycle} 新的资源作用域。
   */
  constructor() {
    this.controller = new AbortController()
    this.cleanups = new Set()
    this.tasks = new Set()
    this.disposal = null
  }

  /**
   * 提供可取消查询、监听和加载操作共用的终止信号。
   * @returns {AbortSignal} 当前作用域的终止信号。
   */
  get signal() {
    return this.controller.signal
  }

  /**
   * 登记清理回调；迟到的资源在登记时立即释放，不能重新激活旧会话。
   * @param {Function} cleanup 释放模型、工作线程、进程树、监听或缓存的幂等回调。
   * @returns {Function} 可主动提前释放资源的幂等函数。
   * @throws {TypeError} 清理回调不是函数时抛出。
   */
  addCleanup(cleanup) {
    if (typeof cleanup !== 'function') throw new TypeError('cleanup must be a function')
    let released = false
    /**
     * 提前释放本项资源并撤销登记，避免长会话累积已完成资源的闭包。
     * @returns {Promise<void>} 资源收束后的 Promise。
     */
    const dispose = async () => {
      if (released) return
      released = true
      this.cleanups.delete(dispose)
      await this.release(cleanup)
    }
    // 已退出的异步加载结果不得留存新资源。
    if (this.signal.aborted) void dispose()
    else this.cleanups.add(dispose)
    return dispose
  }

  /**
   * 执行单项清理，隔离失败并限制挂起的清理器，保证其余资源继续释放。
   * @param {Function} cleanup 待执行的清理回调。
   * @returns {Promise<void>} 清理结束或超过释放时限后的 Promise。
   */
  async release(cleanup) {
    let timer
    try {
      // 先调用清理器，确保同步撤销监听和终止请求不被推迟。
      const result = cleanup()
      await Promise.race([
        result,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Tool cleanup timed out')), CLEANUP_TIMEOUT_MS)
        })
      ])
    } catch (error) {
      console.error('[ToolsLifecycle] 资源释放失败:', error)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 登记必须完成的保存或计算任务；成功、失败、超时均先释放任务专属资源。
   * @param {Function} operation 接收任务作用域的异步操作，所有后续步骤必须包含在返回的 Promise 内。
   * @param {number} timeoutMs 任务上限，默认一分钟，最长十分钟；超时会取消并清理。
   * @returns {Promise<unknown>} 任务结果，退到后台不会中断未超时的已登记任务。
   * @throws {Error} 会话已退出、时限无效、任务失败或超时时抛出。
   */
  runTask(operation, timeoutMs = 60_000) {
    if (this.signal.aborted) return Promise.reject(new Error('Tool session has ended'))
    if (typeof operation !== 'function')
      return Promise.reject(new TypeError('operation must be a function'))
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TASK_TIMEOUT_MS) {
      return Promise.reject(new RangeError('Task timeout must be between 1 and 600000 ms'))
    }
    const taskScope = new ToolLifecycle()
    let timer
    // 同步登记，再启动操作，覆盖操作内部立即隐藏宿主窗口的情况。
    const task = Promise.race([
      Promise.resolve().then(() => operation(taskScope)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Tool task timed out')), timeoutMs)
      })
    ]).finally(async () => {
      clearTimeout(timer)
      await taskScope.dispose()
    })
    this.tasks.add(task)
    // 单独消费追踪分支的错误；原始 Promise 仍将错误交给业务调用方。
    void task.finally(() => this.tasks.delete(task)).catch(() => {})
    return task
  }

  /**
   * 立即撤销前台资源，并在必要任务及其资源释放后结束会话；重复调用复用同一结果。
   * @returns {Promise<void>} 所有资源和必要任务收束后的 Promise。
   */
  dispose() {
    if (this.disposal) return this.disposal
    let complete
    // 先发布收束 Promise，abort 回调即使重入也只会获取同一个退出操作。
    this.disposal = new Promise((resolve) => {
      complete = resolve
    })
    // 先切换退出状态，阻止查询回填和新增后台任务。
    this.controller.abort()
    const releases = [...this.cleanups].reverse().map((cleanup) => cleanup())
    this.cleanups.clear()
    void Promise.allSettled([...releases, ...this.tasks]).then(() => complete())
    return this.disposal
  }
}

module.exports = { ToolLifecycle }
