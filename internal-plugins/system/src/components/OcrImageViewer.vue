<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

// 参照 MIT f-provider 的原图坐标叠层，使用可选择文字并去除其 UI 依赖。
const props = defineProps({
  imageSrc: { type: String, required: true },
  blocks: { type: Array, default: () => [] },
  recognized: { type: Boolean, default: false },
  selectedText: { type: String, default: '' }
})
const emit = defineEmits(['select', 'copy'])
const viewport = ref(null)
const imageElement = ref(null)
const layer = ref(null)
const width = ref(0)
const height = ref(0)
const availableWidth = ref(0)
const zoom = ref(1)
const hovered = ref(-1)
const selected = ref(-1)
let observer
let disposed = false
const measureCanvas = document.createElement('canvas')
const measureContext = measureCanvas.getContext('2d')
const scale = computed(() => Math.min(1, availableWidth.value / (width.value || 1)) * zoom.value)
const lines = computed(() =>
  props.blocks
    .map((block, index) => ({ ...block, index }))
    .filter(
      (block) =>
        typeof block.text === 'string' &&
        [block.left, block.top, block.right, block.bottom].every(Number.isFinite) &&
        block.left >= 0 &&
        block.top >= 0 &&
        block.right > block.left &&
        block.bottom > block.top &&
        block.left < width.value &&
        block.top < height.value
    )
)

/**
 * 图片加载后记录自然尺寸，行框始终使用原图像素坐标。
 * @param event 图片加载事件。
 * @returns 无返回值。
 */
function loaded(event) {
  if (disposed) return
  width.value = event.target.naturalWidth
  height.value = event.target.naturalHeight
}

/**
 * 将行框转换为百分比位置，缩放时与底图一起变化。
 * @param line 带原图坐标的识别行。
 * @returns 行框的显示样式。
 */
function boxStyle(line) {
  return {
    left: `${(line.left / width.value) * 100}%`,
    top: `${(line.top / height.value) * 100}%`,
    width: `${(Math.min(width.value - line.left, line.right - line.left) / width.value) * 100}%`,
    height: `${(Math.min(height.value - line.top, line.bottom - line.top) / height.value) * 100}%`
  }
}

/**
 * 等宽透明文字按行框拉伸，支持在原图位置拖选部分文字。
 * @param line 带原图坐标和文本的识别行。
 * @returns 透明文字层样式。
 */
function textStyle(line) {
  const font = (line.bottom - line.top) * scale.value
  // 实测字体宽度，兼容中文和英文混排；按字符数估计会让中文选区偏移。
  measureContext.font = `${font}px monospace`
  const stretch =
    ((line.right - line.left) * scale.value) /
    Math.max(1, measureContext.measureText(line.text).width)
  return { fontSize: `${font}px`, transform: `scaleX(${stretch})` }
}

/**
 * 只接受当前图片叠层内部的浏览器选区。
 * @returns 当前选中的部分文字。
 */
function rangeText() {
  const selection = window.getSelection()
  return layer.value?.contains(selection?.anchorNode) && layer.value?.contains(selection?.focusNode)
    ? selection.toString().trim()
    : ''
}

/**
 * 拖选或键盘选文后向父组件传递文本。
 * @returns 无返回值。
 */
function selectRange() {
  const text = rangeText()
  if (text) {
    selected.value = -1
    emit('select', text)
  }
}

/**
 * 点击标注选择整行，拖选时保留部分文字选区。
 * @param line 用户点击的识别行。
 * @returns 无返回值。
 */
function selectLine(line) {
  if (rangeText()) {
    selectRange()
    return
  }
  selected.value = line.index
  emit('select', line.text)
}

/**
 * 点击明细时替换已有浏览器选区，选择对应整行。
 * @param line 用户点击的识别行。
 * @returns 无返回值。
 */
function selectDetail(line) {
  clearSelection()
  selectLine(line)
}

/**
 * 清除属于当前图片的选区，不影响其他输入框。
 * @returns 无返回值。
 */
function clearSelection() {
  const selection = window.getSelection()
  if (layer.value?.contains(selection?.anchorNode)) selection.removeAllRanges()
  selected.value = -1
}

/**
 * 释放尺寸监听和图片引用，迟到加载不再更新界面。
 * @returns 无返回值。
 */
