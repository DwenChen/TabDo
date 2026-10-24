<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  BUILTIN_CAPABILITIES,
  ONLINE_TRANSLATOR_IDS,
  type BuiltinCapability
} from '@shared/builtinProviders'
import type { ProviderEntry, ProviderSettings } from '@shared/providerShared'
import { useToast } from '@/components'

const props = defineProps<{ type: 'translation' | 'ocr' }>()
const api = window.tabdo.internal.providers
const { success, error, confirm } = useToast()
const settings = ref<ProviderSettings>({ enabled: {}, defaultId: {}, params: {} })
const external = ref<ProviderEntry[]>([])
const state = ref<any>({ engines: {}, models: [] })
const drafts = ref<Record<string, Record<string, any>>>({})
const onlineId = ref('builtin-google')
const busy = ref(new Set<string>())
const loading = ref(true)
const languages = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁体中文'],
  ['en', '英语'],
  ['ja', '日语'],
  ['ko', '韩语'],
  ['fr', '法语'],
  ['de', '德语'],
  ['es', '西班牙语'],
  ['ru', '俄语'],
  ['pt', '葡萄牙语'],
  ['it', '意大利语']
]
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
const cards = computed(() =>
  props.type === 'translation'
    ? BUILTIN_CAPABILITIES.filter(
        (entry) =>
          entry.id === 'builtin-bergamot' ||
          entry.id === onlineId.value ||
          entry.id === 'builtin-ai-translation'
      )
    : BUILTIN_CAPABILITIES.filter((entry) => entry.group !== 'translation')
)

/**
 * 判断统一配置中的开关状态。
 * @param entry 内置能力元数据。
 * @returns 当前能力是否启用。
 */
function enabled(entry: BuiltinCapability): boolean {
  return entry.group === 'translation' || entry.group === 'ocr'
    ? settings.value.enabled[entry.group]?.includes(entry.id) === true
    : settings.value.params[entry.id]?.enabled === true
}

/**
 * 格式化离线资源状态，停用与磁盘安装状态分别展示。
 * @param entry 内置能力元数据。
 * @returns 用户可读的下载状态。
 */
function engineText(entry: BuiltinCapability): string {
  const engine = entry.engine && state.value.engines[entry.engine]
  if (!engine) return ''
  if (engine.status === 'downloading')
    return `正在下载${engine.percent === undefined ? '…' : ` ${engine.percent}%`}`
  if (engine.status === 'error') return engine.error || '下载失败，请重试'
  return engine.installed ? '资源已安装，使用时加载引擎' : '资源未安装，启用后自动下载'
}

/**
 * 加载共享设置，表单草稿仅在首次加载时初始化。
 * @returns 加载结束后的 Promise。
 */
async function load(): Promise<void> {
  try {
    const [configuration, builtin, providers] = await Promise.all([
      api.getSettings(),
      api.getBuiltinState(),
      api.getAll(props.type)
    ])
    if (disposed) return
    if (!configuration.success || !configuration.data)
      throw new Error(configuration.error || '加载提供商失败')
    settings.value = configuration.data
    state.value = builtin
    external.value = (providers.data || []).filter((entry) => entry.source === 'plugin')
    drafts.value = Object.fromEntries(
      BUILTIN_CAPABILITIES.map((entry) => [
        entry.id,
        { from: 'auto', to: 'zh-CN', ...settings.value.params[entry.id] }
      ])
    )
    const current = settings.value.defaultId.translation
    if (current && ONLINE_TRANSLATOR_IDS.includes(current)) onlineId.value = current
  } catch (failure) {
    error(String(failure instanceof Error ? failure.message : failure))
  } finally {
    if (!disposed) loading.value = false
  }
}

/**
 * 只轮询下载状态，避免覆盖用户正在输入的凭据。
 * @returns 本轮读取结束后的 Promise。
 */
async function poll(): Promise<void> {
  try {
    const next = await api.getBuiltinState()
    if (!disposed) state.value = next
  } catch {
    /* 下一轮重试，不弹重复提示。 */
  } finally {
    if (!disposed) timer = setTimeout(poll, 1500)
  }
}

/**
 * 串行执行卡片操作，显示真实错误并恢复控件。
 * @param id 卡片标识。
 * @param operation 待执行操作。
 * @returns 操作结束后的 Promise。
 */
async function run(id: string, operation: () => Promise<void>): Promise<void> {
  if (busy.value.has(id)) return
  busy.value = new Set([...busy.value, id])
  try {
    await operation()
  } catch (failure) {
    error(String(failure instanceof Error ? failure.message : failure))
  } finally {
    busy.value = new Set([...busy.value].filter((key) => key !== id))
  }
}

/**
 * 切换能力并读取下载状态；失败时保持持久化原状态。
 * @param id 能力标识。
 * @param value 新开关状态。
 * @returns 操作结束后的 Promise。
 */
