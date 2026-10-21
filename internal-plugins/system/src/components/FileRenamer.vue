<script setup>
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue'
import { normalizeWorkflow, newRemoveRule, CASE_MODES, REMOVE_TYPES } from '../utils/renameRules'

import NumberPanel from './rename/NumberPanel.vue'
import ReplacePanel from './rename/ReplacePanel.vue'
import InsertPanel from './rename/InsertPanel.vue'
import SmartPanel from './rename/SmartPanel.vue'
import ManualPanel from './rename/ManualPanel.vue'
import FileList from './rename/FileList.vue'
import ActionBar from './rename/ActionBar.vue'
import ModuleIcon from './rename/ModuleIcon.vue'
import '../styles/rename.css'
import { isValidName } from '../utils/renameModules'

const props = defineProps({ action: { type: Object, required: true } })

/** 顶部标签顺序固定，默认激活第一个「自动编号」。 */
const tabs = [
  ['numbering', '自动编号'],
  ['replace', '查找替换'],
  ['clean', '规则清理'],
  ['insert', '插入内容'],
  ['manual', '手动编辑'],
  ['smart', '智能重命名']
]

const activeTab = ref('numbering')
const cleanTab = ref('case')
const cleanTabs = [
  ['case', '大小写转换'],
  ['sanitize', '文件名清洗'],
  ['extension', '扩展名处理'],
  ['remove', '删除字符']
]
const files = ref([])
const workflow = ref(normalizeWorkflow(window.tabdo.dbStorage.getItem('rename-workflow')))
/** 手动编辑与智能重命名产生的覆盖名称，键为原始路径。 */
const overrides = ref({})
const sortKey = ref('default')
const sortDir = ref('asc')
const message = ref('')
const busy = ref(false)
const computing = ref(false)
const validating = ref(false)
const previewIssues = ref({})
const validationMessage = ref('')
const smartPrompt = ref('')
const models = ref([])
const model = ref('')
/** 预览区搜索过滤词，按名称/目标名称/路径匹配显示行。 */
const filterText = ref('')

const preview = ref([])
let disposed = false
let revision = 0
let previewWorker = null
let previewTimer = null
let previewDeadline = null
let smartRequest = null
let smartVersion = 0
let validationTimer = null
let validationVersion = 0
/** 最近一次改名的 {path, previousPath} 列表，供撤销按钮与撤销事务使用。 */
const undo = ref(null)

/**
 * 计算合并覆盖名称后的预览行，覆盖名称始终优先于引擎推导结果。
 * @returns 预览行列表。
 */
const rawRows = computed(() =>
  preview.value.map((entry) => {
    const overridden = Object.prototype.hasOwnProperty.call(overrides.value, entry.path)
    const newName = overridden ? overrides.value[entry.path] : entry.newName
    return {
      ...entry,
      newName,
      error: overridden ? (isValidName(newName) ? '' : '文件名无效') : entry.error
    }
  })
)
const rows = computed(() =>
  rawRows.value.map((entry) => ({
    ...entry,
    error: entry.error || previewIssues.value[entry.path] || ''
  }))
)
/**
 * 合并规则变化后的逐行只读校验，迟到结果不回填新预览。
 * @returns {void} 无返回值。
 */
function scheduleValidation() {
  const version = ++validationVersion
  clearTimeout(validationTimer)
  previewIssues.value = {}
  validationMessage.value = ''
  validating.value = !!rawRows.value.length
  if (!rawRows.value.length) return
  const plan = JSON.parse(JSON.stringify(rawRows.value))
  validationTimer = setTimeout(async () => {
    try {
      const issues = await window.toolsFiles.review(plan)
      if (!disposed && version === validationVersion) previewIssues.value = issues
    } catch (error) {
      if (!disposed && version === validationVersion) validationMessage.value = error.message
    } finally {
      if (!disposed && version === validationVersion) validating.value = false
    }
  }, 180)
}

/**
 * 用户主动刷新文件元数据后重新计算预览，保留当前规则和覆盖名称。
 * @returns {Promise<void>} 刷新结束后的 Promise。
 */
async function refreshPreview() {
  if (busy.value || disposed) return
  try {
    const latest = await window.toolsFiles.inspect(files.value.map((file) => file.path))
    if (!disposed) files.value = latest
  } catch (error) {
    if (!disposed) message.value = error.message
  }
}
const errorRows = computed(() => rows.value.filter((row) => row.error))
const changedRows = computed(() =>
  rows.value.filter((row) => !row.error && row.newName !== row.name)
)
const unchangedRows = computed(() =>
  rows.value.filter((row) => !row.error && row.newName === row.name)
)
/**
 * 按搜索词过滤预览行，不区分大小写匹配名称、目标名称与路径。
 * @returns 命中搜索条件的预览行列表。
 */
const filteredRows = computed(() => {
  const term = filterText.value.trim().toLocaleLowerCase()
  if (!term) return rows.value
  return rows.value.filter((row) =>
    `${row.name} ${row.newName} ${row.path}`.toLocaleLowerCase().includes(term)
  )
})
/**
 * 持久化当前规则配置，只写入本工具自己的 rename-workflow 键。
 * @returns 无返回值。
 */
