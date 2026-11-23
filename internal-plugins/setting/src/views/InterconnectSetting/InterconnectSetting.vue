<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useToast } from '@/components'
import type { InterconnectDeviceView, InterconnectState } from '@shared/interconnect'

const { success, error } = useToast()

const state = ref<InterconnectState | null>(null)
const deviceName = ref('')
const refreshing = ref(false)
const savingName = ref(false)
const busyDeviceId = ref('')
let unsubscribe: (() => void) | null = null

const devices = computed(() => state.value?.devices || [])
const pendingDevices = computed(() =>
  devices.value.filter((item) => item.pendingPair && !item.paired)
)
const config = computed(() => state.value?.config)
const status = computed(() => state.value?.status)

const typeLabels: Record<string, string> = {
  phone: '手机',
  smartphone: '手机',
  tablet: '平板',
  desktop: '电脑',
  laptop: '笔记本',
  tv: '电视',
  unknown: '设备'
}

/**
 * 应用一次宿主快照，保留用户正在编辑的设备名称。
 * @param next 最新状态。
 * @param overwriteName 是否用快照覆盖输入框。
 * @returns 无返回值。
 */
function applyState(next: InterconnectState, overwriteName = false): void {
  state.value = next
  if (overwriteName) deviceName.value = next.config.deviceName
}

/**
 * 读取互联服务初始状态并订阅实时更新。
 * @returns 无返回值。
 */
async function load(): Promise<void> {
  try {
    const result = await window.tabdo.internal.interconnectGetState()
    if (result.success && result.state) {
      applyState(result.state, true)
    } else if (result.error) {
      error(result.error)
    }
  } catch (err) {
    error(`读取互联服务失败：${err instanceof Error ? err.message : '未知错误'}`)
  }
}

/**
 * 保存配置字段。
 * @param patch 需要更新的字段。
 * @returns 保存是否成功。
 */
async function saveConfig(patch: Record<string, unknown>): Promise<boolean> {
  try {
    const result = await window.tabdo.internal.interconnectSaveConfig(patch as any)
    if (result.success && result.state) {
      applyState(result.state)
      return true
    }
    error(result.error || '保存失败')
    return false
  } catch (err) {
    error(`保存失败：${err instanceof Error ? err.message : '未知错误'}`)
    return false
  }
}

/**
 * 切换服务开关。
 * @param event 复选框事件。
 * @returns 无返回值。
 */
async function toggleEnabled(event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked
  const saved = await saveConfig({ enabled })
  if (saved) success(enabled ? '互联服务已启动' : '互联服务已停止')
}

/**
 * 保存设备名称。
 * @returns 无返回值。
 */
async function saveDeviceName(): Promise<void> {
  const name = deviceName.value.trim()
  if (!name) {
    deviceName.value = config.value?.deviceName || ''
    return
  }
  savingName.value = true
  try {
    const saved = await saveConfig({ deviceName: name })
    if (saved) {
      const next = await window.tabdo.internal.interconnectGetState()
      if (next.success && next.state) applyState(next.state, true)
      success('设备名称已更新')
    }
  } finally {
    savingName.value = false
  }
}

/**
 * 切换自动同步剪贴板。
 * @param event 复选框事件。
 * @returns 无返回值。
 */
async function toggleSyncClipboard(event: Event): Promise<void> {
  const checked = (event.target as HTMLInputElement).checked
  await saveConfig({ syncClipboard: checked })
}

/**
 * 切换自动接受配对。
 * @param event 复选框事件。
 * @returns 无返回值。
 */
async function toggleAutoAccept(event: Event): Promise<void> {
  const checked = (event.target as HTMLInputElement).checked
  await saveConfig({ autoAcceptPairing: checked })
}

/**
 * 切换互联传输系统通知。
 * @param event 复选框事件。
 * @returns 无返回值。
 */
async function toggleNotifications(event: Event): Promise<void> {
  const checked = (event.target as HTMLInputElement).checked
  await saveConfig({ notifications: checked })
}

/**
 * 更改默认接收文件夹。
 * @returns 无返回值。
 */
async function chooseDownloadDir(): Promise<void> {
  try {
    const result = await window.tabdo.internal.interconnectChooseDownloadDir()
    if (result.canceled) return
    if (result.success && result.state) {
      applyState(result.state)
      success('接收文件夹已更新')
    } else {
      error(result.error || '选择文件夹失败')
    }
  } catch (err) {
    error(`选择文件夹失败：${err instanceof Error ? err.message : '未知错误'}`)
  }
}

/**
 * 在资源管理器中打开接收文件夹。
 * @returns 无返回值。
 */
async function openDownloadDir(): Promise<void> {
  const result = await window.tabdo.internal.interconnectOpenDownloadDir()
  if (!result.success) error(result.error || '打开文件夹失败')
}

/**
 * 主动广播并刷新设备列表。
 * @returns 无返回值。
 */
async function refreshDevices(): Promise<void> {
  refreshing.value = true
  try {
    const result = await window.tabdo.internal.interconnectRefresh()
    if (result.success && result.state) {
      applyState(result.state)
    } else if (result.error) {
      error(result.error)
    }
  } catch (err) {
    error(`刷新失败：${err instanceof Error ? err.message : '未知错误'}`)
  } finally {
    refreshing.value = false
  }
}

