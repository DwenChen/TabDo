import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  X509Certificate
} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** 本机互联身份。 */
export interface InterconnectIdentity {
  /** 32 位设备 ID，同时是证书 CN。 */
  deviceId: string
  /** PEM 私钥。 */
  privateKeyPem: string
  /** PEM 证书。 */
  certificatePem: string
  /** DER 证书。 */
  certificateDer: Buffer
  /** SHA-256 指纹，冒号分隔大写。 */
  fingerprint: string
}

/**
 * 生成 DER 长度前缀。
 * @param length 内容字节数。
 * @returns DER 长度字段。
 */
function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length])
  const bytes: number[] = []
  let value = length
  while (value > 0) {
    bytes.unshift(value & 0xff)
    value >>= 8
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

/**
 * 编码一个 DER TLV 节点。
 * @param tag 标签字节。
 * @param content 节点内容。
 * @returns 完整 DER 节点。
 */
function derTlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content])
}

/**
 * 编码 DER SEQUENCE。
 * @param items 子节点。
 * @returns SEQUENCE 节点。
 */
function derSequence(...items: Buffer[]): Buffer {
  return derTlv(0x30, Buffer.concat(items))
}

/**
 * 编码 DER SET。
 * @param items 子节点。
 * @returns SET 节点。
 */
function derSet(...items: Buffer[]): Buffer {
  return derTlv(0x31, Buffer.concat(items))
}

/**
 * 编码 DER INTEGER。
 * @param content 正整数内容。
 * @returns INTEGER 节点。
 */
function derInteger(content: Buffer): Buffer {
  return derTlv(0x02, content)
}

/**
 * 编码 DER OBJECT IDENTIFIER。
 * @param value 点分 OID。
 * @returns OID 节点。
 */
function derOid(value: string): Buffer {
  const parts = value.split('.').map(Number)
  const bytes: number[] = [40 * parts[0] + parts[1]]
  for (const part of parts.slice(2)) {
    const stack: number[] = [part & 0x7f]
    let rest = part >> 7
    while (rest > 0) {
      stack.unshift((rest & 0x7f) | 0x80)
      rest >>= 7
    }
    bytes.push(...stack)
  }
  return derTlv(0x06, Buffer.from(bytes))
}

/**
 * 编码 DER UTF8String。
 * @param value 文本。
 * @returns UTF8String 节点。
 */
function derUtf8(value: string): Buffer {
  return derTlv(0x0c, Buffer.from(value, 'utf8'))
}

/**
 * 编码 DER UTCTime。
 * @param date 时间。
 * @returns UTCTime 节点。
 */
function derUtcTime(date: Date): Buffer {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  return derTlv(0x17, Buffer.from(text, 'ascii'))
}

/**
 * 编码 DER BIT STRING。
 * @param content 已编码的位内容。
 * @returns BIT STRING 节点。
 */
function derBitString(content: Buffer): Buffer {
  return derTlv(0x03, Buffer.concat([Buffer.from([0]), content]))
}

/**
 * 编码证书中的 Name（CN、O、OU），与 KDE Connect 的自签名结构保持一致。
 * @param deviceId 证书 CN。
 * @returns Name 节点。
 */
function derName(deviceId: string): Buffer {
  return derSequence(
    derSet(derSequence(derOid('2.5.4.3'), derUtf8(deviceId))),
    derSet(derSequence(derOid('2.5.4.10'), derUtf8('KDE'))),
    derSet(derSequence(derOid('2.5.4.11'), derUtf8('TabDo')))
  )
}

/**
 * 生成与 KDE Connect 兼容的自签名 EC 证书，CN 使用设备 ID。
 * @param deviceId 32 位设备标识。
 * @returns PEM 私钥、PEM 证书与 DER 证书。
 */