async function toggle(id: string, value: boolean): Promise<void> {
  await run(id, async () => {
    const result = await api.setEnabled(id, value)
    if (!result.success || !result.data) throw new Error(result.error || '切换失败')
    settings.value = result.data
    state.value = await api.getBuiltinState()
  })
}

/**
 * 先恢复受控值，持久化成功后才展示新状态。
 * @param event 原生复选框事件。
 * @param entry 能力元数据。
 * @returns 无返回值。
 */
function changeToggle(event: Event, entry: BuiltinCapability): void {
  const target = event.target as HTMLInputElement
  const next = target.checked
  target.checked = enabled(entry)
  void toggle(entry.id, next)
}

/**
 * 保存配置，保留扩展项的启用状态。
 * @param id 能力标识。
 * @returns 操作结束后的 Promise。
 */
async function save(id: string): Promise<void> {
  await run(id, async () => {
    const result = await api.setParams(id, { ...settings.value.params[id], ...drafts.value[id] })
    if (!result.success || !result.data) throw new Error(result.error || '保存失败')
    settings.value = result.data
    success('配置已保存')
  })
}

/**
 * 设置同一类型下的默认服务，兼容第三方提供商。
 * @param id 服务标识。
 * @returns 操作结束后的 Promise。
 */
async function setDefault(id: string): Promise<void> {
  await run(id, async () => {
    const result = await api.setDefault(props.type, id)
    if (!result.success || !result.data) throw new Error(result.error || '设置默认失败')
    settings.value = result.data
  })
}

/**
 * 删除离线资源，保留用户填写的配置。
 * @param entry 离线能力元数据。
 * @returns 操作结束后的 Promise。
 */
async function remove(entry: BuiltinCapability): Promise<void> {
  if (
    !(await confirm({
      title: '删除离线资源',
      message: `删除“${entry.label}”的已下载资源并停用引擎？再次启用时会重新下载。`
    }))
  )
    return
  await run(entry.id, async () => {
    await api.removeModel(entry.id)
    const configuration = await api.getSettings()
    if (configuration.data) settings.value = configuration.data
    state.value = await api.getBuiltinState()
    success('离线资源已删除')
  })
}

onMounted(async () => {
  await load()
  if (!disposed) void poll()
})
onUnmounted(() => {
  disposed = true
  clearTimeout(timer)
})
</script>

