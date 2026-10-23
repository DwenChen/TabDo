<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import OcrImageViewer from './OcrImageViewer.vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const props = defineProps({ action: { type: Object, required: true } })
const mode = ref(props.action.code === 'latex-recognize' ? 'formula' : 'ocr')
const api = window.tabdo.internal.providers
const capabilities = ref([])
const demo = ref(false)
const configuration = ref({ enabled: {}, defaultId: {}, params: {} })
const selected = ref('')
const translator = ref('')
const image = ref('')
const result = ref('')
const blocks = ref([])
const selectedText = ref('')
const translation = ref('')
const translatedSource = ref('')
const message = ref('')
const busy = ref('')
const history = ref(window.tabdo.dbStorage.getItem('provider-tools-history') || [])
const visibleHistory = computed(() =>
  history.value.filter((entry) => ['ocr', 'formula'].includes(entry.mode))
)
const choices = computed(() => enabledChoices(mode.value))
const translators = computed(() => enabledChoices('translation'))
const formulaHtml = computed(() => {
  if (mode.value !== 'formula' || !result.value) return ''
  // 仅渲染受限数学表达式，禁止 LaTeX 访问 URL、样式和 HTML 扩展。
  const source = result.value
    .trim()
    .replace(/^```(?:latex)?\s*|\s*```$/g, '')
    .replace(/^\$\$?|\$\$?$/g, '')
    .replace(/^\\\[|\\\]$/g, '')
  return katex.renderToString(source, {
    displayMode: true,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    maxExpand: 200,
    maxSize: 20
  })
})
const translationDirection = computed(() => {
  if (translator.value === 'builtin-bergamot') return '英文 → 简体中文'
  const preferences = configuration.value.params[translator.value] || {}
  const labels = {
    auto: '自动识别',
    'zh-CN': '简体中文',
    'zh-TW': '繁体中文',
    en: '英语',
    ja: '日语',
    ko: '韩语',
    fr: '法语',
    de: '德语',
    es: '西班牙语',
    ru: '俄语',
    pt: '葡萄牙语',
    it: '意大利语'
  }
  return `${labels[preferences.from || 'auto'] || preferences.from} → ${labels[preferences.to || 'zh-CN'] || preferences.to}`
})
const cleanup = new Set()
let disposed = false
let currentRequest = ''
let generation = 0
let refreshVersion = 0

/**
 * 只展示仍已启用的服务，公式能力读取自身启用配置。
 * @param group 能力分组。
 * @returns 当前可用服务。
 */
function enabledChoices(group) {
  return capabilities.value.filter(
    (entry) =>
      entry.group === group &&
      (group === 'formula'
        ? configuration.value.params[entry.id]?.enabled
        : configuration.value.enabled[group]?.includes(entry.id))
  )
}

/**
 * 同步配置并恢复有效默认值，丢弃退出或模式切换前的刷新。
 * @returns 刷新结束后的 Promise。
 */
async function refresh() {
  const version = ++refreshVersion
  const [state, settings, translations, ocrs] = await Promise.all([
    api.getBuiltinState(),
    api.getSettings(),
    api.getAll('translation'),
    api.getAll('ocr')
  ])
  if (disposed || version !== refreshVersion) return
  demo.value = state.demo === true
  capabilities.value = [
    ...state.capabilities,
    ...[...(translations.data || []), ...(ocrs.data || [])]
      .filter((entry) => entry.source === 'plugin')
      .map((entry) => ({ ...entry, group: entry.type }))
  ]
  if (settings.data) configuration.value = settings.data
  for (const [value, entries, group] of [
    [selected, choices.value, mode.value],
    [translator, translators.value, 'translation']
  ]) {
    if (!entries.some((entry) => entry.id === value.value)) {
      value.value =
        entries.find((entry) => entry.id === configuration.value.defaultId[group])?.id ||
        entries[0]?.id ||
        ''
    }
  }
}

/**
 * 立即使旧结果失效，并通知宿主取消当前请求。
 * @returns 取消结束后的 Promise。
 */
async function cancel() {
  generation++
  const request = currentRequest
  currentRequest = ''
  busy.value = ''
  if (request) await api.cancelBuiltin(request).catch(() => {})
}

