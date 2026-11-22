<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast, ShortcutEditor } from '@/components'
import { weightedSearch } from '@/utils'
import { useJumpFunction, useTabDoSubInput } from '@/composables'
import type {
  ShortcutsSettingCommandTargetOptionBase,
  ShortcutsSettingCommandCmdType,
  ShortcutsSettingJumpFunction,
  ShortcutsSettingShortcutTargetOption,
  ShortcutsSettingTab
} from '@/views/ShortcutsSetting/ShortcutsSetting'
import { buildShortcutTargetValue } from '@/views/ShortcutsSetting/ShortcutsSetting'
import {
  DIRECT_APP_ALIAS_GROUP_KEY,
  DIRECT_APP_ALIAS_GROUP_TITLE,
  LOCAL_SHORTCUT_ALIAS_GROUP_KEY,
  LOCAL_SHORTCUT_ALIAS_GROUP_TITLE,
  getCommandId as _getCommandId
} from '@shared/commandShared'
import BuiltinWakeupSetting from './BuiltinWakeupSetting.vue'
import BuiltinFullscreenSetting from './BuiltinFullscreenSetting.vue'
import BuiltinAlwaysOnTopSetting from './BuiltinAlwaysOnTopSetting.vue'
import PresentationShortcuts from './PresentationShortcuts.vue'

const { success, error, warning, confirm } = useToast()

interface GlobalShortcut {
  id: string
  shortcut: string
  target: string
  enabled: boolean
  autoCopy?: boolean
  preScreenshotOptimization?: boolean
}

const activeTab = ref<ShortcutsSettingTab>('builtin')
const globalShortcuts = ref<GlobalShortcut[]>([])
const appShortcuts = ref<GlobalShortcut[]>([])
const isDeleting = ref(false)
const loading = ref(true)
const showEditor = ref(false)
const editingShortcut = ref<GlobalShortcut | null>(null)
const prefillTarget = ref('')

// 快捷键目标列表来自主进程整理后的 canonical commands，仅包含允许直接触发的插件指令和系统应用。
const commandTargetOptions = ref<ShortcutsSettingCommandTargetOptionBase[]>([])
const shortcutTargetOptions = computed<ShortcutsSettingShortcutTargetOption[]>(() =>
  commandTargetOptions.value.map((target) => ({
    ...target,
    value: buildShortcutTargetValue(target)
  }))
)

const currentShortcuts = computed(() => {
  if (activeTab.value === 'global') return globalShortcuts.value
  if (activeTab.value === 'app') return appShortcuts.value
  return []
})

const { value: searchQuery } = useTabDoSubInput('', '搜索快捷键...')

const filteredShortcuts = computed(() =>
  weightedSearch(currentShortcuts.value, searchQuery.value || '', [
    { value: (s) => s.shortcut || '', weight: 10 },
    { value: (s) => s.target || '', weight: 5 }
  ])
)

const addButtonLabel = computed(() => '添加快捷键')
const showShortcutEditor = computed(() => showEditor.value)

function getCommandId(command: {
  name: string
  path?: string
  type: 'plugin' | 'direct'
  subType?: 'app' | 'system-setting' | 'local-shortcut'
  featureCode?: string
  cmdType?: 'text' | 'window' | 'regex' | 'over' | 'img' | 'files'
  pluginName?: string
}): string {
  return _getCommandId({
    type: command.type,
    subType: command.subType,
    path: command.path,
    pluginName: command.pluginName,
    featureCode: command.featureCode,
    name: command.name,
    cmdType: command.cmdType
  })
}

async function loadGlobalShortcuts(): Promise<void> {
  try {
    const data = await window.tabdo.internal.dbGet('global-shortcuts')
    globalShortcuts.value = (data || []).map((shortcut: any) => ({
      ...shortcut,
      autoCopy: shortcut.autoCopy ?? false,
      preScreenshotOptimization: shortcut.preScreenshotOptimization ?? false
    }))
  } catch (err) {
    console.error('加载全局快捷键失败:', err)
  }
}

