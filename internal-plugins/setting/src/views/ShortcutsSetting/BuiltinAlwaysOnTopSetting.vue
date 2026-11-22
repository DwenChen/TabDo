<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { HotkeyInput, useToast } from '@/components'

const { error, success } = useToast()
const DEFAULT_SHORTCUT = 'Shift+T'
const shortcut = ref(DEFAULT_SHORTCUT)
const enabled = ref(false)
const platform = ref<'win32' | 'darwin' | 'linux'>('win32')
const busy = ref(false)

/**
 * 读取窗口置顶的启用状态与当前快捷键。
 * @returns 设置加载完成后的 Promise。
 */
async function load(): Promise<void> {
  platform.value = navigator.platform.toLowerCase().includes('mac')
    ? 'darwin'
    : navigator.platform.toLowerCase().includes('win')
      ? 'win32'
      : 'linux'
  const settings = (await window.tabdo.internal.dbGet('settings-general')) || {}
  enabled.value = settings.alwaysOnTopEnabled === true
  shortcut.value =
    typeof settings.alwaysOnTopShortcut === 'string' && settings.alwaysOnTopShortcut
      ? settings.alwaysOnTopShortcut
      : DEFAULT_SHORTCUT
}

/**
 * 保存窗口置顶快捷键；注册失败时恢复上一次可用组合。
 * @param value 用户录入的快捷键。
 * @returns 保存完成后的 Promise。
 */
async function save(value: string): Promise<void> {
  if (busy.value) return
  const next = value.trim() || DEFAULT_SHORTCUT
  busy.value = true
  try {
    const result = await window.tabdo.internal.updateAlwaysOnTopConfig({ shortcut: next })
    if (!result.success) throw new Error(result.error || '快捷键注册失败')
    shortcut.value = next
    success('窗口置顶快捷键已更新')
  } catch (reason: any) {
    error(reason?.message || '窗口置顶快捷键更新失败')
    await load()
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-if="platform === 'win32'" class="builtin-always-on-top">
    <div class="card shortcut-item">
      <div class="shortcut-copy">
        <strong>窗口置顶</strong>
        <p>
          把当前前台窗口固定在最前，并显示高亮边框；默认 {{ DEFAULT_SHORTCUT }}。
          {{
            enabled
              ? '当前已启用，点击右侧录制可修改组合键。'
              : '当前未启用，请先在“通用设置 → 基础 → 窗口置顶”开启。'
          }}
        </p>
      </div>
      <HotkeyInput
        :model-value="shortcut"
        :platform="platform"
        placeholder="默认 Shift+T"
        @change="save"
      />
    </div>
  </div>
</template>

<style scoped>
.builtin-always-on-top {
  display: grid;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px;
}

.shortcut-copy {
  flex: 1;
}

strong {
  font-size: 13px;
  font-weight: 500;
}

p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
