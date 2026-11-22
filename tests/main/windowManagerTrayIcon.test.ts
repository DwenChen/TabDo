import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const platform = { isMacOS: false, isWindows: true, isLinux: false }
  const createFromPath = vi.fn(() => ({ setTemplateImage: vi.fn() }))
  const trayInstances: any[] = []
  const Tray = vi.fn(function TrayMock(this: any) {
    const tray = {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
      popUpContextMenu: vi.fn(),
      destroy: vi.fn()
    }
    trayInstances.push(tray)
    return tray
  })
  return { platform, createFromPath, trayInstances, Tray }
})

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
  platform: mocks.platform
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/tmp/tabdo'),
    focus: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    isHidden: vi.fn(() => false)
  },
  BrowserWindow: vi.fn(),
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn(() => false)
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({ items: [] }))
  },
  nativeImage: {
    createFromPath: mocks.createFromPath
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({
      id: 1,
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    }))
  },
  Tray: mocks.Tray,
  webContents: {
    getAllWebContents: vi.fn(() => [])
  }
}))

vi.mock('../../src/main/api', () => ({
  default: { dbGet: vi.fn(() => null), launchPlugin: vi.fn() }
}))

vi.mock('../../src/main/api/shared/database', () => ({
  default: { dbGet: vi.fn(), dbPut: vi.fn() }
}))

vi.mock('../../src/main/core/dndManager.js', () => ({
  default: {
    manualEnabled: false,
    toggleManual: vi.fn(),
    isManualEnabled: vi.fn(() => false)
  },
  isFullscreenWindow: vi.fn(() => false)
}))

vi.mock('../../src/main/core/awakeService.js', () => ({
  default: {
    getState: vi.fn(() => ({
      enabled: false,
      keepDisplayOn: false,
      durationMinutes: 0,
      remainingMs: null
    })),
    setEnabled: vi.fn(),
    setKeepDisplayOn: vi.fn(),
    setDurationMinutes: vi.fn(),
    setStateHandler: vi.fn()
  }
}))

vi.mock('../../src/main/core/doubleTapManager.js', () => ({
  default: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() }
}))

vi.mock('../../src/main/core/globalInputManager.js', () => ({
  default: { on: vi.fn(), acquire: vi.fn(), release: vi.fn() }
}))

vi.mock('../../src/main/core/native/index.js', () => ({
  WindowManager: { activateWindow: vi.fn(), getActiveWindow: vi.fn(() => null) }
}))

vi.mock('../../src/main/managers/clipboardManager', () => ({
  default: { getCurrentWindow: vi.fn(() => null), activateApp: vi.fn(() => true) }
}))

vi.mock('../../src/main/core/detachedWindowManager', () => ({
  default: { hasDetachedWindows: vi.fn(() => false) }
}))

vi.mock('../../src/main/core/superPanelManager', () => ({
  default: { broadcastToSuperPanel: vi.fn() }
}))

vi.mock('../../src/main/utils/windowUtils', () => ({
  applyWindowMaterial: vi.fn(),
  getDefaultWindowMaterial: vi.fn(() => 'none')
}))

vi.mock('../../src/main/managers/pluginManager', () => ({
  default: {
    getCurrentPluginPath: vi.fn(() => null),
    handlePluginEsc: vi.fn(),
    shouldSuppressMainHide: vi.fn(() => false)
  }
}))

describe('windowManager tray icon', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.platform.isMacOS = false
    mocks.platform.isWindows = true
    mocks.platform.isLinux = false
    mocks.trayInstances.length = 0
  })

  it('uses the multi-frame ICO on Windows so Electron reads the exact tray size', async () => {
    const { default: windowManager } = await import('../../src/main/managers/windowManager')

    windowManager.createTray()

    expect(mocks.createFromPath).toHaveBeenCalledTimes(1)
    expect(mocks.createFromPath.mock.calls[0][0]).toContain('tray.ico')
    expect(mocks.Tray).toHaveBeenCalledTimes(1)
    expect(mocks.trayInstances[0].setToolTip).toHaveBeenCalledWith('TabDo')
  })

  it('keeps the PNG resources outside Windows', async () => {
    mocks.platform.isWindows = false
    mocks.platform.isLinux = true
    const { default: windowManager } = await import('../../src/main/managers/windowManager')

    windowManager.createTray()

    expect(mocks.createFromPath.mock.calls[0][0]).toContain('windows-icon.png')
  })
})
