<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import RecorderIcon from './recorder/RecorderIcon.vue'
import RecorderSettings from './recorder/RecorderSettings.vue'
const props = defineProps({ action: { type: Object, default: () => ({}) } })
const mode = ref('screen'),
  sources = ref([]),
  selected = ref(''),
  loading = ref(false),
  busy = ref(false),
  supported = ref(true),
  recording = ref(false),
  started = ref(0),
  now = ref(Date.now()),
  message = ref(''),
  settings = ref(false),
  page = ref(null)
const stored = window.tabdo.dbStorage.getItem('recorder-preferences')
const audioChecking = ref(0)
const audioVersions = { systemAudio: 0, microphone: 0 }
const options = ref({
  systemAudio: false,
  microphone: false,
  cursor: true,
  countdown: 3,
  quality: 'standard',
  clicks: true,
  keys: true,
  clickColor: '#ff6464',
  rightColor: '#6464ff',
  clickStyle: 'circle',
  clickEmoji: '😎',
  rightEmoji: '🤣',
  keyStyle: 'default',
  keyPosition: 'bottom',
  ...(stored && typeof stored === 'object' ? stored : {})
})
if (options.value.keyStyle === 'light') options.value.keyStyle = 'apple-wireless'
const timerText = computed(() => {
  const seconds = Math.max(0, Math.floor((now.value - started.value) / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
})
let disposed = false,
  version = 0,
  interval
watch(
  options,
  (value) => {
    if (!disposed)
      window.tabdo.dbStorage.setItem('recorder-preferences', JSON.parse(JSON.stringify(value)))
  },
  { deep: true }
)
watch(recording, (value) => {
  clearInterval(interval)
  if (value)
    interval = setInterval(() => {
      now.value = Date.now()
    }, 1000)
})
watch(settings, async (value) => {
  if (value) {
    await nextTick()
    page.value?.querySelector('[role=dialog]')?.focus()
  }
})
/**
 * 按原插件模式刷新来源，全屏为大图，窗口仅返回应用图标列表。
 * @returns {Promise<void>} 当前模式枚举结束后的 Promise。
 */
async function refresh() {
  const request = ++version
  loading.value = true
  try {
    const result = await window.toolsRecorder.sources(mode.value)
    if (disposed || request !== version) return
    supported.value = result.supported
    recording.value = result.recording
    started.value = result.started || Date.now()
    sources.value = result.sources
    selected.value = sources.value.some((source) => source.id === selected.value)
      ? selected.value
      : sources.value[0]?.id || ''
    message.value = result.supported ? '' : '需要 Windows 10 1903 或更高版本（x64）'
  } catch (error) {
    if (!disposed && request === version) message.value = error.message
  } finally {
    if (!disposed && request === version) loading.value = false
  }
}
/**
 * 全屏与窗口切换重建来源，区域入口直接打开原版式可调整选区。
 * @param {string} next 用户点击的模式。
 * @returns {Promise<void>} 模式切换或区域启动结束后的 Promise。
 */
async function selectMode(next) {
  if (busy.value || recording.value) return
  if (next === 'region') {
    await start('region')
    return
  }
  if (mode.value === next) return
  mode.value = next
  selected.value = ''
  sources.value = []
  await refresh()
}
/**
 * 按原插件在勾选声音时检查设备，只枚举设备而不创建采集流。
 * @param {string} key 声音选项键。
 * @param {Event} event 勾选事件。
 * @returns {Promise<void>} 设备检查结束后的 Promise。
 */
async function changeAudio(key, event) {
  const request = ++audioVersions[key]
  if (!event.target.checked) {
    options.value[key] = false
    return
  }
  audioChecking.value++
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    if (disposed || request !== audioVersions[key]) return
    const available = devices.some(
      (device) => device.kind === (key === 'systemAudio' ? 'audiooutput' : 'audioinput')
    )
    options.value[key] = available
    event.target.checked = available
    message.value = available
      ? ''
      : key === 'systemAudio'
        ? '未检测到可用扬声器'
        : '麦克风未连接或未被识别'
  } catch (error) {
    if (!disposed && request === audioVersions[key]) {
      event.target.checked = false
      message.value = error.message
    }
  } finally {
    if (!disposed) audioChecking.value--
  }
}
/**
 * 登记完整启动链并自动保存至设置目录，确认区域前不启动编码器。
 * @param {string} requestedMode 本次录制模式，默认当前可见模式。
 * @returns {Promise<void>} 启动或取消收尾后的 Promise。
 */
async function start(requestedMode = mode.value) {
  if (
    busy.value ||
    audioChecking.value ||
    !supported.value ||
    (requestedMode !== 'region' && !selected.value)
  )
    return
  busy.value = true
  const preferences = JSON.parse(JSON.stringify(options.value))
  const request = {
    ...preferences,
    id: crypto.randomUUID(),
    mode: requestedMode,
    source: requestedMode === 'region' ? '' : selected.value,
    countdown: requestedMode === 'screen' ? preferences.countdown : 0,
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    primaryColor: getComputedStyle(document.body).getPropertyValue('--primary-color').trim()
  }
  try {
    await window.toolsLifecycle.runTask(async (task) => {
      await window.tabdo.hideMainWindow()
      try {
        const result = await window.toolsRecorder.start(request, task.signal)
        // 区域工具栏允许临时改声音/操作选项，确认后持久化其实际选择。
        if (result.preferences)
          window.tabdo.dbStorage.setItem('recorder-preferences', {
            ...preferences,
            ...result.preferences
          })
        return result
      } catch (error) {
        window.tabdo.showNotification?.(`录屏：${error.message}`)
        return { failed: true }
      }
    }, 180000)
  } catch (error) {
    if (!disposed) message.value = error.message
    window.tabdo.showNotification?.(`录屏：${error.message}`)
  } finally {
    if (!disposed) busy.value = false
  }
}
/**
 * 从录制状态页停止，等待封装和所属进程结束。
 * @returns {Promise<void>} 停止链结束后的 Promise。
 */
async function stop() {
  await window.toolsLifecycle.runTask(async () => {
    await window.tabdo.hideMainWindow()
    await window.toolsRecorder.stop()
  }, 60000)
}
/**
 * 退出即停止前台计时和缩略图，独立录制归控制条继续持有。
 * @returns {void} 无返回值。
 */
function dispose() {
  disposed = true
  version++
  clearInterval(interval)
  sources.value = []
}
onMounted(async () => {
  window.tabdo.setExpendHeight(440)
  window.toolsLifecycle.addCleanup(dispose)
  if (props.action.code === 'screen-recorder-stop') {
    await stop()
    return
  }
  if (props.action.code === 'screen-recorder-region') {
    await start('region')
    return
  }
  await refresh()
})
onUnmounted(dispose)
</script>
<template>
  <main ref="page" class="recorder-page" @keydown.esc="settings = false">
    <header class="app-header">
      <nav role="tablist" aria-label="录制模式">
        <button
          v-for="[key, label] in [
            ['screen', '全屏录制'],
            ['window', '窗口录制'],
            ['region', '区域录制']
          ]"
          :key="key"
          role="tab"
          :aria-selected="mode === key"
          :class="{ active: mode === key }"
          :disabled="busy || recording"
          @click="selectMode(key)"
        >
          <RecorderIcon :name="key" />{{ label }}
        </button>
      </nav>
      <button class="settings-button" aria-label="录屏设置" @click="settings = true">
        设置<RecorderIcon name="settings" />
      </button>
    </header>
    <div class="app-body">
      <section class="app-content" aria-label="录制来源">
        <div :class="mode === 'screen' ? 'screen-sources-box' : 'window-sources-box'">
          <button
            v-for="source in sources"
            :key="source.id"
            :class="['source', { selected: source.id === selected }]"
            :aria-label="source.name"
            :aria-pressed="source.id === selected"
            :disabled="busy"
            @click="selected = source.id"
          >
            <template v-if="mode === 'screen'"
              ><img :src="source.thumbnail" :alt="source.name" draggable="false" /><RecorderIcon
                v-if="source.id === selected"
                class="source-selected-icon"
                name="record" /></template
            ><template v-else
              ><img
                v-if="source.appIcon"
                :src="source.appIcon"
                alt=""
                class="window-icon" /><RecorderIcon v-else class="window-icon" name="window" /><span
                :title="source.name"
                >{{ source.name }}</span
              ><RecorderIcon
                v-if="source.id === selected"
                class="source-selected-icon"
                name="record"
            /></template>
          </button>
          <p v-if="!sources.length" class="empty-sources">
            {{ loading ? '正在读取可录制来源…' : '没有可用来源' }}
          </p>
        </div>
      </section>
      <section class="app-workspace" aria-label="录制选项">
        <div class="recorder-form">
          <section v-if="mode === 'screen'">
            <h3>录屏倒计时</h3>
            <div class="countdown-options" role="group" aria-label="录屏倒计时">
              <button
                v-for="second in [3, 4, 5, 6, 7, 8, 9]"
                :key="second"
                :class="{ selected: options.countdown === second }"
                :aria-pressed="options.countdown === second"
                @click="options.countdown = second"
              >
                {{ second }} 秒
              </button>
            </div>
          </section>
          <fieldset>
            <legend>声音录制</legend>
            <div class="option-row">
              <label
                ><input
                  :checked="options.systemAudio"
                  type="checkbox"
                  @change="changeAudio('systemAudio', $event)"
                /><RecorderIcon name="speaker" />扬声器</label
              ><label
                ><input
                  :checked="options.microphone"
                  type="checkbox"
                  @change="changeAudio('microphone', $event)"
                /><RecorderIcon name="microphone" />麦克风</label
              >
            </div>
          </fieldset>
          <fieldset>
            <legend>操作录制</legend>
            <div class="option-row">
              <label
                ><input
                  v-model="options.cursor"
                  type="checkbox"
                  aria-label="显示鼠标"
                /><RecorderIcon name="cursor" />鼠标指针</label
              ><template v-if="mode === 'screen'"
                ><label
                  ><input
                    v-model="options.clicks"
                    type="checkbox"
                    aria-label="鼠标点击效果"
                  /><RecorderIcon name="click" />点击</label
                ><label
                  ><input
                    v-model="options.keys"
                    type="checkbox"
                    aria-label="显示按键"
                  /><RecorderIcon name="keyboard" />按键</label
                ></template
              >
            </div>
          </fieldset>
        </div>
        <footer class="app-action-bar">
          <span>通过控制条停止录制</span
          ><button
            class="primary"
            :disabled="!supported || !selected || busy || loading || audioChecking"
            @click="start()"
          >
            <RecorderIcon name="play" />{{ busy ? '正在准备…' : '开始录制' }}
          </button>
        </footer>
      </section>
    </div>
    <div v-if="message" class="message" role="status">{{ message }}</div>
    <div v-if="recording" class="recording-state">
      <span class="recording-timer">{{ timerText }}</span
      ><button class="primary" @click="stop"><RecorderIcon name="stop" />结束录制</button
      ><small>通过控制条停止录制</small>
    </div>
    <div v-if="settings" class="settings-mask" @click.self="settings = false">
      <RecorderSettings v-model="options" @close="settings = false" />
    </div>
  </main>