/**
 * 请求配对或取消配对。
 * @param device 目标设备。
 * @returns 无返回值。
 */
async function requestPair(device: InterconnectDeviceView): Promise<void> {
  busyDeviceId.value = device.id
  try {
    const result = await window.tabdo.internal.interconnectPair(device.id, !device.paired)
    if (!result.success) error(result.error || '配对操作失败')
    else if (!device.paired) success('已发送配对请求，请在手机上确认')
  } finally {
    busyDeviceId.value = ''
  }
}

/**
 * 拒绝对方的配对请求。
 * @param device 目标设备。
 * @returns 无返回值。
 */
async function declinePairing(device: InterconnectDeviceView): Promise<void> {
  busyDeviceId.value = device.id
  try {
    const result = await window.tabdo.internal.interconnectPair(device.id, false)
    if (!result.success) error(result.error || '拒绝配对失败')
  } finally {
    busyDeviceId.value = ''
  }
}

/**
 * 接受对方的配对请求。
 * @param device 目标设备。
 * @returns 无返回值。
 */
async function acceptPairing(device: InterconnectDeviceView): Promise<void> {
  busyDeviceId.value = device.id
  try {
    const result = await window.tabdo.internal.interconnectAcceptPairing(device.id)
    if (result.success) success(`已与 ${device.name} 配对`)
    else error(result.error || '接受配对失败')
  } finally {
    busyDeviceId.value = ''
  }
}

/**
 * 把设备设为默认传输目标。
 * @param device 目标设备。
 * @returns 无返回值。
 */
async function setPreferred(device: InterconnectDeviceView): Promise<void> {
  const next = config.value?.preferredDeviceId === device.id ? '' : device.id
  const saved = await saveConfig({ preferredDeviceId: next })
  if (saved) success(next ? `默认设备已设为 ${device.name}` : '已取消默认设备')
}

/**
 * 主动同步一次剪贴板。
 * @param deviceId 目标设备；省略时同步到全部在线设备。
 * @returns 无返回值。
 */
async function syncClipboard(deviceId?: string): Promise<void> {
  const result = await window.tabdo.internal.interconnectSyncClipboard(deviceId)
  if (result.success) success('剪贴板已同步')
  else error(result.error || '同步失败')
}

/**
 * 复制本机指纹。
 * @returns 无返回值。
 */
async function copyFingerprint(): Promise<void> {
  const value = status.value?.fingerprint || ''
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    success('指纹已复制')
  } catch {
    error('复制失败')
  }
}

