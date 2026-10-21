import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  trigger: null as (() => { shouldBlock: boolean }) | null,
  monitoring: false,
  start: vi.fn(),
  stop: vi.fn(),
  recent: vi.fn(),
  nextCopy: vi.fn(),
  copy: vi.fn(),
  ignored: false
}))

vi.mock('electron', () => ({
  app: { once: vi.fn() },
  BrowserWindow: vi.fn(),
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  screen: { getCursorScreenPoint: () => ({ x: 30, y: 40 }) }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('../../src/main/core/native/index.js', () => ({
  MouseMonitor: {
    /**
     * 返回夹具中的监视状态，供宿主执行真实的停止和重新登记流程。
     * @returns 是否已经登记鼠标监视器。
     */
    get isMonitoring() {
      return state.monitoring
    },
    start: state.start,
    stop: state.stop
  },
  ClipboardMonitor: { setClipboardPollingBoost: vi.fn() },
  WindowManager: {
    getActiveWindow: () => ({ app: 'editor.exe', pid: 12345 }),
    simulateKeyboardTap: state.copy
  }
}))
vi.mock('../../src/main/core/commandLauncher/index.js', () => ({ launchApp: vi.fn() }))
vi.mock('../../src/main/api/shared/database.js', () => ({ default: { dbGet: vi.fn() } }))
vi.mock('../../src/main/core/dndManager.js', () => ({
  default: { shouldIgnoreHotkeys: () => state.ignored }
}))
vi.mock('../../src/main/api/renderer/plugins.js', () => ({ default: {} }))
vi.mock('../../src/main/managers/windowManager.js', () => ({ default: {} }))
vi.mock('../../src/main/managers/clipboardManager.js', () => ({
  default: {
    getCurrentWindow: () => ({ app: 'editor.exe', pid: 12345 }),
    getLastCopiedSequence: () => 10,
    getRecentCopiedContent: state.recent,
    waitForNextCopiedContent: state.nextCopy
  }
}))
vi.mock('../../src/main/utils/windowUtils.js', () => ({
  applyWindowMaterial: vi.fn(),
  getDefaultWindowMaterial: () => 'none'
}))
vi.mock('../../src/main/core/provider/providerManager.js', () => ({ default: {} }))
vi.mock('../../src/main/utils/common', () => ({ decodeFileUrlToPath: vi.fn() }))
vi.mock('../../src/main/core/globalInputManager', () => ({
  default: { on: vi.fn(), acquire: vi.fn(), release: vi.fn() }
}))

const triggerModes = [
  ['middle', 0],
  ['middle', 450],
  ['right', 450],
  ['back', 0],
  ['back', 450],
  ['forward', 0],
  ['forward', 450]
] as const
let manager: any
let show: ReturnType<typeof vi.fn>,
  search: ReturnType<typeof vi.fn>,
  pinned: ReturnType<typeof vi.fn>

/**
 * 以公开设置入口重新登记原生鼠标回调，不直接调用待验证的私有触发方法。
 * @param button 用户选择的超级面板鼠标键。
 * @param longPressMs 长按阈值，0 表示按下触发。
 * @returns 无返回值。
 */
function configure(button: string, longPressMs: number): void {
  manager.updateConfig({ enabled: true, mouseButton: button, longPressMs })
}

/**
 * 通过已注册的原生回调触发完整复制和匹配链，等待实际面板发布边界。
 * @returns 本次原始鼠标事件的拦截结果。
 */
async function fire(): Promise<{ shouldBlock: boolean }> {
  const result = state.trigger!()
  await vi.waitFor(() => expect(show).toHaveBeenCalledOnce())
  return result
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  state.monitoring = false
  state.ignored = false
  state.trigger = null
  state.start.mockImplementation((_button, _delay, callback) => {
    state.monitoring = true
    state.trigger = callback
  })
  state.stop.mockImplementation(() => {
    state.monitoring = false
    state.trigger = null
  })
  state.recent.mockReturnValue({
    type: 'text',
    data: 'recent copy',
    sequence: 10,
    timestamp: Date.now()
  })
  state.nextCopy.mockResolvedValue(null)
  state.copy.mockReturnValue(true)
  manager = (await import('../../src/main/core/superPanelManager')).default
  manager.mainWindow = { isDestroyed: () => false }
  // 只替换原生窗口发布边界，真实触发注册、剪贴板等待、优先级及取消逻辑继续执行。
  show = vi.spyOn(manager, 'showWindow').mockImplementation(() => {})
  search = vi.spyOn(manager, 'requestSearch').mockImplementation(() => {})
  pinned = vi.spyOn(manager, 'loadPinnedCommands').mockImplementation(() => {})
  vi.spyOn(manager, 'requestTranslation').mockImplementation(() => {})
  vi.spyOn(manager, 'prepareWindow').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('最近复制匹配跟随配置的超级面板触发键', () => {
  it.each(triggerModes)('%s / %dms 无选区时使用有效主动复制内容', async (button, delay) => {
    configure(button, delay)
    expect(state.start).toHaveBeenLastCalledWith(button, delay, expect.any(Function))
    expect(await fire()).toEqual({ shouldBlock: true })
    expect(state.copy).toHaveBeenCalledWith('c', process.platform === 'darwin' ? 'meta' : 'ctrl')
    expect(state.recent).toHaveBeenCalledWith(5000)
    expect(search).toHaveBeenCalledWith({ type: 'text', text: 'recent copy' })
    expect(pinned).not.toHaveBeenCalled()
  })

  it('切换触发键后重新登记回调，最近复制匹配继续生效', async () => {
    configure('middle', 0)
    configure('back', 450)
    expect(state.stop).toHaveBeenCalledOnce()
    expect(state.start).toHaveBeenLastCalledWith('back', 450, expect.any(Function))
    await fire()
    expect(search).toHaveBeenCalledWith({ type: 'text', text: 'recent copy' })
  })

  it('当前选区产生的新复制优先于最近复制缓存', async () => {
    state.nextCopy.mockResolvedValue({ type: 'text', data: 'current selection', sequence: 11 })
    configure('right', 450)
    await fire()
    expect(search).toHaveBeenCalledOnce()
    expect(search).toHaveBeenCalledWith({ type: 'text', text: 'current selection' })
  })

  it('主动复制已过期且没有当前选区时显示固定项', async () => {
    state.recent.mockReturnValue(null)
    configure('forward', 0)
    await fire()
    expect(state.recent).toHaveBeenCalledWith(5000)
    expect(search).not.toHaveBeenCalled()
    expect(pinned).toHaveBeenCalledOnce()
  })

  it('0 秒关闭最近复制回退，不读取旧的无限时长缓存', async () => {
    configure('back', 0)
    manager.updateClipboardQuickMatch(0)
    state.recent.mockReturnValue(null)
    await fire()
    expect(state.recent).toHaveBeenCalledWith(0)
    expect(pinned).toHaveBeenCalledOnce()
    expect(search).not.toHaveBeenCalled()
  })

  it('0 秒不影响当前选区复制匹配', async () => {
    configure('right', 450)
    manager.updateClipboardQuickMatch(0)
    state.recent.mockReturnValue(null)
    state.nextCopy.mockResolvedValue({ type: 'text', data: 'selection with fallback off' })
    await fire()
    expect(search).toHaveBeenCalledWith({ type: 'text', text: 'selection with fallback off' })
  })

  it.each([
    [
      { type: 'image', data: 'data:image/png;base64,AA==' },
      { type: 'image', image: 'data:image/png;base64,AA==' }
    ],
    [
      { type: 'file', data: [{ path: 'C:/fixture.txt', name: 'fixture.txt', isDirectory: false }] },
      { type: 'file', files: [{ path: 'C:/fixture.txt', name: 'fixture.txt', isDirectory: false }] }
    ]
  ])('非中键触发也保留图片和文件载荷 %#', async (recent, expected) => {
    state.recent.mockReturnValue(recent)
    configure('forward', 450)
    await fire()
    expect(search).toHaveBeenCalledWith(expected)
  })

  it.each(['game-mode', 'blocked-app'])('%s 不读取复制内容或显示匹配面板', async (reason) => {
    configure('back', 0)
    if (reason === 'game-mode') state.ignored = true
    else manager.updateBlockedApps([{ app: 'editor.exe' }])
    expect(state.trigger!()).toEqual({ shouldBlock: false })
    expect(state.recent).not.toHaveBeenCalled()
    expect(state.copy).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
  })

  it('等待选区复制时关闭面板，迟到结果不能重新弹出或发布旧缓存', async () => {
    let finish!: (value: null) => void
    const pending = new Promise<null>((resolve) => {
      finish = resolve
    })
    state.nextCopy.mockReturnValue(pending)
    configure('back', 450)
    state.trigger!()
    manager.hideWindow()
    finish(null)
    await pending
    expect(show).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
    expect(pinned).not.toHaveBeenCalled()
  })
})
