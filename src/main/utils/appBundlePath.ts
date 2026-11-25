import { app } from 'electron'
import path from 'path'

export function getAppBundlePath(...segments: string[]): string {
  return path.join(app.getAppPath(), ...segments)
}

/**
 * 获取安装更新时会被整体替换的程序目录。
 * @returns 安装目录绝对路径；未打包运行或无法确定时返回空字符串。
 */
export function getAppInstallDirectory(): string {
  // 源码预览和开发运行不写入安装目录，也不执行替换安装。
  if (!app.isPackaged) return ''
  if (process.platform !== 'darwin') return path.dirname(process.execPath)
  // macOS 更新替换整个 .app 包，必须定位到包根目录。
  let current = app.getAppPath()
  while (path.dirname(current) !== current) {
    if (path.extname(current).toLowerCase() === '.app') return current
    current = path.dirname(current)
  }
  return path.dirname(process.execPath)
}

/**
 * 判断目标路径是否位于根目录内（含根目录本身）。
 * @param root 根目录绝对路径。
 * @param target 待判断的绝对路径。
 * @returns 是否位于根目录内；根目录为空时返回 false。
 */
export function isPathInside(root: string, target: string): boolean {
  if (!root) return false
  // Windows 的 path.relative 已按大小写不敏感比较，跨盘时会返回绝对路径。
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  )
}

export function getPreloadPath(fileName = 'index.js'): string {
  if (process.env.TABDO_SOURCE_PREVIEW === '1' && fileName === 'index.js') {
    return getAppBundlePath('scripts', 'preview-preload.cjs')
  }
  return getAppBundlePath('out', 'preload', fileName)
}

export function getRendererPath(fileName: string): string {
  return getAppBundlePath('out', 'renderer', fileName)
}
