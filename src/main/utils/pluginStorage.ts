import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { physicalFs } from './physicalFs.js'

export type PluginStorageKind = 'asar' | 'directory'

/**
 * 解析插件记录使用的物理存储类型，并兼容缺少 storageKind 的历史记录。
 * @param plugin 插件记录中的存储类型和路径
 * @returns ASAR 或目录存储类型
 */
export function resolvePluginStorageKind(plugin: {
  storageKind?: unknown
  path?: string
}): PluginStorageKind {
  if (plugin.storageKind === 'asar' || plugin.storageKind === 'directory') {
    return plugin.storageKind
  }
  return plugin.path?.toLowerCase().endsWith('.asar') ? 'asar' : 'directory'
}

/**
 * 校验字符串可以安全作为插件实体文件名的一部分。
 * @param value 待校验值
 * @param field 错误信息中使用的字段名称
 * @returns 校验通过时无返回值
 */
export function assertSafePluginArtifactPart(
  value: unknown,
  field: string
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value === '.' ||
    value === '..' ||
    value.includes('\0') ||
    value.includes('/') ||
    value.includes('\\') ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw new Error(`${field} 不能用于生成插件文件名`)
  }
}

/**
 * 生成不会覆盖既有版本的 ASAR 安装路径。
 * @param pluginsDir 插件实体根目录
 * @param name 插件名称
 * @param version 插件版本
 * @param installId 本次安装的唯一标识
 * @returns 带版本和安装标识的 ASAR 绝对路径
 */
export function createAsarArtifactPath(
  pluginsDir: string,
  name: string,
  version: string,
  installId = randomUUID().slice(0, 8)
): string {
  // 所有文件名片段先独立校验，避免 path.join 接受越界输入。
  assertSafePluginArtifactPart(name, '插件名称')
  assertSafePluginArtifactPart(version, '插件版本')
  assertSafePluginArtifactPart(installId, '安装标识')
  return path.join(pluginsDir, `${name}-${version}-${installId}.asar`)
}

/**
 * 删除插件物理实体；等待短暂文件占用解除，并同时删除 ASAR sidecar。
 * @param plugin 待删除插件的路径、存储类型和开发状态
 * @returns 删除完成后结束的 Promise
 * @throws {Error} 重试后仍无法删除安装实体时抛出错误。
 */
export async function removePluginArtifact(plugin: {
  path: string
  storageKind?: unknown
  isDevelopment?: boolean
}): Promise<void> {
  // 开发插件引用用户项目目录，卸载时不能删除源文件。
  if (plugin.isDevelopment) return
  const fs = physicalFs.promises
  // Electron 的 PluginOut 回调和原生窗口关闭存在延迟；recursive 也为文件启用 rm 重试。
  const options = { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }
  if (resolvePluginStorageKind(plugin) === 'asar') {
    // ASAR 与 sidecar 是同一个安装实体，必须一起清理。
    await Promise.all([fs.rm(plugin.path, options), fs.rm(`${plugin.path}.unpacked`, options)])
    return
  }
  await fs.rm(plugin.path, options)
}
