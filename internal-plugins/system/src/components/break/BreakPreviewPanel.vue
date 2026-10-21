<script setup>
import { computed } from 'vue'
const props = defineProps({
  scan: { type: Object, required: true },
  recursive: { type: Boolean, default: false }
})
const MAX_ITEMS = 40,
  MAX_TYPES = 8
const shownTypes = computed(() => (props.scan.fileTypes || []).slice(0, MAX_TYPES))
const moreTypes = computed(() => Math.max(0, (props.scan.fileTypes || []).length - MAX_TYPES))
const entries = computed(() => [
  ...(props.scan.files || []).map((item) => ({
    key: item.path,
    relative: item.relative,
    size: item.size,
    kind: '文件',
    isDir: false
  })),
  ...(props.scan.dirs || []).map((item) => ({
    key: item.path,
    relative: item.relative,
    size: null,
    kind: props.recursive ? '待删除' : '文件夹',
    isDir: true
  }))
])
const shown = computed(() => entries.value.slice(0, MAX_ITEMS))
const moreItems = computed(() => Math.max(0, entries.value.length - MAX_ITEMS))
// 结构变化说明区分单层（文件与子文件夹整体上移）与递归（文件摊平、目录删除）。
const structure = computed(() =>
  props.recursive
    ? `${props.scan.totalFiles} 个文件将移到父目录，${props.scan.totalDirs} 个目录将被删除`
    : `${props.scan.totalFiles} 个文件${
        props.scan.totalDirs ? `、${props.scan.totalDirs} 个文件夹` : ''
      }将整体移到父目录；随后删除空目录`
)
/**
 * 把字节数整理为紧凑的可读大小。
 * @param {number} size 字节数。
 * @returns {string} 格式化后的大小文本。
 */
function formatSize(size) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}
</script>
<template>
  <section class="preview-panel" aria-label="解散预览">
    <h3>
      预览 · {{ scan.totalFiles }} 个文件 · {{ scan.totalDirs }} 个文件夹 ·
      {{ formatSize(scan.totalSize) }}
    </h3>
    <div v-if="shownTypes.length" class="type-badges">
      <span v-for="type in shownTypes" :key="type.ext" class="type-chip">
        {{ type.ext ? '.' + type.ext : '无扩展名' }} ×{{ type.count }}
      </span>
      <span v-if="moreTypes" class="type-chip muted">还有 {{ moreTypes }} 个</span>
    </div>
    <p class="structure">{{ structure }}</p>
    <p v-if="!entries.length" class="muted">文件夹为空，没有可移动的内容。</p>
    <div v-else class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>相对路径</th>
            <th>类型</th>
            <th>大小</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in shown" :key="entry.key">
            <td :title="entry.relative">{{ entry.relative }}</td>
            <td>{{ entry.kind }}</td>
            <td>{{ entry.isDir ? '—' : formatSize(entry.size) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="moreItems" class="more">还有 {{ moreItems }} 项未列出</p>
    </div>
  </section>
</template>
<style scoped>
.preview-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preview-panel h3 {
  margin: 0;
  font-size: 14px;
}
.type-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.type-chip {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-surface);
  font-size: 12px;
}
.type-chip.muted {
  color: var(--text-secondary);
}
.structure {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.more {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
