<!-- 界面复用 batch-rename，来源与 MIT 许可见 public/LICENSE.batch-rename。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PreviewItem } from './types'

const props = defineProps<{
  items: PreviewItem[]
  loading: boolean
  busy: boolean
  manual: boolean
  emptyMessage: string
}>()
const emit = defineEmits<{
  remove: [id: string]
  edit: [id: string, name: string]
  paste: [text: string]
  showError: [message: string]
}>()
const scrollTop = ref(0)
const scrollElement = ref<HTMLElement>()
// 新筛选结果从首行显示，避免沿用旧列表的虚拟偏移。
watch(
  () => props.items.map((item) => item.id).join('\0'),
  () => {
    scrollTop.value = 0
    if (scrollElement.value) scrollElement.value.scrollTop = 0
  }
)
const rowHeight = 44
const startIndex = computed(() =>
  Math.max(0, Math.min(props.items.length - 1, Math.floor(scrollTop.value / rowHeight) - 8))
)
const visibleItems = computed(() => props.items.slice(startIndex.value, startIndex.value + 32))
const topSpace = computed(() => startIndex.value * rowHeight)
const bottomSpace = computed(
  () => Math.max(0, props.items.length - startIndex.value - visibleItems.value.length) * rowHeight
)

/**
 * 将预览状态转换为可访问的状态文字。
 * @param item 文件预览条目。
 * @returns 转换后的显示值。
 */
function stateLabel(item: PreviewItem): string {
  if (item.status === 'error') return '错误'
  if (item.status === 'success') return '已完成'
  return item.status === 'ready' ? '待改名' : '无变化'
}

/**
 * 将多行名称粘贴交给父组件校验和应用。
 * @param event 剪贴板事件。
 * @returns 无返回值。
 */
function handlePaste(event: ClipboardEvent) {
  const value = event.clipboardData?.getData('text')
  if (value === undefined || !/[\r\n]/.test(value)) return
  event.preventDefault()
  emit('paste', value)
}

/**
 * 识别文件图标类别。
 * @param name 文件名称。
 * @returns 转换后的显示值。
 */
function fileKind(name: string): string {
  return /\.(mp4|mov|avi|mkv|webm)$/i.test(name) ? 'video' : 'document'
}
</script>

<template>
  <section class="file-list rename-preview" aria-label="文件预览">
    <header class="column-head"><span>原文件名</span><span>重命名预览</span></header>
    <p v-if="loading" class="file-list-state-text" role="status">正在读取文件信息…</p>
    <p v-else-if="!items.length" class="file-list-state-text">
      <span class="empty-icon" aria-hidden="true">▤</span>
      {{ emptyMessage }}
    </p>
    <div
      v-else
      ref="scrollElement"
      class="file-rows"
      @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
    >
      <div :style="{ height: `${topSpace}px` }" aria-hidden="true"></div>
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="file-row"
        :class="{ 'is-error': item.status === 'error' }"
      >
        <div class="file-col-left" :title="item.sourcePath">
          <span class="file-icon" :class="`is-${fileKind(item.currentName)}`" aria-hidden="true">{{
            fileKind(item.currentName) === 'video' ? '▶' : '▤'
          }}</span>
          <span class="file-name">{{ item.currentName }}</span>
        </div>
        <div class="file-col-right">
          <span
            class="status-icon"
            :class="`is-${item.status}`"
            :title="stateLabel(item)"
            :aria-label="stateLabel(item)"
          >
            {{
              item.status === 'error'
                ? '×'
                : item.status === 'ready'
                  ? '●'
                  : item.status === 'success'
                    ? '✓'
                    : '—'
            }}
          </span>
          <input
            v-if="manual && item.status !== 'success'"
            class="manual-input rename-name-input"
            type="text"
            :value="item.targetName"
            :disabled="busy"
            :aria-label="`${item.currentName} 的新文件名`"
            @input="emit('edit', item.id, ($event.target as HTMLInputElement).value)"
            @paste="handlePaste"
          />
          <span
            v-else
            class="target-name"
            :class="{ 'is-modified': item.status === 'ready', 'is-error': item.status === 'error' }"
            :title="item.targetName"
            >{{ item.targetName }}</span
          >
          <button
            v-if="item.status === 'error'"
            class="error-tag"
            type="button"
            :title="item.errorMessage || item.error"
            @click="emit('showError', item.errorMessage || item.error || '未知错误')"
          >
            {{ item.errorMessage || item.error }}
          </button>
          <button
            class="remove-row"
            type="button"
            :disabled="busy"
            :aria-label="`移除 ${item.currentName}`"
            title="移除文件"
            @click="emit('remove', item.id)"
          >
            ×
          </button>
        </div>
      </article>
      <div :style="{ height: `${bottomSpace}px` }" aria-hidden="true"></div>
    </div>
  </section>
</template>

<style scoped>
.file-list {
  display: flex;
  flex-direction: column;
  min-height: 130px;
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}
.file-list-state-text {
  flex: 1;
  min-height: 100px;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
}
.empty-icon {
  font-size: 36px;
  line-height: 1;
  color: var(--text-muted);
}
.file-rows {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.file-row {
  height: 44px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-divider);
}
.file-row:hover {
  background: var(--surface-hover);
}
.file-row.is-error {
  background: var(--error-subtle);
}
.file-col-left {
  width: 48%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.file-col-right {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.file-icon {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 22px;
}
.file-icon.is-video {
  color: #6366f1;
  font-size: 19px;
}
.file-name,
.target-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
}
.file-name {
  color: var(--text);
}
.target-name {
  flex: 1;
  color: var(--muted);
}
.target-name.is-modified {
  color: var(--text);
}
.target-name.is-error {
  color: var(--error-text);
}
.status-icon {
  flex: none;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: white;
  background: var(--success);
  font-size: 11px;
  font-weight: 700;
}
.status-icon.is-ready {
  color: var(--warning);
  background: transparent;
  font-size: 12px;
}
.status-icon.is-error {
  background: var(--error);
  font-size: 14px;
}
.status-icon.is-unchanged {
  color: var(--text-muted);
  background: transparent;
}
.error-tag {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 6px;
  border: 1px solid var(--error-border);
  border-radius: 4px;
  color: var(--error-text);
  background: var(--error-subtle);
  font-size: 11px;
}
.manual-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-input);
  border-radius: 4px;
  color: var(--text);
  background: var(--surface-card);
  font: inherit;
}
.manual-input:focus {
  outline: 2px solid var(--focus-ring);
  border-color: var(--primary);
}
.remove-row {
  flex: none;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  color: var(--text-muted);
  background: transparent;
  font-size: 22px;
  line-height: 1;
}
.remove-row:hover {
  color: var(--error);
  background: var(--error-subtle);
}
@media (max-width: 670px) {
  .file-row {
    padding: 0 10px;
  }
  .file-col-left {
    width: 45%;
  }
  .error-tag {
    max-width: 80px;
  }
}
.column-head {
  display: grid;
  grid-template-columns: 48% 1fr;
  flex: none;
  padding: 7px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-subdued);
  color: var(--muted);
  font-size: 11px;
}
</style>
