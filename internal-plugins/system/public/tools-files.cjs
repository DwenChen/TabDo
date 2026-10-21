const fs = require('node:fs/promises')
const syncFs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { pathToFileURL, fileURLToPath } = require('node:url')

/**
 * 读取有界预览，文本仅取前 128KiB，目录只显示直接子项。
 * @param {string} file 用户选择的搜索结果。
 * @returns {Promise<object>} 文件预览与元数据。
 * @throws {Error} 路径已失效或无法读取时抛出。
 */
async function previewFile(file) {
  const stat = await fs.stat(file)
  const base = { name: path.basename(file), path: file, size: stat.size, modified: stat.mtimeMs }
  if (stat.isDirectory()) {
    const entries = await fs.readdir(file, { withFileTypes: true })
    return {
      ...base,
      type: 'folder',
      entries: entries.slice(0, 200).map((entry) => ({
        name: entry.name,
        path: path.join(file, entry.name),
        isDirectory: entry.isDirectory()
      })),
      truncated: entries.length > 200
    }
  }
  if (/\.(png|jpe?g|gif|bmp|webp|ico|avif)$/i.test(file) && stat.size < 10 * 1024 * 1024)
    return { ...base, type: 'image', content: readImage(file) }
  if (/\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(file))
    return { ...base, type: 'audio', content: pathToFileURL(file).href }
  if (/\.(mp4|webm|ogg|mov)$/i.test(file))
    return { ...base, type: 'video', content: pathToFileURL(file).href }
  if (
    /\.(txt|md|json|csv|log|xml|ya?ml|[cm]?[jt]s|tsx|jsx|html?|css|py|c|cpp|h|sh|ps1|ini|toml|v|sv)$/i.test(
      file
    )
  ) {
    const handle = await fs.open(file, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(128 * 1024, stat.size))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      return {
        ...base,
        type: 'text',
        content: buffer.subarray(0, bytesRead).toString('utf8'),
        truncated: stat.size > bytesRead
      }
    } finally {
      await handle.close()
    }
  }
  return { ...base, type: 'file' }
}

/**
 * 读取受支持的图片文件，限制输入大小并拒绝目录。
 * @param {string} file 用户明确选择的本地文件。
 * @returns {string} 图片 data URI。
 * @throws {Error} 格式无效、过大或无法读取时抛出。
 */
