import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('electron', () => ({
  app: { dock: { hide: vi.fn(), show: vi.fn() } },
  BrowserWindow: class {},
  ipcMain: { off: vi.fn(), on: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  WebContentsView: class {}
}))

vi.mock('../../src/main/api/shared/database', () => ({
  default: { dbGet: vi.fn(() => ({})), dbPut: vi.fn() }
}))

vi.mock('../../src/main/utils/windowUtils', () => ({
  applyWindowMaterial: vi.fn()
}))

vi.mock('../../src/main/core/globalStyles.js', () => ({
  GLOBAL_SCROLLBAR_CSS: ''
}))

vi.mock('../../src/main/core/lmdb/lmdbInstance', () => ({
  default: { promises: { get: vi.fn() } }
}))

vi.mock('../../src/main/utils/devToolsShortcut', () => ({
  default: { register: vi.fn() },
  getDevToolsMode: vi.fn(() => 'detach')
}))

vi.mock('../../src/main/managers/pluginManager', () => ({
  registerExternalLinkInterceptor: vi.fn()
}))

vi.mock('../../src/main/core/pluginWindowManager', () => ({
  default: { closeByPlugin: vi.fn() }
}))

vi.mock('../../src/main/utils/appBundlePath', () => ({
  getPreloadPath: vi.fn(() => '/preload.js'),
  getRendererPath: vi.fn(() => '/renderer')
}))

vi.mock('../../src/main/core/toolsLifecycle', () => ({
  isToolsPluginPath: (path: string) => path === '/internal/tools',
  releaseToolsView: vi.fn()
}))

import detachedWindowManager, {
  DETACHED_TITLEBAR_HEIGHT
} from '../../src/main/core/detachedWindowManager'

describe('DetachedWindowManager plugin upgrade surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(detachedWindowManager as any).detachedWindowMap = new Map()
    ;(detachedWindowManager as any).suppressedSizePersistenceWindows = new Set()
  })

  it('collapses only the matching detached titlebar and restores its original size', () => {
    const setContentSize = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()
    const setBounds = vi.fn()
    const info = {
      window: {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 17 },
        getContentBounds: vi.fn(() => ({ x: 40, y: 80, width: 820, height: 472 })),
        setContentSize,
        show,
        focus
      },
      view: { setBounds },
      pluginName: 'demo',
      pluginPath: '/plugins/demo',
      isAlwaysOnTop: false,
      lastFocusTarget: 'plugin',
      savedFocusTarget: 'plugin'
    }
    ;(detachedWindowManager as any).detachedWindowMap.set('window-1', info)

    const snapshot = detachedWindowManager.collapsePluginForUpgrade('demo', '/plugins/demo', {
      id: 17
    } as Electron.WebContents)

    expect(snapshot).toEqual({
      windowId: 'window-1',
      pluginName: 'demo',
      pluginPath: '/plugins/demo',
      width: 820,
      viewHeight: 420
    })
    expect(setBounds).toHaveBeenNthCalledWith(1, {
      x: 0,
      y: DETACHED_TITLEBAR_HEIGHT,
      width: 820,
      height: 0
    })
    expect(setContentSize).toHaveBeenNthCalledWith(1, 820, DETACHED_TITLEBAR_HEIGHT)

    expect(detachedWindowManager.restorePluginAfterFailedUpgrade(snapshot!)).toBe(true)
    expect(setContentSize).toHaveBeenNthCalledWith(2, 820, 472)
    expect(setBounds).toHaveBeenNthCalledWith(2, {
      x: 0,
      y: DETACHED_TITLEBAR_HEIGHT,
      width: 820,
      height: 420
    })
    expect(show).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('does not collapse a detached window for a different titlebar sender', () => {
    const setContentSize = vi.fn()
    const setBounds = vi.fn()
    ;(detachedWindowManager as any).detachedWindowMap.set('window-1', {
      window: {
        isDestroyed: vi.fn(() => false),
        webContents: { id: 17 },
        getContentBounds: vi.fn(),
        setContentSize
      },
      view: { setBounds },
      pluginName: 'demo',
      pluginPath: '/plugins/demo'
    })

    const snapshot = detachedWindowManager.collapsePluginForUpgrade('demo', '/plugins/demo', {
      id: 99
    } as Electron.WebContents)

    expect(snapshot).toBeNull()
    expect(setContentSize).not.toHaveBeenCalled()
    expect(setBounds).not.toHaveBeenCalled()
  })

  /**
   * 准备可独立隐藏的编辑宿主与原生控制条，验证前台交接的退出边界。
   * @returns 当前工具窗口、控制条及会话回收观察器。
   */
  function foregroundFixture(): any {
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isVisible: vi.fn(() => true),
      isMinimized: () => false,
      hide: vi.fn()
    })
    const hud = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isVisible: vi.fn(() => true),
      isMinimized: vi.fn(() => false)
    })
    const release = vi.fn()
    const info = {
      window,
      view: { webContents: { id: 20 } },
      pluginPath: '/internal/tools',
      releaseHiddenTools: release
    }
    ;(detachedWindowManager as any).detachedWindowMap.set('tool', info)
    return { window, hud, info, release }
  }

  it('hands the foreground to a visible owned control without enabling residency', () => {
    const { window, hud, release } = foregroundFixture()
    expect(detachedWindowManager.showAuxiliaryForegroundWindow(20, hud as any)).toBe(true)
    expect(window.hide).toHaveBeenCalledOnce()
    hud.emit('hide')
    expect(release).not.toHaveBeenCalled()
    window.isVisible.mockReturnValue(false)
    hud.emit('minimize')
    expect(release).toHaveBeenCalledOnce()
    window.emit('closed')
    expect(hud.listenerCount('hide')).toBe(0)
    expect(hud.listenerCount('minimize')).toBe(0)
    expect(hud.listenerCount('closed')).toBe(0)
  })

  it('keeps the parent accessible when the control is hidden, minimized or not owned by tools', () => {
    const { window, hud, info } = foregroundFixture()
    hud.isVisible.mockReturnValue(false)
    expect(detachedWindowManager.showAuxiliaryForegroundWindow(20, hud as any)).toBe(false)
    hud.isVisible.mockReturnValue(true)
    hud.isMinimized.mockReturnValue(true)
    expect(detachedWindowManager.showAuxiliaryForegroundWindow(20, hud as any)).toBe(false)
    hud.isMinimized.mockReturnValue(false)
    info.pluginPath = '/third-party'
    expect(detachedWindowManager.showAuxiliaryForegroundWindow(20, hud as any)).toBe(false)
    expect(detachedWindowManager.showAuxiliaryForegroundWindow(99, hud as any)).toBe(false)
    expect(window.hide).not.toHaveBeenCalled()
  })
})
