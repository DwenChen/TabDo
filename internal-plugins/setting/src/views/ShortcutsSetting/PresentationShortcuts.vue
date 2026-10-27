<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useToast } from '@/components'
const { error } = useToast()
const actions = [
  ['playPause', '播放或暂停'],
  ['addZoom', '添加缩放'],
  ['splitClip', '分割片段'],
  ['addAnnotation', '添加标注'],
  ['addKeyframe', '添加关键帧'],
  ['deleteSelected', '删除选中项']
]
interface Binding {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}
const configuration = ref<Record<string, Binding>>({})
const busy = ref(false)

/**
 * 读取宿主保存的演示编辑动作，缺失时全部关闭。
 * @returns 读取结束后的 Promise。
 */
async function load(): Promise<void> {
  configuration.value = (await window.tabdo.internal.dbGet('presentation-shortcuts')) || {}
}
/**
 * 录入某项演示编辑动作并保存到宿主设置，拒绝重复组合。
 * @param id 动作标识。
 * @param event 用户键盘输入。
 * @returns 保存结束后的 Promise。
 */
async function record(id: string, event: KeyboardEvent): Promise<void> {
  event.preventDefault()
  if (event.repeat || busy.value || ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
  const binding: Binding = {
    key: event.key.toLowerCase(),
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey
  }
  if (
    Object.entries(configuration.value).some(
      ([key, value]) =>
        key !== id &&
        value.key === binding.key &&
        !!value.ctrl === binding.ctrl &&
        !!value.shift === binding.shift &&
        !!value.alt === binding.alt
    )
  ) {
    error('此组合已用于其他演示编辑动作')
    return
  }
  await save(id, binding)
}
/**
 * 只更新指定动作，保留其他显式选择。
 * @param id 动作标识。
 * @param binding 新组合，空键表示关闭。
 * @returns 持久化完成后的 Promise。
 */
async function save(id: string, binding: Binding): Promise<void> {
  busy.value = true
  try {
    const next = { ...configuration.value, [id]: binding }
    await window.tabdo.internal.dbPut('presentation-shortcuts', next)
    configuration.value = next
  } catch (failure) {
    error(String(failure))
  } finally {
    busy.value = false
  }
}
/**
 * 格式化当前动作的组合说明。
 * @param id 动作标识。
 * @returns 简短组合或关闭说明。
 */
function label(id: string): string {
  const value = configuration.value[id]
  if (!value?.key) return '未启用 · 点击后按下组合键'
  return [
    value.ctrl ? 'Ctrl' : '',
    value.shift ? 'Shift' : '',
    value.alt ? 'Alt' : '',
    value.key === ' ' ? '空格' : value.key.toUpperCase()
  ]
    .filter(Boolean)
    .join(' + ')
}
onMounted(load)
</script>
<template>
  <section class="presentation-shortcuts">
    <div class="category-label">演示编辑器</div>
    <p>仅在演示编辑器内生效，初始全部关闭。点击输入框后按下组合键，自动保存。</p>
    <div v-for="[id, name] in actions" :key="id" class="card shortcut-item">
      <label :for="'presentation-' + id">{{ name }}</label>
      <input
        :id="'presentation-' + id"
        readonly
        :value="label(id)"
        :aria-label="'演示编辑器' + name"
        :disabled="busy"
        @keydown="record(id, $event)"
      />
      <button
        class="btn"
        :disabled="!configuration[id]?.key || busy"
        @click="save(id, { key: '' })"
      >
        关闭
      </button>
    </div>
  </section>
</template>
<style scoped>
p {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.shortcut-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  margin-top: 8px;
}
label {
  min-width: 100px;
  font-size: 13px;
}
input {
  height: 34px;
  min-width: 0;
  flex: 1;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  background: var(--control-bg);
  color: var(--text-color);
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
}
</style>
