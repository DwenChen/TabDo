<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { UsageGuideStatus } from '@shared/usageGuide'
const state = ref<UsageGuideStatus | null>(null),
  busy = ref(false),
  error = ref('')
let timer: ReturnType<typeof setInterval> | undefined

/**
 * 读取宿主的环境状态与实际完成摘要。
 * @returns 状态刷新后的 Promise。
 */
async function refresh(): Promise<void> {
  try {
    state.value = await window.tabdo.internal.usageGuide('status')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

/**
 * 串行执行环境管理；练习本身由独立全屏覆盖窗口承载。
 * @param action 用户选择的环境动作。
 * @returns 动作与状态刷新完成后的 Promise。
 */
async function act(action: 'start' | 'remove' | 'retain'): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await window.tabdo.internal.usageGuide(action)
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void refresh()
  window.addEventListener('focus', refresh)
  timer = setInterval(() => {
    if (state.value?.running) void refresh()
  }, 1000)
})
onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('focus', refresh)
})
</script>
<template>
  <div class="usage-guide">
    <h3>使用引导</h3>
    <p class="note">
      每次创建桌面专属练习目录，工具默认位置仅在本次临时调整。退出后清理桌面练习副本和运行资料，不改正式配置或已安装插件。
    </p>
    <p v-if="error || state?.error" class="error" role="alert">{{ error || state?.error }}</p>
    <template v-if="state && !state.sandbox">
      <div
        v-if="state.awaitingChoice && !state.running && !state.error"
        class="result"
        role="status"
      >
        <strong>本次体验已退出，过程文件已清理</strong>
        <p v-if="state.report">
          实际完成 {{ state.report.completed.length }} 步，主动跳过
          {{ state.report.skipped.length }} 步。
        </p>
        <p>保留素材，下次可以重新创建全新的练习空间。</p>
        <div class="actions">
          <button :disabled="busy" @click="act('retain')">保留引导环境</button
          ><button :disabled="busy" @click="act('remove')">删除引导环境</button>
        </div>
      </div>
      <div class="actions">
        <button class="primary" :disabled="busy || state.running" @click="act('start')">
          {{ state.running ? '体验正在独立窗口运行' : '开始全屏引导' }}</button
        ><button
          v-if="state.retained && !state.awaitingChoice"
          :disabled="busy || state.running"
          @click="act('remove')"
        >
          删除引导环境
        </button>
      </div>
    </template>
    <p v-else-if="state?.sandbox" class="note">
      当前是练习实例，请跟随全屏提示卡操作。此处不启动第二个引导。
    </p>
  </div>
</template>
<style scoped>
p {
  line-height: 1.8;
}
.note {
  color: var(--text-secondary);
  font-size: 12px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.result {
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  padding: 14px;
  margin-top: 14px;
}
button {
  font: inherit;
  padding: 9px 14px;
  border: 1px solid var(--divider-color);
  border-radius: 8px;
  background: var(--card-bg);
  color: var(--text-color);
  cursor: pointer;
}
button.primary {
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.5;
  background: var(--primary-color);
  color: white;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.error {
  color: #dc2626;
}
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
</style>
