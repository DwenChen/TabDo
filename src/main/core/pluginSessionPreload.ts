import type { Session } from 'electron'

/**
 * 确保同一 Session 的公共 frame preload 只注册一次，主视图和子窗口共享该注册。
 * @param sess 目标插件 Session。
 * @param filePath 公共 preload 的绝对路径。
 * @returns 无返回值。
 */
export function ensurePluginSessionPreload(sess: Session, filePath: string): void {
  // 查询 Session 的真实注册表，避免视图切换累积脚本，也允许注销后重新创建。
  if (
    sess
      .getPreloadScripts()
      .some((script) => script.type === 'frame' && script.filePath === filePath)
  )
    return
  sess.registerPreloadScript({ type: 'frame', filePath })
}
