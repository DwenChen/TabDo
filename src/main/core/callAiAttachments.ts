import fs from 'node:fs/promises'
import path from 'node:path'
import type { ImageContent } from '@earendil-works/pi-ai'
import { assertCallAiNoLinks } from './callAiRuntime'

const maxImageBytes = 4 * 1024 * 1024
const imageExtensions = /\.(png|jpe?g|webp|gif)$/i

/**
 * 获取提供商可接收的图片 MIME 类型，使用文件头验证而非信任扩展名。
 * @param data 有界文件内容。
 * @returns 支持的图片 MIME 类型，其他文件返回 undefined。
 */
function imageMime(data: Buffer): string | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg'
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp'
  if (['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString())) return 'image/gif'
  return undefined
}

/**
 * 校验剪贴板图片的编码、实际格式及大小。
 * @param image 剪贴板传入的图片数据 URL。
 * @returns 图片 MIME 类型、原始字节和规范的 Base64 内容。
 * @throws 数据无效、格式不受支持或超过单图限制时拒绝。
 */
export function decodeCallAiClipboardImage(image: unknown): {
  mimeType: string
  bytes: Buffer
  encoded: string
} {
  if (typeof image !== 'string') throw new Error('选中的图片格式无效')
  const header = /^data:(image\/(?:png|jpeg|webp|gif));base64,/.exec(image)
  if (!header) throw new Error('选中的图片格式无效')
  if (image.length - header[0].length > 4 * Math.ceil(maxImageBytes / 3))
    throw new Error('选中的图片超过 4 MB')
  const encoded = image.slice(header[0].length)
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > maxImageBytes) throw new Error('选中的图片超过 4 MB')
  const mimeType = imageMime(bytes)
  if (mimeType !== header[1] || bytes.toString('base64') !== encoded)
    throw new Error('选中的图片格式无效')
  return { mimeType, bytes, encoded }
}

/**
 * 为用户本轮明确提交的本地文件和内联图片生成路径引用与受限图片内容。
 * @param files 用户匹配、选择或拖入的本地文件和文件夹路径。
 * @param supportsImages 当前提供商模型是否声明图片输入能力。
 * @param signal 本轮会话取消信号。
 * @param inlineImage 输入框直接粘贴的图片数据 URL。
 * @returns 可供工具处理的附件清单与可直接送往视觉模型的图片。
 * @throws 文件路径、类型或数量无效时拒绝提交。
 */
export async function prepareCallAiAttachments(
  files: unknown,
  supportsImages: boolean,
  signal: AbortSignal,
  inlineImage?: unknown
): Promise<{ descriptions: string[]; images: ImageContent[] }> {
  const descriptions: string[] = []
  const images: ImageContent[] = []
  const paths = files === undefined ? [] : files
  if (!Array.isArray(paths) || paths.length + Number(inlineImage !== undefined) > 12)
    throw new Error('每轮最多添加 12 个附件')
  let remaining = maxImageBytes * 2
  if (inlineImage !== undefined) {
    // 内联图片和磁盘图片共享模型能力检查与字节预算。
    signal.throwIfAborted()
    if (!supportsImages) throw new Error('当前模型不支持图片输入，请切换模型或移除选中图片')
    const { mimeType, bytes, encoded } = decodeCallAiClipboardImage(inlineImage)
    images.push({ type: 'image', mimeType, data: encoded })
    remaining -= bytes.length
  }
  for (const selected of new Set<unknown>(paths)) {
    signal.throwIfAborted()
    if (typeof selected !== 'string' || !path.isAbsolute(selected) || selected.includes('\0'))
      throw new Error('请选择有效的本地文件')
    const target = path.resolve(selected)
    await assertCallAiNoLinks(target)
    // 文件夹仅传递路径，不枚举内容。读取内容仍由本轮工具处理。
    const info = await fs.lstat(target).catch(() => undefined)
    if (info?.isDirectory()) {
      descriptions.push(JSON.stringify({ path: target, format: '文件夹路径' }))
      continue
    }
    if (!info?.isFile()) throw new Error(`无法访问附件“${path.basename(target)}”，请重新选择。`)
    let format = '路径引用'
    if (imageExtensions.test(target)) {
      format = supportsImages
        ? '图片仅提供路径，格式或大小超出图片输入限制'
        : '图片仅提供路径，当前模型不支持图片输入'
      if (supportsImages && info.size > 0 && info.size <= Math.min(remaining, maxImageBytes)) {
        // 单次固定长度读取，文件变大也不能扩大 IPC 或模型输入。
        const handle = await fs.open(target, 'r')
        try {
          const data = Buffer.alloc(info.size + 1)
          const { bytesRead } = await handle.read(data, 0, data.length, 0)
          const content = data.subarray(0, bytesRead)
          const mimeType = imageMime(content)
          if (mimeType && bytesRead === info.size) {
            images.push({ type: 'image', mimeType, data: content.toString('base64') })
            remaining -= bytesRead
            format = '图片内容已随消息提交'
          }
        } finally {
          await handle.close()
        }
      }
    }
    descriptions.push(JSON.stringify({ path: target, bytes: info.size, format }))
  }
  signal.throwIfAborted()
  return { descriptions, images }
}