function saveWorkflow() {
  window.tabdo.dbStorage.setItem(
    'rename-workflow',
    JSON.parse(JSON.stringify(toRaw(workflow.value)))
  )
}

/**
 * 判断当前是否需要为条目预读图片尺寸。
 * @returns 是否需要读取尺寸。
 */
function needsDimensions() {
  const insert = workflow.value.insert
  return insert.enabled && insert.kind === 'info' && insert.info === 'dimensions'
}

/**
 * 读取图片 data URI 的像素尺寸，读取失败返回 null。
 * @param source 图片 data URI。
 * @returns 尺寸对象或 null。
 */
function decodeSize(source) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = source
  })
}

/**
 * 为缺尺寸的图片条目预读宽高，供插入「图片尺寸」使用；失败保持原样。
 * @param list 即将交给计算引擎的文件列表。
 * @returns 预读完成后的 Promise。
 */
async function enrichDimensions(list) {
  await Promise.all(
    list.map(async (file) => {
      if (file.isDirectory || Number.isFinite(file.width)) return
      try {
        const info = await window.toolsFiles.preview(file.path)
        if (!info || info.type !== 'image' || typeof info.content !== 'string') return
        const size = await decodeSize(info.content)
        if (size) Object.assign(file, size)
      } catch {
        /* 读取失败时保持无尺寸，由引擎给出条目级错误。 */
      }
    })
  )
}

/**
 * 重新计算预览：先做必要的数据预读，再交给可终止 Worker 计算。
 * @returns 计算完成后的 Promise。
 */
async function compute() {
  preview.value = []
  if (disposed) return
  if (!files.value.length) {
    computing.value = false
    return
  }
  const id = revision
  computing.value = true
  const payload = JSON.parse(JSON.stringify({ files: files.value, workflow: workflow.value }))
  if (needsDimensions()) await enrichDimensions(payload.files)
  // 预读期间若有新计算请求，旧计算直接作废。
  if (disposed || id !== revision) return
  const worker = new Worker(new URL('../workers/rename.js', import.meta.url), { type: 'module' })
  previewWorker = worker
  worker.onmessage = ({ data }) => {
    if (disposed || id !== revision || worker !== previewWorker) return
    preview.value = data
    computing.value = false
    clearTimeout(previewDeadline)
    worker.terminate()
    previewWorker = null
  }
  worker.onerror = () => {
    if (disposed || id !== revision || worker !== previewWorker) return
    message.value = '预览计算失败，请检查规则'
    computing.value = false
    clearTimeout(previewDeadline)
    worker.terminate()
    previewWorker = null
  }
  worker.postMessage(payload)
  previewDeadline = setTimeout(() => {
    if (id === revision && worker === previewWorker) {
      worker.terminate()
      previewWorker = null
      computing.value = false
      message.value = '规则计算超时，请简化查找替换条件'
    }
  }, 3000)
}

/**
 * 延迟并合并频繁的规则/列表变化，避免每次输入都重建 Worker。
 * @returns 无返回值。
 */
function scheduleCompute() {
  revision++
  clearTimeout(previewTimer)
  clearTimeout(previewDeadline)
  previewWorker?.terminate()
  previewWorker = null
  if (!files.value.length) {
    preview.value = []
    computing.value = false
    return
  }
  computing.value = true
  previewTimer = setTimeout(() => void compute(), 120)
}

/**
 * 移除当前预览条目并同步清理选中与覆盖状态。
 * @param path 原始路径。
 * @returns 无返回值。
 */
function removeRow(path) {
  files.value = files.value.filter((entry) => entry.path !== path)
  const rest = { ...overrides.value }
  delete rest[path]
  overrides.value = rest
}

/**
 * 行内编辑新名称。
 * @param path 原始路径。
 * @param value 新名称。
 * @returns 无返回值。
 */
function renameRow(path, value) {
  overrides.value = { ...overrides.value, [path]: value }
}

/**
 * 按当前排序设置重排文件列表。
 * @returns 无返回值。
 */
function applySort() {
  if (sortKey.value === 'default') return
  const pick = {
    name: (entry) => entry.name.toLowerCase(),
    size: (entry) => entry.size || 0,
    mtime: (entry) => entry.mtimeMs || 0,
    birthtime: (entry) => entry.birthtimeMs || 0
  }[sortKey.value]
  if (!pick) return
  const direction = sortDir.value === 'desc' ? -1 : 1
  files.value = [...files.value].sort((a, b) => {
    const left = pick(a)
    const right = pick(b)
    if (left < right) return -1 * direction
    if (left > right) return 1 * direction
    return 0
  })
}

/**
 * 读取用户明确选择的路径并合并到列表，迟到读取不回填已退出页面。
 * @param paths 本地绝对路径列表。
 * @returns 读取完成后的 Promise。
 */
