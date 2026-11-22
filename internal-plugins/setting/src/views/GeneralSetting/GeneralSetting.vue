<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  type MouseButtonType,
  type PrimaryColor,
  type TerminalType,
  type ThemeType
} from '@/constants'
import { Dropdown, Slider, useToast } from '@/components'
import { applyCustomColor, applyPrimaryColor } from '@/utils'
import { jumpFunctionShortcutsSetting } from '@/views/ShortcutsSetting/ShortcutsSetting'
import DataLocationSetting from './DataLocationSetting.vue'

const { error, info } = useToast()

// Dropdown 选项数据
const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '明亮', value: 'light' },
  { label: '暗黑', value: 'dark' }
]

const windowMaterialOptions = [
  { label: 'Mica（云母）', value: 'mica' },
  { label: 'Acrylic（亚克力）', value: 'acrylic' },
  { label: '无', value: 'none' }
]

const superPanelMouseButtonOptions = [
  { label: '按下鼠标中键', value: 'middle' },
  { label: '长按鼠标中键', value: 'middle-long' },
  { label: '长按鼠标右键', value: 'right-long' },
  { label: '按下鼠标后退键', value: 'back' },
  { label: '长按鼠标后退键', value: 'back-long' },
  { label: '按下鼠标前进键', value: 'forward' },
  { label: '长按鼠标前进键', value: 'forward-long' }
]

// 当前平台（与 window.tabdo.getPlatform 返回类型保持一致）
const platform = ref<'darwin' | 'win32' | 'linux'>('darwin')

// 终端打开设置
const terminal = ref<TerminalType>('default')
const terminalCustomCommand = ref('')

// 终端预设选项（按平台；仅 UI 标签，启动逻辑在主进程 terminalLauncher）
const terminalOptions = computed(() => {
  if (platform.value === 'win32') {
    return [
      { label: '系统默认', value: 'default' },
      { label: 'Windows Terminal', value: 'wt' },
      { label: 'PowerShell', value: 'powershell' },
      { label: 'CMD', value: 'cmd' },
      { label: '自定义', value: 'custom' }
    ]
  }
  if (platform.value === 'linux') {
    return [
      { label: '系统默认', value: 'default' },
      { label: 'GNOME Terminal', value: 'gnome-terminal' },
      { label: 'Konsole', value: 'konsole' },
      { label: 'XTerm', value: 'xterm' },
      { label: '自定义', value: 'custom' }
    ]
  }
  return [
    { label: '系统默认 (Terminal)', value: 'default' },
    { label: 'Ghostty', value: 'ghostty' },
    { label: 'iTerm2', value: 'iterm2' },
    { label: '自定义', value: 'custom' }
  ]
})

const settingsLoaded = ref(false)

// 本地状态（替代 windowStore）
const theme = ref<ThemeType>('system')
const primaryColor = ref<PrimaryColor>('green')
const clipboardRetentionDays = ref(180)
const clipboardQuickMatchSeconds = ref(5)

/**
 * 保存最近复制内容的匹配时限，并立即同步宿主策略。
 * @returns 设置保存和运行时更新完成后的 Promise。
 */
async function handleClipboardQuickMatchChange(): Promise<void> {
  // 将空值或无效输入恢复为默认值，零值用于明确关闭功能。
  const value = Number(clipboardQuickMatchSeconds.value)
  clipboardQuickMatchSeconds.value = Number.isFinite(value)
    ? Math.max(0, Math.min(300, Math.round(value)))
    : 5
  await saveSettings()
  await window.tabdo.internal.updateClipboardQuickMatch(clipboardQuickMatchSeconds.value)
}

// 超级面板设置
const superPanelEnabled = ref(true)
const superPanelMouseButton = ref<MouseButtonType>('middle')
const superPanelLongPressMs = ref(0)
const superPanelBlockedApps = ref<Array<{ app: string; bundleId?: string; label?: string }>>([])

const router = useRouter()

// 跳转到提供商页面的翻译 tab（翻译能力已迁移）
function goToTranslationProviders(): void {
  router.push({ name: 'Providers', query: { tab: 'translation' } })
}

// 超级面板翻译设置（开关已迁移到「提供商 → 翻译」，这里仅保留字段以兼容历史持久化数据）
const superPanelTranslateEnabled = ref(false)
const superPanelAutoTranslate = ref(true)
// 超级面板触发模式（计算属性）
const superPanelTriggerMode = computed({
  get: () => {
    // 右键特殊处理，如果配置是右键，强制显示为长按右键
    if (superPanelMouseButton.value === 'right') {
      return 'right-long'
    }
    // 如果长按时间大于0，显示为长按模式
    if (superPanelLongPressMs.value > 0) {
      return `${superPanelMouseButton.value}-long`
    }
    // 否则显示为短按模式
    return superPanelMouseButton.value
  },
  set: () => {
    // 这里的 setter 主要用于 v-model 绑定，实际更新逻辑在 handleSuperPanelTriggerModeChange 中
  }
})

// 不透明度设置
const opacity = ref(1)

// 主窗口紧凑顶部栏设置
const compactMainWindowHeader = ref(false)

// 可调整的子组件与插件窗口是否记住上次尺寸
const rememberToolWindowSize = ref(true)

// 托盘图标显示设置
const showTrayIcon = ref(true)

// 宿主唤醒开关；持续时间与屏幕点亮在托盘“唤醒”二级菜单中调整
const awakeEnabled = ref(false)
let offAwakeState: (() => void) | null = null

// 窗口置顶总开关与边框外观；展开面板在切页或滚出可视区域时自动收起
const ALWAYS_ON_TOP_DEFAULT_SHORTCUT = 'Shift+T'
const alwaysOnTopEnabled = ref(false)
const alwaysOnTopExpanded = ref(false)
const alwaysOnTopShortcut = ref(ALWAYS_ON_TOP_DEFAULT_SHORTCUT)
const alwaysOnTopBorderEnabled = ref(true)
const alwaysOnTopColorMode = ref<'accent' | 'custom'>('accent')
const alwaysOnTopBorderColor = ref('#1A73E8')
const alwaysOnTopOpacity = ref(100)
const alwaysOnTopThickness = ref(3)
const alwaysOnTopRoundedCorners = ref(true)
const alwaysOnTopPlaySound = ref(true)
const alwaysOnTopColorInput = ref<HTMLInputElement | null>(null)
const pinOptionsRef = ref<HTMLElement | null>(null)
let alwaysOnTopSaveTimer: ReturnType<typeof setTimeout> | null = null

// 开机启动设置
const launchAtLogin = ref(false)

// 关闭 GPU 加速（兜底方案，修改后需重启生效）
const disableGpuAcceleration = ref(false)

// 代理设置
const proxyEnabled = ref(false)
const proxyUrl = ref('')

// 窗口材质设置
const windowMaterial = ref<'mica' | 'acrylic' | 'none'>('none')

