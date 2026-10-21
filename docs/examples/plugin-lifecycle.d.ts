/** TabDo session-v1 前台与必要任务共用的资源作用域。 */
export interface PluginScope {
  readonly signal: AbortSignal
  /**
   * 登记幂等清理器，已退出作用域立即释放迟到资源。
   * @param cleanup 释放所属资源的回调。
   * @returns 可主动提前释放并撤销登记的函数。
   * @throws 清理器不是函数时抛出 TypeError。
   */
  addCleanup(cleanup: () => void | Promise<void>): () => Promise<void>
  /**
   * 登记完整的有限必要任务链，前台退出后等待其收束。
   * @param operation 使用独立作用域执行的保存、发布及清理操作。
   * @param timeoutMs 默认60000毫秒，上限600000毫秒。
   * @returns 任务结果，失败或超时会拒绝。
   * @throws 作用域已退出、无效时限、任务失败或超时时抛错。
   */
  runTask<T>(operation: (task: PluginScope) => T | Promise<T>, timeoutMs?: number): Promise<T>
  /**
   * 立即结束前台并等待已登记任务与清理完成。
   * @returns 所属资源和任务收束后的 Promise。
   */
  dispose(): Promise<void>
}