async function loadAppShortcuts(): Promise<void> {
  try {
    const data = await window.tabdo.internal.dbGet('app-shortcuts')
    appShortcuts.value = data || []
  } catch (err) {
    console.error('加载应用快捷键失败:', err)
  }
}

/**
 * 读取可绑定的插件指令、系统应用和本地启动项。
 * @returns 目标加载完成后的 Promise。
 */
async function loadCommandTargets(): Promise<void> {
  try {
    const result = await window.tabdo.internal.getCommands()
    const pluginMap = new Map((result.plugins || []).map((plugin: any) => [plugin.name, plugin]))
    const targetMap = new Map<string, ShortcutsSettingCommandTargetOptionBase>()

    const addTarget = (target: ShortcutsSettingCommandTargetOptionBase): void => {
      targetMap.set(target.commandId, target)
    }

    const addPluginTarget = (command: any, cmdType: ShortcutsSettingCommandCmdType): void => {
      if (command.type !== 'plugin') return
      if (!command.pluginName || !command.featureCode || !command.name) return

      const plugin = pluginMap.get(command.pluginName)
      const pluginTitle = command.pluginTitle || plugin?.title || command.pluginName
      const commandId = getCommandId({
        type: 'plugin',
        path: command.path,
        pluginName: command.pluginName,
        featureCode: command.featureCode,
        name: command.name,
        cmdType
      })

      addTarget({
        commandId,
        type: 'plugin',
        path: command.path,
        groupKey: command.pluginName,
        groupTitle: pluginTitle,
        featureCode: command.featureCode,
        subtitle: command.featureCode,
        pluginName: command.pluginName,
        pluginTitle,
        cmdName: command.name,
        cmdType,
        icon: command.icon || plugin?.logo,
        label: `${pluginTitle} / ${command.name}`
      })
    }

    const addDirectAppTarget = (command: any): void => {
      if (
        command.type !== 'direct' ||
        command.subType !== 'app' ||
        !command.path ||
        !command.name
      ) {
        return
      }

      const commandId = getCommandId({
        type: 'direct',
        subType: 'app',
        path: command.path,
        name: command.name,
        cmdType: 'text'
      })

      addTarget({
        commandId,
        type: 'direct',
        subType: 'app',
        path: command.path,
        groupKey: DIRECT_APP_ALIAS_GROUP_KEY,
        groupTitle: DIRECT_APP_ALIAS_GROUP_TITLE,
        featureCode: command.path,
        subtitle: command.path,
        pluginName: DIRECT_APP_ALIAS_GROUP_KEY,
        pluginTitle: DIRECT_APP_ALIAS_GROUP_TITLE,
        cmdName: command.name,
        cmdType: 'text',
        icon: command.icon,
        label: `${DIRECT_APP_ALIAS_GROUP_TITLE} / ${command.name}`
      })
    }

    const addLocalShortcutTarget = (command: any): void => {
      if (
        command.type !== 'direct' ||
        command.subType !== 'local-shortcut' ||
        !command.path ||
        !command.name
      ) {
        return
      }

      const commandId = getCommandId({
        type: 'direct',
        subType: 'local-shortcut',
        path: command.path,
        name: command.name,
        cmdType: 'text'
      })

      addTarget({
        commandId,
        type: 'direct',
        subType: 'local-shortcut',
        path: command.path,
        groupKey: LOCAL_SHORTCUT_ALIAS_GROUP_KEY,
        groupTitle: LOCAL_SHORTCUT_ALIAS_GROUP_TITLE,
        featureCode: command.path,
        subtitle: command.path,
        pluginName: LOCAL_SHORTCUT_ALIAS_GROUP_KEY,
        pluginTitle: LOCAL_SHORTCUT_ALIAS_GROUP_TITLE,
        cmdName: command.name,
        cmdType: 'text',
        icon: command.icon,
        label: `${LOCAL_SHORTCUT_ALIAS_GROUP_TITLE} / ${command.name}`
      })
    }

    for (const command of result.commands || []) {
      if (command.type === 'direct' && command.subType === 'app') {
        addDirectAppTarget(command)
        continue
      }

      if (command.type === 'direct' && command.subType === 'local-shortcut') {
        addLocalShortcutTarget(command)
        continue
      }

      if (command.cmdType === 'text') {
        addPluginTarget(command, 'text')
      }
    }

    for (const command of result.regexCommands || []) {
      if (
        command.cmdType === 'regex' ||
        command.cmdType === 'over' ||
        command.cmdType === 'img' ||
        command.cmdType === 'files' ||
        command.cmdType === 'window'
      ) {
        addPluginTarget(command, command.cmdType)
      }
    }

    commandTargetOptions.value = Array.from(targetMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'zh-CN')
    )
  } catch (err) {
    console.error('加载指令目标失败:', err)
  }
}

