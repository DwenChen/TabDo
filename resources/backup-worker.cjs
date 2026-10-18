const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const AdmZip = require('adm-zip')
const FORMAT = 'ztools-local-backup'
const LIMIT = 20 * 1024 ** 3
const browserCaches = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache'
])

/** 校验跨平台归档路径，拒绝目录穿越和 Windows 别名。
 * @param {string} name 归档相对路径。
 * @returns {string} 规范相对路径。
 * @throws {Error} 路径不安全时抛错。
 */
function safeName(name) {
  if (!name || name.includes('\\') || name.startsWith('/') || name.includes('\0'))
    throw Error('非法归档路径')
  for (const part of name.split('/')) {
    if (
      !part ||
      part === '.' ||
      part === '..' ||
      /[:<>"|?*]/.test(part) ||
      Array.from(part).some((character) => character.charCodeAt(0) < 32) ||
      /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
      throw Error('非法归档路径: ' + name)
  }
  return name
}

/** 计算文件完整性摘要。
 * @param {Buffer} data 文件数据。
 * @returns {string} SHA-256 摘要。
 */
function digest(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/** 收集持久化文件，排除缓存和进程锁；拒绝符号链接以避免备份越界。
 * @param {string} dir 源目录。
 * @param {string} prefix 归档前缀。
 * @param {Array} result 收集结果。
 * @returns {void} 无返回值。
 * @throws {Error} 遇到符号链接或不安全路径时抛错。
 */
function collect(dir, prefix, result) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const browserRoot = prefix === 'data' || /^data\/Partitions\/[^/]+$/.test(prefix)
    if (browserRoot && (browserCaches.has(entry.name) || entry.name.startsWith('Singleton')))
      continue
    if (
      prefix === 'data' &&
      ['temp', 'logs', 'lockfile', '.backup-result.json'].includes(entry.name)
    )
      continue
    if (prefix.startsWith('data/lmdb/') && entry.name === 'lock.mdb') continue
    if (prefix.startsWith('data/Partitions/') && entry.name === 'LOCK') continue
    const source = path.join(dir, entry.name),
      relative = safeName(prefix + '/' + entry.name)
    if (entry.isSymbolicLink()) throw Error('请先移除数据目录中的符号链接: ' + source)
    if (entry.isDirectory()) collect(source, relative, result)
    else if (entry.isFile()) result.push({ source, relative })
  }
}

/** 原子创建包含校验清单的完整备份。
 * @param {object} job 备份任务。
 * @returns {void} 无返回值。
 * @throws {Error} 文件过大、归档失败或目标处于数据根目录时抛错。
 */
function createBackup(job) {
  const root = path.resolve(job.root),
    output = path.resolve(job.file)
  if (output === root || output.startsWith(root + path.sep))
    throw Error('备份文件必须位于数据目录之外')
  const zip = new AdmZip(),
    files = [],
    entries = [],
    mappings = []
  collect(root, 'data', files)
  const migrationId = crypto.randomUUID()
  for (const [index, source] of (job.externalPlugins || []).entries()) {
    const prefix = 'external-plugins/' + index
    collect(source, prefix, files)
    mappings.push({ source, target: 'plugins/migrated-' + migrationId + '-' + index })
  }
  let total = 0
  for (const item of files) {
    total += fs.statSync(item.source).size
    if (total > LIMIT) throw Error('备份超过 20 GiB，请先整理数据')
    const data = fs.readFileSync(item.source)
    entries.push({ path: item.relative, size: data.length, sha256: digest(data) })
    zip.addFile(item.relative, data, '', fs.statSync(item.source).mode)
  }
  const manifest = {
    format: FORMAT,
    schema: 1,
    version: job.version,
    platform: process.platform,
    createdAt: new Date().toISOString(),
    sourceRoot: root,
    externalPlugins: mappings,
    entries
  }
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)))
  const temporary = output + '.partial'
  try {
    zip.writeZip(temporary)
    fs.renameSync(temporary, output)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

/** 完整校验归档，任何异常都发生在当前数据被替换之前。
 * @param {string} file 备份文件。
 * @param {string} [destination] 可选解压目标，必须是新的暂存目录。
 * @returns {object} 备份清单。
 * @throws {Error} 格式、大小、路径、校验和无效时抛错。
 */
function inspectBackup(file, destination) {
  const zip = new AdmZip(file),
    entries = zip.getEntries(),
    seen = new Set()
  const header = zip.getEntry('manifest.json')
  if (!header || header.header.size > 25 * 1024 ** 2) throw Error('备份清单缺失或过大')
  const manifest = JSON.parse(header.getData().toString('utf8'))
  if (
    manifest.format !== FORMAT ||
    manifest.schema !== 1 ||
    !Array.isArray(manifest.entries) ||
    typeof manifest.sourceRoot !== 'string'
  )
    throw Error('不支持的备份格式')
  if (
    !Array.isArray(manifest.externalPlugins) ||
    manifest.externalPlugins.some(
      (m) => typeof m.source !== 'string' || !/^plugins\/migrated-[a-f0-9-]+-\d+$/.test(m.target)
    )
  )
    throw Error('插件迁移清单无效')
  const targets = manifest.externalPlugins.map((m) => safeName(m.target).toLowerCase())
  if (
    new Set(targets).size !== targets.length ||
    manifest.entries.some((entry) =>
      targets.some((target) => entry.path.toLowerCase().startsWith('data/' + target + '/'))
    )
  )
    throw Error('插件迁移路径冲突')
  const expected = new Map()
  for (const entry of manifest.entries) {
    const name = safeName(entry.path),
      key = name.toLowerCase()
    if (
      expected.has(key) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw Error('备份清单条目无效')
    expected.set(key, entry)
  }
  let total = 0
  for (const entry of entries) {
    if (entry.isDirectory) throw Error('备份包含未声明的目录条目')
    const name = safeName(entry.entryName),
      key = name.toLowerCase()
    if (seen.has(key)) throw Error('备份含重复路径')
    seen.add(key)
    if (name === 'manifest.json') continue
    const info = expected.get(key)
    if (!info || info.path !== name || !/^(data\/|external-plugins\/\d+\/)/.test(name))
      throw Error('备份含未声明文件')
    total += entry.header.size
    if (entry.header.size !== info.size || total > LIMIT) throw Error('备份大小校验失败')
    const data = entry.getData()
    if (data.length !== info.size || digest(data) !== info.sha256)
      throw Error('备份文件已损坏: ' + name)
    if (destination) {
      let relative = name.slice(5)
      if (name.startsWith('external-plugins/')) {
        const match = /^external-plugins\/(\d+)\/(.+)$/.exec(name)
        const mapping = manifest.externalPlugins[Number(match[1])]
        if (!mapping) throw Error('外部插件清单缺失')
        relative = mapping.target + '/' + match[2]
      }
      const target = path.join(destination, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, data, { mode: (entry.attr >>> 16) & 0o777 || 0o600 })
    }
  }
  if (
    seen.size !== expected.size + 1 ||
    !seen.has('data/lmdb/device/data.mdb') ||
    !seen.has('data/lmdb/accounts/default/data.mdb')
  )
    throw Error('备份文件不完整')
  return manifest
}

/** 在已退出的应用数据目录上执行恢复，保留可手动恢复的旧目录。
 * @param {object} job 恢复任务。
 * @returns {string} 回滚副本目录。
 * @throws {Error} 校验或文件替换失败时抛错并回滚。
 */
function restoreBackup(job) {
  const root = path.resolve(job.root),
    staging = root + '.restore-' + crypto.randomUUID(),
    rollback = root + '.rollback-' + Date.now()
  try {
    fs.mkdirSync(staging)
    const manifest = inspectBackup(job.file, staging)
    fs.writeFileSync(path.join(staging, '.migration.json'), JSON.stringify(manifest))
    // 校验全部完成后才发布新数据；同卷重命名确保失败时能够回滚。
    if (fs.existsSync(root)) fs.renameSync(root, rollback)
    try {
      fs.renameSync(staging, root)
    } catch (error) {
      if (fs.existsSync(rollback)) fs.renameSync(rollback, root)
      throw error
    }
    return rollback
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/** 等待应用完全退出后处理任务，再启动同一个应用。
 * @param {object} job 已由主进程保存的任务。
 * @returns {Promise<void>} 任务完成后的 Promise。
 */
async function run(job) {
  let alive = true
  while (alive) {
    try {
      process.kill(job.pid, 0)
      await new Promise((resolve) => setTimeout(resolve, 200))
    } catch {
      alive = false
    }
  }
  let result
  try {
    const rollback = job.action === 'restore' ? restoreBackup(job) : (createBackup(job), undefined)
    result = { success: true, action: job.action, file: job.file, rollback }
  } catch (error) {
    result = { success: false, action: job.action, error: error.message }
  }
  fs.mkdirSync(job.root, { recursive: true })
  fs.writeFileSync(path.join(job.root, '.backup-result.json'), JSON.stringify(result))
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  spawn(job.executable, job.args || [], {
    detached: true,
    stdio: 'ignore',
    env: environment,
    windowsHide: true
  }).unref()
}

module.exports = { createBackup, inspectBackup, restoreBackup, safeName }
if (require.main === module) {
  const jobFile = process.argv[2],
    job = JSON.parse(fs.readFileSync(jobFile, 'utf8'))
  fs.rmSync(jobFile, { force: true })
  run(job).catch((error) => {
    fs.writeFileSync(jobFile + '.error', String(error))
    process.exitCode = 1
  })
}
