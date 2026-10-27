import fs from 'node:fs/promises'
import { ipcMain, BrowserWindow } from './tabdo-electron'
import { registerProjectHandlers } from './ipc/register/project'
import { registerExportHandlers } from './ipc/register/export'
import { registerRecordingHandlers } from './ipc/register/recording'
import { registerSettingsHandlers } from './ipc/register/settings'
import { registerAssetHandlers } from './ipc/register/assets'
import { registerSourceHandlers } from './ipc/register/sources'
import { registerCapturePickerHandlers } from './ipc/register/capturePicker'
import { registerPermissionHandlers } from './ipc/register/permissions'
import { registerCaptionHandlers } from './ipc/register/captions'
import { ensureMediaServer, closeMediaServer } from './mediaServer'
import { stopCursorCapture } from './ipc/cursor/telemetry'
import { stopInteractionCapture } from './ipc/cursor/interaction'
import { stopWindowBoundsCapture } from './ipc/cursor/bounds'
import { stopNativeCursorMonitor } from './ipc/cursor/monitor'
import { cleanupAllExportStreams } from './ipc/export/exportStream'
import { cleanupNativeVideoExportSessions } from './ipc/export/native-video'
import { loadProjectFromPath } from './ipc/project/manager'
import { currentProjectPath, setCurrentProjectPath, setCurrentVideoPath,
  setCurrentRecordingSession, windowsCaptureProcess, nativeCaptureProcess } from './ipc/state'
import { createSourceSelectorWindow, getSourceSelectorWindow, openEditor } from './windows'
import { RECORDINGS_DIR } from './appPaths'
import { releaseWindowsCaptureWorker } from './ipc/windowsCaptureWorker'

/**
 * 初始化当前演示录屏的录制、项目和导出能力。
 * @returns 完成资源准备后的 Promise。
 */
export async function initialize() {
  await fs.mkdir(RECORDINGS_DIR, { recursive: true })
  await ensureMediaServer()
  const { pickSourceList } = registerSourceHandlers({ createEditorWindow: openEditor,
    createSourceSelectorWindow, getSourceSelectorWindow })
  registerCapturePickerHandlers({ pickSourceList })
  registerRecordingHandlers()
  registerSettingsHandlers()
  registerAssetHandlers()
  registerExportHandlers()
  registerProjectHandlers()
  registerPermissionHandlers()
  registerCaptionHandlers()
  ipcMain.handle('tabdo-open-project', async (_event, file: string) => {
    const result = await loadProjectFromPath(file)
    if (result.success) openEditor()
    return result
  })
  ipcMain.handle('tabdo-get-project-path', () => currentProjectPath)
  const file = __TABDO_PRESENTATION_HOST__.file
  if (file) {
    const result = await loadProjectFromPath(file)
    if (!result.success) throw new Error(result.message || '无法读取演示项目')
  }
}

/**
 * 停止当前会话的采样、原生捕获和导出，释放端口及图像引用。
 * @returns 清理完成后的 Promise；持久项目与录制文件保留。
 */
export async function dispose() {
  stopCursorCapture()
  stopInteractionCapture()
  stopWindowBoundsCapture()
  await releaseWindowsCaptureWorker()
  await stopNativeCursorMonitor()
  windowsCaptureProcess?.stdin?.write('stop\n')
  nativeCaptureProcess?.stdin?.write('stop\n')
  cleanupAllExportStreams()
  await cleanupNativeVideoExportSessions()
  await closeMediaServer()
  setCurrentProjectPath(null)
  setCurrentVideoPath(null)
  setCurrentRecordingSession(null)
}
