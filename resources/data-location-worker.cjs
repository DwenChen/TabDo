const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')

/**
 * 根据最近的已有父目录解析真实路径，防止目录联接绕过源目标边界。
 * @param {string} directory 候选绝对目录。
 * @returns {string} 规范化的真实目标路径。
 */
function canonical(directory) {
  const missing = []
  let parent = path.resolve(directory)
  while (!fs.existsSync(parent)) {
    missing.unshift(path.basename(parent))
    parent = path.dirname(parent)
  }
  return path.join(fs.realpathSync(parent), ...missing)
}

/**
 * 判断规范化路径是否为同一目录或位于父目录内。
 * @param {string} parent 已解析的父目录。
 * @param {string} child 已解析的候选目录。
 * @returns {boolean} 是否相同或包含。
 */
function contains(parent, child) {
  const relative = path.relative(parent, child)
  return (
    !relative ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  )
}

/**
 * 校验迁移目标，不允许源目标互相嵌套或覆盖已有文件。
 * @param {string} source 当前数据根目录。
 * @param {string} destination 用户选择的新目录。
 * @returns {{source: string, target: string}} 已验证的规范化路径。
 * @throws {Error} 路径不合法、相互嵌套或目标非空时抛错。
 */
function validateDestination(source, destination) {
  if (typeof destination !== 'string' || !path.isAbsolute(destination))
    throw new Error('请选择绝对目录')
  const current = canonical(source),
    target = canonical(destination)
  if (contains(current, target) || contains(target, current))
    throw new Error('新目录不能与当前目录相同或相互包含')
  if (
    fs.existsSync(target) &&
    (!fs.statSync(target).isDirectory() || fs.readdirSync(target).length)
  )
    throw new Error('请选择空文件夹，已有内容不会被覆盖')
  return { source: current, target }
}

/**
 * 以固定大小缓冲读取文件，避免大缓存一次占满内存。
 * @param {string} file 待校验的文件路径。
 * @returns {string} SHA256 内容摘要。
 */
function hashFile(file) {
  const digest = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let size
    while ((size = fs.readSync(fd, buffer))) digest.update(buffer.subarray(0, size))
    return digest.digest('hex')
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * 按原路径复制完整资料并逐文件校验，不跟随符号链接。
 * @param {string} source 源目录。
 * @param {string} destination 本任务独有的暂存目录。
 * @param {boolean} skipLocationRecord 是否跳过资料根的启动位置记录。
 * @returns {number} 校验通过的文件数。
 * @throws {Error} 遇到链接、非普通文件或内容校验失败时抛错。
 */
function copyVerified(source, destination, skipLocationRecord = false) {
  let count = 0
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skipLocationRecord && entry.name === '.data-location.json') continue
    const from = path.join(source, entry.name),
      to = path.join(destination, entry.name)
    if (entry.isSymbolicLink()) throw new Error('数据目录含符号链接，无法完整迁移')
    if (entry.isDirectory()) {
      count += copyVerified(from, to)
      continue
    }
    if (!entry.isFile()) throw new Error('数据目录含不支持的文件')
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL)
    if (hashFile(from) !== hashFile(to)) throw new Error('迁移文件校验失败')
    count++
  }
  return count
}

/**
 * 完成离线迁移；发布目标和位置记录之前，原资料始终保留。
 * @param {{source: string, target: string, anchor: string}} job 迁移目录与启动锚点。
 * @returns {{root: string, previousRoot: string, files: number}} 新旧位置及校验数。
 * @throws {Error} 复制、校验或原子发布失败时抛错。
 */
function relocateData(job) {
  const { source, target } = validateDestination(job.source, job.target)
  const parent = path.dirname(target)
  fs.mkdirSync(parent, { recursive: true })
  const staging = fs.mkdtempSync(path.join(parent, '.tabdo-relocate-'))
  try {
    const files = copyVerified(source, staging, true)
    fs.writeFileSync(
      path.join(staging, '.migration.json'),
      JSON.stringify({ sourceRoot: source, externalPlugins: [] })
    )
    // 最后复核目标；rmdir 仅允许空目录，竞态出现的内容不能被递归删除。
    validateDestination(source, target)
    if (fs.existsSync(target)) fs.rmdirSync(target)
    fs.renameSync(staging, target)
    const configuration = path.join(job.anchor, '.data-location.json')
    const temporary = configuration + '.' + crypto.randomUUID() + '.tmp'
    fs.mkdirSync(job.anchor, { recursive: true })
    fs.writeFileSync(temporary, JSON.stringify({ root: target }), { mode: 0o600 })
    try {
      fs.renameSync(temporary, configuration)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
    return { root: target, previousRoot: source, files }
  } finally {
    // 只清理本任务刚创建且仍位于指定父目录的暂存树，原资料和已发布目标均保留。
    if (path.dirname(staging) !== parent || !path.basename(staging).startsWith('.tabdo-relocate-'))
      throw new Error('暂存清理边界不合法')
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/**
 * 等待宿主及数据库关闭后迁移，再以原启动参数恢复应用。
 * @param {object} job 本任务的离线迁移及重启参数。
 * @returns {Promise<void>} 迁移结果记录并启动新宿主后结束。
 * @throws {Error} 宿主在时限内未退出或迁移结果无法记录时抛错。
 */
async function run(job) {
  const deadline = Date.now() + 120000
  while (true) {
    try {
      process.kill(job.pid, 0)
    } catch {
      break
    }
    if (Date.now() > deadline) throw new Error('应用未能退出，未迁移数据')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  let result
  try {
    result = { success: true, ...relocateData(job) }
  } catch (error) {
    result = { success: false, root: job.source, error: error.message }
  }
  fs.writeFileSync(path.join(result.root, '.data-location-result.json'), JSON.stringify(result))
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.ELECTRON_FORCE_IS_PACKAGED
  if (job.executable)
    spawn(job.executable, job.args || [], {
      cwd: job.cwd,
      env: environment,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref()
}

module.exports = { validateDestination, relocateData, run }
if (require.main === module) {
  const file = process.argv[2],
    job = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file, { force: true })
  run(job).catch((error) => {
    fs.writeFileSync(
      path.join(job.source, '.data-location-result.json'),
      JSON.stringify({ success: false, error: error.message })
    )
    process.exitCode = 1
  })
}
