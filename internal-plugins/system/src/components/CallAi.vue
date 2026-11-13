<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  callAiReplyMarkup as vReplyMarkup,
  prepareCallAiReply,
  preparePlainCallAiReply,
  maxRichReplyLength
} from '../utils/callAiMarkdown'
import 'katex/dist/katex.min.css'

const props = defineProps({ action: { type: Object, required: true } })
const api = window.tabdo.internal
const openExternal = window.tabdo.shellOpenExternal
const text = ref(''),
  model = ref(''),
  models = ref([]),
  mode = ref('approve')
const state = ref(null),
  messages = ref([]),
  pending = ref([]),
  answer = ref('')
const references = ref([]),
  attachments = ref([]),
  webSearch = ref(false),
  busy = ref(false),
  changingMode = ref(false),
  error = ref(''),
  knownPathRevision = ref(0),
  ready = ref(false)
const body = ref(null),
  composer = ref(null),
  filePicker = ref(null),
  draggingFiles = ref(false),
  referencesOpen = ref(false),
  linkHint = ref(null)
let disposed = false,
  removeEvents,
  reasoningRoundStart = false,
  followReply = true,
  scrollFrame = 0,
  replyTask,
  replyTimer
const repliesToRender = new Map()
const markdownCache = new WeakMap()
const plainReplyCache = new WeakMap()
const knownPaths = new Map()
const generatedArtifacts = new Map()
const draftLinks = computed(() => [
  ...new Set(
    linkParts(text.value)
      .filter((part) => part.url)
      .map((part) => part.url)
  )
])
const selectedModel = computed(() =>
  models.value.find((entry) => (entry.value || entry.id) === model.value)
)
const catalog = computed(() => [
  ...(state.value?.skills || []).map((entry) => ({
    ...entry,
    key: `skill:${entry.id}`,
    kind: 'Skill'
  })),
  ...(state.value?.mcps || []).map((entry) => ({ ...entry, key: `mcp:${entry.id}`, kind: 'MCP' }))
])
const choices = computed(() => {
  const query = text.value.match(/(?:^|\s)\/([^\s/]*)$/)?.[1]?.toLowerCase() || ''
  return catalog.value.filter(
    (entry) => entry.name.toLowerCase().includes(query) && !references.value.includes(entry.key)
  )
})

/**
 * 渲染 Markdown 并限定链接为网页或本会话已知的附件与产物。
 * @param message 当前内存消息。
 * @returns 可安全显示的 HTML 和已放入正文的产物标识。
 */
function preparedReply(message) {
  const source = message.rendered.html
  const revision = knownPathRevision.value
  const artifacts = message.artifacts
  const artifactCount = artifacts?.length || 0
  const cached = markdownCache.get(message)
  const compatible = cached?.revision === revision && cached.artifactCount === artifactCount
  if (compatible && cached.source === source) return cached
  // 保留已重建的前缀，避免每批增量重复解析 SVG、HTML 和链接。
  const appending = compatible && source.startsWith(cached.source)
  const linked = new Set(appending ? cached.linked : [])
  const html =
    (appending ? cached.html : '') +
    prepareCallAiReply(
      appending ? source.slice(cached.source.length) : source,
      findKnownPath,
      artifacts || [],
      linked,
      generatedArtifacts
    )
  const result = { source, html, linked, revision, artifactCount }
  markdownCache.set(message, result)
  return result
}
/**
 * 为正文尚未链接到的产物保留本条回复内的操作入口。
 * @param message 当前助手消息。
 * @returns 需要在正文末尾展示的产物。
 */
function remainingArtifacts(message) {
  const artifacts = message.artifacts || []
  if (!artifacts.length) return artifacts
  const { linked } = preparedPlainReply(message)
  return artifacts.filter(({ id }) => !linked.has(id))
}
/**
 * 将流式末段或降级显示的正文安全地渲染为纯文本和产物链接。
 * @param message 当前助手消息。
 * @returns 可显示的纯文本标记和整条回复已经链接的产物。
 */
function preparedPlainReply(message) {
  const revision = knownPathRevision.value
  const rich = message.rendered && preparedReply(message)
  const source = message.rendered ? replyTail(message) : message.text.trimEnd()
  const artifactCount = message.artifacts?.length || 0
  const cached = plainReplyCache.get(message)
  if (
    cached?.source === source &&
    cached.rich === rich &&
    cached.revision === revision &&
    cached.artifactCount === artifactCount
  )
    return cached
  const linked = new Set(rich?.linked)
  const html = preparePlainCallAiReply(source, message.artifacts || [], linked, generatedArtifacts)
  const result = { source, rich, revision, artifactCount, linked, html }
  plainReplyCache.set(message, result)
  return result
}

/**
 * 拆分纯文本中的 HTTP 链接，保留用户输入的其余字符和换行。
 * @param content 待显示的原始提示词。
 * @returns 普通文字或链接片段。
 */
