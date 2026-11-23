import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { X509Certificate } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  certificatePemToDer,
  createDeviceId,
  ensureInterconnectIdentity,
  formatCertificateFingerprint,
  generateDeviceCertificate,
  readCertificateIdentity
} from '../../src/main/core/interconnect/certificate'

const temporaryDirectories: string[] = []

/**
 * 创建测试专用临时目录。
 * @returns 临时目录绝对路径。
 */
function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-interconnect-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop()
    if (directory) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 })
  }
})

describe('互联服务证书', () => {
  it('生成的自签名证书使用设备 ID 作为 CN', () => {
    const deviceId = createDeviceId()
    const generated = generateDeviceCertificate(deviceId)
    const certificate = new X509Certificate(generated.certificateDer)

    expect(deviceId).toMatch(/^[a-f0-9]{32}$/)
    expect(certificate.subject).toContain(`CN=${deviceId}`)
    expect(certificate.subject).toContain('O=KDE')
    expect(certificate.subject).toContain('OU=TabDo')
    expect(generated.privateKeyPem).toContain('PRIVATE KEY')
    expect(generated.certificatePem).toContain('BEGIN CERTIFICATE')
    expect(certificatePemToDer(generated.certificatePem).equals(generated.certificateDer)).toBe(
      true
    )
  })

  it('指纹按大写冒号分段，且可重复读取', () => {
    const generated = generateDeviceCertificate(createDeviceId())
    const fingerprint = formatCertificateFingerprint(generated.certificateDer)
    const identity = readCertificateIdentity(generated.certificatePem)

    expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    expect(identity?.fingerprint.replace(/:/g, '')).toBe(fingerprint.replace(/:/g, ''))
    expect(identity?.commonName).toHaveLength(32)
  })

  it('首次生成后复用同一身份，证书损坏时重新生成', () => {
    const root = createTemporaryDirectory()
    const first = ensureInterconnectIdentity(root)
    const second = ensureInterconnectIdentity(root)
    expect(second.deviceId).toBe(first.deviceId)
    expect(second.privateKeyPem).toBe(first.privateKeyPem)

    fs.writeFileSync(path.join(root, 'interconnect', 'certificate.pem'), 'invalid')
    const third = ensureInterconnectIdentity(root)
    expect(third.deviceId).not.toBe(first.deviceId)
    expect(fs.existsSync(path.join(root, 'interconnect', 'certificate.pem'))).toBe(true)
  })
})
