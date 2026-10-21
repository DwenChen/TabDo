import type { ConsoleTransport } from 'electron-log'

/**
 * 判断控制台写入失败是否来自已经关闭的标准输出管道。
 * @param error 流事件或控制台同步抛出的错误。
 * @returns 是否为 EPIPE；其他异常必须保持可见。
 */
function isBrokenPipe(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'EPIPE'
}

/**
 * 保护日志的控制台传输，父终端关闭后停止控制台写入，保留文件日志与日志订阅。
 * @param transport electron-log 的控制台传输。
 * @param streams 控制台使用的标准输出与错误流。
 * @returns 移除监听并恢复传输写入方法的清理函数。
 */
export function installConsolePipeGuard(
  transport: ConsoleTransport,
  streams: NodeJS.WriteStream[] = [process.stdout, process.stderr]
): () => void {
  const originalWrite = transport.writeFn
  /**
   * 只处理已断开的控制台管道；其他流错误仍交给异常处理链。
   * @param error 输出流错误。
   * @returns 无返回值。
   * @throws 非 EPIPE 的错误保持抛出。
   */
  function handleError(error: unknown): void {
    if (!isBrokenPipe(error)) throw error
    // 不向故障流再次记日志，避免在错误处理期间递归触发弹窗。
    transport.level = false
  }
  // Electron 的控制台可能同步抛错，也可能由 Socket 异步发出 error，两条路径均需保护。
  transport.writeFn = (options): void => {
    try {
      originalWrite.call(transport, options)
    } catch (error) {
      handleError(error)
    }
  }
  for (const stream of streams) stream.on('error', handleError)
  return (): void => {
    for (const stream of streams) stream.removeListener('error', handleError)
    transport.writeFn = originalWrite
  }
}
