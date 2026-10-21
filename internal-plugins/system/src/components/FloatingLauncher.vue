<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import { syncPluginHeightToContent } from '@/utils/pluginHeight'
const props = defineProps({ action: { type: Object, required: true } })
const message = ref(''),
  busy = ref(false)
let disposed = false
/**
 * 入口只在转交失败或需要人工选择时可见，因此始终按内容收紧高度。
 * @returns {void} 无返回值。
 */
function syncHeight() {
  if (disposed) return
  void nextTick(() => {
    if (!disposed) syncPluginHeightToContent(null, { minHeight: 150, maxHeight: 320 })
  })
}
/**
 * 创建独立窗口，整条转交链在前台退出前登记。
 * @param content 图片或文字内容。
 * @returns 窗口打开后的 Promise。
 */
async function open(content) {
  if (busy.value || disposed) return
  busy.value = true
  try {
    await window.toolsLifecycle.runTask(() => window.tabdo.internal.tools.openFloating(content))
    if (!disposed) {
      // 独立窗口已是最终界面，入口页面不再保留，隐藏主窗口同时结束本次工具会话。
      window.tabdo.hideMainWindow()
    }
  } catch (error) {
    if (!disposed) message.value = error.message
  } finally {
    if (!disposed) {
      busy.value = false
      if (message.value) syncHeight()
    }
  }
}
/**
 * 优先使用所选图片或文字，没有匹配载荷时读取剪贴板。
 * @returns 窗口打开后的 Promise。
 */
async function current() {
  try {
    const action = props.action
    if (action.code === 'sticky-note') {
      await open({ type: 'text', text: '', newWindow: true })
      return
    }
    // 文本选区拥有优先权，不能被剪贴板上残留的图片覆盖。
    if (action.code !== 'image-annotate' && ['over', 'regex'].includes(action.type)) {
      await open({ type: 'text', text: action.payload })
      return
    }
    const source =
      action.type === 'img'
        ? action.payload
        : action.type === 'files'
          ? window.toolsProvider.readImage(action.payload[0].path)
          : window.toolsProvider.clipboardImage()
    if (source) await open({ type: 'image', image: source, edit: action.code === 'image-annotate' })
    else if (action.code === 'image-annotate')
      message.value = '请先复制图片，或从剪贴板图片右键选择“标记图片”'
    else
      await open({
        type: 'text',
        text:
          action.type === 'over' || action.type === 'regex'
            ? action.payload
            : window.toolsProvider.clipboardText()
      })
  } catch (error) {
    message.value = error.message
  }
}
/**
 * 停止入口页面更新，独立悬浮窗口拥有自己的生命周期。
 * @returns 无返回值。
 */
function dispose() {
  disposed = true
}
window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
onMounted(async () => {
  void window.tabdo.removeSubInput()
  await current()
  if (message.value) syncHeight()
})
</script>
<template>
  <div v-if="message" class="utility-page">
    <p role="status">{{ message }}</p>
    <div class="actions">
      <button :disabled="busy" @click="current">
        {{ action.code === 'sticky-note' ? '新建空白便签' : '打开剪贴板内容' }}
      </button>
    </div>
  </div>
</template>