/**
 * 调用服务并将取消标识绑定到本次请求。
 * @param id 服务标识。
 * @param input 能力输入。
 * @returns 服务的完整结果，含 OCR 原图坐标。
 */
async function invoke(id, input) {
  const request = crypto.randomUUID()
  currentRequest = request
  try {
    return id.startsWith('builtin-')
      ? await api.invokeBuiltin(id, input, request)
      : await window.tabdo.providers.invokeProvider(
          capabilities.value.find((entry) => entry.id === id)?.group || 'ocr',
          input,
          id
        )
  } finally {
    if (currentRequest === request) currentRequest = ''
  }
}

/**
 * 清空识别派生的文本和坐标，避免新图与旧标注混用。
 * @returns 无返回值。
 */
function clearResult() {
  result.value = ''
  blocks.value = []
  selectedText.value = ''
  translation.value = ''
  translatedSource.value = ''
  message.value = ''
}

/**
 * 识别图片并保留完整行框；只有当前操作可以写入结果及历史。
 * @returns 识别结束后的 Promise。
 */
async function execute() {
  if (busy.value || disposed) return
  if (!image.value || !selected.value) {
    message.value = !image.value ? '请先选择、拖入或粘贴图片' : '请先在“提供商”页启用识别服务'
    return
  }
  const version = ++generation
  clearResult()
  busy.value = 'recognize'
  try {
    const output = await invoke(selected.value, { image: image.value })
    if (disposed || generation !== version) return
    result.value = output.text || ''
    blocks.value = mode.value === 'ocr' && Array.isArray(output.blocks) ? output.blocks : []
    if (!result.value) {
      message.value = '未识别到文字，请调整图片后重试'
      return
    }
    // 历史只保留文本，不持久化图片或运行时坐标。
    history.value = [
      { id: crypto.randomUUID(), text: result.value, mode: mode.value, time: Date.now() },
      ...history.value
    ].slice(0, 100)
    window.tabdo.dbStorage.setItem(
      'provider-tools-history',
      JSON.parse(JSON.stringify(history.value))
    )
  } catch (failure) {
    if (!disposed && generation === version) message.value = failure.message || String(failure)
  } finally {
    if (!disposed && generation === version) busy.value = ''
  }
}

/**
 * 按翻译服务的语言设置翻译选文或全文，离线引擎保留英译中约束。
 * @returns 翻译结束后的 Promise。
 */
async function translateRecognized() {
  if (busy.value || disposed) return
  const text = (selectedText.value || result.value).trim()
  if (!text) {
    message.value = '请先识别或输入需要翻译的文字'
    return
  }
  if (!translator.value) {
    message.value = '请先在“提供商 → 翻译”启用翻译服务，再刷新配置'
    return
  }
  // 离线引擎会截断超长输入，界面先明确拒绝，避免把部分译文当作全文。
  if (translator.value === 'builtin-bergamot' && text.length > 1000) {
    message.value = '离线翻译单次最多处理 1000 个字符，请缩小选文或选择在线/AI 翻译'
    return
  }
  const version = ++generation
  busy.value = 'translate'
  message.value = ''
  translation.value = ''
  translatedSource.value = ''
  try {
    const preferences = configuration.value.params[translator.value] || {}
    const output = await invoke(translator.value, {
      text,
      from: translator.value === 'builtin-bergamot' ? 'en' : preferences.from || 'auto',
      to: translator.value === 'builtin-bergamot' ? 'zh-CN' : preferences.to || 'zh-CN'
    })
    if (disposed || generation !== version) return
    translation.value = output.text || ''
    translatedSource.value = text
    if (!translation.value) message.value = '翻译服务未返回译文，请重试'
  } catch (failure) {
    if (!disposed && generation === version) message.value = failure.message || String(failure)
  } finally {
    if (!disposed && generation === version) busy.value = ''
  }
}

/**
 * 更新图上选文并撤销已失效译文，原始识别结果保持完整。
 * @param text 图片中选中的文本，空值表示使用全部识别结果。
 * @returns 无返回值。
 */
function selectText(text) {
  if (text === selectedText.value) return
  if (busy.value === 'translate') void cancel()
  selectedText.value = text
  translation.value = ''
  translatedSource.value = ''
}

