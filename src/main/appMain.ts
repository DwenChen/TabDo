import { platform } from '@electron-toolkit/utils'
import { app, BrowserWindow, session, webContents, Menu } from 'electron'
import log from 'electron-log'
import { installConsolePipeGuard } from './core/consolePipeGuard'
import path from 'path'
import lmdbInstance from './core/lmdb/lmdbInstance'
import api from './api/index'
import updaterAPI from './api/updater'
import appsAPI from './api/renderer/commands'
import appWatcher from './appWatcher'
import {
  ensureMacAccessibilityPermission,
  focusAccessibilityPermissionWindow,
  isAccessibilityPermissionWindowActive
} from './core/accessibilityPermissionGate'
import {
  handleFirstRunStorageImport,
  isLegacyImportWindowActive
} from './core/firstRunStorageImport'
import httpServer from './core/httpServer'
import { registerIconProtocolForSession, registerIconScheme } from './core/iconProtocol'
import { getLogsPath } from './core/appData/appDataPaths'
import { loadInternalPlugins } from './core/internalPluginLoader'
import { cleanupPendingPluginArtifacts } from './core/pluginArtifactCleanup'
import pluginManager from './managers/pluginManager'
import windowManager from './managers/windowManager'
import clipboardManager from './managers/clipboardManager'
import { stopProviderBridgeHost } from './core/provider/providerBridgeHost'
import { stopRecorder } from './core/screenRecorder'
import { stopWebQuickOpen } from './core/webQuickOpen'
import { stopMedia } from './core/mediaProcessor'

const isE2ETest = process.env.TABDO_E2E === '1'

// 待打开的 .zpx 文件路径（在 app.ready 之前收到的文件打开事件）
let pendingZpxFile: string | null = null
let applicationInitialized = false
let nativeResourcesReleased = false
let nativeShutdown: Promise<void> | null = null

// macOS 在 ready 事件前隐藏 Dock 图标，避免应用启动期间短暂显示。
if (platform.isMacOS) {
  app.dock?.hide()
}

app.on('second-instance', (_event, argv) => {
  // Windows: 检查命令行参数中是否有 .zpx 文件路径
  const zpxPath = argv.find((arg) => arg.endsWith('.zpx'))
  if (zpxPath) {
    console.log('[Main] 第二实例传入 ZPX 文件:', zpxPath)
    if (applicationInitialized) {
      windowManager.openPluginInstaller(zpxPath)
    } else {
      pendingZpxFile = zpxPath
    }
  }

  if (focusAccessibilityPermissionWindow()) return

  // 当运行第二个实例时，焦点聚焦到这个实例
  if (applicationInitialized) {
    if (pluginManager.getCurrentPluginPath()) windowManager.showWindow()
    else void windowManager.showSettings()
  }
})

// macOS: 监听文件打开事件（双击 .zpx 文件或拖拽到 Dock 图标）
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!filePath.endsWith('.zpx')) return

  console.log('[Main] 收到 open-file 事件:', filePath)

  if (applicationInitialized) {
    // 应用已就绪，直接打开安装页面
    windowManager.openPluginInstaller(filePath)
  } else {
    // 应用还未就绪，暂存路径等 ready 后处理
    pendingZpxFile = filePath
  }
})

// ========== 注册自定义协议为特权协议（必须在 app.ready 之前调用）==========
registerIconScheme()

// ========== GPU 加速控制（必须在 app.ready 之前）==========
// app.disableHardwareAcceleration() 只能在 app ready 之前生效，所以需要提前直接读数据库
try {
  const settingsDoc = lmdbInstance.get('ZTOOLS/settings-general')
  if (settingsDoc?.data?.disableGpuAcceleration === true) {
    app.disableHardwareAcceleration()
    console.log('[Main] 已禁用 GPU 硬件加速（用户设置）')
  }
} catch {
  // 读取失败时忽略，保持默认行为（GPU 加速开启）
}

// 配置 electron-log
log.transports.file.level = 'debug'
log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB
log.transports.file.resolvePathFn = () => {
  return path.join(getLogsPath(), 'main.log')
}
// 免安装与安装版无需终端输出；开发终端断开时仅停用控制台通道，文件日志继续保存。
log.transports.console.level = app.isPackaged ? false : 'debug'
const releaseConsolePipeGuard = installConsolePipeGuard(log.transports.console)
process.once('exit', releaseConsolePipeGuard)

// 生产环境接管 console
// if (process.env.NODE_ENV === 'production') {
Object.assign(console, log.functions)
// }

// 开发模式下禁用某些警告
if (process.env.NODE_ENV !== 'production') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

// 添加 Chromium 命令行开关，禁用跨域限制
// app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
// app.commandLine.appendSwitch('disable-site-isolation-trials')
// app.commandLine.appendSwitch('disable-web-security')

// 导出函数供 API 使用
/**
 * 更新打开应用设置页的全局快捷键，空字符串表示关闭。
 * @param shortcut 用户录制的快捷键或空字符串。
 * @returns 是否成功注册或关闭。
 */
export function updateShortcut(shortcut: string): boolean {
  return windowManager.registerShortcut(shortcut)
}

/**
 * 读取当前设置页呼出快捷键。
 * @returns 当前快捷键；关闭时为空字符串。
 */
export function getCurrentShortcut(): string {
  return windowManager.getCurrentShortcut()
}

