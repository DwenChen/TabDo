<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
const supported = ref(false),
  enabled = ref(false),
  busy = ref(false),
  error = ref('')
let disposed = false
let queued = false
let remove: (() => void) | undefined
/**
 * 从宿主读取或切换当前会话，失败保留原状态并提供可见反馈。
 * @param toggle 是否来自用户点击。
 * @returns 状态同步结束后的Promise。
 */
async function refresh(toggle = false): Promise<void> {
  if (disposed) return
  if (busy.value) {
    queued = true
    return
  }
  busy.value = true
  try {
    const state = await window.tabdo.temporaryResidency(toggle)
    if (disposed) return
    supported.value = state.supported
    enabled.value = state.enabled
    error.value = ''
  } catch (cause) {
    if (!disposed) error.value = (cause as Error).message
  } finally {
    if (!disposed) {
      busy.value = false
      if (queued) {
        queued = false
        void refresh()
      }
    }
  }
}
onMounted(() => {
  remove = window.tabdo.onTemporaryResidencyChanged(() => {
    void refresh()
  })
  void refresh()
})
onUnmounted(() => {
  disposed = true
  remove?.()
})
</script>
<template>
  <button
    v-if="supported"
    class="temporary-residency"
    :aria-pressed="enabled"
    :disabled="busy"
    aria-label="临时常驻"
    :title="enabled ? '取消临时常驻并关闭当前会话' : '临时常驻：隐藏后保留，取消或关闭后释放'"
    @click.stop="refresh(true)"
    @dblclick.stop
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 9h18M10 13h4m-2-2v6" />
    </svg>
  </button>
  <span v-if="error" role="alert" class="residency-error">{{ error }}</span>
</template>
<style scoped>
.temporary-residency {
  flex: none;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.temporary-residency svg {
  width: 18px;
  height: 18px;
}
.temporary-residency:hover {
  background: #8882;
}
.temporary-residency[aria-pressed='true'] {
  color: var(--primary-color, #059669);
  background: #05966918;
}
.residency-error {
  font-size: 12px;
  color: #dc2626;
}
</style>