/**
 * 原文编辑或翻译渠道变化后清除旧译文。
 * @returns 无返回值。
 */
function clearTranslation() {
  if (busy.value === 'translate') void cancel()
  translation.value = ''
  translatedSource.value = ''
}

/**
 * 编辑识别结果后清除图上选区，翻译使用当前内容。
 * @returns 无返回值。
 */
function editResult() {
  selectText('')
  clearTranslation()
}

/**
 * 读取图像；换图先取消旧读取与识别，并抑制迟到结果。
 * @param file 用户选择或粘贴的图片文件。
 * @returns 文件读取结束后的 Promise。
 */
async function readImage(file) {
  if (!file || disposed) return
  if (!file.type.startsWith('image/')) {
    message.value = '请选择有效的图片文件'
    return
  }
  void cancel()
  const version = generation
  for (const release of cleanup) release()
  image.value = ''
  clearResult()
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      /**
       * 退出或换图时取消尚未完成的图像读取。
       * @returns 无返回值。
       */
      const abort = () => {
        if (reader.readyState === 1) reader.abort()
      }
      cleanup.add(abort)
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.onabort = () => reject(new Error('读取已取消'))
      reader.onloadend = () => cleanup.delete(abort)
      reader.readAsDataURL(file)
    })
    if (!disposed && generation === version) {
      image.value = data
      void execute()
    }
  } catch (failure) {
    if (!disposed && generation === version) message.value = failure.message
  }
}

/**
 * 接收用户粘贴的图片。
 * @param event 粘贴事件。
 * @returns 无返回值。
 */
function pasteImage(event) {
  const file = [...event.clipboardData.items]
    .find((item) => item.type.startsWith('image/'))
    ?.getAsFile()
  if (file) {
    event.preventDefault()
    void readImage(file)
  }
}

/**
 * 读取文件并复位输入，允许再次选择同一图片。
 * @param event 文件选择事件。
 * @returns 无返回值。
 */
function chooseFile(event) {
  void readImage(event.target.files[0])
  event.target.value = ''
}

/**
 * 切换模式前撤销旧请求与结果。
 * @param value 新的识别模式。
 * @param automatic 是否在模式切换后自动识别已有图片。
 * @returns 配置刷新完成后的 Promise。
 */
async function changeMode(value, automatic = true) {
  void cancel()
  for (const release of cleanup) release()
  mode.value = value
  selected.value = ''
  clearResult()
  await refresh()
  if (!disposed && automatic && image.value) void execute()
}

/**
 * 更换识别服务时撤销旧服务产生的结果。
 * @returns 无返回值。
 */
function changeProvider() {
  void cancel()
  clearResult()
  if (image.value) void execute()
}

/**
 * 复制或粘贴文本，完整写入链登记为必要任务。
 * @param text 输出文本。
 * @param paste 是否粘贴到外部窗口。
 * @returns 写入结束后的 Promise。
 */
async function copy(text, paste = false) {
  await window.toolsLifecycle.runTask(async () => {
    if (paste) await window.tabdo.hideMainWindowPasteText(text)
    else await window.tabdo.copyText(text)
  })
}

/**
 * 回看记录时移除当前图片，避免文本与其他图片坐标错配。
 * @param entry 已保存的识别记录。
 * @returns 刷新结束后的 Promise。
 */
async function restoreHistory(entry) {
  const pending = changeMode(entry.mode, false)
  const version = generation
  await pending
  if (!disposed && generation === version) {
    image.value = ''
    result.value = entry.text
  }
}

/**
 * 撤销请求、监听和图像引用，保留用户历史。
 * @returns 清理完成后的 Promise。
 */
async function dispose() {
  if (disposed) return
  disposed = true
  refreshVersion++
  document.removeEventListener('paste', pasteImage)
  for (const release of cleanup) release()
  cleanup.clear()
  image.value = ''
  clearResult()
  await cancel()
}
window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
onMounted(async () => {
  try {
    await refresh()
    if (disposed) return
    document.addEventListener('paste', pasteImage)
    await window.tabdo.removeSubInput()
    if (disposed) return
    const payload = props.action.payload
    if (props.action.type === 'img') image.value = payload
    else if (props.action.type === 'files' && payload?.[0]?.path)
      image.value = window.toolsProvider.readImage(payload[0].path)
    else image.value = window.toolsProvider.clipboardImage()
    if (image.value) void execute()
  } catch (failure) {
    if (!disposed) message.value = failure.message
  }
})
</script>

