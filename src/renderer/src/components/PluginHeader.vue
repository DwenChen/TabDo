<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWindowStore } from '../stores/windowStore'
import AdaptiveIcon from './common/AdaptiveIcon.vue'
import TemporaryResidencyButton from './common/TemporaryResidencyButton.vue'
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
const height = computed(() => (store.compactMainWindowHeader ? 40 : 60))

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
</script>
<template>
  <header
    class="plugin-header"
    :class="{
      'clipboard-header':
        store.currentPlugin?.name === 'system' && store.currentPlugin.featureCode === 'clipboard'
    }"
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
    <!-- 右上角只保留宿主统一的临时常驻开关，与内置子组件保持一致。 -->
    <nav @dblclick.stop>
      <TemporaryResidencyButton
        :key="store.currentPlugin?.path + ':' + store.currentPlugin?.cmdName"
      />
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
.clipboard-header input {
  max-width: 300px;
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
.action-error {
  color: var(--danger-color, #dc2626);
  font-size: 12px;
}
.host-title {
  font-size: 13px;
}
</style>