async function loadShortcuts(): Promise<void> {
  loading.value = true
  try {
    await Promise.all([loadGlobalShortcuts(), loadAppShortcuts(), loadCommandTargets()])
  } finally {
    loading.value = false
  }
}

function switchToTab(tab: ShortcutsSettingTab): void {
  activeTab.value = tab
}

async function saveGlobalShortcuts(): Promise<void> {
  try {
    await window.tabdo.internal.dbPut(
      'global-shortcuts',
      JSON.parse(JSON.stringify(globalShortcuts.value))
    )
  } catch (err) {
    console.error('保存全局快捷键失败:', err)
  }
}

async function saveAppShortcuts(): Promise<void> {
  try {
    await window.tabdo.internal.dbPut(
      'app-shortcuts',
      JSON.parse(JSON.stringify(appShortcuts.value))
    )
  } catch (err) {
    console.error('保存应用快捷键失败:', err)
  }
}

function showAddEditor(): void {
  editingShortcut.value = null
  prefillTarget.value = ''
  showEditor.value = true
}

function handleEdit(shortcut: GlobalShortcut): void {
  editingShortcut.value = shortcut
  prefillTarget.value = ''
  showEditor.value = true
}

function closeEditor(): void {
  showEditor.value = false
  editingShortcut.value = null
  prefillTarget.value = ''
}

async function handleSave(
  recordedShortcut: string,
  targetCommand: string,
  preScreenshotOptimization: boolean
): Promise<void> {
  if (!recordedShortcut || !targetCommand) {
    return
  }

  if (activeTab.value === 'global') {
    await handleSaveGlobalShortcut(recordedShortcut, targetCommand, preScreenshotOptimization)
  } else {
    await handleSaveAppShortcut(recordedShortcut, targetCommand)
  }
}