app.whenReady().then(async () => {
  // 避免 Windows 默认菜单的关闭和开发者加速键绕过内置快捷键开关。
  if (process.platform === 'win32') Menu.setApplicationMenu(null)
  // macOS 辅助功能权限检查和请求（如果未授权则弹窗提示）
  await ensureMacAccessibilityPermission()

  // 处理首次运行时的旧数据导入（如果存在旧数据）
  await handleFirstRunStorageImport()

  // 第三方插件再次读取归档前，补清理上次卸载时仍被 Electron 锁定的实体。
  await cleanupPendingPluginArtifacts()

  // 注册自定义图标协议到默认 session (ztools-icon://)
  registerIconProtocolForSession(session.defaultSession)

  // ✅ 首先加载内置插件
  loadInternalPlugins()

  // 创建主窗口
  const mainWindow = windowManager.createWindow()

  if (
    (isE2ETest || process.env.TABDO_SOURCE_PREVIEW === '1') &&
    process.env.TABDO_PREVIEW_OPEN_SETTINGS !== '0'
  ) {
    // 测试模式直接展示窗口，让自动化驱动无需依赖全局快捷键。
    mainWindow.once('ready-to-show', () => {
      if (pluginManager.getCurrentPluginPath()) windowManager.showWindow()
      else void windowManager.showSettings()
    })
  }

  // 初始化 API 和插件管理器
  if (mainWindow) {
    api.init(mainWindow, pluginManager)
    pluginManager.init(mainWindow)
    if (!isE2ETest) {
      // 首次应用列表准备完成后再初始化应用目录监听器，避免启动时与应用扫描抢占磁盘 I/O。
      appsAPI.setAfterFirstAppsReadyCallback(() => {
        appWatcher.init(mainWindow)
      })
    }
  }

  // 注册全局快捷键
  if (!isE2ETest) windowManager.registerShortcut()

  // 插件只在用户操作或明确能力调用时创建，不恢复旧的随宿主预加载设置。

  applicationInitialized = true

  // 处理文件关联打开：macOS pending 文件 / Windows 命令行参数
  const zpxFromArgs =
    pendingZpxFile || process.argv.find((arg) => arg.endsWith('.zpx') && !arg.startsWith('-'))
  if (zpxFromArgs) {
    pendingZpxFile = null
    // 等待窗口和插件系统完全初始化后再打开
    setTimeout(() => {
      console.log('[Main] 处理启动时的 ZPX 文件:', zpxFromArgs)
      windowManager.openPluginInstaller(zpxFromArgs)
    }, 1500)
  }
})

app.on('window-all-closed', () => {
  if (isLegacyImportWindowActive() || isAccessibilityPermissionWindowActive()) return

  if (!platform.isMacOS) {
    app.quit()
  }
})

app.on('will-quit', () => {
  windowManager.unregisterAllShortcuts()
  api.cleanup()
  updaterAPI.cleanup()
  // 停止应用目录监听
  appWatcher.stop()
  // 关闭 HTTP 服务器
  httpServer.stop()
})

/**
 * 在 JS 环境和数据库仍可用时停止原生回调源，并等待已采集的剪贴板记录保存。
 * @returns 原生监听与在途记录清理完成后的 Promise。
 */
async function releaseNativeResources(): Promise<void> {
  stopWebQuickOpen()
  await stopMedia()
  await stopRecorder(false)
  try {
    stopProviderBridgeHost()
  } catch (error) {
    console.error('[Main] 停止原生提供商桥接失败:', error)
  }
  await clipboardManager.stop()
}

app.on('before-quit', (event) => {
  // 检查是否是通过托盘菜单主动退出
  if (!isE2ETest && !windowManager.getQuitting()) {
    // 不是主动退出（如 Command+Q），阻止退出
    event.preventDefault()
    console.log('[Main] 阻止了 Command+Q 退出，请使用托盘菜单退出')
    const hasActivePlugin = pluginManager.getCurrentPluginPath() !== null
    // 仅在 killPlugin 内置快捷键启用时才隐藏窗口；
    // 禁用时意味着用户希望把 Cmd+Q 用作其他用途（如呼出快捷键），保持窗口可见
    // 插件模式下的 Cmd+Q 由 pluginManager 负责终止插件并返回搜索页，这里不再隐藏主窗口
    if (windowManager.isKillPluginShortcutEnabled() && !hasActivePlugin) {
      windowManager.hideWindow(false)
    }
    return
  }
  // 真实退出（含自动化关闭）先停止监听，第二次 quit 才进入窗口与数据库销毁。
  if (!nativeResourcesReleased) {
    event.preventDefault()
    nativeShutdown ||= releaseNativeResources().then(() => {
      nativeResourcesReleased = true
      app.quit()
    })
    return
  }
  if (!isE2ETest) {
    // 主动退出时，同步销毁所有窗口
    console.log('[Main] 开始同步销毁所有窗口...')

    // 通过 Electron API 获取所有 webContents 并销毁（包括主窗口、分离窗口、插件视图）
    const allContents = webContents.getAllWebContents()
    console.log('[Main] 找到', allContents.length, '个 webContents')
    for (const contents of allContents) {
      if (!contents.isDestroyed()) {
        ;(contents as any).destroy()
      }
    }

    console.log('[Main] 所有窗口同步销毁完成')
  }
})

app.on('activate', () => {
  if (focusAccessibilityPermissionWindow()) return

  if (!applicationInitialized) return

  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager.createWindow()
  }
})

// 开发模式下监听 Ctrl+C 信号
if (process.env.NODE_ENV !== 'production') {
  process.on('SIGINT', () => {
    quitFromSignal('SIGINT')
  })

  process.on('SIGTERM', () => {
    quitFromSignal('SIGTERM')
  })
}

/**
 * 将开发服务器的终止信号转为完整退出，避免 process.exit 跳过异步保存与监听清理。
 * @param signal 收到的终止信号名称。
 * @returns 无返回值。
 */
function quitFromSignal(signal: string): void {
  console.log('[Main] 收到终止信号，清理后退出:', signal)
  windowManager.setQuitting(true)
  app.quit()
}