async function add(paths) {
  if (!paths?.length || busy.value) return
  const version = ++revision
  try {
    const all = await window.toolsFiles.inspect([
      ...files.value.map((entry) => entry.path),
      ...paths.filter((entry) => !files.value.some((item) => item.path === entry))
    ])
    if (disposed || version !== revision) return
    files.value = all
    message.value = ''
    applySort()
  } catch (error) {
    if (!disposed) message.value = error.message
  }
}

/**
 * 用原生对话框选择要重命名的文件。
 * @returns 无返回值。
 */
function choose() {
  const paths = window.tabdo.showOpenDialog({
    title: '选择要重命名的文件',
    properties: ['openFile', 'multiSelections']
  })
  void add(paths)
}

/**
 * 读取所选文件夹的直接子文件并加入列表，不递归扫描子目录。
 * @returns 读取完成后的 Promise。
 */
async function readFolder() {
  if (busy.value) return
  const dirs = window.tabdo.showOpenDialog({
    title: '选择要读取的文件夹',
    properties: ['openDirectory']
  })
  if (!dirs?.length) return
  try {
    const info = await window.toolsFiles.preview(dirs[0])
    const children = (info?.entries || []).filter((entry) => !entry.isDirectory)
    if (!children.length) {
      message.value = '该文件夹没有可直接重命名的文件'
      return
    }
    await add(children.map((entry) => entry.path))
  } catch (error) {
    if (!disposed) message.value = error.message
  }
}

/**
 * 清空文件列表、选中项与仅属于本次会话的撤销计划。
 * @returns 无返回值。
 */
function clearList() {
  files.value = []
  overrides.value = {}
  undo.value = null
  preview.value = []
  message.value = ''
}

/**
 * 接收拖入的文件路径，不递归扫描文件夹。
 * @param event 拖入事件。
 * @returns 无返回值。
 */
function drop(event) {
  void add([...event.dataTransfer.files].map((file) => window.toolsProvider.filePath(file)))
}

/**
 * 读取资源管理器文件剪贴板，保留普通文本粘贴行为。
 * @param event 粘贴事件。
 * @returns 无返回值。
 */
function paste(event) {
  if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return
  const paths = (window.tabdo.getCopyedFiles() || []).map((file) =>
    typeof file === 'string' ? file : file.path
  )
  if (paths.length) {
    event.preventDefault()
    void add(paths)
  }
}

/**
 * 追加一条删除字符规则。
 * @returns 无返回值。
 */
function addRemoveRule() {
  workflow.value.clean.remove.rules.push(newRemoveRule())
}

/**
 * 删除指定删除字符规则，至少保留一条。
 * @param index 规则位置。
 * @returns 无返回值。
 */
function removeRemoveRule(index) {
  if (workflow.value.clean.remove.rules.length <= 1) return
  workflow.value.clean.remove.rules.splice(index, 1)
}

/**
 * 按当前列表顺序把手动编辑的多行文本写入覆盖名称，条数不符时给出明确错误。
 * @param text 多行新名称文本。
 * @returns 无返回值。
 */
function applyManualText(text) {
  const lines = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
  if (!rows.value.length) {
    message.value = '请先添加文件后再应用手动编辑'
    return
  }
  if (lines.length !== rows.value.length) {
    message.value = `手动编辑共 ${lines.length} 行，当前列表 ${rows.value.length} 项，条数不匹配`
    return
  }
  const next = { ...overrides.value }
  rows.value.forEach((row, index) => {
    next[row.path] = lines[index].trim()
  })
  overrides.value = next
  message.value = `已按列表顺序填入 ${rows.value.length} 项新名称`
}

/**
 * 读取当前可用的 AI 模型列表，恢复有效选中项。
 * @returns 刷新完成后的 Promise。
 */
async function refreshModels() {
  try {
    const list =
      typeof window.tabdo.allAiModels === 'function' ? await window.tabdo.allAiModels() : []
    if (disposed) return
    models.value = Array.isArray(list) ? list : []
    const values = models.value.map((entry) => modelValue(entry))
    if (!values.includes(model.value)) model.value = values[0] || ''
    if (!models.value.length && activeTab.value === 'smart')
      message.value = '未检测到可用 AI 模型，请先在“设置 → AI 模型”添加并启用'
  } catch (error) {
    if (!disposed && activeTab.value === 'smart') message.value = error.message || String(error)
  }
}

/**
 * 取模型条目的可选值（优先稳定 value）。
 * @param entry 模型条目。
 * @returns 模型调用标识。
 */
function modelValue(entry) {
  return entry?.value || entry?.id || ''
}

/**
 * 取模型条目的展示名称。
 * @param entry 模型条目。
 * @returns 展示名称。
 */
function modelLabel(entry) {
  return entry?.label || entry?.modelId || entry?.id || '未命名模型'
}

/**
 * 拆分名称的扩展名；目录与隐藏文件按整体处理。
 * @param name 名称。
 * @param directory 是否为目录。
 * @returns [主名, 扩展名]。
 */