// 亚克力材质背景色透明度
const acrylicLightOpacity = ref(78) // 明亮模式默认 78%
const acrylicDarkOpacity = ref(50)

// 颜色选择器引用
const colorPickerInput = ref<HTMLInputElement | null>(null)

// 自动检查更新（保留用于设置持久化）
const autoCheckUpdate = ref(true)

// 主题色选项
const themeColors = [
  { label: '翡翠绿', value: 'green', hex: '#059669' },
  { label: '天空蓝', value: 'blue', hex: '#0284c7' },
  { label: '罗兰紫', value: 'purple', hex: '#7c3aed' },
  { label: '活力橙', value: 'orange', hex: '#ea580c' },
  { label: '宝石红', value: 'red', hex: '#dc2626' }
]

// 自定义颜色
const customColor = ref('#db2777')

// 处理不透明度变化
async function handleOpacityChange(): Promise<void> {
  try {
    await window.tabdo.internal.setWindowOpacity(opacity.value)
    // 保存到数据库
    await saveSettings()
  } catch (error) {
    console.error('设置窗口不透明度失败:', error)
  }
}

/**
 * 保存主窗口顶部栏密度，并立即同步到宿主运行时。
 * @returns 设置保存和运行时更新完成后结束的 Promise。
 */
async function handleCompactMainWindowHeaderChange(): Promise<void> {
  try {
    // 先持久化用户选择，确保后续启动直接使用相同布局。
    await saveSettings()
    const result = await window.tabdo.internal.setCompactMainWindowHeader(
      compactMainWindowHeader.value
    )
    if (!result.success) {
      throw new Error(result.error || '主窗口布局更新失败')
    }
  } catch (error) {
    console.error('设置主窗口紧凑顶部栏失败:', error)
  }
}

/**
 * 保存子组件与插件窗口是否记住上次尺寸。
 * @returns 设置保存完成后的 Promise。
 */
async function handleRememberToolWindowSizeChange(): Promise<void> {
  try {
    // 只持久化用户选择，下一次打开窗口时由宿主读取。
    await saveSettings()
  } catch (error) {
    console.error('保存窗口尺寸记忆设置失败:', error)
  }
}

// 处理剪贴板历史保存天数变化
async function handleClipboardRetentionDaysChange(): Promise<void> {
  try {
    if (!clipboardRetentionDays.value || clipboardRetentionDays.value < 1) {
      clipboardRetentionDays.value = 180
    }
    await saveSettings()
    // 通知主进程更新剪贴板配置
    await window.tabdo.internal.updateClipboardConfig({
      retentionDays: clipboardRetentionDays.value
    })
    console.log('剪贴板历史保存天数已更新:', clipboardRetentionDays.value)
  } catch (error) {
    console.error('保存剪贴板历史保存天数失败:', error)
  }
}

// 重置剪贴板历史保存天数
async function resetClipboardRetentionDays(): Promise<void> {
  try {
    clipboardRetentionDays.value = 180
    await handleClipboardRetentionDaysChange()
  } catch (error) {
    console.error('重置剪贴板历史保存天数失败:', error)
  }
}

// 处理主题变化
async function handleThemeChange(): Promise<void> {
  try {
    await saveSettings()
    await window.tabdo.internal.setTheme(theme.value)
    console.log('主题配置已更新:', theme.value)
  } catch (error) {
    console.error('更新主题配置失败:', error)
  }
}

// 处理超级面板触发模式变化
async function handleSuperPanelTriggerModeChange(mode: string | number): Promise<void> {
  try {
    const triggerMode = String(mode)
    let mouseButton: MouseButtonType
    let longPressMs: number

    if (triggerMode.endsWith('-long')) {
      // 长按模式
      mouseButton = triggerMode.replace('-long', '') as MouseButtonType
      // 如果之前的长按时间太短或为0，设置为默认200ms
      longPressMs =
        superPanelLongPressMs.value && superPanelLongPressMs.value >= 200
          ? superPanelLongPressMs.value
          : 200
    } else {
      // 短按模式
      mouseButton = triggerMode as MouseButtonType
      longPressMs = 0
    }

    // 更新本地状态
    superPanelMouseButton.value = mouseButton
    superPanelLongPressMs.value = longPressMs

    await saveSettings()
    await window.tabdo.internal.updateSuperPanelConfig({
      enabled: superPanelEnabled.value,
      mouseButton: superPanelMouseButton.value,
      longPressMs: superPanelLongPressMs.value
    })
    console.log('超级面板触发模式已更新:', triggerMode)
  } catch (err) {
    console.error('更新超级面板触发模式失败:', err)
  }
}

// 处理超级面板长按响应时间变化
async function handleSuperPanelLongPressMsChange(): Promise<void> {
  try {
    if (!superPanelLongPressMs.value || superPanelLongPressMs.value < 200) {
      superPanelLongPressMs.value = 200
    }
    if (superPanelLongPressMs.value > 3000) {
      superPanelLongPressMs.value = 3000
    }
    await saveSettings()
    await window.tabdo.internal.updateSuperPanelConfig({
      enabled: superPanelEnabled.value,
      mouseButton: superPanelMouseButton.value,
      longPressMs: superPanelLongPressMs.value
    })
    console.log('超级面板长按响应时间已更新:', superPanelLongPressMs.value)
  } catch (err) {
    console.error('更新超级面板长按响应时间失败:', err)
  }
}

// 添加屏蔽应用（获取当前窗口）
async function handleAddBlockedApp(): Promise<void> {
  try {
    console.log('[Setting] handleAddBlockedApp 开始')
    const windowInfo = await window.tabdo.internal.getCurrentWindowInfo()
    console.log('[Setting] getCurrentWindowInfo 返回:', JSON.stringify(windowInfo))
    if (!windowInfo) {
      error('无法获取当前窗口信息')
      return
    }

    // 去重检查
    const exists = superPanelBlockedApps.value.some(
      (item) => item.app.toLowerCase() === windowInfo.app.toLowerCase()
    )
    if (exists) {
      info('该应用已在屏蔽列表中')
      return
    }

    // 生成显示名称：去掉 .exe / .app 后缀
    const label = windowInfo.app.replace(/\.(exe|app)$/i, '')

    superPanelBlockedApps.value.push({
      app: windowInfo.app,
      bundleId: windowInfo.bundleId,
      label
    })

    console.log(
      '[Setting] saveSettings 前, blockedApps:',
      JSON.stringify(superPanelBlockedApps.value)
    )
    await saveSettings()
    console.log('[Setting] saveSettings 完成, 开始调用 updateSuperPanelBlockedApps')
    await window.tabdo.internal.updateSuperPanelBlockedApps(
      superPanelBlockedApps.value.map((item) => ({ ...item }))
    )
    console.log('[Setting] updateSuperPanelBlockedApps 完成')
  } catch (err) {
    console.error('添加屏蔽应用失败:', err)
  }
}

