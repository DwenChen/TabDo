import { registerPluginApiServices } from './pluginApiDispatcher'
class PluginUserAPI {
  /** 注册离线用户兼容接口。
+   * @returns 无返回值。
+   */
  public init(): void {
    registerPluginApiServices({ getUser: this.getUser, getUserTempToken: this.getToken })
  }
  /** 返回无账户状态。
+   * @param event 插件 IPC 事件。
+   * @returns 无返回值。
+   */
  private getUser(event: Electron.IpcMainEvent): void {
    event.returnValue = null
  }
  /** 明确拒绝依赖已移除账户的令牌调用。
+   * @returns 不会正常返回。
+   * @throws 本版不提供账户令牌。
+   */
  private getToken(): never {
    throw new Error('本地版不提供账户与账户令牌')
  }
}
export default new PluginUserAPI()
