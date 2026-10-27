/** 所有上游 Electron 能力均由宿主按当前会话注入，禁止访问其他工具窗口。 */
export const { app, BrowserWindow, ipcMain, shell, dialog, screen, desktopCapturer,
  nativeImage, systemPreferences, clipboard, nativeTheme, session, webContents,
  powerSaveBlocker, contextBridge, ipcRenderer } = __TABDO_PRESENTATION_HOST__.electron
