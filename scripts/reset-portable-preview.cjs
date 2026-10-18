const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { workspacePath, snapshot, moveWithinWorkspace } = require('./project-maintenance.cjs')

/**
 * 确认目标免安装程序完全退出，避免移动被占用的数据或丢失尚未落盘的配置。
 * @param {string} executable 目标预览可执行文件。
 * @returns {void} 无返回值。
 * @throws {Error} 运行平台不支持检查、进程仍在运行或查询失败时抛出。
 */
function assertStopped(executable) {
  if (process.platform !== 'win32')
    throw new Error('Portable reset requires Windows process validation')
  const query =
    "$target = '" +
    executable.replace(/'/g, "''") +
    "'; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target }).Count"
  const count = Number(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', query], {
      encoding: 'utf8',
      windowsHide: true
    }).trim()
  )
  if (!Number.isFinite(count) || count !== 0)
    throw new Error('请先退出本地免安装预览，再重置配置和插件。')
}

/**
 * 保留程序资源，将预览配置与插件完整迁入私有备份并建立空数据目录。
 * @param {string} root 工作区根目录。
 * @param {string} preview 目标免安装预览目录。
 * @param {Function} checkStopped 对目标程序执行进程占用校验，测试可注入无副作用检查。
 * @returns {Object} 完成状态、备份路径和已验证文件数。
 * @throws {Error} 缺少程序、校验不一致或迁移失败时抛出，并尽可能回滚已移动目录。
 */
function resetProfile(root, preview, checkStopped = assertStopped) {
  workspacePath(root, preview)
  const executable = path.join(preview, 'ZTools.exe')
  if (!fs.existsSync(executable)) throw new Error('Portable preview executable is missing')
  checkStopped(executable)
  const backup = workspacePath(
    root,
    path.join(
      root,
      '.artifacts/backups/portable-profile',
      new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8)
    )
  )
  const before = Object.fromEntries(
    ['data', 'legacy'].map((folder) => [folder, snapshot(path.join(preview, folder))])
  )
  fs.mkdirSync(backup, { recursive: true })
  const moved = []
  const created = []
  try {
    // 先移动完整原件而非删除配置；两个来源和两个备份路径均经工作区边界校验。
    for (const folder of ['data', 'legacy']) {
      const source = workspacePath(root, path.join(preview, folder))
      const destination = workspacePath(root, path.join(backup, folder))
      if (fs.existsSync(source)) {
        moveWithinWorkspace(root, source, destination)
        moved.push({ source, destination })
      }
    }
    const after = Object.fromEntries(
      ['data', 'legacy'].map((folder) => [folder, snapshot(path.join(backup, folder))])
    )
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('Preview backup fingerprint mismatch')
    // 校验通过才创建空目录；下次通过启动器运行时由最新程序生成首次启动默认值。
    for (const folder of ['data', 'legacy']) {
      const target = workspacePath(root, path.join(preview, folder))
      fs.mkdirSync(target)
      created.push(target)
    }
    const result = {
      reset: true,
      backup,
      preservedFiles: Object.values(before).reduce(
        (count, files) => count + Object.keys(files).length,
        0
      ),
      program: 'unchanged'
    }
    fs.writeFileSync(
      path.join(backup, 'manifest.json'),
      JSON.stringify({ ...result, before, after }, null, 2) + '\n'
    )
    return result
  } catch (error) {
    // 只移除本次刚创建且仍为空的目录，随后恢复完整原配置和插件。
    for (const target of created) fs.rmdirSync(workspacePath(root, target))
    for (const item of moved.reverse())
      fs.renameSync(workspacePath(root, item.destination), workspacePath(root, item.source))
    throw error
  }
}

module.exports = { assertStopped, resetProfile }
if (require.main === module) {
  if (process.argv[2] !== '--confirm-reset') {
    console.error(
      '重置会移走预览配置和插件；仅在用户明确授权后运行 pnpm preview:reset --confirm-reset。'
    )
    process.exitCode = 1
  } else {
    try {
      const root = path.resolve(__dirname, '..')
      console.log(JSON.stringify(resetProfile(root, path.join(root, '.local/portable-preview'))))
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
