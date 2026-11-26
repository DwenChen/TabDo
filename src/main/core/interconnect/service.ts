import { Notification, app, clipboard, dialog, nativeImage, shell, webContents } from 'electron'
import { randomUUID } from 'node:crypto'
import dgram from 'node:dgram'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import databaseAPI from '../../api/shared/database'
import clipboardManager from '../../managers/clipboardManager'
import { getTabDoRoot, getTempPath } from '../appData/appDataPaths'
import { clipboardEvents } from '../clipboardEvents'
import {
  INTERCONNECT_DB_KEY,
  INTERCONNECT_PROTOCOL_VERSION,
  INTERCONNECT_TCP_PORT_MAX,
  INTERCONNECT_TCP_PORT_MIN,
  INTERCONNECT_TRUSTED_DEVICES_KEY,
  INTERCONNECT_UDP_PORT,
  normalizeInterconnectConfig,
  type InterconnectConfig,
  type InterconnectDeviceView,
  type InterconnectState,
  type InterconnectStatus,
  type InterconnectTransferFile,
  type InterconnectTransferView,
  type InterconnectTrustedDevice
} from '@shared/interconnect'
import {
  certificatePemToDer,
  ensureInterconnectIdentity,
  formatCertificateFingerprint,
  type InterconnectIdentity
} from './certificate'
import {
  acceptIncoming,
  connectOutgoing,
  type HandshakeResult,
  type InterconnectLink,
  type LinkContext
} from './link'
import {
  PACKET_CLIPBOARD,
  PACKET_CLIPBOARD_CONNECT,
  PACKET_CLIPBOARD_FILE,
  PACKET_IDENTITY,
  PACKET_PAIR,
  PACKET_SHARE_REQUEST,
  PACKET_SHARE_UPDATE,
  parsePacket,
  readRemoteIdentity,
  remoteAccepts,
  sanitizeDeviceName,
  type NetworkPacket
} from './protocol'
import { InterconnectDeviceChooser, type InterconnectChoiceDevice } from './deviceChooser'
import { InterconnectProgressWindow } from './progressWindow'
import { computeBroadcastAddress, isClipboardImage, sanitizeFilename } from './utils'

/** 本机设备 ID 的记录键，用于检测证书重建后需要清空旧信任。 */
const INTERCONNECT_DEVICE_ID_KEY = 'interconnect-device-id'

/** 单次文件载荷连接的最长等待时间；首次传输可能需要在防火墙提示中放行。 */
const PAYLOAD_TIMEOUT = 60000

/** 等待接收方连接超过该时间后提示用户检查防火墙，避免无反馈地空等。 */
const PAYLOAD_WAIT_HINT = 6000

/** 设备重新连接的冷却时间。 */
const CONNECT_COOLDOWN = 1500

/** 发起传输前等待链路就绪的最长时间。 */
const LINK_WAIT = 4000

/** 剪贴板文件同步上限，与 KDE Connect 默认值保持一致。 */
const MAX_CLIPBOARD_FILE_SIZE = 50 * 1024 * 1024

/** 内部设备记录。 */
interface DeviceRecord {
  id: string
  name: string
  type: string
  protocolVersion: number
  incomingCapabilities: string[]
  outgoingCapabilities: string[]
  address?: string
  tcpPort?: number
  link?: InterconnectLink
  certificatePem?: string
  pendingPair: boolean
  pairRequestedAt?: number
  lastConnectAt?: number
}

/** 内部传输任务记录。 */
interface TransferRecord extends InterconnectTransferView {
  lastTickAt: number
  lastTickBytes: number
}

/** 协议包中读取到的文件描述。 */
interface IncomingFileRequest {
  filename: string
  size: number
  port: number | null
  open: boolean
}

/**
 * 读取并校验剪贴板事件的最小字段。
 * @param item 宿主剪贴板采集结果。
 * @returns 文本内容或图片路径。
 */
function readClipboardPayload(item: unknown): { text?: string; imagePath?: string } {
  if (!item || typeof item !== 'object') return {}
  const value = item as Record<string, unknown>
  if (value.type === 'text' && typeof value.content === 'string' && value.content) {
    return { text: value.content }
  }
  if (value.type === 'image' && typeof value.imagePath === 'string' && value.imagePath) {
    return { imagePath: value.imagePath }
  }
  return {}
}

/**
 * 列出当前可用的局域网广播地址。
 * @returns 去重后的广播地址列表。
 */
function listBroadcastAddresses(): string[] {
  const result = new Set<string>(['255.255.255.255'])
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = String(entry.family)
      if ((family === 'IPv4' || family === '4') && !entry.internal) {
        const broadcast = computeBroadcastAddress(entry.address, entry.netmask)
        if (broadcast) result.add(broadcast)
      }
    }
  }
  return [...result]
}

/**
 * 互联服务：局域网发现、配对、剪贴板同步与文件传输。
 *
 * 服务只在主进程运行，设置页通过内部 IPC 读取快照和执行操作。
 */
class InterconnectService {
  private config: InterconnectConfig | null = null
  private identity: InterconnectIdentity | null = null
  private secureContext: tls.SecureContext | null = null
  private trusted = new Map<string, InterconnectTrustedDevice>()
  private devices = new Map<string, DeviceRecord>()
  private transfers = new Map<string, TransferRecord>()
  private udpSocket: dgram.Socket | null = null
  private tcpServer: net.Server | null = null
  private tcpPort = 0
  private discoveryTimer: NodeJS.Timeout | null = null
  private stateTimer: NodeJS.Timeout | null = null
  private pairTimers = new Map<string, NodeJS.Timeout>()
  private progressWindow = new InterconnectProgressWindow()
  private deviceChooser = new InterconnectDeviceChooser()
  private started = false
  private initialized = false
  private applyingRemoteClipboard = false
  private remoteClipboardTimestamp = 0
  private readonly capturedHandler = (item: unknown): void => this.handleCaptured(item)

  /**
   * 读取配置、恢复信任并启动监听。
   * @returns 初始化完成后的 Promise。
   */
  public async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    this.config = normalizeInterconnectConfig(
      databaseAPI.dbGet(INTERCONNECT_DB_KEY),
      this.defaultConfig()
    )
    this.identity = ensureInterconnectIdentity(getTabDoRoot())
    this.secureContext = tls.createSecureContext({
      key: this.identity.privateKeyPem,
      cert: this.identity.certificatePem
    })

    // 证书重建会改变设备身份，旧信任不能继续沿用。
    const knownDeviceId = databaseAPI.dbGet(INTERCONNECT_DEVICE_ID_KEY)
    if (knownDeviceId && knownDeviceId !== this.identity.deviceId) {
      this.trusted.clear()
      this.saveTrustedDevices()
    }
    databaseAPI.dbPut(INTERCONNECT_DEVICE_ID_KEY, this.identity.deviceId)

