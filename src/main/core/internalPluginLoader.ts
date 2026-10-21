import { app } from 'electron'
import fsSync from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import api from '../api/index'
import { BUNDLED_INTERNAL_PLUGIN_NAMES, getInternalPluginPath } from './internalPlugins'
import { initializeLocalEditionDefaults } from './localEditionDefaults'

/**
 * 加载所有内置插件，并在应用启动时将插件信息写入数据库。
 * @returns 无返回值
 */
export function loadInternalPlugins(): void {
  console.log('[InternalPlugin] 开始加载内置插件...')

  const isDev = !app.isPackaged
  const existingPlugins = api.dbGet('plugins') || []

  // 移除旧的内置插件记录（基于名称判断）
  const filteredPlugins = existingPlugins.filter(
    (p: any) => !BUNDLED_INTERNAL_PLUGIN_NAMES.includes(p.name)
  )

  // 重新加载所有内置插件
  for (const pluginName of BUNDLED_INTERNAL_PLUGIN_NAMES) {
    try {
      const pluginPath = getInternalPluginPath(pluginName)

      // 开发模式：插件路径直接指向 public 目录
      // 生产模式：插件路径指向插件根目录（打包时已将 dist 构建产物复制到此目录）
      const effectivePluginPath = isDev ? path.join(pluginPath, 'public') : pluginPath

      // 读取 plugin.json
      const pluginJsonPath = path.join(effectivePluginPath, 'plugin.json')

      if (!fsSync.existsSync(pluginJsonPath)) {
        console.error(
          `[InternalPlugin] 内置插件 ${pluginName} 的 plugin.json 不存在:`,
          pluginJsonPath
        )
        continue
      }

      const pluginConfig = JSON.parse(fsSync.readFileSync(pluginJsonPath, 'utf-8'))

      // 构建插件信息
      const logoPath = pluginConfig.logo ? path.join(effectivePluginPath, pluginConfig.logo) : ''

      const mainPath = pluginConfig.main
        ? path.join(effectivePluginPath, pluginConfig.main)
        : undefined

      const pluginInfo = {
        name: pluginConfig.name,
        title: pluginConfig.title,
        version: pluginConfig.version,
        description: pluginConfig.description || '',
        logo: logoPath ? pathToFileURL(logoPath).href : '',
        path: effectivePluginPath, // 保存有效路径（开发模式下是 public 目录）
        features: pluginConfig.features || [],
        isDevelopment: isDev,
        main: mainPath
      }

      filteredPlugins.push(pluginInfo)
      console.log(`[InternalPlugin] 已加载内置插件: ${pluginName}`)
    } catch (error) {
      console.error(`[InternalPlugin] 加载内置插件 ${pluginName} 失败:`, error)
    }
  }

  // 保存到数据库
  api.dbPut('plugins', filteredPlugins)
  initializeLocalEditionDefaults(filteredPlugins)
  // 设置仍采用独立窗口；工具使用嵌入宿主和专属生命周期，不再依赖通用退出开关。
  if (!api.dbGet('builtin-window-defaults-v1')) {
    for (const key of ['auto-detach-plugin', 'out-kill-plugin']) {
      const existing = api.dbGet(key)
      api.dbPut(key, [...new Set([...(Array.isArray(existing) ? existing : []), 'setting'])])
    }
    api.dbPut('builtin-window-defaults-v1', true)
  }
  if (!api.dbGet('builtin-tools-embedded-v2')) {
    // 一次迁移撤回旧默认值，仅移除工具项，保留第三方和设置插件的原有配置。
    for (const key of ['auto-detach-plugin', 'out-kill-plugin']) {
      const existing = api.dbGet(key)
      if (Array.isArray(existing))
        api.dbPut(
          key,
          existing.filter(
            (entry: unknown) =>
              entry !== 'system' &&
              !(
                entry &&
                typeof entry === 'object' &&
                'pluginName' in entry &&
                entry.pluginName === 'system'
              )
          )
        )
    }
    api.dbPut('builtin-tools-embedded-v2', true)
  }
  console.log('[InternalPlugin] 内置插件加载完成')
}