<template>
  <div
    class="provider-tools"
    :class="{ 'is-demo': demo }"
    @dragover.prevent
    @drop.prevent="readImage($event.dataTransfer.files[0])"
  >
    <p v-if="demo" class="demo-notice" role="status">
      教学演示 · 后台返回固定样例，当前图片未进行真实识别，无须安装模型或填写密钥。
    </p>
    <div class="recognition-stage">
      <section class="pane pane-image" aria-label="识别图片">
        <div class="pane-heading">
          <span>原始图片</span><span class="subtle">拖入或粘贴图片，自动识别</span>
        </div>
        <div class="image-canvas">
          <OcrImageViewer
            v-show="image"
            :image-src="image"
            :blocks="blocks"
            :recognized="mode === 'ocr' && !!result"
            :selected-text="selectedText"
            @select="selectText"
            @copy="copy"
          />
          <label v-if="!image" class="image-empty" for="recognition-file">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <rect x="6" y="6" width="36" height="36" rx="5" />
              <circle cx="17" cy="17" r="4" />
              <path d="m7 35 10-10 7 7 8-13 10 16" />
            </svg>
            <strong>放入一张图片</strong><span>点击选择，或拖入 / Ctrl+V 粘贴</span>
            <small>{{
              mode === 'formula'
                ? '识别数学公式，生成可编辑的 LaTeX'
                : '识别文字，支持在图片上直接选文'
            }}</small>
          </label>
        </div>
        <div class="image-actions">
          <label class="file-button" for="recognition-file"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="m3 17 6-6 4 4 3-5 5 7" /></svg
            >{{ image ? '更换图片' : '选择图片' }}</label
          ><input
            id="recognition-file"
            class="file-input"
            type="file"
            accept="image/*"
            @change="chooseFile"
          /><span>新图片会自动识别</span>
        </div>
      </section>
      <section class="pane pane-result">
        <nav aria-label="工具子组件" class="mode-switch">
          <button
            v-for="item in [
              ['ocr', '文字识别'],
              ['formula', '公式识别']
            ]"
            :key="item[0]"
            :class="{ active: mode === item[0] }"
            :aria-pressed="mode === item[0]"
            @click="changeMode(item[0])"
          >
            {{ item[1] }}
          </button>
        </nav>
        <header class="provider-toolbar">
          <select v-model="selected" aria-label="使用提供商" @change="changeProvider">
            <option v-if="!choices.length" value="">请先在提供商页启用服务</option>
            <option v-for="entry in choices" :key="entry.id" :value="entry.id">
              {{ entry.label }}
            </option></select
          ><button :disabled="!!busy" title="刷新服务配置" @click="refresh">刷新配置</button
          ><button :disabled="!!busy || !image || !selected" @click="execute">
            {{ busy === 'recognize' ? '正在识别…' : '重新识别' }}</button
          ><button v-if="busy" @click="cancel">取消</button>
        </header>
        <div class="result-scroll" :aria-busy="!!busy">
          <div
            v-if="message || busy"
            class="status-message"
            :class="{ error: message }"
            role="status"
          >
            <span v-if="busy" class="loading-dot"></span
            >{{ message || (busy === 'recognize' ? '正在识别图片，请稍候…' : '正在翻译…') }}
          </div>
          <div v-if="!result" class="result-empty">
            <span class="empty-symbol">{{ mode === 'formula' ? 'ƒ(x)' : 'Aa' }}</span
            ><strong>{{
              !choices.length
                ? '启用一个识别服务'
                : busy
                  ? '正在读取图片中的内容'
                  : '识别结果将在这里显示'
            }}</strong>
            <p>
              {{
                !choices.length
                  ? '在设置 → 提供商 → OCR 中启用所需服务，再点击刷新配置。'
                  : '选择、拖入或粘贴图片后自动开始，结果可直接编辑和复制。'
              }}
            </p>
          </div>
          <section v-else class="result">
            <div class="result-heading">
              <h3>{{ mode === 'ocr' ? '识别结果' : 'LaTeX 结果' }}</h3>
              <span class="subtle">{{ result.length }} 字符 · 可编辑</span>
            </div>
            <template v-if="mode === 'formula'"
              ><div class="section-title">公式预览</div>
              <!-- KaTeX 在 trust:false 下生成受限数学标记，不接受用户 HTML。 -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="formula-preview" aria-label="公式预览" v-html="formulaHtml"></div>
              <div class="section-title">LaTeX 源码</div></template
            >
            <textarea
              v-model="result"
              :class="{ 'latex-source': mode === 'formula' }"
              aria-label="处理结果"
              rows="8"
              spellcheck="false"
              @input="editResult"
            ></textarea>
            <div v-if="selectedText" class="selection-card">
              <label
                >图上选中文字<textarea
                  :value="selectedText"
                  aria-label="图上选中文字"
                  rows="2"
                  readonly
                ></textarea>
              </label>
              <div class="inline-actions">
                <button @click="copy(selectedText)">复制选中文字</button
                ><button @click="selectText('')">清除选区</button>
              </div>
            </div>
            <div class="result-actions">
              <button class="primary" @click="copy(result)">复制结果</button
              ><button @click="copy(result, true)">粘贴结果</button
              ><template v-if="mode === 'formula'"
                ><button @click="copy('$' + result + '$')">复制 $…$</button
                ><button @click="copy('$$' + result + '$$')">复制 $$…$$</button></template
              >
            </div>
            <div v-if="mode === 'ocr'" class="translation-actions">
              <div class="section-title">翻译{{ selectedText ? '选中文字' : '识别结果' }}</div>
              <div class="inline-actions">
                <select
                  v-model="translator"
                  aria-label="翻译提供商"
                  :disabled="!!busy"
                  @change="clearTranslation"
                >
                  <option v-if="!translators.length" value="">请先在提供商页启用翻译服务</option>
                  <option v-for="entry in translators" :key="entry.id" :value="entry.id">
                    {{ entry.label }}
                  </option></select
                ><button :disabled="!!busy" @click="translateRecognized">
                  {{ busy === 'translate' ? '正在翻译…' : '翻译' }}
                </button>
              </div>
              <p class="hint">
                {{ translationDirection }} ·
                {{ selectedText ? '使用当前图上选文' : '使用完整识别文本' }}
              </p>
            </div>
          </section>
          <section v-if="translation" class="result translation-result">
            <div class="result-heading">
              <h3>翻译结果</h3>
              <span class="subtle">{{ translationDirection }}</span>
            </div>
            <details>
              <summary>本次翻译原文</summary>
              <p class="source-text">{{ translatedSource }}</p>
            </details>
            <textarea :value="translation" aria-label="翻译结果" rows="4" readonly></textarea>
            <div class="result-actions">
              <button class="primary" @click="copy(translation)">复制译文</button
              ><button @click="copy(translation, true)">粘贴译文</button>
            </div>
          </section>
        </div>
        <details v-if="visibleHistory.length" class="history">
          <summary>最近识别记录（{{ visibleHistory.length }}）</summary>
          <div class="history-list">
            <button
              v-for="entry in visibleHistory"
              :key="entry.id || entry.time"
              class="history-item"
              @click="restoreHistory(entry)"
            >
              <span>{{ entry.mode === 'formula' ? 'ƒ' : '文' }}</span
              >{{ entry.text.slice(0, 100) }}
            </button>
          </div>
        </details>
      </section>
    </div>
  </div>