function splitExtension(name, directory) {
  const at = directory ? -1 : String(name).lastIndexOf('.')
  return at > 0 ? [String(name).slice(0, at), String(name).slice(at + 1)] : [String(name), '']
}

/**
 * 调用宿主 AI 接口并把可中止句柄登记到本次请求。
 * @param messages 提交给模型的消息列表。
 * @returns 模型回复文本。
 * @throws {Error} 宿主未提供接口或调用失败时抛出。
 */
async function requestSmart(messages) {
  const invoke = window.tabdo.ai
  if (typeof invoke !== 'function') throw new Error('宿主未提供 AI 调用接口，无法使用智能重命名')
  if (!model.value) throw new Error('未检测到可用 AI 模型，请先在“设置 → AI 模型”启用')
  const pending = invoke({ model: model.value, messages })
  smartRequest = pending
  try {
    const result = await pending
    const content = result?.content
    if (Array.isArray(content)) return content.map((part) => part?.text || '').join('')
    return String(content ?? '')
  } finally {
    if (smartRequest === pending) smartRequest = null
  }
}

/**
 * 解析模型返回的名称数组并严格校验：条数、路径分隔符与扩展名。
 * @param content 模型回复文本。
 * @param list 当前预览行。
 * @returns 校验通过的目标名称数组。
 * @throws {Error} 返回内容不合法时抛出。
 */
function parseSmartNames(content, list) {
  const cleaned = String(content ?? '')
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, '')
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  const json = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('模型未返回可解析的 JSON 名称列表')
  }
  if (!Array.isArray(parsed)) throw new Error('模型返回的不是名称数组')
  if (parsed.length !== list.length)
    throw new Error(`名称条数不匹配：模型返回 ${parsed.length} 项，当前列表 ${list.length} 项`)
  return parsed.map((item, index) => {
    const raw = typeof item === 'string' ? item : item?.name
    const value = String(raw ?? '').trim()
    if (!value) throw new Error(`第 ${index + 1} 项新名称为空`)
    if (/[\\/]/.test(value)) throw new Error(`第 ${index + 1} 项包含路径分隔符`)
    const [, sourceExt] = splitExtension(list[index].name, list[index].isDirectory)
    const [, targetExt] = splitExtension(value, list[index].isDirectory)
    if (sourceExt !== targetExt) throw new Error(`第 ${index + 1} 项未保留原扩展名`)
    return value
  })
}

/**
 * 依据自然语言描述请求模型生成每项目标名称，失败时保持原名并提示。
 * @returns 生成完成后的 Promise。
 */
async function generateSmart() {
  if (busy.value || disposed) return
  if (!rows.value.length) {
    message.value = '请先添加文件后再生成预览'
    return
  }
  if (!models.value.length) {
    message.value = '未检测到可用 AI 模型，请先在“设置 → AI 模型”添加并启用后再刷新'
    return
  }
  const description = smartPrompt.value.trim()
  if (!description) {
    message.value = '请先填写命名描述后再生成预览'
    return
  }
  const target = rows.value
  const version = ++smartVersion
  busy.value = true
  message.value = '正在请求模型生成名称…'
  const listing = target.map((row, index) => `${index + 1}. ${row.name}`).join('\n')
  try {
    const content = await requestSmart([
      {
        role: 'system',
        content:
          '你是文件批量重命名助手。只返回一个 JSON 字符串数组，长度必须与输入条目数完全一致，每项只包含最终文件名（不含路径、不含目录），必须保留每项原有扩展名。不要输出任何解释或多余文本。'
      },
      {
        role: 'user',
        content: `命名要求：${description}\n\n待重命名文件（按顺序）：\n${listing}`
      }
    ])
    if (disposed || version !== smartVersion) return
    const names = parseSmartNames(content, target)
    const next = { ...overrides.value }
    target.forEach((row, index) => {
      next[row.path] = names[index]
    })
    overrides.value = next
    message.value = `已生成 ${names.length} 项建议名称，请核对后再执行`
  } catch (error) {
    if (!disposed && version === smartVersion) message.value = error.message || String(error)
  } finally {
    if (!disposed && version === smartVersion) busy.value = false
  }
}

/**
 * 将点击时的计划快照登记为完整任务，校验通过后直接改名，成功后记录撤销计划。
 * @returns 改名结束后的 Promise。
 */
async function execute() {
  if (
    disposed ||
    busy.value ||
    validating.value ||
    computing.value ||
    !changedRows.value.length ||
    errorRows.value.length
  )
    return
  const plan = JSON.parse(JSON.stringify(rows.value))
  message.value = ''
  // 校验前即锁定本次操作并登记完整链，防重复点击，也允许退出后完成已发起的事务。
  busy.value = true
  try {
    await window.toolsLifecycle.runTask(async (task) => {
      await window.toolsFiles.validate(plan)
      if (task.signal.aborted) return
      const renamed = await window.toolsFiles.rename(plan, task.signal)
      const latest = await window.toolsFiles.inspect(
        plan.map(
          (entry) => renamed.find((item) => item.previousPath === entry.path)?.path || entry.path
        )
      )
      if (disposed) return
      undo.value = renamed
      files.value = latest
      overrides.value = {}
      saveWorkflow()
      message.value = `已重命名 ${renamed.length} 项`
    }, 120000)
  } catch (error) {
    if (!disposed) message.value = error.message
  } finally {
    if (!disposed) busy.value = false
  }
}