    this.loadTrustedDevices()
    clipboardEvents.on('captured', this.capturedHandler)
    if (this.config.enabled) await this.start()
    this.emitState()
  }

  /**
   * 停止全部监听、链路与传输任务。
   * @returns 无返回值。
   */
  public stop(): void {
    this.started = false
    clipboardEvents.off('captured', this.capturedHandler)
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer)
      this.discoveryTimer = null
    }
    if (this.stateTimer) {
      clearTimeout(this.stateTimer)
      this.stateTimer = null
    }
    for (const timer of this.pairTimers.values()) clearTimeout(timer)
    this.pairTimers.clear()
    for (const record of this.devices.values()) {
      record.link?.close()
      record.link = undefined
    }
    this.udpSocket?.close()
    this.udpSocket = null
    this.tcpServer?.close()
    this.tcpServer = null
    this.tcpPort = 0
    this.progressWindow.dispose()
    this.deviceChooser.dispose()
  }

  /**
   * 返回设置页需要的完整快照。
   * @returns 配置、运行状态、设备与传输任务。
   */
  public getState(): InterconnectState {
    const config = this.getConfig()
    return {
      config,
      status: this.getStatus(),
      devices: this.getDeviceViews(),
      transfers: this.getTransferViews()
    }
  }

  /**
   * 读取当前有效配置。
   * @returns 配置副本。
   */
  public getConfig(): InterconnectConfig {
    return { ...(this.config || this.defaultConfig()) }
  }

  /**
   * 读取运行状态。
   * @returns 服务状态副本。
   */
  public getStatus(): InterconnectStatus {
    const config = this.getConfig()
    return {
      running: this.started,
      tcpPort: this.tcpPort,
      deviceId: this.identity?.deviceId || '',
      fingerprint: this.identity?.fingerprint || '',
      deviceName: config.deviceName,
      downloadDir: config.downloadDir
    }
  }

  /**
   * 保存配置并按需重启监听。
   * @param patch 需要更新的字段。
   * @returns 保存后的完整状态。
   */
  public async saveConfig(patch: Partial<InterconnectConfig>): Promise<InterconnectState> {
    const current = this.getConfig()
    const next = normalizeInterconnectConfig({ ...current, ...patch }, current)
    const shouldRestart = current.enabled !== next.enabled
    const nameChanged = current.deviceName !== next.deviceName
    this.config = next
    databaseAPI.dbPut(INTERCONNECT_DB_KEY, next)
    if (shouldRestart) {
      if (next.enabled) await this.start()
      else this.stop()
    } else if (nameChanged && this.started) {
      this.broadcastDiscovery()
    }
    this.emitState()
    return this.getState()
  }

  /**
   * 主动广播并等待设备回应。
   * @param waitMs 等待时间，默认 1200 毫秒。
   * @returns 刷新后的设备列表。
   */
  public async refreshDevices(waitMs = 1200): Promise<InterconnectDeviceView[]> {
    this.pruneLinks()
    if (this.started) {
      this.broadcastDiscovery()
      // 广播可能被网络策略丢弃；对已知地址的离线设备同时做一次直连重试。
      for (const record of this.devices.values()) {
        if (!record.link?.isAlive() && record.address && record.tcpPort) {
          record.lastConnectAt = 0
          void this.maybeConnect(record)
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, waitMs)))
      this.broadcastDiscovery()
    }
    return this.getDeviceViews()
  }

  /**
   * 发送或撤销配对请求。
   * @param deviceId 目标设备。
   * @param pair true 请求配对，false 取消配对。
   * @returns 操作结果。
   */
  public pairDevice(deviceId: string, pair: boolean): { success: boolean; error?: string } {
    const record = this.devices.get(deviceId)
    if (!pair) {
      // 重启后只恢复信任记录的离线设备没有本次运行记录，也必须允许撤销配对。
      if (!record && !this.trusted.has(deviceId)) return { success: false, error: '设备不存在' }
      if (record) {
        record.pendingPair = false
        record.pairRequestedAt = undefined
        record.link?.send(PACKET_PAIR, { pair: false })
        // 离线设备没有恢复通道，撤销后直接移除条目，避免失效记录长期残留。
        if (!record.link?.isAlive()) this.devices.delete(deviceId)
      }
      this.trusted.delete(deviceId)
      this.saveTrustedDevices()
      this.emitState()
      return { success: true }
    }
    if (this.trusted.has(deviceId)) return { success: true }
    if (!record) return { success: false, error: '设备不存在' }
    if (!record.link?.isAlive()) return { success: false, error: '设备当前不可达' }
    const sent = record.link.send(PACKET_PAIR, {
      pair: true,
      timestamp: Math.floor(Date.now() / 1000)
    })
    if (!sent) return { success: false, error: '配对请求发送失败' }
    record.pairRequestedAt = Date.now()
    this.emitState()
    return { success: true }
  }

  /**
   * 接受对方发起的配对请求。
   * @param deviceId 目标设备。
   * @returns 操作结果。
   */
  public acceptPairing(deviceId: string): { success: boolean; error?: string } {
    const record = this.devices.get(deviceId)
    if (!record?.link?.isAlive()) return { success: false, error: '设备当前不可达' }
    if (!record.pendingPair) return { success: false, error: '没有待接受的配对请求' }
    const sent = record.link.send(PACKET_PAIR, { pair: true })
    if (!sent) return { success: false, error: '配对确认发送失败' }
    record.pendingPair = false
    this.trustDevice(record)
    this.sendClipboardConnect(record)
    this.emitState()
    return { success: true }
  }

  /**
   * 使用系统目录选择器修改默认接收文件夹。
   * @returns 新的文件夹路径；取消时返回 null。
   */
  public async chooseDownloadDir(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: '选择互联接收文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths.length) return null
    await this.saveConfig({ downloadDir: result.filePaths[0] })
    return result.filePaths[0]
  }

  /**
   * 在资源管理器中打开默认接收文件夹。
   * @returns 无返回值。
   */
  public async openDownloadDir(): Promise<void> {
    const directory = this.getConfig().downloadDir
    fs.mkdirSync(directory, { recursive: true })
    await shell.openPath(directory)
  }

  /**
   * 打开互联传输面板，展示最近任务并允许重发或定位文件。
   * @returns 无返回值。
   */
  public showPanel(): void {
    this.progressWindow.show()
  }

  /**
   * 采用多设备选择窗口提交的目标设备。
   * @param deviceId 选中的设备 ID。
   * @returns 无返回值。
   */
  public resolveDeviceChoice(deviceId: string): void {
    this.deviceChooser.resolve(deviceId)
  }

  /**
   * 重新发起失败的发送任务，保留原失败记录以便对照。
   * @param transferId 失败任务标识。
   * @returns 启动结果；实际传输在后台继续。
   */
  public async retryTransfer(transferId: string): Promise<{ success: boolean; error?: string }> {
    const record = this.transfers.get(transferId)
    if (!record || record.direction !== 'send' || record.status !== 'error') {
      return { success: false, error: '该任务不可重新发起' }
    }
    const device = this.devices.get(record.deviceId)
    if (!device || !this.trusted.has(device.id)) {
      return { success: false, error: '目标设备已取消配对' }
    }
    const files: { path: string; stat: fs.Stats }[] = []
    for (const file of record.files) {
      if (!file.path) continue
      try {
        const stat = await fs.promises.stat(file.path)
        if (stat.isFile()) files.push({ path: file.path, stat })
      } catch {
        // 源文件已被移动或删除时跳过，剩余文件仍可继续重发。
      }
    }
    if (!files.length) return { success: false, error: '原文件已不存在，无法重新发起' }
    if (!(await this.waitForLink(device, LINK_WAIT))) {
      return { success: false, error: '设备当前不在线，请确认已连接后重试' }
    }
    if (!remoteAccepts(device.link!.remote, PACKET_SHARE_REQUEST)) {
      return { success: false, error: '对方不支持文件传输' }
    }
    void this.runSendTransfer(device, files)
    return { success: true }
  }

  /**
   * 在资源管理器中定位任务中的本地文件。
   * @param transferId 任务标识。
   * @param fileIndex 文件序号。
   * @returns 是否成功唤起资源管理器。
   */
  public revealTransferFile(
    transferId: string,
    fileIndex: number
  ): { success: boolean; error?: string } {
    const record = this.transfers.get(transferId)
    const target = record?.files[fileIndex]?.path
    if (!target) return { success: false, error: '任务没有可定位的本地文件' }
    if (!fs.existsSync(target)) return { success: false, error: '文件已不存在' }
    shell.showItemInFolder(target)
    return { success: true }
  }

  /**
   * 把当前剪贴板文本主动同步到指定设备或全部在线设备。
   * @param deviceId 目标设备；省略时同步到全部已配对在线设备。
   * @returns 操作结果。
   */
  public syncClipboard(deviceId?: string): { success: boolean; error?: string } {
    const text = clipboard.readText()
    if (!text) return { success: false, error: '剪贴板没有文本内容' }
    const targets = deviceId ? [this.devices.get(deviceId)] : [...this.devices.values()]
    const online = targets.filter((record): record is DeviceRecord =>
      Boolean(record?.link?.isAlive() && this.trusted.has(record.id))
    )
    if (!online.length) return { success: false, error: '没有已配对的在线设备' }
    let sent = 0
    for (const record of online) {
      if (this.sendClipboardText(record, text)) sent++
    }
    return sent ? { success: true } : { success: false, error: '对方不支持剪贴板同步' }
  }

  /**
   * 发送文件到指定设备或默认设备。
   * @param filePaths 待发送的本地文件。
   * @param deviceId 目标设备；省略时使用默认或首个在线设备。
   * @returns 操作结果，传输在后台继续。
   */
  public async sendFiles(
    filePaths: string[],
    deviceId?: string
  ): Promise<{ success: boolean; error?: string; deviceId?: string }> {
    if (!this.started) return { success: false, error: '互联服务未启动' }
    const record = deviceId ? this.devices.get(deviceId) : this.pickTargetDevice()
    if (!record) return { success: false, error: '没有已配对的在线设备' }
    if (!this.trusted.has(record.id)) return { success: false, error: '设备尚未配对' }
    // 首次传输时链路可能仍在握手；等待就绪可以避开刚发现就立刻发送的失败。
    if (!(await this.waitForLink(record, LINK_WAIT))) {
      return { success: false, error: '没有已配对的在线设备' }
    }
    if (!remoteAccepts(record.link!.remote, PACKET_SHARE_REQUEST)) {
      return { success: false, error: '对方不支持文件传输' }
    }
    const files: { path: string; stat: fs.Stats }[] = []
    for (const filePath of filePaths) {
      try {
        const stat = await fs.promises.stat(filePath)
        if (stat.isFile()) files.push({ path: filePath, stat })
      } catch {
        // 单个文件不可读时跳过，不让整批任务中断。
      }
    }
    if (!files.length) return { success: false, error: '没有可发送的文件' }
    void this.runSendTransfer(record, files)
    return { success: true, deviceId: record.id }
  }

  /**
   * 执行“互联传输”指令：文件走文件传输，文本走一次主动剪贴板同步。
   * 文件与图片存在多个已配对在线设备时先让用户选择目标设备。
   * @param param 指令输入，可能是 files、img、over 或普通文本入口。
   * @returns 启动结果；实际传输在后台继续。
   */
  public async transferFromInput(param: any): Promise<{
    success: boolean
    error?: string
    deviceId?: string
    canceled?: boolean
  }> {
    if (!this.started) return { success: false, error: '互联服务未启动，请先在设置中启用' }
    await this.refreshDevices(1200)

    if (param?.type === 'files' && Array.isArray(param.payload)) {
      const paths = param.payload
        .map((file: any) => (typeof file === 'string' ? file : file?.path))
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      if (!paths.length) return { success: false, error: '没有可发送的文件' }
      const choice = await this.chooseTransferTarget('选择接收设备')
      if (!choice.target) {
        return choice.canceled
          ? { success: false, error: '已取消传输', canceled: true }
          : { success: false, error: '没有已配对且支持文件传输的在线设备' }
      }
      return this.sendFiles(paths, choice.target.id)
    }

    if (param?.type === 'img' && typeof param.payload === 'string' && param.payload) {
      const choice = await this.chooseTransferTarget('选择接收设备')
      if (!choice.target) {
        return choice.canceled
          ? { success: false, error: '已取消传输', canceled: true }
          : { success: false, error: '没有已配对且支持文件传输的在线设备' }
      }
      const directory = path.join(getTempPath(), 'interconnect')
      fs.mkdirSync(directory, { recursive: true })
      const filePath = path.join(directory, `image-${Date.now()}.png`)
      const base64 = param.payload.replace(/^data:image\/[^;]+;base64,/, '')
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
      return this.sendFiles([filePath], choice.target.id)
    }

    const target = this.pickTargetDevice()
    if (!target)
      return { success: false, error: '没有已配对的在线设备，请先在“设置 → 互联服务”配对' }

    const text =
      param?.type === 'over' && typeof param.payload === 'string' ? param.payload.trim() : ''
    if (text) {
      // 明确选中的文本先登记到本机剪贴板，再作为一次同步发送。
      await clipboardManager.writeTextEntry(text)
      this.applyingRemoteClipboard = true
      setTimeout(() => {
        this.applyingRemoteClipboard = false
      }, 300)
    }
    const sent = this.syncClipboard(target.id)
    return sent.success
      ? { success: true, deviceId: target.id }
      : { success: false, error: sent.error, deviceId: target.id }
  }

  /**
   * 生成默认配置；仅在配置键缺失时使用。
   * @returns 默认配置。
   */
  private defaultConfig(): InterconnectConfig {
    const hostname = sanitizeDeviceName(os.hostname()) || 'TabDo'
    return {
      // 局域网监听默认关闭，与 HTTP 服务一致，由用户在“互联服务”中主动启用。
      enabled: false,
      deviceName: hostname,
      downloadDir: path.join(app.getPath('downloads'), 'TabDo'),
      syncClipboard: true,
      autoAcceptPairing: false,
      notifications: true,
      preferredDeviceId: ''
    }
  }

  /**
   * 读取已信任设备列表。
   * @returns 无返回值。
   */
  private loadTrustedDevices(): void {
    const stored = databaseAPI.dbGet(INTERCONNECT_TRUSTED_DEVICES_KEY)
    if (!Array.isArray(stored)) return
    for (const item of stored) {
      if (!item || typeof item !== 'object') continue
      const value = item as Record<string, unknown>
      if (typeof value.id !== 'string' || typeof value.certificatePem !== 'string') continue
      const fingerprint =
        typeof value.fingerprint === 'string' && value.fingerprint
          ? value.fingerprint
          : formatCertificateFingerprint(certificatePemToDer(value.certificatePem))
      this.trusted.set(value.id, {
        id: value.id,
        name: typeof value.name === 'string' ? value.name : '未知设备',
        type: typeof value.type === 'string' ? value.type : 'unknown',
        protocolVersion:
          typeof value.protocolVersion === 'number'
            ? value.protocolVersion
            : INTERCONNECT_PROTOCOL_VERSION,
        certificatePem: value.certificatePem,
        fingerprint
      })
    }
  }

  /**
   * 持久化已信任设备列表。
   * @returns 无返回值。
   */
  private saveTrustedDevices(): void {
    databaseAPI.dbPut(INTERCONNECT_TRUSTED_DEVICES_KEY, [...this.trusted.values()])
  }

  /**
   * 启动 UDP 发现与 TCP 监听。
   * @returns 启动完成后的 Promise。
   */
  private async start(): Promise<void> {
    if (this.started || !this.secureContext) return
    this.started = true
    try {
      await this.startUdp()
      await this.startTcp()
      this.broadcastDiscovery()
      this.discoveryTimer = setInterval(() => this.broadcastDiscovery(), 20000)
      console.log('[Interconnect] 服务已启动，TCP 端口:', this.tcpPort)
    } catch (error) {
      // 端口全部占用时回退为停止状态，避免界面显示“运行中”但没有监听。
      this.started = false
      this.udpSocket?.close()
      this.udpSocket = null
      this.tcpServer?.close()
      this.tcpServer = null
      this.tcpPort = 0
      this.emitState()
      throw error
    }
  }

  /**
   * 绑定 UDP 发现端口；端口被占用时退化为临时端口继续广播。
   * @returns 绑定完成后的 Promise。
   */
  private async startUdp(): Promise<void> {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.udpSocket = socket
    socket.on('message', (message, remote) => this.handleDiscovery(message, remote.address))
    socket.on('error', (error) => {
      console.warn('[Interconnect] UDP 错误:', error.message)
    })
    await new Promise<void>((resolve) => {
      const fallback = (): void => {
        socket.once('error', () => resolve())
        try {
          socket.bind(0, '0.0.0.0', () => resolve())
        } catch {
          resolve()
        }
      }
      socket.once('error', fallback)
      socket.bind(INTERCONNECT_UDP_PORT, '0.0.0.0', () => {
        socket.off('error', fallback)
        resolve()
      })
    })
    try {
      socket.setBroadcast(true)
    } catch (error) {
      console.warn('[Interconnect] 无法开启 UDP 广播:', error)
    }
  }

  /**
   * 在约定端口范围内监听 TCP 链路。
   * @returns 监听完成后的 Promise。
   */
  private async startTcp(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let port = INTERCONNECT_TCP_PORT_MIN
      const attempt = (): void => {
        const server = net.createServer((socket) => this.handleIncoming(socket))
        const onError = (error: NodeJS.ErrnoException): void => {
          server.close()
          if (error.code !== 'EADDRINUSE' || port >= INTERCONNECT_TCP_PORT_MAX) {
            reject(error)
            return
          }
          port += 1
          attempt()
        }
        server.once('error', onError)
        server.listen(port, '0.0.0.0', () => {
          server.off('error', onError)
          server.on('error', (error) => console.warn('[Interconnect] TCP 错误:', error))
          this.tcpServer = server
          this.tcpPort = port
          resolve()
        })
      }
      attempt()
    })
  }

  /**
   * 广播一次本机发现包。
   * @returns 无返回值。
   */
  private broadcastDiscovery(): void {
    if (!this.started || !this.udpSocket || !this.config || !this.identity || !this.tcpPort) return
    const packet = Buffer.from(
      `${JSON.stringify({
        id: Date.now(),
        type: PACKET_IDENTITY,
        body: {
          deviceId: this.identity.deviceId,
          deviceName: this.config.deviceName,
          protocolVersion: INTERCONNECT_PROTOCOL_VERSION,
          tcpPort: this.tcpPort
        }
      })}\n`
    )
    for (const address of listBroadcastAddresses()) {
      try {
        this.udpSocket.send(packet, INTERCONNECT_UDP_PORT, address)
      } catch {
        // 单个网卡发送失败不影响其余网段。
      }
    }
  }

  /**
   * 处理 UDP 发现包并按需发起连接。
   * @param message 原始数据。
   * @param remoteAddress 发送方地址。
   * @returns 无返回值。
   */
  private handleDiscovery(message: Buffer, remoteAddress: string): void {
    if (!this.identity) return
    const packet = parsePacket(message)
    if (!packet || packet.type !== PACKET_IDENTITY) return
    const deviceId = packet.body.deviceId
    if (typeof deviceId !== 'string' || deviceId === this.identity.deviceId) return
    const remote = readRemoteIdentity(packet)
    if (!remote) return
    const tcpPort = packet.body.tcpPort
    const protocolVersion = packet.body.protocolVersion
    if (typeof tcpPort !== 'number' || tcpPort <= 0) return
    if (typeof protocolVersion !== 'number' || protocolVersion < INTERCONNECT_PROTOCOL_VERSION)
      return

    const record = this.ensureDevice(remote.deviceId)
    record.name = remote.deviceName || record.name
    record.type = remote.deviceType || record.type
    record.protocolVersion = protocolVersion
    record.address = remoteAddress.startsWith('::ffff:') ? remoteAddress.slice(7) : remoteAddress
    record.tcpPort = tcpPort
    this.emitState()
    void this.maybeConnect(record)
  }

  /**
   * 在冷却时间外主动连接发现到的设备。
   * @param record 目标设备。
   * @returns 连接尝试结束后的 Promise。
   */
  private async maybeConnect(record: DeviceRecord): Promise<void> {
    if (record.link?.isAlive() || !record.address || !record.tcpPort) return
    const now = Date.now()
    if (record.lastConnectAt && now - record.lastConnectAt < CONNECT_COOLDOWN) return
    record.lastConnectAt = now
    try {
      const result = await connectOutgoing(
        record.address,
        record.tcpPort,
        { deviceId: record.id, protocolVersion: record.protocolVersion },
        this.linkContext(record)
      )
      this.attachLink(result)
    } catch (error) {
      console.warn('[Interconnect] 连接设备失败:', record.name, (error as Error).message)
      // 对端可能已在本次重试期间连入并建立可用链路，失败结果不能清掉它。
      if (!record.link?.isAlive()) {
        record.link = undefined
        this.emitState()
      }
    }
  }

  /**
   * 处理传入的 TCP 连接。
   * @param socket 已接受的 TCP 套接字。
   * @returns 无返回值。
   */
  private handleIncoming(socket: net.Socket): void {
    const context = this.linkContext()
    void acceptIncoming(socket, context)
      .then((result) => this.attachLink(result))
      .catch((error: Error) => {
        console.warn('[Interconnect] 接收连接失败:', error.message)
        socket.destroy()
      })
  }

  /**
   * 生成链路握手上下文。
   * @param record 已知目标设备。
   * @returns 本机身份与信任指纹。
   */
  private linkContext(record?: DeviceRecord): LinkContext {
    if (!this.identity || !this.secureContext || !this.config) {
      throw new Error('互联服务尚未初始化')
    }
    return {
      deviceId: this.identity.deviceId,
      deviceName: this.config.deviceName,
      secureContext: this.secureContext,
      trustedFingerprint: record ? this.trusted.get(record.id)?.fingerprint || null : null
    }
  }

  /**
   * 采用新链路并接管事件。
   * @param result 握手结果。
   * @returns 无返回值。
   */
  private attachLink(result: HandshakeResult): void {
    const trusted = this.trusted.get(result.remote.deviceId)
    if (
      trusted &&
      trusted.fingerprint.replace(/:/g, '').toUpperCase() !==
        result.fingerprint.replace(/:/g, '').toUpperCase()
    ) {
      result.link.close()
      console.warn('[Interconnect] 拒绝证书与配对记录不一致的设备:', result.remote.deviceName)
      return
    }
    const record = this.ensureDevice(result.remote.deviceId)
    record.name = result.remote.deviceName
    record.type = result.remote.deviceType
    record.protocolVersion = result.remote.protocolVersion
    record.incomingCapabilities = result.remote.incomingCapabilities
    record.outgoingCapabilities = result.remote.outgoingCapabilities
    record.certificatePem = result.certificatePem
    record.address = result.link.getPeerAddress() || record.address
    // 与 KDE Connect 保持一致：新完成握手的链路直接替换旧链路。
    // Android 收到发现广播后会新建链路并先关闭旧 socket；若这里保留旧链路，
    // 会持续关掉对端当前可用的连接，表现为“已配对/离线”反复跳变。
    const previousLink = record.link
    record.link = result.link

    result.link.on('packet', (packet: NetworkPacket) => this.handlePacket(record, packet))
    result.link.on('closed', () => {
      if (record.link === result.link) {
        record.link = undefined
        this.emitState()
        // 链路意外结束后再广播一次，避免双方都停在“假离线”状态。
        setTimeout(() => this.broadcastDiscovery(), 800)
      }
    })
    // 先让新链路接管记录与回调，再关闭旧链路；旧链路的 closed 回调不会清空新状态。
    if (previousLink && previousLink !== result.link) previousLink.close()

    if (trusted) {
      trusted.name = record.name
      trusted.type = record.type
      trusted.protocolVersion = record.protocolVersion
      this.saveTrustedDevices()
      if (this.config?.syncClipboard) this.sendClipboardConnect(record)
    }
    this.emitState()
  }

  /**
   * 获取或创建设备记录。
   * @param deviceId 设备 ID。
   * @returns 可修改的设备记录。
   */
  private ensureDevice(deviceId: string): DeviceRecord {
    const existing = this.devices.get(deviceId)
    if (existing) return existing
    const trusted = this.trusted.get(deviceId)
    const record: DeviceRecord = {
      id: deviceId,
      name: trusted?.name || '未知设备',
      type: trusted?.type || 'unknown',
      protocolVersion: trusted?.protocolVersion || INTERCONNECT_PROTOCOL_VERSION,
      incomingCapabilities: [],
      outgoingCapabilities: [],
      certificatePem: trusted?.certificatePem,
      pendingPair: false
    }
    this.devices.set(deviceId, record)
    return record
  }

  /**
   * 分发链路协议包。
   * @param record 发送方设备。
   * @param packet 协议包。
   * @returns 无返回值。
   */
  private handlePacket(record: DeviceRecord, packet: NetworkPacket): void {
    if (packet.type === PACKET_PAIR) {
      this.handlePairPacket(record, packet)
      return
    }
    if (!this.trusted.has(record.id)) return
    switch (packet.type) {
      case PACKET_CLIPBOARD:
        this.applyRemoteText(packet.body.content)
        break
      case PACKET_CLIPBOARD_CONNECT: {
        const timestamp = typeof packet.body.timestamp === 'number' ? packet.body.timestamp : 0
        if (!timestamp || timestamp < this.remoteClipboardTimestamp) return
        this.remoteClipboardTimestamp = timestamp
        this.applyRemoteText(packet.body.content)
        break
      }
      case PACKET_CLIPBOARD_FILE:
        void this.handleRemoteClipboardFile(record, packet)
        break
      case PACKET_SHARE_REQUEST:
        void this.handleIncomingFile(record, packet)
        break
      case PACKET_SHARE_UPDATE:
        break
      default:
        break
    }
  }

  /**
   * 处理配对协议包。
   * @param record 对端设备。
   * @param packet 配对协议包。
   * @returns 无返回值。
   */
  private handlePairPacket(record: DeviceRecord, packet: NetworkPacket): void {
    const wantsPair = packet.body.pair === true
    if (!wantsPair) {
      record.pendingPair = false
      record.pairRequestedAt = undefined
      this.clearPairTimer(record.id)
      if (this.trusted.has(record.id)) {
        this.trusted.delete(record.id)
        this.saveTrustedDevices()
      }
      this.emitState()
      return
    }

    const hasTimestamp = typeof packet.body.timestamp === 'number'
    if (hasTimestamp) {
      // 已有信任时忽略重复请求，避免远程重复点击导致重复写入。
      if (this.trusted.has(record.id)) return
      record.pendingPair = true
      this.emitState()
      if (this.config?.autoAcceptPairing) {
        this.acceptPairing(record.id)
        return
      }
      this.notify('互联服务', `${record.name} 请求配对，请在“设置 → 互联服务”确认`)
      const timer = setTimeout(() => {
        record.pendingPair = false
        this.pairTimers.delete(record.id)
        this.emitState()
      }, 60000)
      this.pairTimers.set(record.id, timer)
      return
    }

    // 无时间戳的 pair=true 是对本机请求的接受。
    if (record.pairRequestedAt) {
      record.pairRequestedAt = undefined
      this.clearPairTimer(record.id)
      this.trustDevice(record)
      this.sendClipboardConnect(record)
      this.emitState()
    }
  }

  /**
   * 清除待接受配对计时器。
   * @param deviceId 设备 ID。
   * @returns 无返回值。
   */
  private clearPairTimer(deviceId: string): void {
    const timer = this.pairTimers.get(deviceId)
    if (timer) clearTimeout(timer)
    this.pairTimers.delete(deviceId)
  }

  /**
   * 写入设备信任并持久化。
   * @param record 目标设备。
   * @returns 无返回值。
   */
  private trustDevice(record: DeviceRecord): void {
    if (!record.certificatePem) return
    this.trusted.set(record.id, {
      id: record.id,
      name: record.name,
      type: record.type,
      protocolVersion: record.protocolVersion,
      certificatePem: record.certificatePem,
      fingerprint: formatCertificateFingerprint(certificatePemToDer(record.certificatePem))
    })
    this.saveTrustedDevices()
  }

  /**
   * 把远端文本写入本机剪贴板，并抑制回声。
   * @param content 远端文本。
   * @returns 无返回值。
   */
  private applyRemoteText(content: unknown): void {
    if (typeof content !== 'string' || !content) return
    if (clipboard.readText() === content) return
    this.applyingRemoteClipboard = true
    void clipboardManager
      .writeTextEntry(content)
      .catch((error) => console.warn('[Interconnect] 写入远端剪贴板失败:', error))
      .finally(() => {
        setTimeout(() => {
          this.applyingRemoteClipboard = false
        }, 600)
      })
  }

  /**
   * 处理本机剪贴板变化并同步到在线设备。
   * @param item 宿主采集结果。
   * @returns 无返回值。
   */
  private handleCaptured(item: unknown): void {
    if (!this.started || !this.config?.syncClipboard || this.applyingRemoteClipboard) return
    const payload = readClipboardPayload(item)
    if (payload.text) {
      for (const record of this.devices.values()) {
        if (record.link?.isAlive() && this.trusted.has(record.id)) {
          this.sendClipboardText(record, payload.text)
        }
      }
    } else if (payload.imagePath) {
      void this.broadcastClipboardFile(payload.imagePath)
    }
  }

  /**
   * 发送一条剪贴板文本。
   * @param record 目标设备。
   * @param text 文本内容。
   * @returns 对方接受并写入成功时返回 true。
   */
  private sendClipboardText(record: DeviceRecord, text: string): boolean {
    if (!record.link?.isAlive()) return false
    if (!remoteAccepts(record.link.remote, PACKET_CLIPBOARD)) return false
    return record.link.send(PACKET_CLIPBOARD, { content: text })
  }

  /**
   * 链路建立后发送剪贴板连接包，把本机当前内容同步给对方。
   * @param record 目标设备。
   * @returns 无返回值。
   */
  private sendClipboardConnect(record: DeviceRecord): void {
    if (!record.link?.isAlive()) return
    if (!remoteAccepts(record.link.remote, PACKET_CLIPBOARD_CONNECT)) return
    const text = clipboard.readText()
    record.link.send(PACKET_CLIPBOARD_CONNECT, {
      content: text,
      timestamp: Date.now()
    })
  }

  /**
   * 把剪贴板图片作为文件同步到在线设备。
   * @param imagePath 图片路径。
   * @returns 全部发送尝试结束后的 Promise。
   */
  private async broadcastClipboardFile(imagePath: string): Promise<void> {
    let stat: fs.Stats
    try {
      stat = await fs.promises.stat(imagePath)
    } catch {
      return
    }
    if (!stat.isFile() || stat.size > MAX_CLIPBOARD_FILE_SIZE) return
    for (const record of this.devices.values()) {
      if (!record.link?.isAlive() || !this.trusted.has(record.id)) continue
      if (!remoteAccepts(record.link.remote, PACKET_CLIPBOARD_FILE)) continue
      try {
        await this.sendPayloadFile(
          record,
          imagePath,
          PACKET_CLIPBOARD_FILE,
          { filename: path.basename(imagePath) },
          () => undefined
        )
      } catch (error) {
        console.warn('[Interconnect] 同步剪贴板图片失败:', (error as Error).message)
      }
    }
  }

  /**
   * 接收远端剪贴板文件并写入系统剪贴板。
   * @param record 对端设备。
   * @param packet 剪贴板文件协议包。
   * @returns 接收完成后的 Promise。
   */
  private async handleRemoteClipboardFile(
    record: DeviceRecord,
    packet: NetworkPacket
  ): Promise<void> {
    const filename = sanitizeFilename(
      typeof packet.body.filename === 'string' ? packet.body.filename : `clipboard-${Date.now()}`
    )
    const directory = path.join(getTempPath(), 'interconnect-clipboard')
    fs.mkdirSync(directory, { recursive: true })
    const destination = path.join(directory, `${randomUUID()}-${filename}`)
    const port = this.readPayloadPort(packet)
    try {
      if (port) {
        const expectedSize = typeof packet.payloadSize === 'number' ? packet.payloadSize : -1
        await this.receivePayload(record, port, destination, expectedSize, () => undefined)
      } else {
        await fs.promises.writeFile(destination, Buffer.alloc(0))
      }
      this.applyingRemoteClipboard = true
      if (isClipboardImage(destination)) {
        clipboard.writeImage(nativeImage.createFromPath(destination))
        // 图片已写入系统剪贴板，临时副本可以立即回收。
        fs.rm(destination, { force: true }, () => undefined)
      } else {
        await clipboardManager.writeTextEntry(destination)
      }
    } catch (error) {
      console.warn('[Interconnect] 接收剪贴板文件失败:', (error as Error).message)
    } finally {
      setTimeout(() => {
        this.applyingRemoteClipboard = false
      }, 800)
    }
  }

  /**
   * 从协议包中读取载荷端口。
   * @param packet 协议包。
   * @returns 合法端口；没有载荷时返回 null。
   */
  private readPayloadPort(packet: NetworkPacket): number | null {
    const port = packet.payloadTransferInfo?.port
    return typeof port === 'number' && port > 0 && port < 65536 ? port : null
  }

  /**
   * 解析远端文件传输请求。
   * @param packet 共享协议包。
   * @returns 校验后的文件信息。
   */
  private readIncomingFileRequest(packet: NetworkPacket): IncomingFileRequest {
    const filename = sanitizeFilename(
      typeof packet.body.filename === 'string' ? packet.body.filename : `received-${Date.now()}`
    )
    const size = typeof packet.payloadSize === 'number' ? packet.payloadSize : 0
    return {
      filename,
      size,
      port: this.readPayloadPort(packet),
      open: packet.body.open === true
    }
  }

  /**
   * 接收远端文件并写入默认文件夹。
   * @param record 对端设备。
   * @param packet 共享协议包。
   * @returns 接收完成后的 Promise。
   */
  private async handleIncomingFile(record: DeviceRecord, packet: NetworkPacket): Promise<void> {
    const request = this.readIncomingFileRequest(packet)
    const directory = this.getConfig().downloadDir
    fs.mkdirSync(directory, { recursive: true })
    const destination = this.uniqueDestination(directory, request.filename)
    const transfer = this.createTransfer('receive', record, [
      { name: path.basename(destination), size: Math.max(0, request.size), path: destination }
    ])
    try {
      transfer.destinationDir = directory
      this.publishTransfers()
      if (request.port && request.size !== 0) {
        await this.receivePayload(record, request.port, destination, request.size, (transferred) =>
          this.updateFileProgress(transfer, 0, transferred)
        )
      } else {
        await fs.promises.writeFile(destination, Buffer.alloc(0))
      }
      // 接收文件一律使用当前时间，不沿用发送方的修改时间。
      const now = new Date()
      fs.utimes(destination, now, now, () => undefined)
      this.finishTransferFile(transfer, 0, 'done')
      transfer.status = 'done'
      transfer.speed = 0
      transfer.updatedAt = Date.now()
      this.publishTransfers()
      this.notify('互联传输', `已接收 ${path.basename(destination)}`)
      if (request.open) await shell.openPath(destination)
    } catch (error) {
      console.warn('[Interconnect] 接收文件失败:', (error as Error).message)
      transfer.status = 'error'
      transfer.error = (error as Error).message
      this.finishTransferFile(transfer, 0, 'error')
      this.publishTransfers()
      this.notify('互联传输失败', transfer.error)
    }
  }

  /**
   * 生成不会覆盖已有文件的落点路径。
   * @param directory 目标目录。
   * @param filename 期望文件名。
   * @returns 可写入的绝对路径。
   */
  private uniqueDestination(directory: string, filename: string): string {
    const base = sanitizeFilename(filename)
    const resolvedDirectory = path.resolve(directory)
    let candidate = path.resolve(resolvedDirectory, base)
    if (!candidate.startsWith(`${resolvedDirectory}${path.sep}`)) {
      candidate = path.resolve(resolvedDirectory, `received-${Date.now()}`)
    }
    const extension = path.extname(candidate)
    const stem = candidate.slice(0, candidate.length - extension.length)
    let index = 1
    while (fs.existsSync(candidate)) {
      candidate = `${stem} (${index})${extension}`
      index += 1
    }
    return candidate
  }

  /**
   * 连接远端载荷端口并写入文件。
   * @param record 对端设备。
   * @param port 载荷端口。
   * @param destination 落点路径。
   * @param onProgress 已接收字节回调。
   * @returns 文件落盘完成后的 Promise。
   */
  private receivePayload(
    record: DeviceRecord,
    port: number,
    destination: string,
    expectedSize: number,
    onProgress: (transferred: number) => void
  ): Promise<void> {
    if (!this.identity || !record.address) {
      return Promise.reject(new Error('缺少接收载荷所需的地址或证书'))
    }
    return new Promise<void>((resolve, reject) => {
      const partPath = `${destination}.part`
      const output = fs.createWriteStream(partPath)
      let socket: tls.TLSSocket | null = null
      let received = 0
      let settled = false
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        socket?.destroy()
        output.destroy()
        fs.rm(partPath, { force: true }, () => reject(error))
      }
      const finish = (): void => {
        if (settled) return
        // 只有收到对端声明的全部字节才算完成；否则对端中断也会被误判为接收成功。
        if (expectedSize >= 0 && received < expectedSize) {
          fail(new Error(`接收中断：文件不完整（${received} / ${expectedSize} 字节）`))
          return
        }
        settled = true
        socket?.destroy()
        output.end(() => {
          fs.rename(partPath, destination, (error) => {
            if (error) reject(error)
            else resolve()
          })
        })
      }

      // 文件句柄就绪后再建立载荷连接，避免数据先到而写入流尚未打开。
      output.once('open', () => {
        const tlsSocket = tls.connect({
          host: record.address,
          port,
          key: this.identity!.privateKeyPem,
          cert: this.identity!.certificatePem,
          requestCert: true,
          rejectUnauthorized: false
        })
        socket = tlsSocket
        tlsSocket.setTimeout(PAYLOAD_TIMEOUT, () => fail(new Error('等待载荷连接超时')))
        tlsSocket.once('secureConnect', () => {
          const peer = tlsSocket.getPeerCertificate()
          if (peer?.subject?.CN !== record.id) {
            fail(new Error('载荷连接证书与设备不一致'))
          }
        })
        tlsSocket.on('data', (chunk: Buffer) => {
          if (settled) return
          received += chunk.length
          onProgress(received)
          if (!output.write(chunk)) tlsSocket.pause()
          // 部分实现对端不发送 close_notify；收到声明长度即视为完整。
          if (expectedSize >= 0 && received >= expectedSize) finish()
        })
        output.on('drain', () => tlsSocket.resume())
        // 对端正常结束与异常关闭都走 finish，由声明长度统一判定是否完整。
        tlsSocket.on('end', finish)
        tlsSocket.on('close', () => {
          if (settled) return
          // 个别实现对端会先发 FIN 再交付已缓冲数据，延后一拍再判断是否完整。
          setTimeout(finish, 50)
        })
        tlsSocket.on('error', fail)
      })
      output.once('error', fail)
    })
  }

  /**
   * 创建发送任务并顺序发送文件。
   * @param record 目标设备。
   * @param files 文件路径与状态。
   * @returns 发送完成后的 Promise。
   */
  private async runSendTransfer(
    record: DeviceRecord,
    files: { path: string; stat: fs.Stats }[]
  ): Promise<void> {
    const transfer = this.createTransfer(
      'send',
      record,
      files.map((file) => ({
        name: path.basename(file.path),
        size: file.stat.size,
        path: path.resolve(file.path)
      }))
    )
    this.publishTransfers()
    const totalSize = files.reduce((sum, file) => sum + file.stat.size, 0)
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      this.markFileRunning(transfer, index)
      try {
        await this.sendPayloadFile(
          record,
          file.path,
          PACKET_SHARE_REQUEST,
          {
            filename: path.basename(file.path),
            // 不声明原文件的创建与修改时间：KDE Connect 等接收端会据此还原旧日期，
            // 省略后由接收端按自身接收时间落盘，与 TabDo 端行为一致。
            open: false,
            numberOfFiles: files.length,
            totalPayloadSize: totalSize
          },
          (transferred) => this.updateFileProgress(transfer, index, transferred)
        )
        this.finishTransferFile(transfer, index, 'done')
      } catch (error) {
        transfer.status = 'error'
        transfer.error = (error as Error).message
        this.finishTransferFile(transfer, index, 'error')
        break
      }
    }
    if (transfer.status !== 'error') {
      transfer.status = 'done'
      transfer.speed = 0
      transfer.updatedAt = Date.now()
    }
    // 指令生成的临时图片只服务本次发送，结束后回收；用户选中文件不受影响。
    const tempDirectory = path.resolve(getTempPath(), 'interconnect')
    for (const file of files) {
      const resolved = path.resolve(file.path)
      if (resolved.startsWith(`${tempDirectory}${path.sep}`)) {
        fs.rm(file.path, { force: true }, () => undefined)
      }
    }
    this.publishTransfers()
  }

  /**
   * 通过一次性 TLS 服务端发送单个文件载荷。
   * @param record 目标设备。
   * @param filePath 文件路径。
   * @param packetType 协议包类型。
   * @param body 业务字段。
   * @param onProgress 已发送字节回调。
   * @returns 发送完成后的 Promise。
   */
  private sendPayloadFile(
    record: DeviceRecord,
    filePath: string,
    packetType: string,
    body: Record<string, unknown>,
    onProgress: (transferred: number) => void
  ): Promise<void> {
    if (!this.identity) return Promise.reject(new Error('互联服务尚未初始化'))
    if (!record.link?.isAlive()) return Promise.reject(new Error('设备链路已断开'))
    const notify = (title: string, message: string): void => this.notify(title, message)
    const size = fs.statSync(filePath).size
    if (size === 0) {
      const sent = record.link.send(packetType, body, { payloadSize: 0 })
      return sent ? Promise.resolve() : Promise.reject(new Error('协议包发送失败'))
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false
      let accepted = false
      let sent = 0
      let timer: NodeJS.Timeout | null = null
      let hintTimer: NodeJS.Timeout | null = null
      let readStream: fs.ReadStream | null = null
      const sockets = new Set<tls.TLSSocket>()
      // 载荷连接显式提供证书与私钥：tls.connect 只带 secureContext 时对端可能收不到客户端证书。
      const server = tls.createServer(
        {
          key: this.identity!.privateKeyPem,
          cert: this.identity!.certificatePem,
          requestCert: true,
          rejectUnauthorized: false
        },
        (socket) => {
          if (accepted) {
            socket.destroy()
            return
          }
          accepted = true
          // 接收方已连入载荷端口：连接等待计时结束，大文件传输耗时远超该阈值。
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          // 接收方已连入载荷端口，取消防火墙等待提示，避免正常传输中误报。
          if (hintTimer) {
            clearTimeout(hintTimer)
            hintTimer = null
          }
          sockets.add(socket)
          const peer = socket.getPeerCertificate()
          if (peer?.subject?.CN !== record.id) {
            fail(new Error('接收方证书与设备不一致'))
            return
          }
          const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 })
          readStream = stream
          stream.on('data', (chunk) => {
            sent += chunk.length
            onProgress(sent)
            if (!socket.write(chunk)) stream.pause()
          })
          socket.on('drain', () => stream.resume())
          socket.on('error', fail)
          // 接收方中途断开时立即结束任务，避免发送端长期停在传输中。
          socket.on('close', () => {
            if (settled) return
            if (sent >= size) done()
            else fail(new Error('接收方在传输完成前断开连接'))
          })
          stream.on('error', fail)
          stream.on('end', () => {
            // 等 TLS 套接字把缓冲数据写完再结束任务，避免接收方拿到截断文件。
            socket.end(() => done())
          })
        }
      )
      const cleanup = (): void => {
        if (timer) clearTimeout(timer)
        timer = null
        if (hintTimer) clearTimeout(hintTimer)
        hintTimer = null
        readStream?.destroy()
        readStream = null
        for (const socket of sockets) socket.destroy()
        sockets.clear()
        server.close()
      }
      const done = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      server.on('error', fail)
      server.listen(0, '0.0.0.0', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        if (!port) {
          fail(new Error('无法创建载荷端口'))
          return
        }
        const sentPacket = record.link?.send(packetType, body, {
          payloadSize: size,
          payloadTransferInfo: { port }
        })
        if (!sentPacket) {
          fail(new Error('协议包发送失败'))
          return
        }
        timer = setTimeout(
          () =>
            fail(new Error('等待接收方连接超时，请确认 Windows 防火墙已允许 TabDo 访问专用网络')),
          PAYLOAD_TIMEOUT
        )
        // 首次传输需要放行防火墙时给出明确提示，避免进度窗长时间停在 0%。
        hintTimer = setTimeout(() => {
          if (settled || accepted) return
          notify(
            '互联传输',
            `正在等待 ${record.name} 连接；首次传输请在防火墙提示中允许 TabDo 访问专用网络`
          )
        }, PAYLOAD_WAIT_HINT)
      })
    })
  }

  /**
   * 收集当前可接收文件的已配对在线设备。
   * @returns 支持文件传输的设备记录。
   */
  private getTransferTargets(): DeviceRecord[] {
    return [...this.devices.values()].filter(
      (record) =>
        Boolean(record.link?.isAlive()) &&
        this.trusted.has(record.id) &&
        remoteAccepts(record.link!.remote, PACKET_SHARE_REQUEST)
    )
  }

  /**
   * 选择文件接收设备：单台直接使用，多台弹出选择窗口。
   * @param title 选择窗口标题。
   * @returns 目标设备与是否由用户取消。
   */
  private async chooseTransferTarget(
    title: string
  ): Promise<{ target: DeviceRecord | null; canceled: boolean }> {
    const candidates = this.getTransferTargets()
    if (!candidates.length) return { target: null, canceled: false }
    if (candidates.length === 1) return { target: candidates[0], canceled: false }
    const preferredId = this.config?.preferredDeviceId || ''
    // 默认设备排在最前并标记，仍允许为本次传输选择其他设备。
    candidates.sort(
      (a, b) =>
        Number(b.id === preferredId) - Number(a.id === preferredId) || a.name.localeCompare(b.name)
    )
    const devices: InterconnectChoiceDevice[] = candidates.map((record) => ({
      id: record.id,
      name: record.name,
      type: record.type,
      preferred: record.id === preferredId
    }))
    const chosenId = await this.deviceChooser.choose(devices, title)
    if (!chosenId) return { target: null, canceled: true }
    return { target: this.devices.get(chosenId) || null, canceled: false }
  }

  /**
   * 在限定时间内等待设备链路可用，首次发送时避免握手未完成就失败。
   * @param record 目标设备。
   * @param timeoutMs 最长等待时间。
   * @returns 链路可用时返回 true。
   */
  private async waitForLink(record: DeviceRecord, timeoutMs: number): Promise<boolean> {
    this.pruneLinks()
    if (record.link?.isAlive()) return true
    if (!this.started) return false
    record.lastConnectAt = 0
    void this.maybeConnect(record)
    const deadline = Date.now() + Math.max(0, timeoutMs)
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
      if (record.link?.isAlive()) return true
    }
    return false
  }

  /**
   * 选择“互联传输”的目标设备。
   * @returns 默认设备、首个在线设备或 null。
   */
  private pickTargetDevice(): DeviceRecord | null {
    const preferred = this.config?.preferredDeviceId
    if (preferred) {
      const record = this.devices.get(preferred)
      if (record?.link?.isAlive() && this.trusted.has(record.id)) return record
    }
    for (const record of this.devices.values()) {
      if (record.link?.isAlive() && this.trusted.has(record.id)) return record
    }
    return null
  }

  /**
   * 创建传输任务并登记最近任务上限。
   * @param direction 传输方向。
   * @param record 对端设备。
   * @param files 文件初始状态。
   * @returns 可更新的任务记录。
   */
  private createTransfer(
    direction: 'send' | 'receive',
    record: DeviceRecord,
    files: { name: string; size: number; path?: string }[]
  ): TransferRecord {
    const now = Date.now()
    const transfer: TransferRecord = {
      id: randomUUID(),
      direction,
      deviceId: record.id,
      deviceName: record.name,
      files: files.map<InterconnectTransferFile>((file) => ({
        name: file.name,
        size: file.size,
        transferred: 0,
        status: 'pending',
        path: file.path
      })),
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      transferred: 0,
      speed: 0,
      status: 'running',
      startedAt: now,
      updatedAt: now,
      lastTickAt: now,
      lastTickBytes: 0
    }
    this.transfers.set(transfer.id, transfer)
    this.trimTransfers()
    return transfer
  }

  /**
   * 只保留最近的传输任务，避免长时间运行后累积。
   * @returns 无返回值。
   */
  private trimTransfers(): void {
    const completed = [...this.transfers.values()]
      .filter((transfer) => transfer.status !== 'running')
      .sort((a, b) => a.updatedAt - b.updatedAt)
    while (completed.length > 10) {
      const oldest = completed.shift()
      if (oldest) this.transfers.delete(oldest.id)
    }
  }

  /**
   * 标记文件开始传输。
   * @param transfer 任务。
   * @param fileIndex 文件索引。
   * @returns 无返回值。
   */
  private markFileRunning(transfer: TransferRecord, fileIndex: number): void {
    const file = transfer.files[fileIndex]
    if (file) file.status = 'running'
    transfer.updatedAt = Date.now()
    this.publishTransfers()
  }

  /**
   * 更新单文件进度并计算测速。
   * @param transfer 任务。
   * @param fileIndex 文件索引。
   * @param transferred 已传输字节。
   * @returns 无返回值。
   */
  private updateFileProgress(
    transfer: TransferRecord,
    fileIndex: number,
    transferred: number
  ): void {
    const file = transfer.files[fileIndex]
    if (!file) return
    file.transferred = Math.min(transferred, file.size)
    file.status = 'running'
    transfer.transferred = transfer.files.reduce((sum, item) => sum + item.transferred, 0)
    const now = Date.now()
    const elapsed = now - transfer.lastTickAt
    if (elapsed >= 250) {
      transfer.speed = Math.max(
        0,
        Math.round(((transfer.transferred - transfer.lastTickBytes) * 1000) / elapsed)
      )
      transfer.lastTickAt = now
      transfer.lastTickBytes = transfer.transferred
    }
    transfer.updatedAt = now
    this.publishTransfers()
  }

  /**
   * 结束单个文件并同步整体进度。
   * @param transfer 任务。
   * @param fileIndex 文件索引。
   * @param status 最终状态。
   * @returns 无返回值。
   */
  private finishTransferFile(
    transfer: TransferRecord,
    fileIndex: number,
    status: 'done' | 'error'
  ): void {
    const file = transfer.files[fileIndex]
    if (!file) return
    file.status = status
    if (status === 'done') file.transferred = file.size
    transfer.transferred = transfer.files.reduce((sum, item) => sum + item.transferred, 0)
    transfer.updatedAt = Date.now()
    this.publishTransfers()
  }

  /**
   * 推送传输任务与整体状态。
   * @returns 无返回值。
   */
  private publishTransfers(): void {
    this.progressWindow.update({
      transfers: this.getTransferViews().slice(0, 8),
      running: [...this.transfers.values()].some((transfer) => transfer.status === 'running')
    })
    this.scheduleEmitState()
  }

  /**
   * 合并高频进度事件，最多每 120 毫秒通知一次界面。
   * @returns 无返回值。
   */
  private scheduleEmitState(): void {
    if (this.stateTimer) return
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null
      this.emitState()
    }, 120)
  }

  /**
   * 广播最新状态给所有可见窗口。
   * @returns 无返回值。
   */
  private emitState(): void {
    const state = this.getState()
    const targets = webContents.getAllWebContents()
    // 设置页可能位于 WebContentsView，只遍历 BrowserWindow 会漏掉嵌入正文。
    for (const contents of targets) {
      if (!contents.isDestroyed()) contents.send('interconnect-state-updated', state)
    }
  }

  /**
   * 把内部传输记录转换为可跨进程传递的快照。
   * @returns 任务快照列表。
   */
  private getTransferViews(): InterconnectTransferView[] {
    return [...this.transfers.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((transfer) => ({
        id: transfer.id,
        direction: transfer.direction,
        deviceId: transfer.deviceId,
        deviceName: transfer.deviceName,
        files: transfer.files.map((file) => ({ ...file })),
        totalSize: transfer.totalSize,
        transferred: transfer.transferred,
        speed: transfer.speed,
        status: transfer.status,
        error: transfer.error,
        destinationDir: transfer.destinationDir,
        retryable: this.isRetryableTransfer(transfer),
        startedAt: transfer.startedAt,
        updatedAt: transfer.updatedAt
      }))
  }

  /**
   * 判断失败任务能否从面板再次发起。
   * @param transfer 内部任务记录。
   * @returns 仍存在可发送源文件且设备已配对时为 true。
   */
  private isRetryableTransfer(transfer: TransferRecord): boolean {
    if (transfer.direction !== 'send' || transfer.status !== 'error') return false
    if (!this.trusted.has(transfer.deviceId)) return false
    return transfer.files.some((file) => Boolean(file.path) && fs.existsSync(file.path!))
  }

  /**
   * 合并已配对设备与当前发现设备。
   * @returns 设备展示列表。
   */
  private getDeviceViews(): InterconnectDeviceView[] {
    const result: InterconnectDeviceView[] = []
    for (const [id, trusted] of this.trusted) {
      const record = this.devices.get(id)
      result.push({
        id,
        name: record?.name || trusted.name,
        type: record?.type || trusted.type,
        protocolVersion: record?.protocolVersion || trusted.protocolVersion,
        paired: true,
        reachable: Boolean(record?.link?.isAlive()),
        address: record?.address,
        pendingPair: Boolean(record?.pendingPair)
      })
    }
    for (const record of this.devices.values()) {
      if (this.trusted.has(record.id)) continue
      result.push({
        id: record.id,
        name: record.name,
        type: record.type,
        protocolVersion: record.protocolVersion,
        paired: false,
        reachable: Boolean(record.link?.isAlive()),
        address: record.address,
        pendingPair: record.pendingPair
      })
    }
    return result.sort(
      (a, b) => Number(b.reachable) - Number(a.reachable) || a.name.localeCompare(b.name)
    )
  }

  /**
   * 清理已断开但仍被引用的链路。
   * @returns 无返回值。
   */
  private pruneLinks(): void {
    for (const record of this.devices.values()) {
      if (record.link && !record.link.isAlive()) record.link = undefined
    }
  }

  /**
   * 显示互联传输相关的系统通知，用户关闭通知开关时静默跳过。
   * @param title 标题。
   * @param body 正文。
   * @returns 无返回值。
   */
  public notify(title: string, body: string): void {
    if (this.config && this.config.notifications === false) return
    if (Notification.isSupported()) new Notification({ title, body }).show()
  }

  /**
   * 清除已完成和失败的传输记录，保留进行中的任务与已落盘文件。
   * @returns 实际移除的记录数量。
   */
  public clearTransferHistory(): number {
    let removed = 0
    for (const [id, transfer] of this.transfers) {
      if (transfer.status === 'running') continue
      this.transfers.delete(id)
      removed += 1
    }
    if (removed) this.publishTransfers()
    return removed
  }

  /**
   * 判断 IPC 调用是否来自传输面板，避免其他页面清理记录。
   * @param senderId 发送者 WebContents 标识。
   * @returns 来自当前传输面板时返回 true。
   */
  public isProgressWindow(senderId: number): boolean {
    return this.progressWindow.owns(senderId)
  }
}

export default new InterconnectService()