// 移除屏蔽应用
async function handleRemoveBlockedApp(index: number): Promise<void> {
  try {
    superPanelBlockedApps.value.splice(index, 1)
    await saveSettings()
    await window.tabdo.internal.updateSuperPanelBlockedApps(
      superPanelBlockedApps.value.map((item) => ({ ...item }))
    )
  } catch (err) {
    console.error('移除屏蔽应用失败:', err)
  }
}

// 处理主题色变化
async function handlePrimaryColorChange(color: string): Promise<void> {
  try {
    primaryColor.value = color as PrimaryColor

    applyPrimaryColor(primaryColor.value, customColor.value)

    await saveSettings()
    // 通知主渲染进程更新
    await window.tabdo.internal.updatePrimaryColor(color, customColor.value)
    console.log('主题色已更新:', color)
  } catch (error) {
    console.error('更新主题色失败:', error)
  }
}

// 选择自定义颜色（不打开色盘）
async function handleSelectCustomColor(): Promise<void> {
  try {
    primaryColor.value = 'custom' as PrimaryColor

    applyPrimaryColor(primaryColor.value, customColor.value)

    await saveSettings()
    // 通知主渲染进程更新
    await window.tabdo.internal.updatePrimaryColor('custom', customColor.value)
    console.log('已选择自定义主题色')
  } catch (error) {
    console.error('选择自定义主题色失败:', error)
  }
}

// 打开颜色选择器
function openColorPicker(): void {
  colorPickerInput.value?.click()
}

// 处理自定义颜色变化
async function handleCustomColorChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const color = target.value
  customColor.value = color

  // 如果当前主题色是自定义，立即应用
  if (primaryColor.value === 'custom') {
    applyCustomColor(color)
  }

  try {
    await saveSettings()
    // 通知主渲染进程更新
    await window.tabdo.internal.updatePrimaryColor(primaryColor.value, color)
    console.log('自定义主题色已更新:', color)
  } catch (error) {
    console.error('更新自定义主题色失败:', error)
  }
}

// 处理托盘图标显示变化
async function handleTrayIconChange(): Promise<void> {
  try {
    // 唤醒菜单只存在于托盘，关闭托盘图标时必须同时关闭唤醒。
    if (!showTrayIcon.value && awakeEnabled.value) {
      await window.tabdo.internal.setAwakeEnabled(false)
      awakeEnabled.value = false
      info('已同时关闭唤醒：唤醒设置依赖托盘图标')
    }
    await saveSettings()
    // 通知主进程更新托盘图标显示状态
    await window.tabdo.internal.setTrayIconVisible(showTrayIcon.value)
    console.log('托盘图标显示状态已更新:', showTrayIcon.value)
  } catch (error) {
    console.error('更新托盘图标显示状态失败:', error)
  }
}

/**
 * 保存唤醒开关；开启时自动打开托盘图标，保证托盘二级菜单可用。
 * @returns 保存和运行时更新完成后的 Promise。
 */
async function handleAwakeChange(): Promise<void> {
  try {
    const result = await window.tabdo.internal.setAwakeEnabled(awakeEnabled.value)
    if (!result.success) throw new Error(result.error || '唤醒设置更新失败')
    if (awakeEnabled.value) {
      showTrayIcon.value = true
      info('已开启唤醒，并自动显示托盘图标；可在托盘右键“唤醒”中调整时长')
    }
    await saveSettings()
  } catch (error: any) {
    awakeEnabled.value = false
    error(error?.message || '唤醒设置更新失败')
  }
}

/**
 * 提交窗口置顶配置到宿主服务，避免界面与运行时状态不一致。
 * @param patch 需要更新的置顶字段。
 * @returns 是否更新成功。
 */
async function applyAlwaysOnTopConfig(
  patch: Parameters<typeof window.tabdo.internal.updateAlwaysOnTopConfig>[0]
): Promise<boolean> {
  try {
    const result = await window.tabdo.internal.updateAlwaysOnTopConfig(patch)
    if (!result.success) throw new Error(result.error || '窗口置顶设置更新失败')
    return true
  } catch (reason: any) {
    error(reason?.message || '窗口置顶设置更新失败')
    return false
  }
}

/**
 * 切换窗口置顶总开关；启用失败时回退开关状态。
 * @returns 切换完成后的 Promise。
 */
async function handleAlwaysOnTopToggle(): Promise<void> {
  const next = alwaysOnTopEnabled.value
  const applied = await applyAlwaysOnTopConfig({ enabled: next })
  if (!applied) {
    alwaysOnTopEnabled.value = !next
    return
  }
  if (next) {
    alwaysOnTopExpanded.value = true
    const settings = (await window.tabdo.internal.dbGet('settings-general')) || {}
    alwaysOnTopShortcut.value =
      typeof settings.alwaysOnTopShortcut === 'string' && settings.alwaysOnTopShortcut
        ? settings.alwaysOnTopShortcut
        : ALWAYS_ON_TOP_DEFAULT_SHORTCUT
    info(`窗口置顶已启用，默认快捷键 ${alwaysOnTopShortcut.value}，可在“快捷键”页修改`)
  }
}

/**
 * 合并连续的外观调整，减少拖动滑块时的写库与重绘次数。
 * @param patch 需要更新的置顶字段。
 * @returns 无返回值。
 */
function scheduleAlwaysOnTopSave(
  patch: Parameters<typeof window.tabdo.internal.updateAlwaysOnTopConfig>[0]
): void {
  if (alwaysOnTopSaveTimer) clearTimeout(alwaysOnTopSaveTimer)
  alwaysOnTopSaveTimer = setTimeout(() => {
    alwaysOnTopSaveTimer = null
    void applyAlwaysOnTopConfig(patch)
  }, 150)
}

/**
 * 切换是否绘制置顶高亮边框。
 * @returns 更新完成后的 Promise。
 */
async function handleAlwaysOnTopBorderChange(): Promise<void> {
  const applied = await applyAlwaysOnTopConfig({
    borderEnabled: alwaysOnTopBorderEnabled.value
  })
  if (!applied) alwaysOnTopBorderEnabled.value = !alwaysOnTopBorderEnabled.value
}

/**
 * 切换边框颜色模式并立即应用。
 * @returns 更新完成后的 Promise。
 */
async function handleAlwaysOnTopColorModeChange(): Promise<void> {
  await applyAlwaysOnTopConfig({
    colorMode: alwaysOnTopColorMode.value,
    borderColor: alwaysOnTopBorderColor.value
  })
}

/**
 * 打开系统颜色选择器。
 * @returns 无返回值。
 */
function openAlwaysOnTopColorPicker(): void {
  alwaysOnTopColorInput.value?.click()
}

/**
 * 保存自定义边框颜色并切换为自定义模式。
 * @param event 颜色输入事件。
 * @returns 更新完成后的 Promise。
 */
async function handleAlwaysOnTopColorChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  alwaysOnTopBorderColor.value = target.value
  alwaysOnTopColorMode.value = 'custom'
  await applyAlwaysOnTopConfig({
    colorMode: 'custom',
    borderColor: alwaysOnTopBorderColor.value
  })
}

/**
 * 保存边框不透明度。
 * @returns 无返回值。
 */
function handleAlwaysOnTopOpacityChange(): void {
  scheduleAlwaysOnTopSave({ opacity: alwaysOnTopOpacity.value })
}

/**
 * 保存边框粗细。
 * @returns 无返回值。
 */
function handleAlwaysOnTopThicknessChange(): void {
  scheduleAlwaysOnTopSave({ thickness: alwaysOnTopThickness.value })
}

/**
 * 保存是否启用圆角边框。
 * @returns 更新完成后的 Promise。
 */
async function handleAlwaysOnTopRoundedChange(): Promise<void> {
  await applyAlwaysOnTopConfig({ roundedCorners: alwaysOnTopRoundedCorners.value })
}

/**
 * 保存置顶时是否播放提示音。
 * @returns 更新完成后的 Promise。
 */
async function handleAlwaysOnTopSoundChange(): Promise<void> {
  await applyAlwaysOnTopConfig({ playSound: alwaysOnTopPlaySound.value })
}

/**
 * 跳转到快捷键设置页，由用户统一修改置顶组合键。
 * @returns 无返回值。
 */
function goToAlwaysOnTopShortcutSettings(): void {
  jumpFunctionShortcutsSetting({ tab: 'builtin' })
}

/**
 * 设置页滚动时检查置顶面板是否仍可见；完全滚出可视区域后自动收起。
 * @param event 设置页容器的滚动事件。
 * @returns 无返回值。
 */
function handleGeneralSettingScroll(event: Event): void {
  if (!alwaysOnTopExpanded.value) return
  const panel = pinOptionsRef.value
  const container = event.target as HTMLElement | null
  // 只响应设置页纵向滚动容器，忽略面板内滑块的横向或局部滚动。
  if (!panel || !container || !container.classList.contains('content-panel')) return
  const rect = panel.getBoundingClientRect()
  const viewport = container.getBoundingClientRect()
  if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) {
    alwaysOnTopExpanded.value = false
  }
}

// 离开通用设置页时立即收紧展开面板，返回本页时保持收起。
onBeforeRouteLeave(() => {
  alwaysOnTopExpanded.value = false
})

// 处理窗口材质变化
async function handleWindowMaterialChange(): Promise<void> {
  try {
    await saveSettings()
    // 调用主进程更新材质（会广播到主渲染进程）
    await window.tabdo.internal.setWindowMaterial(windowMaterial.value)
    // 设置插件自己也需要更新 data-material 属性
    document.documentElement.setAttribute('data-material', windowMaterial.value)
  } catch (error) {
    console.error('更新窗口材质失败:', error)
  }
}

// 处理亚克力明亮模式透明度变化
async function handleAcrylicLightOpacityChange(): Promise<void> {
  try {
    await saveSettings()
    // 通知主渲染进程更新（主渲染进程会应用 CSS 叠加效果）
    await window.tabdo.internal.updateAcrylicOpacity(
      acrylicLightOpacity.value,
      acrylicDarkOpacity.value
    )
  } catch (error) {
    console.error('更新亚克力明亮模式透明度失败:', error)
  }
}

// 处理亚克力暗黑模式透明度变化
async function handleAcrylicDarkOpacityChange(): Promise<void> {
  try {
    await saveSettings()
    // 通知主渲染进程更新（主渲染进程会应用 CSS 叠加效果）
    await window.tabdo.internal.updateAcrylicOpacity(
      acrylicLightOpacity.value,
      acrylicDarkOpacity.value
    )
  } catch (error) {
    console.error('更新亚克力暗黑模式透明度失败:', error)
  }
}

// 处理开机启动变化
async function handleLaunchAtLoginChange(): Promise<void> {
  try {
    await window.tabdo.internal.setLaunchAtLogin(launchAtLogin.value)
    console.log('开机启动设置已更新:', launchAtLogin.value)
  } catch (error) {
    console.error('更新开机启动设置失败:', error)
    // 恢复状态
    launchAtLogin.value = !launchAtLogin.value
  }
}

// 处理关闭 GPU 加速开关变化
async function handleDisableGpuAccelerationChange(): Promise<void> {
  try {
    await saveSettings()
    info('设置已保存，重启应用后生效')
    console.log('关闭 GPU 加速设置已更新:', disableGpuAcceleration.value)
  } catch (err) {
    console.error('保存关闭 GPU 加速设置失败:', err)
  }
}

// 处理代理开关变化
async function handleProxyEnabledChange(): Promise<void> {
  try {
    await saveSettings()
    // 通知主进程更新代理配置
    await window.tabdo.internal.setProxyConfig({
      enabled: proxyEnabled.value,
      url: proxyUrl.value
    })
    console.log('代理开关已更新:', proxyEnabled.value)
    info(proxyEnabled.value ? '代理已启用' : '代理已禁用')
  } catch (error) {
    console.error('更新代理开关失败:', error)
    // 恢复状态
    proxyEnabled.value = !proxyEnabled.value
  }
}

// 处理代理地址变化
async function handleProxyUrlChange(): Promise<void> {
  try {
    // 验证代理地址格式
    if (proxyUrl.value && !isValidProxyUrl(proxyUrl.value)) {
      error('代理地址格式不正确，请使用 http://host:port 或 socks5://host:port 格式')
      return
    }

    await saveSettings()
    // 通知主进程更新代理配置
    await window.tabdo.internal.setProxyConfig({
      enabled: proxyEnabled.value,
      url: proxyUrl.value
    })
    console.log('代理地址已更新:', proxyUrl.value)
    info('代理地址已更新')
  } catch (err: any) {
    console.error('更新代理地址失败:', err)
    error(`更新代理地址失败: ${err.message || '未知错误'}`)
  }
}

// 验证代理 URL 格式
function isValidProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'socks5:', 'socks4:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

// ==================== 自定义颜色相关辅助函数 ====================

/**
 * 检测平台以筛选外观和终端选项。
 * @returns 平台检测完成后的 Promise。
 */
async function getPlatformInfo(): Promise<void> {
  try {
    const pf = await window.tabdo.internal.getPlatform()
    if (pf === 'darwin' || pf === 'win32' || pf === 'linux') {
      platform.value = pf
    }
  } catch (error) {
    console.error('获取平台信息失败:', error)
  }
}

// ==================== 数据持久化 ====================

/**
 * 加载通用设置并应用当前页面负责的运行时状态。
 * @returns 设置加载和应用完成后结束的 Promise
 */
