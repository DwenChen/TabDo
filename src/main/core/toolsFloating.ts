import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  type Rectangle,
  type WebContents
} from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { applyToolsWindowIdentity, getToolsWindowIcon } from './toolsWindowIdentity'
import { layoutDockTabs } from '../../shared/noteDockLayout'

// 便签贴靠开关只作用于本次运行的所有便签窗口：独立窗口不持有历史，也不读写用户配置。
let dockPreference = true

/**
 * 读取当前运行的便签贴靠开关。
 * @returns 是否允许便签贴靠屏幕边缘。
 */
function readDockPreference(): boolean {
  return dockPreference
}

interface FloatingContent {
  id?: string
  type: 'text' | 'image'
  text?: string
  image?: string
  color?: string
  edit?: boolean
  newWindow?: boolean
  label?: string
}
interface FloatingEntry {
  window: BrowserWindow
  content: FloatingContent
  ready: boolean
  pendingText: string[]
  focused: number
  adjustingDock?: boolean
  observedBounds?: Rectangle
  boundsChangedAt?: number
  pointerInside?: boolean
  normalSize?: { width: number; height: number }
  /** 图片悬浮的原图像素尺寸，用于让窗口始终跟随图片比例。 */
  imageSize?: { width: number; height: number }
  dockEnabled: boolean
  /** 是否允许重新贴靠：解除贴靠后只有下一次拖动才会重新贴边。 */
  dockArmed: boolean
  /** 拖动尚未释放时不得因鼠标暂停而贴靠。 */
  dragging?: boolean
  /** 色签在本次拖动中已解除，释放时不再自动吸回边缘。 */
  undockedDuringDrag?: boolean
  /** 贴靠过渡动画的计时器，开始新动画前必须释放。 */
  dockAnimation?: ReturnType<typeof setInterval>
  dock?: {
    edge: 'left' | 'right' | 'top' | 'bottom'
    expanded: boolean
    fullBounds: Rectangle
    offset: number
    inset?: number
  }
}
const windows = new Map<number, FloatingEntry>()
let registered = false
let focusSequence = 0
let noteSequence = 0
let pointerWatch: ReturnType<typeof setInterval> | undefined

/**
 * 从系统鼠标坐标识别窗口内外，原生拖动区不会可靠派发页面悬停事件。
 * @returns 无返回值。
 */
function observeFloatingPointer(): void {
  const point = screen.getCursorScreenPoint()
  const now = Date.now()
  for (const entry of windows.values()) {
    if (
      !entry.ready ||
      entry.window.isDestroyed() ||
      (entry.content.type === 'image' && entry.content.edit)
    )
      continue
    const bounds = entry.window.getBounds()
    const last = entry.observedBounds
    if (
      !last ||
      (['x', 'y', 'width', 'height'] as const).some((key) => last[key] !== bounds[key])
    ) {
      entry.observedBounds = bounds
      entry.boundsChangedAt = now
    }
    const settled = now - (entry.boundsChangedAt ?? now) >= 180
    // 等移动和缩放稳定后再贴靠，避免在原生拖动尚未结束时突然改变窗口尺寸。
    if (settled && !entry.dragging) {
      updateDock(entry)
    }
    const inside =
      point.x >= bounds.x &&
      point.y >= bounds.y &&
      point.x < bounds.x + bounds.width &&
      point.y < bounds.y + bounds.height
    // 只发布真实指针状态供悬浮图片按钮显示，贴靠不再跟随悬停展开或收起。
    if (inside !== entry.pointerInside) {
      entry.pointerInside = inside
      entry.window.webContents.send('tools-floating-pointer', inside)
    }
  }
}

/**
 * 只在独立可见便签或图片悬浮存活时运行一个共享观察器，最后窗口关闭立即释放。
 * @returns 无返回值。
 */