/**
 * 取路径中的文件名部分，供撤销时还原旧名称。
 * @param file 绝对路径。
 * @returns 文件名。
 */
function baseName(file) {
  const at = Math.max(String(file).lastIndexOf('/'), String(file).lastIndexOf('\\'))
  return String(file).slice(at + 1)
}

/**
 * 撤销最近一次改名：重新读取当前元数据，再用旧名称构造改名计划。
 * @returns 撤销结束后的 Promise。
 */
async function executeUndo() {
  if (busy.value || !undo.value?.length) return
  busy.value = true
  try {
    await window.toolsLifecycle.runTask(async (task) => {
      const current = await window.toolsFiles.inspect(undo.value.map((item) => item.path))
      const plan = current.map((entry, index) => ({
        ...entry,
        newName: baseName(undo.value[index].previousPath)
      }))
      const result = await window.toolsFiles.rename(plan, task.signal)
      const latest = await window.toolsFiles.inspect(
        plan.map(
          (entry) => result.find((item) => item.previousPath === entry.path)?.path || entry.path
        )
      )
      if (disposed) return
      undo.value = null
      files.value = latest
      overrides.value = {}
      message.value = '已撤销上次改名'
    }, 120000)
  } catch (error) {
    if (!disposed) message.value = error.message
  } finally {
    if (!disposed) busy.value = false
  }
}

/**
 * 释放 Worker、定时器、AI 请求与粘贴监听，必要事务由任务作用域继续完成。
 * @returns 无返回值。
 */
function dispose() {
  if (disposed) return
  disposed = true
  revision++
  smartVersion++
  clearTimeout(previewTimer)
  clearTimeout(previewDeadline)
  previewWorker?.terminate()
  previewWorker = null
  smartRequest?.abort?.()
  clearTimeout(validationTimer)
  validationVersion++
  smartRequest = null
  preview.value = []
  document.removeEventListener('paste', paste)
  files.value = []
  undo.value = null
}

window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
watch(
  [files, workflow],
  () => {
    saveWorkflow()
    scheduleCompute()
  },
  { deep: true, immediate: true }
)
watch([sortKey, sortDir], applySort)
watch(rawRows, scheduleValidation)
watch(activeTab, (tab) => {
  if (tab === 'smart') void refreshModels()
})
onMounted(() => {
  document.addEventListener('paste', paste)
  void window.tabdo.removeSubInput()
  if (props.action.type === 'files') void add(props.action.payload.map((entry) => entry.path))
})

const sequenceToUi = {
  arabic: 'arabic',
  lowerChinese: 'chinese-lower',
  upperChinese: 'chinese-upper',
  lowerAlpha: 'alpha-lower',
  upperAlpha: 'alpha-upper'
}
const sequenceFromUi = Object.fromEntries(
  Object.entries(sequenceToUi).map(([key, value]) => [value, key])
)
const replaceToUi = {
  normal: 'text',
  head: 'first',
  tail: 'last',
  range: 'range',
  after: 'after',
  before: 'before',
  afterCount: 'after-n',
  beforeCount: 'before-n'
}
const replaceFromUi = Object.fromEntries(
  Object.entries(replaceToUi).map(([key, value]) => [value, key])
)
const numberRule = computed(() => ({
  ...workflow.value.numbering,
  style: sequenceToUi[workflow.value.numbering.style]
}))
const replaceRules = computed(() =>
  workflow.value.replace.rules.map((rule) => ({
    ...rule,
    mode: replaceToUi[rule.mode],
    replacement: rule.replace,
    includeExtension: workflow.value.replace.replaceExtension
  }))
)
const insertRule = computed(() => {
  const rule = workflow.value.insert
  return {
    ...rule,
    info: rule.info === 'shot' ? 'captured' : rule.info,
    number: {
      start: rule.number,
      style: sequenceToUi[rule.numberStyle],
      digits: rule.numberDigits,
      prefix: rule.prefix,
      suffix: rule.suffix
    }
  }
})
const displayRows = computed(() =>
  filteredRows.value.map((row) => ({
    id: row.path,
    sourcePath: row.path,
    currentName: row.name,
    targetName: row.newName,
    status: row.error ? 'error' : row.newName === row.name ? 'unchanged' : 'ready',
    errorMessage: row.error
  }))
)
const displayModels = computed(() =>
  models.value.map((item) => ({ value: modelValue(item), label: modelLabel(item) }))
)
const displaySort = computed(() =>
  sortKey.value === 'default'
    ? 'default'
    : (sortKey.value === 'mtime'
        ? 'modified'
        : sortKey.value === 'birthtime'
          ? 'created'
          : sortKey.value) +
      '-' +
      sortDir.value
)

