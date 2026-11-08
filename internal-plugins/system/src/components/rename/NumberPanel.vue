<!-- 界面复用 batch-rename，来源与 MIT 许可见 public/LICENSE.batch-rename。 -->
<script setup lang="ts">
import type { NumberRule } from './types'
import SequenceFields from './SequenceFields.vue'

const props = defineProps<{ modelValue: NumberRule }>()
const emit = defineEmits<{ 'update:modelValue': [value: NumberRule] }>()

/**
 * 更新单个规则字段，交由父组件安排预览计算。
 * @param key 字段名称。
 * @param value 新字段值。
 * @returns 无返回值。
 */
function update<K extends keyof NumberRule>(key: K, value: NumberRule[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <section class="number-panel" aria-label="自动编号设置">
    <label class="material-field"
      ><span>序号前面字符</span
      ><input
        aria-label="编号前缀"
        :value="modelValue.prefix"
        type="text"
        placeholder="如：课程_"
        @input="update('prefix', ($event.target as HTMLInputElement).value)"
    /></label>
    <SequenceFields
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <label class="material-field"
      ><span>序号后面字符</span
      ><input
        :value="modelValue.suffix"
        aria-label="编号后缀"
        type="text"
        placeholder="如：_完成版"
        @input="update('suffix', ($event.target as HTMLInputElement).value)"
    /></label>
  </section>
</template>

<style scoped>
.number-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px minmax(0, 1fr);
  align-items: center;
  gap: 26px;
  height: 100%;
}
.material-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid var(--border-input);
  border-radius: 8px;
  background: var(--surface-subdued);
}
.material-field {
  height: 68px;
  padding: 8px 14px;
}
.material-field:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.material-field > span {
  color: var(--muted);
  font-size: 11px;
}
.material-field input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
}
@media (max-width: 580px) {
  .number-panel {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .sequence-fields {
    grid-row: span 2;
    grid-column: 2;
  }
}
</style>