function refreshPointerWatch(): void {
  const needed = [...windows.values()].some(
    (entry) => entry.ready && (entry.content.type === 'text' || !entry.content.edit)
  )
  if (needed && !pointerWatch) {
    pointerWatch = setInterval(observeFloatingPointer, 80)
    pointerWatch.unref()
  } else if (!needed && pointerWatch) {
    clearInterval(pointerWatch)
    pointerWatch = undefined
  }
}

/**
 * 通知便签展示展开纸张或同色边缘标签，不隐藏或销毁仍可见的独立窗口。
 * @param entry 当前便签窗口。
 * @returns 无返回值。
 */
function publishDock(entry: FloatingEntry): void {
  if (entry.ready && !entry.window.isDestroyed())
    entry.window.webContents.send(
      'tools-floating-dock',
      entry.dock ? { edge: entry.dock.edge, expanded: entry.dock.expanded } : null
    )
}

/** 贴靠过渡动画时长与帧间隔。 */
const DOCK_ANIMATION_MS = 200
const DOCK_ANIMATION_FRAME_MS = 16
/** 拖动色签离开边缘多远才解除贴靠。 */
const UNDOCK_DISTANCE = 28

/**
 * 停止贴靠过渡动画并恢复观察器的正常判定。
 * @param entry 需要停止动画的便签。
 * @returns 无返回值。
 */
function cancelDockAnimation(entry: FloatingEntry): void {
  if (entry.dockAnimation) clearInterval(entry.dockAnimation)
  entry.dockAnimation = undefined
  entry.adjustingDock = false
  // 重设观察基准，让动画结束后的第一帧重新计时，避免立即再次判定贴靠。
  entry.observedBounds = undefined
}

/**
 * 用分帧插值平滑过渡到目标边界，替代一次性跳变。
 * @param entry 需要过渡的便签。
 * @param target 目标窗口边界。
 * @param duration 动画时长（毫秒）。
 * @returns 无返回值。
 */
function animateDockBounds(
  entry: FloatingEntry,
  target: Rectangle,
  duration = DOCK_ANIMATION_MS
): void {
  cancelDockAnimation(entry)
  if (!entry.ready || entry.window.isDestroyed()) return
  const start = entry.window.getBounds()
  const startedAt = Date.now()
  // 过渡期间不接受贴靠判定，避免动画中途再次改变尺寸。
  entry.adjustingDock = true
  const timer = setInterval(() => {
    if (entry.window.isDestroyed()) {
      cancelDockAnimation(entry)
      return
    }
    const progress = Math.min(1, (Date.now() - startedAt) / duration)
    // 缓出曲线：起步快、收尾慢，贴靠与展开都更顺滑。
    const eased = 1 - Math.pow(1 - progress, 3)
    entry.window.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased)
    })
    if (progress >= 1) {
      entry.window.setBounds(target)
      cancelDockAnimation(entry)
    }
  }, DOCK_ANIMATION_FRAME_MS)
  timer.unref?.()
  entry.dockAnimation = timer
}

/**
 * 计算展开纸张的窗口边界，始终贴住所属边缘并约束在工作区内。
 * @param dock 当前贴靠状态。
 * @param area 便签所在显示器的工作区。
 * @returns 展开后的窗口边界。
 */
function expandedDockBounds(dock: FloatingEntry['dock'], area: Rectangle): Rectangle {
  const full = { ...dock!.fullBounds }
  full.x = Math.max(area.x, Math.min(full.x, area.x + area.width - full.width))
  full.y = Math.max(area.y, Math.min(full.y, area.y + area.height - full.height))
  if (dock!.edge === 'left' || dock!.edge === 'right') {
    full.x = dock!.edge === 'left' ? area.x : area.x + area.width - full.width
    full.y = Math.max(area.y, Math.min(dock!.offset, area.y + area.height - full.height))
  } else {
    full.y = dock!.edge === 'top' ? area.y : area.y + area.height - full.height
    full.x = Math.max(area.x, Math.min(dock!.offset, area.x + area.width - full.width))
  }
  return full
}

/**
 * 计算收起色签的窗口边界，标签宽度固定，位置取自贴靠偏移。
 * @param dock 当前贴靠状态。
 * @param area 便签所在显示器的工作区。
 * @returns 收起后的窗口边界。
 */
