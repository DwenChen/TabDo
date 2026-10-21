<script setup>
defineProps({ records: { type: Array, default: () => [] } })
defineEmits(['undo', 'clear'])
/**
 * 把时间戳整理为相对时间，便于快速判断记录新旧。
 * @param {number} time 记录时间戳。
 * @returns {string} 相对时间文本。
 */
function relativeTime(time) {
  const diff = Date.now() - Number(time)
  if (!Number.isFinite(diff) || diff < 0) return '刚刚'
  const minute = 60000,
    hour = 3600000,
    day = 86400000
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  return `${Math.floor(diff / day)} 天前`
}
</script>
<template>
  <section class="history" aria-label="解散历史">
    <div class="history-head">
      <h3>历史记录</h3>
      <button :disabled="!records.length" @click="$emit('clear')">清空历史</button>
    </div>
    <p v-if="!records.length" class="muted">暂无历史记录。</p>
    <ul v-else class="history-list">
      <li v-for="record in records" :key="record.id" class="history-item">
        <div class="history-info">
          <span class="history-name" :title="record.dir">{{ record.dirName }}</span>
          <span class="history-meta">
            {{ relativeTime(record.time) }} · 移动 {{ record.moved.length }} 项 · 删除
            {{ record.deletedDirs.length }} 个目录
          </span>
        </div>
        <button class="undo" :aria-label="`撤销 ${record.dirName}`" @click="$emit('undo', record)">
          撤销
        </button>
      </li>
    </ul>
  </section>
</template>
<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
}
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.history-head h3 {
  margin: 0;
  font-size: 14px;
}
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 210px;
  overflow: auto;
}
.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-surface);
}
.history-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.history-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-meta {
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