/**
 * 将编号卡片的字段写回现有规则引擎。
 * @param value 上游界面的编号规则。
 * @returns 无返回值。
 */
function updateNumberRule(value) {
  workflow.value.numbering = { ...value, enabled: true, style: sequenceFromUi[value.style] }
}
/**
 * 将替换卡片映射到现有规则，保留扩展名与逐条启用状态。
 * @param value 上游界面的替换规则列表。
 * @returns 无返回值。
 */
function updateReplaceRules(value) {
  const changed = value.find(
    (rule) => rule.includeExtension !== workflow.value.replace.replaceExtension
  )
  workflow.value.replace = {
    enabled: true,
    replaceExtension: changed ? changed.includeExtension : workflow.value.replace.replaceExtension,
    rules: value.map((rule) => ({
      ...rule,
      enabled: true,
      mode: replaceFromUi[rule.mode],
      replace: rule.replacement
    }))
  }
}
/**
 * 将插入卡片映射到现有规则，编辑后立即启用预览。
 * @param value 上游界面的插入规则。
 * @returns 无返回值。
 */
function updateInsertRule(value) {
  workflow.value.insert = {
    ...value,
    enabled: true,
    info: value.info === 'captured' ? 'shot' : value.info,
    number: value.number.start,
    numberStyle: sequenceFromUi[value.number.style],
    numberDigits: value.number.digits,
    prefix: value.kind === 'number' ? value.number.prefix : value.prefix,
    suffix: value.kind === 'number' ? value.number.suffix : value.suffix
  }
}
/**
 * 更新排序条件并重新生成编号与名称预览。
 * @param value 操作栏排序值。
 * @returns 无返回值。
 */