function collapsedDockBounds(dock: FloatingEntry['dock'], area: Rectangle): Rectangle {
  const vertical = dock!.edge === 'left' || dock!.edge === 'right'
  const width = vertical ? 18 : 88
  const height = vertical ? 80 : 18
  return {
    width,
    height,
    x: vertical
      ? dock!.edge === 'left'
        ? area.x + (dock!.inset || 0)
        : area.x + area.width - width - (dock!.inset || 0)
      : dock!.offset,
    y: vertical
      ? dock!.offset
      : dock!.edge === 'top'
        ? area.y + (dock!.inset || 0)
        : area.y + area.height - height - (dock!.inset || 0)
  }
}

/**
 * 在展开纸张与收起色签之间平滑过渡，保留正文与正常窗口尺寸。
 * @param entry 拥有贴靠状态的便签。
 * @param expanded 是否展开完整便签。
 * @returns 无返回值。
 */
function setDockExpanded(entry: FloatingEntry, expanded: boolean): void {
  const dock = entry.dock
  if (!dock || dock.expanded === expanded || entry.window.isDestroyed()) return
  const area = screen.getDisplayMatching(dock.fullBounds).workArea
  if (!expanded) dock.fullBounds = { ...entry.window.getBounds(), ...entry.normalSize }
  dock.expanded = expanded
  const target = expanded ? expandedDockBounds(dock, area) : collapsedDockBounds(dock, area)
  animateDockBounds(entry, target)
  publishDock(entry)
  if (!expanded) arrangeDockStack(entry)
}

/**
 * 在释放拖动后整理同屏同边的相邻色签，不更改正文、编号或正常纸张尺寸。
 * @param entry 本次释放的便签。
 * @returns 无返回值。
 */
function arrangeDockStack(entry: FloatingEntry): void {
  const dock = entry.dock
  if (!dock || dock.expanded) return
  const display = screen.getDisplayMatching(dock.fullBounds)
  const vertical = dock.edge === 'left' || dock.edge === 'right'
  const members = [...windows.values()].filter(
    (other) =>
      !other.window.isDestroyed() &&
      !other.dragging &&
      other.dock?.expanded === false &&
      other.dock.edge === dock.edge &&
      screen.getDisplayMatching(other.dock.fullBounds).id === display.id
  )
  const area = display.workArea
  const layout = layoutDockTabs(
    members.map((other) => ({
      id: other.window.id,
      label: other.content.label || '',
      offset: other.dock!.offset
    })),
    entry.window.id,
    vertical ? area.y : area.x,
    vertical ? area.height : area.width,
    vertical
  )
  // 位置一次性计算，防止逐个移动时反复触发相邻组整理。
  for (const position of layout) {
    const other = members.find((item) => item.window.id === position.id)!
    other.dock!.offset = position.offset
    other.dock!.inset = position.inset
    animateDockBounds(other, collapsedDockBounds(other.dock, area))
  }
}

/**
 * 解除贴靠：恢复完整纸张，只有再次拖动才会重新贴边。
 * @param entry 需要解除贴靠的便签。
 * @param position 可选的纸张左上角坐标，缺省沿用当前色签位置。
 * @returns 是否真正解除了贴靠。
 */
function undockNote(entry: FloatingEntry, position?: { x: number; y: number }): boolean {
  const dock = entry.dock
  if (!dock || entry.window.isDestroyed()) return false
  const area = screen.getDisplayMatching(dock.fullBounds).workArea
  const size = entry.normalSize || { width: dock.fullBounds.width, height: dock.fullBounds.height }
  const origin = position || { x: dock.fullBounds.x, y: dock.fullBounds.y }
  const target: Rectangle = {
    width: size.width,
    height: size.height,
    x: Math.max(area.x, Math.min(Math.round(origin.x), area.x + area.width - size.width)),
    y: Math.max(area.y, Math.min(Math.round(origin.y), area.y + area.height - size.height))
  }
  entry.dock = undefined
  // 解除后必须再次拖动才重新贴边，避免刚展开就被贴靠判定拉回。
  entry.dockArmed = false
  if (entry.dragging || entry.undockedDuringDrag) {
    // 拖出色签后完整纸张直接接续指针；拖动过程不和展开动画竞争坐标。
    cancelDockAnimation(entry)
    entry.window.setBounds(target)
  } else animateDockBounds(entry, target)
  publishDock(entry)
  return true
}

