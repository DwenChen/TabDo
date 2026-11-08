<!-- 界面复用 batch-rename，来源与 MIT 许可见 public/LICENSE.batch-rename。 -->
<script setup lang="ts">
import type { InsertInfo, InsertRule } from './types'
import NumberInput from './NumberInput.vue'
import SequenceFields from './SequenceFields.vue'

const props = defineProps<{ modelValue: InsertRule }>()
const emit = defineEmits<{ 'update:modelValue': [value: InsertRule] }>()
const information: { value: InsertInfo; label: string }[] = [
  { value: 'created', label: '文件创建时间' },
  { value: 'modified', label: '文件修改时间' },
  { value: 'size', label: '文件大小' },
  { value: 'dimensions', label: '图片尺寸（宽×高）' },
  { value: 'captured', label: '照片拍摄时间' }
]

/**
 * 更新单个规则字段，交由父组件安排预览计算。
 * @param key 字段名称。
 * @param value 新字段值。
 * @returns 无返回值。
 */
function update<K extends keyof InsertRule>(key: K, value: InsertRule[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

/**
 * 更新序号配置，保持其他规则字段。
 * @param key 序号字段。
 * @param value 新字段值。
 * @returns 无返回值。
 */
function updateNumber<K extends keyof InsertRule['number']>(
  key: K,
  value: InsertRule['number'][K]
) {
  update('number', { ...props.modelValue.number, [key]: value })
}

/**
 * 校验表单数字并限制最小值。
 * @param event 输入事件。
 * @param minimum 最小值。
 * @returns 转换后的显示值。
 */
function numericValue(event: Event, minimum: number) {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? Math.max(minimum, Math.trunc(value)) : minimum
}
</script>

<template>
  <section class="insert-panel" aria-label="插入内容设置">
    <div class="segmented-row">
      <div class="segmented-group">
        <span>内容：</span>
        <div class="segmented-tabs">
          <button
            v-for="option in [
              ['text', '文本'],
              ['number', '序号'],
              ['info', '文件信息']
            ] as const"
            :key="option[0]"
            type="button"
            :class="{ active: modelValue.kind === option[0] }"
            @click="update('kind', option[0])"
          >
            {{ option[1] }}
          </button>
        </div>
      </div>
      <div class="segmented-group">
        <span>位置：</span>
        <div class="segmented-tabs">
          <button
            v-for="option in [
              ['start', '开头'],
              ['index', '指定位置'],
              ['end', '末尾']
            ] as const"
            :key="option[0]"
            type="button"
            :class="{ active: modelValue.position === option[0] }"
            @click="update('position', option[0])"
          >
            {{ option[1] }}
          </button>
        </div>
        <label v-if="modelValue.position === 'index'" class="position-field">
          <NumberInput
            :value="modelValue.index"
            aria-label="插入位置"
            min="1"
            @input="update('index', numericValue($event, 1))"
          />
        </label>
      </div>
    </div>
    <div v-if="modelValue.kind === 'text'" class="single-row">
      <label class="material-field"
        ><span>固定文本内容</span
        ><input
          :value="modelValue.text"
          type="text"
          aria-label="插入文本"
          placeholder="输入要插入的固定文本..."
          @input="update('text', ($event.target as HTMLInputElement).value)"
      /></label>
    </div>
    <div v-else-if="modelValue.kind === 'number'" class="three-cols">
      <label class="material-field"
        ><span>序号前面字符</span
        ><input
          :value="modelValue.number.prefix"
          type="text"
          placeholder="如：Part_"
          @input="updateNumber('prefix', ($event.target as HTMLInputElement).value)"
      /></label>
      <SequenceFields
        :model-value="modelValue.number"
        label-prefix="插入"
        @update:model-value="update('number', $event)"
      />
      <label class="material-field"
        ><span>序号后面字符</span
        ><input
          :value="modelValue.number.suffix"
          type="text"
          placeholder="如：_HD"
          @input="updateNumber('suffix', ($event.target as HTMLInputElement).value)"
      /></label>
    </div>
    <div v-else class="three-cols">
      <label class="material-field"
        ><span>文件信息前面字符</span
        ><input
          :value="modelValue.prefix"
          type="text"
          placeholder="如：["
          @input="update('prefix', ($event.target as HTMLInputElement).value)"
      /></label>
      <label class="material-field"
        ><span>文件信息类型</span
        ><select
          :value="modelValue.info"
          aria-label="文件信息类型"
          @change="update('info', ($event.target as HTMLSelectElement).value as InsertInfo)"
        >
          <option v-for="item in information" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select></label
      >
      <label class="material-field"
        ><span>文件信息后面字符</span
        ><input
          :value="modelValue.suffix"
          type="text"
          placeholder="如：]"
          @input="update('suffix', ($event.target as HTMLInputElement).value)"
      /></label>
    </div>
  </section>
</template>

<style scoped>
.insert-panel {
  display: grid;
  grid-template-rows: auto auto;
  align-items: start;
  gap: 14px;
}
.segmented-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.segmented-group {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.segmented-tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subdued);
}
.segmented-tabs button {
  padding: 4px 8px;
  color: var(--muted);
  background: transparent;
  font-size: 12px;
}
.segmented-tabs button.active {
  color: var(--primary);
  background: var(--surface-card);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  font-weight: 600;
}
.single-row,
.three-cols {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 10px;
}
.three-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px minmax(0, 1fr);
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
  flex: 1;
  height: 56px;
  padding: 6px 10px;
}
.material-field:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.material-field > span {
  color: var(--muted);
  font-size: 11px;
}
.material-field input,
.material-field select {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
}
.position-field {
  width: 66px;
  padding: 2px 4px 2px 8px;
  border: 1px solid var(--border-input);
  border-radius: 5px;
  background: var(--surface-subdued);
}
@media (max-width: 640px) {
  .three-cols {
    grid-template-columns: minmax(0, 1fr) 230px minmax(0, 1fr);
  }
}
</style>
