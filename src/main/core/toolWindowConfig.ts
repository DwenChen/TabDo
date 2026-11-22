import { app } from 'electron'
import fsSync from 'node:fs'
import path from 'node:path'
import { resolvePluginWindowConfig, type PluginWindowConfig } from '../../shared/pluginWindowConfig'
import { getInternalPluginPath } from './internalPlugins'

/** 内置工具清单只在首次读取后缓存，清单随程序版本发布。 */
let cachedSystemConfig: unknown

/**
 * 读取内置工具插件的清单，源码预览与打包路径遵循原有内置插件约定。
 * @returns 解析后的 plugin.json；读取失败时返回空配置。
 */
function readSystemPluginConfig(): unknown {
  if (cachedSystemConfig !== undefined) return cachedSystemConfig
  try {
    const root = path.resolve(getInternalPluginPath('system'), app.isPackaged ? '' : 'public')
    cachedSystemConfig = JSON.parse(fsSync.readFileSync(path.join(root, 'plugin.json'), 'utf-8'))
  } catch (error) {
    console.error('[ToolWindow] 读取内置工具窗口配置失败:', error)
    cachedSystemConfig = {}
  }
  return cachedSystemConfig
}

/**
 * 获取内置子组件声明的窗口打开位置与尺寸。
 * @param featureCode 子组件功能代码。
 * @returns 归一化后的窗口配置；未声明时使用“跟随光标 + 可调整”。
 */
export function getToolWindowConfig(featureCode: string): PluginWindowConfig {
  return resolvePluginWindowConfig(readSystemPluginConfig(), featureCode)
}
