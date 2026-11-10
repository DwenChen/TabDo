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
  rules: string
  outputDirectory: string
  skills: Capability[]
  mcps: Capability[]
}

type Kind = 'node' | 'python'
type EditorMode = 'add' | 'edit' | 'npm'
type McpTool = { name: string; description?: string }
type EntryDetail<T> = { loading: true } | { value: T } | { error: string }
interface State {
  settings: Settings
  runtime: Record<Kind, { installed: boolean; version?: string; healthy?: boolean }>
  webSearchConfigured?: boolean
}

const api = window.tabdo.internal.callAi
const state = ref<State>()
const rules = ref('')
const outputDirectory = ref('')
const busy = ref(false)
const runtimeChecked = ref(false)
const mcpTools = ref(new Map<string, EntryDetail<McpTool[]>>())
const skillDescriptions = ref(new Map<string, EntryDetail<string>>())
const message = ref('')
const error = ref('')
const editor = ref<HTMLDialogElement>()
const addMenu = ref<HTMLDetailsElement[]>([])
const mode = ref<EditorMode>('add')
const editId = ref('')
const config = ref('')
const packageName = ref('')
const editorError = ref('')
const webKey = ref('')
const example = JSON.stringify(
  { mcpServers: { example: { command: 'npx', args: ['-y', 'mcp-server-example'] } } },
  null,
  2
)
const kinds = ['node', 'python'] as const
const pendingSaves = { rules: Promise.resolve(), outputDirectory: Promise.resolve() }
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
  rules.value = data.settings.rules
  outputDirectory.value = data.settings.outputDirectory
}

/**
 * 串行执行按钮操作，并将反馈放在当前页面或配置弹窗。
 * @param operation 本次设置操作。
 * @param success 成功提示。
 * @returns 操作完成的 Promise。
 */
async function run(operation: () => Promise<void>, success = ''): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  editorError.value = ''
  try {
    await operation()
    if (success) message.value = success
  } catch (failure) {
    const description = failure instanceof Error ? failure.message : String(failure)
    if (editor.value?.open) editorError.value = description
    else error.value = description
  } finally {
    busy.value = false
  }
}

/**
 * 独立保存已编辑的规则或产物路径，避免用一个表单覆盖其他设置。
 * @param field 本次编辑的字段。
 * @param value 新值。
 * @returns 保存完成的 Promise。
 */
async function saveField(field: 'rules' | 'outputDirectory', value: string): Promise<void> {
  // 同一字段保序，不阻塞另一字段或能力列表操作。
  pendingSaves[field] = pendingSaves[field].then(async () => {
    if (!state.value || state.value.settings[field] === value) return
    error.value = ''
    message.value = ''
    try {
      const saved: Settings = await api('save', { [field]: value })
      state.value.settings[field] = saved[field]
      if (field === 'outputDirectory' && outputDirectory.value === value)
        outputDirectory.value = saved.outputDirectory
      message.value = field === 'rules' ? '全局规则已更新' : '产物位置已更新'
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : String(failure)
    }
  })
  await pendingSaves[field]
}

/**
 * 选择产物位置后立即保存该字段。
 * @returns 选择完成的 Promise。
 */