function updateSort(value) {
  const [key, direction] = value.split('-')
  sortKey.value = key === 'modified' ? 'mtime' : key === 'created' ? 'birthtime' : key
  sortDir.value = direction || 'asc'
}
</script>
<template>
  <main class="rename-page app-shell" @dragover.prevent @drop.prevent="drop">
    <nav class="module-tabs rename-tabs" aria-label="重命名标签">
      <button
        v-for="tab in tabs"
        :key="tab[0]"
        :class="{ active: activeTab === tab[0] }"
        :aria-pressed="activeTab === tab[0]"
        :disabled="busy"
        @click="activeTab = tab[0]"
      >
        <ModuleIcon :module="tab[0] === 'numbering' ? 'number' : tab[0]" />{{ tab[1] }}
      </button>
    </nav>
    <fieldset class="rule-panel" :disabled="busy">
      <template v-if="activeTab === 'numbering'">
        <label class="enable-rule"
          ><input
            v-model="workflow.numbering.enabled"
            type="checkbox"
            aria-label="启用自动编号"
          />启用自动编号</label
        >
        <NumberPanel :model-value="numberRule" @update:model-value="updateNumberRule" />
      </template>
      <template v-else-if="activeTab === 'replace'">
        <label class="enable-rule"
          ><input
            v-model="workflow.replace.enabled"
            type="checkbox"
            aria-label="启用查找替换"
          />启用查找替换</label
        >
        <ReplacePanel :model-value="replaceRules" @update:model-value="updateReplaceRules" />
      </template>
      <section v-else-if="activeTab === 'clean'" class="rename-panel">
        <div class="clean-toolbar">
          <label
            ><input
              v-model="workflow.clean.enabled"
              type="checkbox"
              aria-label="启用规则清理"
            />启用规则清理</label
          >
          <nav class="clean-tabs" aria-label="清理方式">
            <button
              v-for="tab in cleanTabs"
              :key="tab[0]"
              :class="{ active: cleanTab === tab[0] }"
              :aria-pressed="cleanTab === tab[0]"
              @click="cleanTab = tab[0]"
            >
              {{ tab[1]
              }}<span
                v-if="workflow.clean[tab[0]].enabled"
                class="enabled-dot"
                aria-label="已启用"
              ></span>
            </button>
          </nav>
        </div>
        <fieldset v-show="cleanTab === 'case'" class="sub-rule">
          <legend>
            <label
              ><input
                v-model="workflow.clean.case.enabled"
                type="checkbox"
                aria-label="启用大小写转换"
              />大小写转换</label
            >
          </legend>
          <div class="actions">
            <select
              v-model="workflow.clean.case.mode"
              aria-label="大小写模式"
              :disabled="!workflow.clean.case.enabled"
            >
              <option v-for="item in CASE_MODES" :key="item[0]" :value="item[0]">
                {{ item[1] }}
              </option>
            </select>
            <small>只作用于主文件名，保留扩展名。</small>
          </div>
        </fieldset>
        <fieldset v-show="cleanTab === 'sanitize'" class="sub-rule">
          <legend>
            <label
              ><input
                v-model="workflow.clean.sanitize.enabled"
                type="checkbox"
                aria-label="启用文件名清洗"
              />文件名清洗</label
            >
          </legend>
          <div class="actions">
            <select
              v-model="workflow.clean.sanitize.mode"
              aria-label="清洗方式"
              :disabled="!workflow.clean.sanitize.enabled"
            >
              <option value="replace">替换非法字符</option>
              <option value="delete">删除非法字符</option></select
            ><input
              v-model="workflow.clean.sanitize.replacement"
              aria-label="替换字符"
              placeholder="替换字符"
              :disabled="
                !workflow.clean.sanitize.enabled || workflow.clean.sanitize.mode === 'delete'
              "
            /><label
              ><input
                v-model="workflow.clean.sanitize.trim"
                type="checkbox"
                :disabled="!workflow.clean.sanitize.enabled"
              />去除首尾空白</label
            ><label
              ><input
                v-model="workflow.clean.sanitize.collapse"
                type="checkbox"
                :disabled="!workflow.clean.sanitize.enabled"
              />压缩连续空白</label
            ><label
              ><input
                v-model="workflow.clean.sanitize.dot"
                type="checkbox"
                :disabled="!workflow.clean.sanitize.enabled"
              />点号归一</label
            >
          </div>
        </fieldset>
        <fieldset v-show="cleanTab === 'extension'" class="sub-rule">
          <legend>
            <label
              ><input
                v-model="workflow.clean.extension.enabled"
                type="checkbox"
                aria-label="启用扩展名处理"
              />扩展名处理</label
            >
          </legend>
          <div class="actions">
            <input
              v-model="workflow.clean.extension.value"
              aria-label="新扩展名"
              placeholder="统一扩展名，如 txt"
              :disabled="!workflow.clean.extension.enabled"
            />
            <small>不区分大小写并去掉前导点，目录不处理。</small>
          </div>
        </fieldset>
        <fieldset v-show="cleanTab === 'remove'" class="sub-rule">
          <legend>
            <label
              ><input
                v-model="workflow.clean.remove.enabled"
                type="checkbox"
                aria-label="启用删除字符"
              />删除字符</label
            >
          </legend>
          <article v-for="(rule, index) in workflow.clean.remove.rules" :key="rule.id" class="rule">
            <div class="actions">
              <label><input v-model="rule.enabled" type="checkbox" />第 {{ index + 1 }} 条</label
              ><select
                v-model="rule.kind"
                aria-label="删除依据"
                :disabled="!workflow.clean.remove.enabled"
              >
                <option value="char">指定字符</option>
                <option value="type">按类型</option></select
              ><input
                v-if="rule.kind === 'char'"
                v-model="rule.char"
                aria-label="删除字符"
                placeholder="要删除的字符"
                :disabled="!workflow.clean.remove.enabled"
              /><select
                v-else
                v-model="rule.type"
                aria-label="删除类型"
                :disabled="!workflow.clean.remove.enabled"
              >
                <option v-for="item in REMOVE_TYPES" :key="item[0]" :value="item[0]">
                  {{ item[1] }}
                </option></select
              ><label
                >从第
                <input
                  v-model.number="rule.from"
                  type="number"
                  min="1"
                  aria-label="删除起始"
                  :disabled="!workflow.clean.remove.enabled"
                />个匹配起</label
              ><label
                >删除
                <input
                  v-model.number="rule.count"
                  type="number"
                  min="0"
                  aria-label="删除数量"
                  :disabled="!workflow.clean.remove.enabled"
                />个（0 表示全部）</label
              ><label
                ><input
                  v-model="rule.unique"
                  type="checkbox"
                  :disabled="!workflow.clean.remove.enabled"
                />同字符去重</label
              ><button
                :disabled="workflow.clean.remove.rules.length <= 1"
                @click="removeRemoveRule(index)"
              >
                删除
              </button>
            </div>
          </article>
          <div class="actions">
            <button @click="addRemoveRule">＋添加删除规则</button>
            <small>按 Unicode 字素簇处理，不会破坏 emoji 与组合字符。</small>
          </div>
        </fieldset>
      </section>

      <template v-else-if="activeTab === 'insert'">
        <label class="enable-rule"
          ><input
            v-model="workflow.insert.enabled"
            type="checkbox"
            aria-label="启用插入内容"
          />启用插入内容</label
        >
        <InsertPanel :model-value="insertRule" @update:model-value="updateInsertRule" />
      </template>
      <ManualPanel v-else-if="activeTab === 'manual'" />
      <SmartPanel
        v-else
        v-model:prompt="smartPrompt"
        v-model:model="model"
        :models="displayModels"
        :loading-models="false"
        :generating="busy"
        :can-generate="!busy && !!files.length && !!smartPrompt.trim() && !!model"
        @generate="generateSmart"
        @refresh-models="refreshModels"
      />
    </fieldset>
    <p v-if="filterText" class="filter-notice">
      显示 {{ filteredRows.length }} / 共 {{ rows.length }} 项；执行范围为全部文件
    </p>
    <div
      v-if="rows.length"
      class="preview-validation"
      :class="{ 'has-errors': errorRows.length || validationMessage }"
      role="status"
    >
      <span>{{
        validating
          ? '正在校验名称与目标冲突…'
          : validationMessage ||
            (errorRows.length
              ? `${errorRows.length} 项需要处理，请查看预览中的提示`
              : '名称与目标冲突检查通过')
      }}</span>
      <button :disabled="busy || computing" @click="refreshPreview">刷新预览</button>
    </div>
    <FileList
      :items="displayRows"
      :busy="busy"
      :loading="computing"
      :manual="activeTab === 'manual'"
      :empty-message="
        files.length ? '没有匹配的文件，请调整搜索条件' : '拖入文件，或从底部操作栏添加文件'
      "
      @remove="removeRow"
      @edit="renameRow"
      @paste="applyManualText"
      @show-error="message = $event"
    />
    <label class="list-search"
      ><span aria-hidden="true">⌕</span
      ><input
        v-model="filterText"
        type="search"
        aria-label="筛选文件列表"
        placeholder="搜索或过滤当前文件…"
    /></label>
    <ActionBar
      :count="files.length"
      :ready="changedRows.length"
      :error="errorRows.length"
      :unchanged="unchangedRows.length"
      :sort-mode="displaySort"
      :can-undo="!!undo"
      :can-execute="!!changedRows.length && !errorRows.length && !validating && !validationMessage"
      :busy="busy || computing"
      @select-files="choose"
      @select-folder="readFolder"
      @clear="clearList"
      @sort="updateSort"
      @execute="execute"
      @undo="executeUndo"
    />
    <div v-if="message" class="rename-message" role="status">
      <span>{{ message }}</span
      ><button aria-label="关闭提示" @click="message = ''">×</button>
    </div>
  </main>