function dispose() {
  if (disposed) return
  disposed = true
  observer?.disconnect()
  measureCanvas.width = 0
  measureCanvas.height = 0
  clearSelection()
  imageElement.value?.removeAttribute('src')
}
watch(
  () => props.imageSrc,
  () => {
    width.value = 0
    height.value = 0
    zoom.value = 1
    clearSelection()
  }
)
watch(() => props.blocks, clearSelection)
watch(
  () => props.selectedText,
  (text) => {
    if (!text) clearSelection()
  }
)
onMounted(() => {
  if (disposed) return
  observer = new ResizeObserver((entries) => {
    if (!disposed) availableWidth.value = entries[0].contentRect.width
  })
  observer.observe(viewport.value)
})
window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
</script>

<template>
  <div class="ocr-viewer">
    <div class="viewer-toolbar">
      <button :disabled="zoom <= 1" aria-label="缩小图片" @click="zoom = Math.max(1, zoom / 1.25)">
        −
      </button>
      <span>{{ Math.round(zoom * 100) }}%</span>
      <button :disabled="zoom >= 5" aria-label="放大图片" @click="zoom = Math.min(5, zoom * 1.25)">
        +
      </button>
      <button @click="zoom = 1">适应宽度</button>
    </div>
    <div ref="viewport" class="image-viewport">
      <div class="image-layer" :style="{ width: width ? `${width * scale}px` : '100%' }">
        <img
          ref="imageElement"
          :src="imageSrc || undefined"
          alt="待识别图片"
          draggable="false"
          @load="loaded"
        />
        <div ref="layer" class="text-layer" @pointerup="selectRange" @keyup="selectRange">
          <div
            v-for="line in lines"
            :key="line.index"
            class="ocr-box"
            :class="{ active: hovered === line.index, selected: selected === line.index }"
            :style="boxStyle(line)"
            :title="`${line.text}\n坐标 (${line.left}, ${line.top}) — (${line.right}, ${line.bottom})`"
            :data-line="line.index"
            :aria-label="`选择文字：${line.text}`"
            role="button"
            tabindex="0"
            @mouseenter="hovered = line.index"
            @mouseleave="hovered = -1"
            @click="selectLine(line)"
            @keydown.enter.prevent="selectLine(line)"
          >
            <span class="overlay-text" :style="textStyle(line)">{{ line.text }}</span>
          </div>
        </div>
      </div>
    </div>
    <template v-if="lines.length">
      <p class="viewer-hint">点击标注选择整行，或在图中文字上拖选片段。悬停标注可查看原图坐标。</p>
      <details class="line-details">
        <summary>文字坐标与逐行结果（{{ lines.length }} 行）</summary>
        <div
          v-for="line in lines"
          :key="line.index"
          class="ocr-line"
          :class="{ active: hovered === line.index }"
          @mouseenter="hovered = line.index"
          @mouseleave="hovered = -1"
        >
          <button @click="selectDetail(line)">
            {{ line.text }}
          </button>
          <span>({{ line.left }}, {{ line.top }}) — ({{ line.right }}, {{ line.bottom }})</span>
          <button @click="emit('copy', line.text)">复制此行</button>
        </div>
      </details>
    </template>
    <p v-else-if="recognized" class="viewer-hint">
      当前服务未返回有效文字坐标，可在下方识别结果中选择和复制文字。
    </p>
  </div>
</template>

<style scoped>
.ocr-viewer {
  margin-top: 14px;
}
.viewer-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
button {
  font: inherit;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 5px 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
.image-viewport {
  overflow: auto;
  max-height: 360px;
  width: 100%;
  background: var(--bg-surface);
}
.image-layer {
  position: relative;
  line-height: 0;
}
img {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
}
.text-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ocr-box {
  position: absolute;
  box-sizing: border-box;
  pointer-events: auto;
  border: 1px solid rgba(25, 118, 210, 0.55);
  background: rgba(25, 118, 210, 0.04);
  cursor: text;
  overflow: hidden;
}
.ocr-box.active,
.ocr-box.selected {
  background: rgba(25, 118, 210, 0.2);
  border-color: #1976d2;
}
.overlay-text {
  display: inline-block;
  white-space: pre;
  color: transparent;
  line-height: 1;
  font-family: monospace;
  transform-origin: left top;
  user-select: text;
}
.overlay-text::selection {
  color: transparent;
  background: rgba(25, 118, 210, 0.4);
}
.viewer-hint,
.ocr-line span {
  color: var(--text-secondary);
  line-height: 1.7;
}
summary {
  cursor: pointer;
}
.ocr-line {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 5px 0;
  flex-wrap: wrap;
}
.ocr-line.active {
  background: rgba(25, 118, 210, 0.1);
}
</style>
