<script setup lang="ts">
import { onMounted, ref } from 'vue'
const fullscreen = ref(false)
/**
 * 读取全屏时暂停所有快捷键的策略。
 * @returns 设置加载后的 Promise。
 */
async function load(): Promise<void> {
  const settings = (await window.tabdo.internal.dbGet('settings-general')) || {}
  fullscreen.value = settings.ignoreHotkeysOnFullscreen === true
}
/**
 * 保存全屏时暂停策略，不改变其他通用设置。
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
  <div class="builtin-fullscreen">
    <div class="card shortcut-item">
      <div>
        <strong>全屏时暂停快捷键</strong>
        <p>全屏应用激活时暂停所有快捷键和超级面板触发。托盘“游戏模式”可手动暂停。</p>
      </div>
      <label class="toggle">
        <input
          v-model="fullscreen"
          type="checkbox"
          aria-label="全屏时暂停快捷键"
          @change="saveFullscreen"
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
</template>
<style scoped>
.builtin-fullscreen {
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