async function handleSaveGlobalShortcut(
  recordedShortcut: string,
  targetCommand: string,
  preScreenshotOptimization: boolean
): Promise<void> {
  if (editingShortcut.value) {
    const exists = globalShortcuts.value.some(
      (s) => s.id !== editingShortcut.value!.id && s.shortcut === recordedShortcut
    )
    if (exists) {
      warning('该快捷键已被其他指令占用，请使用其他快捷键')
      return
    }

    const oldShortcut = editingShortcut.value.shortcut
    const oldTarget = editingShortcut.value.target
    const autoCopy = editingShortcut.value.autoCopy ?? false // 保留原有 autoCopy 配置
    const oldPreScreenshotOptimization = editingShortcut.value.preScreenshotOptimization ?? false
    const shouldRestorePreviousRegistration =
      oldShortcut !== recordedShortcut ||
      oldTarget !== targetCommand ||
      oldPreScreenshotOptimization !== preScreenshotOptimization

    try {
      if (oldShortcut !== recordedShortcut) {
        await window.tabdo.internal.unregisterGlobalShortcut(oldShortcut)
      }

      const result = await window.tabdo.internal.registerGlobalShortcut(
        recordedShortcut,
        targetCommand,
        autoCopy,
        preScreenshotOptimization
      )

      if (result.success) {
        const index = globalShortcuts.value.findIndex((s) => s.id === editingShortcut.value!.id)
        if (index >= 0) {
          globalShortcuts.value[index].shortcut = recordedShortcut
          globalShortcuts.value[index].target = targetCommand
          globalShortcuts.value[index].preScreenshotOptimization = preScreenshotOptimization
        }

        await saveGlobalShortcuts()
        success('快捷键更新成功!')
        closeEditor()
      } else {
        if (shouldRestorePreviousRegistration) {
          await window.tabdo.internal.registerGlobalShortcut(
            oldShortcut,
            oldTarget,
            autoCopy,
            oldPreScreenshotOptimization
          )
        }
        error(`快捷键注册失败: ${result.error}`)
      }
    } catch (err: any) {
      if (shouldRestorePreviousRegistration) {
        await window.tabdo.internal.registerGlobalShortcut(
          oldShortcut,
          oldTarget,
          autoCopy,
          oldPreScreenshotOptimization
        )
      }
      console.error('更新快捷键失败:', err)
      error(`更新快捷键失败: ${err.message || '未知错误'}`)
    }
    return
  }

  const exists = globalShortcuts.value.some((s) => s.shortcut === recordedShortcut)
  if (exists) {
    warning('该快捷键已存在，请使用其他快捷键')
    return
  }

  const newShortcut: GlobalShortcut = {
    id: Date.now().toString(),
    shortcut: recordedShortcut,
    target: targetCommand,
    enabled: true,
    autoCopy: false,
    preScreenshotOptimization
  }

  globalShortcuts.value.push(newShortcut)
  await saveGlobalShortcuts()

  try {
    const result = await window.tabdo.internal.registerGlobalShortcut(
      recordedShortcut,
      targetCommand,
      false,
      preScreenshotOptimization
    )
    if (result.success) {
      success('快捷键添加成功!')
      closeEditor()
    } else {
      globalShortcuts.value = globalShortcuts.value.filter((s) => s.id !== newShortcut.id)
      await saveGlobalShortcuts()
      error(`快捷键注册失败: ${result.error}`)
    }
  } catch (err: any) {
    globalShortcuts.value = globalShortcuts.value.filter((s) => s.id !== newShortcut.id)
    await saveGlobalShortcuts()
    console.error('注册快捷键失败:', err)
    error(`注册快捷键失败: ${err.message || '未知错误'}`)
  }
}

async function handleSaveAppShortcut(
  recordedShortcut: string,
  targetCommand: string
): Promise<void> {
  if (editingShortcut.value) {
    const exists = appShortcuts.value.some(
      (s) => s.id !== editingShortcut.value!.id && s.shortcut === recordedShortcut
    )
    if (exists) {
      warning('该快捷键已被其他指令占用，请使用其他快捷键')
      return
    }

    const oldShortcut = editingShortcut.value.shortcut

    try {
      if (oldShortcut !== recordedShortcut) {
        await window.tabdo.internal.unregisterAppShortcut(oldShortcut)
      }

      const result = await window.tabdo.internal.registerAppShortcut(
        recordedShortcut,
        targetCommand
      )

      if (result.success) {
        const index = appShortcuts.value.findIndex((s) => s.id === editingShortcut.value!.id)
        if (index >= 0) {
          appShortcuts.value[index].shortcut = recordedShortcut
          appShortcuts.value[index].target = targetCommand
        }

        await saveAppShortcuts()
        success('应用快捷键更新成功!')
        closeEditor()
      } else {
        if (oldShortcut !== recordedShortcut) {
          await window.tabdo.internal.registerAppShortcut(oldShortcut, editingShortcut.value.target)
        }
        error(`应用快捷键注册失败: ${result.error}`)
      }
    } catch (err: any) {
      if (oldShortcut !== recordedShortcut) {
        await window.tabdo.internal.registerAppShortcut(oldShortcut, editingShortcut.value.target)
      }
      console.error('更新应用快捷键失败:', err)
      error(`更新应用快捷键失败: ${err.message || '未知错误'}`)
    }
    return
  }

  const exists = appShortcuts.value.some((s) => s.shortcut === recordedShortcut)
  if (exists) {
    warning('该快捷键已存在，请使用其他快捷键')
    return
  }

  const newShortcut: GlobalShortcut = {
    id: Date.now().toString(),
    shortcut: recordedShortcut,
    target: targetCommand,
    enabled: true
  }

  appShortcuts.value.push(newShortcut)
  await saveAppShortcuts()

  try {
    const result = await window.tabdo.internal.registerAppShortcut(recordedShortcut, targetCommand)
    if (result.success) {
      success('应用快捷键添加成功!')
      closeEditor()
    } else {
      appShortcuts.value = appShortcuts.value.filter((s) => s.id !== newShortcut.id)
      await saveAppShortcuts()
      error(`应用快捷键注册失败: ${result.error}`)
    }
  } catch (err: any) {
    appShortcuts.value = appShortcuts.value.filter((s) => s.id !== newShortcut.id)
    await saveAppShortcuts()
    console.error('注册应用快捷键失败:', err)
    error(`注册应用快捷键失败: ${err.message || '未知错误'}`)
  }
}

