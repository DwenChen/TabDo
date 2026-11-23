import {
  INTERCONNECT_INCOMING_CAPABILITIES,
  INTERCONNECT_OUTGOING_CAPABILITIES,
  INTERCONNECT_PROTOCOL_VERSION
} from '@shared/interconnect'

/** 身份与配对协议包类型。 */
export const PACKET_IDENTITY = 'kdeconnect.identity'
export const PACKET_PAIR = 'kdeconnect.pair'

/** 剪贴板协议包类型。 */
export const PACKET_CLIPBOARD = 'kdeconnect.clipboard'
export const PACKET_CLIPBOARD_CONNECT = 'kdeconnect.clipboard.connect'
export const PACKET_CLIPBOARD_FILE = 'kdeconnect.clipboard.file'

/** 文件传输协议包类型。 */
export const PACKET_SHARE_REQUEST = 'kdeconnect.share.request'
export const PACKET_SHARE_UPDATE = 'kdeconnect.share.request.update'

/** 单行 JSON 协议包。 */
export interface NetworkPacket {
  /** 发送方毫秒时间戳。 */
  id?: number | string
  /** 协议包类型。 */
  type: string
  /** 业务字段。 */
  body: Record<string, unknown>
  /** 附带载荷总字节数；-1 表示长度未知。 */
  payloadSize?: number
  /** 载荷连接信息，接收方据此建立独立 TLS 连接。 */
  payloadTransferInfo?: Record<string, unknown>
}

/** 握手后得到的远端身份。 */
export interface RemoteIdentity {
  /** 设备 ID。 */
  deviceId: string
  /** 设备展示名称。 */
  deviceName: string
  /** 设备类型。 */
  deviceType: string
  /** 协议版本。 */
  protocolVersion: number
  /** 对方可以接收的协议包类型。 */
  incomingCapabilities: string[]
  /** 对方可以发送的协议包类型。 */
  outgoingCapabilities: string[]
}

/**
 * 序列化协议包为带换行结尾的 JSON。
 * @param type 协议包类型。
 * @param body 业务字段。
 * @param extra 载荷大小与载荷连接信息。
 * @returns 可直接写入 TLS 链路的缓冲区。
 */
export function serializePacket(
  type: string,
  body: Record<string, unknown> = {},
  extra: { payloadSize?: number; payloadTransferInfo?: Record<string, unknown> } = {}
): Buffer {
  const packet: Record<string, unknown> = { id: Date.now(), type, body }
  if (typeof extra.payloadSize === 'number') packet.payloadSize = extra.payloadSize
  if (extra.payloadTransferInfo) packet.payloadTransferInfo = extra.payloadTransferInfo
  return Buffer.from(`${JSON.stringify(packet)}\n`, 'utf8')
}

/**
 * 解析单行 JSON 协议包。
 * @param line 不含换行或包含换行的文本。
 * @returns 合法协议包；字段缺失或 JSON 损坏时返回 null。
 */
export function parsePacket(line: string | Buffer): NetworkPacket | null {
  const text = Buffer.isBuffer(line) ? line.toString('utf8') : line
  if (!text.trim()) return null
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (!parsed || typeof parsed.type !== 'string' || !parsed.type) return null
    const body =
      parsed.body && typeof parsed.body === 'object' ? (parsed.body as Record<string, unknown>) : {}
    return {
      id: typeof parsed.id === 'number' || typeof parsed.id === 'string' ? parsed.id : undefined,
      type: parsed.type,
      body,
      payloadSize: typeof parsed.payloadSize === 'number' ? parsed.payloadSize : undefined,
      payloadTransferInfo:
        parsed.payloadTransferInfo && typeof parsed.payloadTransferInfo === 'object'
          ? (parsed.payloadTransferInfo as Record<string, unknown>)
          : undefined
    }
  } catch {
    return null
  }
}

/**
 * 校验设备 ID 是否符合 KDE Connect 的证书 CN 约束。
 * @param value 待校验值。
 * @returns 符合 32–38 位字母、数字、下划线或连字符时返回 true。
 */
export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{32,38}$/.test(value)
}

/**
 * 清理设备名称中的分隔符并限制长度。
 * @param value 原始名称。
 * @returns 最多 32 个字符的展示名称。
 */
export function sanitizeDeviceName(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  return text
    .replace(/["',;:.!?()[\]<>]/g, '')
    .trim()
    .slice(0, 32)
}

/**
 * 构造 UDP 发现协议包，只包含发现所需的字段。
 * @param identity 本机身份字段。
 * @param tcpPort 当前监听的 TCP 端口。
 * @returns 发现协议包缓冲区。
 */
export function buildDiscoveryPacket(
  identity: { deviceId: string; deviceName: string },
  tcpPort: number
): Buffer {
  return serializePacket(PACKET_IDENTITY, {
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    protocolVersion: INTERCONNECT_PROTOCOL_VERSION,
    tcpPort
  })
}

/**
 * 构造 TCP 连接介绍包，用于在 TLS 握手前声明目标设备。
 * @param identity 本机身份字段。
 * @param targetDeviceId 目标设备 ID。
 * @param targetProtocolVersion 目标协议版本。
 * @returns 连接介绍包缓冲区。
 */
export function buildConnectionPacket(
  identity: { deviceId: string; deviceName: string },
  targetDeviceId: string,
  targetProtocolVersion: number
): Buffer {
  return serializePacket(PACKET_IDENTITY, {
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    protocolVersion: INTERCONNECT_PROTOCOL_VERSION,
    targetDeviceId,
    targetProtocolVersion
  })
}

/**
 * 构造 TLS 握手后的完整身份包。
 * @param identity 本机身份字段。
 * @returns 完整身份包缓冲区。
 */
export function buildIdentityPacket(identity: { deviceId: string; deviceName: string }): Buffer {
  return serializePacket(PACKET_IDENTITY, {
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    deviceType: 'desktop',
    protocolVersion: INTERCONNECT_PROTOCOL_VERSION,
    incomingCapabilities: [...INTERCONNECT_INCOMING_CAPABILITIES],
    outgoingCapabilities: [...INTERCONNECT_OUTGOING_CAPABILITIES]
  })
}

/**
 * 从完整身份包中提取远端能力。
 * @param packet 已解析的身份包。
 * @returns 远端身份；类型或设备 ID 非法时返回 null。
 */
export function readRemoteIdentity(packet: NetworkPacket | null): RemoteIdentity | null {
  if (!packet || packet.type !== PACKET_IDENTITY) return null
  const deviceId = packet.body.deviceId
  if (!isValidDeviceId(deviceId)) return null
  const deviceName = sanitizeDeviceName(packet.body.deviceName)
  if (!deviceName) return null
  const readCapabilities = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return {
    deviceId,
    deviceName,
    deviceType: typeof packet.body.deviceType === 'string' ? packet.body.deviceType : 'unknown',
    protocolVersion:
      typeof packet.body.protocolVersion === 'number'
        ? packet.body.protocolVersion
        : INTERCONNECT_PROTOCOL_VERSION,
    incomingCapabilities: readCapabilities(packet.body.incomingCapabilities),
    outgoingCapabilities: readCapabilities(packet.body.outgoingCapabilities)
  }
}

/**
 * 判断远端是否声明可接收指定协议包。
 * @param remote 远端身份。
 * @param type 协议包类型。
 * @returns 支持时返回 true。
 */
export function remoteAccepts(remote: RemoteIdentity, type: string): boolean {
  return remote.incomingCapabilities.includes(type)
}
