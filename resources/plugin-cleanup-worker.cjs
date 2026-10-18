const path = require('node:path')
const fs = process.versions.electron ? require('original-fs') : require('node:fs')

/**
 * 清理已卸载且登记到队列的 ASAR，仅允许删除插件根目录中的独立包及其 sidecar。
 * @param {string} pluginsRoot 插件安装根目录。
 * @returns {Promise<void>} 本轮可清理任务完成后的 Promise；失败任务保留供下次重试。
 * @throws {Error} 无法访问清理队列时抛出错误。
 */
async function drain(pluginsRoot) {
  const root = path.resolve(pluginsRoot)
  const queue = path.join(root, '.pending-removals')
  let entries
  try {
    entries = await fs.promises.readdir(queue)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const job = path.join(queue, entry)
    try {
      const { artifact } = JSON.parse(await fs.promises.readFile(job, 'utf8'))
      // 队列不能表达绝对路径、子目录或开发项目，防止越界删除或误删重装的新包。
      if (
        typeof artifact !== 'string' ||
        artifact.includes('/') ||
        artifact.includes('\\') ||
        artifact.includes('\0') ||
        artifact.includes(':') ||
        !artifact.endsWith('.asar') ||
        path.basename(artifact) !== artifact
      )
        continue
      const target = path.resolve(root, artifact)
      if (path.dirname(target) !== root) continue
      const options = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }
      await fs.promises.rm(target, options)
      await fs.promises.rm(target + '.unpacked', options)
      await fs.promises.rm(job, { force: true })
    } catch (error) {
      // 保留尚未完成的任务，下一次启动继续处理，不能静默丢弃残留包。
      console.error('[PluginCleanup] 清理失败:', entry, error.message)
    }
  }
  try {
    await fs.promises.rmdir(queue)
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error
  }
}

/**
 * 等待锁定 ASAR 的宿主进程完全退出后，完成已经授权的插件包清理。
 * @param {string} pluginsRoot 插件安装根目录。
 * @param {number} parentPid 宿主进程标识。
 * @returns {Promise<void>} 宿主退出并完成本轮清理后的 Promise。
 * @throws {Error} 参数无效或无法确认宿主退出时抛出错误。
 */
async function main(pluginsRoot, parentPid) {
  if (!pluginsRoot || !Number.isSafeInteger(parentPid) || parentPid <= 0) {
    throw new Error('无效的插件清理参数')
  }
  // 不结束宿主、不触发重启；仅等待其自然退出以释放 Electron 的归档缓存句柄。
  for (;;) {
    try {
      process.kill(parentPid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') break
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await drain(pluginsRoot)
}

module.exports = { drain }
if (require.main === module) {
  main(process.argv[2], Number(process.argv[3])).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
