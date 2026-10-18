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
  window.ztools.notifySubInputChange(value)
}
/** 关闭当前插件并隐藏宿主。
 * @returns 无返回值。
 */
function closePlugin(): void {
  // 用户关闭必须结束加载态，后续焦点通知不能把设置重新打开。
  windowStore.setPluginLoading(false)
  windowStore.updateCurrentPlugin(null)
  window.ztools.hidePlugin()
  window.ztools.hideWindow()
}
/** 保留插件宿主的快捷键。
 * @param event 键盘事件。
 * @returns 无返回值。
 */
function keydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === ',') {
    event.preventDefault()
    window.ztools.openSettings()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    void window.ztools.detachPlugin()
  }
  const modified = event.ctrlKey || event.metaKey
  if (modified && event.key.toLowerCase() === 'f') {
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
    void window.ztools.killPluginAndReturn(windowStore.currentPlugin.path)
    window.ztools.hideWindow()
  }
  if (event.key === 'Escape' && windowStore.builtInEscShortcutEnabled) {
    event.preventDefault()
    closePlugin()
  }
}
onMounted(async () => {
  await windowStore.loadSettings()
  await commandDataStore.initializeData()
  window.ztools.onShowPluginPlaceholder(() => windowStore.setPluginLoading(true))
  window.ztools.onShowSettings(() => {
    if (!windowStore.currentPlugin && !windowStore.pluginLoading) window.ztools.openSettings()
  })
  window.ztools.onFocusSearch(() => {
    // 保留插件子输入框聚焦语义，焦点恢复不承担启动设置的职责。
    if (windowStore.currentPlugin && windowStore.subInputVisible) input.value?.focus()
  })
  window.ztools.onPluginOpened((plugin) => {
    text.value = ''
    windowStore.updateCurrentPlugin(plugin)
  })
  window.ztools.onPluginLoaded(() => windowStore.setPluginLoading(false))
  window.ztools.onAiStatusChanged((change) => windowStore.setAiRequestStatus(change))
  window.ztools.onPluginClosed(() => {
    const switching = windowStore.pluginLoading
    windowStore.updateCurrentPlugin(null)
    windowStore.setPluginLoading(switching)
    if (!switching) window.ztools.hideWindow()
  })
  window.ztools.onBackToSearch(() => {
    const switching = windowStore.pluginLoading
    windowStore.updateCurrentPlugin(null)
    windowStore.setPluginLoading(switching)
    if (!switching) window.ztools.hideWindow()
  })
  window.ztools.onUpdateSubInputPlaceholder?.((data) =>
    windowStore.updateSubInputPlaceholder(data.placeholder)
  )
  window.ztools.onUpdateSubInputVisible?.((visible) => windowStore.updateSubInputVisible(visible))
  window.ztools.onSetSubInputValue((value) => {
    text.value = value
  })
  window.ztools.onFocusSubInput(() => nextTick(() => input.value?.focus()))
  window.ztools.onSelectSubInput(() => nextTick(() => input.value?.selectAll()))
  window.ztools.onPluginsChanged(() => commandDataStore.reloadPluginAvailabilityData())
  // 监听超级面板搜索请求（主进程转发，携带剪贴板内容）
  window.ztools.onSuperPanelSearch((data: { text: string; clipboardContent?: any }) => {
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
    window.ztools.sendSuperPanelSearchResult({
      results: JSON.parse(JSON.stringify(results)),
      clipboardContent: cc
    })
  })

  // 监听超级面板窗口匹配搜索请求
  window.ztools.onSuperPanelSearchWindowCommands(
    (data: {
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
      const results = commandDataStore.searchWindowCommands(data.windowInfo)
      console.log('[超级面板窗口匹配] 返回结果数:', results.length)
      window.ztools.sendSuperPanelWindowCommandsResult({
        requestId: data.requestId,
        results: JSON.parse(JSON.stringify(results))
      })
    }
  )

  // 监听超级面板启动事件（由主进程从超级面板转发）
  window.ztools.onSuperPanelLaunch(
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
        await window.ztools.launch({
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
      } catch (error) {
        console.error('[超级面板启动] 启动失败:', error)
      }
    }
  )

  window.addEventListener('keydown', keydown)
  // 初次显示时直接进入设置，独立主搜索入口已移除。
  if (!windowStore.currentPlugin && !windowStore.pluginLoading) window.ztools.openSettings()
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
