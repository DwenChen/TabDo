import type { WebContents } from 'electron'

const residents = new WeakSet<WebContents>()
const supported = new WeakSet<WebContents>()

/**
 * 声明会话是否支持宿主临时常驻开关，声明本身不启用常驻。
 * @param contents 所属插件正文。
 * @param enabled 是否向用户提供开关。
 * @returns 无返回值，关闭能力同时撤销临时常驻。
 */
export function enableTemporaryResident(contents: WebContents, enabled: boolean): void {
  if (enabled && !contents.isDestroyed()) supported.add(contents)
  else {
    supported.delete(contents)
    residents.delete(contents)
  }
}

/**
 * 查询当前会话的开关可用性。
 * @param contents 所属插件正文。
 * @returns 是否声明支持且会话仍存活。
 */
export function supportsTemporaryResident(contents: WebContents): boolean {
  return !contents.isDestroyed() && supported.has(contents)
}

/**
 * 读取单个运行会话的临时常驻状态，不写入用户配置。
 * @param contents 所属插件页面。
 * @returns 当前页面是否临时常驻。
 */
export function isTemporaryResident(contents: WebContents): boolean {
  return !contents.isDestroyed() && residents.has(contents)
}

/**
 * 更新由用户界面明确切换的临时常驻属性。
 * @param contents 所属插件页面。
 * @param enabled 是否保留当前独立窗口的会话。
 * @returns 无返回值；页面销毁后状态自然失效。
 */
export function setTemporaryResident(contents: WebContents, enabled: boolean): void {
  if (enabled && !contents.isDestroyed()) residents.add(contents)
  else residents.delete(contents)
}