async function chooseOutput(): Promise<void> {
  const directory = await api('choose-output')
  if (directory) {
    outputDirectory.value = directory
    await saveField('outputDirectory', directory)
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
 * 在编辑完成时保存搜索密钥，表单仅显示配置状态。
 * @param clear 是否移除已存的密钥。
 * @returns 设置写入完成的 Promise。
 */
async function updateWebKey(clear = false): Promise<void> {
  const value = clear ? '' : webKey.value.trim()
  if (!clear && !value) return
  await run(
    async () => {
      const configured = await api('set-web-key', value)
      if (state.value) state.value.webSearchConfigured = configured
      webKey.value = ''
    },
    clear ? 'Brave Search 密钥已移除' : 'Brave Search 密钥已保存'
  )
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
 * 执行指定内置运行时的维护操作。
 * @param kind 运行时种类。
 * @param action 更新运行时或清理额外库。
 * @returns 维护完成的 Promise。
 */
async function maintain(kind: Kind, action: 'update' | 'clean'): Promise<void> {
  const latest: State = await api('runtime', { kind, action })
  if (state.value) state.value.runtime = latest.runtime
  runtimeChecked.value = false
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
            @change="saveField('outputDirectory', outputDirectory)"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <button type="button" :disabled="busy" @click="run(chooseOutput)">选择位置</button>
          <button
            type="button"
            class="danger"
            :disabled="busy"
            @click="
              run(async () => {
                message = `已清理 ${await api('clean-outputs')} 个产物目录`
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
        <div v-if="manager.key === 'mcps'" class="builtin entry-main">
          <span class="badge mcp-badge" aria-hidden="true">C</span>
          <span>context-mode</span>
          <small>内置</small>
        </div>
        <p v-else-if="!manager.entries.length" class="empty">
          暂无 Skill，可安装含 SKILL.md 的 ZIP。
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
        <div class="runtime-content">
          <label for="call-ai-web-key">Brave Search API 密钥</label>
          <div class="path-row">
            <input
              id="call-ai-web-key"
              v-model="webKey"
              type="password"
              autocomplete="off"
              :placeholder="
                state.webSearchConfigured ? '已配置，输入可替换' : '输入 Brave Search 密钥'
              "
              :disabled="busy"
              @change="updateWebKey()"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <button
              v-if="state.webSearchConfigured"
              type="button"
              :disabled="busy"
              @click="updateWebKey(true)"
            >
              移除密钥
            </button>
          </div>
          <small>在聊天窗开启网页搜索后才可调用。直连 DeepSeek 时使用提供商密钥。</small>
        </div>
      </details>

      <details class="panel collapsible">
        <summary>全局规则</summary>
        <textarea
          id="call-ai-rules"
          v-model="rules"
          aria-label="呼叫AI全局规则"
          rows="4"
          placeholder="输入每轮对话应遵循的规则"
          @change="saveField('rules', rules)"
        />
      </details>

      <details class="panel collapsible">
        <summary>运行时与额外库</summary>
        <div class="runtime-content">
          <div v-for="kind in kinds" :key="kind" class="row runtime-row">
            <span
              >{{ kind === 'node' ? 'Node.js' : 'Python' }}
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
                @click="run(() => maintain(kind, 'update'), '内置工具已就绪')"
              >
                <span
                  :class="state.runtime[kind].installed ? 'i-z-refresh' : 'i-z-download'"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="icon-button"
                aria-label="清理额外库"
                title="清理额外库"
                :disabled="busy"
                @click="run(() => maintain(kind, 'clean'))"
              >
                <span class="i-z-trash" aria-hidden="true" />
              </button>
            </div>
          </div>
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
    <p v-if="error" role="alert" class="notice danger">{{ error }}</p>
    <p v-else-if="message" role="status" class="notice">{{ message }}</p>

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
.builtin {
  position: relative;
  border-top: 1px solid var(--divider-color);
}
.entry-main {
  padding: 7px 68px 7px 11px;
  min-height: 48px;
  box-sizing: border-box;
  gap: 10px;
}
.builtin {
  padding-left: 33px;
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
.collapsible > textarea {
  width: calc(100% - 24px);
  margin: 0 12px 10px;
}
.runtime-content {
  padding: 0 12px 10px;
}
.runtime-row {
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.runtime-row small {
  margin-left: 5px;
}
.runtime-check-mark {
  color: light-dark(#187841, #59d48c);
}
.notice {
  position: sticky;
  bottom: 0;
  width: fit-content;
  max-width: 100%;
  margin: 0 0 0 auto;
  padding: 7px 12px;
  border: 1px solid var(--control-border);
  border-radius: 7px;
  background: var(--dialog-bg);
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
