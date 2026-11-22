<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { HotkeyInput, useToast } from '@/components'
const { error } = useToast()
const hotkey = ref(''),
  busy = ref(false)
const platform = ref<'win32' | 'darwin' | 'linux'>('win32')
let registered = ''
/**
 * 加载用户已配置的设置页快捷键，未配置时保持关闭。
 * @returns 设置加载后的 Promise。
 */
async function load(): Promise<void> {
  platform.value = navigator.platform.toLowerCase().includes('mac')
    ? 'darwin'
    : navigator.platform.toLowerCase().includes('win')
      ? 'win32'
      : 'linux'
  hotkey.value = registered = (await window.tabdo.internal.getCurrentShortcut()) || ''
}
/**
 * 注册或关闭设置页呼出快捷键，保存失败时恢复之前的注册。
 * @param value 用户录入的快捷键，空值为关闭。
 * @returns 修改结束后的 Promise。
 */
async function saveHotkey(value: string): Promise<void> {
  busy.value = true
  try {
    const result = await window.tabdo.internal.updateShortcut(value)
    if (!result.success) throw new Error(result.error || '快捷键已被占用')
    const settings = (await window.tabdo.internal.dbGet('settings-general')) || {}
    await window.tabdo.internal.dbPut('settings-general', { ...settings, hotkey: value })
    registered = hotkey.value = value
  } catch (reason: any) {
    await window.tabdo.internal.updateShortcut(registered)
    hotkey.value = registered
    error(reason.message)
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>
<template>
  <div class="builtin-wakeup">
    <div class="card shortcut-item">
      <div>
        <strong>设置页呼出快捷键</strong>
        <p>在其他应用中打开 TabDo 设置页。初始不设置快捷键；点击录制后启用。</p>
      </div>
      <HotkeyInput
        v-model="hotkey"
        :platform="platform"
        placeholder="默认关闭，点击录制"
        @change="saveHotkey"
      />
      <button v-if="hotkey" class="btn" :disabled="busy" @click="saveHotkey('')">关闭</button>
    </div>
  </div>
</template>
<style scoped>
.builtin-wakeup {
  display: grid;
  gap: 8px;
}
.shortcut-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px;
}
.shortcut-item > div:first-child {
  flex: 1;
}
strong {
  font-size: 13px;
  font-weight: 500;
}
p {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 6px 0 0;
  line-height: 1.6;
}
</style>
