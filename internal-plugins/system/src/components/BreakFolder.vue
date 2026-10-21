<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { syncPluginHeightToContent } from '@/utils/pluginHeight'
import BreakPreviewPanel from './break/BreakPreviewPanel.vue'
import BreakHistoryList from './break/BreakHistoryList.vue'
const props = defineProps({ action: { type: Object, required: true } })
const HISTORY_KEY = 'folder-break-history',
  MAX_HISTORY = 50
const strategies = [
  ['rename', '自动重命名'],
  ['overwrite', '覆盖'],
  ['skip', '跳过']
]
const folder = ref(''),
  recursive = ref(false),
  strategy = ref('rename'),
  scan = ref(null),
  message = ref(''),
  scanning = ref(false),
  executing = ref(false),
  confirm = ref(false),
  history = ref([])
let disposed = false,
  scanVersion = 0,
  runController = null
const busy = computed(() => scanning.value || executing.value)
const strategyLabel = computed(
  () => strategies.find((item) => item[0] === strategy.value)?.[1] || ''
)
// 统一状态行文案，覆盖扫描、执行、就绪与占位几种前台状态。
const statusText = computed(() => {
  if (executing.value) return '正在处理文件，可取消…'
  if (scanning.value) return '正在统计目录…'
  if (message.value) return message.value
  if (!folder.value) return '等待选择文件夹'
  return '已就绪，可执行解散'
})
/**
 * 从路径中取出用于展示的末级目录名。
 * @param {string} target 目录绝对路径。
 * @returns {string} 末级目录名。
 */
function baseName(target) {
  const parts = String(target)
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
  return parts[parts.length - 1] || String(target)
}
/**
 * 读取持久化的解散历史，损坏数据回退为空列表。
 * @returns {object[]} 最近的历史记录。
 */
function loadHistory() {
  const stored = window.tabdo.dbStorage.getItem(HISTORY_KEY)
  return Array.isArray(stored) ? stored.slice(0, MAX_HISTORY) : []
}
/**
 * 只写入本插件命名空间的历史，最多保留最近 50 条。
 * @returns {void} 无返回值。
 */
function saveHistory() {
  window.tabdo.dbStorage.setItem(
    HISTORY_KEY,
    JSON.parse(JSON.stringify(history.value.slice(0, MAX_HISTORY)))
  )
}
/**
 * 选择新的目标目录并立即刷新预览。
 * @param {string} target 目标目录绝对路径。
 * @returns {void} 无返回值。
 */
function loadFolder(target) {
  if (!target || disposed) return
  folder.value = target
  confirm.value = false
  message.value = ''
  void refreshScan()
}
/**
 * 读取当前目录的规模与类型统计，迟到的结果不回填已退出页面。
 * @returns {Promise<void>} 扫描结束后的 Promise。
 */
async function refreshScan() {
  if (!folder.value || disposed) {
    scan.value = null
    return
  }
  const version = ++scanVersion
  scanning.value = true
  try {
    const result = await window.toolsFiles.scanBreakTarget(
      folder.value,
      { recursive: recursive.value },
      window.toolsLifecycle.signal
    )
    if (disposed || version !== scanVersion) return
    scan.value = result
    message.value = result.totalFiles || result.totalDirs ? '' : '该文件夹为空，没有可解散的内容'
  } catch (error) {
    if (disposed || version !== scanVersion) return
    scan.value = null
    message.value = error.message
  } finally {
    if (!disposed && version === scanVersion) scanning.value = false
  }
}
/**
 * 用原生对话框选择要解散的文件夹。
 * @returns {void} 无返回值。
 */
function chooseFolder() {
  const paths = window.tabdo.showOpenDialog({
    title: '选择要解散的文件夹',
    properties: ['openDirectory']
  })
  if (paths?.[0]) loadFolder(paths[0])
}
/**
 * 在资源管理器中打开当前目录。
 * @returns {Promise<void>} 打开结束后的 Promise。
 */
async function openFolder() {
  if (!folder.value) return
  try {
    await window.tabdo.shellOpenPath(folder.value)
  } catch (error) {
    message.value = error.message
  }
}
/**
 * 接收拖入的文件夹路径，非目录会在扫描阶段给出明确提示。
 * @param {DragEvent} event 拖入事件。
 * @returns {void} 无返回值。
 */
function drop(event) {
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  loadFolder(window.toolsProvider.filePath(file))
}
/**
 * 打开确认对话框，列出目录、模式、冲突策略与将移动/删除的数量。
 * @returns {void} 无返回值。
 */
