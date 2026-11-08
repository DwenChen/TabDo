import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { shell } from '@tabdo/presentation-electron'

const execute = promisify(execFile)

/**
 * 调用 Windows 回收引擎且禁止提权和永久删除。
 * @param bundle 当前删除事务的绝对暂存目录。
 * @returns 系统确认回收操作完成后的 Promise。
 * @throws 系统拒绝回收、文件被占用、不可回收或辅助进程失败时抛错，由调用方恢复原件。
 */
async function recycleWindowsBundle(bundle: string): Promise<void> {
  // 目录只通过子进程环境传递，不能拼接为 PowerShell 命令；进程归当前宿主会话追踪。
  const result = await execute(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Sta',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__TABDO_PRESENTATION_HOST__.nativeRoot, 'recycle.ps1')
    ],
    {
      windowsHide: true,
      timeout: 20000,
      encoding: 'utf8',
      env: { ...process.env, TABDO_RECORDING_TRASH_PATH: bundle }
    }
  )
  const status = JSON.parse(result.stdout.trim()) as {
    success: boolean
    hresult?: string
    message?: string
  }
  if (!status.success) {
    const cause = ['0x80070020', '0x80070021', '0x80270027', '0x80270028'].includes(
      status.hresult ?? ''
    )
      ? '素材正在被其他程序使用，请关闭占用后重试'
      : ['0x80070005', '0x80270021', '0x80270022'].includes(status.hresult ?? '')
        ? 'Windows 回收引擎拒绝访问素材目录或回收站'
        : '系统未能将素材移入回收站'
    throw Object.assign(
      new Error(`${cause}（${status.hresult ?? '未知错误'}）`),
      { code: status.hresult }
    )
  }
}

/**
 * 将录制包移入系统回收站，源安全检查拒绝时改用用户临时目录中的新副本。
 * @param bundle 已由素材库校验的当前删除事务目录。
 * @returns 回收成功且原暂存包清理完成后的 Promise。
 * @throws 不可回收、复制失败或目标回收失败时保留原暂存包并抛错供调用方恢复。
 */
export async function recycleRecordingBundle(bundle: string): Promise<void> {
  if (process.platform !== 'win32') return shell.trashItem(bundle)
  try {
    await recycleWindowsBundle(bundle)
    return
  } catch (error) {
    // 仅针对 Shell 源访问拒绝回退；占用、用户取消及不可回收错误不绕过。
    if (!['0x80270021', '0x80070005'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw error
  }

  const owned = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-recording-recycle-'))
  let recycled = false
  try {
    const entries = await fs.readdir(bundle, { withFileTypes: true })
    for (const entry of entries) {
      // 所属录制包只能包含普通文件，不跟随链接，不改写原素材权限。
      if (!entry.isFile()) throw new Error('录制回收包包含非普通文件，原件已保留')
      const source = path.join(bundle, entry.name)
      const destination = path.join(owned, entry.name)
      const before = await fs.stat(source)
      await fs.copyFile(source, destination, constants.COPYFILE_EXCL)
      await fs.chmod(destination, 0o600)
      const [after, copied] = await Promise.all([fs.stat(source), fs.stat(destination)])
      if (
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        copied.size !== before.size
      ) {
        throw new Error('素材在回收准备期间发生变化，原件已保留')
      }
    }
    // 新副本继承用户临时目录权限；系统确认可恢复的回收成功前不移除原件。
    await recycleWindowsBundle(owned)
    recycled = true
    await fs.rm(bundle, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 })
  } finally {
    // 失败只清理本次创建的副本，原暂存包仍供上层完整恢复。
    if (!recycled) await fs.rm(owned, { recursive: true, force: true })
  }
}
