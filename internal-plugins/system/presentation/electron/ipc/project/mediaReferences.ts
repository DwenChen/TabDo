import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 从项目清单读取素材引用，缺失素材仍保留项目管理与删除能力。
 * @param projectPath 已列入资料库的项目文件。
 * @returns 引用路径与缺失路径；损坏项目返回空引用供独立管理。
 */
export async function readProjectMediaReferences(projectPath: string): Promise<{ mediaPaths: string[]; missingMediaPaths: string[] }> {
  try {
    const project = JSON.parse((await fs.readFile(projectPath, 'utf8')).replace(/^\uFEFF/, ''))
    const raw = [project.videoPath, project.editor?.webcam?.sourcePath,
      ...(project.editor?.audioRegions ?? []).map((item: { audioPath?: string }) => item.audioPath)]
    const mediaPaths = [...new Set(raw.map((value) => typeof value === 'string' && value.trim() ? path.resolve(value.startsWith('file:') ? fileURLToPath(value) : value) : null).filter((value): value is string => Boolean(value)))]
    const missingMediaPaths = (await Promise.all(mediaPaths.map(async (file) => {
      try { await fs.access(file); return null } catch { return file }
    }))).filter((value): value is string => value !== null)
    return { mediaPaths, missingMediaPaths }
  } catch { return { mediaPaths: [], missingMediaPaths: [] } }
}
