<script setup>
/* eslint vue/no-v-html: "off" -- highlight.js escapes clipboard text before adding syntax spans. */
import { computed } from 'vue'
const props = defineProps({
  item: { type: Object, required: true },
  isExpanded: { type: Boolean, default: false },
  needsExpand: { type: Boolean, default: false },
  isFavoriteTab: { type: Boolean, default: false }
})

// 只高亮当前已渲染的代码条目，长内容限制到 20KB，避免自动检测阻塞列表切换。
const highlighted = computed(() => {
  if (props.item.category !== 'code' || !window.hljs) return ''
  const code = props.item.content.slice(0, 20000)
  // 明确语法优先指定语言，避免短 JavaScript 被自动检测为其他语言。
  const language = /^(?:const|let|var|function|import|export)\s/m.test(code)
    ? 'javascript'
    : /^\s*(?:def |from \w+ import|import \w+$)/m.test(code)
      ? 'python'
      : /^\s*[{[]/.test(code)
        ? 'json'
        : undefined
  return language
    ? window.hljs.highlight(code, { language }).value
    : window.hljs.highlightAuto(code).value
})
/**
 * 使用默认浏览器打开已分类且协议有效的链接。
 * @returns {void} 无返回值。
 */
function openLink() {
  const value = props.item.content.trim()
  const url = /^www\./i.test(value) ? 'https://' + value : value
  // 再次校验协议，收藏记录也不能通过伪造分类执行任意协议。
  if (/^https?:\/\//i.test(url)) window.tabdo.shellOpenExternal(url)
}

const emit = defineEmits(['toggle-expand', 'delete-favorite', 'float-text'])
</script>

<template>
  <div class="item-content">
    <a
      v-if="item.category === 'link'"
      class="content-link"
      :href="item.content.trim()"
      @click.stop.prevent="openLink"
      @dblclick.stop
      >{{ item.content }}</a
    >
    <pre
      v-else-if="highlighted"
      class="content-code"
      :class="{ 'text-collapsed': !isExpanded }"
      :data-text-id="item.id"
    ><code v-html="highlighted"></code><span v-if="item.content.length > 20000">{{ item.content.slice(20000) }}</span></pre>
    <div
      v-else
      class="content-text"
      :data-text-id="item.id"
      :class="{
        'text-collapsed': !isExpanded,
        'text-expanded': isExpanded
      }"
    >
      {{ item.content }}
    </div>
    <div class="item-meta">
      <span class="meta-time">{{ item.time }}</span>
      <span v-if="item.remark" class="meta-remark" :title="item.remark">{{ item.remark }}</span>
      <span v-if="item.appName" class="meta-app">{{ item.appName }}</span>
      <button v-if="needsExpand" class="expand-btn" @click.stop="emit('toggle-expand')">
        <span class="expand-icon">{{ isExpanded ? '▲' : '▼' }}</span>
        <span>{{ isExpanded ? '收起' : '展开' }}</span>
      </button>
      <button
        v-if="isFavoriteTab"
        class="delete-btn"
        title="删除收藏"
        @click.stop="emit('delete-favorite')"
      >
        ✕
      </button>
      <span class="meta-count">{{ item.charCount }} 字符</span>
      <button
        class="float-btn"
        title="悬浮中转"
        aria-label="悬浮中转"
        @click.stop="emit('float-text')"
        @dblclick.stop
      >
        悬浮中转
      </button>
    </div>
  </div>
</template>

<style scoped>
.float-btn {
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--primary-color);
  border-radius: 4px;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.float-btn:hover {
  background: var(--bg-accent-light);
}
.content-code :deep(.hljs-keyword),
.content-code :deep(.hljs-selector-tag) {
  color: #c678dd;
}
.content-code :deep(.hljs-string),
.content-code :deep(.hljs-attr) {
  color: #34956b;
}
.content-code :deep(.hljs-number),
.content-code :deep(.hljs-literal) {
  color: #d28b38;
}
.content-code :deep(.hljs-title),
.content-code :deep(.hljs-built_in) {
  color: #318ace;
}
.content-code :deep(.hljs-comment) {
  color: #88929f;
  font-style: italic;
}
.content-link {
  display: block;
  color: var(--primary-color);
  overflow-wrap: anywhere;
  padding: 8px 0;
}
.content-code {
  margin: 0;
  padding: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--bg-app);
  border-radius: 5px;
  font:
    13px/1.5 Consolas,
    monospace;
}
.item-content {
  padding: 5px 10px;
}

.content-text {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.4;
  word-break: break-all;
  white-space: pre-wrap;
}

.text-collapsed {
  max-height: 120px;
  overflow: hidden;
  position: relative;
}

.text-expanded {
  max-height: none;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
  position: relative;
}

.meta-time {
  flex: 1;
}

.meta-app {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--bg-accent-light);
  color: var(--primary-color);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.meta-remark {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 240px;
  padding: 2px 8px;
  background: var(--bg-warning-light);
  color: var(--text-warning);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.expand-btn:hover {
  background: var(--bg-accent-light);
}

.expand-icon {
  font-size: 10px;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
  font-size: 16px;
  margin-left: auto;
}

.delete-btn:hover {
  color: var(--text-danger);
  background: var(--bg-danger-light);
}

.meta-count {
  color: var(--text-secondary);
}
</style>
