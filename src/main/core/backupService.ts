import { app, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { getZToolsRoot } from './appData/appDataPaths'
import { getAppBundlePath } from '../utils/appBundlePath'
import lmdbInstance from './lmdb/lmdbInstance'
import databaseAPI from '../api/shared/database'
import windowManager from '../managers/windowManager'
import { requireInternalPlugin } from '../api/plugin/internal'
import type { PluginManager } from '../managers/pluginManager'

/** 应用恢复归档中指向旧根目录的路径，插件数据内容保持原样。
 * @returns 无返回值。
 */
export function applyBackupMigration(): void {
  const marker = path.join(getZToolsRoot(), '.migration.json')
  if (!fs.existsSync(marker)) return
  const manifest = JSON.parse(fs.readFileSync(marker, 'utf8'))
  const mappings = [
    { source: manifest.sourceRoot, target: getZToolsRoot() },
    ...manifest.externalPlugins.map((item: { source: string; target: string }) => ({
      source: item.source,
      target: path.join(getZToolsRoot(), item.target)
    }))
  ]
  /** 递归重定位宿主配置中的绝对路径。
   * @param value 宿主配置值。
   * @returns 重定位后的值。
   */
  function relocate(value: any): any {
    if (typeof value === 'string') {
      for (const mapping of mappings) {
        for (const [source, target] of [
          [mapping.source, mapping.target],
          [pathToFileURL(mapping.source).href, pathToFileURL(mapping.target).href]
        ]) {
          if (
            value === source ||
            value.startsWith(source + '/') ||
            value.startsWith(source + '\\')
          ) {
            return (
              target +
              (source.startsWith('file:')
                ? value.slice(source.length).replaceAll('\\', '/')
                : value.slice(source.length).replace(/[\\/]/g, path.sep))
            )
          }
        }
      }
    }
    if (Array.isArray(value)) return value.map(relocate)
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, relocate(v)]))
    return value
  }
  // 仅改写宿主路径配置，第三方插件的任意文档数据完整保留。
  for (const doc of lmdbInstance.allDocs('ZTOOLS/')) {
    const next = relocate(doc.data)
    if (JSON.stringify(next) !== JSON.stringify(doc.data)) lmdbInstance.put({ ...doc, data: next })
  }
  fs.rmSync(marker)
}

/** 注册仅向内置设置插件开放的离线备份任务。
 * @param manager 插件权限管理器。
 * @returns 无返回值。
 */
export function initBackupService(manager: PluginManager): void {
  let busy = false
  ipcMain.handle('internal:backup-result', (event) => {
    if (!requireInternalPlugin(manager, event)) throw new Error('无备份权限')
    const resultFile = path.join(getZToolsRoot(), '.backup-result.json')
    if (!fs.existsSync(resultFile)) return null
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
    fs.rmSync(resultFile)
    return result
  })
  ipcMain.handle('internal:backup-run', async (event, action: string) => {
    if (!requireInternalPlugin(manager, event)) throw new Error('无备份权限')
    if (!['export', 'restore'].includes(action) || busy) throw new Error('备份任务无效或正在执行')
    busy = true
    try {
      const root = path.resolve(getZToolsRoot())
      const selection =
        action === 'export'
          ? await dialog.showSaveDialog({
              title: '导出完整数据备份',
              defaultPath: `ZTools-1.0.0-${Date.now()}.ztbackup`,
              filters: [{ name: 'ZTools 数据备份', extensions: ['ztbackup'] }]
            })
          : await dialog.showOpenDialog({
              title: '选择要恢复的备份',
              properties: ['openFile'],
              filters: [{ name: 'ZTools 数据备份', extensions: ['ztbackup'] }]
            })
      if (selection.canceled) return { cancelled: true }
      const file = 'filePath' in selection ? selection.filePath : selection.filePaths[0]
      if (!file) return { cancelled: true }
      if (path.resolve(file).startsWith(root + path.sep))
        throw new Error('请选择数据目录之外的文件')
      const confirmed = await dialog.showMessageBox({
        type: 'question',
        title: '数据备份与迁移',
        message:
          action === 'export'
            ? '应用将退出以生成完整备份，完成后自动重启。'
            : '应用将退出并用备份替换全部本地数据，旧数据保留为回滚副本，完成后自动重启。',
        detail:
          '包含设置、模型密钥、插件、插件数据和本地会话。请妥善保管备份。跨系统迁移后，原生插件可能需要重新安装。',
        buttons: ['继续', '取消'],
        defaultId: 1,
        cancelId: 1
      })
      if (confirmed.response !== 0) return { cancelled: true }
      const plugins = databaseAPI.dbGet('plugins') || []
      const externalPlugins = [
        ...new Set<string>(
          plugins
            .filter(
              (p: any) =>
                !p.isInternal &&
                p.path &&
                !p.path.startsWith(root + path.sep) &&
                !p.path.includes('internal-plugins') &&
                fs.existsSync(p.path)
            )
            .map((p: any) => p.path)
        )
      ]
      const worker = getAppBundlePath('resources', 'backup-worker.cjs')
      const jobFile = path.join(os.tmpdir(), `ztools-backup-${randomUUID()}.json`)
      fs.writeFileSync(
        jobFile,
        JSON.stringify({
          root,
          file,
          action,
          externalPlugins,
          version: app.getVersion(),
          pid: process.pid,
          executable: process.execPath,
          args: app.isPackaged ? [] : [getAppBundlePath('scripts', 'preview-main.cjs')]
        }),
        { mode: 0o600 }
      )
      // 独立进程等待宿主完全退出，所有 LMDB/Chromium 句柄关闭后才读写数据。
      const child = spawn(process.execPath, [worker, jobFile], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      child.unref()
      windowManager.setQuitting(true)
      setTimeout(() => app.quit(), 200)
      return { success: true }
    } finally {
      busy = false
    }
  })
}