async function loadSettings(): Promise<void> {
  try {
    // 加载数据库中的设置
    const data = await window.tabdo.internal.dbGet('settings-general')
    console.log('加载到的设置:', data)

    if (data) {
      opacity.value = data.opacity ?? 1
      compactMainWindowHeader.value = data.compactMainWindowHeader === true
      rememberToolWindowSize.value = data.rememberToolWindowSize !== false
      showTrayIcon.value = data.showTrayIcon ?? true
      awakeEnabled.value = data.awakeEnabled === true
      alwaysOnTopEnabled.value = data.alwaysOnTopEnabled === true
      alwaysOnTopShortcut.value =
        typeof data.alwaysOnTopShortcut === 'string' && data.alwaysOnTopShortcut
          ? data.alwaysOnTopShortcut
          : ALWAYS_ON_TOP_DEFAULT_SHORTCUT
      alwaysOnTopBorderEnabled.value = data.alwaysOnTopBorderEnabled !== false
      alwaysOnTopColorMode.value =
        data.alwaysOnTopBorderColorMode === 'custom' ? 'custom' : 'accent'
      alwaysOnTopBorderColor.value =
        typeof data.alwaysOnTopBorderColor === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(data.alwaysOnTopBorderColor)
          ? data.alwaysOnTopBorderColor
          : '#1A73E8'
      alwaysOnTopOpacity.value =
        typeof data.alwaysOnTopBorderOpacity === 'number' ? data.alwaysOnTopBorderOpacity : 100
      alwaysOnTopThickness.value =
        typeof data.alwaysOnTopBorderThickness === 'number' ? data.alwaysOnTopBorderThickness : 3
      alwaysOnTopRoundedCorners.value = data.alwaysOnTopRoundedCorners !== false
      alwaysOnTopPlaySound.value = data.alwaysOnTopPlaySound !== false
      theme.value = data.theme ?? 'system'
      primaryColor.value = data.primaryColor ?? 'green'
      autoCheckUpdate.value = data.autoCheckUpdate ?? true
      clipboardRetentionDays.value = data.clipboardRetentionDays ?? 180
      clipboardQuickMatchSeconds.value = data.clipboardQuickMatchSeconds ?? 5

      // 超级面板配置
      superPanelEnabled.value = true
      superPanelMouseButton.value = data.superPanelMouseButton ?? 'middle'
      superPanelLongPressMs.value = data.superPanelLongPressMs ?? 0
      superPanelBlockedApps.value = data.superPanelBlockedApps ?? []
      superPanelTranslateEnabled.value = data.superPanelTranslateEnabled ?? false
      superPanelAutoTranslate.value = data.superPanelAutoTranslate ?? true
      // 仅缺失时读取宿主系统默认材质，保留用户明确选择的“无”等偏好。
      windowMaterial.value =
        data.windowMaterial ?? (await window.tabdo.internal.getWindowMaterial())
      acrylicLightOpacity.value = data.acrylicLightOpacity ?? 78
      acrylicDarkOpacity.value = data.acrylicDarkOpacity ?? 50
      // GPU 加速控制
      disableGpuAcceleration.value = data.disableGpuAcceleration ?? false

      // 代理配置
      proxyEnabled.value = data.proxyEnabled ?? false
      proxyUrl.value = data.proxyUrl ?? ''

      // 终端打开配置
      terminal.value = data.terminal ?? 'default'
      terminalCustomCommand.value = data.terminalCustomCommand ?? ''

      // 加载自定义颜色
      if (data.customColor) {
        customColor.value = data.customColor
      }

      applyPrimaryColor(primaryColor.value, customColor.value)
    }

    // 应用透明度设置
    await window.tabdo.internal.setWindowOpacity(opacity.value)

    // 获取开机启动状态
    launchAtLogin.value = await window.tabdo.internal.getLaunchAtLogin()
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

/**
 * 合并保存通用设置，保留其他页面管理的字段。
 * @returns 设置保存完成后结束的 Promise
 */
async function saveSettings(): Promise<void> {
  try {
    // 先读取现有设置，保留本页不管理的字段（如 builtinAppShortcutsEnabled）
    const existing = (await window.tabdo.internal.dbGet('settings-general')) || {}

    await window.tabdo.internal.dbPut('settings-general', {
      ...existing,
      opacity: opacity.value,
      compactMainWindowHeader: compactMainWindowHeader.value,
      rememberToolWindowSize: rememberToolWindowSize.value,
      superPanelEnabled: superPanelEnabled.value,
      superPanelMouseButton: superPanelMouseButton.value,
      superPanelLongPressMs: superPanelLongPressMs.value,
      superPanelBlockedApps: superPanelBlockedApps.value.map((item) => ({ ...item })),
      superPanelTranslateEnabled: superPanelTranslateEnabled.value,
      superPanelAutoTranslate: superPanelAutoTranslate.value,
      theme: theme.value,
      primaryColor: primaryColor.value,
      customColor: customColor.value,
      showTrayIcon: showTrayIcon.value,
      awakeEnabled: awakeEnabled.value,
      windowMaterial: windowMaterial.value,
      acrylicLightOpacity: acrylicLightOpacity.value,
      acrylicDarkOpacity: acrylicDarkOpacity.value,
      disableGpuAcceleration: disableGpuAcceleration.value,
      proxyEnabled: proxyEnabled.value,
      proxyUrl: proxyUrl.value,
      autoCheckUpdate: autoCheckUpdate.value,
      clipboardRetentionDays: clipboardRetentionDays.value,
      clipboardQuickMatchSeconds: clipboardQuickMatchSeconds.value,
      terminal: terminal.value,
      terminalCustomCommand: terminalCustomCommand.value
    })
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}

/**
 * 按平台加载通用设置，避免表单出现错误的初始值。
 * @returns 初始化完成后的 Promise。
 */
async function initializeSettings(): Promise<void> {
  try {
    // 平台影响外观和终端选项，先完成检测再显示表单。
    await getPlatformInfo()
    await loadSettings()
  } finally {
    settingsLoaded.value = true
  }
}

// 初始化时加载设置
onMounted(() => {
  void initializeSettings()
  // 设置页滚动到置顶面板之外时自动收起，避免展开状态留在屏幕外。
  document.addEventListener('scroll', handleGeneralSettingScroll, true)
  // 托盘修改唤醒后同步设置页开关，避免两个入口显示不同状态。
  offAwakeState =
    window.tabdo.internal.onAwakeStateChanged?.((state) => {
      awakeEnabled.value = state?.enabled === true
    }) || null
})

onUnmounted(() => {
  document.removeEventListener('scroll', handleGeneralSettingScroll, true)
  offAwakeState?.()
  offAwakeState = null
  if (alwaysOnTopSaveTimer) {
    clearTimeout(alwaysOnTopSaveTimer)
    alwaysOnTopSaveTimer = null
  }
})
</script>

<template>
  <div v-if="settingsLoaded" class="content-panel">
    <!-- ==================== 超级面板 ==================== -->
    <div class="setting-group">
      <h3 class="setting-group-title">超级面板</h3>

      <div class="setting-item">
        <div class="setting-label">
          <span>鼠标按键弹出</span>
          <span class="setting-desc">选择触发超级面板的鼠标按键</span>
        </div>
        <div class="setting-control">
          <Dropdown
            v-model="superPanelTriggerMode"
            :options="superPanelMouseButtonOptions"
            @change="handleSuperPanelTriggerModeChange"
          />
        </div>
      </div>

      <div v-if="superPanelTriggerMode.endsWith('-long')" class="setting-item">
        <div class="setting-label">
          <span>长按响应时间</span>
          <span class="setting-desc">长按鼠标按键多少毫秒后弹出超级面板</span>
        </div>
        <div class="setting-control">
          <input
            v-model.number="superPanelLongPressMs"
            type="number"
            class="input"
            placeholder="500"
            min="200"
            max="3000"
            @blur="handleSuperPanelLongPressMsChange"
            @keyup.enter="handleSuperPanelLongPressMsChange"
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>选中文本自动翻译</span>
          <span class="setting-desc">使用默认翻译服务和语言，中文为主的选文不自动翻译</span>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input
              v-model="superPanelAutoTranslate"
              type="checkbox"
              aria-label="选中文本自动翻译"
              @change="saveSettings"
            />
            <span class="toggle-slider"></span>
          </label>
          <button class="btn translation-settings-btn" @click="goToTranslationProviders">
            前往翻译
          </button>
        </div>
      </div>

      <div class="setting-item blocked-apps-setting">
        <div class="blocked-apps-content">
          <div class="blocked-apps-header">
            <div class="setting-label">
              <span>屏蔽弹出</span>
              <span class="setting-desc">在指定应用窗口中不触发超级面板</span>
            </div>
            <div class="setting-control">
              <button class="btn" @click="handleAddBlockedApp">添加当前窗口</button>
            </div>
          </div>
          <div v-if="superPanelBlockedApps.length > 0" class="blocked-apps-tags">
            <span
              v-for="(app, index) in superPanelBlockedApps"
              :key="app.app"
              class="blocked-app-tag"
            >
              {{ app.label || app.app }}
              <button class="blocked-app-remove" @click="handleRemoveBlockedApp(index)">
                &times;
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="setting-group">
      <h3 class="setting-group-title">剪贴板快捷匹配</h3>
      <div class="setting-item">
        <div class="setting-label">
          <label for="clipboard-quick-match">复制后匹配时限（秒）</label>
          <span class="setting-desc">无选区时匹配最近复制的内容；0 表示关闭</span>
        </div>
        <div class="setting-control">
          <input
            id="clipboard-quick-match"
            v-model.number="clipboardQuickMatchSeconds"
            type="number"
            class="input compact-number-input"
            min="0"
            max="300"
            @change="handleClipboardQuickMatchChange"
          />
        </div>
      </div>
    </div>

    <DataLocationSetting />

    <!-- ==================== 基础 ==================== -->
    <div class="setting-group">
      <h3 class="setting-group-title">基础</h3>

      <div class="setting-item">
        <div class="setting-label">
          <span>开机自动启动</span>
          <span class="setting-desc">登录系统时自动启动应用</span>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input v-model="launchAtLogin" type="checkbox" @change="handleLaunchAtLoginChange" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>显示托盘图标</span>
          <span class="setting-desc">在系统托盘中显示应用图标</span>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input v-model="showTrayIcon" type="checkbox" @change="handleTrayIconChange" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>唤醒</span>
          <span class="setting-desc"
            >保持系统唤醒；启用时自动显示托盘图标，可在托盘右键“唤醒”中调整持续时间与屏幕点亮</span
          >
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input
              v-model="awakeEnabled"
              type="checkbox"
              aria-label="唤醒"
              @change="handleAwakeChange"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div v-if="platform === 'win32'" class="setting-item">
        <div class="setting-label">
          <span>窗口置顶</span>
          <span class="setting-desc">按快捷键把当前窗口固定在最前，并显示可自定义的高亮边框</span>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input
              v-model="alwaysOnTopEnabled"
              type="checkbox"
              aria-label="窗口置顶"
              @change="handleAlwaysOnTopToggle"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div
        v-if="platform === 'win32' && alwaysOnTopEnabled"
        ref="pinOptionsRef"
        class="pin-options"
      >
        <button
          type="button"
          class="pin-options-header"
          :aria-expanded="alwaysOnTopExpanded"
          @click="alwaysOnTopExpanded = !alwaysOnTopExpanded"
        >
          <span>置顶样式与快捷键</span>
          <span class="pin-options-chevron" :class="{ expanded: alwaysOnTopExpanded }"></span>
        </button>

        <div v-show="alwaysOnTopExpanded" class="pin-options-body">
          <div class="setting-item">
            <div class="setting-label">
              <span>显示高亮边框</span>
              <span class="setting-desc">关闭后仍可置顶，但不绘制边框</span>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input
                  v-model="alwaysOnTopBorderEnabled"
                  type="checkbox"
                  aria-label="显示高亮边框"
                  @change="handleAlwaysOnTopBorderChange"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <template v-if="alwaysOnTopBorderEnabled">
            <div class="setting-item">
              <div class="setting-label">
                <span>边框颜色</span>
                <span class="setting-desc">跟随系统强调色，或指定固定颜色</span>
              </div>
              <div class="setting-control">
                <Dropdown
                  v-model="alwaysOnTopColorMode"
                  :options="[
                    { label: '系统强调色', value: 'accent' },
                    { label: '自定义颜色', value: 'custom' }
                  ]"
                  @change="handleAlwaysOnTopColorModeChange"
                />
              </div>
            </div>

            <div v-if="alwaysOnTopColorMode === 'custom'" class="setting-item">
              <div class="setting-label">
                <span>自定义颜色</span>
                <span class="setting-desc">点击色块选择边框颜色</span>
              </div>
              <div class="setting-control pin-color-control">
                <button
                  type="button"
                  class="pin-color-swatch"
                  :style="{ backgroundColor: alwaysOnTopBorderColor }"
                  title="选择边框颜色"
                  @click="openAlwaysOnTopColorPicker"
                ></button>
                <span class="pin-color-value">{{ alwaysOnTopBorderColor.toUpperCase() }}</span>
                <input
                  ref="alwaysOnTopColorInput"
                  type="color"
                  class="color-picker-hidden"
                  :value="alwaysOnTopBorderColor"
                  @change="handleAlwaysOnTopColorChange"
                />
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-label">
                <span>不透明度</span>
                <span class="setting-desc">调整边框颜色的透明程度</span>
              </div>
              <div class="setting-control opacity-control">
                <Slider
                  v-model="alwaysOnTopOpacity"
                  :min="0"
                  :max="100"
                  :step="1"
                  :formatter="(value) => `${Math.round(value)}%`"
                  @change="handleAlwaysOnTopOpacityChange"
                />
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-label">
                <span>边框粗细</span>
                <span class="setting-desc">设置高亮边框的线条宽度</span>
              </div>
              <div class="setting-control opacity-control">
                <Slider
                  v-model="alwaysOnTopThickness"
                  :min="1"
                  :max="10"
                  :step="1"
                  :formatter="(value) => `${Math.round(value)} px`"
                  @change="handleAlwaysOnTopThicknessChange"
                />
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-label">
                <span>启用圆角</span>
                <span class="setting-desc">边框四角使用圆角，贴合 Windows 11 窗口外观</span>
              </div>
              <div class="setting-control">
                <label class="toggle">
                  <input
                    v-model="alwaysOnTopRoundedCorners"
                    type="checkbox"
                    aria-label="启用圆角"
                    @change="handleAlwaysOnTopRoundedChange"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </template>

          <div class="setting-item">
            <div class="setting-label">
              <span>置顶时播放声音</span>
              <span class="setting-desc">固定窗口时播放系统提示音</span>
            </div>
            <div class="setting-control">
              <label class="toggle">
                <input
                  v-model="alwaysOnTopPlaySound"
                  type="checkbox"
                  aria-label="置顶时播放声音"
                  @change="handleAlwaysOnTopSoundChange"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>快捷键</span>
              <span class="setting-desc">当前窗口置顶的触发快捷键</span>
            </div>
            <div class="setting-control">
              <kbd class="pin-shortcut">{{ alwaysOnTopShortcut }}</kbd>
              <button class="btn btn-sm" @click="goToAlwaysOnTopShortcutSettings">
                前往快捷键设置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== 外观 ==================== -->
    <div class="setting-group">
      <h3 class="setting-group-title">外观</h3>

      <div class="setting-item">
        <div class="setting-label">
          <span>主题设置</span>
          <span class="setting-desc">选择应用的主题外观</span>
        </div>
        <div class="setting-control">
          <Dropdown v-model="theme" :options="themeOptions" @change="handleThemeChange" />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>紧凑顶部栏</span>
          <span class="setting-desc">缩小插件顶部栏，显示更多内容</span>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input
              v-model="compactMainWindowHeader"
              type="checkbox"
              aria-label="紧凑顶部栏"
              @change="handleCompactMainWindowHeaderChange"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>主题色</span>
          <span class="setting-desc">自定义应用的主色调</span>
        </div>
        <div class="setting-control color-control">
          <div
            v-for="color in themeColors"
            :key="color.value"
            class="color-option"
            :class="{ active: primaryColor === color.value }"
            :style="{ backgroundColor: color.hex }"
            :title="color.label"
            @click="handlePrimaryColorChange(color.value)"
          ></div>
          <div
            class="color-option custom-color-option"
            :class="{ active: primaryColor === 'custom' }"
            :style="{ backgroundColor: customColor }"
            title="自定义"
            @click="handleSelectCustomColor"
          ></div>
          <button v-if="primaryColor === 'custom'" class="btn btn-sm" @click="openColorPicker">
            自定义
          </button>
          <input
            ref="colorPickerInput"
            type="color"
            :value="customColor"
            class="color-picker-hidden"
            @input="handleCustomColorChange"
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>窗口不透明度</span>
          <span class="setting-desc">调整窗口的透明度</span>
        </div>
        <div class="setting-control opacity-control">
          <Slider
            v-model="opacity"
            :min="0.3"
            :max="1"
            :step="0.01"
            :formatter="(value) => `${Math.round(value * 100)}%`"
            @change="handleOpacityChange"
          />
        </div>
      </div>

      <div v-if="platform === 'win32'" class="setting-item">
        <div class="setting-label">
          <span>窗口材质</span>
          <span class="setting-desc">选择窗口背景材质效果（需要 Windows 11）</span>
        </div>
        <div class="setting-control">
          <Dropdown
            v-model="windowMaterial"
            :options="windowMaterialOptions"
            @change="handleWindowMaterialChange"
          />
        </div>
      </div>

      <div v-if="platform === 'win32' && windowMaterial === 'acrylic'" class="setting-item">
        <div class="setting-label">
          <span>明亮模式背景色透明度</span>
          <span class="setting-desc">调整亚克力材质在明亮模式下的白色背景叠加透明度</span>
        </div>
        <div class="setting-control opacity-control">
          <Slider
            v-model="acrylicLightOpacity"
            :min="0"
            :max="100"
            :step="1"
            :formatter="(value) => `${value}%`"
            @change="handleAcrylicLightOpacityChange"
          />
        </div>
      </div>

      <div v-if="platform === 'win32' && windowMaterial === 'acrylic'" class="setting-item">
        <div class="setting-label">
          <span>暗黑模式背景色透明度</span>
          <span class="setting-desc">调整亚克力材质在暗黑模式下的黑色背景叠加透明度</span>
        </div>
        <div class="setting-control opacity-control">
          <Slider
            v-model="acrylicDarkOpacity"
            :min="0"
            :max="100"
            :step="1"
            :formatter="(value) => `${value}%`"
            @change="handleAcrylicDarkOpacityChange"
          />
        </div>
      </div>
    </div>

    <!-- ==================== 终端打开 ==================== -->
    <div class="setting-group">
      <h3 class="setting-group-title">终端打开</h3>

      <div class="setting-item">
        <div class="setting-label">
          <span>打开终端应用</span>
          <span class="setting-desc">触发⌈打开终端⌋指令时使用的终端</span>
        </div>
        <div class="setting-control">
          <Dropdown v-model="terminal" :options="terminalOptions" @change="saveSettings" />
        </div>
      </div>

      <div v-if="terminal === 'custom'" class="setting-item">
        <div class="setting-label">
          <span>自定义命令</span>
          <span class="setting-desc"
            >用 {path} 代表目标目录，如 ghostty --working-directory={path}</span
          >
        </div>
        <div class="setting-control">
          <input
            v-model="terminalCustomCommand"
            type="text"
            class="input"
            placeholder="alacritty --working-directory={path}"
            @blur="saveSettings"
            @keyup.enter="saveSettings"
          />
        </div>
      </div>
    </div>

    <!-- ==================== 行为 ==================== -->
    <div class="setting-group">
      <h3 class="setting-group-title">行为</h3>

      <div class="setting-item">
        <div class="setting-label">
          <span>记住子组件窗口大小</span>
          <span class="setting-desc">可调整的子组件和插件窗口按上次大小打开</span>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input
              v-model="rememberToolWindowSize"
              type="checkbox"
              @change="handleRememberToolWindowSizeChange"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span>剪贴板历史保存天数</span>
          <span class="setting-desc">剪贴板历史记录的保留时长（天）</span>
        </div>
        <div class="setting-control">
          <input
            v-model.number="clipboardRetentionDays"
            type="number"
            class="input"
            placeholder="180"
            min="1"
            max="3650"
            @blur="handleClipboardRetentionDaysChange"
            @keyup.enter="handleClipboardRetentionDaysChange"
          />
          <button
            v-if="clipboardRetentionDays !== 180"
            class="btn btn-icon"
            title="重置"
            @click="resetClipboardRetentionDays"
          >
            <div class="i-z-refresh font-size-20px" />
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== 网络 ==================== -->
    <div class="setting-group">
      <h3 class="setting-group-title">网络</h3>

      <div class="setting-item">
        <div class="setting-label">
          <span>网络代理</span>
          <span class="setting-desc">配置 HTTP/HTTPS 代理服务器</span>
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input v-model="proxyEnabled" type="checkbox" @change="handleProxyEnabledChange" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div v-if="proxyEnabled" class="setting-item">
        <div class="setting-label">
          <span>代理地址</span>
          <span class="setting-desc">格式: http://host:port 或 socks5://host:port</span>
        </div>
        <div class="setting-control">
          <input
            v-model="proxyUrl"
            type="text"
            class="input"
            placeholder="例如: http://127.0.0.1:7890"
            @blur="handleProxyUrlChange"
            @keyup.enter="handleProxyUrlChange"
          />
        </div>
      </div>
    </div>

    <!-- ==================== 开发者 ==================== -->
    <details class="setting-group developer-settings">
      <summary class="setting-group-title">开发者</summary>

      <div class="setting-item">
        <div class="setting-label">
          <span>关闭 GPU 加速</span>
          <span class="setting-desc"
            >禁用硬件加速渲染，可解决白屏、渲染异常等 GPU 兼容性问题，修改后需重启应用生效</span
          >
        </div>
        <div class="setting-control">
          <label class="toggle">
            <input
              v-model="disableGpuAcceleration"
              type="checkbox"
              @change="handleDisableGpuAccelerationChange"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </details>
  </div>
  <div v-else class="content-panel" aria-busy="true"></div>
</template>

<style scoped>
.content-panel {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  background: var(--bg-color);
}

/* 设置分组 */
.setting-group {
  margin-bottom: 28px;
}

.setting-group:last-child {
  margin-bottom: 0;
}

.setting-group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
  margin: 0 0 4px 0;
  line-height: 1.4;
}

/* 设置项 */
.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding: 20px 0;
  border-bottom: 1px solid var(--divider-color);
}