/**
 * 拖动收起色签：沿所属边缘自由移动标签，拖离边缘足够远则解除贴靠。
 * @param entry 已收起为色签的便签。
 * @param value 页面提交的拖动坐标与尺寸。
 * @returns 是否处理了本次拖动。
 */
function moveCollapsedDock(entry: FloatingEntry, value: any): boolean {
  const dock = entry.dock
  if (!dock || entry.window.isDestroyed()) return false
  const area = screen.getDisplayMatching(dock.fullBounds).workArea
  const vertical = dock.edge === 'left' || dock.edge === 'right'
  const perpendicular = vertical
    ? dock.edge === 'left'
      ? value.x - area.x
      : value.x + entry.window.getBounds().width < area.x + area.width
        ? area.x + area.width - value.x - entry.window.getBounds().width
        : 0
    : dock.edge === 'top'
      ? value.y - area.y
      : area.y + area.height - value.y - entry.window.getBounds().height
  if (perpendicular > UNDOCK_DISTANCE) {
    entry.undockedDuringDrag = true
    return undockNote(entry, { x: value.x, y: value.y })
  }
  const tab = collapsedDockBounds(dock, area)
  const lower = vertical ? area.y : area.x
  const upper = vertical ? area.y + area.height - tab.height : area.x + area.width - tab.width
  const offset = Math.round(
    Math.max(lower, Math.min(vertical ? value.y : value.x, Math.max(lower, upper)))
  )
  dock.offset = offset
  dock.inset = 0
  // 展开位置随用户移动后的标签更新，开关解除与追加正文也沿用新位置。
  dock.fullBounds = expandedDockBounds(dock, area)
  // 拖动过程中直接跟随，不做插值，手感更贴手。
  cancelDockAnimation(entry)
  entry.window.setBounds(vertical ? { ...tab, y: offset } : { ...tab, x: offset })
  return true
}

/**
 * 按原图比例换算图片悬浮窗口的实际尺寸。
 *
 * 用户报告缩小窗口时下方会留下透明区域，拖动后尺寸又回到旧记录；根因是窗口尺寸与
 * 图片比例解耦。这里以请求尺寸中较小的缩放比为准，且不放大到原图之上，窗口与图片
 * 始终重合，不再出现多余留白。
 *
 * @param entry 当前悬浮窗口。
 * @param requested 页面请求的窗口尺寸。
 * @param direction 正在拖动的边缘或角落。
 * @returns 保持原图比例的窗口尺寸；非图片悬浮或未知图片尺寸时返回请求尺寸。
 */
function lockFloatingImageSize(
  entry: FloatingEntry,
  requested: { width: number; height: number },
  direction = ''
): { width: number; height: number } {
  const image = entry.imageSize
  if (entry.content.type !== 'image' || entry.content.edit || !image?.width || !image?.height)
    return requested
  // 单边缩放以正在拖动的轴为准，否则未变化的另一轴会阻止放大。
  const scale = Math.min(
    1,
    direction === 'e' || direction === 'w'
      ? requested.width / image.width
      : direction === 'n' || direction === 's'
        ? requested.height / image.height
        : Math.min(requested.width / image.width, requested.height / image.height)
  )
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale))
  }
}

/**
 * 计算缩放后的窗口原点，保持对侧边缘稳定。
 * @param bounds 缩放前的窗口位置与尺寸。
 * @param size 缩放后确认的窗口尺寸。
 * @param value 页面提交的缩放请求，含期望原点与拖动方向。
 * @param locked 是否使用了与请求不同的比例锁定尺寸。
 * @returns 缩放后的窗口坐标。
 */
