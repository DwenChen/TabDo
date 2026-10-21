import { app, nativeImage, type BrowserWindow, type NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getInternalPluginPath } from './internalPlugins'

/**
 * 读取工具功能的本地图标，兼容源码与免安装资源路径。
 * @param featureCode 工具功能码，省略时读取工具总图标。
 * @returns 可直接交给原生窗口的 PNG 图标。
 */
export function getToolsWindowIcon(featureCode = 'tools'): NativeImage {
  const root = getInternalPluginPath('system')
  const directory = app.isPackaged ? root : path.join(root, 'public')
  // 限制文件名并保留总图标回退；不把渲染器协议或网络地址交给原生窗口。
  const code = /^[a-z-]+$/.test(featureCode) ? featureCode : 'tools'
  const icon = nativeImage.createFromPath(path.join(directory, 'icons', `${code}.png`))
  return icon.isEmpty()
    ? nativeImage.createFromPath(path.join(directory, 'icons', 'tools.png'))
    : icon
}

/**
 * 为当前可见的工具窗口设置原生图标与任务栏身份。
 * @param window 承载工具正文或独立内容的窗口。
 * @param featureCode 当前工具功能码。
 * @returns 无返回值。
 */
export function applyToolsWindowIdentity(window: BrowserWindow, featureCode: string): void {
  if (window.isDestroyed()) return
  const icon = getToolsWindowIcon(featureCode)
  if (!icon.isEmpty()) window.setIcon(icon)
  // 显式撤回宿主搜索面板的任务栏隐藏状态，独立窗口也使用同一规则。
  window.setSkipTaskbar(false)
  if (process.platform === 'win32') window.setAppDetails({ appId: `TabDo.Tool.${featureCode}` })
}

/**
 * 从功能清单读取窗口标题，让分离窗口与当前子组件保持一致。
 * @param featureCode 当前工具功能码。
 * @returns 中文工具名称；资源不可读时回退为工具。
 */
export function getToolsWindowTitle(featureCode: string): string {
  try {
    const root = getInternalPluginPath('system')
    const directory = app.isPackaged ? root : path.join(root, 'public')
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'plugin.json'), 'utf8'))
    return (
      manifest.features.find((feature: { code: string }) => feature.code === featureCode)
        ?.explain || '工具'
    )
  } catch {
    return '工具'
  }
}

/**
 * 工具正文退出后恢复宿主搜索面板的任务栏状态。
 * @param window 复用的宿主主窗口。
 * @returns 无返回值。
 */
export function resetToolsWindowIdentity(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  window.setSkipTaskbar(true)
  window.setTitle('TabDo')
  if (process.platform === 'win32') window.setAppDetails({ appId: 'TabDo' })
}
