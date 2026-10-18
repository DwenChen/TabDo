import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { getPluginsPath } from './appData/appDataPaths'
import { getAppBundlePath } from '../utils/appBundlePath'
import { physicalFs } from '../utils/physicalFs'
import { removePluginArtifact, resolvePluginStorageKind } from '../utils/pluginStorage'

const require = createRequire(import.meta.url)
let workerStarted = false

/**
 * 删除安装实体；Windows 锁定的版本化 ASAR 交给退出后清理任务处理。
 * @param plugin 待卸载插件的路径、存储类型和开发状态。
 * @returns 安装包需要等待宿主退出时返回 true，已删除时返回 false。
 * @throws {Error} 非文件占用错误、路径越界或无法准备清理任务时抛出错误。
 */
export async function removePluginArtifactOrDefer(plugin: {
  path: string
  storageKind?: unknown
  isDevelopment?: boolean
}): Promise<boolean> {
  try {
    await removePluginArtifact(plugin)
    return false
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // 只延后 Electron 已加载归档的文件占用问题；普通权限错误和目录删除失败照常报告。
    if (
      process.platform !== 'win32' ||
      !['EBUSY', 'EPERM'].includes(code || '') ||
      plugin.isDevelopment ||
      resolvePluginStorageKind(plugin) !== 'asar'
    )
      throw error
    const root = path.resolve(getPluginsPath())
    const artifact = path.resolve(plugin.path)
    if (path.dirname(artifact) !== root || !artifact.endsWith('.asar')) throw error

    // 每个任务独立落盘，避免并发卸载互相覆盖；ASAR 安装名包含版本和唯一安装标识。
    const queue = path.join(root, '.pending-removals')
    await physicalFs.promises.mkdir(queue, { recursive: true })
    const job = path.join(queue, `${randomUUID()}.json`)
    await physicalFs.promises.writeFile(job, JSON.stringify({ artifact: path.basename(artifact) }))
    try {
      if (!workerStarted) {
        const child = spawn(
          process.execPath,
          [getAppBundlePath('resources', 'plugin-cleanup-worker.cjs'), root, String(process.pid)],
          {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            detached: true,
            windowsHide: true,
            stdio: 'ignore'
          }
        )
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })
        workerStarted = true
        child.once('exit', () => {
          workerStarted = false
        })
        child.unref()
      }
    } catch (cause) {
      // 后台任务未能启动时撤回登记，由调用方保留插件记录供重试。
      await physicalFs.promises.rm(job, { force: true })
      throw cause
    }
    return true
  }
}

/**
 * 在任何第三方插件装载前补清理上次退出未完成的任务。
 * @returns 本轮清理完成后的 Promise；失败记录保留供下次启动重试。
 */
export async function cleanupPendingPluginArtifacts(): Promise<void> {
  try {
    const worker = require(getAppBundlePath('resources', 'plugin-cleanup-worker.cjs')) as {
      drain: (root: string) => Promise<void>
    }
    await worker.drain(getPluginsPath())
  } catch (error) {
    // 清理失败不阻断启动，队列仍可由后台任务或下一次启动接续处理。
    console.error('[PluginCleanup] 补清理失败:', error)
  }
}
