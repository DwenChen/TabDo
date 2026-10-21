<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import FinderSidebar from './finder/FinderSidebar.vue'
import FinderFooter from './finder/FinderFooter.vue'
import SplitResizer from './finder/SplitResizer.vue'
import SettingsDrawer from './finder/SettingsDrawer.vue'
import { DEFAULT_CATEGORIES, buildLocalSearchQuery } from '../utils/localSearch'
const props = defineProps({ action: { type: Object, required: true } })
const query = ref(props.action.type === 'over' ? props.action.payload : ''),
  category = ref('all'),
  sort = ref(14),
  regex = ref(false),
  matchCase = ref(false)
const instance = ref(window.tabdo.dbStorage.getItem('everything-instance') || '')
const state = ref('checking'),
  message = ref('正在检测本地 Everything…'),
  executable = ref(''),
  items = ref([]),
  total = ref(0),
  busy = ref(false),
  selected = ref(-1)
const stored = window.tabdo.dbStorage.getItem('local-search-preferences') || {}
regex.value = stored.regex === true
matchCase.value = stored.matchCase === true
const showGuide = ref(false),
  showPreview = ref(stored.preview ?? false)
const matchPath = ref(stored.matchPath ?? true)
const sidebarWidth = ref(Number.isFinite(stored.sidebarWidth) ? stored.sidebarWidth : 64)
const listWidth = ref(Number.isFinite(stored.listWidth) ? stored.listWidth : 315)
const customCategories = ref(
  Array.isArray(stored.customCategories)
    ? stored.customCategories.filter(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.label === 'string' &&
          typeof entry.rule === 'string'
      )
    : []
)
const categoryEnabled = ref(stored.categoryEnabled || {})
const categoryOrder = ref(Array.isArray(stored.categoryOrder) ? stored.categoryOrder : [])
const allCategories = computed(() => {
  const entries = [...DEFAULT_CATEGORIES, ...customCategories.value]
  const ids = [...new Set([...categoryOrder.value, ...entries.map((entry) => entry.id)])]
  return ids
    .map((id) => entries.find((entry) => entry.id === id))
    .filter(Boolean)
    .map((entry) => ({ ...entry, enabled: categoryEnabled.value[entry.id] !== false }))
})
const categories = computed(() => allCategories.value.filter((entry) => entry.enabled))
const shell = ref(null),
  shellWidth = ref(800)
const sidebarMax = computed(() =>
  Math.max(48, Math.min(260, shellWidth.value - (showPreview.value ? 480 : 200)))
)
const effectiveSidebar = computed(() =>
  Math.max(48, Math.min(sidebarWidth.value, sidebarMax.value))
)
const listMax = computed(() => Math.max(220, shellWidth.value - effectiveSidebar.value - 260))
const effectiveList = computed(() => Math.max(220, Math.min(listWidth.value, listMax.value)))
let observer
sort.value = [1, 2, 3, 4, 5, 6, 13, 14].includes(stored.sort) ? stored.sort : 14
const preview = ref(null),
  previewError = ref('')
let previewVersion = 0
let disposed = false,
  version = 0,
  timer
/**
 * 自动连接本机已运行的 Everything，未发现常用实例时兼容旧命名配置。
 * @param append 是否读取下一页。
 * @returns 查询完成后的 Promise。
 */
async function search(append = false) {
  const request = ++version
  busy.value = true
  message.value = ''
  if (!append) {
    clearPreview()
    items.value = []
    total.value = 0
    selected.value = -1
  }
  try {
    const requestOptions = {
      query: buildLocalSearchQuery(
        query.value,
        allCategories.value.find((entry) => entry.id === category.value) || DEFAULT_CATEGORIES[0],
        regex.value
      ),
      enumerate: true,
      offset: append ? items.value.length : 0,
      sort: Number(sort.value),
      regex: false,
      matchPath: matchPath.value,
      matchCase: matchCase.value,
      instance: ''
    }
    let result = await window.toolsFiles.everything(requestOptions)
    // 不让已从界面移除的旧命名输入遮蔽默认或 1.5a 实例；旧值仅作兼容回退。
    if (
      !disposed &&
      request === version &&
      ['missing', 'installed'].includes(result.state) &&
      instance.value.trim()
    )
      result = await window.toolsFiles.everything({
        ...requestOptions,
        instance: instance.value.trim()
      })
    if (disposed || request !== version) return
    state.value = result.state
    executable.value = result.executable || ''
    const messages = {
      ready: `共 ${result.total || 0} 条结果`,
      installed: '已找到 Everything，但尚未运行。请打开后重新检测。',
      missing: '未检测到可用的 Everything。请先安装并启动标准版（非 Lite）。',
      indexing: 'Everything 正在建立索引，请稍后重新检测。',
      unresponsive: 'Everything IPC 无响应，请检查是否使用相同用户权限运行。',
      unsupported: 'Everything 本地搜索仅支持 Windows。'
    }
    message.value = messages[result.state] || '请重新检测 Everything'
    items.value = append ? [...items.value, ...(result.items || [])] : result.items || []
    total.value = result.total || 0
  } catch (error) {
    if (!disposed && request === version) {
      state.value = 'error'
      message.value = error.message
    }
  } finally {
    if (!disposed && request === version) busy.value = false
  }
}
/**
 * 合并连续输入，避免每次按键创建查询；等待期间旧结果立即失效。
 * @returns 无返回值。
 */
