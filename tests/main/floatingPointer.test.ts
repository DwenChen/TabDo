import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Rectangle } from 'electron'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
  pointer: { x: 800, y: 600 }
}))

class FakeWindow extends EventEmitter {
  id = mocks.windows.length + 1
  destroyed = false
  bounds: Rectangle
  webContents = {
    id: this.id,
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn()
  }
  /**
   * 创建具有真实窗口尺寸语义的测试替身。
   * @param options 窗口初始尺寸和位置。
   * @returns 无返回值。
   */
  constructor(options: any) {
    super()
    this.bounds = { x: 200, y: 200, ...options }
    mocks.windows.push(this)
  }
  /**
   * 返回独立的窗口几何快照。
   * @returns 当前坐标和尺寸。
   */
  getBounds = (): Rectangle => ({ ...this.bounds })
  /**
   * 接收宿主请求的窗口位置与尺寸。
   * @param value 新窗口边界。
   * @returns 无返回值。
   */
  setBounds = (value: Rectangle): void => {
    this.bounds = { ...value }
  }
  setMinimumSize = vi.fn()
  setIcon = vi.fn()
  setSkipTaskbar = vi.fn()
  setAppDetails = vi.fn()
  /**
   * 查询测试窗口是否已经关闭。
   * @returns 是否已销毁。
   */
  isDestroyed = (): boolean => this.destroyed
  /**
   * 提供浮动窗口的默认置顶状态。
   * @returns 初始置顶为 true。
   */
  isAlwaysOnTop = (): boolean => true
  show = vi.fn()
  focus = vi.fn()
  loadFile = vi.fn().mockResolvedValue(undefined)
  /**
   * 模拟关闭并发布资源释放事件。
   * @returns 无返回值。
   */
  close(): void {
    this.destroyed = true
    this.emit('closed')
  }
}

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  BrowserWindow: class {
    /**
     * 将 Electron 窗口创建映射到测试替身。
     * @param options 窗口参数。
     * @returns 本次独立窗口。
     */
    constructor(options: any) {
      return new FakeWindow(options)
    }
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) =>
      mocks.handlers.set(channel, handler)
  },
  clipboard: {},
  dialog: {},
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => false }),
    createFromDataURL: () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 640, height: 320 })
    })
  },
  screen: {
    getCursorScreenPoint: () => mocks.pointer,
    getDisplayMatching: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1200, height: 900 } }),
    getDisplayNearestPoint: () => ({ workArea: { width: 1200, height: 900 } })
  }
}))

/**
 * 初始化独立页面并建立宿主观察器，不注入移动或 DOM 鼠标事件。
 * @param type 独立内容类型。
 * @returns 测试窗口。
 */
async function open(type: 'text' | 'image' = 'text'): Promise<FakeWindow> {
  const { openFloating } = await import('../../src/main/core/toolsFloating')
  await openFloating(
    type === 'text'
      ? { type, text: '正文保持', newWindow: true }
      : { type, image: 'data:image/png;base64,AA==' }
  )
  const win = mocks.windows.at(-1) as FakeWindow
  await mocks.handlers.get('tools-floating')!({ sender: win.webContents }, 'ready')
  return win
}

