import fs from 'node:fs/promises'
import path from 'node:path'
import { assertCallAiNoLinks, isCallAiChild } from './callAiRuntime'

export type CallAiFileWrite = { path: string; content: string }

/**
 * 规范化一组文件路径并预检冲突，审批显示最终写入位置。
 * @param output 本次会话的默认产物目录。
 * @param desktop 系统解析的桌面目录。
 * @param protectedRoots 禁止作为产物位置的应用资料与运行目录。
 * @param directory 用户指定的批量目录，支持 desktop 或绝对路径。
 * @param files 文件相对路径与 UTF-8 内容。单文件入口也支持绝对路径。
 * @returns 本次审批覆盖的最终写入计划。
 * @throws 路径越界、重名、目标已存在或超出批量限制时拒绝。
 */
export async function planCallAiWrites(
  output: string,
  desktop: string,
  protectedRoots: string[],
  directory: unknown,
  files: unknown
): Promise<CallAiFileWrite[]> {
  if (!Array.isArray(files) || files.length < 1 || files.length > 50)
    throw new Error('每次可新建 1–50 个文件')
  if (
    directory !== undefined &&
    directory !== 'desktop' &&
    (typeof directory !== 'string' || !path.isAbsolute(directory))
  )
    throw new Error('目标目录必须是 desktop 或完整绝对路径')
  const ambiguousWindowsPath = /^(?:[A-Za-z]:(?![\\/])|[\\/](?![\\/])|[\\/]{2}[?.][\\/])/
  if (
    process.platform === 'win32' &&
    typeof directory === 'string' &&
    ambiguousWindowsPath.test(directory)
  )
    throw new Error('目标目录必须使用完整盘符路径或 UNC 路径')
  const root = path.resolve(
    directory === 'desktop' ? desktop : ((directory as string | undefined) ?? output)
  )
  const names = new Set<string>()
  let bytes = 0
  const writes = files.map((file: Partial<CallAiFileWrite> | null) => {
    if (
      !file ||
      typeof file.path !== 'string' ||
      !file.path.trim() ||
      typeof file.content !== 'string' ||
      file.path.includes('\0')
    )
      throw new Error('请提供有效的文件名和文本内容')
    const absolute = path.isAbsolute(file.path)
    if (process.platform === 'win32' && ambiguousWindowsPath.test(file.path))
      throw new Error('请使用完整盘符路径或普通文件名')
    const target = path.resolve(root, file.path)
    if (
      process.platform === 'win32' &&
      target
        .slice(path.parse(target).root.length)
        .split(path.sep)
        .some(
          (part) =>
            /[<>:"|?*\x00-\x1f]|[ .]$/.test(part) ||
            /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i.test(part)
        )
    )
      throw new Error(`Windows 文件名无效：${target}`)
    if ((directory !== undefined || !absolute) && !isCallAiChild(root, target))
      throw new Error('批量文件名必须位于指定目录内')
    if (
      protectedRoots.some(
        (parent) => path.relative(parent, target) === '' || isCallAiChild(parent, target)
      )
    )
      throw new Error('结果文件不能写入应用或资料目录')
    const key = process.platform === 'win32' ? target.toLowerCase() : target
    if (names.has(key)) throw new Error(`批次内的文件路径重复：${target}`)
    names.add(key)
    bytes += Buffer.byteLength(file.content)
    if (bytes > 2_000_000) throw new Error('每次写入的文本内容最多 2MB')
    return { path: target, content: file.content }
  })
  // 预检目标与父目录，避免批准后才发现文件冲突。
  await Promise.all(
    writes.map(async ({ path: target }) => {
      await assertCallAiNoLinks(target)
      const existing = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      if (existing) throw new Error(`文件已存在：${target}。请另选名称，原文件会保留。`)
      if (writes.some(({ path: other }) => isCallAiChild(other, target)))
        throw new Error(`批次中的文件不能同时作为目录：${target}`)
    })
  )
  return writes
}

/**
 * 使用主进程文件 API 发布预检过的文件，并在失败时回收本批新文件。
 * @param writes 用户批准的完整文件计划。
 * @param signal 当前任务的取消信号。
 * @returns 实际写入的绝对路径和 UTF-8 字节数。
 * @throws 取消、权限错误或并发文件冲突时拒绝。
 */
export async function publishCallAiWrites(
  writes: CallAiFileWrite[],
  signal?: AbortSignal
): Promise<Array<{ path: string; bytes: number }>> {
  const created: string[] = []
  try {
    for (const item of writes) {
      signal?.throwIfAborted()
      // 审批期间路径可能变化，重新校验并以排他方式创建。
      await assertCallAiNoLinks(item.path)
      await fs.mkdir(path.dirname(item.path), { recursive: true })
      const file = await fs.open(item.path, 'wx')
      created.push(item.path)
      try {
        await file.writeFile(item.content, { encoding: 'utf8', signal })
      } finally {
        await file.close()
      }
    }
    signal?.throwIfAborted()
  } catch (error) {
    const cleanup = await Promise.allSettled(
      created.map(async (target) => {
        await assertCallAiNoLinks(target)
        await fs.unlink(target)
      })
    )
    const left = created.filter((_, index) => cleanup[index].status === 'rejected')
    if (left.length)
      throw new Error(`写入失败，以下本次新建文件无法回收：${left.join('、')}`, { cause: error })
    throw error
  }
  return writes.map((item) => ({ path: item.path, bytes: Buffer.byteLength(item.content) }))
}
