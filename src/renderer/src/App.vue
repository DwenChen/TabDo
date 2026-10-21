<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import PluginHeader from './components/PluginHeader.vue'
import { useCommandDataStore } from './stores/commandDataStore'
import { useWindowStore } from './stores/windowStore'
const commandDataStore = useCommandDataStore()
const windowStore = useWindowStore()
const text = ref('')
const input = ref<{ focus: () => void; selectAll: () => void } | null>(null)
/** 将插件子输入框变化发送给插件。
 * @param value 子输入框值。
 * @returns 无返回值。
 */
function updateText(value: string): void {
  text.value = value
  window.tabdo.notifySubInputChange(value)
}
/** 关闭当前插件并隐藏宿主。
 * @returns 无返回值。
 */
function closePlugin(): void {
  // 用户关闭必须结束加载态，后续焦点通知不能把设置重新打开。
  windowStore.setPluginLoading(false)
  windowStore.updateCurrentPlugin(null)
  window.tabdo.hidePlugin()
  window.tabdo.hideWindow()
}
/** 保留插件宿主的快捷键。
 * @param event 键盘事件。
 * @returns 无返回值。
 */
function keydown(event: KeyboardEvent): void {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key === ',' &&
    windowStore.builtinShortcuts.settings
  ) {
    event.preventDefault()
    window.tabdo.openSettings()
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'd' &&
    windowStore.builtinShortcuts.detach
  ) {
    event.preventDefault()
    void window.tabdo.detachPlugin()
  }
  const modified = event.ctrlKey || event.metaKey
  if (modified && event.key.toLowerCase() === 'f' && windowStore.builtinShortcuts.search) {
    event.preventDefault()
    input.value?.focus()
    input.value?.selectAll()
  }
  if (
    modified &&
    event.key.toLowerCase() === 'w' &&
    windowStore.builtInClosePluginShortcutEnabled
  ) {
    event.preventDefault()
    closePlugin()
  }
  if (
    modified &&
    event.key.toLowerCase() === 'q' &&
    windowStore.builtInKillPluginShortcutEnabled &&
    windowStore.currentPlugin
  ) {
    event.preventDefault()
    void window.tabdo.killPluginAndReturn(windowStore.currentPlugin.path)
    window.tabdo.hideWindow()
  }
  if (event.key === 'Escape' && windowStore.builtInEscShortcutEnabled) {
    event.preventDefault()
    closePlugin()
  }
}
onMounted(async () => {
  window.electron.ipcRenderer.on('builtin-shortcuts-changed', (config) =>
    windowStore.updateBuiltinShortcuts(config)
  )
  // 先注册宿主生命周期，不能在异步配置和指令扫描期间丢失 opened / loaded。
  window.tabdo.onShowPluginPlaceholder(() => windowStore.setPluginLoading(true))
  window.tabdo.onShowSettings(() => {
    if (!windowStore.currentPlugin && !windowStore.pluginLoading) window.tabdo.openSettings()
  })
  window.tabdo.onFocusSearch(() => {
    // 保留插件子输入框聚焦语义，焦点恢复不承担启动设置的职责。
    if (windowStore.currentPlugin && windowStore.subInputVisible) input.value?.focus()
  })
  window.tabdo.onPluginOpened((plugin) => {
    text.value = ''
    windowStore.updateCurrentPlugin(plugin)
  })
  window.tabdo.onPluginLoaded((plugin) => {
    if (windowStore.currentPlugin?.path === plugin.path) windowStore.setPluginLoading(false)
  })
  window.tabdo.onAiStatusChanged((change) => windowStore.setAiRequestStatus(change))
  window.tabdo.onPluginClosed((state) => {
    const switching = state?.switching || windowStore.pluginLoading
    windowStore.updateCurrentPlugin(null)
    windowStore.setPluginLoading(switching)
    if (!switching) window.tabdo.hideWindow()
  })
  window.tabdo.onBackToSearch(() => {
    const switching = windowStore.pluginLoading
    windowStore.updateCurrentPlugin(null)
    windowStore.setPluginLoading(switching)
    if (!switching) window.tabdo.hideWindow()
  })
  window.tabdo.onUpdateSubInputPlaceholder?.((data) =>
    windowStore.updateSubInputPlaceholder(data.placeholder)
  )
  window.tabdo.onUpdateSubInputVisible?.((visible) => windowStore.updateSubInputVisible(visible))
  window.tabdo.onSetSubInputValue((value) => {
    text.value = value
  })
  window.tabdo.onFocusSubInput(() => nextTick(() => input.value?.focus()))
  window.tabdo.onSelectSubInput(() => nextTick(() => input.value?.selectAll()))
  window.tabdo.onPluginsChanged(() => commandDataStore.reloadPluginAvailabilityData())
  let superPanelSearchRevision = 0
  // 监听超级面板搜索请求（主进程转发，携带剪贴板内容）
  window.tabdo.onSuperPanelSearch(
    async (data: { requestId?: number; text: string; clipboardContent?: any }) => {
      const revision = ++superPanelSearchRevision
      // 面板每次打开都先取最新统计，避免先返回旧顺序再在后台刷新。
      await commandDataStore.refreshCommandUsageStats(true)
      if (revision !== superPanelSearchRevision) return
      console.log(
        '[超级面板搜索] 收到搜索请求:',
        data.text?.substring(0, 50),
        'clipboardType:',
        data.clipboardContent?.type
      )
      const searchText = data.text || ''
      const cc = data.clipboardContent

      const seen = new Set<string>()
      const results: any[] = []
      const addResults = (items: any[]): void => {
        for (const item of items) {
          const key = `${item.path}:${item.featureCode || ''}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push(item)
          }
        }
      }

      if (cc?.type === 'image') {
        // 图片：搜索支持 img 类型的指令
        addResults(commandDataStore.searchImageCommands())
      } else if (cc?.type === 'file' && cc.files) {
        // 文件：搜索支持 files 类型的指令
        addResults(commandDataStore.searchFileCommands(cc.files))
      } else if (cc?.type === 'text' && cc.text) {
        // 文本：搜索 text 和 regex/over 类型的指令
        const { bestMatches, regexMatches } = commandDataStore.search(cc.text)
        addResults(bestMatches)
        addResults(regexMatches)
      } else if (searchText) {
        // 普通文本搜索
        const { bestMatches, regexMatches } = commandDataStore.search(searchText)
        addResults(bestMatches)
        addResults(regexMatches)
      }

      console.log('[超级面板搜索] 返回结果数:', results.length)
      // 发送搜索结果回超级面板（携带剪贴板内容）
      window.tabdo.sendSuperPanelSearchResult({
        requestId: data.requestId,
        results: JSON.parse(JSON.stringify(commandDataStore.sortByUsage(results))),
        clipboardContent: cc
      })
    }
  )

  // 监听超级面板窗口匹配搜索请求
  window.tabdo.onSuperPanelSearchWindowCommands(
    async (data: {
      requestId: number
      windowInfo: {
        app?: string
        title?: string
        className?: string
        hwnd?: number
        bundleId?: string
        pid?: number
      }
    }) => {
      console.log('[超级面板窗口匹配] 收到搜索请求:', data.windowInfo)
      await commandDataStore.refreshCommandUsageStats(true)
      const results = commandDataStore.searchWindowCommands(data.windowInfo)
      console.log('[超级面板窗口匹配] 返回结果数:', results.length)
      window.tabdo.sendSuperPanelWindowCommandsResult({
        requestId: data.requestId,
        results: JSON.parse(JSON.stringify(results))
      })
    }
  )

  // 监听超级面板启动事件（由主进程从超级面板转发）
  window.tabdo.onSuperPanelLaunch(
    async (data: {
      command: any
      launchSource?: 'search' | 'global-shortcut' | 'super-panel'
      clipboardContent?: any
      windowInfo?: any
    }) => {
      console.log(
        '[超级面板启动] 收到启动事件:',
        data.command?.name,
        'clipboardType:',
        data.clipboardContent?.type
      )
      const cmd = data.command
      const cc = data.clipboardContent

      // 构造 payload（复用 SearchResults 中 handleSelectApp 的逻辑）
      let payload: any = ''
      let type = cmd.cmdType || 'text'

      if (cmd.cmdType === 'window' && data.windowInfo) {
        // 窗口匹配指令：payload 为窗口信息
        payload = data.windowInfo
      } else if (cc) {
        if (cc.type === 'text' && cc.text) {
          if (cmd.cmdType === 'over' || cmd.cmdType === 'regex') {
            payload = cc.text
          } else {
            payload = cc.text
          }
        } else if (cc.type === 'image' && cc.image) {
          payload = cc.image
          type = 'img'
        } else if (cc.type === 'file' && cc.files) {
          payload = cc.files.map((file: any) => ({
            isFile: !file.isDirectory,
            isDirectory: file.isDirectory,
            name: file.name,
            path: file.path
          }))
          type = 'files'
        }
      }

      try {
        await window.tabdo.launch({
          path: cmd.path,
          type: cmd.type || 'plugin',
          featureCode: cmd.featureCode,
          name: cmd.name,
          cmdType: cmd.cmdType || type,
          launchSource: data.launchSource || 'super-panel',
          param: {
            payload,
            type,
            inputState: {
              searchQuery: cc?.type === 'text' ? cc.text || '' : '',
              pastedImage: cc?.type === 'image' ? cc.image : null,
              pastedFiles:
                cc?.type === 'file'
                  ? cc.files.map((file: any) => ({
                      isFile: !file.isDirectory,
                      isDirectory: file.isDirectory,
                      name: file.name,
                      path: file.path
                    }))
                  : null,
              pastedText: cc?.type === 'text' ? cc.text : null
            }
          }
        })
        // 启动后立即同步使用统计，下一次匹配列表即可按最新频次与最近使用排序。
        void commandDataStore.refreshCommandUsageStats(true)
      } catch (error) {
        console.error('[超级面板启动] 启动失败:', error)
      }
    }
  )

  window.addEventListener('keydown', keydown)
  // 数据初始化不承担打开设置的职责，避免覆盖更早到达的插件或截图指令。
  await windowStore.loadSettings()
  await commandDataStore.initializeData()
})
onUnmounted(() => window.removeEventListener('keydown', keydown))
</script>
<template>
  <main class="plugin-host">
    <PluginHeader
      ref="input"
      :model-value="text"
      @update:model-value="updateText"
      @close="closePlugin"
    />
  </main>
</template>
<style scoped>
.plugin-host {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
