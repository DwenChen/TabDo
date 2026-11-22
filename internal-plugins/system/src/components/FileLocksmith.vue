<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { syncPluginHeightToContent } from '@/utils/pluginHeight'

const props = defineProps({ action: { type: Object, required: true } })

const files = ref([])
const processes = ref([])
const errors = ref([])
const status = ref('')
const scanning = ref(false)
const scanned = ref(false)
const scannedFiles = ref(0)
const truncated = ref(false)
const busyPid = ref(null)
const confirmingPid = ref(null)
let disposed = false
let scanVersion = 0
let controller = null
let confirmTimer = null

const hasFiles = computed(() => files.value.length > 0)
const lockedCount = computed(() => processes.value.length)

/**
 * 从路径中取出用于展示的末级名称。
 * @param {string} target 文件或文件夹绝对路径。
 * @returns {string} 末级名称。
 */
function baseName(target) {
  const parts = String(target)
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
  return parts[parts.length - 1] || String(target)
}

/**
 * 把辅助进程返回的错误码转换为可读说明。
 * @param {object} item 文件级错误。
 * @returns {string} 中文错误说明。
 */
function formatScanError(item) {
  const message = String(item?.message || '')
  if (message === 'ACCESS_DENIED' || /failed: 5$/.test(message)) {
    return '拒绝访问或文件受系统保护'
  }
  if (message === 'NOT_ACCESSIBLE') return '路径不存在或无法访问'
  const skipped = message.match(/^SKIPPED:(\d+)$/)
  if (skipped) return `跳过 ${skipped[1]} 个无法访问的项目`
  const truncatedMatch = message.match(/^TRUNCATED:(\d+)$/)
  if (truncatedMatch) return `文件过多，仅检查前 ${truncatedMatch[1]} 个文件`
  return message || '检查失败'
}

/**
 * 校验并归一化宿主传入的文件匹配结果，最多保留 20 项。
 * @param {object} action 本次工具进入事件。
 * @returns {object[]} 文件条目。
 */
function readFiles(action) {
  const entries = action?.type === 'files' ? action.payload : []
  if (!Array.isArray(entries)) return []
  const seen = new Set()
  const result = []
  for (const entry of entries) {
    if (typeof entry?.path !== 'string' || !entry.path) continue
    const key = entry.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      path: entry.path,
      name: baseName(entry.path),
      isDirectory: entry.isDirectory === true
    })
    if (result.length >= 20) break
  }
  return result
}

/**
 * 查询当前文件被哪些进程占用；旧请求的结果不会回填新页面。
 * @returns {Promise<void>} 扫描结束后的 Promise。
 */
async function scan() {
  if (disposed || !files.value.length) return
  controller?.abort()
  const nextController = new AbortController()
  controller = nextController
  const version = ++scanVersion
  scanning.value = true
  status.value = '正在检查文件占用…'
  try {
    const result = await window.toolsLocksmith.scan(
      files.value.map((file) => file.path),
      nextController.signal
    )
    if (disposed || version !== scanVersion) return
    processes.value = [...(result.processes || [])].sort(
      (left, right) =>
        String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN') ||
        Number(left.pid) - Number(right.pid)
    )
    errors.value = Array.isArray(result.errors) ? result.errors : []
    scannedFiles.value = Number(result.scannedFiles) || 0
    truncated.value = result.truncated === true
    scanned.value = true
    const checked = `已检查 ${scannedFiles.value} 个文件`
    const suffix = errors.value.length ? `；${errors.value.length} 项无法检查` : ''
    status.value = processes.value.length
      ? `${checked}，发现 ${lockedCount.value} 个进程占用所选文件或文件夹${suffix}`
      : errors.value.length
        ? `检查完成，但有 ${errors.value.length} 项无法读取${truncated.value ? '；目录过大已截断' : ''}`
        : `${checked}，未发现占用进程`
  } catch (error) {
    if (disposed || version !== scanVersion || nextController.signal.aborted) return
    processes.value = []
    errors.value = []
    scannedFiles.value = 0
    truncated.value = false
    scanned.value = true
    status.value = error.message || '文件占用查询失败'
  } finally {
    if (!disposed && version === scanVersion) scanning.value = false
  }
}

/**
 * 首次点击进入确认态，再次点击才结束进程。
 * @param {object} processInfo 待结束的进程条目。
 * @returns {Promise<void>} 操作结束后的 Promise。
 */
async function handleKill(processInfo) {
  if (busyPid.value || disposed) return
  if (confirmingPid.value !== processInfo.pid) {
    confirmingPid.value = processInfo.pid
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => {
      confirmingPid.value = null
    }, 2500)
    return
  }

  clearTimeout(confirmTimer)
  confirmTimer = null
  confirmingPid.value = null
  busyPid.value = processInfo.pid
  status.value = `正在结束 ${processInfo.name || `PID ${processInfo.pid}`}…`
  try {
    const result = await window.toolsLifecycle.runTask(async (task) => {
      return await window.toolsLocksmith.kill([processInfo.pid], task.signal)
    }, 30000)
    if (disposed) return
    const item = result?.results?.[0]
    if (item?.success === false) {
      status.value = `结束进程失败：${item.error || '未知原因'}`
    } else {
      status.value = `已结束 ${processInfo.name || `PID ${processInfo.pid}`}，正在重新检查…`
      await scan()
    }
  } catch (error) {
    if (!disposed) status.value = error.message || '结束进程失败'
  } finally {
    if (!disposed) busyPid.value = null
  }
}

/**
 * 按正文内容收紧宿主插件高度。
 * @returns {void} 无返回值。
 */
