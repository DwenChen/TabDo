<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { HotkeyInput, useToast } from '@/components'
const { error } = useToast()
const hotkey = ref(''),
  fullscreen = ref(false),
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
  const settings = (await window.tabdo.internal.dbGet('settings-general')) || {}
  hotkey.value = registered = (await window.tabdo.internal.getCurrentShortcut()) || ''
  fullscreen.value = settings.ignoreHotkeysOnFullscreen === true
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
/**
 * 保存全屏时暂停热键的策略，不改变其他通用设置。
 * @returns 保存与运行时切换完成后的 Promise。
 */
async function saveFullscreen(): Promise<void> {
  const settings = (await window.tabdo.internal.dbGet('settings-general')) || {}
  await window.tabdo.internal.dbPut('settings-general', {
    ...settings,
    ignoreHotkeysOnFullscreen: fullscreen.value
  })
  await window.tabdo.internal.setIgnoreHotkeysOnFullscreen(fullscreen.value)
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
    <div class="card shortcut-item">
      <div>
        <strong>全屏时暂停快捷键</strong>
        <p>全屏应用激活时暂停全局快捷键和超级面板触发。托盘“游戏模式”可手动暂停。</p>
      </div>
      <label class="toggle"
        ><input
          v-model="fullscreen"
          type="checkbox"
          aria-label="全屏时暂停快捷键"
          @change="saveFullscreen" /><span class="toggle-slider"></span
      ></label>
    </div>
  </div>
</template>
<style scoped>
.builtin-wakeup {
  margin: 12px 0;
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
