<script setup lang="ts">
import { onMounted, ref } from 'vue'
const current = ref(''),
  selected = ref(''),
  message = ref(''),
  busy = ref(false)
/**
 * 读取当前资料位置及上一次离线迁移结果。
 * @returns 位置加载完成后的 Promise。
 */
async function load(): Promise<void> {
  try {
    const value = await window.tabdo.internal.dataLocationGet()
    current.value = value.root
    if (value.result)
      message.value = value.result.success
        ? `迁移完成，原目录保留在 ${value.result.previousRoot}`
        : `迁移未完成：${value.result.error}`
  } catch (error: any) {
    message.value = error.message
  }
}
/**
 * 由用户选择新目录，选择本身不修改资料。
 * @returns 目录选择结束后的 Promise。
 */
async function choose(): Promise<void> {
  try {
    selected.value = (await window.tabdo.internal.dataLocationChoose()) || ''
    message.value = ''
  } catch (error: any) {
    message.value = error.message
  }
}
/**
 * 请求退出后迁移，确认、取消或失败均有明确反馈。
 * @returns 任务准备或取消完成后的 Promise。
 */
async function move(): Promise<void> {
  busy.value = true
  try {
    const result = await window.tabdo.internal.dataLocationMove(selected.value)
    if (result.cancelled) return
    message.value = '应用即将退出，迁移校验完成后会自动重启。'
  } catch (error: any) {
    message.value = error.message
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>
<template>
  <section class="data-location-setting">
    <h3>数据与缓存目录</h3>
    <p>包含配置、已安装插件、历史和缓存。更改后退出应用迁移，完整校验后重启，原目录保留作备份。</p>
    <div class="location-row">
      <output aria-label="当前数据与缓存目录">{{ current }}</output
      ><button class="btn" :disabled="busy" @click="choose">更改目录</button>
    </div>
    <div v-if="selected && selected !== current" class="location-row">
      <output aria-label="新的数据与缓存目录">{{ selected }}</output
      ><button class="btn" :disabled="busy" @click="move">迁移并重启</button>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<style scoped>
.data-location-setting {
  margin-bottom: 28px;
}
h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
  margin: 0 0 4px;
}
p {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.location-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
output {
  flex: 1;
  overflow-wrap: anywhere;
  font-size: 13px;
}
button {
  flex-shrink: 0;
}
</style>
