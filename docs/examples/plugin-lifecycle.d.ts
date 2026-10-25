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

/** 当前插件页面的临时窗口属性，作为 tabdo API 的组成部分。 */
export interface PluginWindowSession {
  /**
   * enableTemporaryResident的兼容别名，仅声明能力，不直接启用常驻。
   * @param enabled 是否支持特性。
   * @returns 当前用户开关状态；窗口关闭后失效。
   * @throws 调用会话无效时拒绝。
   */
  setTemporaryResident(enabled: boolean): Promise<boolean>
  /**
   * 声明当前会话支持宿主标题栏开关；声明不会启用常驻。
   * @param enabled 是否提供此能力，默认true。
   * @returns 当前用户开关状态，由宿主标题栏点击改变。
   */
  enableTemporaryResident(enabled?: boolean): Promise<boolean>
  /**
   * 读取当前页面临时常驻属性。
   * @returns 本会话状态。
   */
  isTemporaryResident(): Promise<boolean>
}
