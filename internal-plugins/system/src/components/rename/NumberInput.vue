<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps<{ value: number | string; min?: number | string; step?: number | string }>()
const emit = defineEmits<{ input: [event: Event] }>()
const input = ref<HTMLInputElement>()

/**
 * 使用数字框原生步进规则调整数值，并复用输入事件更新父级配置。
 * @param direction 增加或减少一步。
 * @returns {void} 调整数值并恢复输入焦点，无返回值。
 */
function adjust(direction: number) {
  const element = input.value
  if (!element || element.matches(':disabled')) return
  // 原生步进处理 min、step 和空值，避免按钮与键盘产生不同的数字规则。
  if (direction > 0) element.stepUp()
  else element.stepDown()
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.focus()
}
</script>

<template>
  <span class="rename-number-input">
    <input
      ref="input"
      v-bind="$attrs"
      type="number"
      :value="value"
      :min="min"
      :step="step ?? 1"
      @input="emit('input', $event)"
    />
    <span class="number-stepper">
      <button
        type="button"
        :disabled="!!$attrs.disabled"
        :aria-label="`增加${$attrs['aria-label'] || '数值'}`"
        @mousedown.prevent
        @click="adjust(1)"
      >
        <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m2 6 4-4 4 4" /></svg>
      </button>
      <button
        type="button"
        :disabled="!!$attrs.disabled"
        :aria-label="`减少${$attrs['aria-label'] || '数值'}`"
        @mousedown.prevent
        @click="adjust(-1)"
      >
        <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m2 2 4 4 4-4" /></svg>
      </button>
    </span>
  </span>
</template>

<style scoped>
.rename-number-input {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  height: 24px;
}
input {
  flex: 1;
  width: 0;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  appearance: textfield;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  line-height: 24px;
}
input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}
.number-stepper {
  display: grid;
  flex: none;
  width: 22px;
  grid-template-rows: 10px 10px;
  align-content: center;
}
.number-stepper button {
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 3px;
  color: var(--muted);
  background: transparent;
}
.number-stepper button:hover:not(:disabled) {
  color: var(--primary);
  background: var(--surface-hover);
}
.number-stepper svg {
  width: 10px;
  height: 7px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