function readImage(file) {
  if (file.startsWith('file:')) file = fileURLToPath(file)
  const ext = path.extname(file).slice(1).toLowerCase()
  if (!['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'avif', 'tif', 'tiff'].includes(ext))
    throw new Error('不支持的图片格式')
  const stat = syncFs.statSync(file)
  if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new Error('请选择小于 50MB 的图片文件')
  const mime = { jpg: 'jpeg', tif: 'tiff', ico: 'x-icon' }[ext] || ext
  return `data:image/${mime};base64,${syncFs.readFileSync(file).toString('base64')}`
}

/**
 * 为路径生成平台一致的身份，Windows 忽略大小写。
 * @param {string} file 文件路径。
 * @returns {string} 绝对路径身份。
 */
function identity(file) {
  const result = path.resolve(file)
  return process.platform === 'win32' ? result.toLowerCase() : result
}

/**
 * 读取文件的预览元数据，供执行前重新检查。
 * @param {string[]} paths 用户选中的绝对路径。
 * @returns {Promise<object[]>} 文件与目录条目。
 * @throws {Error} 路径无效或文件不可读时抛出。
 */
async function inspectFiles(paths) {
  if (!Array.isArray(paths) || paths.length > 2000) throw new Error('单次最多处理 2000 项')
  const entries = []
  const seen = new Set()
  for (const file of paths) {
    if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('请选择本地绝对路径')
    const key = identity(file)
    if (seen.has(key)) continue
    seen.add(key)
    const stat = await fs.lstat(file)
    if (stat.isSymbolicLink()) throw new Error('暂不处理符号链接，请选择原始文件')
    entries.push({
      path: file,
      name: path.basename(file),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      birthtimeMs: stat.birthtimeMs,
      ino: stat.ino,
      dev: stat.dev
    })
  }
  return entries
}

/**
 * 只读检查预览计划的文件身份、名称、目标冲突与父子混合，返回逐行提示。
 * @param {object[]} entries 当前预览计划。
 * @param {AbortSignal} [signal] 前台会话退出信号。
 * @returns {Promise<Object<string, string>>} 按源路径索引的错误提示。
 * @throws {Error} 计划规模或原始路径无效时抛出错误。
 */
async function reviewRenames(entries, signal) {
  if (!Array.isArray(entries) || entries.length > 2000) throw new Error('最多预览 2000 项')
  const issues = {},
    sources = new Set(),
    targets = new Map()
  // 完整源集合允许批次内部交换和大小写改名。
  for (const entry of entries) {
    if (typeof entry.path !== 'string' || !path.isAbsolute(entry.path))
      throw new Error('原始路径无效')
    sources.add(identity(entry.path))
    const name = entry.newName
    if (
      typeof name !== 'string' ||
      !name ||
      name.length > 255 ||
      /[<>:"/\\|?*]/.test(name) ||
      [...name].some((character) => character.charCodeAt(0) < 32) ||
      /[. ]$/.test(name) ||
      /^\.{1,2}$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    ) {
      issues[entry.path] = '文件名无效'
      continue
    }
    const target = identity(path.join(path.dirname(entry.path), name))
    const previous = targets.get(target)
    if (previous) issues[entry.path] = issues[previous] = '目标名称重复'
    else targets.set(target, entry.path)
  }
  let index = 0
  /**
   * 有界并发读取元数据，退出后不再分配新的文件检查。
   * @returns {Promise<void>} 当前队列结束后的 Promise。
   */
  async function inspectNext() {
    while (index < entries.length && !signal?.aborted) {
      const entry = entries[index++]
      if (issues[entry.path]) continue
      const source = identity(entry.path)
      if (
        [...sources].some(
          (other) =>
            other !== source &&
            (other.startsWith(source + path.sep) || source.startsWith(other + path.sep))
        )
      ) {
        issues[entry.path] = '请分批重命名父目录与其中的子项'
        continue
      }
      try {
        const stat = await fs.lstat(entry.path)
        if (
          stat.isSymbolicLink() ||
          stat.ino !== entry.ino ||
          stat.dev !== entry.dev ||
          stat.size !== entry.size ||
          stat.mtimeMs !== entry.mtimeMs
        ) {
          issues[entry.path] = '文件已变化，请刷新预览'
          continue
        }
        const target = path.join(path.dirname(entry.path), entry.newName)
        if (!sources.has(identity(target))) {
          try {
            await fs.lstat(target)
            issues[entry.path] = '目标已存在'
          } catch (error) {
            if (error.code !== 'ENOENT') issues[entry.path] = '无法访问目标路径'
          }
        }
      } catch {
        issues[entry.path] = '原文件不存在或无法访问'
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, entries.length) }, inspectNext))
  return issues
}

/**
 * 验证 Windows 文件名约束及同批目标冲突，拒绝覆盖和父子混合改名。
 * @param {object[]} entries 已展示预览的文件计划。
 * @returns {Promise<object[]>} 仅含有变化的已检查计划。
 * @throws {Error} 文件变化、路径冲突或名称无效时抛出。
 */
async function validateRenames(entries) {
  const sources = new Set(),
    destinations = new Set(),
    changed = []
  if (!Array.isArray(entries) || !entries.length || entries.length > 2000)
    throw new Error('请选择 1–2000 项')
  for (const entry of entries) {
    if (typeof entry.path !== 'string' || !path.isAbsolute(entry.path))
      throw new Error('原始路径无效')
    if (sources.has(identity(entry.path))) throw new Error('原始文件重复')
    sources.add(identity(entry.path))
    const name = entry.newName
    if (
      typeof name !== 'string' ||
      !name ||
      name.length > 255 ||
      /[<>:"/\\|?*]/.test(name) ||
      [...name].some((character) => character.charCodeAt(0) < 32) ||
      /[. ]$/.test(name) ||
      /^\.{1,2}$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    )
      throw new Error(`无效文件名：${name}`)
    const target = path.join(path.dirname(entry.path), name)
    const key = identity(target)
    if (destinations.has(key)) throw new Error(`目标名称重复：${name}`)
    destinations.add(key)
    const stat = await fs.lstat(entry.path)
    if (
      stat.isSymbolicLink() ||
      stat.ino !== entry.ino ||
      stat.dev !== entry.dev ||
      stat.size !== entry.size ||
      stat.mtimeMs !== entry.mtimeMs
    )
      throw new Error(`文件已变化，请刷新预览：${entry.name}`)
    if (target !== entry.path)
      changed.push({
        ...entry,
        target,
        temporary: path.join(path.dirname(entry.path), `.tabdo-rename-${randomUUID()}`),
        location: entry.path
      })
  }
  for (const entry of changed) {
    const source = identity(entry.path)
    if (
      [...sources].some(
        (other) =>
          other !== source &&
          (other.startsWith(source + path.sep) || source.startsWith(other + path.sep))
      )
    )
      throw new Error('请分批重命名父目录与其中的子项')
    if (!sources.has(identity(entry.target)) && syncFs.existsSync(entry.target))
      throw new Error(`目标已存在：${entry.newName}`)
  }
  return changed
}

/**
 * 通过同目录临时名完成交换与大小写改名，失败时按两阶段回滚。
 * @param {object[]} entries 用户确认过的完整预览计划。
 * @param {string} journalDirectory 本工具的持久化恢复记录目录。
 * @param {AbortSignal} signal 必要任务的取消信号。
 * @returns {Promise<object[]>} 改名后的路径与旧路径。
 * @throws {Error} 预检失败、改名失败或回滚需人工恢复时抛出。
 */
async function renameBatch(entries, journalDirectory, signal) {
  const plan = await validateRenames(entries)
  if (!plan.length) return []
  await fs.mkdir(journalDirectory, { recursive: true })
  const journal = path.join(journalDirectory, `rename-${randomUUID()}.json`)
  // 预先记录全部源、临时和目标路径，即使进程意外退出也有恢复依据。
  await fs.writeFile(journal, JSON.stringify(plan, null, 2), { flag: 'wx' })
  try {
    for (const entry of plan) {
      if (signal?.aborted) throw new Error('重命名已取消')
      await fs.rename(entry.path, entry.temporary)
      entry.location = entry.temporary
    }
    for (const entry of plan) {
      if (signal?.aborted) throw new Error('重命名已取消')
      if (syncFs.existsSync(entry.target)) throw new Error(`目标被其他程序占用：${entry.newName}`)
      await fs.rename(entry.temporary, entry.target)
      entry.location = entry.target
    }
    await fs.unlink(journal)
    return plan.map((entry) => ({ path: entry.target, previousPath: entry.path }))
  } catch (failure) {
    try {
      // 先把已经发布的目标收回临时名，再恢复所有原始名，避免交换改名互相覆盖。
      for (const entry of plan)
        if (entry.location === entry.target) {
          await fs.rename(entry.target, entry.temporary)
          entry.location = entry.temporary
        }
      for (const entry of plan)
        if (entry.location === entry.temporary) {
          if (syncFs.existsSync(entry.path)) throw new Error(`原路径已被占用：${entry.path}`)
          await fs.rename(entry.temporary, entry.path)
          entry.location = entry.path
        }
      await fs.unlink(journal)
    } catch (rollback) {
      throw new Error(`${failure.message}；回滚未完成：${rollback.message}。恢复记录：${journal}`)
    }
    throw failure
  }
}

/**
 * 在目标父目录中生成不冲突的名称，形如 base (1).ext。
 * @param {string} directory 目标父目录的绝对路径。
 * @param {string} name 原始名称。
 * @returns {string} 尚未被占用的目标绝对路径。
 */
function uniqueBreakTarget(directory, name) {
  const ext = path.extname(name)
  const base = name.slice(0, name.length - ext.length)
  let candidate = path.join(directory, name),
    index = 1
  // 逐步递增后缀，直到父目录中不存在同名项。
  while (syncFs.existsSync(candidate)) {
    candidate = path.join(directory, `${base} (${index})${ext}`)
    index += 1
  }
  return candidate
}

/**
 * 统计待解散目录的规模与类型分布；单层只看直接子项，递归深入全部后代。
 * @param {string} dir 待解散的目录绝对路径。
 * @param {{recursive?: boolean}} [options] 是否递归统计。
 * @param {AbortSignal} [signal] 只读扫描的取消信号。
 * @returns {Promise<{files: object[], dirs: object[], totalFiles: number, totalDirs: number, totalSize: number, fileTypes: object[]}>} 文件、目录、大小与按扩展名的类型统计。
 * @throws {Error} 路径无效、非目录或扫描被取消时抛出。
 */
async function scanBreakTarget(dir, options = {}, signal) {
  const recursive = options.recursive === true
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('请选择本地绝对路径')
  const source = path.resolve(dir)
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) throw new Error('暂不处理符号链接，请选择原始文件夹')
  if (!stat.isDirectory()) throw new Error('请选择一个文件夹')
  const files = [],
    dirs = [],
    types = new Map()
  let totalSize = 0
  /**
   * 读一层目录并按需递归；符号链接与非常规文件均跳过。
   * @param {string} current 当前遍历目录。
   * @param {string} prefix 相对源目录的路径前缀。
   * @returns {Promise<void>} 本层及后代扫描结束后的 Promise。
   */
  async function walk(current, prefix) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (signal?.aborted) throw new Error('解散扫描已取消')
      if (entry.isSymbolicLink()) continue
      const full = path.join(current, entry.name)
      const relative = prefix ? path.join(prefix, entry.name) : entry.name
      if (entry.isDirectory()) {
        dirs.push({ path: full, name: entry.name, relative })
        if (recursive) await walk(full, relative)
      } else if (entry.isFile()) {
        const info = await fs.lstat(full)
        totalSize += info.size
        const ext = path.extname(entry.name).slice(1).toLowerCase() || ''
        types.set(ext, (types.get(ext) || 0) + 1)
        files.push({ path: full, name: entry.name, relative, size: info.size, ext })
      }
    }
  }
  await walk(source, '')
  // 类型徽标按数量降序、同数量按扩展名稳定排序。
  const fileTypes = [...types.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext))
  return { files, dirs, totalFiles: files.length, totalDirs: dirs.length, totalSize, fileTypes }
}

