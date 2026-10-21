import type { WebContents } from 'electron'

/**
 * 执行一次插件 IPC 请求，成功、超时、发送失败或页面销毁时都撤销监听。
 * @param contents 目标插件运行时。
 * @param requestChannel 请求通道。
 * @param responseChannel 本次请求专属响应通道。
 * @param payload 请求负载。
 * @param timeoutMs 最长等待时间。
 * @returns 插件结果；超时或页面销毁时返回 undefined。
 * @throws 发送请求失败时抛出。
 */
export function requestPluginResponse<T>(
  contents: WebContents,
  requestChannel: string,
  responseChannel: string,
  payload: unknown,
  timeoutMs: number
): Promise<T | undefined> {
  if (contents.isDestroyed()) return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    /**
     * 撤销本请求的计时器和两个监听，不保留过期的回调与输入负载。
     * @returns 无返回值。
     */
    const cleanup = (): void => {
      clearTimeout(timer)
      contents.ipc.removeListener(responseChannel, receive)
      contents.removeListener('destroyed', destroyed)
    }
    /**
     * 页面销毁后立即结束等待，调用方使用原有无结果策略。
     * @returns 无返回值。
     */
    const destroyed = (): void => {
      cleanup()
      resolve(undefined)
    }
    /**
     * 接收本次唯一响应并解除监听。
     * @param _event 插件 IPC 事件。
     * @param result 插件返回值。
     * @returns 无返回值。
     */
    const receive = (_event: Electron.IpcMainEvent, result: T): void => {
      cleanup()
      resolve(result)
    }
    const timer = setTimeout(destroyed, timeoutMs)
    contents.ipc.once(responseChannel, receive)
    contents.once('destroyed', destroyed)
    try {
      contents.send(requestChannel, payload)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