</template>
<style scoped>
.provider-tools.is-demo {
  display: flex;
  flex-direction: column;
}
.provider-tools.is-demo .recognition-stage {
  flex: 1;
  height: auto;
  min-height: 0;
}
.demo-notice {
  flex: 0 0 auto;
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.provider-tools {
  height: 100vh;
  width: 100%;
  padding: 14px;
  box-sizing: border-box;
  background: var(--bg-app);
  color: var(--text-primary);
  font: var(--tool-font);
}
.provider-tools * {
  box-sizing: border-box;
}
.recognition-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  min-height: 0;
}
.pane {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pane-image {
  background: color-mix(in srgb, var(--bg-surface) 70%, var(--bg-app));
}
.pane-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  font-weight: 500;
}
.subtle {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 400;
}
.image-canvas {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.image-empty {
  min-height: 230px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  text-align: center;
  cursor: pointer;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  padding: 18px;
}
.image-empty svg {
  width: 58px;
  height: 58px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
  opacity: 0.45;
}
.image-empty strong {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 500;
}
.image-empty small {
  font-size: 11px;
  opacity: 0.75;
}
.image-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
}
.image-actions > span {
  color: var(--text-secondary);
  font-size: 11px;
}
.file-button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
  color: var(--primary-color);
}
.file-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
button,
select,
textarea {
  font: inherit;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-surface);
  padding: 6px 10px;
}
button {
  cursor: pointer;
}
button:hover {
  background: var(--bg-hover);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.mode-switch {
  display: flex;
  margin: 12px 12px 0;
  padding: 3px;
  gap: 3px;
  border-radius: 7px;
  background: var(--bg-app);
}
.mode-switch button {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
}
.mode-switch button.active {
  color: var(--primary-color);
  background: var(--bg-surface);
  box-shadow: 0 1px 4px #0001;
  font-weight: 600;
}
.provider-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
}
.provider-toolbar select {
  flex: 1;
  min-width: 100px;
  max-width: 100%;
}
.result-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}
.result-empty {
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  color: var(--text-secondary);
}
.empty-symbol {
  font:
    36px/1.5 Georgia,
    serif;
  opacity: 0.3;
}
.result-empty strong {
  font-weight: 500;
  font-size: 14px;
}
.result-empty p {
  margin: 0;
  font-size: 12px;
  max-width: 270px;
  line-height: 1.8;
}
.result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
textarea {
  width: 100%;
  resize: vertical;
  min-height: 110px;
  line-height: 1.8;
  padding: 12px;
  background: var(--bg-app);
  display: block;
  margin-bottom: 12px;
}
.latex-source {
  font:
    13px/1.8 Consolas,
    monospace;
}
.section-title {
  color: var(--text-secondary);
  font-size: 11px;
  margin-bottom: 7px;
}
.formula-preview {
  overflow: auto;
  min-height: 110px;
  padding: 16px 12px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  margin-bottom: 14px;
  user-select: text;
}
.formula-preview :deep(.katex-display) {
  margin: 12px 0;
}
.result-actions,
.inline-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.primary {
  color: var(--primary-color);
  border-color: color-mix(in srgb, var(--primary-color) 40%, var(--border-color));
  background: var(--bg-accent-light);
}
.translation-actions {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}
.translation-actions select {
  max-width: 100%;
  flex: 1;
  min-width: 100px;
}
.hint {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.7;
  margin: 8px 0 0;
}
.selection-card {
  border-left: 2px solid var(--primary-color);
  padding-left: 10px;
  margin-bottom: 14px;
  font-size: 12px;
}
.selection-card textarea {
  min-height: 60px;
  margin-top: 5px;
}
.translation-result {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}
.source-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
}
.translation-result details {
  margin-bottom: 10px;
}
.history {
  border-top: 1px solid var(--border-color);
  padding: 10px 14px;
}
.history-list {
  max-height: 160px;
  overflow: auto;
  padding-top: 6px;
}
.history-item {
  display: flex;
  gap: 9px;
  width: 100%;
  text-align: left;
  overflow-wrap: anywhere;
  margin: 5px 0;
  font-size: 12px;
}
.history-item span {
  color: var(--primary-color);
  flex-shrink: 0;
}
.status-message {
  border-radius: 6px;
  padding: 9px 11px;
  margin-bottom: 12px;
  background: var(--bg-app);
  color: var(--text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.status-message.error {
  color: #c57836;
}
.loading-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary-color);
  margin-right: 7px;
}
.pane-image :deep(.ocr-viewer) {
  margin-top: 0;
}
.pane-image :deep(.image-viewport) {
  max-height: 55vh;
}
@media (max-width: 650px) {
  .provider-tools {
    overflow: auto;
    padding: 10px;
  }
  .recognition-stage {
    height: auto;
    min-height: 100%;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .pane-image {
    max-height: 60vh;
    min-height: 240px;
  }
  .pane-result {
    min-height: 400px;
  }
  .result-scroll {
    max-height: none;
    overflow: visible;
  }
}
</style>