</template>
<style scoped>
.app-shell {
  height: 100vh;
  width: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--surface-canvas);
  color: var(--text);
  font: var(--tool-font);
}
.rule-panel {
  height: 192px;
  min-height: 0;
  overflow: auto;
  padding: 12px 18px;
}
.rule-panel:has(.manual-panel) {
  height: 72px;
}
.rule-panel:has(.smart-panel) {
  height: 184px;
}
.rule-panel:has(.rename-panel) {
  height: auto;
  max-height: 208px;
}
.rule-panel :deep(.number-panel) {
  height: calc(100% - 26px);
  gap: 18px;
}
.rule-panel :deep(.insert-panel) {
  height: auto;
  gap: 10px;
}
.rule-panel :deep(.mini-field) {
  height: 37px;
}
.enable-rule {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--muted);
}
.enable-rule input {
  accent-color: var(--primary);
}
.rename-panel {
  display: grid;
  gap: 6px;
}
.clean-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}
.clean-toolbar > label {
  display: flex;
  gap: 6px;
  align-items: center;
  flex: none;
  color: var(--muted);
  font-size: 11px;
}
.clean-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: var(--surface-subdued);
}
.clean-tabs button {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 5px 10px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
}
.clean-tabs button.active {
  color: var(--primary);
  background: var(--surface-card);
  box-shadow: var(--shadow-card);
}
.enabled-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--success);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.actions label {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}
.actions input:not([type='checkbox']),
.actions select {
  max-width: 160px;
  padding: 5px 8px;
  border: 1px solid var(--border-input);
  border-radius: 5px;
  color: var(--text);
  background: var(--surface-subdued);
}
.actions input[type='number'] {
  width: 64px;
}
.actions input:focus,
.actions select:focus {
  outline: 2px solid var(--focus-ring);
  border-color: var(--primary);
}
.actions button {
  padding: 4px 8px;
  color: var(--primary);
  background: var(--surface-subdued);
}
.actions small {
  color: var(--muted);
}
.sub-rule {
  margin: 0;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.sub-rule legend {
  color: var(--muted);
  font-size: 12px;
}
.rule {
  padding: 4px 0;
}
.rename-message {
  flex: none;
  margin: 8px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-input);
  border-radius: 8px;
  background: var(--bg-elevated);
  box-shadow: 0 4px 18px #0002;
}
.rename-message button {
  margin-left: auto;
  background: transparent;
  color: var(--muted);
}
.rename-message span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.preview-validation {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 16px 6px;
  padding: 3px 8px;
  border-radius: 6px;
  color: var(--muted);
  background: var(--surface-subdued);
  font-size: 12px;
  flex: none;
}
.preview-validation.has-errors {
  color: var(--warning-text);
  background: var(--warning-subtle);
}
.preview-validation button {
  padding: 3px 6px;
  color: var(--primary);
  background: transparent;
  flex: none;
}
@media (max-width: 620px) {
  .module-tabs {
    gap: 0;
  }
  .module-tabs button {
    padding: 0 9px;
    font-size: 12px;
    gap: 5px;
  }
  .module-tabs :deep(svg) {
    width: 14px;
  }
  .rule-panel {
    margin: 0 8px 8px;
  }
}
</style>
