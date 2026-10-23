import type { WebContents } from 'electron'
import { createRequire } from 'node:module'

const searches = new Map<number, { controller: AbortController; promise: Promise<any> }>()

/**
 * 从物理资源目录调用按次运行的教学脚本，不将脚本实现打包为常驻服务。
 * @param operation 受限教学操作。
 * @param input 用户操作参数。
 * @param signal 所属会话取消信号。
 * @returns 后台脚本关闭后的结果。
 * @throws 非引导、资源缺失、取消或脚本失败时拒绝。
 */
export async function invokeUsageGuideDemo(
  operation: string,
  input: object,
  signal: AbortSignal
): Promise<any> {
  const workerPath = process.env.TABDO_GUIDE_DEMO_WORKER
  if (process.env.TABDO_USAGE_GUIDE !== '1' || !workerPath)
    throw new Error('教学接口仅供隔离引导使用')
  const { runDemo } = createRequire(workerPath)(workerPath)
  return runDemo(operation, input, signal)
}

/**
 * 在主进程代理教学搜索，绕开渲染进程的后台脚本限制；每个请求绑定所属页面。
 * @param owner 已由内置工具鉴权的调用页面。
 * @param request 搜索参数或 cancel 取消请求。
 * @returns 演示搜索结果，取消时等待当前脚本关闭后返回。
 * @throws 非引导、接口未初始化、取消或脚本失败时拒绝。
 */
export async function searchUsageGuideDemo(
  owner: WebContents,
  request: Record<string, unknown>
): Promise<any> {
  if (process.env.TABDO_USAGE_GUIDE !== '1' || !process.env.TABDO_GUIDE_DEMO_WORKER)
    throw new Error('教学搜索仅供隔离引导使用')
  const previous = searches.get(owner.id)
  previous?.controller.abort()
  if (request?.cancel) {
    await previous?.promise.catch(() => {})
    return { cancelled: true }
  }
  const controller = new AbortController()
  /**
   * 页面释放后立即取消其自己的教学查询。
   * @returns 无返回值。
   */
  const destroyed = (): void => controller.abort()
  owner.once('destroyed', destroyed)
  const current = {
    controller,
    promise: invokeUsageGuideDemo('search', request, controller.signal)
  }
  searches.set(owner.id, current)
  try {
    return await current.promise
  } finally {
    owner.removeListener('destroyed', destroyed)
    // 旧查询的收尾不能删除随后发起的新查询。
    if (searches.get(owner.id) === current) searches.delete(owner.id)
  }
}