/**
 * 把目录内的内容移到父目录，并在目录清空后删除它；失败时回滚已完成的移动。
 * @param {string} dir 待解散的目录绝对路径。
 * @param {{recursive?: boolean, conflictStrategy?: 'rename'|'overwrite'|'skip'}} [options] 解散参数，冲突默认自动重命名。
 * @param {AbortSignal} [signal] 必要任务的取消信号。
 * @returns {Promise<{moved: object[], deletedDirs: string[], skipped: object[], errors: object[]}>} 移动、删除、跳过与遗留失败明细。
 * @throws {Error} 输入无效、移动或覆盖失败且回滚不完整、或任务被取消时抛出。
 */
async function breakDirectory(dir, options = {}, signal) {
  const recursive = options.recursive === true
  const strategy = ['rename', 'overwrite', 'skip'].includes(options.conflictStrategy)
    ? options.conflictStrategy
    : 'rename'
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('请选择本地绝对路径')
  const source = path.resolve(dir)
  const parent = path.dirname(source)
  const stat = await fs.lstat(source)
  if (stat.isSymbolicLink()) throw new Error('暂不处理符号链接，请选择原始文件夹')
  if (!stat.isDirectory()) throw new Error('请选择一个文件夹')
  if (parent === source) throw new Error('无法解散磁盘根目录')
  // 源目录必须是父目录的严格子孙，避免把目录移回自身或越界到磁盘根。
  if (!identity(source).startsWith(identity(parent) + path.sep))
    throw new Error('目标父目录无效，无法解散此目录')
  if (signal?.aborted) throw new Error('解散操作已取消')
  const plan = [],
    dirsToDelete = []
  /**
   * 收集待移动项与待删除目录；递归模式只把文件移出，子目录随后删除。
   * @param {string} current 当前遍历目录。
   * @returns {Promise<void>} 收集结束后的 Promise。
   */
  async function collect(current) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (signal?.aborted) throw new Error('解散操作已取消')
      if (entry.isSymbolicLink()) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (recursive) {
          dirsToDelete.push(full)
          await collect(full)
        } else {
          plan.push({ from: full, name: entry.name, isDir: true })
        }
      } else if (entry.isFile()) {
        plan.push({ from: full, name: entry.name, isDir: false })
      }
    }
  }
  await collect(source)
  const moved = [],
    skipped = [],
    errors = [],
    deletedDirs = []
  try {
    for (const item of plan) {
      if (signal?.aborted) throw new Error('解散操作已取消')
      let target = path.join(parent, item.name)
      // 目标与源相同或落入源目录内部都属于越界，直接拒绝并触发回滚。
      if (identity(target) === identity(item.from)) throw new Error(`目标与源相同：${item.name}`)
      if (strategy === 'rename') {
        target = syncFs.existsSync(target) ? uniqueBreakTarget(parent, item.name) : target
      } else if (syncFs.existsSync(target)) {
        if (strategy === 'skip') {
          skipped.push({ from: item.from, name: item.name, isDir: item.isDir })
          continue
        }
        // 覆盖策略先删除同名目标，属于用户显式确认的破坏性操作。
        await fs.rm(target, { recursive: true, force: true })
      }
      await fs.rename(item.from, target)
      moved.push({ from: item.from, to: target, name: path.basename(target), isDir: item.isDir })
    }
    // 移动完成后删除残留目录：递归模式自内向外，单层模式只删源目录。
    if (recursive) dirsToDelete.sort((a, b) => b.length - a.length)
    for (const directory of recursive ? [...dirsToDelete, source] : [source]) {
      try {
        await fs.rmdir(directory)
        deletedDirs.push(directory)
      } catch (error) {
        errors.push({
          path: directory,
          message: error.code === 'ENOTEMPTY' ? '目录非空，未删除' : error.message
        })
      }
    }
  } catch (failure) {
    // 任何移动或覆盖失败都按逆序把已完成项移回原位，尽量恢复原始结构。
    const restoreErrors = []
    for (const item of [...moved].reverse()) {
      try {
        await fs.rename(item.to, item.from)
      } catch (error) {
        restoreErrors.push(`${item.from}（${error.message}）`)
      }
    }
    const note = strategy === 'overwrite' ? '；覆盖策略下已删除的同名项无法恢复' : ''
    if (restoreErrors.length)
      throw new Error(
        `${failure.message}；回滚未完成，需人工恢复：${restoreErrors.join('；')}${note}`
      )
    throw new Error(`${failure.message}${note}`)
  }
  return { moved, deletedDirs, skipped, errors }
}