onMounted(() => {
  void load()
  unsubscribe = window.tabdo.internal.onInterconnectState((next) => applyState(next))
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <div class="content-panel">
    <h2 class="section-title">互联服务</h2>
    <p class="section-desc">
      在同一局域网内与手机同步剪贴板、互传文件，兼容 KDE Connect 协议，只启用剪贴板与文件传输。
    </p>

    <section class="card">
      <div class="setting-item">
        <div class="setting-label">
          <span>启用互联服务</span>
          <span class="setting-desc">监听局域网发现并接受已配对设备的连接</span>
        </div>
        <label class="toggle">
          <input :checked="config?.enabled" type="checkbox" @change="toggleEnabled" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="status-bar">
        <span class="status-dot" :class="{ active: status?.running }"></span>
        <span class="status-text">
          {{ status?.running ? `运行中 · TCP ${status?.tcpPort}` : '服务未启动' }}
        </span>
        <span class="status-text mono">ID {{ status?.deviceId || '—' }}</span>
      </div>

      <div class="setting-item column">
        <label class="setting-label">设备名称</label>
        <div class="row">
          <input v-model="deviceName" class="input" type="text" maxlength="32" />
          <button class="btn btn-sm" :disabled="savingName" @click="saveDeviceName">
            {{ savingName ? '保存中…' : '保存' }}
          </button>
        </div>
        <span class="hint">其他设备上展示的名称，最多 32 个字符。</span>
      </div>

      <div class="setting-item column">
        <label class="setting-label">本机证书指纹</label>
        <div class="row">
          <input :value="status?.fingerprint || ''" class="input mono" type="text" readonly />
          <button class="btn btn-sm" @click="copyFingerprint">复制</button>
        </div>
        <span class="hint">用于核对配对设备，不会上传或写入剪贴板历史。</span>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">文件传输</h3>
      <div class="setting-item">
        <div class="setting-label">
          <span>系统通知</span>
          <span class="setting-desc">接收完成、传输失败、配对请求和防火墙等待提示</span>
        </div>
        <label class="toggle">
          <input :checked="config?.notifications" type="checkbox" @change="toggleNotifications" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-item column">
        <label class="setting-label">默认接收文件夹</label>
        <div class="row">
          <input :value="config?.downloadDir || ''" class="input" type="text" readonly />
          <button class="btn btn-sm" @click="chooseDownloadDir">更改</button>
          <button class="btn btn-sm" @click="openDownloadDir">打开</button>
        </div>
        <span class="hint">
          接收的文件自动重名避让，不覆盖已有文件，并使用接收时间作为修改时间。在托盘右键“互联传输”中可查看任务、重新发起失败任务、定位已接收文件或清空记录。
        </span>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">剪贴板</h3>
      <div class="setting-item">
        <div class="setting-label">
          <span>自动同步剪贴板</span>
          <span class="setting-desc">本机复制文本或图片后同步到已配对在线设备</span>
        </div>
        <label class="toggle">
          <input :checked="config?.syncClipboard" type="checkbox" @change="toggleSyncClipboard" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-item">
        <div class="setting-label">
          <span>自动接受配对</span>
          <span class="setting-desc">开启后不再询问，仅建议在可信网络中启用</span>
        </div>
        <label class="toggle">
          <input :checked="config?.autoAcceptPairing" type="checkbox" @change="toggleAutoAccept" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h3 class="card-title">设备</h3>
        <button class="btn btn-sm" :disabled="refreshing" @click="refreshDevices">
          {{ refreshing ? '刷新中…' : '刷新设备' }}
        </button>
      </div>

      <div v-if="pendingDevices.length" class="pending-box">
        <p class="pending-title">收到配对请求</p>
        <div v-for="device in pendingDevices" :key="device.id" class="pending-row">
          <span class="device-name">{{ device.name }}</span>
          <div class="device-actions">
            <button
              class="btn btn-sm btn-primary"
              :disabled="busyDeviceId === device.id"
              @click="acceptPairing(device)"
            >
              接受
            </button>
            <button
              class="btn btn-sm"
              :disabled="busyDeviceId === device.id"
              @click="declinePairing(device)"
            >
              拒绝
            </button>
          </div>
        </div>
      </div>

      <div v-if="devices.length" class="device-list">
        <div v-for="device in devices" :key="device.id" class="device-row">
          <span class="device-dot" :class="{ online: device.reachable }"></span>
          <div class="device-info">
            <div class="device-line">
              <span class="device-name">{{ device.name }}</span>
              <span v-if="device.paired" class="badge">已配对</span>
              <span v-if="config?.preferredDeviceId === device.id" class="badge default">默认</span>
            </div>
            <span class="device-meta">
              {{ typeLabels[device.type] || '设备' }} ·
              {{ device.reachable ? '在线' : '离线' }}
              <template v-if="device.address"> · {{ device.address }}</template>
            </span>
          </div>
          <div class="device-actions">
            <button v-if="device.paired" class="btn btn-sm" @click="setPreferred(device)">
              {{ config?.preferredDeviceId === device.id ? '取消默认' : '设为默认' }}
            </button>
            <button
              v-if="device.paired"
              class="btn btn-sm"
              :disabled="!device.reachable"
              @click="syncClipboard(device.id)"
            >
              同步剪贴板
            </button>
            <button
              class="btn btn-sm"
              :class="{ 'btn-warning': device.paired }"
              :disabled="busyDeviceId === device.id || (!device.paired && !device.reachable)"
              @click="requestPair(device)"
            >
              {{ device.paired ? '取消配对' : '请求配对' }}
            </button>
          </div>
        </div>
      </div>
      <p v-else class="empty-hint">
        尚未发现设备。请确认手机与电脑处于同一局域网，并在手机上安装 KDE Connect 后点击“刷新设备”。
      </p>

      <p class="hint firewall-hint">
        首次使用时 Windows 防火墙可能询问网络访问权限，请允许 TabDo 访问专用网络。
      </p>
    </section>
  </div>
</template>

<style scoped>
.content-panel {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  background: var(--bg-color);
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 20px 0;
  line-height: 1.6;
}

.card {
  border: 1px solid var(--divider-color);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  background: var(--card-bg);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px 0;
}

.card-head .card-title {
  margin-bottom: 0;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--divider-color);
}

.setting-item:last-child {
  border-bottom: 0;
}

.setting-item.column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
}

.setting-desc,
.hint {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 400;
  line-height: 1.5;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.row .input {
  flex: 1;
  min-width: 0;
}

.mono {
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-size: 12px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--hover-bg);
  flex-wrap: wrap;
}

.status-dot,
.device-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
  flex: none;
}

.status-dot.active,
.device-dot.online {
  background: var(--success-color, #34c759);
  box-shadow: 0 0 6px var(--success-color, #34c759);
}

.status-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.empty-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.pending-box {
  border: 1px solid color-mix(in srgb, var(--primary-color) 35%, var(--divider-color));
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--hover-bg);
}

.pending-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.pending-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.device-list {
  display: flex;
  flex-direction: column;
}

.device-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--divider-color);
}

.device-row:last-child {
  border-bottom: 0;
}

.device-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.device-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.device-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-meta {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--hover-bg);
  color: var(--text-secondary);
  flex: none;
}

.badge.default {
  background: color-mix(in srgb, var(--primary-color) 18%, transparent);
  color: var(--primary-color);
}

.device-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.firewall-hint {
  margin-top: 12px;
}

.toggle {
  flex: none;
}
</style>