function resizeAnchor(
  bounds: Rectangle,
  size: { width: number; height: number },
  value: any,
  locked: boolean
): { x: number; y: number } {
  if (!locked)
    return {
      x: Number.isFinite(value?.x) ? Math.round(value.x) : bounds.x,
      y: Number.isFinite(value?.y) ? Math.round(value.y) : bounds.y
    }
  // 比例锁定后尺寸与请求不一致，按拖动方向固定对侧边缘，避免缩放过程中窗口瞬移。
  const direction = typeof value?.direction === 'string' ? value.direction : ''
  return {
    x: Math.round(direction.includes('w') ? bounds.x + bounds.width - size.width : bounds.x),
    y: Math.round(direction.includes('n') ? bounds.y + bounds.height - size.height : bounds.y)
  }
}

/**
 * 识别接近或越过工作区的边缘；拖离边缘后解除贴靠，多张色签使用独立位置。
 * @param entry 当前被移动的便签。
 * @returns 无返回值。
 */
function updateDock(entry: FloatingEntry): void {
  if (
    entry.content.type !== 'text' ||
    !entry.ready ||
    !entry.dockEnabled ||
    !entry.dockArmed ||
    entry.window.isDestroyed() ||
    entry.adjustingDock ||
    entry.dock?.expanded === false
  )
    return
  const bounds = entry.window.getBounds(),
    area = screen.getDisplayMatching(bounds).workArea
  const distances = {
    left: Math.max(0, bounds.x - area.x),
    right: Math.max(0, area.x + area.width - bounds.x - bounds.width),
    top: Math.max(0, bounds.y - area.y),
    bottom: Math.max(0, area.y + area.height - bounds.y - bounds.height)
  }
  const edge = (Object.keys(distances) as Array<keyof typeof distances>).sort(
    (a, b) => distances[a] - distances[b]
  )[0]
  if (distances[edge] > 20) {
    if (entry.dock) {
      entry.dock = undefined
      publishDock(entry)
    }
    return
  }
  // 仅在新贴靠或换边时分配标签位置，避免自身尺寸变化产生重复移动循环。
  if (entry.dock?.edge === edge) {
    entry.dock.fullBounds = bounds
    return
  }
  const vertical = edge === 'left' || edge === 'right'
  const lower = vertical ? area.y : area.x,
    upper = lower + (vertical ? area.height - 80 : area.width - 88)
  const offset = Math.max(lower, Math.min(vertical ? bounds.y : bounds.x, upper))
  entry.dock = { edge, expanded: true, fullBounds: bounds, offset }
  publishDock(entry)
}

/**
 * 选择最近聚焦且尚未销毁的便签，初始化中的窗口同样参与追加路由。
 * @returns 最近使用的便签，没有存活窗口时为 undefined。
 */
function recentNote(): FloatingEntry | undefined {
  return [...windows.values()]
    .filter((entry) => entry.content.type === 'text' && !entry.window.isDestroyed())
    .sort((left, right) => right.focused - left.focused)[0]
}

/**
 * 将初始化期间排队的追加文字交给目标便签，发出后立即释放宿主副本。
 * @param entry 仍由宿主持有的独立窗口。
 * @returns 无返回值。
 */
function publishNoteAdditions(entry: FloatingEntry): void {
  if (!entry.ready || entry.window.isDestroyed() || !entry.pendingText.length) return
  entry.window.webContents.send('tools-floating-append', entry.pendingText.splice(0))
}

/**
 * 校验来源并处理当前悬浮窗口的操作，关闭后不保留页面或图片引用。
 * @param sender 发起操作的窗口页面。
 * @param action 当前窗口操作。
 * @param value 用户输入的数据。
 * @returns 操作结果。
 * @throws {Error} 非悬浮窗口调用或输入无效时抛出。
 */
