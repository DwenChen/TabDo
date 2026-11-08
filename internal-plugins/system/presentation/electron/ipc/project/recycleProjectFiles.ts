import fs from 'node:fs/promises'
import path from 'node:path'
import { recycleRecordingBundle } from '../recording/recycle'

/**
 * 将已验证项目及附属文件作为一个事务回收，不检查或触碰其引用素材。
 * @param files 本项目的项目文件、缩略图和备份文件。
 * @param recycle 系统回收入口，可在测试中注入失败。
 * @returns 全部回收完成后的 Promise。
 * @throws 回收或暂存失败时恢复原件后抛错。
 */
export async function recycleProjectFiles(files: string[], recycle = recycleRecordingBundle): Promise<void> {
  const stage = await fs.mkdtemp(path.join(path.dirname(files[0]), '.tabdo-project-trash-'))
  const moved: Array<{ source: string; target: string }> = []
  try {
    // 仅移动本次项目及其明确附属文件，不依赖视频是否仍存在。
    for (const source of files) {
      try {
        await fs.lstat(source)
      } catch (error) {
        if (source !== files[0] && (error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      const target = path.join(stage, path.basename(source))
      await fs.rename(source, target)
      moved.push({ source, target })
    }
    await recycle(stage)
  } catch (error) {
    // 回收失败不退化为永久删除；已暂存文件按原路径恢复。
    for (const item of moved.reverse()) await fs.rename(item.target, item.source)
    throw error
  } finally { await fs.rmdir(stage).catch(() => undefined) }
}
