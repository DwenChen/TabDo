<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWindowStore } from '../stores/windowStore'
import AdaptiveIcon from './common/AdaptiveIcon.vue'
import {
  convertToElectronKeyboardEvent,
  readModifiers,
  type NavDirectionKey
} from '../utils/convertKeyboardEvent'

const store = useWindowStore()
const host = window.tabdo
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; close: [] }>()
const input = ref<HTMLInputElement | null>(null)
const error = ref('')
const menuBusy = ref(false)
const height = computed(() => (store.compactMainWindowHeader ? 40 : 60))
const isBuiltinPlugin = computed(() =>
  ['system', 'setting'].includes(store.currentPlugin?.name || '')
)
let menuPluginPath: string | undefined
let removeMenuListener: (() => void) | undefined

defineExpose({ focus: () => input.value?.focus(), selectAll: () => input.value?.select() })

/** 将导航键和没有原生文本选择的复制快捷键转发给插件视图。
 * @param event 输入框键盘事件。
 * @returns 无返回值。
 */
function navigate(event: KeyboardEvent): void {
  // 搜索框没有选中文本时，复制应交给插件处理其多选条目。
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.key.toLowerCase() === 'c' &&
    input.value?.selectionStart === input.value?.selectionEnd
  ) {
    event.preventDefault()
    for (const type of ['keyDown', 'keyUp'] as const)
      void host.sendInputEvent({ type, keyCode: 'C', modifiers: readModifiers(event) })
    return
  }
  const keys: Record<string, NavDirectionKey> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    Enter: 'enter',
    Tab: 'tab'
  }
  const key = keys[event.key]
  if (!key || event.isComposing) return
  event.preventDefault()
  void host.sendInputEvent(convertToElectronKeyboardEvent(key, 'keyDown', readModifiers(event)))
  void host.sendInputEvent(convertToElectronKeyboardEvent(key, 'keyUp', readModifiers(event)))
}

/** 分离当前插件，保留原版标题栏双击操作。
 * @returns 分离操作完成后的 Promise。
 */
async function detach(): Promise<void> {
  if (!store.currentPlugin) return
  error.value = ''
  try {
    const result = await host.detachPlugin()
    if (!result.success) error.value = result.error || '分离插件失败'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

/** 读取当前插件配置并打开原版操作菜单。
 * @returns 原生菜单展示后的 Promise。
 */
async function showPluginMenu(): Promise<void> {
  const plugin = store.currentPlugin
  if (!plugin || isBuiltinPlugin.value || menuBusy.value) return
  menuBusy.value = true
  error.value = ''
  try {
    // 菜单始终绑定当前会话，后台资源策略由宿主统一管理。
    if (store.currentPlugin?.path !== plugin.path) return
    menuPluginPath = plugin.path
    const mac = host.getPlatform() === 'darwin'
    await host.showContextMenu([
      { id: 'detach-plugin', label: `分离到独立窗口 (${mac ? '⌘+D' : 'Ctrl+D'})` },
      ...(plugin.sourceType === 'closed_source'
        ? []
        : [{ id: 'open-devtools', label: '打开开发者工具' }]),
      { id: 'kill-plugin', label: `结束运行 (${mac ? '⌘+Q' : 'Ctrl+Q'})` }
    ])
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    menuBusy.value = false
  }
}

/** 执行当前菜单的插件操作，拒绝作用到已切换的插件。
 * @param command 原生菜单命令。
 * @returns 操作与配置持久化完成后的 Promise。
 */
async function handleMenuCommand(command: string): Promise<void> {
  const plugin = store.currentPlugin
  if (!plugin || isBuiltinPlugin.value || plugin.path !== menuPluginPath) return
  error.value = ''
  try {
    if (command === 'detach-plugin') {
      await detach()
    } else if (command === 'open-devtools') {
      const result = await host.openPluginDevTools()
      if (!result.success) error.value = result.error || '无法打开开发者工具'
    } else if (command === 'kill-plugin') {
      const result = await host.killPluginAndReturn(plugin.path)
      if (!result.success) error.value = result.error || '结束插件失败'
      else emit('close')
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(() => {
  removeMenuListener = host.onContextMenuCommand(handleMenuCommand)
})
onUnmounted(() => removeMenuListener?.())
</script>
<template>
  <header
    class="plugin-header"
    :aria-busy="store.pluginLoading"
    :style="{ height: height + 'px' }"
    @dblclick="detach"
  >
    <div v-if="store.currentPlugin" class="identity">
      <AdaptiveIcon
        v-if="store.currentPlugin.logo"
        :src="store.currentPlugin.logo"
        :force-adaptive="false"
      />
      <span class="plugin-name">{{ store.currentPlugin.title || store.currentPlugin.name }}</span>
      <span
        v-if="
          store.currentPlugin.cmdName &&
          store.currentPlugin.cmdName !== (store.currentPlugin.title || store.currentPlugin.name)
        "
        class="command-name"
        >{{ store.currentPlugin.cmdName }}</span
      >
      <button
        class="close-plugin"
        title="关闭插件"
        aria-label="关闭插件"
        @click.stop="emit('close')"
        @dblclick.stop
      >
        ×
      </button>
    </div>
    <span v-else class="host-title">TabDo</span>
    <input
      v-if="store.subInputVisible"
      ref="input"
      :value="modelValue"
      :placeholder="store.subInputPlaceholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown="navigate"
      @dblclick.stop
    />
    <span v-if="error" class="action-error" role="alert">{{ error }}</span>
    <nav v-if="!isBuiltinPlugin" @dblclick.stop>
      <button
        class="plugin-actions"
        :class="{ loading: store.pluginLoading, 'ai-active': store.aiRequestStatus !== 'idle' }"
        title="插件操作"
        aria-label="插件操作"
        aria-haspopup="menu"
        :disabled="!store.currentPlugin"
        @click.stop="showPluginMenu"
      >
        <span class="more-indicator" aria-hidden="true">⋮</span>
      </button>
    </nav>
  </header>
</template>
<style scoped>
header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  box-sizing: border-box;
  -webkit-app-region: drag;
  border-bottom: 1px solid var(--divider-color);
}
.identity {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 55%;
  min-width: 0;
  padding: 4px 5px 4px 8px;
  border-radius: 18px;
  background: var(--control-bg, rgba(127, 127, 127, 0.1));
  font-size: 13px;
}
.identity :deep(img) {
  width: 24px;
  height: 24px;
}
.plugin-name,
.command-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-name {
  opacity: 0.65;
}
.close-plugin {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 19px;
  line-height: 1;
}
input {
  flex: 1;
  min-width: 80px;
  border: 0;
  background: transparent;
  color: inherit;
  outline: none;
  font: inherit;
  -webkit-app-region: no-drag;
}
nav {
  margin-left: auto;
  display: flex;
  -webkit-app-region: no-drag;
}
button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
button:hover {
  background: rgba(127, 127, 127, 0.13);
}
button:disabled {
  cursor: default;
  opacity: 0.5;
}
.plugin-actions {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  padding: 5px;
}
.more-indicator {
  font-size: 22px;
}
.plugin-actions.loading::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 2px solid transparent;
  border-top-color: var(--primary-color, #059669);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  pointer-events: none;
}
.plugin-actions.ai-active {
  box-shadow: 0 0 0 2px var(--primary-color, #059669);
}
.action-error {
  color: var(--danger-color, #dc2626);
  font-size: 12px;
}
.host-title {
  font-size: 13px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .plugin-actions.loading::after {
    animation: none;
  }
}
</style>
