<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface Capability {
  id: string
  name: string
  enabled?: boolean
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

interface Settings {
  rules: string[]
  searchProvider: SearchProvider
  outputDirectory: string
  skills: Capability[]
  mcps: Capability[]
}

type SearchProvider = 'brave' | 'bocha'
type Kind = 'node' | 'python'
type ExtraPackage = { id: string; name: string; version: string }
type EditorMode = 'add' | 'edit' | 'npm'
type McpTool = { name: string; description?: string }
type EntryDetail<T> = { loading: true } | { value: T } | { error: string }
interface State {
  settings: Settings
  runtime: Record<Kind, { installed: boolean; version?: string; healthy?: boolean }>
  webSearchConfigured: Record<SearchProvider, boolean>
}

const api = window.tabdo.internal.callAi
const state = ref<State>()
const ruleIndex = ref<number>()
const ruleText = ref('')
const ruleError = ref('')
const outputDirectory = ref('')
const busy = ref(false)
const runtimeChecked = ref(false)
const libraries = ref<Partial<Record<Kind, EntryDetail<ExtraPackage[]>>>>({})
const selectedLibraries = ref<Record<Kind, string[]>>({ node: [], python: [] })
const mcpTools = ref(new Map<string, EntryDetail<McpTool[]>>())
const skillDescriptions = ref(new Map<string, EntryDetail<string>>())
const error = ref('')
const editor = ref<HTMLDialogElement>()
const addMenu = ref<HTMLDetailsElement[]>([])
const mode = ref<EditorMode>('add')
const editId = ref('')
const config = ref('')
const packageName = ref('')
const editorError = ref('')
const webKey = ref('')
const webError = ref('')
const searchNames = { brave: 'Brave Search', bocha: '博查搜索' }
const example = JSON.stringify(
  { mcpServers: { example: { command: 'npx', args: ['-y', 'mcp-server-example'] } } },
  null,
  2
)
const kinds = ['node', 'python'] as const
const runtimeNames = { node: 'Node.js', python: 'Python' }
let pendingOutputSave = Promise.resolve()
const managers = computed(() => [
  {
    key: 'mcps' as const,
    label: 'MCP',
    entries:
      state.value?.settings.mcps.map((entry) => ({
        entry,
        detail: mcpTools.value.get(entry.id)
      })) ?? []
  },
  {
    key: 'skills' as const,
    label: 'Skill',
    entries:
      state.value?.settings.skills.map((entry) => ({
        entry,
        detail: skillDescriptions.value.get(entry.id)
      })) ?? []
  }
])

/**
 * 初次读取配置与运行时状态。
 * @returns 页面加载完成的 Promise。
 */
async function initialize(): Promise<void> {
  const data: State = await api('state')
  state.value = data
  outputDirectory.value = data.settings.outputDirectory
}

/**
 * 串行执行按钮操作，并将反馈放在当前页面或配置弹窗。
 * @param operation 本次设置操作。
 * @returns 操作完成的 Promise。
 */
async function run(operation: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  editorError.value = ''
  try {
    await operation()
  } catch (failure) {
    const description = failure instanceof Error ? failure.message : String(failure)
    if (editor.value?.open) editorError.value = description
    else error.value = description
  } finally {
    busy.value = false
  }
}

/**
 * 保序写入结果目录，避免先前的输入覆盖较新的选择。
 * @param value 用户编辑或选中的路径。
 * @returns 本次路径保存完成的 Promise。
 */
async function saveOutput(value: string): Promise<void> {
  // 只更新目录字段，其他设置由各自操作负责。
  pendingOutputSave = pendingOutputSave.then(async () => {
    if (!state.value || state.value.settings.outputDirectory === value) return
    error.value = ''
    try {
      const saved: Settings = await api('save', { outputDirectory: value })
      state.value.settings.outputDirectory = saved.outputDirectory
      if (outputDirectory.value === value) outputDirectory.value = saved.outputDirectory
    } catch (failure) {
      error.value = (failure as Error).message
    }
  })
  await pendingOutputSave
}

/**
 * 展开规则编辑区，新增时使用列表末尾的位置。
 * @param index 编辑位置或新增位置。
 * @returns 无返回值。
 */
function editRule(index: number): void {
  ruleError.value = ''
  ruleIndex.value = index
  ruleText.value = state.value?.settings.rules[index] ?? ''
}

/**
 * 关闭规则编辑区并清除本次保存的提示。
 * @returns 无返回值。
 */
function cancelRule(): void {
  ruleIndex.value = undefined
  ruleError.value = ''
}

/**
 * 新增、更新或删除单条规则，写入成功后再更新显示。
 * @param index 本次操作的位置。
 * @param value 新文本，省略时删除该条。
 * @returns 本次规则保存完成的 Promise。
 */
async function saveRule(index: number, value?: string): Promise<void> {
  const data = state.value
  if (!data) return
  await run(async () => {
    ruleError.value = ''
    try {
      const rules = [...data.settings.rules]
      // 失败时保留已保存列表和当前草稿。
      if (value === undefined) rules.splice(index, 1)
      else rules.splice(index, 1, value.trim())
      const saved: Settings = await api('save', { rules })
      data.settings.rules = saved.rules
      ruleIndex.value = undefined
    } catch (failure) {
      ruleError.value = (failure as Error).message
    }
  })
}

/**
 * 选择产物位置后立即保存该字段。
 * @returns 选择完成的 Promise。
 */
async function chooseOutput(): Promise<void> {
  const directory = await api('choose-output')
  if (directory) {
    outputDirectory.value = directory
    await saveOutput(directory)
  }
}

/**
 * 执行设置页能力操作，仅合并当前管理组的最新列表。
 * @param key Skill 或 MCP 设置键。
 * @param operation IPC 操作。
 * @param input 操作参数。
 * @returns 列表更新完成的 Promise。
 */
async function updateList(
  key: 'skills' | 'mcps',
  operation: string,
  input?: unknown
): Promise<void> {
  const saved: Settings = await api(operation, input)
  if (state.value) state.value.settings[key] = saved[key]
  if (key === 'mcps') mcpTools.value.clear()
}

/**
 * 刷新两个能力列表，保留正在编辑的字段。
 * @returns 列表刷新完成的 Promise。
 */
async function refreshLists(): Promise<void> {
  const latest: State = await api('state')
  if (state.value) {
    state.value.settings.mcps = latest.settings.mcps
    state.value.settings.skills = latest.settings.skills
    mcpTools.value.clear()
  }
}

/**
 * 展开已安装 Skill 时读取其描述，关闭再展开可重试。
 * @param event 当前条目的展开事件。
 * @param id 已安装的 Skill 标识。
 * @returns 本次描述读取完成的 Promise。
 */
async function showSkillDescription(event: Event, id: string): Promise<void> {
  if (!(event.currentTarget as HTMLDetailsElement).open) return
  if ('loading' in (skillDescriptions.value.get(id) ?? {})) return
  skillDescriptions.value.set(id, { loading: true })
  try {
    skillDescriptions.value.set(id, { value: await api('skill-description', id) })
  } catch (failure) {
    skillDescriptions.value.set(id, { error: (failure as Error).message })
  }
}

/**
 * 按用户点击临时连接 MCP，并将发现结果或错误显示在当前条目。
 * @param id 已保存的 MCP 标识。
 * @returns 查询及连接释放完成的 Promise。
 */
async function showMcpTools(id: string): Promise<void> {
  await run(async () => {
    mcpTools.value.set(id, { loading: true })
    try {
      mcpTools.value.set(id, { value: await api('mcp-tools', id) })
    } catch (failure) {
      mcpTools.value.set(id, { error: (failure as Error).message })
    }
  })
}

/**
 * 切换通用搜索服务，分别保留各服务的密钥。
 * @param event 原生下拉选择事件。
 * @returns 服务切换完成的 Promise。
 */
async function changeSearchProvider(event: Event): Promise<void> {
  const select = event.target as HTMLSelectElement
  const data = state.value
  if (!data) return
  await run(async () => {
    webError.value = ''
    try {
      const saved: Settings = await api('save', { searchProvider: select.value })
      data.settings.searchProvider = saved.searchProvider
      webKey.value = ''
    } catch (failure) {
      webError.value = (failure as Error).message
    }
  })
  select.value = data.settings.searchProvider
}

/**
 * 保存当前服务的密钥，界面只显示配置状态。
 * @param clear 是否移除当前服务的密钥。
 * @returns 密钥写入完成的 Promise。
 */
async function updateWebKey(clear = false): Promise<void> {
  const data = state.value
  const key = clear ? '' : webKey.value.trim()
  if (!data || (!clear && !key)) return
  const provider = data.settings.searchProvider
  await run(async () => {
    webError.value = ''
    try {
      data.webSearchConfigured[provider] = await api('set-web-key', { provider, key })
      webKey.value = ''
    } catch (failure) {
      webError.value = (failure as Error).message
    }
  })
}

/**
 * 立即保存单项能力的启用状态。
 * @param key Skill 或 MCP 设置键。
 * @param entry 当前条目。
 * @returns 保存结束的 Promise。
 */
async function toggle(key: 'skills' | 'mcps', entry: Capability): Promise<void> {
  const input = { id: entry.id, enabled: entry.enabled === false }
  await run(() =>
    key === 'skills'
      ? updateList(key, 'toggle-skill', input)
      : updateList(key, 'configure-mcp', { action: 'toggle', ...input })
  )
}

/**
 * 打开添加、编辑或安装 MCP 的弹窗。
 * @param nextMode 配置方式。
 * @param entry 编辑时的已保存条目。
 * @returns 无返回值。
 */
function openEditor(nextMode: EditorMode, entry?: Capability): void {
  if (addMenu.value[0]) addMenu.value[0].open = false
  mode.value = nextMode
  editId.value = entry?.id ?? ''
  editorError.value = ''
  packageName.value = ''
  config.value = entry
    ? JSON.stringify(
        {
          mcpServers: {
            [entry.id]: {
              name: entry.name,
              ...(entry.url ? { url: entry.url } : { command: entry.command, args: entry.args }),
              ...(entry.env ? { env: entry.env } : {}),
              ...(entry.headers ? { headers: entry.headers } : {})
            }
          }
        },
        null,
        2
      )
    : ''
  editor.value?.showModal()
}

/**
 * 确认当前 MCP 弹窗，成功后立即更新列表。
 * @returns 写入完成的 Promise。
 */
async function submitEditor(): Promise<void> {
  await run(async () => {
    if (mode.value === 'npm') await updateList('mcps', 'install-mcp', packageName.value.trim())
    else
      await updateList('mcps', 'configure-mcp', {
        action: mode.value,
        id: editId.value,
        json: config.value
      })
    editor.value?.close()
  })
}

/**
 * 安装或更新指定的内置运行时。
 * @param kind 运行时种类。
 * @returns 维护完成的 Promise。
 */
async function updateRuntime(kind: Kind): Promise<void> {
  const latest: State = await api('runtime', { kind, action: 'update' })
  if (state.value) state.value.runtime = latest.runtime
  runtimeChecked.value = false
}
/**
 * 在额外库清单展开后读取本地安装信息。
 * @param kind 运行时种类。
 * @param event 折叠项的切换事件。
 * @returns 列表刷新结束的 Promise。
 */
async function toggleLibraries(kind: Kind, event: Event): Promise<void> {
  if ((event.currentTarget as HTMLDetailsElement).open) await refreshLibraries(kind)
}
/**
 * 获取最新库名并保留仍然有效的勾选。
 * @param kind 运行时种类。
 * @returns 列表及选择状态刷新完成的 Promise。
 */
async function refreshLibraries(kind: Kind): Promise<void> {
  libraries.value[kind] = { loading: true }
  try {
    const value: ExtraPackage[] = await api('packages', kind)
    libraries.value[kind] = { value }
    const ids = new Set(value.map(({ id }) => id))
    selectedLibraries.value[kind] = selectedLibraries.value[kind].filter((id) => ids.has(id))
  } catch (failure) {
    libraries.value[kind] = {
      error: failure instanceof Error ? failure.message : String(failure)
    }
  }
}
/**
 * 请求主进程确认并清理指定运行时的额外库，然后重新读取列表。
 * @param kind 运行时种类。
 * @param all 是否清空此运行时的额外库。
 * @returns 清理及列表刷新完成的 Promise。
 */
async function cleanLibraries(kind: Kind, all: boolean): Promise<void> {
  await run(async () => {
    try {
      await api('runtime', {
        kind,
        action: 'clean',
        ids: all ? undefined : [...selectedLibraries.value[kind]]
      })
    } finally {
      await refreshLibraries(kind)
    }
  })
}

/**
 * 运行两个解释器的状态检查，并在本行确认已完成。
 * @returns 本次检查完成的 Promise。
 */
async function checkRuntime(): Promise<void> {
  runtimeChecked.value = false
  const checked: State = await api('check')
  if (state.value) state.value.runtime = checked.runtime
  runtimeChecked.value = true
}

onMounted(() => {
  void run(initialize)
})
onBeforeUnmount(() => {
  // 设置路由切换会保留 WebContents，主动通知主进程回收查询。
  if ([...mcpTools.value.values()].some((detail) => 'loading' in detail))
    void api('cancel-mcp-tools').catch(() => {})
})
</script>

<template>
  <main class="call-ai-setting" aria-label="呼叫AI设置" data-testid="call-ai-setting">
    <template v-if="state">
      <section class="panel output-panel">
        <label for="call-ai-output">结果产物默认位置</label>
        <div class="path-row">
          <input
            id="call-ai-output"
            v-model="outputDirectory"
            @change="saveOutput(outputDirectory)"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <button type="button" :disabled="busy" @click="run(chooseOutput)">选择位置</button>
          <button
            type="button"
            class="danger"
            :disabled="busy"
            @click="
              run(async () => {
                await api('clean-outputs')
              })
            "
          >
            一键清理
          </button>
        </div>
      </section>

      <section v-for="manager in managers" :key="manager.key" class="panel">
        <header class="row panel-header">
          <h2>{{ manager.label }}</h2>
          <div class="manager-actions">
            <button
              type="button"
              class="icon-button"
              :disabled="busy"
              :aria-label="`刷新 ${manager.label}`"
              :title="`刷新 ${manager.label}`"
              @click="run(refreshLists)"
            >
              <span class="i-z-refresh" aria-hidden="true" />
            </button>
            <details v-if="manager.key === 'mcps'" ref="addMenu" class="add-menu">
              <summary class="button accent-action" :aria-disabled="busy">添加</summary>
              <div class="menu">
                <button type="button" :disabled="busy" @click="openEditor('add')">手动配置</button>
                <button type="button" :disabled="busy" @click="openEditor('npm')">
                  安装 npm 包
                </button>
              </div>
            </details>
            <button
              v-else
              type="button"
              class="accent-action"
              :disabled="busy"
              @click="run(() => updateList('skills', 'install-skill'))"
            >
              添加
            </button>
          </div>
        </header>
        <p v-if="!manager.entries.length" class="empty">
          {{ manager.key === 'mcps' ? '暂无 MCP' : '暂无 Skill，可安装含 SKILL.md 的 ZIP。' }}
        </p>
        <div v-for="{ entry, detail } in manager.entries" :key="entry.id" class="entry">
          <details @toggle="manager.key === 'skills' && showSkillDescription($event, entry.id)">
            <summary class="entry-main" :title="entry.name">
              <span class="chevron" aria-hidden="true">›</span>
              <span
                class="badge"
                :class="manager.key === 'mcps' ? 'mcp-badge' : 'skill-badge'"
                aria-hidden="true"
              >
                {{ entry.name.slice(0, 1).toUpperCase() }}
              </span>
              <span class="entry-name">{{ entry.name }}</span>
            </summary>
            <div class="row entry-details">
              <code :title="entry.id">{{ entry.id }}</code>
              <div class="buttons">
                <button
                  v-if="manager.key === 'mcps'"
                  type="button"
                  :disabled="busy"
                  title="临时连接此 MCP 读取工具清单"
                  @click="showMcpTools(entry.id)"
                >
                  查看工具
                </button>
                <button
                  v-if="manager.key === 'mcps'"
                  type="button"
                  :disabled="busy"
                  @click="openEditor('edit', entry)"
                >
                  编辑
                </button>
                <button
                  v-if="manager.key === 'mcps'"
                  type="button"
                  class="danger"
                  :disabled="busy"
                  @click="
                    run(() =>
                      updateList('mcps', 'configure-mcp', { action: 'remove', id: entry.id })
                    )
                  "
                >
                  移除配置
                </button>
                <button
                  v-else
                  type="button"
                  class="danger"
                  :disabled="busy"
                  @click="run(() => updateList('skills', 'remove-skill', entry.id))"
                >
                  卸载
                </button>
              </div>
            </div>
            <div v-if="detail" class="capability-detail">
              <span v-if="'loading' in detail" role="status">正在读取…</span>
              <span v-else-if="'error' in detail" class="danger" role="alert">
                {{ detail.error }}
              </span>
              <template v-else-if="typeof detail.value === 'string'">
                {{ detail.value || '此 Skill 未声明描述。' }}
              </template>
              <ul v-else-if="detail.value.length" class="mcp-tool-list" aria-label="MCP 工具">
                <li v-for="(tool, index) in detail.value" :key="index">
                  <code>{{ tool.name }}</code>
                  <small v-if="tool.description">{{ tool.description }}</small>
                </li>
              </ul>
              <span v-else>此 MCP 未提供工具。</span>
            </div>
          </details>
          <button
            type="button"
            class="switch"
            role="switch"
            :aria-label="`启用 ${entry.name}`"
            :aria-checked="entry.enabled !== false"
            :disabled="busy"
            @click="toggle(manager.key, entry)"
          >
            <span />
          </button>
        </div>
      </section>

      <details class="panel collapsible">
        <summary>网页搜索</summary>
        <div class="runtime-content search-settings">
          <label for="call-ai-search-provider">搜索服务</label>
          <select
            id="call-ai-search-provider"
            :value="state.settings.searchProvider"
            :disabled="busy"
            @change="changeSearchProvider"
          >
            <option value="brave">Brave Search</option>
            <option value="bocha">博查搜索</option>
          </select>
          <label for="call-ai-web-key"
            >{{ searchNames[state.settings.searchProvider] }} API 密钥</label
          >
          <div class="path-row">
            <input
              :key="state.settings.searchProvider"
              id="call-ai-web-key"
              v-model="webKey"
              type="password"
              autocomplete="off"
              :placeholder="
                state.webSearchConfigured[state.settings.searchProvider]
                  ? '已配置，输入可替换'
                  : '输入 API 密钥'
              "
              :disabled="busy"
              @change="updateWebKey()"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <button
              v-if="state.webSearchConfigured[state.settings.searchProvider]"
              type="button"
              :disabled="busy"
              @click="updateWebKey(true)"
            >
              移除密钥
            </button>
          </div>
          <small>在聊天窗开启网页搜索后才可调用。直连 DeepSeek 时使用提供商密钥。</small>
          <p v-if="webError" class="danger" role="alert">{{ webError }}</p>
        </div>
      </details>

      <details class="panel collapsible">
        <summary>全局规则</summary>
        <div class="runtime-content">
          <div class="row">
            <small>规则会按列表顺序应用到每轮对话。</small>
            <button
              type="button"
              class="primary"
              :disabled="busy || ruleIndex !== undefined"
              @click="editRule(state.settings.rules.length)"
            >
              添加规则
            </button>
          </div>
          <p v-if="!state.settings.rules.length && ruleIndex === undefined" class="empty">
            暂无全局规则
          </p>
          <ol v-if="state.settings.rules.length" class="rule-list">
            <li v-for="(rule, index) in state.settings.rules" :key="index">
              <span>{{ rule }}</span>
              <div class="buttons">
                <button
                  type="button"
                  class="icon-button"
                  :aria-label="`编辑规则 ${index + 1}`"
                  title="编辑规则"
                  :disabled="busy || ruleIndex !== undefined"
                  @click="editRule(index)"
                >
                  <span class="i-z-edit" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="icon-button"
                  :aria-label="`删除规则 ${index + 1}`"
                  title="删除规则"
                  :disabled="busy || ruleIndex !== undefined"
                  @click="saveRule(index)"
                >
                  <span class="i-z-trash" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ol>
          <form
            v-if="ruleIndex !== undefined"
            class="rule-editor"
            @submit.prevent="saveRule(ruleIndex, ruleText)"
          >
            <label for="call-ai-rule">{{
              ruleIndex === state.settings.rules.length ? '添加规则' : `编辑规则 ${ruleIndex + 1}`
            }}</label>
            <textarea
              id="call-ai-rule"
              v-model="ruleText"
              rows="3"
              maxlength="100000"
              placeholder="输入一条规则"
              :disabled="busy"
            />
            <div class="buttons">
              <button type="button" :disabled="busy" @click="cancelRule">取消</button>
              <button type="submit" class="primary" :disabled="busy || !ruleText.trim()">
                保存规则
              </button>
            </div>
          </form>
          <p v-if="ruleError" class="danger" role="alert">{{ ruleError }}</p>
        </div>
      </details>

      <details class="panel collapsible">
        <summary>运行时与额外库</summary>
        <div class="runtime-content">
          <section v-for="kind in kinds" :key="kind" class="runtime-group">
            <div class="row runtime-row">
              <span
                >{{ runtimeNames[kind] }}
                <small
                  >{{ state.runtime[kind].installed ? state.runtime[kind].version : '尚未安装' }}
                  {{
                    state.runtime[kind].healthy === undefined
                      ? ''
                      : state.runtime[kind].healthy
                        ? ' · 正常'
                        : ' · 检查失败'
                  }}
                </small>
              </span>
              <div class="buttons">
                <button
                  type="button"
                  class="icon-button"
                  :aria-label="state.runtime[kind].installed ? '更新' : '安装'"
                  :title="state.runtime[kind].installed ? '更新' : '安装'"
                  :disabled="busy"
                  @click="run(() => updateRuntime(kind))"
                >
                  <span
                    :class="state.runtime[kind].installed ? 'i-z-refresh' : 'i-z-download'"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
            <details class="extra-libraries" @toggle="toggleLibraries(kind, $event)">
              <summary :aria-label="`${runtimeNames[kind]} 额外库`">额外库</summary>
              <template v-if="libraries[kind]" v-for="list in [libraries[kind]!]" :key="kind">
                <p v-if="'loading' in list" class="library-note" role="status">正在读取额外库…</p>
                <p v-else-if="'error' in list" class="library-note danger" role="alert">
                  {{ list.error }}
                </p>
                <p v-else-if="!list.value.length" class="library-note">暂无额外库</p>
                <ul v-else class="library-list">
                  <li v-for="item in list.value" :key="item.id">
                    <label class="library-entry">
                      <input
                        v-model="selectedLibraries[kind]"
                        type="checkbox"
                        :value="item.id"
                        :disabled="busy"
                      />
                      <span>{{ item.name }}</span>
                      <small v-if="item.version">{{ item.version }}</small>
                    </label>
                  </li>
                </ul>
                <div v-if="!('loading' in list)" class="buttons library-actions">
                  <button
                    type="button"
                    :disabled="busy || !selectedLibraries[kind].length || !('value' in list)"
                    @click="cleanLibraries(kind, false)"
                  >
                    清理所选<span v-if="selectedLibraries[kind].length"
                      >（{{ selectedLibraries[kind].length }}）</span
                    >
                  </button>
                  <button type="button" :disabled="busy" @click="cleanLibraries(kind, true)">
                    全部清理
                  </button>
                </div>
              </template>
            </details>
          </section>
          <div class="row">
            <div class="buttons">
              <button type="button" :disabled="busy" @click="run(checkRuntime)">检查状态</button>
              <span
                v-if="runtimeChecked && !busy"
                class="runtime-check-mark i-z-check"
                aria-hidden="true"
              />
            </div>
            <small role="status">{{
              busy ? '正在处理…' : runtimeChecked ? '状态已检查' : ''
            }}</small>
          </div>
        </div>
      </details>
    </template>
    <div v-if="error" class="row notice danger" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="error = ''">关闭提示</button>
    </div>

    <dialog
      ref="editor"
      aria-labelledby="call-ai-mcp-title"
      @cancel="busy && $event.preventDefault()"
    >
      <form class="editor-form" @submit.prevent="submitEditor">
        <h2 id="call-ai-mcp-title">
          {{ mode === 'npm' ? '安装 npm MCP 包' : mode === 'edit' ? '编辑 MCP' : '手动配置' }}
        </h2>
        <label v-if="mode === 'npm'">
          npm 包名
          <input v-model="packageName" placeholder="包名或包名@版本" :disabled="busy" required />
        </label>
        <label v-else>
          MCP 配置 JSON
          <textarea
            v-model="config"
            :placeholder="example"
            :disabled="busy"
            rows="11"
            spellcheck="false"
            required
          />
        </label>
        <p v-if="editorError" role="alert" class="danger">{{ editorError }}</p>
        <footer class="row">
          <small>{{ busy ? '正在处理…' : '请确认来源可信。' }}</small>
          <div class="buttons">
            <button type="button" :disabled="busy" @click="editor?.close()">取消</button>
            <button class="primary" type="submit" :disabled="busy">确认</button>
          </div>
        </footer>
      </form>
    </dialog>
  </main>
</template>

<style scoped>
.call-ai-setting {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: 20px clamp(14px, 3vw, 30px);
  color: var(--text-color);
}
h2,
.output-panel label,
.collapsible > summary {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.panel {
  max-width: 900px;
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  margin-bottom: 12px;
}
.row,
.path-row,
.buttons,
.entry-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row {
  justify-content: space-between;
}
.output-panel,
.panel-header {
  padding: 10px 12px;
}
.path-row {
  margin-top: 7px;
}
button,
.button,
input,
textarea {
  box-sizing: border-box;
  border: 1px solid var(--control-border);
  background: var(--control-bg);
  border-radius: 7px;
  font: inherit;
  color: inherit;
}
button,
.button,
input {
  min-height: 34px;
  padding: 0 10px;
}
button,
.button {
  cursor: pointer;
  white-space: nowrap;
}
button:hover:not(:disabled),
.button:hover {
  background: var(--hover-bg);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
input,
textarea {
  width: 100%;
  min-width: 0;
}
textarea {
  padding: 8px 10px;
  resize: vertical;
}
input:focus-visible,
textarea:focus-visible,
summary:focus-visible,
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}
small,
.empty {
  color: var(--text-secondary);
  font-size: 12px;
}
.empty {
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--divider-color);
}
.entry,
.entry-main {
  padding: 7px 68px 7px 11px;
  min-height: 48px;
  box-sizing: border-box;
  gap: 10px;
}
.entry-name,
.entry-details code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-details {
  padding: 3px 12px 9px 33px;
  flex-wrap: wrap;
}
.capability-detail {
  margin: 0 12px 10px 33px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.mcp-tool-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mcp-tool-list small {
  display: block;
}
.chevron {
  color: var(--text-secondary);
  width: 12px;
  font-size: 17px;
}
details[open] > summary .chevron {
  transform: rotate(90deg);
}
.badge {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 7px;
  color: white;
  font-weight: 600;
}
.mcp-badge,
.skill-badge {
  background: var(--primary-color);
}
button.switch {
  position: absolute;
  right: 12px;
  top: 14px;
  display: flex;
  align-items: center;
  min-height: 0;
  width: 36px;
  height: 21px;
  padding: 2px;
  border-radius: 20px;
  background: #7778;
}
.switch[aria-checked='true'] {
  background: var(--primary-color);
}
.switch span {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: white;
}
.switch[aria-checked='true'] span {
  margin-left: auto;
}
summary {
  cursor: pointer;
}
.entry-main,
.button {
  list-style: none;
}
.entry-main::-webkit-details-marker,
.button::-webkit-details-marker {
  display: none;
}
.button,
.icon-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.manager-actions {
  display: grid;
  grid-template-columns: 34px 112px;
  gap: 8px;
  align-items: center;
}
.manager-actions .accent-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: var(--primary-light-bg);
}
.manager-actions .accent-action:hover:not(:disabled) {
  background: var(--hover-bg);
}
.icon-button {
  justify-content: center;
  width: 34px;
  padding: 0;
}
.add-menu {
  position: relative;
}
.menu {
  position: absolute;
  z-index: 2;
  top: calc(100% + 4px);
  right: 0;
  padding: 4px;
  border: 1px solid var(--control-border);
  border-radius: 8px;
  background: var(--dialog-bg);
  box-shadow: 0 5px 16px #0002;
}
.menu button {
  width: 100%;
  border-color: transparent;
  background: transparent;
  text-align: left;
}
.collapsible > summary {
  padding: 10px 12px;
}
.runtime-content {
  padding: 0 12px 10px;
}
.runtime-row {
  flex-wrap: wrap;
}
.runtime-group {
  display: grid;
  gap: 5px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--divider-color);
}
.extra-libraries > summary {
  width: fit-content;
  padding: 5px 0;
}
.library-list {
  list-style: none;
  margin: 4px 0;
  padding: 0;
}
.library-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding-inline: 6px;
  border-radius: 7px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.library-entry:hover {
  background: var(--hover-bg);
}
.library-entry input {
  flex: none;
  width: 16px;
  min-height: 16px;
  margin: 0;
  accent-color: var(--primary-color);
}
.library-note {
  margin: 4px 0 8px;
  font-size: 12px;
}
.library-actions {
  flex-wrap: wrap;
  margin-top: 6px;
}
.runtime-row small {
  margin-left: 5px;
}
.runtime-check-mark {
  color: light-dark(#187841, #59d48c);
}
.search-settings,
.rule-editor {
  display: grid;
  gap: 8px;
}
.search-settings select {
  justify-self: start;
  color: inherit;
  background: var(--dialog-bg);
  border: 1px solid var(--control-border);
  border-radius: 7px;
  padding: 5px 8px;
}
.rule-list {
  margin-block: 8px;
  padding-inline-start: 1.6rem;
}
.rule-list li {
  padding: 6px 0;
  border-bottom: 1px solid var(--control-border);
}
.rule-list li > span {
  display: inline-block;
  width: calc(100% - 80px);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.rule-list .buttons {
  display: inline-flex;
  vertical-align: top;
}
.rule-editor .buttons {
  justify-self: end;
}
.notice {
  gap: 8px;
  padding: 7px 12px;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.danger {
  color: var(--danger-color, #c84b4b);
}
dialog {
  position: fixed;
  inset: 0;
  box-sizing: border-box;
  width: min(580px, calc(100% - 32px));
  height: fit-content;
  max-height: calc(100% - 32px);
  margin: auto;
  overflow: auto;
  border: 1px solid var(--divider-color);
  border-radius: 12px;
  padding: 16px;
  color: inherit;
  background: var(--dialog-bg);
}
dialog::backdrop {
  background: #0005;
}
.editor-form {
  display: grid;
  gap: 12px;
}
.editor-form label {
  display: grid;
  gap: 5px;
}
.editor-form textarea {
  font:
    12px/1.55 Consolas,
    monospace;
}
.editor-form .danger {
  margin: 0;
}
button.primary {
  background: var(--primary-color);
  color: white;
}
@media (max-width: 640px) {
  .path-row {
    flex-wrap: wrap;
  }
  .path-row input {
    flex-basis: 100%;
  }
}
</style>