function syncHeight() {
  if (disposed) return
  void nextTick(() => {
    if (!disposed) syncPluginHeightToContent(null, { minHeight: 320, maxHeight: 700 })
  })
}

/**
 * 退出时取消查询、确认计时并释放桥接进程。
 * @returns {void} 无返回值。
 */
function dispose() {
  disposed = true
  scanVersion++
  controller?.abort()
  controller = null
  clearTimeout(confirmTimer)
  confirmTimer = null
  processes.value = []
}

window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
watch([processes, errors, status, scanning, scanned, scannedFiles, truncated], syncHeight)
onMounted(() => {
  void window.tabdo.removeSubInput()
  files.value = readFiles(props.action)
  status.value = files.value.length ? '' : '请选择一个或多个文件或文件夹后打开“文件占用”'
  syncHeight()
  if (files.value.length) void scan()
})
</script>

<template>
  <div class="utility-page lock-page">
    <section class="lock-toolbar" aria-label="检查的文件">
      <svg
        class="lock-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <rect width="8" height="6" x="8" y="12" rx="1" />
        <path d="M10 12v-2a2 2 0 0 1 4 0v2" />
      </svg>
      <div class="lock-files">
        <span v-if="!files.length" class="lock-placeholder">未选择文件</span>
        <template v-else>
          <span v-for="file in files" :key="file.path" class="file-chip" :title="file.path">
            {{ file.name }}
          </span>
        </template>
      </div>
      <button :disabled="scanning || !hasFiles" title="重新检查" @click="scan">重新检查</button>
    </section>

    <p role="status" class="lock-status" :class="{ busy: scanning }">{{ status }}</p>

    <div v-if="errors.length" class="lock-errors">
      <span v-for="(item, index) in errors" :key="`${item.path}-${index}`" :title="item.path">
        无法检查 {{ baseName(item.path) }}：{{ formatScanError(item) }}
      </span>
    </div>

    <div v-if="processes.length" class="lock-list">
      <article v-for="item in processes" :key="item.pid" class="lock-process">
        <div class="process-body">
          <div class="process-title">
            <strong>{{ item.name || '未知进程' }}</strong>
            <span class="process-pid">PID {{ item.pid }}</span>
          </div>
          <div class="process-meta">
            <span>{{ item.user || '未知用户' }}</span>
            <span v-if="item.path" class="process-path" :title="item.path">{{ item.path }}</span>
          </div>
          <div class="process-files">
            <span v-for="file in item.files || []" :key="file" :title="file">
              {{ baseName(file) }}
            </span>
          </div>
        </div>
        <button
          class="kill-button"
          :disabled="busyPid !== null"
          :title="`结束 ${item.name || '该进程'}`"
          @click="handleKill(item)"
        >
          {{ confirmingPid === item.pid ? '确认结束' : '结束进程' }}
        </button>
      </article>
    </div>

    <div v-else-if="scanned && !scanning && hasFiles && !errors.length" class="lock-empty success">
      <div class="lock-empty-heading">
        <span class="empty-mark">✓</span>
        <span>没有进程占用这些文件</span>
      </div>
      <p>可以正常移动、删除或覆盖；若仍失败，请检查磁盘权限或重新打开应用。</p>
    </div>

    <div v-else-if="scanned && !scanning && hasFiles" class="lock-empty warning">
      <div>部分项目无法检查</div>
      <p>请处理上方错误后点击“重新检查”；其余可读取文件已正常扫描。</p>
    </div>

    <div v-else-if="!hasFiles" class="lock-empty">
      <div>未选择文件</div>
      <p>在资源管理器选中任意文件或文件夹后，通过匹配指令打开“文件占用”。</p>
    </div>
  </div>
</template>

<style scoped>
.lock-page {
  height: auto;
  overflow: visible;
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lock-toolbar {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  background: var(--bg-surface);
}
.lock-icon {
  width: 21px;
  height: 21px;
  flex: none;
  color: var(--primary-color);
}
.lock-files {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 52px;
  overflow: auto;
}
.lock-placeholder {
  color: var(--text-secondary);
  font-size: 12px;
  align-self: center;
}
.file-chip {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--active-bg);
  color: var(--text-primary);
  font-size: 12px;
}
.lock-toolbar button {
  flex: none;
  padding: 4px 9px;
  font-size: 12px;
}
.lock-status {
  margin: 0;
  min-height: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}
.lock-status.busy {
  color: var(--primary-color);
}
.lock-errors {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  color: #d9534f;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.lock-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: 430px;
  overflow-y: auto;
  padding-right: 2px;
}
.lock-process {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 11px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-surface);
}
.process-body {
  flex: 1;
  min-width: 0;
}
.process-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.process-title strong {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.process-pid {
  flex: none;
  font-size: 11px;
  color: var(--text-secondary);
}
.process-meta {
  display: flex;
  gap: 7px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 0;
}
.process-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.process-files {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.process-files span {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--active-bg);
  font-size: 11px;
  color: var(--text-secondary);
}
.kill-button {
  flex: none;
  color: #d9534f;
  border-color: #d9534f;
}
.kill-button:hover:not(:disabled) {
  background: rgba(217, 83, 79, 0.1);
}
.lock-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 28px 18px;
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
.lock-empty p {
  margin: 0;
  font-size: 11px;
}
.lock-empty.warning {
  border-style: solid;
  color: var(--text-primary);
}
.lock-empty.success {
  align-items: flex-start;
  text-align: left;
}
.lock-empty-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}
.lock-empty.success p {
  /* 与标题文字开头对齐，绿勾保留在文本行首。 */
  padding-left: 36px;
}
.empty-mark {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--primary-color);
  background: var(--active-bg);
  font-size: 15px;
}
</style>
