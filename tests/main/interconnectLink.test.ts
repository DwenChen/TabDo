import { createHash } from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'
import { afterEach, describe, expect, it } from 'vitest'
import { generateDeviceCertificate } from '../../src/main/core/interconnect/certificate'
import {
  acceptIncoming,
  connectOutgoing,
  type HandshakeResult,
  type LinkContext
} from '../../src/main/core/interconnect/link'
import { PACKET_CLIPBOARD } from '../../src/main/core/interconnect/protocol'

interface TestPeer {
  deviceId: string
  context: LinkContext
  fingerprint: string
}

/**
 * 创建一对测试设备身份。
 * @param name 展示名称。
 * @returns 设备 ID、TLS 上下文与证书指纹。
 */
function createPeer(name: string): TestPeer {
  const deviceId = name === 'A' ? 'a'.repeat(32) : 'b'.repeat(32)
  const generated = generateDeviceCertificate(deviceId)
  const context: LinkContext = {
    deviceId,
    deviceName: name,
    secureContext: tls.createSecureContext({
      key: generated.privateKeyPem,
      cert: generated.certificatePem
    })
  }
  return {
    deviceId,
    context,
    fingerprint: (
      createHash('sha256')
        .update(generated.certificateDer)
        .digest('hex')
        .toUpperCase()
        .match(/.{2}/g) || []
    ).join(':')
  }
}

const openServers: net.Server[] = []

afterEach(() => {
  while (openServers.length) openServers.pop()?.close()
})

describe('互联链路握手', () => {
  it('反向 TLS 握手后双方交换身份并传输协议包', async () => {
    const peerA = createPeer('A')
    const peerB = createPeer('B')
    peerA.context.trustedFingerprint = peerB.fingerprint
    peerB.context.trustedFingerprint = peerA.fingerprint

    const server = net.createServer()
    openServers.push(server)
    const incomingPromise = new Promise<HandshakeResult>((resolve, reject) => {
      server.once('connection', (socket) => {
        acceptIncoming(socket, peerB.context).then(resolve, reject)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as net.AddressInfo

    let outgoing: HandshakeResult | null = null
    let incoming: HandshakeResult | null = null
    try {
      outgoing = await connectOutgoing(
        '127.0.0.1',
        address.port,
        { deviceId: peerB.deviceId, protocolVersion: 8 },
        peerA.context
      )
      incoming = await incomingPromise

      expect(outgoing.remote.deviceId).toBe(peerB.deviceId)
      expect(outgoing.remote.deviceName).toBe('B')
      expect(outgoing.remote.incomingCapabilities).toContain('kdeconnect.clipboard')
      expect(incoming.remote.deviceId).toBe(peerA.deviceId)
      expect(incoming.remote.deviceName).toBe('A')
      expect(outgoing.link.getPeerAddress()).toBe('127.0.0.1')

      const packetPromise = new Promise<{ type: string; body: Record<string, unknown> }>(
        (resolve) => incoming!.link.once('packet', resolve)
      )
      expect(outgoing.link.send(PACKET_CLIPBOARD, { content: 'hello' })).toBe(true)
      const packet = await packetPromise
      expect(packet.type).toBe(PACKET_CLIPBOARD)
      expect(packet.body.content).toBe('hello')
    } finally {
      outgoing?.link.close()
      incoming?.link.close()
    }
  }, 15000)

  it('信任指纹不一致时拒绝连接', async () => {
    const peerA = createPeer('A')
    const peerB = createPeer('B')
    peerA.context.trustedFingerprint = 'FF:'.repeat(31) + 'FF'

    const server = net.createServer()
    openServers.push(server)
    const incomingPromise = new Promise<HandshakeResult>((resolve, reject) => {
      server.once('connection', (socket) => {
        acceptIncoming(socket, peerB.context).then(resolve, reject)
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as net.AddressInfo

    await expect(
      connectOutgoing(
        '127.0.0.1',
        address.port,
        { deviceId: peerB.deviceId, protocolVersion: 8 },
        peerA.context
      )
    ).rejects.toThrow('对端证书与配对记录不一致')
    await expect(incomingPromise).rejects.toBeInstanceOf(Error)
  }, 15000)
})