async function handleDelete(id: string): Promise<void> {
  const isGlobal = activeTab.value === 'global'
  const shortcutList = isGlobal ? globalShortcuts.value : appShortcuts.value
  const shortcut = shortcutList.find((s) => s.id === id)
  if (!shortcut) return

  const confirmed = await confirm({
    title: '删除快捷键',
    message: `确定要删除快捷键"${shortcut.shortcut}"吗？`,
    type: 'danger',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  isDeleting.value = true
  try {
    if (isGlobal) {
      const result = await window.tabdo.internal.unregisterGlobalShortcut(shortcut.shortcut)
      if (result.success) {
        globalShortcuts.value = globalShortcuts.value.filter((s) => s.id !== id)
        await saveGlobalShortcuts()
      } else {
        error(`快捷键删除失败: ${result.error}`)
      }
    } else {
      const result = await window.tabdo.internal.unregisterAppShortcut(shortcut.shortcut)
      if (result.success) {
        appShortcuts.value = appShortcuts.value.filter((s) => s.id !== id)
        await saveAppShortcuts()
      } else {
        error(`应用快捷键删除失败: ${result.error}`)
      }
    }
  } catch (err: any) {
    console.error('删除快捷键失败:', err)
    error(`删除快捷键失败: ${err.message || '未知错误'}`)
  } finally {
    isDeleting.value = false
  }
}

// 处理自动复制开关切换
async function handleAutoCopyToggle(shortcut: any, event: Event): Promise<void> {
  console.log('[AutoCopy] 开关切换触发', { shortcut, event })

  const target = event.target as HTMLInputElement | null
  if (!target) {
    console.error('[AutoCopy] 无法获取 target 元素')
    return
  }

  const newAutoCopy = target.checked
  console.log('[AutoCopy] 新状态:', newAutoCopy, '旧状态:', shortcut.autoCopy)

  try {
    // 1. 更新本地数据
    const index = globalShortcuts.value.findIndex((s) => s.id === shortcut.id)
    console.log('[AutoCopy] 找到快捷键索引:', index)

    if (index >= 0) {
      globalShortcuts.value[index].autoCopy = newAutoCopy
      console.log('[AutoCopy] 本地数据已更新:', globalShortcuts.value[index])
    }

    // 2. 保存到数据库（清理数据，只保留可序列化的字段）
    console.log('[AutoCopy] 开始保存到数据库...')
    const dataToSave = globalShortcuts.value.map((s) => ({
      id: s.id,
      shortcut: s.shortcut,
      target: s.target,
      enabled: s.enabled,
      autoCopy: s.autoCopy,
      preScreenshotOptimization: s.preScreenshotOptimization
    }))
    await window.tabdo.internal.dbPut('global-shortcuts', dataToSave)
    console.log('[AutoCopy] 数据库保存成功')

    // 3. 通知主进程更新配置
    console.log('[AutoCopy] 通知主进程更新配置:', {
      shortcut: shortcut.shortcut,
      autoCopy: newAutoCopy,
      preScreenshotOptimization: shortcut.preScreenshotOptimization ?? false
    })
    const result = await window.tabdo.internal.updateGlobalShortcutConfig(shortcut.shortcut, {
      autoCopy: newAutoCopy,
      preScreenshotOptimization: shortcut.preScreenshotOptimization ?? false
    })
    console.log('[AutoCopy] 主进程配置更新结果:', result)

    if (!result.success) {
      throw new Error(result.error || '更新配置失败')
    }

    console.log('[AutoCopy] 自动复制开关切换完成')
  } catch (err: any) {
    console.error('[AutoCopy] 更新自动复制开关失败:', err)
    // 回滚
    target.checked = !newAutoCopy
    const index = globalShortcuts.value.findIndex((s) => s.id === shortcut.id)
    if (index >= 0) {
      globalShortcuts.value[index].autoCopy = !newAutoCopy
      console.log('[AutoCopy] 已回滚本地数据')
    }
  }
}

onMounted(() => {
  void loadShortcuts()

  // 监听本地启动项变化，实时更新可选目标列表
  if (window.tabdo.internal.onLocalShortcutsChanged) {
    window.tabdo.internal.onLocalShortcutsChanged(() => {
      void loadCommandTargets()
    })
  }

  // 监听系统应用变化，实时更新可选目标列表
  if (window.tabdo.internal.onAppsChanged) {
    window.tabdo.internal.onAppsChanged(() => {
      void loadCommandTargets()
    })
  }
})

useJumpFunction<ShortcutsSettingJumpFunction>((state) => {
  if (state.tab) {
    switchToTab(state.tab)
    return
  }

  if (state.payload && !state.type) {
    activeTab.value = 'global'
    prefillTarget.value = state.payload
    editingShortcut.value = null
    showEditor.value = true
  }
})
</script>
<template>
  <div class="h-full content-panel">
    <Transition name="list-slide">
      <div v-show="!showShortcutEditor" class="shortcuts-list-panel">
        <!-- tab 切换区 -->
        <div class="tabs-container">
          <div class="tab-group">
            <button
              :class="['tab-btn', { active: activeTab === 'builtin' }]"
              @click="switchToTab('builtin')"
            >
              内置快捷键
            </button>
            <button
              :class="['tab-btn', { active: activeTab === 'global' }]"
              @click="switchToTab('global')"
            >
              全局快捷键
            </button>
            <button
              :class="['tab-btn', { active: activeTab === 'app' }]"
              @click="switchToTab('app')"
            >
              应用快捷键
            </button>
          </div>
        </div>

        <!-- 列表独立滚动，不经过页签背后，透明材质也不会让正文叠透。 -->
        <div class="scrollable-content">
          <div v-if="activeTab !== 'builtin'" class="panel-header">
            <button class="btn" @click="showAddEditor">{{ addButtonLabel }}</button>
          </div>

          <div v-if="activeTab === 'builtin'" class="shortcut-list">
            <div class="builtin-settings">
              <BuiltinWakeupSetting />
              <BuiltinAlwaysOnTopSetting />
              <BuiltinFullscreenSetting />
            </div>
            <PresentationShortcuts />
          </div>

          <div v-else-if="activeTab === 'app'" class="shortcut-list">
            <div class="shortcut-section">
              <div class="category-label">自定义快捷键</div>
              <!-- 有自定义快捷键时显示列表 -->
              <div v-if="filteredShortcuts.length > 0">
                <div
                  v-for="shortcut in filteredShortcuts"
                  :key="shortcut.id"
                  class="card shortcut-item"
                >
                  <div class="shortcut-info">
                    <div class="shortcut-key-display">{{ shortcut.shortcut }}</div>
                    <div class="shortcut-desc">{{ shortcut.target }}</div>
                  </div>

                  <div class="shortcut-meta">
                    <button
                      class="icon-btn edit-btn"
                      title="编辑"
                      :disabled="isDeleting"
                      @click="handleEdit(shortcut)"
                    >
                      <div class="i-z-settings font-size-14px" />
                    </button>
                    <button
                      class="icon-btn delete-btn"
                      title="删除"
                      :disabled="isDeleting"
                      @click="handleDelete(shortcut.id)"
                    >
                      <div class="i-z-trash font-size-14px" />
                    </button>
                  </div>
                </div>
              </div>
              <div v-else-if="!loading" class="empty-state-inline">
                <div class="i-z-keyboard empty-icon" style="font-size: 48px" />
                <div class="empty-text-inline">暂无自定义快捷键</div>
                <div class="empty-hint-inline">点击上方“添加快捷键”按钮创建</div>
              </div>
            </div>
          </div>

          <div v-else class="shortcut-list">
            <div
              v-for="shortcut in filteredShortcuts"
              :key="shortcut.id"
              class="card shortcut-item"
            >
              <div class="shortcut-info">
                <div class="shortcut-key-display">{{ shortcut.shortcut }}</div>
                <div class="shortcut-desc">{{ shortcut.target }}</div>
              </div>

              <div class="shortcut-meta">
                <!-- 自动复制开关（仅全局快捷键） -->
                <div
                  v-if="activeTab === 'global'"
                  class="auto-copy-control"
                  :title="(shortcut.autoCopy ?? false) ? '已启用自动复制' : '已禁用自动复制'"
                >
                  <span class="auto-copy-label">自动复制</span>
                  <label class="toggle auto-copy-toggle">
                    <input
                      type="checkbox"
                      :checked="shortcut.autoCopy ?? false"
                      @change="handleAutoCopyToggle(shortcut, $event)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <button
                  class="icon-btn edit-btn"
                  title="编辑"
                  :disabled="isDeleting"
                  @click="handleEdit(shortcut)"
                >
                  <div class="i-z-settings font-size-14px" />
                </button>
                <button
                  class="icon-btn delete-btn"
                  title="删除"
                  :disabled="isDeleting"
                  @click="handleDelete(shortcut.id)"
                >
                  <div class="i-z-trash font-size-14px" />
                </button>
              </div>
            </div>

            <div v-if="!loading && currentShortcuts.length === 0" class="empty-state">
              <div class="i-z-keyboard empty-icon" style="font-size: 64px" />
              <div class="empty-text">暂无全局快捷键</div>
              <div class="empty-hint">点击“添加快捷键”来创建你的第一个全局快捷键</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide">
      <!-- 快捷键编辑面板 -->
      <ShortcutEditor
        v-if="showShortcutEditor"
        :editing-shortcut="editingShortcut"
        :prefill-target="prefillTarget"
        :target-options="shortcutTargetOptions"
        :is-app-shortcut="activeTab === 'app'"
        @back="closeEditor"
        @save="handleSave"
      />
    </Transition>
  </div>
</template>

<style lang="less" scoped>
.content-panel {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color);
}

/* 设置页呼出、窗口置顶与全屏暂停使用同一间距。 */
.builtin-settings {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

.shortcuts-list-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.scrollable-content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 20px 20px;
}

.tabs-container {
  flex-shrink: 0;
  padding: 20px 20px 16px;
}

.tab-group {
  display: flex;
  gap: 6px;
  background: var(--control-bg);
  padding: 3px;
  border-radius: 8px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
  padding: 6px 14px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.tab-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.tab-btn.active {
  background: var(--active-bg);
  color: var(--primary-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.list-slide-enter-active {
  transition:
    transform 0.2s ease-out,
    opacity 0.15s ease;
}

.list-slide-leave-active {
  transition:
    transform 0.2s ease-in,
    opacity 0.15s ease;
}

.list-slide-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.list-slide-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.list-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.list-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.panel-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.shortcut-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 4px;
  margin-bottom: 4px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.shortcut-item:hover {
  background: var(--hover-bg);
  transform: translateX(2px);
}

.shortcut-item.built-in {
  cursor: default;
  opacity: 0.85;
}

.shortcut-item.built-in:hover {
  transform: none;
}

.shortcut-info {
  flex: 1;
  min-width: 0;
}

.shortcut-key-display {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
  font-family: monospace;
}

.shortcut-desc {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.auto-copy-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
  flex-shrink: 0;
}

.auto-copy-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.auto-copy-toggle {
  margin-right: 8px;
  transform: scale(0.85);
  transform-origin: center;
}

.edit-btn {
  color: var(--primary-color);
}

.edit-btn:hover:not(:disabled) {
  background: var(--primary-light-bg);
}

.delete-btn {
  color: var(--danger-color);
}

.delete-btn:hover:not(:disabled) {
  background: var(--danger-light-bg);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.3;
  color: var(--text-secondary);
}

.empty-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-secondary);
}

.empty-state-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
}

.empty-text-inline {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.empty-hint-inline {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.7;
}
</style>