async function operate(sender: WebContents, action: string, value: any): Promise<any> {
  const entry = windows.get(sender.id)
  if (!entry) throw new Error('悬浮窗口已关闭')
  const { window, content } = entry
  if (action === 'init')
    return { ...content, top: window.isAlwaysOnTop(), dockEnabled: entry.dockEnabled }
  if (action === 'ready') {
    // 页面先建立追加监听再确认就绪，避免首次创建与连续追加之间丢字。
    entry.ready = true
    content.text = undefined
    content.image = undefined
    publishNoteAdditions(entry)
    publishDock(entry)
    refreshPointerWatch()
    return true
  }
  if (action === 'new-note') {
    return openFloating({ type: 'text', text: '', newWindow: true })
  }
  if (action === 'close') {
    window.close()
    return true
  }
  if (action === 'top') {
    window.setAlwaysOnTop(!!value)
    return window.isAlwaysOnTop()
  }
  if (action === 'dock') {
    // 开关作用于当前运行的整组便签：关闭时解除已有贴靠并恢复完整纸张。
    const enabled = value !== false
    dockPreference = enabled
    for (const other of windows.values()) {
      if (other.content.type !== 'text') continue
      other.dockEnabled = enabled
      if (enabled) other.dockArmed = true
      else {
        undockNote(other)
      }
      if (other.ready && !other.window.isDestroyed())
        other.window.webContents.send('tools-floating-dock-preference', enabled)
    }
    return enabled
  }
  if (action === 'undock') {
    // 点击收起色签时解除贴靠，恢复完整纸张并保留当前位置。
    if (content.type !== 'text' || entry.dock?.expanded !== false) return false
    const bounds = window.getBounds()
    return undockNote(entry, { x: bounds.x, y: bounds.y })
  }
  if (action === 'drag-end') {
    entry.dragging = false
    // 受控拖动已结束，立即识别最终边界，避免等待移出或观察器延时。
    if (content.type === 'text') {
      if (entry.undockedDuringDrag || value?.moved === false) return true
      entry.dockArmed = true
      updateDock(entry)
      if (entry.dock?.expanded) setDockExpanded(entry, false)
      else arrangeDockStack(entry)
    }
    return true
  }
  if (action === 'drag-start') {
    entry.dragging = true
    entry.undockedDuringDrag = false
    return true
  }
  if (action === 'move') {
    if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) throw new Error('窗口位置无效')
    // 收起形态下沿边缘拖动色签，拖离边缘则解除贴靠。
    if (content.type === 'text' && entry.dock?.expanded === false) {
      moveCollapsedDock(entry, value)
      return { bounds: window.getBounds(), undocked: !entry.dock }
    }
    // 固定最近一次缩放的逻辑尺寸；Windows 非整数 DPI 下复用 getBounds/setPosition 会逐次涨大。
    if (content.type === 'image') {
      const size = entry.normalSize ?? window.getBounds()
      window.setBounds({
        width: size.width,
        height: size.height,
        x: Math.round(value.x),
        y: Math.round(value.y)
      })
      return true
    }
    // 便签固定拖动开始时的尺寸，防止非整数 DPI 下 setPosition 反复读取舍入尺寸造成纸张变大。
    return operate(sender, 'resize', { ...value, ...entry.normalSize })
  }
  if (action === 'resize') {
    // 各边缘使用同一受限入口；左侧与顶部缩放同时移动原点，保持对侧边缘稳定。
    if (!Number.isFinite(value?.width) || !Number.isFinite(value?.height))
      throw new Error('窗口尺寸无效')
    const bounds = window.getBounds()
    const requested = {
      width: Math.max(
        content.type === 'text' ? 220 : content.edit ? 320 : 96,
        Math.min(3000, value.width)
      ),
      height: Math.max(
        content.type === 'text' ? 140 : content.edit ? 180 : 64,
        Math.min(3000, value.height)
      )
    }
    // 图片悬浮按原图比例取尺寸，窗口与图片始终重合，缩放过程中不再出现透明留白。
    const locked = lockFloatingImageSize(entry, requested, value.direction)
    const proportional = content.type === 'image' && !content.edit
    entry.normalSize = { width: Math.round(locked.width), height: Math.round(locked.height) }
    const anchor = resizeAnchor(bounds, entry.normalSize, value, proportional)
    window.setBounds({ x: anchor.x, y: anchor.y, ...entry.normalSize })
    return true
  }
  if (action === 'fit-image' && content.type === 'image') {
    // 工具栏完成实际换行后，以原图比例重新贴合一次；之后用户缩放不再被覆盖。
    if (![value?.width, value?.height, value?.toolbar].every(Number.isFinite))
      throw new Error('图片尺寸无效')
    const area = screen.getDisplayMatching(window.getBounds()).workArea
    const margin = content.edit ? 16 : 0
    const minWidth = content.edit ? 320 : 96
    const minHeight = content.edit ? 180 : 64
    const maxWidth = Math.max(minWidth, area.width - 48)
    const maxHeight = Math.max(minHeight, area.height - 48)
    const scale = Math.min(
      1,
      (maxWidth - margin) / Math.max(1, value.width),
      (maxHeight - value.toolbar - margin) / Math.max(1, value.height)
    )
    entry.normalSize = content.edit
      ? {
          width: Math.max(minWidth, Math.round(value.width * scale + margin)),
          height: Math.max(minHeight, Math.round(value.height * scale + value.toolbar + margin))
        }
      : {
          width: Math.max(1, Math.round(value.width * scale)),
          height: Math.max(1, Math.round(value.height * scale))
        }
    window.setSize(entry.normalSize.width, entry.normalSize.height)
    const bounds = window.getBounds()
    window.setPosition(
      Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)),
      Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))
    )
    return true
  }
  if (action === 'copy-text') {
    clipboard.writeText(String(value))
    return true
  }
  if (action === 'copy-image' || action === 'save-image') {
    if (
      typeof value !== 'string' ||
      !value.startsWith('data:image/png;base64,') ||
      value.length > 100_000_000
    )
      throw new Error('无效图片')
    const image = nativeImage.createFromDataURL(value)
    if (image.isEmpty()) throw new Error('图片解码失败')
    if (action === 'copy-image') {
      clipboard.writeImage(image)
      return true
    }
    const result = await dialog.showSaveDialog(window, {
      defaultPath: '标记图片.png',
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })
    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, image.toPNG())
      return true
    }
    return false
  }
  throw new Error('不支持的悬浮操作')
}

