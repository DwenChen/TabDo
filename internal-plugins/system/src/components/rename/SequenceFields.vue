<script setup lang="ts">
import { computed } from 'vue'
import type { NumberRule, SequenceStyle } from './types'
import NumberInput from './NumberInput.vue'

const props = withDefaults(defineProps<{ modelValue: NumberRule; labelPrefix?: string }>(), {
  labelPrefix: ''
})
const emit = defineEmits<{ 'update:modelValue': [value: NumberRule] }>()
const styles: { value: SequenceStyle; label: string }[] = [
  { value: 'arabic', label: '阿拉伯数字' },
  { value: 'chinese-lower', label: '中文小写' },
  { value: 'chinese-upper', label: '中文大写' },
  { value: 'alpha-lower', label: '英文小写字母' },
  { value: 'alpha-upper', label: '英文大写字母' }
]

/**
 * 用普通正文绘制当前类型名称，避免原生下拉的选中文字与数字框字形不一致。
 * @returns 当前序号类型的中文名称。
 */
const selectedLabel = computed(
  () => styles.find((style) => style.value === props.modelValue.style)?.label || ''
)

/**
 * 更新共享序号参数，保留前后缀和调用页的其余配置。
 * @param key 当前修改的序号字段。
 * @param event 原生数字输入或下拉选择事件。
 * @returns {void} 向所属页面提交更新后的参数，无返回值。
 */
function update(key: 'start' | 'digits' | 'style', event: Event) {
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  // 数字约束与既有规则一致，切换显示布局不改变编号行为。
  const number = Number(value)
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: key === 'style' ? value : Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
  })
}
</script>

<template>
  <div class="number-card sequence-fields">
    <label class="sequence-field">
      <span class="field-label">开始序号</span>
      <span class="sequence-control"
        ><NumberInput
          :value="modelValue.start"
          :aria-label="`${labelPrefix}开始序号`"
          min="0"
          @input="update('start', $event)"
      /></span>
    </label>
    <label class="sequence-field">
      <span class="field-label">序号类型</span>
      <span class="sequence-control sequence-select">
        <span class="selected-value" aria-hidden="true">{{ selectedLabel }}</span>
        <select
          :value="modelValue.style"
          :aria-label="`${labelPrefix}序号类型`"
          @change="update('style', $event)"
        >
          <option v-for="style in styles" :key="style.value" :value="style.value">
            {{ style.label }}
          </option>
        </select>
        <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m2 2 4 4 4-4" /></svg>
      </span>
    </label>
    <label v-if="modelValue.style === 'arabic'" class="sequence-field">
      <span class="field-label">固定位数</span>
      <span class="sequence-control"
        ><NumberInput
          :value="modelValue.digits || ''"
          :aria-label="`${labelPrefix}固定位数`"
          min="0"
          placeholder="不补零"
          @input="update('digits', $event)"
      /></span>
    </label>
  </div>
</template>

<style scoped>
.sequence-fields {
  min-width: 0;
  display: grid;
  gap: 10px;
}
.sequence-field {
  min-width: 0;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.field-label {
  color: var(--muted);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.sequence-fields .sequence-control {
  display: flex;
  align-items: center;
  min-width: 0;
  width: 100%;
  height: 32px;
  padding: 0 6px 0 10px;
  border: 1px solid var(--border-input);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface-subdued);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
}
.sequence-control:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.sequence-select {
  position: relative;
  display: flex;
  align-items: center;
}
.sequence-select select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  appearance: none;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0 26px 0 0;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  line-height: normal;
}
.selected-value {
  overflow: hidden;
  padding-right: 26px;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  line-height: 24px;
  pointer-events: none;
}
.sequence-select svg {
  position: absolute;
  right: 12px;
  top: 50%;
  width: 10px;
  height: 7px;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--muted);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
