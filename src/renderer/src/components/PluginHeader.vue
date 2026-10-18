<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWindowStore } from '../stores/windowStore'
import AdaptiveIcon from './common/AdaptiveIcon.vue'
import {
  convertToElectronKeyboardEvent,
  readModifiers,
  type NavDirectionKey
} from '../utils/convertKeyboardEvent'
const store = useWindowStore()
const host = window.ztools
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; close: [] }>()
const input = ref<HTMLInputElement | null>(null)
const height = computed(() => (store.compactMainWindowHeader ? 40 : 60))
defineExpose({ focus: () => input.value?.focus(), selectAll: () => input.value?.select() })
/** 将插件子输入框的导航键转发给插件视图。
 * @param event 输入框键盘事件。
 * @returns 无返回值。
 */
function navigate(event: KeyboardEvent): void {
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
</script>
<template>
  <header :style="{ height: height + 'px' }">
    <div class="identity">
      <AdaptiveIcon v-if="store.currentPlugin?.logo" :src="store.currentPlugin.logo" /><span>{{
        store.currentPlugin?.title || store.currentPlugin?.name || 'ZTools 本地版'
      }}</span>
    </div>
    <input
      v-if="store.subInputVisible"
      ref="input"
      :value="modelValue"
      :placeholder="store.subInputPlaceholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown="navigate"
    />
    <nav>
      <button title="设置" @click="host.openSettings()">设置</button
      ><button title="分离插件" @click="host.detachPlugin()">↗</button
      ><button title="关闭插件" @click="emit('close')">×</button>
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
  font-size: 13px;
}
.identity :deep(img) {
  width: 24px;
  height: 24px;
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
  gap: 8px;
  -webkit-app-region: no-drag;
}
button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
</style>