describe('floating native pointer observation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T03:00:00Z'))
    vi.resetModules()
    mocks.windows = []
    mocks.handlers.clear()
    mocks.pointer = { x: 800, y: 600 }
  })
  afterEach(() => {
    for (const win of mocks.windows) if (!win.destroyed) win.close()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it.each([
    ['left', -90, 180],
    ['right', 1050, 180],
    ['top', 220, -40],
    ['bottom', 220, 750]
  ] as const)(
    'recognizes the %s edge, collapses on drag release and undocks on tab click',
    async (edge, x, y) => {
      const win = await open()
      const send = mocks.handlers.get('tools-floating')!
      win.bounds.x = x
      win.bounds.y = y
      await vi.advanceTimersByTimeAsync(320)
      // 仅移动窗口只登记贴靠状态，不再因为指针进出自动收起或展开。
      expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-dock', {
        edge,
        expanded: true
      })
      expect(win.getBounds()).toMatchObject({ width: 300, height: 280 })
      // 拖动释放后才收起为色签。
      await send({ sender: win.webContents }, 'drag-end')
      await vi.advanceTimersByTimeAsync(400)
      expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-dock', {
        edge,
        expanded: false
      })
      const tab = win.getBounds()
      // 左右边缘是 18×80 的竖排色签，上下边缘是 88×18 的横排色签。
      expect(tab).toMatchObject(
        edge === 'left' || edge === 'right' ? { width: 18, height: 80 } : { width: 88, height: 18 }
      )
      // 指针停在色签上也不再自动展开。
      mocks.pointer = { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 }
      await vi.advanceTimersByTimeAsync(320)
      expect(win.getBounds()).toMatchObject({ width: tab.width, height: tab.height })
      // 点击色签解除贴靠并恢复完整纸张。
      await send({ sender: win.webContents }, 'undock')
      await vi.advanceTimersByTimeAsync(400)
      expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-dock', null)
      expect(win.getBounds()).toMatchObject({ width: 300, height: 280 })
      win.close()
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('moves the collapsed tab along the edge and undocks when dragged away from it', async () => {
    const win = await open()
    const send = mocks.handlers.get('tools-floating')!
    win.bounds.x = -90
    win.bounds.y = 180
    await vi.advanceTimersByTimeAsync(320)
    await send({ sender: win.webContents }, 'drag-end')
    await vi.advanceTimersByTimeAsync(400)
    expect(win.getBounds()).toMatchObject({ width: 18, height: 80 })
    // 沿左边缘向下拖动色签：标签跟随指针，仍保持收起。
    await send({ sender: win.webContents }, 'move', { x: 6, y: 420, width: 18, height: 80 })
    expect(win.getBounds()).toMatchObject({ x: 0, y: 420, width: 18, height: 80 })
    // 拖离边缘超过阈值：解除贴靠，纸张出现在拖动位置。
    await send({ sender: win.webContents }, 'move', { x: 240, y: 400, width: 18, height: 80 })
    await vi.advanceTimersByTimeAsync(400)
    expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-dock', null)
    expect(win.getBounds()).toMatchObject({ x: 240, y: 400, width: 300, height: 280 })
    win.close()
  })

  it('docks on drag release without moving the pointer out of the note', async () => {
    const win = await open()
    win.bounds.x = -90
    win.bounds.y = 180
    // 指针停在释放位置（也落在收起后的色签范围内），只上报拖动结束。
    mocks.pointer = { x: 10, y: 240 }
    await vi.advanceTimersByTimeAsync(80)
    await mocks.handlers.get('tools-floating')!({ sender: win.webContents }, 'drag-end')
    await vi.advanceTimersByTimeAsync(480)
    expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-dock', {
      edge: 'left',
      expanded: false
    })
    // 释放后稳定保持收起，指针停留或离开都不再改变尺寸。
    expect(win.getBounds()).toMatchObject({ width: 18, height: 80 })
    await vi.advanceTimersByTimeAsync(240)
    expect(win.getBounds()).toMatchObject({ width: 18, height: 80 })
    mocks.pointer = { x: 800, y: 600 }
    await vi.advanceTimersByTimeAsync(320)
    expect(win.getBounds()).toMatchObject({ width: 18, height: 80 })
    win.close()
  })

  it('keeps the floating image window locked to the image ratio while resizing and dragging', async () => {
    const win = await open('image')
    const send = mocks.handlers.get('tools-floating')!
    const resize = (value: any): Promise<unknown> =>
      send({ sender: win.webContents }, 'resize', value)
    // 原图 640×320：放大请求被限制在原图尺寸，窗口与图片始终重合。
    await resize({ width: 1200, height: 900, x: 200, y: 200, direction: 'se' })
    expect(win.getBounds()).toMatchObject({ x: 200, y: 200, width: 640, height: 320 })
    // 西侧拖动按比例缩为 320×160，并固定右边缘（200 + 640 = 520 + 320）。
    await resize({ width: 320, height: 320, x: 200, y: 200, direction: 'w' })
    expect(win.getBounds()).toMatchObject({ x: 520, y: 200, width: 320, height: 160 })
    // 拖动图片时沿用当前尺寸，不再还原成打开时记录的贴合尺寸。
    await send({ sender: win.webContents }, 'move', { x: 300, y: 260 })
    expect(win.getBounds()).toMatchObject({ x: 300, y: 260, width: 320, height: 160 })
    // 模拟 Windows 取回边界时增加了 DPI 舍入差值；后续拖动仍使用最近缩放的逻辑尺寸。
    win.setBounds({ ...win.getBounds(), width: 322, height: 162 })
    await send({ sender: win.webContents }, 'move', { x: 310, y: 270 })
    expect(win.getBounds()).toMatchObject({ x: 310, y: 270, width: 320, height: 160 })
    // 缩小时高度按比例跟随，不再留下多余透明区域。
    await resize({ width: 100, height: 40, x: 310, y: 270, direction: 'se' })
    expect(win.getBounds()).toMatchObject({ x: 310, y: 270, width: 100, height: 50 })
    win.close()
  })

  it('keeps the note off the dock while the switch is off and restores the paper size', async () => {
    const win = await open()
    expect(
      await mocks.handlers.get('tools-floating')!({ sender: win.webContents }, 'dock', false)
    ).toBe(false)
    // 关闭贴靠后组内窗口状态同步，新窗口也不参与贴靠。
    win.bounds.x = -90
    win.bounds.y = 180
    await vi.advanceTimersByTimeAsync(560)
    expect(win.webContents.send).not.toHaveBeenCalledWith('tools-floating-dock', {
      edge: 'left',
      expanded: true
    })
    expect(win.getBounds()).toMatchObject({ x: -90, width: 300, height: 280 })
    const enabled = await mocks.handlers.get('tools-floating')!(
      { sender: win.webContents },
      'dock',
      true
    )
    expect(enabled).toBe(true)
    await vi.advanceTimersByTimeAsync(560)
    expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-dock', {
      edge: 'left',
      expanded: true
    })
    win.close()
  })

  it('restores every docked note when the shared switch is disabled', async () => {
    const first = await open()
    const second = await open()
    const send = mocks.handlers.get('tools-floating')!
    first.bounds.x = -90
    second.bounds.x = 1050
    await send({ sender: first.webContents }, 'drag-end')
    await send({ sender: second.webContents }, 'drag-end')
    await vi.advanceTimersByTimeAsync(300)
    expect(first.getBounds().width).toBe(18)
    expect(second.getBounds().width).toBe(18)
    await send({ sender: first.webContents }, 'dock', false)
    await vi.advanceTimersByTimeAsync(300)
    expect(first.getBounds()).toMatchObject({ width: 300, height: 280 })
    expect(second.getBounds()).toMatchObject({ width: 300, height: 280 })
    expect(second.webContents.send).toHaveBeenCalledWith('tools-floating-dock-preference', false)
  })

  it('does not dock while dragging is paused and collapses immediately on release', async () => {
    const win = await open()
    const send = mocks.handlers.get('tools-floating')!
    await send({ sender: win.webContents }, 'drag-start')
    await send({ sender: win.webContents }, 'move', { x: 0, y: 300 })
    await vi.advanceTimersByTimeAsync(600)
    expect(win.getBounds()).toMatchObject({ width: 300, height: 280 })
    await send({ sender: win.webContents }, 'drag-end', { moved: true })
    await vi.advanceTimersByTimeAsync(240)
    expect(win.getBounds()).toMatchObject({ x: 0, y: 300, width: 18, height: 80 })
    await send({ sender: win.webContents }, 'drag-start')
    await send({ sender: win.webContents }, 'move', { x: 40, y: 300 })
    await send({ sender: win.webContents }, 'drag-end', { moved: true })
    await vi.advanceTimersByTimeAsync(600)
    expect(win.getBounds()).toMatchObject({ x: 40, y: 300, width: 300, height: 280 })
  })

  it('enlarges an image from one edge and keeps its current size when moved', async () => {
    const win = await open('image')
    const send = mocks.handlers.get('tools-floating')!
    await send({ sender: win.webContents }, 'resize', { width: 320, height: 160, direction: 'e' })
    await send({ sender: win.webContents }, 'resize', { width: 480, height: 160, direction: 'e' })
    expect(win.getBounds()).toMatchObject({ width: 480, height: 240 })
    await send({ sender: win.webContents }, 'move', { x: 320, y: 280, width: 640, height: 320 })
    expect(win.getBounds()).toMatchObject({ x: 320, y: 280, width: 480, height: 240 })
  })

  it('publishes actual pointer entry over an image drag region and releases the shared observer on close', async () => {
    const win = await open('image')
    await vi.advanceTimersByTimeAsync(80)
    expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-pointer', false)
    mocks.pointer = { x: win.bounds.x + 30, y: win.bounds.y + 30 }
    await vi.advanceTimersByTimeAsync(80)
    expect(win.webContents.send).toHaveBeenCalledWith('tools-floating-pointer', true)
    expect(vi.getTimerCount()).toBe(1)
    win.close()
    expect(vi.getTimerCount()).toBe(0)
  })
})