.setting-group .setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.setting-label > :is(span, label):first-child {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.setting-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.setting-control {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
}

/* 窗口置顶外观：启用后才出现的可折叠子项 */
.pin-options {
  border-bottom: 1px solid var(--divider-color);
}

.setting-group .pin-options:last-child {
  border-bottom: none;
}

.pin-options-header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.pin-options-header:hover {
  color: var(--primary-color);
}

.pin-options-chevron {
  width: 8px;
  height: 8px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform 0.2s;
}

.pin-options-chevron.expanded {
  transform: rotate(-135deg);
}

.pin-options-body .setting-item {
  padding: 14px 0;
}

.pin-color-control {
  gap: 10px;
}

.pin-color-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}

.pin-color-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.pin-shortcut {
  padding: 5px 10px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  background: var(--control-bg);
  color: var(--text-color);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
}

.translation-settings-btn {
  white-space: nowrap;
  flex-shrink: 0;
}

.input.compact-number-input {
  width: 96px;
  min-width: 0;
  box-sizing: border-box;
}

.quick-actions-wrapper {
  position: relative;
}

.quick-actions-trigger {
  color: var(--text-secondary);
}

.quick-actions-trigger:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.quick-actions-trigger.active {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.quick-actions-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: var(--dialog-bg, var(--bg-color));
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--shadow-color);
  z-index: 100;
  overflow: hidden;
}