export function generateDeviceCertificate(deviceId: string): {
  privateKeyPem: string
  certificatePem: string
  certificateDer: Buffer
} {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const subjectPublicKeyInfo = publicKey.export({ type: 'spki', format: 'der' })

  // ecdsa-with-SHA256，KDE Connect 使用同一签名族，Qt 与 Node 均可验证。
  const signatureAlgorithm = derSequence(derOid('1.2.840.10045.4.3.2'))
  const name = derName(deviceId)
  const now = Date.now()
  const validity = derSequence(
    derUtcTime(new Date(now - 365 * 24 * 3600 * 1000)),
    derUtcTime(new Date(now + 10 * 365 * 24 * 3600 * 1000))
  )

  // 序列号最高位清零，避免被解析成负数。
  const serial = randomBytes(16)
  serial[0] &= 0x7f
  const tbsCertificate = derSequence(
    derTlv(0xa0, derInteger(Buffer.from([2]))),
    derInteger(serial),
    signatureAlgorithm,
    name,
    validity,
    name,
    subjectPublicKeyInfo
  )

  const signature = sign('sha256', tbsCertificate, createPrivateKey(privateKeyPem))
  const certificateDer = derSequence(tbsCertificate, signatureAlgorithm, derBitString(signature))
  // 按 64 字符切行且不留空行；DER 长度恰好整除时额外的空行会被部分 TLS 栈判为非法填充。
  const base64 =
    certificateDer
      .toString('base64')
      .match(/.{1,64}/g)
      ?.join('\n') || ''
  return {
    privateKeyPem,
    certificatePem: `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`,
    certificateDer
  }
}

/**
 * 把 SHA-256 摘要格式化为可读指纹。
 * @param der 证书 DER 内容。
 * @returns 冒号分隔的大写十六进制指纹。
 */
export function formatCertificateFingerprint(der: Buffer): string {
  const digest = createHash('sha256').update(der).digest('hex').toUpperCase()
  return digest.match(/.{2}/g)?.join(':') || digest
}

/**
 * 把 PEM 证书转换为 DER。
 * @param pem PEM 文本。
 * @returns DER 内容。
 */
export function certificatePemToDer(pem: string): Buffer {
  const body = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
  return Buffer.from(body, 'base64')
}

/**
 * 从 PEM 证书读取 CN 与指纹。
 * @param pem PEM 证书。
 * @returns 证书 CN 与 SHA-256 指纹；格式无效时返回 null。
 */
export function readCertificateIdentity(
  pem: string
): { commonName: string; fingerprint: string } | null {
  try {
    const certificate = new X509Certificate(pem)
    return {
      commonName:
        certificate.subject
          .split('\n')
          .find((line) => line.startsWith('CN='))
          ?.slice(3) || '',
      fingerprint: certificate.fingerprint256
    }
  } catch {
    return null
  }
}

/**
 * 生成 32 位小写设备 ID，与 KDE Connect 的 UUID 去分隔符格式一致。
 * @returns 32 位十六进制设备 ID。
 */
export function createDeviceId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 读取或生成本机互联身份；证书 CN 无效或与私钥不匹配时重新生成。
 * @param dataRoot 当前 TabDo 资料根目录。
 * @returns 可长期使用的本机身份。
 */
export function ensureInterconnectIdentity(dataRoot: string): InterconnectIdentity {
  const directory = path.join(dataRoot, 'interconnect')
  const keyPath = path.join(directory, 'privateKey.pem')
  const certificatePath = path.join(directory, 'certificate.pem')

  /** 校验并返回已存在的身份。 */
  const loadExisting = (): InterconnectIdentity | null => {
    if (!fs.existsSync(keyPath) || !fs.existsSync(certificatePath)) return null
    try {
      const privateKeyPem = fs.readFileSync(keyPath, 'utf8')
      const certificatePem = fs.readFileSync(certificatePath, 'utf8')
      const certificateDer = certificatePemToDer(certificatePem)
      const certificate = new X509Certificate(certificateDer)
      const commonName = certificate.subject
        .split('\n')
        .find((line) => line.startsWith('CN='))
        ?.slice(3)
      if (!commonName || !/^[a-zA-Z0-9_-]{32,38}$/.test(commonName)) return null
      // 私钥与证书必须匹配，否则 TLS 握手会延迟到运行期才失败。
      createPrivateKey(privateKeyPem)
      return {
        deviceId: commonName,
        privateKeyPem,
        certificatePem,
        certificateDer,
        fingerprint: formatCertificateFingerprint(certificateDer)
      }
    } catch {
      return null
    }
  }

  const existing = loadExisting()
  if (existing) return existing

  fs.mkdirSync(directory, { recursive: true })
  const deviceId = createDeviceId()
  const generated = generateDeviceCertificate(deviceId)
  fs.writeFileSync(keyPath, generated.privateKeyPem, { mode: 0o600 })
  fs.writeFileSync(certificatePath, generated.certificatePem, { mode: 0o600 })
  return {
    deviceId,
    privateKeyPem: generated.privateKeyPem,
    certificatePem: generated.certificatePem,
    certificateDer: generated.certificateDer,
    fingerprint: formatCertificateFingerprint(generated.certificateDer)
  }
}
