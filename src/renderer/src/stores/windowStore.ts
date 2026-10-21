import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { readBuiltinShortcuts, type BuiltinShortcutKey } from '@shared/shortcutSettings'
import {
  resolveVisibleAiRequestStatus,
  type AiRequestStatus,
  type AiRequestStatusChange
} from '@shared/aiRequestStatus'

interface PluginInfo {
  name: string
  title?: string
  logo: string
  path: string
  cmdName?: string
  subInputPlaceholder?: string
  subInputVisible?: boolean
  sourceType?: 'open_source' | 'closed_source'
}
export type BuiltInShortcutKey = BuiltinShortcutKey

// 更新状态
interface AvailableUpdateInfo {
  hasUpdate: boolean
  version?: string
  changelog?: string
}

export const useWindowStore = defineStore('window', () => {
  const builtinShortcuts = ref(readBuiltinShortcuts(null))
  const builtInClosePluginShortcutEnabled = computed(() => builtinShortcuts.value.closePlugin)
  const builtInKillPluginShortcutEnabled = computed(() => builtinShortcuts.value.killPlugin)
  const builtInEscShortcutEnabled = computed(() => builtinShortcuts.value.esc)
  const hideMainWindowOnPluginEsc = ref(false)

  // 当前插件信息
  const currentPlugin = ref<PluginInfo | null>(null)
  // 插件加载中状态（用于显示 loading 动效）
  const pluginLoading = ref(false)

  // AI 请求状态（用于显示 AI 调用动画）
  const aiRequestStatusesByPluginPath = ref<Record<string, AiRequestStatus>>({})
  const aiRequestStatus = computed(() =>
    resolveVisibleAiRequestStatus(aiRequestStatusesByPluginPath.value, currentPlugin.value?.path)
  )

  // 子输入框配置 (插件模式下使用)
  const subInputPlaceholder = ref('搜索')
  const subInputVisible = ref(false)

  const theme = ref('system') // system, light, dark
  const primaryColor = ref('green') // blue, purple, green, orange, red, pink, custom
  const customColor = ref('#db2777') // 自定义颜色
  const compactMainWindowHeader = ref(false) // 主窗口是否使用紧凑顶部栏

  // 亚克力材质背景色透明度（0-100）
  const acrylicLightOpacity = ref(78) // 明亮模式默认 78%
  const acrylicDarkOpacity = ref(50)

  // 更新状态
  const availableUpdateInfo = ref<AvailableUpdateInfo>({ hasUpdate: false })
  const autoCheckUpdateEnabled = ref(true)
  const dismissedUpdateVersion = ref<string | null>(null)
  const shouldShowUpdateNotification = computed(() => {
    const availableVersion = availableUpdateInfo.value.version ?? ''
    return (
      availableUpdateInfo.value.hasUpdate &&
      autoCheckUpdateEnabled.value &&
      !currentPlugin.value &&
      availableVersion !== dismissedUpdateVersion.value
    )
  })

  /**
   * 更新主窗口顶部栏密度状态。
   * @param enabled 是否启用紧凑顶部栏。
   * @returns 无返回值。
   */
  function updateCompactMainWindowHeader(enabled: boolean): void {
    compactMainWindowHeader.value = enabled === true
  }

  // 更新当前插件信息
  function updateCurrentPlugin(plugin: PluginInfo | null): void {
    currentPlugin.value = plugin

    if (plugin) {
      // 直接使用后端传递的 subInputPlaceholder
      if (plugin.subInputPlaceholder) {
        subInputPlaceholder.value = plugin.subInputPlaceholder
        console.log('使用插件配置:', plugin.path, plugin.subInputPlaceholder)
      } else {
        // 使用默认值
        subInputPlaceholder.value = '搜索'
        console.log('使用默认 placeholder:', plugin.path)
      }

      // 更新子输入框可见性
      if (plugin.subInputVisible !== undefined) {
        subInputVisible.value = plugin.subInputVisible
        console.log('更新子输入框可见性:', plugin.subInputVisible)
      } else {
        // 默认隐藏（调用 setSubInput 后才显示）
        subInputVisible.value = false
      }

      pluginLoading.value = true
    } else {
      pluginLoading.value = false
    }
  }

  // 更新子输入框 placeholder
  function updateSubInputPlaceholder(placeholder: string): void {
    const newValue = placeholder || '搜索'

    // 仅更新当前显示的 placeholder，不再存储到本地 map
    // 后端已经通过 IPC 更新了持久化数据

    // 如果是当前激活的插件,立即更新显示
    if (currentPlugin.value) {
      subInputPlaceholder.value = newValue
      console.log('当前插件,立即更新 placeholder:', newValue)
    }
  }

  // 更新子输入框可见性
  function updateSubInputVisible(visible: boolean): void {
    subInputVisible.value = visible
    console.log('更新子输入框可见性:', visible)
  }

  function setPluginLoading(isLoading: boolean): void {
    pluginLoading.value = isLoading
  }

  /** 更新插件宿主的内置快捷键开关。
   * @param key 插件快捷键名称。
   * @param value 是否启用。
   * @returns 无返回值。
   */
  function updateBuiltInShortcutEnabled(key: BuiltInShortcutKey, value: boolean): void {
    builtinShortcuts.value = { ...builtinShortcuts.value, [key]: value === true }
  }

  /**
   * 应用设置页推送的完整快捷键状态，缺失项保持关闭。
   * @param config 内置快捷键开关。
   * @returns 无返回值。
   */
  function updateBuiltinShortcuts(config: unknown): void {
    builtinShortcuts.value = readBuiltinShortcuts({ builtinAppShortcutsEnabled: config })
  }

  /**
   * 更新插件内按 ESC 时是否直接隐藏主窗口。
   * @param enabled 是否直接隐藏主窗口。
   * @returns 无返回值。
   */
  function updateHideMainWindowOnPluginEsc(enabled: boolean): void {
    hideMainWindowOnPluginEsc.value = enabled === true
  }

  function updateTheme(value: string): void {
    theme.value = value
  }

  function updatePrimaryColor(value: string): void {
    primaryColor.value = value
    // 应用主题色类名到 body
    document.body.className = document.body.className.replace(/theme-\w+/g, '').trim()
    document.body.classList.add(`theme-${value}`)

    // 如果是自定义颜色，应用自定义颜色值
    if (value === 'custom') {
      applyCustomColor(customColor.value)
    }
  }

  function updateCustomColor(color: string): void {
    customColor.value = color
    // 如果当前主题色是自定义，立即应用
    if (primaryColor.value === 'custom') {
      applyCustomColor(color)
    }
  }

  function updateAcrylicLightOpacity(value: number): void {
    acrylicLightOpacity.value = value
  }

  function updateAcrylicDarkOpacity(value: number): void {
    acrylicDarkOpacity.value = value
  }

  function applyCustomColor(color: string): void {
    // 智能调整颜色
    const adjustedColor = adjustColorForTheme(color)

    // 如果颜色被调整了，输出日志
    if (adjustedColor !== color) {
      console.log('颜色已智能调整:', color, '→', adjustedColor)
    }

    // 动态设置 CSS 变量
    document.documentElement.style.setProperty('--primary-color', adjustedColor)
  }

  // 智能调整颜色以适应当前主题
  function adjustColorForTheme(color: string): string {
    // 检测当前是否为暗色主题
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches

    // 将颜色转换为 RGB
    const rgb = hexToRgb(color)
    if (!rgb) return color

    // 计算相对亮度（使用 W3C 公式）
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255

    // 亮色主题：如果颜色太亮（接近白色），调整为较深颜色
    if (!isDarkMode && luminance > 0.9) {
      return adjustBrightness(color, 0.4) // 降低亮度到 40%
    }

    // 暗色主题：如果颜色太暗（接近黑色），调整为较亮颜色
    if (isDarkMode && luminance < 0.15) {
      return adjustBrightness(color, 0.6) // 提高亮度到 60%
    }

    return color
  }

  // 将 hex 颜色转换为 RGB
  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        }
      : null
  }

  // 调整颜色亮度
  function adjustBrightness(hex: string, targetLuminance: number): string {
    const rgb = hexToRgb(hex)
    if (!rgb) return hex

    // 转换为 HSL
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)

    // 调整亮度
    hsl.l = targetLuminance

    // 转换回 RGB
    const adjustedRgb = hslToRgb(hsl.h, hsl.s, hsl.l)

    // 转换为 hex
    return rgbToHex(adjustedRgb.r, adjustedRgb.g, adjustedRgb.b)
  }

  // RGB 转 HSL
  function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255
    g /= 255
    b /= 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6
          break
        case g:
          h = ((b - r) / d + 2) / 6
          break
        case b:
          h = ((r - g) / d + 4) / 6
          break
      }
    }

    return { h, s, l }
  }

  // HSL 转 RGB
  function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    let r: number, g: number, b: number

    if (s === 0) {
      r = g = b = l
    } else {
      const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q

      r = hue2rgb(p, q, h + 1 / 3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1 / 3)
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    }
  }

  // RGB 转 Hex
  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
  }

  // 设置可用更新信息
  function setAvailableUpdateInfo(info: AvailableUpdateInfo): void {
    availableUpdateInfo.value = info
  }

  /**
   * 更新自动检查开关的运行时状态，并在重新开启时允许更新提示再次出现。
   * @param enabled 是否启用自动检查更新
   * @returns 无返回值
   */
  function updateAutoCheckUpdateEnabled(enabled: boolean): void {
    autoCheckUpdateEnabled.value = enabled

    // 用户主动重新开启自动检查时，清除本次运行的旧关闭记录。
    if (enabled) dismissedUpdateVersion.value = null
  }

  /**
   * 关闭当前版本的主窗口更新提示，关闭状态仅保留到本次应用退出。
   * @returns 无返回值
   */
  function dismissUpdateNotification(): void {
    dismissedUpdateVersion.value = availableUpdateInfo.value.version ?? ''
  }

  /**
   * 在自动检查开启时恢复主进程中已检测到的更新状态。
   * @returns 状态检查完成后结束的 Promise
   */
  async function checkUpdateStatus(): Promise<void> {
    // 自动检查关闭时不恢复缓存提示，手动检查更新功能仍保持可用。
    if (!autoCheckUpdateEnabled.value) return

    try {
      const status = await window.tabdo.updater.getDownloadStatus()
      if (status.hasUpdate) {
        availableUpdateInfo.value = {
          hasUpdate: true,
          version: status.version,
          changelog: status.changelog
        }
      }
    } catch (error) {
      console.error('检查更新状态失败:', error)
    }
  }

  /**
   * 更新指定插件的 AI 请求状态，idle 时释放已完成条目。
   * @param change 主进程发送的插件级 AI 状态变化
   * @returns 无返回值
   */
  function setAiRequestStatus(change: AiRequestStatusChange): void {
    const nextStatuses = { ...aiRequestStatusesByPluginPath.value }
    if (change.status === 'idle') {
      delete nextStatuses[change.pluginPath]
    } else {
      nextStatuses[change.pluginPath] = change.status
    }
    aiRequestStatusesByPluginPath.value = nextStatuses
  }

  /**
   * 从数据库加载主窗口设置，并应用缺失字段的默认值。
   * @returns 设置加载和应用完成后结束的 Promise
   */
  async function loadSettings(): Promise<void> {
    try {
      const data = await window.tabdo.dbGet('settings-general')
      if (data) {
        if (data.autoCheckUpdate !== undefined) {
          autoCheckUpdateEnabled.value = data.autoCheckUpdate
        }
        if (data.theme) {
          theme.value = data.theme
        }
        compactMainWindowHeader.value = data.compactMainWindowHeader === true
        if (data.customColor) {
          customColor.value = data.customColor
        }
        if (data.primaryColor) {
          updatePrimaryColor(data.primaryColor)
        } else {
          // 旧配置缺少主题色时使用当前产品默认的绿色。
          updatePrimaryColor('green')
        }
        if (data.acrylicLightOpacity !== undefined) {
          acrylicLightOpacity.value = data.acrylicLightOpacity
        }
        if (data.acrylicDarkOpacity !== undefined) {
          acrylicDarkOpacity.value = data.acrylicDarkOpacity
        }
        updateBuiltinShortcuts(data.builtinAppShortcutsEnabled)
        hideMainWindowOnPluginEsc.value = data.hideMainWindowOnPluginEsc === true
      } else {
        // 首次启动没有通用设置时使用当前产品默认的绿色。
        updatePrimaryColor('green')
      }

      // 监听系统主题变化，重新应用自定义颜色
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (primaryColor.value === 'custom') {
          applyCustomColor(customColor.value)
        }
      })
    } catch (error) {
      console.error('加载设置失败:', error)
    }
  }

  return {
    currentPlugin,
    pluginLoading,
    aiRequestStatus,
    subInputPlaceholder,
    subInputVisible,
    theme,
    primaryColor,
    customColor,
    compactMainWindowHeader,
    acrylicLightOpacity,
    acrylicDarkOpacity,
    availableUpdateInfo,
    autoCheckUpdateEnabled,
    shouldShowUpdateNotification,
    updateCompactMainWindowHeader,
    updateCurrentPlugin,
    setPluginLoading,
    setAiRequestStatus,
    updateSubInputPlaceholder,
    updateSubInputVisible,
    builtInClosePluginShortcutEnabled,
    builtinShortcuts,
    updateBuiltinShortcuts,
    builtInKillPluginShortcutEnabled,
    builtInEscShortcutEnabled,
    hideMainWindowOnPluginEsc,
    updateBuiltInShortcutEnabled,
    updateHideMainWindowOnPluginEsc,
    updateTheme,
    updatePrimaryColor,
    updateCustomColor,
    updateAcrylicLightOpacity,
    updateAcrylicDarkOpacity,
    setAvailableUpdateInfo,
    updateAutoCheckUpdateEnabled,
    dismissUpdateNotification,
    checkUpdateStatus,
    loadSettings
  }
})
