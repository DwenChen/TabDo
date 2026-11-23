import { describe, expect, it } from 'vitest'
import {
  PACKET_CLIPBOARD,
  PACKET_IDENTITY,
  buildIdentityPacket,
  isValidDeviceId,
  parsePacket,
  readRemoteIdentity,
  remoteAccepts,
  sanitizeDeviceName,
  serializePacket
} from '../../src/main/core/interconnect/protocol'
import {
  computeBroadcastAddress,
  isClipboardImage,
  sanitizeFilename
} from '../../src/main/core/interconnect/utils'
import { normalizeInterconnectConfig } from '../../src/shared/interconnect'

const deviceId = '0123456789abcdef0123456789abcdef'

describe('互联协议包', () => {
  it('序列化后包含递增字段与载荷信息', () => {
    const buffer = serializePacket(
      PACKET_CLIPBOARD,
      { content: 'hello' },
      { payloadSize: 12, payloadTransferInfo: { port: 2000 } }
    )
    const packet = parsePacket(buffer)
    expect(packet?.type).toBe(PACKET_CLIPBOARD)
    expect(packet?.body.content).toBe('hello')
    expect(packet?.payloadSize).toBe(12)
    expect(packet?.payloadTransferInfo?.port).toBe(2000)
    expect(packet?.id).toBeTypeOf('number')
  })

  it('拒绝缺少类型或损坏的 JSON', () => {
    expect(parsePacket('{"body":{}}')).toBeNull()
    expect(parsePacket('not-json')).toBeNull()
    expect(parsePacket('\n')).toBeNull()
  })

  it('身份包声明剪贴板与文件传输能力', () => {
    const packet = parsePacket(buildIdentityPacket({ deviceId, deviceName: '测试电脑' }))
    const remote = readRemoteIdentity(packet)
    expect(remote?.deviceId).toBe(deviceId)
    expect(remote?.deviceType).toBe('desktop')
    expect(remote?.incomingCapabilities).toContain('kdeconnect.clipboard')
    expect(remote?.incomingCapabilities).toContain('kdeconnect.share.request')
    expect(remote && remoteAccepts(remote, 'kdeconnect.share.request')).toBe(true)
    expect(remote && remoteAccepts(remote, 'kdeconnect.sftp')).toBe(false)
  })

  it('校验设备 ID 与展示名称', () => {
    expect(isValidDeviceId(deviceId)).toBe(true)
    expect(isValidDeviceId('too-short')).toBe(false)
    expect(isValidDeviceId('z'.repeat(39))).toBe(false)
    expect(sanitizeDeviceName(`  my "phone"; 测试. `)).toBe('my phone 测试')
    expect(sanitizeDeviceName('x'.repeat(50))).toHaveLength(32)
  })

  it('非法身份包返回 null', () => {
    expect(readRemoteIdentity({ type: PACKET_IDENTITY, body: { deviceId: 'bad' } })).toBeNull()
    expect(
      readRemoteIdentity({
        type: PACKET_IDENTITY,
        body: { deviceId, deviceName: '""' }
      })
    ).toBeNull()
  })
})

describe('互联工具函数', () => {
  it('计算 IPv4 广播地址', () => {
    expect(computeBroadcastAddress('192.168.1.23', '255.255.255.0')).toBe('192.168.1.255')
    expect(computeBroadcastAddress('10.1.5.9', '255.255.0.0')).toBe('10.1.255.255')
    expect(computeBroadcastAddress('bad', '255.255.255.0')).toBeNull()
  })

  it('阻止路径穿越并清洗非法字符', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('C:\\temp\\a<b>.txt')).toBe('a_b_.txt')
    expect(sanitizeFilename('..')).toMatch(/^received-\d+$/)
    expect(sanitizeFilename('   ')).toMatch(/^received-\d+$/)
  })

  it('按扩展名识别剪贴板图片', () => {
    expect(isClipboardImage('a.PNG')).toBe(true)
    expect(isClipboardImage('a.webp')).toBe(true)
    expect(isClipboardImage('a.txt')).toBe(false)
  })
})

describe('互联配置归一化', () => {
  const defaults = {
    enabled: true,
    deviceName: 'TabDo',
    downloadDir: 'C:\\Downloads\\TabDo',
    syncClipboard: true,
    autoAcceptPairing: false,
    notifications: true,
    preferredDeviceId: ''
  }

  it('缺失字段使用默认值', () => {
    expect(normalizeInterconnectConfig(null, defaults)).toEqual(defaults)
  })

  it('兼容历史自动同步字段且保留显式关闭', () => {
    const normalized = normalizeInterconnectConfig(
      { enabled: false, autoSyncClipboard: false, deviceName: ' 书桌 ', downloadDir: '' },
      defaults
    )
    expect(normalized.enabled).toBe(false)
    expect(normalized.syncClipboard).toBe(false)
    expect(normalized.deviceName).toBe('书桌')
    expect(normalized.downloadDir).toBe(defaults.downloadDir)
  })

  it('保留显式关闭的系统通知并补齐缺失字段', () => {
    expect(normalizeInterconnectConfig({ notifications: false }, defaults).notifications).toBe(
      false
    )
    expect(normalizeInterconnectConfig({}, defaults).notifications).toBe(true)
  })
})