function schedule() {
  clearTimeout(timer)
  version++
  clearPreview()
  timer = setTimeout(() => void search(), 250)
}
/**
 * 立即停止媒体预览并使在途读取失效。
 * @returns 无返回值。
 */
function clearPreview() {
  previewVersion++
  document.querySelectorAll('.search-preview audio, .search-preview video').forEach((media) => {
    media.pause()
    media.removeAttribute('src')
    media.load()
  })
  preview.value = null
  previewError.value = ''
}
/**
 * 读取当前选择的有界预览，快速切换时丢弃旧结果。
 * @param index 当前结果序号。
 * @returns 读取完成后的 Promise。
 */
async function selectResult(index) {
  if (index < 0 || index >= items.value.length) return
  selected.value = index
  clearPreview()
  if (!showPreview.value) return
  const file = items.value[index],
    request = previewVersion
  if (!file) return
  try {
    const output = await window.toolsFiles.preview(file.path)
    if (!disposed && request === previewVersion) preview.value = output
  } catch (error) {
    if (!disposed && request === previewVersion) previewError.value = error.message
  }
}
/**
 * 打开用户明确选择的结果或其所在目录，保留系统默认关联。
 * @param item 文件结果。
 * @param reveal 是否定位到资源管理器。
 * @returns 操作完成后的 Promise。
 */
async function open(item, reveal = false) {
  if (!item) return
  try {
    if (reveal) await window.tabdo.shellShowItemInFolder(item.path)
    else await window.tabdo.shellOpenPath(item.path)
  } catch (error) {
    message.value = error.message
  }
}
/**
 * 使用方向键选择结果，回车打开，Ctrl/Cmd+Enter 定位。
 * @param event 键盘事件。
 * @returns 无返回值。
 */
function keydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!items.value.length) return
    selected.value = Math.max(
      0,
      Math.min(items.value.length - 1, selected.value + (event.key === 'ArrowDown' ? 1 : -1))
    )
    void selectResult(selected.value)
    document
      .querySelector(`[data-search-index="${selected.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }
  if (event.key === 'Enter' && selected.value >= 0) {
    event.preventDefault()
    void open(items.value[selected.value], event.ctrlKey || event.metaKey)
  }
}
/**
 * 取消前台延时与结果引用；预加载作用域负责等待查询进程退出。
 * @returns 查询进程结束后的 Promise。
 */
async function dispose() {
  if (disposed) return
  disposed = true
  version++
  clearTimeout(timer)
  observer?.disconnect()
  items.value = []
  clearPreview()
  await window.toolsFiles.stopSearch()
}
/**
 * 在默认浏览器打开官方安装页面。
 * @returns 无返回值。
 */
function download() {
  window.tabdo.shellOpenExternal('https://www.voidtools.com/zh-cn/downloads/')
}
/**
 * 将文件路径复制链登记为必要任务。
 * @param file 用户明确选择的结果。
 * @returns 复制完成后的 Promise。
 */
async function copyPath(file) {
  await window.toolsLifecycle.runTask(() => window.tabdo.copyText(file.path))
}
/**
 * 为结果名称标出普通关键词，不把用户输入解释为正则表达式。
 * @param name 结果名称。
 * @returns 可安全交给模板渲染的分段。
 */
function highlight(name) {
  const term = query.value.trim()
  if (regex.value || !term || /[\s:]/.test(term)) return [{ text: name }]
  const index = (matchCase.value ? name : name.toLowerCase()).indexOf(
    matchCase.value ? term : term.toLowerCase()
  )
  if (index < 0) return [{ text: name }]
  return [
    { text: name.slice(0, index) },
    { text: name.slice(index, index + term.length), matched: true },
    { text: name.slice(index + term.length) }
  ]
}
/**
 * 把结果大小整理为紧凑的文件信息。
 * @param item 当前结果。
 * @returns 格式化大小或目录标记。
 */
function fileSize(item) {
  if (item.isDirectory) return '文件夹'
  if (!Number.isFinite(item.size)) return ''
  return item.size >= 1048576
    ? `${(item.size / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(item.size / 1024))} KB`
}
/**
 * 切换分类并合并下一次查询，避免模板依赖多语句事件表达式。
 * @param value 选中的分类标识。
 * @returns 无返回值。
 */
function chooseCategory(value) {
  clearTimeout(timer)
  category.value = value.id || value
  void search()
}
/**
 * 关闭预览时立即释放媒体；重新开启后只读取当前选择。
 * @returns 无返回值。
 */
function togglePreview() {
  if (!showPreview.value) clearPreview()
  else if (selected.value >= 0) void selectResult(selected.value)
}
/**
 * 只持久化搜索自身的布局与分组偏好，不触碰原插件命名空间。
 * @returns 无返回值。
 */
function savePreferences() {
  window.tabdo.dbStorage.setItem('local-search-preferences', {
    preview: showPreview.value,
    sort: sort.value,
    matchPath: matchPath.value,
    regex: regex.value,
    matchCase: matchCase.value,
    sidebarWidth: sidebarWidth.value,
    listWidth: listWidth.value,
    customCategories: JSON.parse(JSON.stringify(customCategories.value)),
    categoryEnabled: { ...categoryEnabled.value },
    categoryOrder: [...categoryOrder.value]
  })
}
/**
 * 保存可读的搜索方式并刷新结果，不将搜索选项混入安装指引。
 * @returns 无返回值。
 */
function searchOptionsChanged() {
  savePreferences()
  schedule()
}
/**
 * 立即应用设置变更，当前分类被隐藏时回退到第一个可见分类。
 * @returns 无返回值。
 */
function preferencesChanged() {
  if (!categories.value.some((entry) => entry.id === category.value))
    category.value = categories.value[0]?.id || 'all'
  savePreferences()
  void search()
}
/**
 * 增加自定义分类，规则在真正查询时按原插件语义归一化。
 * @param input 用户填写的名称和规则。
 * @returns 无返回值。
 */
function addCategory(input) {
  if (!input.label.trim() || !input.rule.trim() || input.rule.length > 1800) return
  customCategories.value.push({
    id: 'custom-' + crypto.randomUUID(),
    kind: 'custom',
    label: input.label.trim().slice(0, 30),
    rule: input.rule.trim()
  })
  preferencesChanged()
}
/**
 * 更新已存在的自定义分类。
 * @param id 分类标识。
 * @param input 用户填写的新名称和规则。
 * @returns 无返回值。
 */
function updateCategory(id, input) {
  const entry = customCategories.value.find((entry) => entry.id === id)
  if (!entry || !input.label.trim() || !input.rule.trim() || input.rule.length > 1800) return
  Object.assign(entry, { label: input.label.trim().slice(0, 30), rule: input.rule.trim() })
  preferencesChanged()
}
/**
 * 仅移除自定义分类，并保留其他分类偏好。
 * @param entry 需要移除的分类。
 * @returns 无返回值。
 */
function removeCategory(entry) {
  customCategories.value = customCategories.value.filter((item) => item.id !== entry.id)
  preferencesChanged()
}
/**
 * 切换分类显示状态；无可见分类时仍允许从设置中恢复。
 * @param id 分类标识。
 * @param enabled 是否显示在侧栏。
 * @returns 无返回值。
 */
function setCategoryEnabled(id, enabled) {
  categoryEnabled.value = { ...categoryEnabled.value, [id]: enabled }
  preferencesChanged()
}
/**
 * 将分类移动到指定顺序并保存。
 * @param from 原始序号。
 * @param to 目标序号。
 * @returns 无返回值。
 */
function reorderCategories(from, to) {
  const ids = allCategories.value.map((entry) => entry.id)
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return
  ids.splice(to, 0, ids.splice(from, 1)[0])
  categoryOrder.value = ids
  savePreferences()
}
/**
 * 恢复原插件默认分类顺序，保留自定义分类。
 * @returns 无返回值。
 */
function resetCategoryOrder() {
  categoryOrder.value = []
  savePreferences()
}
/**
 * 更新预览开关并释放关闭后的媒体引用。
 * @param enabled 是否显示文件预览。
 * @returns 无返回值。
 */
function setPreview(enabled) {
  showPreview.value = enabled
  togglePreview()
  savePreferences()
}
/**
 * 更新结果排序并立即刷新当前分类。
 * @param value Everything 排序编号。
 * @returns 无返回值。
 */
function setSort(value) {
  sort.value = value
  preferencesChanged()
}
/**
 * 改变路径匹配范围并刷新当前结果。
 * @param value 是否同时匹配路径。
 * @returns 无返回值。
 */
function setMatchPath(value) {
  matchPath.value = value
  preferencesChanged()
}
/**
 * 将用户焦点交还宿主原生搜索框。
 * @returns 无返回值。
 */
function focusSearch() {
  void window.tabdo.subInputFocus()
}
window.toolsLifecycle.addCleanup(dispose)
onUnmounted(dispose)
onMounted(async () => {
  observer = new ResizeObserver((entries) => {
    if (!disposed) shellWidth.value = entries[0].contentRect.width
  })
  observer.observe(shell.value)
  await window.tabdo.setSubInput(
    ({ text }) => {
      if (!disposed) {
        query.value = text
        schedule()
      }
    },
    '全盘搜索',
    true
  )
  if (disposed) return
  if (query.value) await window.tabdo.setSubInputValue(query.value)
  if (!disposed) void search()
})
</script>
<template>
  <div class="search-workspace" @keydown="keydown">
    <main
      ref="shell"
      class="finder-shell"
      :class="{ 'preview-open': showPreview }"
      :style="{
        '--sidebar-width': effectiveSidebar + 'px',
        '--result-list-width': effectiveList + 'px'
      }"
    >
      <div class="finder-sidebar-pane">
        <FinderSidebar
          :categories="categories"
          :active-category-id="category"
          @select="chooseCategory"
          @open-settings="showGuide = true"
        />
        <SplitResizer
          v-model="sidebarWidth"
          :min="48"
          :max="sidebarMax"
          :default-width="64"
          title="拖动调整侧边栏宽度，双击恢复默认"
          @change="savePreferences"
        />
      </div>
      <section class="finder-main">
        <div
          class="result-list"
          :class="{ 'preview-open': showPreview }"
          role="listbox"
          aria-label="文件搜索结果"
          :aria-busy="busy"
        >
          <div
            v-for="(item, index) in items"
            :key="item.path"
            :data-search-index="index"
            class="result-row search-result"
            :class="{ selected: selected === index, 'active-focus': selected === index }"
            role="option"
            :aria-selected="selected === index"
            tabindex="0"
            @click="selectResult(index)"
            @dblclick="open(item)"
          >
            <span class="file-icon fallback-icon" :class="{ folder: item.isDirectory }">{{
              item.isDirectory ? '▰' : item.name.split('.').pop().slice(0, 4).toUpperCase()
            }}</span>
            <span class="file-text"
              ><span class="file-name"
                ><span
                  v-for="(segment, part) in highlight(item.name)"
                  :key="part"
                  :class="{ 'highlight-match': segment.matched }"
                  >{{ segment.text }}</span
                ></span
              ><span class="file-path" :title="item.path">{{ item.path }}</span></span
            >
            <span class="file-meta"
              ><span>{{ fileSize(item) }}</span></span
            >
          </div>
          <div v-if="!items.length" class="empty-state search-empty">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path d="M7 13h14l4 5h16v22H7z" />
              <circle cx="26" cy="27" r="6" />
              <path d="m30 32 5 5" />
            </svg>
            <strong>{{
              busy
                ? '正在搜索本地文件…'
                : state === 'ready'
                  ? '当前分类没有匹配的文件'
                  : '连接 Everything，快速找到本地文件'
            }}</strong>
            <p>
              {{ state === 'ready' ? '切换分类查看文件，或在上方搜索框进一步筛选。' : message }}
            </p>
            <button v-if="!busy && state !== 'ready'" @click="showGuide = true">
              查看连接指引
            </button>
          </div>
          <button
            v-if="items.length < total"
            class="load-more"
            :disabled="busy"
            @click="search(true)"
          >
            加载更多（{{ items.length }} / {{ total }}）
          </button>
        </div>
        <SplitResizer
          v-if="showPreview"
          v-model="listWidth"
          :min="220"
          :max="listMax"
          :default-width="315"
          title="拖动调整列表宽度，双击恢复默认"
          @change="savePreferences"
        />
      </section>
      <aside v-if="showPreview" class="finder-preview-zoom search-preview" aria-label="文件预览">
        <div v-if="selected < 0" class="preview-empty">
          <span>文件预览</span>
          <p>选择一个结果查看内容</p>
          <small>双击打开 · Ctrl+Enter 定位</small>
        </div>
        <template v-else>
          <div class="preview-heading">
            <strong>{{ items[selected]?.name }}</strong>
            <div class="preview-actions">
              <button @click="open(items[selected])">打开</button
              ><button @click="open(items[selected], true)">所在位置</button
              ><button @click="copyPath(items[selected])">复制路径</button>
            </div>
          </div>
          <p v-if="previewError" class="preview-message">{{ previewError }}</p>
          <p v-else-if="!preview" class="preview-message">正在读取预览…</p>
          <div v-else class="preview-content">
            <p class="preview-meta">
              {{ fileSize(preview) }} · {{ new Date(preview.modified).toLocaleString() }}
            </p>
            <img v-if="preview.type === 'image'" :src="preview.content" :alt="preview.name" />
            <pre v-else-if="preview.type === 'text'">{{ preview.content }}</pre>
            <video
              v-else-if="preview.type === 'video'"
              :src="preview.content"
              controls
              preload="metadata"
            ></video>
            <audio
              v-else-if="preview.type === 'audio'"
              :src="preview.content"
              controls
              preload="metadata"
            ></audio>
            <div v-else-if="preview.type === 'folder'">
              <button
                v-for="entry in preview.entries"
                :key="entry.path"
                class="folder-entry"
                @dblclick="open(entry)"
              >
                {{ entry.isDirectory ? '▰' : '▫' }} {{ entry.name }}
              </button>
            </div>
            <p v-else>使用系统默认程序打开此文件。</p>
            <p v-if="preview.truncated">仅预览前部内容，打开文件可查看全部。</p>
          </div>
        </template>
      </aside>
      <FinderFooter
        class="finder-footer-bar"
        :everything-total="total"
        :sort="sort"
        :preview="showPreview"
        :status="busy ? '正在查询…' : message"
        @sort="setSort"
        @preview="setPreview"
        @request-input-focus="focusSearch"
      />
    </main>
    <SettingsDrawer
      :open="showGuide"
      :categories="allCategories"
      :match-path-enabled="matchPath"
      @close="showGuide = false"
      @add-category="addCategory"
      @update-category="updateCategory"
      @remove-category="removeCategory"
      @set-category-enabled="setCategoryEnabled"
      @set-match-path-enabled="setMatchPath"
      @reorder-categories="reorderCategories"
      @reset-category-order="resetCategoryOrder"
    >
      <template #connection
        ><section class="connection-panel" aria-label="Everything 连接指引">
          <div class="guide-heading">
            <h3>Everything 安装与配置</h3>
          </div>
          <p class="connection-state">{{ message }}</p>
          <ol>
            <li>安装标准版 Everything（Lite 不支持本地搜索连接）。</li>
            <li>打开 Everything，等待首次索引完成。</li>
            <li>在“工具 → 选项 → 常规”开启开机自动运行，建议启用 Everything 服务。</li>
          </ol>
          <p v-if="executable" class="executable">已检测到 {{ executable }}</p>
          <div class="guide-actions">
            <a href="https://www.voidtools.com/zh-cn/downloads/" @click.prevent="download"
              >前往官方下载 ↗</a
            ><button :disabled="busy" @click="search()">重新检测</button>
          </div>
        </section>
        <section class="connection-panel search-options" aria-label="搜索方式">
          <h3>搜索方式</h3>
          <label
            ><input v-model="regex" type="checkbox" @change="searchOptionsChanged" /><span
              ><strong>使用正则表达式</strong
              ><small
                >按模式搜索，例如 <code>\.pdf$</code> 匹配 PDF 文件。普通搜索无需开启。</small
              ></span
            ></label
          >
          <label
            ><input v-model="matchCase" type="checkbox" @change="searchOptionsChanged" /><span
              ><strong>区分大小写</strong
              ><small>开启后，Report 与 report 会得到不同的匹配结果。</small></span
            ></label
          >
        </section></template
      ></SettingsDrawer
    >
  </div>
</template>

<style scoped>
/* Finder/index.vue */

.finder-shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) 32px;
  height: 100vh;
  min-height: 0;
  max-height: 100vh;
  overflow: hidden;
  background: #2f3133;
  color: #f5f7fa;
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  user-select: none;
}

.finder-shell.is-resizing {
  cursor: col-resize !important;
  user-select: none !important;
}

.finder-shell.preview-open {
  grid-template-columns: var(--sidebar-width) var(--result-list-width) minmax(0, 1fr);
}

.finder-sidebar-pane {
  position: relative;
  z-index: 20;
  grid-column: 1;
  grid-row: 1 / -1;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  overflow: visible;
  display: flex;
}

.finder-sidebar-pane :deep(.finder-sidebar) {
  flex: 1;
  min-width: 0;
  width: 100%;
}

.finder-main {
  position: relative;
  z-index: 10;
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  overflow: visible;
}

.finder-preview-zoom {
  grid-column: 3;
  grid-row: 1;
}

.finder-footer-bar {
  position: relative;
  z-index: 25;
  grid-column: 2 / -1;
  grid-row: 2;
  min-width: 0;
}

.preview-open .finder-main {
  border-right: 1px solid #47494c;
}

@media (prefers-color-scheme: light) {
  .finder-shell {
    background: #f4f6f8;
    color: #1f2328;
  }

  .preview-open .finder-main {
    border-right-color: #d5dbe3;
  }
}

@media (max-width: 760px) {
  .finder-shell {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }

  .finder-shell.preview-open {
    grid-template-columns: var(--sidebar-width) var(--result-list-width) minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .finder-shell {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }

  .finder-shell.preview-open {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }
}

/* Finder/components/FinderSidebar.vue */

.finder-sidebar {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  border-right: 1px solid #47494c;
  background: #2b2d2f;
  box-sizing: border-box;
}

.sidebar-category-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px 5px 4px;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 5px 8px;
  box-sizing: border-box;
}

.category-button,
.sidebar-settings {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.category-button:focus,
.category-button:focus-visible,
.sidebar-settings:focus,
.sidebar-settings:focus-visible {
  outline: none;
}

.category-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  height: auto;
  padding: 6px 0;
  color: #c8d0db;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
  text-align: center;
  line-height: 1.25;
  box-sizing: border-box;
}

.category-button span {
  display: block;
  width: 100%;
  word-break: break-all;
  overflow-wrap: anywhere;
  white-space: normal;
  text-align: center;
}

.category-button.active {
  color: var(--primary-color);
}

.category-button:not(:disabled):active {
  opacity: 1;
}

.custom-category-button {
  color: #d4d8df;
}

.sidebar-settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: #d5d9df;
  cursor: pointer;
  border-radius: 50%;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidebar-settings:hover {
  background: #3a3d42;
  color: #ffffff;
}

.sidebar-settings-icon {
  display: block;
  width: 18px;
  height: 18px;
}

@media (prefers-color-scheme: light) {
  .finder-sidebar {
    background: #eef1f5;
    border-right-color: #d5dbe3;
  }

  .category-button {
    color: #4f5b6a;
  }

  .category-button.active {
    color: var(--primary-color-text, var(--primary-color));
  }

  .custom-category-button {
    color: #374151;
  }

  .sidebar-settings {
    color: #4f5b6a;
  }

  .sidebar-settings:hover {
    background: #dce3ec;
    color: #111827;
  }
}

/* Finder/components/FinderResultList.vue */

.result-list {
  overflow: auto;
  min-height: 0;
  height: 100%;
  outline: none;
}

.result-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  grid-template-areas:
    'icon name meta'
    'icon path path';
  column-gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 4px 12px 4px 10px;
  text-align: left;
  cursor: pointer;
  background: #303234;
  border: 0;
  border-bottom: 1px solid transparent;
  color: inherit;
  font: inherit;
  user-select: none;
}

.result-row:focus,
.result-row:focus-visible {
  outline: none;
}

.result-row:hover,
.result-row.selected {
  background: var(--primary-color-dark-subtle-hover, #3c3e40);
}

.result-row.selected {
  box-shadow: inset 2px 0 0 var(--primary-color-alpha-50);
}

.result-row.selected.active-focus,
.result-row.active-focus {
  background: var(--primary-color-dark-subtle-bg, #4a4b4d);
  box-shadow: inset 2px 0 0 var(--primary-color);
}

.file-icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  align-self: center;
  color: #cfd6df;
  background: transparent;
  font-size: 8px;
  font-weight: 700;
}

.file-icon img {
  display: block;
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.file-icon.fallback-icon {
  border: 1px solid #6a7078;
  background: #383b3f;
  box-sizing: border-box;
}

.file-text {
  display: contents;
}

.file-name {
  grid-area: name;
  overflow: hidden;
  color: #ffffff;
  font-size: 15px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path,
.file-meta {
  overflow: hidden;
  color: #9ba1a8;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path {
  grid-area: path;
  font-size: 11px;
}

.highlight-match {
  color: #ffd166;
}

.file-meta {
  grid-area: meta;
  display: grid;
  grid-template-columns: 52px 118px;
  align-items: flex-end;
  justify-content: end;
  gap: 8px;
  align-self: start;
  padding-top: 3px;
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.result-list.preview-open .file-meta {
  grid-template-columns: 52px;
}

.result-list.preview-open .file-meta span:last-child {
  display: none;
}

.empty-state {
  display: grid;
  min-height: 180px;
  place-items: center;
  color: #a6abb2;
}

.loading-state {
  align-content: center;
  gap: 10px;
}

.loading-icon {
  color: var(--primary-color);
  animation: loading-spin 0.9s linear infinite;
}

@keyframes loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-color-scheme: light) {
  .result-row {
    background: #ffffff;
    border-bottom-color: #eef1f5;
  }

  .result-row:hover,
  .result-row.selected {
    background: var(--primary-color-subtle-hover);
  }

  .result-row.selected {
    box-shadow: inset 2px 0 0 var(--primary-color-alpha-50);
  }

  .result-row.selected.active-focus,
  .result-row.active-focus {
    background: var(--primary-color-subtle-bg);
    box-shadow: inset 2px 0 0 var(--primary-color-text, var(--primary-color));
  }

  .file-name {
    color: #111827;
  }

  .file-path,
  .file-meta {
    color: #667085;
  }

  .highlight-match {
    color: #b45309;
  }

  .file-icon {
    color: #4f5b6a;
  }

  .file-icon.fallback-icon {
    border-color: #b8c0cc;
    background: #eef1f5;
  }

  .empty-state {
    color: #697386;
  }
}

@media (max-width: 760px) {
  .result-list.preview-open .result-row {
    grid-template-columns: 38px minmax(0, 1fr);
    grid-template-areas:
      'icon name'
      'icon path';
  }

  .result-list.preview-open .file-meta {
    display: none;
  }
}

@media (max-width: 560px) {
  .result-row {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .file-meta {
    display: none;
  }
}

/* 本地宿主适配：顶部输入、连接引导和有界预览；原插件布局和明暗配色保持一致。 */
.search-workspace {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  color: var(--text-primary);
  background: var(--bg-app);
  font:
    13px/1.5 'Segoe UI',
    sans-serif;
}
.search-workspace * {
  box-sizing: border-box;
}
.search-workspace button,
.search-workspace input,
.search-workspace select {
  font: inherit;
  cursor: pointer;
}
.search-workspace button:focus-visible,
.search-workspace input:focus-visible,
.search-workspace select:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
.search-header {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}
.search-header h2 {
  font-size: 14px;
  margin: 0;
  white-space: nowrap;
}
.search-box {
  display: flex;
  flex: 1;
  min-width: 100px;
  gap: 6px;
  align-items: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 7px;
  padding: 5px 8px;
}
.search-box svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--text-secondary);
  stroke-width: 1.8;
  flex-shrink: 0;
}
.search-box input {
  width: 100%;
  min-width: 0;
  cursor: text;
  border: 0;
  background: transparent;
  color: inherit;
  outline: none;
}
.search-box button,
.connection-button {
  color: var(--text-secondary);
  background: transparent;
  border: 0;
}
.connection-button {
  font-size: 11px !important;
  max-width: 110px;
}
.connection-button.connected {
  color: var(--primary-color);
}
.finder-shell {
  height: 0;
  flex: 1;
  max-height: none;
  --sidebar-width: 64px;
}
.finder-sidebar-pane {
  z-index: 20;
}
.finder-main {
  z-index: 10;
}
.search-preview {
  min-width: 0;
  overflow: auto;
  border-left: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.finder-shell {
  grid-template-rows: minmax(0, 1fr) auto;
}
.finder-footer select {
  max-width: 120px;
  border: 0;
  background: transparent;
  color: inherit;
}
.finder-footer option {
  background: var(--bg-app);
  color: var(--text-primary);
}
.finder-footer label {
  display: flex;
  gap: 4px;
  align-items: center;
  white-space: nowrap;
}
.finder-footer input {
  accent-color: var(--primary-color);
}
.finder-footer [role='status'] {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}
.search-empty {
  align-content: center;
  justify-items: center;
  gap: 12px;
  padding: 30px 20px;
  height: 100%;
  text-align: center;
}
.search-empty svg {
  width: 52px;
  height: 52px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
  opacity: 0.5;
}
.search-empty strong {
  font-size: 14px;
  font-weight: 500;
}
.search-empty p {
  font-size: 12px;
  max-width: 340px;
  margin: 0;
  line-height: 1.8;
}
.search-empty button,
.preview-actions button,
.load-more,
.guide-actions button {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 5px 10px;
  border-radius: 5px;
}
.file-icon.folder {
  color: #d39e38;
  border: 0;
  background: transparent;
  font-size: 28px;
}
.file-meta {
  grid-template-columns: auto;
}
.preview-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}
.preview-empty p {
  margin: 0;
  font-size: 12px;
}
.preview-empty small {
  opacity: 0.7;
}
.preview-heading {
  padding: 14px;
  border-bottom: 1px solid var(--border-color);
  overflow-wrap: anywhere;
}
.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  font-size: 11px;
}
.preview-content,
.preview-message {
  padding: 14px;
  overflow-wrap: anywhere;
}
.preview-meta {
  color: var(--text-secondary);
  font-size: 11px;
  margin: 0 0 14px;
}
.preview-content img,
.preview-content audio,
.preview-content video {
  max-width: 100%;
}
.preview-content pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
  font: 12px/1.7 monospace;
}
.folder-entry {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  padding: 8px;
}
.connection-panel {
  position: absolute;
  z-index: 30;
  right: 14px;
  top: 58px;
  width: min(430px, calc(100% - 28px));
  max-height: calc(100% - 78px);
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: 0 12px 40px #0003;
  line-height: 1.8;
}
.guide-heading,
.guide-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.guide-heading h3 {
  margin: 0;
  font-size: 16px;
}
.guide-heading button {
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 22px;
}
.connection-panel p,
.connection-panel li {
  font-size: 12px;
  color: var(--text-secondary);
}
.connection-panel ol {
  padding-left: 18px;
}
.connection-panel label {
  display: flex;
  align-items: center;
  gap: 12px;
}
.connection-panel input {
  flex: 1;
  min-width: 0;
  padding: 7px;
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  color: inherit;
  border-radius: 5px;
  cursor: text;
}
.connection-panel .executable {
  overflow-wrap: anywhere;
}
.guide-actions {
  margin-top: 18px;
}
.guide-actions a {
  color: var(--primary-color);
  text-decoration: none;
}
@media (max-width: 650px) {
  .search-header {
    flex-wrap: wrap;
    gap: 8px;
  }
  .search-header h2 {
    font-size: 12px;
  }
  .search-box {
    order: 3;
    flex-basis: 100%;
  }
  .connection-button {
    margin-left: auto;
    max-width: none;
  }
  .finder-shell.preview-open {
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
  }
  .search-preview {
    display: none;
  }
  .finder-footer [role='status'] {
    max-width: 100%;
  }
}
.connection-panel {
  position: static;
  width: auto;
  max-height: none;
  overflow: visible;
  box-shadow: none;
  margin-bottom: 0;
  padding: 12px 14px;
  background: transparent;
  border: 1px solid var(--border-color);
}
.search-flags {
  display: flex;
  gap: 16px;
  font-size: 12px;
}
.search-flags input[type='checkbox'] {
  flex: none;
  width: 14px;
  height: 14px;
  padding: 0;
  accent-color: var(--primary-color);
  cursor: pointer;
}
.search-options h3 {
  margin: 0 0 10px;
  font-size: 14px;
}
.search-options label {
  align-items: flex-start;
  margin: 9px 0;
  gap: 8px;
}
.search-options input[type='checkbox'] {
  flex: none;
  width: 14px;
  height: 14px;
  margin: 3px 0 0;
  padding: 0;
  accent-color: var(--primary-color);
}
.search-options span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.search-options strong {
  font-size: 12px;
  font-weight: 500;
}
.search-options small {
  font-size: 11px;
  color: var(--text-secondary);
}
.guide-heading h3 {
  font-size: 14px;
}
.guide-actions {
  margin-top: 10px;
}
.finder-shell {
  grid-template-rows: minmax(0, 1fr) 32px;
}
</style>