function requestExecute() {
  if (busy.value || !scan.value) return
  if (!scan.value.totalFiles && !scan.value.totalDirs) {
    message.value = '没有可解散的内容'
    return
  }
  confirm.value = true
}
/**
 * 中止当前的解散或撤销操作，桥接层会回滚已完成的移动。
 * @returns {void} 无返回值。
 */
function cancelRun() {
  runController?.abort()
}
/**
 * 执行解散，整个文件事务登记为必要任务并共享页面的取消信号。
 * @returns {Promise<void>} 解散结束后的 Promise。
 */
async function execute() {
  if (busy.value || !folder.value || !scan.value) return
  confirm.value = false
  executing.value = true
  message.value = '正在解散…'
  const target = folder.value,
    options = { recursive: recursive.value, conflictStrategy: strategy.value },
    controller = new AbortController()
  runController = controller
  try {
    const result = await window.toolsLifecycle.runTask(async (task) => {
      const onAbort = () => controller.abort()
      task.signal.addEventListener('abort', onAbort, { once: true })
      try {
        return await window.toolsFiles.breakDirectory(target, options, controller.signal)
      } finally {
        task.signal.removeEventListener('abort', onAbort)
      }
    }, 120000)
    if (disposed) return
    const summary = `解散完成：移动 ${result.moved.length} 项，删除 ${result.deletedDirs.length} 个目录${
      result.skipped.length ? `，跳过 ${result.skipped.length} 项` : ''
    }${result.errors.length ? `，${result.errors.length} 项未处理` : ''}`
    // 记录本次解散结果供撤销，只保留最近的 50 条。
    history.value = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: Date.now(),
        dir: target,
        dirName: baseName(target),
        recursive: recursive.value,
        strategy: strategy.value,
        moved: result.moved,
        deletedDirs: result.deletedDirs
      },
      ...history.value
    ].slice(0, MAX_HISTORY)
    saveHistory()
    folder.value = ''
    scan.value = null
    message.value = summary
  } catch (error) {
    if (!disposed) message.value = error.message
  } finally {
    if (!disposed) executing.value = false
    runController = null
  }
}
/**
 * 撤销一条历史记录，把内容移回原位并重建被删除的目录。
 * @param {object} record 待撤销的历史记录。
 * @returns {Promise<void>} 撤销结束后的 Promise。
 */
async function undo(record) {
  if (busy.value || !record) return
  executing.value = true
  message.value = '正在撤销…'
  const controller = new AbortController()
  runController = controller
  try {
    const result = await window.toolsLifecycle.runTask(async (task) => {
      const onAbort = () => controller.abort()
      task.signal.addEventListener('abort', onAbort, { once: true })
      try {
        return await window.toolsFiles.undoBreak(record, controller.signal)
      } finally {
        task.signal.removeEventListener('abort', onAbort)
      }
    }, 120000)
    if (disposed) return
    if (result.errors.length)
      message.value = `撤销完成：恢复 ${result.restored.length} 项，${result.errors.length} 项未恢复`
    else {
      history.value = history.value.filter((item) => item.id !== record.id)
      saveHistory()
      message.value = `已撤销：恢复 ${result.restored.length} 项`
    }
  } catch (error) {
    if (!disposed) message.value = error.message
  } finally {
    if (!disposed) executing.value = false
    runController = null
  }
}
/**
 * 清空全部解散历史。
 * @returns {void} 无返回值。
 */
function clearHistory() {
  history.value = []
  saveHistory()
  message.value = '已清空历史记录'
}
/**
 * 按正文内容收紧宿主插件高度，避免固定窗口出现留白或裁切。
 * @returns {void} 无返回值。
 */
function syncHeight() {
  if (disposed) return
  void nextTick(() => {
    if (!disposed) syncPluginHeightToContent(null, { minHeight: 480, maxHeight: 640 })
  })
}
/**
 * 退出时停止扫描、取消在途任务并释放结果引用。
 * @returns {void} 无返回值。
 */