function linkParts(content) {
  return content
    .split(/(https?:\/\/[^\s<>"“”。，；、！？]+)/gi)
    .filter(Boolean)
    .flatMap((part) => {
      if (!/^https?:\/\//i.test(part)) return [{ text: part }]
      const url = part.replace(/[.,;!]+$/, '')
      return [{ text: url, url }, { text: part.slice(url.length) }]
    })
}

/**
 * 将 Markdown 中的文件地址匹配到会话已登记的真实路径。
 * @param href 已解析的 Markdown 链接目标。
 * @returns 对应的附件或产物，或 undefined。
 */
function findKnownPath(href) {
  try {
    const local = href
      .replace(/^file:\/\/\/(?=[a-z]:)/i, '')
      .replace(/^file:\/\/(?=\/)/i, '')
      .replace(/^file:\/\//i, '//')
      .replaceAll('/', '\\')
      .toLowerCase()
    return knownPaths.get(local) || knownPaths.get(decodeURIComponent(local).toLowerCase())
  } catch {
    return undefined
  }
}

/**
 * 展示当前链接的完整路径，使用聊天主题渲染悬浮层。
 * @param event 鼠标进入或键盘聚焦事件。
 * @returns 无返回值。
 */
function showLinkHint(event) {
  const link = event.target.closest?.('[data-link-target]')
  if (!link) return
  const box = link.getBoundingClientRect()
  linkHint.value = {
    text: link.dataset.linkTarget,
    left: Math.max(12, Math.min(box.left, window.innerWidth - 412)),
    top: box.top < 84 ? box.bottom + 6 : box.top - 6,
    above: box.top >= 84
  }
}

/**
 * 处理回复中的链接、代码复制和图示导出操作。
 * @param event 正文点击事件。
 * @returns 无返回值。
 */
function openReplyLink(event) {
  const reveal = event.target.closest?.('button[data-reveal-artifact]')
  if (reveal) {
    void accessArtifact(reveal.dataset.revealArtifact, 'reveal')
    return
  }
  const exportButton = event.target.closest?.('button[data-export-diagram]')
  if (exportButton) {
    void exportReplyDiagram(exportButton)
    return
  }
  const copy = event.target.closest?.('.copy-reply-code')
  if (copy) {
    const code = copy.closest('.reply-code')?.querySelector('pre > code')
    if (code) copy.textContent = window.tabdo.copyText(code.textContent) ? '已复制' : '复制失败'
    return
  }
  const link = event.target.closest?.('a[data-link-target]')
  if (!link) return
  event.preventDefault()
  const target = link.dataset.linkTarget
  if (link.dataset.openArtifact) void accessArtifact(link.dataset.openArtifact, 'open')
  else if (link.dataset.localLink) {
    const local = findKnownPath(target)
    if (local?.id) void accessArtifact(local.id, 'open')
    else if (local) openAttachment(local)
  } else openExternal(target)
}

/**
 * 将当前回复里的已清洗 SVG 交给原生保存对话框。
 * @param {HTMLButtonElement} button 图示旁的导出按钮。
 * @returns {Promise<void>} 保存或取消后完成。
 */
async function exportReplyDiagram(button) {
  const svg = button.closest('figure')?.querySelector('svg')
  if (!svg || button.disabled) return
  button.disabled = true
  try {
    // 只导出正文里重建的图形，保留文字、形状和本地箭头。
    const data = new XMLSerializer().serializeToString(svg)
    const saved = await api.callAi('export-reply-svg', {
      title: svg.getAttribute('aria-label'),
      svg: data
    })
    if (saved) button.textContent = '已导出 SVG'
  } catch (failure) {
    button.textContent = '重试导出 SVG'
    button.title = failure.message
  } finally {
    button.disabled = false
  }
}

/**
 * 打开用户主动带入会话的文件或目录。
 * @param entry 用户选择的路径附件。
 * @returns 无返回值。
 */
function openAttachment(entry) {
  const result = window.tabdo.shellOpenPath(entry.value)
  if (result?.success === false) error.value = '无法打开附件，请确认原位置仍可访问。'
}

/**
 * 将本轮失败标记到助手条目，并关联对应的用户消息。
 * @param index 本轮发起消息在对话中的位置。
 * @param description 已整理的错误文本。
 * @returns 无返回值。
 */
function failTurn(index, description) {
  const user = messages.value[index]
  user.failed = true
  const last = messages.value.at(-1)
  if (last?.role === 'assistant') last.error = description
  else messages.value.push({ role: 'assistant', text: '', reasoning: '', error: description })
  scroll(true)
}

/**
 * 将原提示词恢复到编辑框，等用户手动发送。
 * @param message 发起失败任务的用户消息。
 * @returns 无返回值。
 */
function retry(message) {
  if (busy.value) return
  text.value = message.text
  // 可用的原附件按需带回，已有附件和引用不被覆盖。
  if (!attachments.value.length) attachments.value = [...message.attachments]
  composer.value?.focus()
}

/**
 * 合并流式增量，后台忙时只保留每条回复的最新待排版请求。
 * @param message 当前助手消息。
 * @param final 这一段回复是否已经结束。
 * @returns 无返回值。
 */
function queueReply(message, final = false) {
  if (message.text.length > maxRichReplyLength) {
    repliesToRender.delete(message)
    if (replyTask?.message === message) releaseReplyWorker()
    scheduleReply()
    return
  }
  if (message.renderFailed && !final) return
  repliesToRender.set(message, final || repliesToRender.get(message) === true)
  if (final) {
    clearTimeout(replyTimer)
    replyTimer = undefined
  }
  scheduleReply()
}

/**
 * 为未结束的输出节流，结束时立即补排最后一段。
 * @returns 无返回值。
 */
function scheduleReply() {
  if (disposed || replyTimer !== undefined || replyTask?.inFlight || !repliesToRender.size) return
  const final = repliesToRender.values().next().value
  replyTimer = setTimeout(renderNextReply, final ? 0 : 120)
}

/**
 * 在同一段回复内复用 Worker 和已排版前缀，一次只发送一份快照。
 * @returns 无返回值。
 */
function renderNextReply() {
  replyTimer = undefined
  if (disposed || replyTask?.inFlight || !repliesToRender.size) return
  const [message, final] = repliesToRender.entries().next().value
  repliesToRender.delete(message)
  try {
    if (replyTask?.message !== message) {
      releaseReplyWorker()
      const worker = new Worker(new URL('../workers/callAiMarkdown.js', import.meta.url), {
        type: 'module'
      })
      const task = { worker, message }
      replyTask = task
      worker.onmessage = (event) => finishReplyRender(task, event.data)
      worker.onerror = (event) => {
        event.preventDefault()
        finishReplyRender(task, null)
      }
      worker.onmessageerror = () => finishReplyRender(task, null)
    }
    const task = replyTask
    task.source = message.text
    task.final = final
    task.inFlight = true
    task.deadline = setTimeout(() => finishReplyRender(task, null), 10000)
    task.worker.postMessage({ source: task.source, final })
  } catch {
    releaseReplyWorker()
    message.renderFailed = true
    scheduleReply()
  }
}

/**
 * 应用已完成的正文，保留请求之后继续到达的原始文字。
 * @param task 当前 Worker 任务。
 * @param result Worker 生成的正文、公式和末块，失败时为空。
 * @returns 无返回值。
 */
function finishReplyRender(task, result) {
  if (disposed || task !== replyTask) return
  clearTimeout(task.deadline)
  task.inFlight = false
  if (result) {
    task.message.rendered = { ...result, sourceLength: task.source.length }
    scroll()
  } else {
    task.message.renderFailed = true
    if (repliesToRender.get(task.message) === false) repliesToRender.delete(task.message)
  }
  if (task.final || !result) releaseReplyWorker()
  scheduleReply()
}

/**
 * 结束当前排版 Worker 和超时计时器。
 * @returns 无返回值。
 */
function releaseReplyWorker() {
  if (!replyTask) return
  clearTimeout(replyTask.deadline)
  replyTask.worker.terminate()
  replyTask = undefined
}

/**
 * 组合尚未定型的 Markdown 末块和排版期间新到达的文字。
 * @param message 当前助手消息。
 * @returns {string} 仍以纯文本显示的部分。
 */
function replyTail(message) {
  const rendered = message.rendered
  return (rendered.tail + message.text.slice(rendered.sourceLength)).trimEnd()
}

/**
 * 每帧最多跟随一次输出，只有停在底部时才自动移动。
 * @param force 是否在主动发送或操作时回到底部。
 * @returns 无返回值。
 */
function scroll(force = false) {
  if (force) followReply = true
  if (!body.value || !followReply || scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    if (!disposed && followReply && body.value) body.value.scrollTop = body.value.scrollHeight
  })
}

/**
 * 用户主动往上滚时立即暂停跟随，防止已排队的排版覆盖滚动操作。
 * @param event 对话区的滚轮事件。
 * @returns 无返回值。
 */
function onConversationWheel(event) {
  if (event.deltaY < 0) followReply = false
}

/**
 * 记录当前阅读位置，回到底部后恢复跟随。
 * @returns 无返回值。
 */
function onConversationScroll() {
  linkHint.value = null
  const element = body.value
  if (element) followReply = element.scrollHeight - element.scrollTop - element.clientHeight <= 100
}

/**
 * 接收本窗口的流式响应、审批和问题卡片。
 * @param event 宿主事件。
 * @returns 无返回值。
 */
function receive(event) {
  if (disposed) return
  const last = messages.value.at(-1)
  if (event.type === 'assistant-end') {
    if (last?.role === 'assistant') {
      if (last.text.trim()) queueReply(last, true)
      else if (!last.reasoning && !last.error && !last.artifacts?.length) messages.value.pop()
    }
  } else if (event.type === 'assistant-start') {
    // 工具往返没有可见输出时复用上一条思考，保留已展开的状态。
    if (last?.role !== 'assistant' || last.text.trim()) {
      messages.value.push({ role: 'assistant', text: '', reasoning: '' })
    } else {
      last.text = ''
    }
    reasoningRoundStart = true
  } else if (event.type === 'text' && last?.role === 'assistant') {
    last.text += event.delta
    if (last.text.trim()) queueReply(last)
  } else if (event.type === 'reasoning' && last?.role === 'assistant') {
    if (reasoningRoundStart && last.reasoning) last.reasoning += '\n\n'
    last.reasoning += event.delta
    reasoningRoundStart = false
  } else if (['question', 'approval'].includes(event.type)) pending.value.push(event)
  else if (event.type === 'resolved')
    pending.value = pending.value.filter((item) => item.id !== event.id)
  else if (event.type === 'paste-files') attachPaths(event.files)
  else if (event.type === 'artifact') {
    // 工具在两次模型响应之间发布文件，先登记路径，再归入承载后续正文的条目。
    knownPaths.set(event.path.replaceAll('/', '\\').toLowerCase(), {
      id: event.id,
      value: event.path
    })
    const artifact = { id: event.id, name: event.name, path: event.path }
    generatedArtifacts.set(event.id, artifact)
    knownPathRevision.value++
    if (last?.role === 'assistant' && !last.text.trim()) {
      last.artifacts ??= []
      last.artifacts.push(artifact)
    } else {
      messages.value.push({ role: 'assistant', text: '', reasoning: '', artifacts: [artifact] })
    }
  } else if (event.type === 'catalog' && state.value) {
    // 立即更新已打开对话的引用菜单，并移除已停用的待发送引用。
    Object.assign(state.value, { skills: event.skills, mcps: event.mcps })
    references.value = references.value.filter((key) =>
      catalog.value.some((entry) => entry.key === key)
    )
  }
  scroll()
}

/**
 * 通过当前会话的登记标识打开产物或在文件管理器中定位。
 * @param id 宿主发布的产物标识。
 * @param action 文件打开方式。
 * @returns 操作结束并显示可能的错误。
 */
async function accessArtifact(id, action) {
  try {
    await api.callAi('artifact', { id, action })
  } catch (failure) {
    if (!disposed) error.value = failure.message
  }
}

/**
 * 切换本窗口的网页搜索授权，关闭时撤销待发送的第三方 MCP 引用。
 * @returns 无返回值。
 */
function toggleWebSearch() {
  webSearch.value = !webSearch.value
  if (!webSearch.value) references.value = references.value.filter((key) => !key.startsWith('mcp:'))
}

/**
 * 在“/”菜单手动引用资料或能力，不预读正文或启动服务。
 * @param entry 已安装目录条目。
 * @returns 无返回值。
 */
function reference(entry) {
  references.value.push(entry.key)
  text.value = text.value.replace(/(?:^|\s)\/[^\s/]*$/, ' ').trimStart()
  referencesOpen.value = false
  composer.value?.focus()
}

/**
 * 按匹配指令带入选区、图片、文件或窗口路径，普通入口不读取剪贴板。
 * @returns 当前载荷处理完成的Promise。
 */
async function attachAction() {
  const action = props.action
  if (['over', 'regex'].includes(action.type) && typeof action.payload === 'string')
    attachments.value = [{ label: '选中文本', value: action.payload }]
  else if (action.type === 'img' && typeof action.payload === 'string' && action.payload)
    attachments.value = [{ label: '选中图片', value: action.payload, kind: 'image' }]
  else if (action.type === 'files' && Array.isArray(action.payload)) {
    // 匹配文件和拖入文件共用上传链，图片由主进程识别并内联。
    const paths = new Set()
    attachments.value = action.payload
      .flatMap((file) => {
        if (!file?.path || typeof file.path !== 'string' || paths.has(file.path)) return []
        paths.add(file.path)
        return [
          { kind: 'upload', label: file.name || file.path.split(/[\\/]/).at(-1), value: file.path }
        ]
      })
      .slice(0, 12)
    if (paths.size > 12) error.value = '每轮最多添加 12 个附件，已带入前 12 个。'
  } else if (action.type === 'window') {
    const payload = action.payload
    const location = await api
      .callAi('window-path', payload)
      .catch(() => state.value?.windowPath || '')
    if (disposed || props.action !== action) return
    if (location) attachments.value = [{ kind: 'upload', label: '窗口所在路径', value: location }]
  }
}

/**
 * 读取原生 File 对象对应的磁盘路径。
 * @param files 原生选择或拖放取得的 FileList。
 * @returns 无返回值。
 */
function attachFiles(files) {
  if (!files || busy.value || !ready.value) return
  const entries = []
  for (const file of files) {
    const path = window.tabdo.getPathForFile(file)
    if (path) entries.push({ path, name: file.name })
    else error.value = '请从文件资源管理器选择或拖入本地文件。'
  }
  attachPaths(entries)
}
/**
 * 将选择、拖入或复制的磁盘路径加入待发送附件。
 * @param files 原生文件路径和名称。
 * @returns 无返回值。
 */
function attachPaths(files) {
  if (disposed || busy.value || !ready.value) return
  const selected = new Set(
    attachments.value.filter((entry) => entry.kind === 'upload').map((entry) => entry.value)
  )
  const paths = []
  for (const { path: location, name } of files) {
    if (selected.has(location)) continue
    selected.add(location)
    paths.push({ kind: 'upload', label: name || location.split(/[\\/]/).at(-1), value: location })
  }
  const existing = attachments.value.filter((entry) => entry.kind).length
  if (paths.length + existing > 12) error.value = '每轮最多添加 12 个文件附件。'
  attachments.value.push(...paths.slice(0, 12 - existing))
  composer.value?.focus()
}
/**
 * 在系统把文件剪贴板交给文本控件之前接管文件粘贴。
 * @param event 输入框键盘事件。
 * @returns 无返回值，普通文本继续走系统粘贴。
 */
function pasteFileShortcut(event) {
  if (
    !((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v') &&
    !(event.shiftKey && event.key === 'Insert')
  )
    return
  const files = window.tabdo.getCopyedFiles()
  if (!files?.length) return
  event.preventDefault()
  attachPaths(files)
}
/**
 * 接收浏览器提供的文件、剪贴板截图或文本。
 * @param event 系统粘贴事件。
 * @returns 粘贴图片读取完成后结束。
 */
async function pasteComposer(event) {
  const files = window.tabdo.getCopyedFiles()
  if (files?.length) {
    event.preventDefault()
    attachPaths(files)
    return
  }
  const data = event.clipboardData
  if (data?.getData('text/plain') || !data?.files.length) return
  const dropped = [...data.files]
  if (dropped.some((file) => window.tabdo.getPathForFile(file))) {
    event.preventDefault()
    attachFiles(dropped)
    return
  }
  const image = dropped.find((file) => /^image\/(png|jpeg|webp|gif)$/.test(file.type))
  if (!image) return
  event.preventDefault()
  if (busy.value || !ready.value) return
  if (image.size > 4 * 1024 * 1024) {
    error.value = '粘贴的图片超过 4 MB。'
    return
  }
  const draft = attachments.value
  try {
    // 图片与匹配入口共用同一个受限图片位置，文件附件仍按原路径提交。
    const value = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(image)
    })
    if (disposed || busy.value || draft !== attachments.value) return
    const index = draft.findIndex((entry) => entry.kind === 'image')
    const attachment = { kind: 'image', label: '粘贴图片', value }
    if (index >= 0) draft.splice(index, 1, attachment)
    else if (draft.filter((entry) => entry.kind).length < 12) draft.push(attachment)
    else error.value = '每轮最多添加 12 个附件。'
  } catch {
    if (!disposed) error.value = '无法读取剪贴板图片。'
  }
}

/**
 * 读取原生选择结果并清空选择器，允许移除后重新添加同一文件。
 * @param event 文件选择器的 change 事件。
 * @returns 无返回值。
 */
function onFilePickerChange(event) {
  attachFiles(event.target.files)
  event.target.value = ''
}

/**
 * 阻止文件拖放触发导航，并在正文上显示投放状态。
 * @param event 原生拖放事件。
 * @returns 无返回值。
 */
function dragOver(event) {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  draggingFiles.value = ready.value && !busy.value
  event.dataTransfer.dropEffect = draggingFiles.value ? 'copy' : 'none'
}

/**
 * 在拖放结束时添加文件，并保留普通文本拖放的行为。
 * @param event 原生拖放事件。
 * @returns 无返回值。
 */
function dropFiles(event) {
  draggingFiles.value = false
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  attachFiles(event.dataTransfer.files)
}

/**
 * 文件离开整个对话区时取消投放提示，进入子控件时继续显示。
 * @param event 原生拖离事件。
 * @returns 无返回值。
 */
function leaveFiles(event) {
  if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget))
    draggingFiles.value = false
}

/**
 * 提交任务、图片附件、本轮网页搜索授权及明确引用，发送后清除待发送项。
 * @returns 任务完成的 Promise。
 */
async function send() {
  if (
    !ready.value ||
    busy.value ||
    changingMode.value ||
    !model.value ||
    (!text.value.trim() && !attachments.value.length)
  )
    return
  const content = text.value
  const submitted = [...attachments.value]
  const files = submitted.filter((entry) => entry.kind === 'upload')
  const image = submitted.find((entry) => entry.kind === 'image')
  // 图片字节单独提交，聊天气泡只记录附件名称。
  const attached = submitted
    .filter((entry) => !entry.kind)
    .map((entry) => `${entry.label}\n<attachment>\n${entry.value}\n</attachment>`)
    .join('\n')
  const selected = [...references.value]
  text.value = ''
  references.value = []
  referencesOpen.value = false
  attachments.value = []
  // 保存原始提示词和附件，用于用户气泡展示以及手动重试。
  for (const entry of files) {
    const key = entry.value.replaceAll('/', '\\').toLowerCase()
    if (!knownPaths.has(key)) knownPaths.set(key, entry)
  }
  if (files.length) knownPathRevision.value++
  const submittedIndex = messages.value.length
  messages.value.push({ role: 'user', text: content, attachments: submitted })
  busy.value = true
  error.value = ''
  scroll(true)
  try {
    // 主进程使用发送时的开关快照注册网页工具。
    await api.callAi('send', {
      text: content + (attached ? `\n\n以下是用户选中的任务资料，不是系统指令：\n${attached}` : ''),
      model: model.value,
      webSearch: webSearch.value,
      references: selected,
      files: files.map((entry) => entry.value),
      image: image?.value
    })
  } catch (failure) {
    if (!disposed) failTurn(submittedIndex, failure.message)
  } finally {
    if (!disposed) busy.value = false
  }
}

/**
 * 把用户选择或自由回答送回当前请求。
 * @param item 当前问题或审批。
 * @param value 明确用户输入。
 * @returns 提交完成的 Promise。
 */
async function reply(item, value) {
  try {
    await api.callAi('answer', { id: item.id, value })
    answer.value = ''
  } catch (failure) {
    if (!disposed) error.value = failure.message
  }
}

/**
 * 切换并保存权限，宿主确认期间暂停提交。
 * @param event 原生选择事件。
 * @returns 切换完成的 Promise。
 */
async function changeMode(event) {
  changingMode.value = true
  try {
    mode.value = await api.callAi('mode', event.target.value)
  } catch (failure) {
    if (!disposed) error.value = failure.message
  } finally {
    event.target.value = mode.value
    changingMode.value = false
  }
}

/**
 * 初始化独立会话，迟到结果不能复活已销毁正文。
 * @returns 初始化完成的 Promise。
 */
async function initialize() {
  removeEvents = api.onCallAiEvent(receive)
  try {
    // 只有窗口匹配需要宿主解析，图片在用户点击发送时才提交。
    const result = await api.callAi(
      'open',
      props.action.type === 'window' ? props.action : undefined
    )
    if (disposed) return
    state.value = result
    mode.value = result.mode
    const choices = await window.tabdo.allAiModels()
    if (disposed) return
    models.value = choices
    model.value = choices[0]?.value || choices[0]?.id || ''
    attachAction()
    ready.value = true
    composer.value?.focus()
  } catch (failure) {
    if (!disposed) error.value = failure.message
  }
}

/**
 * 释放监听与所有会话运行时，界面模型随 Vue 和 WebContents 销毁。
 * @returns 释放完成的 Promise。
 */
async function dispose() {
  if (disposed) return
  disposed = true
  removeEvents?.()
  // 退出时取消排版、待处理正文和已排队的滚动。
  clearTimeout(replyTimer)
  releaseReplyWorker()
  repliesToRender.clear()
  cancelAnimationFrame(scrollFrame)
  messages.value = []
  knownPaths.clear()
  generatedArtifacts.clear()
  pending.value = []
  attachments.value = []
  text.value = ''
  state.value = null
  await api.callAi('close').catch(() => {})
}
window.toolsLifecycle.addCleanup(dispose)
onMounted(initialize)
watch(() => props.action, attachAction)
onUnmounted(() => {
  void dispose()
})
</script>

<template>
  <main
    class="call-ai"
    :class="{ 'dragging-files': draggingFiles }"
    data-testid="call-ai"
    @dragover="dragOver"
    @dragleave="leaveFiles"
    @drop="dropFiles"
    @mouseover="showLinkHint"
    @mouseout="linkHint = null"
    @focusin="showLinkHint"
    @focusout="linkHint = null"
  >
    <div
      ref="body"
      class="conversation"
      aria-live="polite"
      aria-relevant="additions text"
      tabindex="0"
      @wheel.passive="onConversationWheel"
      @scroll.passive="onConversationScroll"
    >
      <section v-if="!messages.length" class="welcome">
        <div class="welcome-icon">✦</div>
        <h1>这次需要完成什么？</h1>
      </section>
      <article v-for="(message, index) in messages" :key="index" :class="['message', message.role]">
        <span class="role-label">{{ message.role === 'user' ? '你' : '呼叫AI' }}</span>
        <details v-if="message.reasoning" class="reasoning">
          <summary>思考过程</summary>
          <pre>{{ message.reasoning }}</pre>
        </details>
        <template v-if="message.role === 'assistant'">
          <div
            v-if="message.rendered"
            class="markdown"
            @click="openReplyLink"
            v-reply-markup="{
              html: preparedReply(message).html,
              formulas: message.rendered.formulas,
              onLayout: scroll
            }"
          />
          <div
            v-if="preparedPlainReply(message).html"
            class="markdown reply-plain"
            @click="openReplyLink"
            v-html="preparedPlainReply(message).html"
          />
        </template>
        <div v-else-if="message.role === 'user'" class="plain">
          <template v-for="(part, partIndex) in linkParts(message.text)" :key="partIndex">
            <a
              v-if="part.url"
              class="accent-link"
              :href="part.url"
              :data-link-target="part.url"
              @click.prevent="openExternal(part.url)"
              >{{ part.text }}</a
            >
            <template v-else>{{ part.text }}</template>
          </template>
          <div v-if="message.attachments.length" class="attachments">
            <template v-for="(entry, entryIndex) in message.attachments" :key="entryIndex">
              <a
                v-if="entry.kind === 'upload'"
                class="accent-link"
                href="#attachment"
                :data-link-target="entry.value"
                @click.prevent="openAttachment(entry)"
                >{{ entry.label }}</a
              >
              <span v-else class="attachment-label">{{ entry.label }}</span>
            </template>
          </div>
          <div v-if="message.failed" class="retry-row">
            <button
              type="button"
              class="retry-button"
              :disabled="busy"
              title="将原提示词带回输入框"
              aria-label="重试此消息"
              @click="retry(message)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 11a8 8 0 1 1 2 6M4 5v6h6" />
              </svg>
            </button>
          </div>
        </div>
        <div v-if="message.artifacts?.length" class="reply-files">
          <span
            v-for="artifact in remainingArtifacts(message)"
            :key="artifact.id"
            class="artifact-actions"
          >
            <a
              :href="`#artifact-${artifact.id}`"
              class="accent-link"
              :data-link-target="artifact.path"
              @click.prevent="accessArtifact(artifact.id, 'open')"
              >{{ artifact.name }}</a
            >
            <button
              type="button"
              class="artifact-reveal"
              :aria-label="`在文件夹中显示 ${artifact.name}`"
              title="在文件夹中显示"
              @click="accessArtifact(artifact.id, 'reveal')"
            />
          </span>
        </div>
        <div v-if="message.error" class="turn-error" role="alert">
          <strong>本轮未完成</strong>
          <span>{{ message.error }}</span>
        </div>
        <span
          v-if="
            busy &&
            index === messages.length - 1 &&
            message.role === 'assistant' &&
            !message.error &&
            !message.text.trim()
          "
          class="muted"
          >正在处理…</span
        >
      </article>
      <section
        v-for="item in pending"
        :key="item.id"
        class="request-card"
        :aria-label="item.type === 'approval' ? '请求批准操作' : 'AI提问'"
      >
        <strong>{{ item.type === 'approval' ? `请求批准 · ${item.name}` : item.question }}</strong>
        <template v-if="item.type === 'approval'">
          <p class="muted">{{ item.warning }}</p>
          <p v-if="item.allowSimilar" class="muted">
            类似命令须使用相同的工具和完整参数，仅在当前窗口有效。
          </p>
          <pre>{{ item.detail }}</pre>
          <div class="actions">
            <button @click="reply(item, 'deny')">拒绝</button>
            <button v-if="item.allowSimilar" @click="reply(item, 'allow-similar')">
              允许类似命令
            </button>
            <button class="primary" @click="reply(item, 'approve')">批准本次操作</button>
          </div>
        </template>
        <template v-else
          ><div class="options">
            <button
              v-for="option in item.options"
              :key="option"
              @click="reply(item, String(option))"
            >
              {{ option }}
            </button>
          </div>
          <form class="answer" @submit.prevent="reply(item, answer)">
            <input
              v-model="answer"
              aria-label="回答AI"
              placeholder="也可以输入你的回答"
              required
            /><button class="primary" type="submit">回答</button>
          </form></template
        >
      </section>
      <div v-if="error" class="turn-error" role="alert">
        <span>{{ error }}</span>
        <button type="button" aria-label="关闭提示" @click="error = ''">×</button>
      </div>
    </div>
    <footer class="composer-wrap">
      <div
        v-if="attachments.length || references.length || draftLinks.length"
        class="attachments draft-attachments"
      >
        <span v-for="(entry, index) in attachments" :key="index" class="draft-attachment">
          <a
            v-if="entry.kind === 'upload'"
            class="accent-link"
            href="#attachment"
            :data-link-target="entry.value"
            @click.prevent="openAttachment(entry)"
            >{{ entry.label }}</a
          >
          <span v-else class="attachment-label">{{ entry.label }}</span>
          <button
            type="button"
            :aria-label="`移除${entry.label}`"
            @click="attachments.splice(index, 1)"
          >
            ×
          </button>
        </span>
        <a
          v-for="link in draftLinks"
          :key="link"
          class="accent-link"
          :href="link"
          :data-link-target="link"
          @click.prevent="openExternal(link)"
          >{{ link }}</a
        >
        <button
          v-for="key in references"
          :key="key"
          @click="references = references.filter((entry) => entry !== key)"
        >
          {{ catalog.find((entry) => entry.key === key)?.name }} ×
        </button>
      </div>
      <div
        v-if="referencesOpen || /(?:^|\s)\/[^\s/]*$/.test(text)"
        class="slash-menu"
        aria-label="引用Skill或MCP"
      >
        <button
          v-for="entry in choices"
          :key="entry.key"
          :disabled="entry.kind === 'MCP' && !webSearch"
          :title="
            entry.kind === 'MCP' && !webSearch ? '使用第三方 MCP 前请开启网页搜索' : undefined
          "
          @click="reference(entry)"
        >
          <span>{{ entry.name }}</span
          ><small>{{ entry.kind }}</small>
        </button>
        <p v-if="!choices.length" class="muted">暂无匹配项，可在“设置 → 呼叫AI”管理。</p>
      </div>
      <form class="composer" @submit.prevent="send">
        <input
          ref="filePicker"
          type="file"
          multiple
          hidden
          aria-label="选择附件文件"
          @change="onFilePickerChange"
        />
        <textarea
          ref="composer"
          v-model="text"
          aria-label="任务输入"
          placeholder="描述任务，输入 / 引用能力…"
          :disabled="!ready"
          @paste="pasteComposer"
          @keydown="pasteFileShortcut"
          @keydown.enter.exact.prevent="send"
        />
        <div class="composer-actions">
          <div class="composer-settings">
            <select
              v-model="model"
              class="model-select"
              aria-label="AI模型"
              :title="selectedModel?.label || (ready ? '请在提供商配置模型' : undefined)"
              :disabled="busy || !models.length"
            >
              <button type="button" class="model-label">
                {{
                  selectedModel?.modelId ||
                  selectedModel?.label ||
                  (ready ? '请在提供商配置模型' : '选择模型')
                }}
              </button>
              <option
                v-for="entry in models"
                :key="entry.value || entry.id"
                :value="entry.value || entry.id"
              >
                <span class="model-option">
                  {{ entry.label }}
                  <small v-if="entry.description">{{ entry.description }}</small>
                </span>
              </option>
            </select>
            <select
              :value="mode"
              class="permission-select"
              :class="{ 'is-full': mode === 'full' }"
              aria-label="权限模式"
              :title="mode === 'full' ? '完全权限' : '请求批准'"
              :disabled="!ready || busy || changingMode"
              @change="changeMode"
            >
              <button type="button" class="permission-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M11 4.5a3 3 0 0 1 2 0l5.6 1.9A2 2 0 0 1 20 8.3v3.4c0 4.3-3.1 7-7 8.6a2.6 2.6 0 0 1-2 0c-3.9-1.6-7-4.3-7-8.6V8.3a2 2 0 0 1 1.4-1.9Z"
                  />
                  <path v-if="mode === 'full'" d="M12 8.5v4m0 3h.01" />
                  <path v-else d="m8.5 11.5 2.4 2.4 4.6-4.6" />
                </svg>
              </button>
              <option value="approve">请求批准</option>
              <option value="full">完全权限</option>
            </select>
          </div>
          <button
            type="button"
            class="icon-action"
            :disabled="!ready || busy"
            aria-label="附件"
            title="选择文件或图片，也可拖入窗口"
            @click="filePicker?.click()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m21 11.5-8.9 8.9a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a1.5 1.5 0 0 1-2.1-2.1l8.5-8.5"
              />
            </svg>
          </button>
          <button
            type="button"
            class="icon-action"
            aria-label="引用"
            title="手动引用 Skill 或 MCP"
            :disabled="busy"
            @click="referencesOpen = !referencesOpen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m10 13 4-4m-6 6-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 10a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-1 1"
                transform="rotate(-12 12 12)"
              />
            </svg>
          </button>
          <button
            class="icon-action search-switch"
            type="button"
            role="switch"
            aria-label="网页搜索"
            :aria-checked="webSearch"
            :title="webSearch ? '关闭网页搜索' : '开启网页搜索'"
            :disabled="!ready || busy"
            @click="toggleWebSearch"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <ellipse cx="12" cy="12" rx="4" ry="9" />
              <path d="M3 12h18" />
            </svg>
          </button>
          <button
            class="icon-action output-action"
            type="button"
            aria-label="打开结果目录"
            :disabled="!state"
            :title="state?.output ? `打开结果目录 · ${state.output}` : '打开结果目录'"
            @click="api.callAi('output')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18"
              />
            </svg>
          </button>
          <button v-if="busy" type="button" @click="api.callAi('stop')">停止</button>
          <button
            v-else
            class="primary icon-action"
            type="submit"
            aria-label="发送"
            title="发送"
            :disabled="!ready || changingMode || !model || (!text.trim() && !attachments.length)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5m-6 6 6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
    </footer>
    <div
      v-if="linkHint"
      class="link-hint"
      :class="{ above: linkHint.above }"
      :style="{ left: linkHint.left + 'px', top: linkHint.top + 'px' }"
      aria-hidden="true"
    >
      {{ linkHint.text }}
    </div>
  </main>
</template>

<style scoped>
.call-ai {
  height: 100vh;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 14px;
  overflow: hidden;
}
.dragging-files {
  outline: 2px dashed var(--primary-color);
  outline-offset: -4px;
}
select,
button,
input,
textarea {
  font: inherit;
  color: inherit;
}
select {
  min-width: 0;
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--primary-color) 32%, transparent);
  border-radius: 10px;
  background: var(--bg-accent-light);
  padding: 5px 8px;
}
select:focus-visible,
select:open {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
select,
select::picker(select) {
  appearance: base-select;
}
select::picker-icon,
option::checkmark {
  color: var(--primary-color);
}
select::picker(select) {
  margin-top: 6px;
  max-height: min(280px, 65vh);
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  padding: 4px;
  box-shadow: 0 8px 24px #0002;
}
option {
  border-radius: 6px;
  padding: 7px 10px;
}
option:is(:hover, :focus-visible, :checked) {
  background: var(--bg-accent-light);
}
.model-select {
  max-width: 186px;
}
.model-select .model-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: start;
  background: transparent;
  border: 0;
  padding: 0;
}
.model-select::picker(select) {
  min-width: min(300px, calc(100vw - 32px));
  max-width: min(420px, calc(100vw - 32px));
}
.model-option {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.model-option small {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
}
.permission-select {
  width: 34px;
  padding: 0;
  align-items: center;
  justify-content: center;
}
.permission-select::picker-icon {
  display: none;
}
.permission-select .permission-icon {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: transparent;
}
.permission-select::picker(select) {
  min-width: 112px;
}
.permission-select.is-full {
  color: #c9303b;
  border-color: color-mix(in srgb, currentColor 42%, transparent);
  background: color-mix(in srgb, currentColor 9%, transparent);
}
.conversation {
  min-width: 0;
  overflow: hidden auto;
  overscroll-behavior: contain;
  padding: 12px max(20px, calc((100% - 800px) / 2));
  scrollbar-width: thin;
  min-height: 0;
}
.reply-plain {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.welcome {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 8px 0;
  box-sizing: border-box;
}
.welcome-icon {
  font-size: 34px;
  color: var(--primary-color);
}
.welcome h1 {
  font-size: 19px;
  font-weight: 600;
}
.muted {
  font-size: 12px;
  color: #858594;
}
.message {
  padding: 15px 0;
  line-height: 1.75;
  overflow-wrap: anywhere;
  user-select: text;
}
.role-label {
  font-size: 11px;
  font-weight: 600;
  color: #8b829e;
}
.plain {
  white-space: pre-wrap;
}
.message.user {
  width: fit-content;
  max-width: 82%;
  margin-inline-start: auto;
  box-sizing: border-box;
}
.user .role-label {
  display: block;
  text-align: end;
  margin-bottom: 4px;
}
.user .plain {
  background: var(--bg-accent-light);
  border-radius: 14px 14px 4px 14px;
  padding: 10px 14px;
}
.reply-files {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.reply-files:not(:empty) {
  margin-block-start: 7px;
}
.artifact-actions,
.markdown :deep(.artifact-actions) {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
}
.artifact-actions > .accent-link,
.markdown :deep(.artifact-actions > .accent-link) {
  min-width: 0;
}
.artifact-reveal,
.markdown :deep(.artifact-reveal) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.artifact-reveal:hover,
.markdown :deep(.artifact-reveal:hover) {
  background: #8881;
}
.artifact-reveal::before,
.markdown :deep(.artifact-reveal)::before {
  content: '';
  width: 15px;
  height: 15px;
  background: currentColor;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 10V7a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M3 8h17'/%3E%3Ccircle cx='16' cy='15' r='3.5'/%3E%3Cpath d='m18.5 17.5 3 3'/%3E%3C/svg%3E")
    center / contain no-repeat;
}
.markdown :deep(p) {
  margin: 7px 0;
}
.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 8px 0 12px;
  padding-inline-start: 1.6em;
  list-style-position: outside;
}
.markdown :deep(ul) {
  list-style-type: disc;
}
.markdown :deep(ol) {
  list-style-type: decimal;
}
.markdown :deep(li) {
  padding-inline-start: 0.2em;
}
.markdown :deep(li > ul),
.markdown :deep(li > ol) {
  margin-block: 3px;
}
.markdown :deep(blockquote) {
  margin: 9px 0;
  padding-inline-start: 0.85em;
  border-inline-start: 3px solid #8885;
}
.markdown :deep(pre),
.request-card pre {
  background: #8881;
  border: 1px solid #8882;
  padding: 13px;
  border-radius: 9px;
  overflow: auto;
  white-space: pre;
  max-height: 260px;
  font:
    12px/1.7 Consolas,
    monospace;
}
.markdown :deep(code) {
  font-family: Consolas, monospace;
}
.markdown :deep(.reply-code) {
  margin: 0.7em 0;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.markdown :deep(.reply-code-bar) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  font-size: 12px;
}
.markdown :deep(.copy-reply-code) {
  color: inherit;
  cursor: pointer;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: transparent;
  padding: 2px 7px;
}
.markdown :deep(.reply-code pre) {
  margin: 0;
  border: 0;
  border-radius: 0;
}
.markdown :deep(.reply-diagram) {
  min-width: 0;
  margin: 0.7em 0;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.markdown :deep(.reply-diagram svg) {
  display: block;
  width: 100%;
  max-height: 420px;
  margin-block-end: 8px;
  overflow: hidden;
}
.markdown :deep(.reply-diagram button) {
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  color: inherit;
  background: var(--bg-elevated);
  cursor: pointer;
}
.markdown :deep(.reply-html) {
  margin: 0.7em 0;
  max-width: 100%;
  overflow-x: auto;
}
.markdown.reply-dense > :deep(p),
.markdown.reply-dense > :deep(.math-display) {
  content-visibility: auto;
  contain-intrinsic-block-size: auto 2.4em;
}
.markdown :deep(.math-display) {
  display: block;
  max-width: 100%;
  overflow: auto;
}
.markdown :deep(.hljs-keyword),
.markdown :deep(.hljs-selector-tag) {
  color: light-dark(#7444a7, #d5a8ff);
}
.markdown :deep(.hljs-string),
.markdown :deep(.hljs-attr) {
  color: light-dark(#186737, #9ad49f);
}
.markdown :deep(.hljs-number),
.markdown :deep(.hljs-literal) {
  color: light-dark(#96400a, #ffba7b);
}
.markdown :deep(.hljs-title),
.markdown :deep(.hljs-built_in) {
  color: light-dark(#155d9e, #9bc9ff);
}
.markdown :deep(.hljs-comment) {
  color: var(--text-secondary);
}
.markdown :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.markdown :deep(td),
.markdown :deep(th) {
  border: 1px solid #8883;
  padding: 6px 10px;
}
.accent-link,
.markdown :deep(.accent-link),
.attachment-label {
  display: inline-block;
  max-width: 100%;
  vertical-align: bottom;
  border-radius: 5px;
  padding-inline: 5px;
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  color: var(--primary-color);
  font-weight: 550;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.accent-link::before,
.markdown :deep(.accent-link)::before {
  content: '';
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  vertical-align: -0.1em;
  margin-inline-end: 4px;
  background: currentColor;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 4H3v9h9v-3M8 3h5v5m0-5L7 9'/%3E%3C/svg%3E")
    center / contain no-repeat;
}
.accent-link[href^='#']::before,
.markdown :deep(.accent-link[data-local-link])::before {
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linejoin='round'%3E%3Cpath d='M4 2h5l3 3v9H4zM9 2v4h3'/%3E%3C/svg%3E");
}
.accent-link:hover,
.markdown :deep(.accent-link):hover {
  background: color-mix(in srgb, var(--primary-color) 18%, transparent);
}
.link-hint {
  position: fixed;
  z-index: 5;
  max-width: min(400px, calc(100vw - 24px));
  box-sizing: border-box;
  padding: 5px 9px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: 0 4px 14px #0002;
  font-size: 12px;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.link-hint.above {
  transform: translateY(-100%);
}
.reasoning {
  font-size: 12px;
  color: #858594;
}
.reasoning pre {
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
}
.composer-wrap {
  position: relative;
  padding: 6px max(14px, calc((100% - 860px) / 2)) 8px;
}
.composer {
  border: 1px solid #8884;
  border-radius: 15px;
  box-shadow: 0 2px 16px #00000005;
  padding: 10px;
}
.composer:focus-within {
  border-color: var(--primary-color);
}
textarea {
  display: block;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  width: 100%;
  box-sizing: border-box;
  min-height: 54px;
  max-height: 180px;
  padding: 6px 8px;
}
.composer-actions,
.composer-settings,
.actions,
.answer {
  display: flex;
  gap: 8px;
  align-items: center;
}
.composer-actions {
  flex-wrap: wrap;
}
.composer-settings {
  min-width: 0;
}
.composer-settings select:last-child,
.composer-actions > button {
  flex: none;
}
.composer-actions svg,
.retry-button svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.composer-actions .icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  width: 34px;
  padding: 0;
}
.composer-actions .search-switch[aria-checked='true'] {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}
.output-action {
  margin-inline-start: auto;
}
button {
  cursor: pointer;
  border: 1px solid #8883;
  background: transparent;
  border-radius: 8px;
  padding: 6px 12px;
}
button:hover {
  background: #8881;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button.primary {
  background: var(--primary-color);
  color: white;
  border-color: transparent;
}
.request-card {
  border: 1px solid color-mix(in srgb, var(--primary-color) 28%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-color) 5%, var(--bg-elevated));
  padding: 16px;
  margin: 10px 0;
  line-height: 1.6;
}
.request-card .actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid #8883;
}
.request-card pre {
  margin: 12px 0 0;
}
.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.answer {
  margin-top: 12px;
}
.answer input {
  flex: 1;
  min-width: 0;
  border: 1px solid #8884;
  border-radius: 8px;
  background: transparent;
  padding: 8px;
}
.turn-error {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 3px 8px;
  border-inline-start: 2px solid light-dark(#ac6829, #e0a96b);
  border-radius: 6px;
  background: light-dark(#ad651610, #e6ad6416);
  color: var(--text-primary);
  padding: 7px 10px;
  margin-block: 6px;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.turn-error strong {
  color: light-dark(#885222, #f1be84);
}
.turn-error button {
  margin-inline-start: auto;
}
.retry-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}
.retry-row .retry-button {
  display: inline-grid;
  place-items: center;
  width: 25px;
  height: 25px;
  padding: 0;
  color: var(--primary-color);
}
.attachments {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}
.user .attachments {
  margin-top: 5px;
}
.draft-attachments {
  padding-bottom: 8px;
  max-height: 80px;
  overflow: auto;
}
.draft-attachment {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}
.draft-attachment button {
  padding: 0 5px;
  border-color: transparent;
}
.draft-attachments a {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slash-menu {
  position: absolute;
  bottom: 100%;
  left: 22px;
  right: 22px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid #8883;
  background: var(--bg-elevated);
  box-shadow: 0 8px 24px #0002;
  border-radius: 12px;
  padding: 8px;
  z-index: 2;
}
.slash-menu button {
  display: flex;
  justify-content: space-between;
  width: 100%;
  border: 0;
  padding: 10px;
}
.slash-menu small {
  color: #888;
}
.slash-menu p {
  padding: 4px 10px;
}
@media (max-width: 540px) {
  .conversation {
    padding: 12px;
  }
  .model-select {
    max-width: 140px;
  }
}
@media (max-width: 475px) {
  .composer-settings {
    flex-basis: 100%;
  }
  .model-select {
    max-width: none;
  }
}
</style>