<template>
  <div class="provider-scroll">
    <p class="intro">
      {{
        type === 'translation'
          ? '选择翻译服务并设置默认项，超级面板与工具共用此配置。'
          : '配置图片文字与公式识别能力。离线资源按需下载，运行结束后释放引擎。'
      }}
    </p>
    <p v-if="loading">正在加载提供商…</p>
    <section
      v-for="entry in loading ? [] : cards"
      :key="entry.id"
      class="capability-card"
      :data-provider="entry.id"
    >
      <div v-if="ONLINE_TRANSLATOR_IDS.includes(entry.id)" class="online-selector">
        <label for="online-translator">在线翻译服务</label>
        <select id="online-translator" v-model="onlineId" aria-label="在线翻译服务">
          <option
            v-for="candidate in BUILTIN_CAPABILITIES.filter((item) =>
              ONLINE_TRANSLATOR_IDS.includes(item.id)
            )"
            :key="candidate.id"
            :value="candidate.id"
          >
            {{ candidate.label
            }}{{ settings.enabled.translation?.includes(candidate.id) ? ' · 已启用' : ''
            }}{{ settings.defaultId.translation === candidate.id ? ' · 默认' : '' }}
          </option>
        </select>
      </div>
      <div class="card-heading">
        <h3>{{ entry.label }}</h3>
        <div class="actions">
          <button
            v-if="entry.group === type"
            :disabled="!enabled(entry) || busy.has(entry.id)"
            :class="{ selected: settings.defaultId[type] === entry.id }"
            @click="setDefault(entry.id)"
          >
            {{ settings.defaultId[type] === entry.id ? '默认' : '设为默认' }}
          </button>
          <label class="toggle"
            ><input
              type="checkbox"
              :aria-label="`启用${entry.label}`"
              :checked="enabled(entry)"
              :disabled="busy.has(entry.id)"
              @change="changeToggle($event, entry)" /><span class="toggle-slider"></span
          ></label>
        </div>
      </div>
      <p>{{ entry.description }}</p>
      <div v-if="entry.engine" class="engine-state" role="status">
        <span>{{ engineText(entry) }}</span>
        <button
          v-if="state.engines[entry.engine]?.status === 'error'"
          :disabled="busy.has(entry.id)"
          @click="toggle(entry.id, true)"
        >
          重试下载
        </button>
        <button
          v-if="
            state.engines[entry.engine]?.installed ||
            state.engines[entry.engine]?.status === 'downloading'
          "
          :disabled="busy.has(entry.id)"
          @click="remove(entry)"
        >
          删除资源
        </button>
      </div>
      <details
        v-if="entry.fields?.length || ONLINE_TRANSLATOR_IDS.includes(entry.id)"
        class="configuration"
        :open="ONLINE_TRANSLATOR_IDS.includes(entry.id)"
      >
        <summary>服务配置</summary>
        <div v-if="ONLINE_TRANSLATOR_IDS.includes(entry.id)" class="language-fields">
          <div class="field">
            <label :for="entry.id + '-from'">源语言</label>
            <select :id="entry.id + '-from'" v-model="drafts[entry.id].from">
              <option value="auto">自动识别</option>
              <option v-for="language in languages" :key="language[0]" :value="language[0]">
                {{ language[1] }}
              </option>
            </select>
          </div>
          <span aria-hidden="true">→</span>
          <div class="field">
            <label :for="entry.id + '-to'">目标语言</label>
            <select :id="entry.id + '-to'" v-model="drafts[entry.id].to">
              <option v-for="language in languages" :key="language[0]" :value="language[0]">
                {{ language[1] }}
              </option>
            </select>
          </div>
        </div>
        <div v-if="entry.id.startsWith('builtin-ai-')" class="field">
          <label :for="entry.id + '-model'">使用模型</label>
          <select :id="entry.id + '-model'" v-model="drafts[entry.id].model">
            <option :value="undefined">
              自动使用 AI 页的首个可用{{ entry.group === 'formula' ? '视觉' : '' }}模型
            </option>
            <option
              v-for="model in state.models.filter(
                (model: any) => entry.group !== 'formula' || model.inputModalities.includes('image')
              )"
              :key="model.value"
              :value="model.value"
            >
              {{ model.label }}
            </option>
          </select>
        </div>
        <div v-for="field in entry.fields" :key="field.key" class="field">
          <label :for="entry.id + '-' + field.key">{{ field.label }}</label>
          <textarea
            v-if="field.multiline"
            :id="entry.id + '-' + field.key"
            v-model="drafts[entry.id][field.key]"
            rows="3"
            placeholder="留空使用默认提示词"
          ></textarea>
          <input
            v-else
            :id="entry.id + '-' + field.key"
            v-model="drafts[entry.id][field.key]"
            :type="field.secret ? 'password' : 'text'"
            autocomplete="off"
          />
        </div>
        <button :disabled="busy.has(entry.id)" @click="save(entry.id)">保存配置</button>
      </details>
    </section>
    <h3 v-if="external.length" class="external-title">插件提供商</h3>
    <section v-for="provider in external" :key="provider.id" class="capability-card">
      <div class="card-heading">
        <h3>
          {{ provider.label }} <small>{{ provider.pluginName }}</small>
        </h3>
        <div class="actions">
          <button
            :disabled="!settings.enabled[type]?.includes(provider.id)"
            @click="setDefault(provider.id)"
          >
            {{ settings.defaultId[type] === provider.id ? '默认' : '设为默认' }}</button
          ><input
            type="checkbox"
            :aria-label="`启用${provider.label}`"
            :checked="settings.enabled[type]?.includes(provider.id)"
            @change="toggle(provider.id, ($event.target as HTMLInputElement).checked)"
          />
        </div>
      </div>
      <p>{{ provider.description }}</p>
    </section>
  </div>
</template>

<style scoped>
.provider-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
}
.intro,
p {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
  margin: 10px 0 0;
}
.intro {
  margin: 0 0 16px;
  font-size: 13px;
}
.capability-card {
  padding: 18px;
  margin-bottom: 14px;
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  background: var(--card-bg);
}
.card-heading,
.actions,
.engine-state,
.online-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-heading {
  justify-content: space-between;
}
h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-color);
}
.actions {
  flex-shrink: 0;
}
button,
select,
input:not([type='checkbox']),
textarea {
  border: 1px solid var(--divider-color);
  border-radius: 6px;
  color: var(--text-color);
  background: var(--input-bg, var(--control-bg));
  padding: 7px 10px;
  font: inherit;
  font-size: 12px;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button.selected {
  color: var(--primary-color);
  border-color: var(--primary-color);
}
.online-selector {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--divider-color);
  font-size: 12px;
}
.online-selector select {
  flex: 1;
}
.engine-state {
  margin-top: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
}
.engine-state span {
  flex: 1;
}
.configuration {
  border-top: 1px solid var(--divider-color);
  margin-top: 16px;
  padding-top: 12px;
  font-size: 12px;
}
summary {
  cursor: pointer;
  color: var(--primary-color);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 12px 0;
  color: var(--text-secondary);
}
.language-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
textarea {
  resize: vertical;
}
.external-title {
  margin: 24px 0 16px;
}
small {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: normal;
}
</style>
