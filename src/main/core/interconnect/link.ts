import { EventEmitter } from 'node:events'
import net from 'node:net'
import tls from 'node:tls'
import {
  buildConnectionPacket,
  buildIdentityPacket,
  parsePacket,
  readRemoteIdentity,
  type NetworkPacket,
  type RemoteIdentity
} from './protocol'

/** 单行协议包上限，与 KDE Connect 的链路限制一致。 */
const MAX_PACKET_SIZE = 32 * 1024 * 1024

/** 握手阶段身份包上限。 */
const MAX_IDENTITY_SIZE = 8192

/** 握手超时时间。 */
const HANDSHAKE_TIMEOUT = 8000

/** 链路建立上下文。 */
export interface LinkContext {
  /** 本机设备 ID。 */
  deviceId: string
  /** 本机展示名称。 */
  deviceName: string
  /** 本机 TLS 上下文。 */
  secureContext: tls.SecureContext
  /** 已配对设备的证书指纹；为空表示尚未配对。 */
  trustedFingerprint?: string | null
}

/** 握手结果。 */
export interface HandshakeResult {
  /** 已就绪的链路。 */
  link: InterconnectLink
  /** 远端身份。 */
  remote: RemoteIdentity
  /** 远端证书 PEM。 */
  certificatePem: string
  /** 远端证书指纹。 */
  fingerprint: string
  /** 本次连接的发起方：本机主动连接为 local，对端连入为 remote。 */
  initiator: 'local' | 'remote'
}

/**
 * 把 DER 证书转换为 PEM。
 * @param der DER 证书内容。
 * @returns PEM 文本。
 */
