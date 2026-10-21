import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getTabDoRoot } from './appDataPaths'

const LEGACY_USER_DATA_ENV = 'TABDO_LEGACY_USER_DATA_PATH'

/**
 * 在任何会话创建前统一设置资料与 Chromium 缓存位置，并保留旧版导入来源。
 * @returns 无返回值。
 */
export function configureAppDataRoot(): void {
  if (!process.env[LEGACY_USER_DATA_ENV]) {
    // 首次更名时仍发现旧版 Chromium/数据库资料；显式隔离根不探测真实资料。
    const current = app.getPath('userData')
    const previous = path.join(path.dirname(current), 'ZTools')
    process.env[LEGACY_USER_DATA_ENV] =
      process.env.ZTOOLS_LEGACY_USER_DATA_PATH ||
      (!process.env.TABDO_DATA_ROOT && fs.existsSync(previous) ? previous : current)
  }
  const root = getTabDoRoot()
  if (app.getPath('userData') !== root) {
    app.setPath('userData', root)
  }
  // 缓存与浏览器分区也跟随所选目录，不能遗留在系统默认的旧位置。
  app.setPath('sessionData', root)
}

configureAppDataRoot()