/**
 * 按解散记录把已移动项移回原位，并重建被删除的空目录；原路径被占用时跳过并汇总。
 * @param {{moved?: object[], deletedDirs?: string[]}} record 解散结果记录。
 * @param {AbortSignal} [signal] 必要任务的取消信号。
 * @returns {Promise<{restored: object[], errors: object[]}>} 已恢复项与失败明细。
 * @throws {Error} 记录无效或任务被取消时抛出。
 */
async function undoBreak(record, signal) {
  if (!record || !Array.isArray(record.moved)) throw new Error('撤销记录无效')
  const restored = [],
    errors = []
  // 先自浅入深重建被删除的目录，保证文件回迁时的父路径存在。
  for (const directory of [...(record.deletedDirs || [])].sort((a, b) => a.length - b.length)) {
    if (signal?.aborted) throw new Error('撤销已取消')
    try {
      await fs.mkdir(directory, { recursive: true })
    } catch (error) {
      errors.push({ path: directory, message: error.message })
    }
  }
  // 再按记录的逆序把文件与子项移回原位，原位被占用时保留现状并记录。
  for (const item of [...record.moved].reverse()) {
    if (signal?.aborted) throw new Error('撤销已取消')
    try {
      if (!item?.from || !item?.to) throw new Error('记录项无效')
      await fs.lstat(item.to)
      if (syncFs.existsSync(item.from)) {
        errors.push({ path: item.from, message: '原路径已被占用，已跳过' })
        continue
      }
      await fs.mkdir(path.dirname(item.from), { recursive: true })
      await fs.rename(item.to, item.from)
      restored.push({ from: item.to, to: item.from, name: path.basename(item.from) })
    } catch (error) {
      errors.push({ path: item?.from || '', message: error.message })
    }
  }
  return { restored, errors }
}

