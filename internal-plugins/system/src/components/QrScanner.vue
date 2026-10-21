<script setup>
import { onMounted, onUnmounted, ref, computed, nextTick, watch } from 'vue'
import { syncPluginHeightToContent } from '@/utils/pluginHeight'
const props = defineProps({ action: { type: Object, required: true } })
const image = ref(''),
  result = ref(''),
  message = ref(''),
  busy = ref(false)
let worker,
  loadingImage,
  timer,
  reader,
  measuredWidth = 0,
  revision = 0,
  disposed = false
const link = computed(() => {
  try {
    const url = new URL(result.value.trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
})
/**
 * 按基于窗口宽度的双栏正文调整高度，保持窗口方正且避免视口高度反馈。
 * @returns {void} 无返回值。
 */
function syncHeight() {
  if (disposed) return
  void nextTick(() => {
    if (!disposed) syncPluginHeightToContent(null, { minHeight: 320, maxHeight: 620 })
  })
}
/**
 * 仅在宽度变化后重新测量，防止高度调整触发 resize 后重复请求宿主。
 * @returns {void} 无返回值。
 */
function resize() {
  if (measuredWidth === window.innerWidth) return
  measuredWidth = window.innerWidth
  syncHeight()
}
/**
 * 停止旧识别和图像读取，任何迟到结果均作废。
 * @returns 无返回值。
 */
function cancel() {
  revision++
  worker?.terminate()
  worker = null
  clearTimeout(timer)
  if (reader?.readyState === 1) reader.abort()
  if (loadingImage) {
    loadingImage.onload = null
    loadingImage.onerror = null
    loadingImage.src = ''
    loadingImage = null
  }
  busy.value = false
}
/**
 * 在短生命周期 Worker 中识别二维码，避免大图计算阻塞界面。
 * @param source 图片 data URI。
 * @returns 无返回值。
 */
function scan(source) {
  cancel()
  image.value = source || ''
  result.value = ''
  message.value = ''
  if (!source || disposed) return
  busy.value = true
  const id = revision
  const img = new Image()
  loadingImage = img
  img.onload = () => {
    if (disposed || id !== revision) return
    const scale = Math.min(1, 3200 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = context.getImageData(0, 0, canvas.width, canvas.height)
    worker = new Worker(new URL('../workers/qrcode.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (disposed || id !== revision) return
      result.value = data.text || ''
      message.value =
        data.error || (result.value ? '扫描完成' : '未发现二维码，请裁剪二维码区域或换图后重试')
      cancel()
    }
    worker.onerror = () => {
      if (id === revision) {
        message.value = '二维码识别失败，请重试'
        cancel()
      }
    }
    worker.postMessage({ id, rgba: data.data.buffer, width: data.width, height: data.height }, [
      data.data.buffer
    ])
    canvas.width = 0
    canvas.height = 0
    timer = setTimeout(() => {
      if (id === revision) {
        message.value = '识别超时，请缩小图片后重试'
        cancel()
      }
    }, 15000)
  }
  img.onerror = () => {
    if (id === revision) {
      message.value = '图片读取失败'
      cancel()
    }
  }
  img.src = source
}
/**
 * 读取用户选中或粘贴的新图，完成后自动扫描。
 * @param file 图片文件。
 * @returns 无返回值。
 */
function read(file) {
  if (!file) return
  cancel()
  result.value = ''
  image.value = ''
  if (!file.type.startsWith('image/') || file.size > 50 * 1024 * 1024) {
    message.value = '请选择小于 50MB 的图片'
    return
  }
  const id = revision
  reader = new FileReader()
  reader.onload = () => {
    if (!disposed && id === revision) scan(reader.result)
  }
  reader.onerror = () => {
    if (!disposed) message.value = '读取图片失败'
  }
  reader.readAsDataURL(file)
}
/**
 * 处理文件选择并复位输入，允许重复选取同一图片。
 * @param event 文件选择事件。
 * @returns 无返回值。
 */
function choose(event) {
  read(event.target.files[0])
  event.target.value = ''
}
/**
 * 接收图片粘贴，保留普通文本粘贴。
 * @param event 粘贴事件。
 * @returns 无返回值。
 */
function paste(event) {
  const file = [...event.clipboardData.items]
    .find((item) => item.type.startsWith('image/'))
    ?.getAsFile()
  if (file) {
    event.preventDefault()
    read(file)
  } else readClipboard()
}
/**
 * 从宿主剪贴板读取像素图或图片文件。
 * @returns 无返回值。
 */
function readClipboard() {
  try {
    const source = window.toolsProvider.clipboardImage()
    if (source) scan(source)
    else message.value = '剪贴板中没有可扫描的图片'
  } catch (error) {
    message.value = error.message
  }
}
/**
 * 用户点击后通过系统默认浏览器打开有效 HTTP(S) 地址。
 * @returns 无返回值。
 */
function openLink() {
  if (link.value) window.tabdo.shellOpenExternal(link.value)
}
/**
 * 将扫码原文作为完整任务写入剪贴板。
 * @returns 复制完成后的 Promise。
 */
async function copy() {
  await window.toolsLifecycle.runTask(() => window.tabdo.copyText(result.value))
}
/**
 * 退出时释放监听、Worker 和图像引用。
 * @returns 无返回值。
 */
function dispose() {
  disposed = true
  cancel()
  document.removeEventListener('paste', paste)
  window.removeEventListener('resize', resize)
  image.value = ''
  result.value = ''
}
window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
// 识别状态、结果和预览变化都会改变正文高度，统一在变化后重新贴合。
watch([image, result, message, busy], syncHeight)
onMounted(() => {
  document.addEventListener('paste', paste)
  // 宽度决定双栏高度，退出时同步释放监听；不把高度变化作为重算输入。
  window.addEventListener('resize', resize)
  measuredWidth = window.innerWidth
  void window.tabdo.removeSubInput()
  try {
    if (props.action.type === 'img') scan(props.action.payload)
    else if (props.action.type === 'files')
      scan(window.toolsProvider.readImage(props.action.payload[0].path))
    else readClipboard()
  } catch (error) {
    message.value = error.message
  }
  syncHeight()
})
</script>
<template>
  <div
    class="utility-page qr-page"
    @dragover.prevent
    @drop.prevent="read($event.dataTransfer.files[0])"
  >
    <div class="qr-actions">
      <label class="qr-pick">
        <input type="file" accept="image/*" @change="choose" />
        <span>选择图片</span>
      </label>
      <button @click="readClipboard">读取剪贴板</button>
      <button v-if="busy" class="qr-cancel" @click="cancel">取消扫描</button>
      <span class="qr-status" :class="{ busy }" role="status" :title="message">
        {{ busy ? '正在扫描…' : message || '等待图片' }}
      </span>
    </div>
    <div class="qr-content">
      <section class="qr-pane qr-source" aria-label="二维码图片">
        <div class="qr-pane-heading">
          <h3>图片预览</h3>
          <small>拖入或粘贴图片</small>
        </div>
        <div v-if="image" class="qr-preview">
          <img :src="image" alt="待扫描图片" class="qr-image" />
        </div>
        <div v-else class="qr-empty">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
            <rect x="7" y="7" width="3" height="3" />
            <rect x="14" y="7" width="3" height="3" />
            <path d="M7 14h3v3H7ZM14 14h3v3h-3" />
          </svg>
          <span>把二维码图片拖到这里</span>
          <small>也可直接粘贴图片 · Ctrl+V</small>
        </div>
      </section>
      <section class="qr-pane qr-result" :aria-busy="busy">
        <div class="qr-pane-heading qr-result-head">
          <h3>扫描结果</h3>
          <button class="qr-copy" :disabled="!result" @click="copy">复制内容</button>
        </div>
        <textarea
          :value="result"
          aria-label="二维码内容"
          :placeholder="busy ? '正在识别二维码…' : '识别结果会显示在这里'"
          readonly
        ></textarea>
        <a v-if="link" :href="link" class="qr-link" @click.prevent="openLink">
          {{ link }} ↗ 默认浏览器打开
        </a>
      </section>
    </div>
  </div>
</template>
<style scoped>
/* 使用宽度与有界高度决定窗口比例，不依赖 vh，避免宿主测量反馈。 */
.qr-page {
  height: auto;
  overflow: visible;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qr-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.qr-pick {
  position: relative;
  overflow: hidden;
  display: inline-flex;
}
.qr-pick input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.qr-pick span {
  pointer-events: none;
}
.qr-pick,
.qr-actions button {
  flex: none;
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
}
.qr-status {
  min-width: 0;
  flex: 1;
  text-align: right;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qr-status.busy {
  color: var(--primary-color);
}
.qr-pane {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.qr-content {
  display: grid;
  gap: 12px;
  min-width: 0;
  height: clamp(300px, calc(100vw - 180px), 550px);
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.qr-pane-heading {
  min-height: 44px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--border-color);
}
.qr-pane-heading h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
.qr-pane-heading small {
  color: var(--text-secondary);
  font-size: 11px;
}
.qr-preview {
  flex: 1;
  min-height: 0;
  padding: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.qr-pick {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
.qr-empty svg {
  width: 42px;
  height: 42px;
  color: var(--primary-color);
}
.qr-empty small {
  font-size: 11px;
}
.qr-image {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  object-fit: contain;
  border-radius: 4px;
}
.qr-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}
.qr-result-head {
  padding-top: 5px;
  padding-bottom: 5px;
}
.qr-result textarea {
  width: 100%;
  min-height: 0;
  flex: 1;
  resize: none;
  border: 0;
  border-radius: 0;
  padding: 12px;
  font: inherit;
  line-height: 1.7;
  background: transparent;
}
.qr-result textarea::placeholder {
  color: var(--text-tertiary);
}
.qr-copy {
  font-size: 12px;
  color: var(--primary-color);
  border-color: color-mix(in srgb, var(--primary-color) 40%, var(--border-color));
  background: var(--bg-accent-light);
}
.qr-page button:hover:not(:disabled),
.qr-pick:hover {
  background: var(--bg-hover);
}
.qr-page button:focus-visible,
.qr-pick:focus-within,
.qr-result textarea:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.qr-link {
  display: block;
  max-height: 76px;
  overflow: auto;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
  overflow-wrap: anywhere;
  font-size: 12px;
}
@media (max-width: 560px) {
  .qr-pane-heading small {
    display: none;
  }
}
@media (max-width: 420px) {
  .qr-content {
    height: auto;
    grid-template-columns: minmax(0, 1fr);
  }
  .qr-pane {
    height: 230px;
  }
}
</style>
