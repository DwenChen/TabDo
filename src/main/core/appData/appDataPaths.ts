import fs from 'fs'
import os from 'os'
import path from 'path'
import { app } from 'electron'
import { assertSafePluginArtifactPart } from '../../utils/pluginStorage.js'

export interface AppDataPathOptions {
  dataRoot?: string
  homeDir?: string
  legacyUserDataPath?: string
}

export interface TabDoDataLayout {
  root: string
  lmdbRoot: string
  deviceLmdbPath: string
  accountsRoot: string
  defaultAccountLmdbPath: string
  pluginsPath: string
  avatarPath: string
  clipboardPath: string
  extendsPath: string
  tempPath: string
  logsPath: string
  legacyLmdbPath: string
  legacyUserDataPath: string
}

/**
 * 获取启动位置记录的锚点，测试和免安装预览可通过显式配置隔离真实资料。
 *
 * @param options 数据目录解析选项。
 * @returns 存放位置记录的初始数据目录绝对路径。
 */
export function getTabDoBootstrapRoot(options: AppDataPathOptions = {}): string {
  // 显式隔离根优先；已有旧资料原地继续使用，不在线迁移数据库。
  const explicit = options.dataRoot || process.env.TABDO_DATA_ROOT || process.env.ZTOOLS_DATA_ROOT
  if (explicit) return explicit
  const home = options.homeDir || os.homedir()
  const current = path.join(home, '.tabdo')
  const previous = path.join(home, '.ztools')
  return fs.existsSync(current) || !fs.existsSync(previous) ? current : previous
}

/**
 * 解析数据目录位置记录；显式隔离根同时作为位置记录锚点，不访问真实用户目录。
 * @param options 数据目录解析与测试隔离选项。
 * @returns 当前有效的数据根目录。
 * @throws 位置记录损坏或迁移目标丢失时抛错，避免误建空白资料。
 */
export function getTabDoRoot(options: AppDataPathOptions = {}): string {
  const anchor = getTabDoBootstrapRoot(options)
  const configuration = path.join(anchor, '.data-location.json')
  if (!fs.existsSync(configuration)) return anchor
  const value = JSON.parse(fs.readFileSync(configuration, 'utf8'))
  if (
    typeof value.root !== 'string' ||
    !path.isAbsolute(value.root) ||
    !fs.statSync(value.root).isDirectory()
  )
    throw new Error('数据与缓存目录不可用，请恢复原目录或修复 .data-location.json')
  return value.root
}

export function getLmdbRoot(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'lmdb')
}

export function getDeviceLmdbPath(options: AppDataPathOptions = {}): string {
  return path.join(getLmdbRoot(options), 'device')
}

export function getAccountsRoot(options: AppDataPathOptions = {}): string {
  return path.join(getLmdbRoot(options), 'accounts')
}

export function getDefaultAccountLmdbPath(options: AppDataPathOptions = {}): string {
  return path.join(getAccountsRoot(options), 'default')
}

export function getPluginsPath(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'plugins')
}

/**
 * 获取插件数据目录的根容器（存放所有插件的专属数据目录）。
 *
 * @param options 数据目录解析选项
 * @returns 插件数据根目录绝对路径
 */
export function getPluginDataRoot(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'plugins-data')
}

/**
 * 获取指定插件的专属数据目录（`tabdo.getPath('pluginData')` 指向的目录）。
 * 该目录随插件卸载且勾选「同时删除插件数据」时一并删除，禁止存放插件实体。
 *
 * @param pluginName 插件名，用作数据根下的子目录名
 * @param options 数据目录解析选项
 * @returns 插件数据目录绝对路径
 * @throws 插件名不合法（空、`.`、`..`、含分隔符或绝对路径）时抛出异常，避免目录穿越
 */
export function getPluginDataPath(pluginName: string, options: AppDataPathOptions = {}): string {
  assertSafePluginArtifactPart(pluginName, '插件名称')
  return path.join(getPluginDataRoot(options), pluginName)
}

export function getAvatarPath(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'avatar')
}

export function getClipboardPath(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'clipboard')
}

export function getExtendsPath(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'extends')
}

export function getTempPath(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'temp')
}

export function getLogsPath(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'logs')
}

export function getLegacyUserDataPath(options: AppDataPathOptions = {}): string {
  return options.legacyUserDataPath || getDefaultLegacyUserDataPath(options)
}

export function getLegacyLmdbPath(options: AppDataPathOptions = {}): string {
  return path.join(getLegacyUserDataPath(options), 'lmdb')
}

export function getTabDoDataLayout(options: AppDataPathOptions = {}): TabDoDataLayout {
  return {
    root: getTabDoRoot(options),
    lmdbRoot: getLmdbRoot(options),
    deviceLmdbPath: getDeviceLmdbPath(options),
    accountsRoot: getAccountsRoot(options),
    defaultAccountLmdbPath: getDefaultAccountLmdbPath(options),
    pluginsPath: getPluginsPath(options),
    avatarPath: getAvatarPath(options),
    clipboardPath: getClipboardPath(options),
    extendsPath: getExtendsPath(options),
    tempPath: getTempPath(options),
    logsPath: getLogsPath(options),
    legacyLmdbPath: getLegacyLmdbPath(options),
    legacyUserDataPath: getLegacyUserDataPath(options)
  }
}

export function hasTabDoRoot(options: AppDataPathOptions = {}): boolean {
  return fs.existsSync(getTabDoRoot(options))
}

export function hasLegacyLmdb(options: AppDataPathOptions = {}): boolean {
  return fs.existsSync(getLegacyLmdbPath(options))
}

export function ensure3Layout(options: AppDataPathOptions = {}): TabDoDataLayout {
  const layout = getTabDoDataLayout(options)
  fs.mkdirSync(layout.deviceLmdbPath, { recursive: true })
  fs.mkdirSync(layout.defaultAccountLmdbPath, { recursive: true })
  fs.mkdirSync(layout.pluginsPath, { recursive: true })
  fs.mkdirSync(layout.avatarPath, { recursive: true })
  fs.mkdirSync(layout.clipboardPath, { recursive: true })
  fs.mkdirSync(layout.extendsPath, { recursive: true })
  fs.mkdirSync(layout.tempPath, { recursive: true })
  fs.mkdirSync(layout.logsPath, { recursive: true })
  return layout
}

function getDefaultLegacyUserDataPath(options: AppDataPathOptions): string {
  if (process.env.TABDO_LEGACY_USER_DATA_PATH) {
    return process.env.TABDO_LEGACY_USER_DATA_PATH
  }
  try {
    const userData = app?.getPath?.('userData')
    if (userData) return userData
  } catch {
    // fall back to the production macOS path below
  }

  if (process.platform === 'darwin') {
    return path.join(options.homeDir || os.homedir(), 'Library', 'Application Support', 'TabDo')
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(options.homeDir || os.homedir(), 'AppData', 'Roaming'),
      'TabDo'
    )
  }
  return path.join(options.homeDir || os.homedir(), '.config', 'TabDo')
}
