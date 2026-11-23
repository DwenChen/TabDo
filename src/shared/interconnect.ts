/**
 * 互联服务（KDE Connect 兼容）的跨进程契约。
 *
 * 主进程负责局域网发现、配对、剪贴板同步和文件传输；设置页只读取快照并
 * 提交用户选择，不在渲染进程持有证书、套接字或文件句柄。
 */

/** 互联服务配置在宿主数据库中的键。 */
export const INTERCONNECT_DB_KEY = 'settings-interconnect'

/** 已信任设备列表在宿主数据库中的键。 */
export const INTERCONNECT_TRUSTED_DEVICES_KEY = 'interconnect-trusted-devices'

/** KDE Connect 当前兼容的协议版本。 */
export const INTERCONNECT_PROTOCOL_VERSION = 8

/** 局域网发现使用的 UDP 端口。 */
export const INTERCONNECT_UDP_PORT = 1716

/** 链路 TCP 端口范围起点。 */
export const INTERCONNECT_TCP_PORT_MIN = 1716

/** 链路 TCP 端口范围终点。 */
export const INTERCONNECT_TCP_PORT_MAX = 1764

/** 本机对外声明的进站能力，只包含剪贴板与文件传输。 */
export const INTERCONNECT_INCOMING_CAPABILITIES = [
  'kdeconnect.clipboard',
  'kdeconnect.clipboard.connect',
  'kdeconnect.clipboard.file',
  'kdeconnect.share.request',
  'kdeconnect.share.request.update'
] as const

/** 本机对外声明的出站能力，与进站保持同一功能子集。 */
export const INTERCONNECT_OUTGOING_CAPABILITIES: readonly string[] =
  INTERCONNECT_INCOMING_CAPABILITIES

/** 互联服务用户配置。 */
export interface InterconnectConfig {
  /** 是否启动局域网监听与发现。 */
  enabled: boolean
  /** 向其他设备展示的本机名称。 */
  deviceName: string
  /** 接收文件与剪贴板图片的默认文件夹绝对路径。 */
  downloadDir: string
  /** 是否自动把本机复制内容同步到已配对设备。 */
  syncClipboard: boolean
  /** 是否自动接受来自手机的配对请求。 */
  autoAcceptPairing: boolean
  /** 是否显示接收完成、失败和配对等系统通知。 */
  notifications: boolean
  /** 文件传输与主动同步优先使用的设备 ID。 */
  preferredDeviceId: string
}

/** 单个已配对设备。 */
export interface InterconnectTrustedDevice {
  /** 设备 ID，同时是自签名证书的 CN。 */
  id: string
  /** 设备展示名称。 */
  name: string
  /** 设备类型。 */
  type: string
  /** 配对时协商的协议版本。 */
  protocolVersion: number
  /** 设备证书 PEM，用于后续连接核对。 */
  certificatePem: string
  /** 证书 SHA-256 指纹，可直接展示。 */
  fingerprint: string
}

/** 设备在设置页中的展示快照。 */
export interface InterconnectDeviceView {
  /** 设备 ID。 */
  id: string
  /** 设备展示名称。 */
  name: string
  /** 设备类型。 */
  type: string
  /** 协议版本。 */
  protocolVersion: number
  /** 是否已完成配对。 */
  paired: boolean
  /** 当前是否有可用链路。 */
  reachable: boolean
  /** 链路对端地址。 */
  address?: string
  /** 是否正在等待本机接受对方配对请求。 */
  pendingPair: boolean
}

/** 单个文件在传输任务中的状态。 */
export interface InterconnectTransferFile {
  /** 文件名。 */
  name: string
  /** 文件总字节数。 */
  size: number
  /** 已传输字节数。 */
  transferred: number
  /** 当前状态。 */
  status: 'pending' | 'running' | 'done' | 'error'
  /** 本机绝对路径：发送任务为源文件，接收任务为落点文件。 */
  path?: string
}

/** 一次发送或接收任务的展示快照。 */
export interface InterconnectTransferView {
  /** 任务标识。 */
  id: string
  /** 传输方向。 */
  direction: 'send' | 'receive'
  /** 对端设备 ID。 */
  deviceId: string
  /** 对端设备名称。 */
  deviceName: string
  /** 包含的文件。 */
  files: InterconnectTransferFile[]
  /** 所有文件总字节数。 */
  totalSize: number
  /** 已传输总字节数。 */
  transferred: number
  /** 最近一次测速，单位字节每秒。 */
  speed: number
  /** 任务状态。 */
  status: 'running' | 'done' | 'error'
  /** 失败原因。 */
  error?: string
  /** 接收任务的落点目录。 */
  destinationDir?: string
  /** 失败的发送任务是否仍有可用的源文件，可再次发起。 */
  retryable?: boolean
  /** 开始时间。 */
  startedAt: number
  /** 最近更新时间。 */
  updatedAt: number
}

/** 互联服务运行状态。 */
export interface InterconnectStatus {
  /** 服务是否已启动。 */
  running: boolean
  /** 实际监听的 TCP 端口，0 表示未监听。 */
  tcpPort: number
  /** 本机设备 ID。 */
  deviceId: string
  /** 本机证书 SHA-256 指纹。 */
  fingerprint: string
  /** 当前展示名称。 */
  deviceName: string
  /** 默认接收文件夹。 */
  downloadDir: string
}

/** 设置页一次读取的完整状态。 */
export interface InterconnectState {
  /** 当前配置。 */
  config: InterconnectConfig
  /** 运行状态。 */
  status: InterconnectStatus
  /** 已发现或已配对的设备。 */
  devices: InterconnectDeviceView[]
  /** 当前与最近的传输任务。 */
  transfers: InterconnectTransferView[]
}

/**
 * 把数据库中的历史值收敛为合法配置。
 * @param value 数据库读取的原始值。
 * @param defaults 缺失字段使用的默认值。
 * @returns 补齐并校验后的配置对象。
 */
export function normalizeInterconnectConfig(
  value: unknown,
  defaults: InterconnectConfig
): InterconnectConfig {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const deviceName = typeof source.deviceName === 'string' ? source.deviceName.trim() : ''
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.enabled,
    deviceName: deviceName || defaults.deviceName,
    downloadDir:
      typeof source.downloadDir === 'string' && source.downloadDir.trim()
        ? source.downloadDir
        : defaults.downloadDir,
    syncClipboard:
      typeof source.syncClipboard === 'boolean'
        ? source.syncClipboard
        : typeof source.autoSyncClipboard === 'boolean'
          ? source.autoSyncClipboard
          : defaults.syncClipboard,
    autoAcceptPairing:
      typeof source.autoAcceptPairing === 'boolean'
        ? source.autoAcceptPairing
        : defaults.autoAcceptPairing,
    notifications:
      typeof source.notifications === 'boolean' ? source.notifications : defaults.notifications,
    preferredDeviceId:
      typeof source.preferredDeviceId === 'string'
        ? source.preferredDeviceId
        : defaults.preferredDeviceId
  }
}