.quick-actions-item {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  gap: 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.quick-actions-item + .quick-actions-item {
  border-top: 1px solid var(--divider-color);
}

.quick-actions-item:hover {
  background: var(--hover-bg);
}

.quick-actions-item.active {
  background: var(--primary-light-bg);
}

.quick-actions-item-reset:hover .quick-actions-item-label {
  color: var(--primary-color);
}

.quick-actions-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.quick-actions-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.quick-actions-item-desc {
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-secondary);
}

.dropdown-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.dropdown-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

/* 不透明度控制 */
.opacity-control {
  min-width: 250px;
  gap: 12px;
}

.wallpaper-setting-item {
  align-items: flex-start;
}

.wallpaper-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 360px;
}

.wallpaper-preview-wrapper {
  width: 96px;
  height: 60px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  background: var(--control-bg);
}

.wallpaper-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wallpaper-preview-error {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
}

.wallpaper-actions {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.wallpaper-file-name {
  max-width: 230px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wallpaper-buttons {
  display: flex;
  gap: 8px;
}

/* 文本输入框 - 只设置布局，颜色由 global.css 控制 */
:deep(.input) {
  min-width: 250px;
  appearance: none;
  background: var(--control-bg);
  height: 34px;
  box-sizing: border-box;
  line-height: 20px;
  padding-block: 5px;
}

/* 同一表单行的普通按钮、输入和选择器采用一致高度与材质。 */
.setting-control .btn,
.setting-control :deep(.select-trigger) {
  height: 34px;
  box-sizing: border-box;
  line-height: 20px;
  padding-block: 5px;
}

/* 头像控制 */
.avatar-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-preview {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--control-border);
}

/* 颜色选择器 */
/* 组合控件（如：开关+按钮） */
.combined-control {
  gap: 16px;
}

.color-control {
  display: flex;
  gap: 12px;
}

.color-option {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border: 2px solid transparent;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.15);
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: var(--text-color);
  transform: scale(1.1);
}