/**
 * 为当前工具会话建立文件操作与 Everything 查询桥接。
 * @param {object} lifecycle 当前工具的资源作用域。
 * @returns {object} 有限的文件与本地搜索操作。
 */
function createFilesBridge(lifecycle) {
  let worker,
    lines,
    stderr = '',
    nextId = 0,
    stopped = false,
    closing = null
  const pending = new Map()
  /**
   * 释放本会话的查询进程和所有待处理回调，不停止用户 Everything。
   * @returns {Promise<void>} 子进程关闭后的 Promise。
   */
  async function dispose() {
    if (stopped) return
    stopped = true
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(new Error('搜索已取消'))
    }
    pending.clear()
    lines?.close()
    if (worker && worker.exitCode === null) {
      const child = worker
      const closed = new Promise((resolve) => child.once('close', resolve))
      child.stdin.end()
      child.kill()
      await closed
    }
    worker = undefined
    lines = undefined
    stderr = ''
  }
  /**
   * 子组件切换时关闭查询进程，后续重新进入可以创建新会话。
   * @returns {Promise<void>} 当前进程彻底退出后的 Promise。
   */
  function stopSearch() {
    if (closing) return closing
    closing = dispose().finally(() => {
      if (!lifecycle.signal.aborted) stopped = false
      closing = null
    })
    return closing
  }
  lifecycle.addCleanup(stopSearch)
  /**
   * 惰性启动查询桥接，命令数据通过 stdin JSON 传入，不拼接 shell。
   * @param {object} request 检测或搜索参数。
   * @returns {Promise<object>} 检测状态或搜索结果。
   */
  async function everything(request) {
    if (closing) await closing
    if (stopped || lifecycle.signal.aborted) return Promise.reject(new Error('工具已退出'))
    if (process.platform !== 'win32')
      return Promise.resolve({
        state: 'unsupported',
        message: 'Everything 本地搜索仅支持 Windows',
        items: []
      })
    if (!worker) {
      worker = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(__dirname, 'everything-bridge.ps1')
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      lines = createInterface({ input: worker.stdout })
      worker.stderr.on('data', (data) => {
        stderr = (stderr + data).slice(-3000)
      })
      lines.on('line', (line) => {
        try {
          const response = JSON.parse(line),
            item = pending.get(response.id)
          if (!item) return
          clearTimeout(item.timer)
          pending.delete(response.id)
          if (response.error) item.reject(new Error(response.error))
          else item.resolve(response)
        } catch {
          /* 忽略 PowerShell 的非协议输出，超时会给出明确错误。 */
        }
      })
      worker.once('error', (error) => {
        for (const item of pending.values()) {
          clearTimeout(item.timer)
          item.reject(error)
        }
        pending.clear()
      })
      worker.once('close', () => {
        for (const item of pending.values()) {
          clearTimeout(item.timer)
          item.reject(new Error(stderr || 'Everything 查询进程已退出'))
        }
        pending.clear()
        worker = undefined
        lines?.close()
        lines = undefined
      })
      worker.stdin.on('error', () => {})
    }
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('Everything 响应超时，请检查索引和权限'))
        void stopSearch()
      }, 15000)
      pending.set(id, { resolve, reject, timer })
      worker.stdin.write(JSON.stringify({ ...request, id }) + '\n')
    })
  }
  return {
    inspect: inspectFiles,
    validate: validateRenames,
    /**
     * 对当前前台预览进行可取消的只读文件检查。
     * @param {object[]} entries 预览计划。
     * @returns {Promise<object>} 逐行错误。
     */
    review: (entries) => reviewRenames(entries, lifecycle.signal),
    /**
     * 将已确认的预览交给文件事务并使用工具私有恢复目录。
     * @param {object[]} entries 已确认文件计划。
     * @param {AbortSignal} signal 必要任务取消信号。
     * @returns {Promise<object[]>} 改名结果。
     */
    rename: (entries, signal) =>
      renameBatch(
        entries,
        path.join(window.tabdo.getPath('pluginData'), 'rename-recovery'),
        signal
      ),
    everything,
    stopSearch,
    preview: previewFile,
    /**
     * 统计待解散目录的规模与类型分布，供执行前预览。
     * @param {string} dir 待解散的目录绝对路径。
     * @param {{recursive?: boolean}} [options] 是否递归统计。
     * @param {AbortSignal} [signal] 只读扫描的取消信号。
     * @returns {Promise<object>} 文件、目录、大小与类型统计。
     */
    scanBreakTarget: (dir, options, signal) => scanBreakTarget(dir, options, signal),
    /**
     * 解散目录，把内容移到父目录并删除清空后的目录。
     * @param {string} dir 待解散的目录绝对路径。
     * @param {{recursive?: boolean, conflictStrategy?: string}} [options] 解散参数。
     * @param {AbortSignal} [signal] 必要任务的取消信号。
     * @returns {Promise<object>} 移动、删除、跳过与失败明细。
     */
    breakDirectory: (dir, options, signal) => breakDirectory(dir, options, signal),
    /**
     * 按解散记录把已移动项移回原位并重建空目录。
     * @param {object} record 解散结果记录。
     * @param {AbortSignal} [signal] 必要任务的取消信号。
     * @returns {Promise<object>} 恢复项与失败明细。
     */
    undoBreak: (record, signal) => undoBreak(record, signal)
  }
}
module.exports = {
  readImage,
  inspectFiles,
  validateRenames,
  reviewRenames,
  renameBatch,
  createFilesBridge,
  previewFile,
  scanBreakTarget,
  breakDirectory,
  undoBreak
}
