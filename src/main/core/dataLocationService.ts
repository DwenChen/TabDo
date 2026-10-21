import { app, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { getTabDoRoot, getTabDoBootstrapRoot } from './appData/appDataPaths'
import { getAppBundlePath } from '../utils/appBundlePath'
import { requireInternalPlugin } from '../api/plugin/internal'
import type { PluginManager } from '../managers/pluginManager'
import windowManager from '../managers/windowManager'

/**
 * 向设置插件提供目录查看、选择和退出后的完整资料迁移。
 * @param manager 宿主插件权限管理器。
 * @returns 无返回值。
 */
export function initDataLocationService(manager: PluginManager): void {
  let busy = false
  ipcMain.handle('internal:data-location-get', (event) => {
    if (!requireInternalPlugin(manager, event)) throw new Error('无目录设置权限')
    const root = getTabDoRoot(),
      resultFile = path.join(root, '.data-location-result.json')
    return {
      root,
      result: fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : null
    }
  })
  ipcMain.handle('internal:data-location-choose', async (event) => {
    if (!requireInternalPlugin(manager, event)) throw new Error('无目录设置权限')
    const result = await dialog.showOpenDialog({
      title: '选择新的数据与缓存目录（空文件夹）',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('internal:data-location-move', async (event, target: string) => {
    if (!requireInternalPlugin(manager, event)) throw new Error('无目录设置权限')
    if (busy) throw new Error('目录迁移正在准备')
    busy = true
    let prepared = false
    try {
      const source = getTabDoRoot()
      const worker = getAppBundlePath('resources', 'data-location-worker.cjs')
      const validate = createRequire(path.join(app.getAppPath(), 'package.json'))(
        worker
      ).validateDestination
      validate(source, target)
      const confirmation = await dialog.showMessageBox({
        type: 'question',
        title: '迁移数据与缓存目录',
        message: '应用将退出，迁移并校验全部配置、插件和缓存后自动重启。',
        detail: `原目录将保留作备份：${source}\n新目录：${target}`,
        buttons: ['迁移并重启', '取消'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (confirmation.response !== 0) return { cancelled: true }
      // 在宿主退出前只写任务描述；工作进程等待原进程关闭所有数据句柄后才复制。
      const jobFile = path.join(os.tmpdir(), `tabdo-data-location-${randomUUID()}.json`)
      fs.writeFileSync(
        jobFile,
        JSON.stringify({
          source,
          target,
          anchor: getTabDoBootstrapRoot(),
          pid: process.pid,
          executable: process.execPath,
          cwd: process.cwd(),
          args: app.isPackaged ? [] : [getAppBundlePath('scripts', 'preview-main.cjs')]
        }),
        { mode: 0o600 }
      )
      try {
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
      } catch (error) {
        fs.rmSync(jobFile, { force: true })
        throw error
      }
      windowManager.setQuitting(true)
      prepared = true
      setTimeout(() => app.quit(), 200)
      return { success: true }
    } finally {
      if (!prepared) busy = false
    }
  })
}