function dispose() {
  disposed = true
  scanVersion++
  runController?.abort()
  scan.value = null
  message.value = ''
}
window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
// 目录、预览、状态或历史变化都会改变正文高度，统一在变化后重新贴合。
watch([folder, scan, message, scanning, executing, history], syncHeight)
watch(recursive, () => {
  if (folder.value) void refreshScan()
})
onMounted(() => {
  history.value = loadHistory()
  void window.tabdo.removeSubInput()
  try {
    if (props.action.type === 'files') {
      const entry = props.action.payload?.[0]
      if (entry?.isDirectory) loadFolder(entry.path)
      else message.value = '请选择文件夹；当前匹配的是文件而非目录'
    }
  } catch (error) {
    message.value = error.message
  }
  syncHeight()
})
</script>
<template>
  <div class="utility-page break-page" @dragover.prevent @drop.prevent="drop">
    <section class="folder-toolbar" aria-label="选择文件夹">
      <svg
        class="folder-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      </svg>
      <code v-if="folder" class="folder-path" :title="folder">{{ folder }}</code>
      <span v-else class="folder-placeholder">拖入文件夹，或选择目录</span>
      <button
        v-if="folder"
        class="open-folder"
        :disabled="busy"
        title="在资源管理器中打开"
        aria-label="在资源管理器中打开"
        @click="openFolder"
      >
        ↗
      </button>
      <button :disabled="busy" @click="chooseFolder">
        {{ folder ? '更换目录' : '选择文件夹' }}
      </button>
    </section>
    <fieldset class="config-bar" :disabled="busy" aria-label="解散选项">
      <span class="config-label">模式</span>
      <label><input v-model="recursive" type="radio" :value="false" name="break-mode" />单层</label>
      <label><input v-model="recursive" type="radio" :value="true" name="break-mode" />递归</label>
      <label class="conflict-label"
        >冲突处理
        <select v-model="strategy" aria-label="冲突处理">
          <option v-for="option in strategies" :key="option[0]" :value="option[0]">
            {{ option[1] }}
          </option>
        </select>
      </label>
      <p v-if="strategy === 'overwrite'" class="danger-note" role="alert">
        覆盖会删除父目录中的同名项，且无法恢复，请谨慎选择。
      </p>
    </fieldset>
    <p role="status" class="break-status" :class="{ busy }">{{ statusText }}</p>
    <BreakPreviewPanel v-if="scan" :scan="scan" :recursive="recursive" />
    <div class="actions">
      <button
        class="primary"
        :disabled="busy || !scan || (!scan.totalFiles && !scan.totalDirs)"
        @click="requestExecute"
      >
        执行解散
      </button>
      <button v-if="executing" class="cancel" @click="cancelRun">取消解散</button>
    </div>
    <BreakHistoryList :records="history" @undo="undo" @clear="clearHistory" />
    <div v-if="confirm && scan" class="confirmation" role="dialog" aria-label="确认解散文件夹">
      <h3>确认解散</h3>
      <ul class="confirm-list">
        <li>目录：{{ folder }}</li>
        <li>模式：{{ recursive ? '递归' : '单层' }}</li>
        <li>冲突处理：{{ strategyLabel }}</li>
        <li>
          将移动 {{ scan.totalFiles }} 个文件{{
            recursive
              ? `，删除 ${scan.totalDirs} 个目录`
              : scan.totalDirs
                ? `，移动 ${scan.totalDirs} 个子文件夹`
                : ''
          }}
        </li>
      </ul>
      <p v-if="strategy === 'overwrite'" class="danger-note" role="alert">
        覆盖策略会删除父目录中的同名项，且无法恢复。
      </p>
      <div class="actions">
        <button class="primary" @click="execute">确认执行</button>
        <button @click="confirm = false">取消</button>
      </div>
    </div>
  </div>
</template>
<style scoped>
/* 正文高度由内容决定，容器不固定占满视口，避免大量留白或裁切。 */
.break-page {
  height: auto;
  overflow: visible;
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.break-page h2 {
  margin: 0;
  font-size: 18px;
}
.folder-toolbar {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  background: var(--bg-surface);
}
.folder-icon {
  width: 21px;
  height: 21px;
  flex: none;
  color: var(--primary-color);
}
.folder-placeholder {
  flex: 1;
  color: var(--text-secondary);
}
.folder-toolbar button {
  flex: none;
  padding: 4px 9px;
  font-size: 12px;
}
.folder-toolbar .open-folder {
  border: 0;
  padding: 3px 6px;
}
.folder-path {
  flex: 1;
  min-width: 0;
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
}
.config-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 0;
  margin: 0;
  border: 0;
  font-size: 12px;
}
.config-label {
  color: var(--text-secondary);
}
.config-bar select {
  padding: 4px 7px;
}
.config-bar input[type='radio'] {
  margin: 0;
  accent-color: var(--primary-color);
}
.break-page > .actions {
  margin: 0;
}
.config-bar label {
  display: flex;
  align-items: center;
  gap: 5px;
}
.conflict-label {
  margin-left: auto;
}
.danger-note {
  width: 100%;
  margin: 4px 0 0;
  color: #d9534f;
  font-size: 12px;
}
.break-status {
  margin: 0;
  min-height: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}
.break-status.busy {
  color: var(--primary-color);
}
.primary {
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}
.confirm-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
</style>
