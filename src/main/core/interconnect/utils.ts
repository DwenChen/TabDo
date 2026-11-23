import path from 'node:path'

/**
 * 计算 IPv4 网段的广播地址。
 * @param address 本机地址。
 * @param netmask 子网掩码。
 * @returns 广播地址；输入非法时返回 null。
 */
export function computeBroadcastAddress(address: string, netmask: string): string | null {
  const parse = (value: string): number[] | null => {
    const parts = value.split('.').map(Number)
    return parts.length === 4 &&
      parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
      ? parts
      : null
  }
  const ip = parse(address)
  const mask = parse(netmask)
  if (!ip || !mask) return null
  return ip.map((part, index) => (part & mask[index]) | (~mask[index] & 255)).join('.')
}

/**
 * 归一化文件名，去掉目录与 Windows 非法字符。
 * @param filename 远端声明的文件名。
 * @returns 可安全写入当前目录的文件名。
 */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, '/'))
  // 控制字符零星出现时直接丢弃，其余 Windows 非法字符替换为下划线。
  const cleaned = Array.from(base)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return `received-${Date.now()}`
  return cleaned.slice(0, 200)
}

/**
 * 按扩展名判断是否为可直接写入剪贴板的图片。
 * @param filePath 文件路径。
 * @returns 图片格式返回 true。
 */
export function isClipboardImage(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(
    path.extname(filePath).toLowerCase()
  )
}