function derToPem(der: Buffer): string {
  const base64 =
    der
      .toString('base64')
      .match(/.{1,64}/g)
      ?.join('\n') || ''
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`
}

/**
 * 从套接字读取一行，并返回剩余数据。
 * @param socket 已建立的 TCP 或 TLS 套接字。
 * @param maxSize 单行最大字节数。
 * @returns 第一行内容与同批到达的剩余内容。
 * @throws 连接关闭或超过上限时抛错。
 */
function readLine(socket: net.Socket, maxSize: number): Promise<{ line: Buffer; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      const index = buffer.indexOf(0x0a)
      if (index >= 0) {
        cleanup()
        resolve({ line: buffer.subarray(0, index + 1), rest: buffer.subarray(index + 1) })
        return
      }
      if (buffer.length > maxSize) {
        cleanup()
        reject(new Error('协议包超过长度上限'))
      }
    }
    const onClose = (): void => {
      cleanup()
      reject(new Error('连接在握手阶段关闭'))
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const cleanup = (): void => {
      socket.off('data', onData)
      socket.off('close', onClose)
      socket.off('error', onError)
    }
    socket.on('data', onData)
    socket.on('close', onClose)
    socket.on('error', onError)
  })
}

/**
 * 在超时时间内等待一次事件。
 * @param emitter 事件源。
 * @param event 成功事件名。
 * @param errorEvent 失败事件名。
 * @returns 成功后结束的 Promise。
 * @throws 超时或失败事件触发时抛错。
 */
function waitForEvent(
  emitter: EventEmitter,
  event: string,
  errorEvent = 'error',
  timeout = HANDSHAKE_TIMEOUT
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('握手超时'))
    }, timeout)
    const cleanup = (): void => {
      clearTimeout(timer)
      emitter.off(event, onSuccess)
      emitter.off(errorEvent, onError)
    }
    const onSuccess = (): void => {
      cleanup()
      resolve()
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    emitter.once(event, onSuccess)
    emitter.once(errorEvent, onError)
  })
}

/**
 * 核对对端证书 CN 与信任指纹。
 * @param socket 已完成 TLS 握手的套接字。
 * @param expectedDeviceId 连接包声明的设备 ID。
 * @param trustedFingerprint 已配对设备的证书指纹。
 * @returns 证书 PEM 与指纹。
 * @throws CN 不匹配、证书缺失或信任指纹不一致时抛错。
 */
function verifyPeerCertificate(
  socket: tls.TLSSocket,
  expectedDeviceId: string,
  trustedFingerprint?: string | null
): { certificatePem: string; fingerprint: string } {
  const peer = socket.getPeerCertificate()
  if (!peer || !peer.raw) throw new Error('对端没有提供客户端证书')
  const commonName = peer.subject?.CN
  if (commonName !== expectedDeviceId) throw new Error('证书 CN 与设备 ID 不一致')
  const fingerprint = String(peer.fingerprint256 || '')
  if (
    trustedFingerprint &&
    fingerprint.replace(/:/g, '').toUpperCase() !==
      trustedFingerprint.replace(/:/g, '').toUpperCase()
  ) {
    throw new Error('对端证书与配对记录不一致')
  }
  return { certificatePem: derToPem(peer.raw), fingerprint }
}

/**
 * 在 TLS 链路上交换完整身份包。
 * @param socket 已完成 TLS 握手的套接字。
 * @param context 本机身份。
 * @param expectedDeviceId 期望的设备 ID。
 * @returns 远端身份与剩余待解析数据。
 * @throws 身份包非法、设备 ID 不匹配或超时时抛错。
 */
async function exchangeIdentity(
  socket: tls.TLSSocket,
  context: LinkContext,
  expectedDeviceId: string
): Promise<{ remote: RemoteIdentity; rest: Buffer }> {
  socket.write(buildIdentityPacket(context))
  const { line, rest } = await readLine(socket, MAX_IDENTITY_SIZE)
  // 身份包后可能紧跟业务包；先暂停流动，交给链路对象接管后再恢复。
  socket.pause()
  const remote = readRemoteIdentity(parsePacket(line))
  if (!remote) throw new Error('对端身份包非法')
  if (remote.deviceId !== expectedDeviceId) throw new Error('对端身份与连接目标不一致')
  return { remote, rest }
}

/**
 * 主动连接另一台设备，并按 KDE Connect 约定由连接发起方担任 TLS 服务端。
 * @param host 对端地址。
 * @param port 对端 TCP 端口。
 * @param target 对端设备 ID 与协议版本。
 * @param context 本机身份与 TLS 上下文。
 * @returns 已就绪链路与远端身份。
 * @throws TCP、TLS、身份交换或证书校验失败时抛错。
 */
export async function connectOutgoing(
  host: string,
  port: number,
  target: { deviceId: string; protocolVersion: number },
  context: LinkContext
): Promise<HandshakeResult> {
  const raw = net.connect({ host, port })
  raw.setNoDelay(true)
  raw.setKeepAlive(true, 30000)
  await waitForEvent(raw, 'connect')

  raw.write(buildConnectionPacket(context, target.deviceId, target.protocolVersion))
  raw.pause()
  const tlsSocket = new tls.TLSSocket(raw, {
    isServer: true,
    secureContext: context.secureContext,
    requestCert: true,
    rejectUnauthorized: false
  })
  raw.resume()
  await waitForEvent(tlsSocket, 'secure')

  try {
    const { certificatePem, fingerprint } = verifyPeerCertificate(
      tlsSocket,
      target.deviceId,
      context.trustedFingerprint
    )
    const { remote, rest } = await exchangeIdentity(tlsSocket, context, target.deviceId)
    if (rest.length) tlsSocket.unshift(rest)
    return {
      link: new InterconnectLink(tlsSocket, remote, certificatePem, fingerprint),
      remote,
      certificatePem,
      fingerprint,
      initiator: 'local'
    }
  } catch (error) {
    // 握手失败必须关闭套接字，否则对端会一直等待身份包。
    tlsSocket.destroy()
    throw error
  }
}

/**
 * 接受另一台设备的 TCP 连接，读取连接包后按约定担任 TLS 客户端。
 * @param raw 已接受的 TCP 套接字。
 * @param context 本机身份与 TLS 上下文。
 * @returns 已就绪链路与远端身份。
 * @throws 连接包非法、目标不是本机、TLS 或证书校验失败时抛错。
 */
export async function acceptIncoming(
  raw: net.Socket,
  context: LinkContext
): Promise<HandshakeResult> {
  raw.setNoDelay(true)
  raw.setKeepAlive(true, 30000)
  const { line, rest } = await readLine(raw, MAX_IDENTITY_SIZE)
  const connectionPacket = parsePacket(line)
  if (!connectionPacket || connectionPacket.type !== 'kdeconnect.identity') {
    raw.destroy()
    throw new Error('连接介绍包非法')
  }
  const targetDeviceId = connectionPacket.body.targetDeviceId
  if (targetDeviceId !== context.deviceId) {
    raw.destroy()
    throw new Error('连接目标不是本机')
  }
  const remoteDeviceId = connectionPacket.body.deviceId
  const remoteName = connectionPacket.body.deviceName
  if (typeof remoteDeviceId !== 'string' || typeof remoteName !== 'string') {
    raw.destroy()
    throw new Error('连接介绍包缺少设备信息')
  }

  raw.pause()
  if (rest.length) raw.unshift(rest)
  const tlsSocket = tls.connect({
    socket: raw,
    secureContext: context.secureContext,
    requestCert: true,
    rejectUnauthorized: false
  })
  raw.resume()
  await waitForEvent(tlsSocket, 'secure')

  try {
    const { certificatePem, fingerprint } = verifyPeerCertificate(
      tlsSocket,
      remoteDeviceId,
      context.trustedFingerprint
    )
    const { remote, rest: identityRest } = await exchangeIdentity(
      tlsSocket,
      context,
      remoteDeviceId
    )
    if (identityRest.length) tlsSocket.unshift(identityRest)
    return {
      link: new InterconnectLink(tlsSocket, remote, certificatePem, fingerprint),
      remote,
      certificatePem,
      fingerprint,
      initiator: 'remote'
    }
  } catch (error) {
    tlsSocket.destroy()
    throw error
  }
}

/**
 * 已建立的双向链路，负责按换行切分 JSON 协议包。
 *
 * 事件：`packet` 携带解析后的协议包，`closed` 表示链路结束。
 */
export class InterconnectLink extends EventEmitter {
  private readonly socket: tls.TLSSocket
  private buffer = Buffer.alloc(0)
  private closed = false
  readonly remote: RemoteIdentity
  readonly certificatePem: string
  readonly fingerprint: string

  /**
   * 创建链路实例。
   * @param socket 已完成握手的 TLS 套接字。
   * @param remote 远端身份。
   * @param certificatePem 远端证书 PEM。
   * @param fingerprint 远端证书指纹。
   */
  constructor(
    socket: tls.TLSSocket,
    remote: RemoteIdentity,
    certificatePem: string,
    fingerprint: string
  ) {
    super()
    this.socket = socket
    this.remote = remote
    this.certificatePem = certificatePem
    this.fingerprint = fingerprint
    socket.on('data', (chunk: Buffer) => this.handleData(chunk))
    socket.on('close', () => this.markClosed())
    socket.on('error', (error: Error) => {
      console.warn('[Interconnect] 链路错误:', error.message)
      this.markClosed()
    })
    // 握手阶段暂停的套接字在监听器就绪后恢复，避免首个业务包丢失。
    socket.resume()
  }

  /**
   * 返回对端 IPv4 地址。
   * @returns 去除 IPv4 映射前缀后的地址；不可用时为空字符串。
   */
  public getPeerAddress(): string {
    const address = this.socket.remoteAddress || ''
    return address.startsWith('::ffff:') ? address.slice(7) : address
  }

  /**
   * 判断链路是否仍可写。
   * @returns 套接字未销毁时为 true。
   */
  public isAlive(): boolean {
    return !this.closed && !this.socket.destroyed
  }

  /**
   * 发送协议包。
   * @param type 协议包类型。
   * @param body 业务字段。
   * @param extra 载荷大小与载荷连接信息。
   * @returns 链路可写时为 true；背压也会返回 true，写失败通过 error/closed 事件反映。
   */
  public send(
    type: string,
    body: Record<string, unknown> = {},
    extra: { payloadSize?: number; payloadTransferInfo?: Record<string, unknown> } = {}
  ): boolean {
    if (!this.isAlive()) return false
    const payload: NetworkPacket = { type, body, ...extra }
    const line = `${JSON.stringify({ id: Date.now(), ...payload })}\n`
    // write 返回 false 只表示内核缓冲区已满，不能据此判定协议包发送失败。
    this.socket.write(line)
    return true
  }

  /**
   * 主动关闭链路。
   * @returns 无返回值。
   */
  public close(): void {
    if (this.closed) return
    this.closed = true
    this.buffer = Buffer.alloc(0)
    try {
      this.socket.destroy()
    } catch {
      // 已销毁的套接字不再重复处理。
    }
    this.emit('closed')
  }

  /**
   * 处理链路数据并按换行切分协议包。
   * @param chunk 新到达的数据。
   * @returns 无返回值。
   */
  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    if (this.buffer.length > MAX_PACKET_SIZE && this.buffer.indexOf(0x0a) < 0) {
      this.buffer = Buffer.alloc(0)
      return
    }
    let index = this.buffer.indexOf(0x0a)
    while (index >= 0) {
      const line = this.buffer.subarray(0, index + 1)
      this.buffer = this.buffer.subarray(index + 1)
      const packet = parsePacket(line)
      if (packet) this.emit('packet', packet)
      index = this.buffer.indexOf(0x0a)
    }
  }

  /**
   * 标记链路结束并通知订阅者。
   * @returns 无返回值。
   */
  private markClosed(): void {
    if (this.closed) return
    this.closed = true
    this.buffer = Buffer.alloc(0)
    this.emit('closed')
  }
}