/**
 * 将文字追加到最近便签，或按明确意图创建独立图片窗口和新便签。
 * @param input 用户选中或从剪贴板历史明确打开的内容。
 * @returns 接收内容的目标窗口标识。
 * @throws {Error} 输入无效或窗口加载失败时抛出。
 */
export async function openFloating(input: FloatingContent): Promise<number> {
  if (!registered) {
    ipcMain.handle('tools-floating', (event, action, value) => operate(event.sender, action, value))
    registered = true
  }
  if (!input || !['text', 'image'].includes(input.type)) throw new Error('不支持的悬浮内容')
  const content: FloatingContent = { ...input, id: input.id || crypto.randomUUID() }
  let imageWidth = 820
  let imageSize: { width: number; height: number } | undefined
  if (input.type === 'image') {
    if (
      typeof input.image !== 'string' ||
      !/^data:image\//.test(input.image) ||
      input.image.length > 100_000_000
    )
      throw new Error('无效图片')
    const decoded = nativeImage.createFromDataURL(input.image)
    if (decoded.isEmpty()) throw new Error('图片解码失败')
    imageSize = decoded.getSize()
    imageWidth = imageSize.width + (content.edit ? 16 : 0)
  } else {
    if (typeof input.text !== 'string' || input.text.length > 1_000_000) throw new Error('无效便签')
    if (!input.newWindow) {
      // 默认追加到最近聚焦的存活便签；关闭后自然回退到其余便签，初始化中的窗口也可接收排队追加。
      const target = recentNote()
      if (target) {
        if (input.text) target.pendingText.push(input.text)
        publishNoteAdditions(target)
        if (target.ready) {
          setDockExpanded(target, true)
          target.window.show()
          target.window.focus()
        }
        return target.window.id
      }
    }
    // 编号与配色只属于当前桌面的一组便签，全部关闭后重新从第一张开始。
    if (!recentNote()) noteSequence = 0
    content.label = `便签 ${++noteSequence}`
    // 第一张便签为黄色，后续新窗口轮换纸色；不改动已有窗口或用户配置。
    const colors = ['#f3f0bd', '#c1f3bd', '#bdd7f3', '#f3cbbd', '#d3bdf3']
    content.color ||= colors[(noteSequence - 1) % colors.length]
  }
  const resource = path.join(app.getAppPath(), 'resources')
  // 主动新建时稍微错开位置，让上一张便签的标题栏仍可点选；保持在原显示器工作区内。
  const anchor = content.type === 'text' ? recentNote()?.window.getBounds() : undefined
  const workArea = anchor ? screen.getDisplayMatching(anchor).workArea : undefined
  const position =
    anchor && workArea
      ? {
          x: Math.max(workArea.x, Math.min(anchor.x + 28, workArea.x + workArea.width - 300)),
          y: Math.max(workArea.y, Math.min(anchor.y + 28, workArea.y + workArea.height - 280))
        }
      : {}
  const window = new BrowserWindow({
    ...position,
    title: content.type === 'text' ? content.label : content.edit ? '图片标记' : '图片悬浮',
    icon: getToolsWindowIcon(
      content.type === 'text' ? 'sticky-note' : content.edit ? 'image-annotate' : 'float-content'
    ),
    skipTaskbar: false,
    width:
      content.type === 'text'
        ? 300
        : Math.max(
            content.edit ? 320 : 96,
            Math.min(
              imageWidth,
              screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea.width - 48
            )
          ),
    height: content.type === 'text' ? 280 : 400,
    // 便签最小纸张尺寸由受限 resize 入口保证，原生窗口同时允许缩为边缘小标签。
    minWidth: content.type === 'text' ? 12 : content.edit ? 320 : 1,
    minHeight: content.type === 'text' ? 12 : content.edit ? 180 : 1,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    thickFrame: false,
    // 缩放统一走页面手柄与受限 resize 入口，禁用原生边缘缩放，避免绕过图片比例锁定。
    resizable: false,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(resource, 'tools-floating-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  // 图标与任务栏属于此独立窗口，不再依赖已经退出的剪贴板页面。
  applyToolsWindowIdentity(
    window,
    content.type === 'text' ? 'sticky-note' : content.edit ? 'image-annotate' : 'float-content'
  )
  const entry: FloatingEntry = {
    window,
    content,
    ready: false,
    pendingText: [] as string[],
    focused: ++focusSequence,
    dockEnabled: readDockPreference(),
    dockArmed: true
  }
  if (content.type === 'text') entry.normalSize = { width: 300, height: 280 }
  if (imageSize) entry.imageSize = imageSize
  windows.set(window.webContents.id, entry)
  window.on('focus', () => {
    entry.focused = ++focusSequence
  })
  // 独立窗口可在剪贴板退役后继续可见；隐藏、最小化或关闭立即销毁运行时。
  const senderId = window.webContents.id
  window.once('closed', () => {
    windows.delete(senderId)
    cancelDockAnimation(entry)
    refreshPointerWatch()
    content.image = undefined
    content.text = undefined
    entry.pendingText = []
    if (content.type === 'text' && !recentNote()) noteSequence = 0
  })
  window.on('hide', () => {
    if (!window.isDestroyed()) window.close()
  })
  window.on('minimize', () => {
    if (!window.isDestroyed()) window.close()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  try {
    await window.loadFile(path.join(resource, 'tools-floating.html'))
    if (!window.isDestroyed()) window.show()
    return window.id
  } catch (error) {
    window.destroy()
    throw error
  }
}
