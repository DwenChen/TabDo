<script setup>
import { onUnmounted, ref } from 'vue'
const props = defineProps({
  modelValue: Number,
  min: { type: Number, default: 0 },
  max: [Number, Function],
  defaultWidth: Number,
  title: { type: String, default: '拖动调整宽度，双击恢复默认' }
})
const emit = defineEmits(['update:modelValue', 'change', 'resizingChange'])
const isResizing = ref(false)
let startX = 0
let startWidth = 0
/**
 * 解析当前窗口允许的最大分栏宽度。
 * @returns 处理后的数值或状态。
 */
function resolveMax() {
  if (typeof props.max === 'function') {
    const computedMax = props.max()
    return typeof computedMax === 'number' && !Number.isNaN(computedMax)
      ? computedMax
      : Number.POSITIVE_INFINITY
  }
  return typeof props.max === 'number' && !Number.isNaN(props.max)
    ? props.max
    : Number.POSITIVE_INFINITY
}
/**
 * 拖动时限制并更新分栏宽度。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function onMouseMove(event) {
  if (!isResizing.value) return
  const deltaX = event.clientX - startX
  const minVal = typeof props.min === 'number' && !Number.isNaN(props.min) ? props.min : 0
  const maxVal = Math.max(minVal, resolveMax())
  const targetWidth = Math.min(maxVal, Math.max(minVal, startWidth + deltaX))
  emit('update:modelValue', targetWidth)
}
/**
 * 结束拖动并发布最终宽度。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function onMouseUp(event) {
  if (!isResizing.value) return
  const deltaX = event.clientX - startX
  const minVal = typeof props.min === 'number' && !Number.isNaN(props.min) ? props.min : 0
  const maxVal = Math.max(minVal, resolveMax())
  const finalWidth = Math.min(maxVal, Math.max(minVal, startWidth + deltaX))
  isResizing.value = false
  emit('resizingChange', false)
  removeListeners()
  emit('update:modelValue', finalWidth)
  emit('change', finalWidth)
}
/**
 * 移除本组件持有的全局拖动监听。
 * @returns 无返回值。
 */
function removeListeners() {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}
/**
 * 开始一次有界的分栏拖动。
 * @param event 当前原生事件。
 * @returns 无返回值。
 */
function onMouseDown(event) {
  if (event.button !== 0) return
  event.preventDefault()
  removeListeners()
  isResizing.value = true
  emit('resizingChange', true)
  startX = event.clientX
  startWidth = props.modelValue
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
/**
 * 将分栏恢复为原插件默认宽度。
 * @returns 无返回值。
 */
function onDoubleClick() {
  if (props.defaultWidth !== undefined) {
    emit('update:modelValue', props.defaultWidth)
    emit('change', props.defaultWidth)
  }
}
window.toolsLifecycle.addCleanup(removeListeners)
onUnmounted(() => {
  removeListeners()
})
</script>

<template>
  <div
    class="finder-split-resizer"
    :class="{ 'is-resizing': isResizing }"
    :title="title"
    @mousedown="onMouseDown"
    @dblclick="onDoubleClick"
  >
    <span class="resizer-line"></span>
  </div>
</template>

<style scoped>
.finder-split-resizer {
  position: absolute;
  top: 0;
  right: -8px;
  bottom: 0;
  z-index: 50;
  width: 8px;
  cursor: col-resize;
}

.resizer-line {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: transparent;
  transition: background-color 0.15s ease;
  pointer-events: none;
}

.finder-split-resizer:hover .resizer-line,
.finder-split-resizer.is-resizing .resizer-line {
  background: var(--primary-color);
}
</style>