.color-option.active::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* 自定义颜色选择器 */
.custom-color-option {
  position: relative;
  overflow: hidden;
}

/* 隐藏的颜色选择器 */
.color-picker-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

/* 自定义按钮 */

/* Tab 目标设置项 */
.tab-target-setting-item {
  align-items: flex-start;
}

.setting-control-column {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.hotkey-presets {
  display: flex;
  gap: 6px;
}

.hotkey-preset-btn {
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.hotkey-preset-btn:hover {
  color: var(--primary-color);
  background: var(--primary-light-bg);
  border-color: var(--primary-color);
}

.hotkey-preset-btn.active {
  color: var(--primary-color);
  background: var(--primary-light-bg);
  border-color: var(--primary-color);
  font-weight: 500;
}

.blocked-apps-content {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blocked-apps-header {
  display: flex;
  justify-content: space-between;
}

.blocked-apps-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background-color: var(--control-bg);
  border-radius: 4px;
  border: 2px solid var(--control-border);
}

.blocked-app-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  background: var(--control-bg);
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--text-color);
  transition: border-color 0.2s;
}

.blocked-app-tag:hover {
  border-color: var(--danger-color);
}

.blocked-app-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  transition:
    color 0.2s,
    background 0.2s;
}

.blocked-app-remove:hover {
  color: var(--danger-color);
  background: var(--danger-light-bg);
}
</style>