</template>
<style scoped>
.recorder-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
  font: var(--tool-font);
  color: var(--text-primary);
  background: var(--bg-app);
  overflow: hidden;
}
button,
input {
  font: inherit;
  color: inherit;
  box-sizing: border-box;
}
button {
  cursor: pointer;
  background: transparent;
  border: 0;
}
button:disabled {
  opacity: 0.42;
  cursor: default;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
svg {
  width: 20px;
  height: 20px;
  flex: none;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex: none;
  background: var(--bg-hover);
}
nav {
  display: flex;
  min-width: 0;
  flex: 1;
}
nav button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  flex: 0 1 180px;
  padding: 3px 14px 0;
  color: var(--text-secondary);
  white-space: nowrap;
  border-radius: 10px 10px 0 0;
}
nav button.active {
  color: var(--text-primary);
  background: var(--bg-app);
  font-weight: 600;
}
.settings-button {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  flex: none;
}
.app-body {
  display: flex;
  min-height: 0;
  flex: 1;
}
.app-content {
  width: 50%;
  min-width: 0;
  padding: 20px 10px 20px 20px;
  box-sizing: border-box;
}
.app-content > div {
  height: 100%;
  border-radius: 12px;
  background: var(--bg-hover);
  overflow: auto;
  box-sizing: border-box;
}
.screen-sources-box {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.screen-sources-box .source {
  padding: 0;
  position: relative;
  width: 100%;
  flex: none;
  line-height: 0;
}
.screen-sources-box .source img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
}
.screen-sources-box .source.selected {
  box-shadow: 0 0 0 3px var(--primary-color);
}
.source-selected-icon {
  color: var(--primary-color);
}
.screen-sources-box .source-selected-icon {
  position: absolute;
  left: 9px;
  top: 9px;
  fill: currentColor;
}
.window-sources-box .source {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  gap: 12px;
  text-align: left;
}
.window-sources-box .source.selected {
  background: var(--bg-accent-light);
}
.window-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex: none;
}
.window-sources-box span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.window-sources-box .source-selected-icon {
  width: 18px;
  fill: currentColor;
}
.app-workspace {
  width: 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.recorder-form {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}
h3,
legend {
  font: inherit;
  color: var(--text-secondary);
  margin: 0 0 10px;
  padding: 0;
}
fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.countdown-options {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  overflow: hidden;
}
.countdown-options button {
  flex: 1;
  padding: 9px 3px;
  min-height: 37px;
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-secondary);
}
.countdown-options button:last-child {
  border: 0;
}
.countdown-options button.selected {
  background: var(--bg-accent-light);
  color: var(--primary-color);
}
.option-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}
.option-row label {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  cursor: pointer;
}
.option-row input {
  width: 16px;
  height: 16px;
  margin: 0 5px 0 0;
  accent-color: var(--primary-color);
}
.option-row svg {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
}
.app-action-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 20px;
  gap: 10px;
}
.app-action-bar > span {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}
.primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 12px;
  min-width: 120px;
  border-radius: 6px;
  color: white;
  background: var(--primary-color);
  white-space: nowrap;
}
.primary:hover {
  background: var(--primary-hover);
}
.empty-sources {
  font-size: 12px;
  text-align: center;
  color: var(--text-secondary);
}
.message {
  padding: 7px 14px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}
.settings-mask {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  background: #0004;
  z-index: 20;
}
.recording-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: var(--bg-elevated);
  z-index: 10;
}
.recording-timer {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
}
.recording-state small {
  color: var(--text-secondary);
}
@media (max-width: 620px) {
  .app-header {
    padding: 0 8px;
  }
  nav button {
    padding: 3px 8px 0;
    gap: 4px;
    font-size: 12px;
  }
  nav svg {
    width: 18px;
  }
  .app-content {
    padding: 14px 7px 14px 12px;
  }
  .screen-sources-box {
    padding: 12px;
  }
  .recorder-form {
    padding: 14px;
    gap: 18px;
  }
  .app-action-bar {
    padding: 14px;
    flex-wrap: wrap;
  }
  .countdown-options button {
    font-size: 11px;
    padding: 8px 2px;
  }
}
</style>
