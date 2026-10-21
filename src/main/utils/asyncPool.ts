/**
 * 保持输入顺序执行有界异步工作，避免为大批文件一次创建全部 I/O 请求。
 * @param items 待处理条目。
 * @param concurrency 最大同时执行数。
 * @param operation 单项异步操作。
 * @returns 与输入顺序一致的处理结果。
 * @throws 并发数无效或任一操作失败时抛出；失败后先等待已开始的操作收束。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Invalid concurrency')
  const results = new Array<R>(items.length)
  let cursor = 0
  let failed = false
  let failure: unknown
  // 只创建固定数量的消费者，结果占位不包含一份逐条排队的 Promise。
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) },
      async () => {
        while (!failed && cursor < items.length) {
          const index = cursor++
          try {
            results[index] = await operation(items[index])
          } catch (error) {
            if (!failed) failure = error
            failed = true
          }
        }
      }
    )
  )
  if (failed) throw failure
  return results
}
