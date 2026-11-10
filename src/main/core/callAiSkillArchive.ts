import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { crc32, inflateRawSync } from 'node:zlib'
import AdmZip from 'adm-zip'
import { assertCallAiNoLinks } from './callAiRuntime'

const maxArchiveBytes = 10_000_000
const maxEntries = 1000

/**
 * 读取本地 ZIP 或从 HTTPS 下载，限制传输体积、重定向与耗时。
 * @param source ZIP 的绝对路径或 HTTPS 链接。
 * @param signal 对话任务的取消信号。
 * @returns 有界 ZIP 内容与压缩包名称。
 * @throws 来源、重定向或内容无效时拒绝。
 */
export async function readCallAiSkillArchive(
  source: string,
  signal?: AbortSignal
): Promise<{ data: Buffer; name: string }> {
  if (typeof source !== 'string' || !source || source.length > 4096)
    throw new Error('请提供本地 ZIP 绝对路径或 HTTPS 下载链接')
  let chunks: AsyncIterable<Uint8Array>
  let name: string
  if (path.isAbsolute(source)) {
    if (path.extname(source).toLowerCase() !== '.zip') throw new Error('请选择 ZIP 文件')
    await assertCallAiNoLinks(source)
    const info = await fs.stat(source)
    if (!info.isFile() || info.size > maxArchiveBytes)
      throw new Error('请选择 10MB 以内的 ZIP 文件')
    name = path.basename(source, path.extname(source))
    chunks = createReadStream(source, { end: maxArchiveBytes, signal })
  } else {
    let url = new URL(source)
    name = path.posix.basename(url.pathname).replace(/\.zip$/i, '') || 'Skill'
    const timeout = AbortSignal.timeout(60_000)
    const downloadSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    for (let redirects = 0; ; redirects++) {
      // 每一跳都验证来源，不携带本机凭据。
      if (url.protocol !== 'https:' || url.username || url.password || redirects > 5)
        throw new Error('Skill 下载仅支持 HTTPS，且最多允许五次重定向')
      const response = await fetch(url, { redirect: 'manual', signal: downloadSignal })
      const location = response.headers.get('location')
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        await response.body?.cancel()
        url = new URL(location, url)
        continue
      }
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get('content-length')) > maxArchiveBytes
      ) {
        await response.body?.cancel()
        throw new Error('Skill 下载失败或 ZIP 超过 10MB')
      }
      chunks = response.body as unknown as AsyncIterable<Uint8Array>
      break
    }
  }
  // 使用实际收到的字节数限制未知长度或变化中的来源。
  const buffers: Buffer[] = []
  let size = 0
  for await (const chunk of chunks) {
    size += chunk.byteLength
    if (size > maxArchiveBytes) throw new Error('Skill ZIP 超过 10MB')
    buffers.push(Buffer.from(chunk))
  }
  return { data: Buffer.concat(buffers, size), name }
}

/**
 * 校验并提取一个 Skill，保留 SKILL.md 所在目录内的相对资源。
 * @param archive ZIP 内容和压缩包名称。
 * @param staging 由安装操作独占的暂存目录。
 * @param signal 对话任务的取消信号。
 * @returns 供列表展示的 Skill 名称。
 * @throws 多技能包、不安全路径或损坏的 ZIP 不发布。
 */
export async function extractCallAiSkill(
  archive: { data: Buffer; name: string },
  staging: string,
  signal?: AbortSignal
): Promise<string> {
  const zip = new AdmZip(archive.data)
  if (zip.getEntryCount() > maxEntries) throw new Error('Skill 最多包含 1000 项')
  const seen = new Set<string>()
  let size = 0
  // 在写入之前验证路径、类型及总解包大小。
  const entries = zip.getEntries().map((entry) => {
    const name = entry.entryName.replace(/\\/g, '/').replace(/\/$/, '')
    const key = name.toLowerCase()
    const kind = (entry.attr >>> 16) & 0o170000
    if (
      name
        .split('/')
        .some(
          (part) =>
            !part ||
            /[<>:"|?*\x00-\x1f]|[ .]$/.test(part) ||
            /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)
        ) ||
      seen.has(key) ||
      (kind !== 0 && kind !== (entry.isDirectory ? 0o040000 : 0o100000)) ||
      entry.header.encripted
    )
      throw new Error('Skill ZIP 包含不安全、重复或加密的条目')
    seen.add(key)
    size += entry.header.size
    if (size > maxArchiveBytes) throw new Error('Skill 解包内容超过 10MB')
    return { entry, name }
  })
  const manifests = entries.filter(
    ({ entry, name }) => !entry.isDirectory && path.posix.basename(name) === 'SKILL.md'
  )
  if (manifests.length !== 1 || manifests[0].entry.header.size > 100_000)
    throw new Error('ZIP 必须包含一个不超过 100KB 的 SKILL.md')
  const directory = path.posix.dirname(manifests[0].name)
  const prefix = directory === '.' ? '' : `${directory}/`
  await assertCallAiNoLinks(staging)
  await fs.mkdir(staging)
  for (const { entry, name } of entries) {
    signal?.throwIfAborted()
    if (!name.startsWith(prefix)) continue
    const target = path.join(staging, name.slice(prefix.length))
    if (entry.isDirectory) {
      await fs.mkdir(target, { recursive: true })
      continue
    }
    const compressed = entry.getCompressedData()
    const { method, size: expected, crc } = entry.header
    // 直接限制实际解压输出，防止伪造头部大小绕过总量限制。
    const data =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: Math.max(expected, 1) })
          : undefined
    if (!data || data.length !== expected || crc32(data) !== crc)
      throw new Error('Skill ZIP 文件损坏或使用了不支持的压缩方式')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data, { flag: 'wx', signal })
  }
  return (directory === '.' ? archive.name : path.posix.basename(directory)).slice(0, 100)
}
