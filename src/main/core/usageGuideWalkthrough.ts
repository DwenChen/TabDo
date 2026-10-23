import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  screen,
  webContents,
  type Rectangle,
  type WebContents
} from 'electron'
import path from 'node:path'
import database from '../api/shared/database'
import lmdb from './lmdb/lmdbInstance'
import pluginManager from '../managers/pluginManager'
import windowManager from '../managers/windowManager'
import clipboardManager from '../managers/clipboardManager'
import detachedWindows from './detachedWindowManager'
import { getPluginDocId } from '../../shared/pluginRuntimeNamespace'
import { GUIDE_STEPS, type GuideStep } from '../../shared/usageGuideSteps'
import {
  guideDomEvidenceScript,
  guideNoteEvidenceScript,
  snapshotGuideFiles,
  verifyGuideStep,
  type GuideEvidence
} from './usageGuideVerification'
import { getInternalPluginPath } from './internalPlugins'
import {
  awaitGuideOperation,
  guideAttachedViewBounds,
  guideCardRectangle,
  guideCreationOrder,
  guideFileBaseline,
  guideSpotlightRectangle,
  GuideNativeDialogScope
} from './usageGuideRuntime'

interface WalkthroughOptions {
  workspace: string
  launchTool: (code: string) => Promise<any>
  openSettings: (route: string) => Promise<any>
  finish: (report: { completed: string[]; skipped: string[] }) => void
  fail: (message: string) => void
  resourceRoot?: string
}

/**
 * 解析随包引导资源；正式包中的 preload 必须使用物理展开目录。
 * @param name 受信任的本地资源名称。
 * @param root 可选的受信任资源目录，供物理资源加载验证使用。
 * @returns 绝对文件路径。
 */
function resource(name: string, root?: string): string {
  if (root) return path.join(root, name)
  return path.join(
    app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
    'resources',
    name
  )
}

/**
 * 用独立全屏透明窗口提供分步提示，实际交互仍发生在真实工具或设置窗口。
 */
export class UsageGuideWalkthrough {
  private overlay: BrowserWindow
  private index = -1
  private phase: 'welcome' | 'active' | 'success' | 'finished' = 'welcome'
  private completed: string[] = []
  private skipped: string[] = []
  private before: GuideEvidence = {}
  private generation = 0
  private busy = false
  private opening = false
  private entering = false
  private stepController = new AbortController()
  private launchPending?: Promise<any>
  private disposed = false
  private error = ''
  private target: WebContents | undefined
  private placed = new Set<number>()
  private elevated = new Set<number>()
  private activeTargetContents?: number
  private stable = ''
  private stableAt = 0
  private nativeConfirmed = false
  private nextTimer?: ReturnType<typeof setTimeout>
  private timer: ReturnType<typeof setInterval>
  private mouseTimer: ReturnType<typeof setInterval>
  private area: Rectangle
  private card: Rectangle
  private spotlight: Rectangle | null = null
  private highlighted?: WebContents
  private anchorFound = false
  private scrolled = new Set<string>()
  private targetContentBounds: Rectangle | null = null
  private targetWindowBounds: Rectangle | null = null
  private spotlightTargetId: number | null = null
  private spotlightContentBounds: Rectangle | null = null
  private cardSize = { width: 350, height: 560 }
  private rendered = false
  private ignoresMouse = false
  private startupTimer?: ReturnType<typeof setTimeout>
  private nativeDialogs: GuideNativeDialogScope
  private dialogAdvanceGeneration?: number
  private dialogRevision = 0
  private releaseGuideFocus?: () => void

  /**
   * 建立覆盖窗口与严格限定 sender 的通信，计时器只属于本次体验。
   * @param options 本次桌面目录、受控启动器与退出回调。
   * @returns 新的引导控制器。
   */
  constructor(private options: WalkthroughOptions) {
    this.area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds
    this.card = guideCardRectangle(this.area, this.cardSize, null)
    this.overlay = new BrowserWindow({
      ...this.area,
      fullscreenable: false,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      thickFrame: false,
      title: 'TabDo 使用引导',
      icon: path.join(getInternalPluginPath('setting'), app.isPackaged ? '' : 'public', 'logo.png'),
      webPreferences: {
        preload: resource('usage-guide-preload.cjs', options.resourceRoot),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    this.overlay.setAlwaysOnTop(true, 'screen-saver')
    this.nativeDialogs = new GuideNativeDialogScope((active) => this.onNativeDialogState(active))
    this.releaseGuideFocus = windowManager.registerUsageGuideOverlay(this.overlay)
    this.overlay.setContentProtection(true)
    // 覆盖层只接收自己的按钮请求，不向工具页开放任意推进或伪造完成的接口。
    ipcMain.handle('usage-guide:action', (event, action) => {
      if (event.sender !== this.overlay.webContents || this.disposed)
        throw new Error('引导窗口已退出')
      return this.action(action)
    })
    this.overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.overlay.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault()
        this.finish()
      }
    })
    this.overlay.webContents.on('will-navigate', (event) => event.preventDefault())
    this.overlay.on('close', () => {
      if (!this.disposed) this.finish()
    })
    this.overlay.webContents.once('did-finish-load', () => {
      // 文档加载不代表脚本已运行；等待界面实际渲染的回执再占用屏幕。
      this.publish()
    })
    this.overlay.webContents.once('preload-error', (_event, _file, error) =>
      this.failStartup(error.message)
    )
    this.overlay.webContents.on('render-process-gone', (_event, details) =>
      this.failStartup(`引导页面进程退出：${details.reason}`)
    )
    this.startupTimer = setTimeout(() => this.failStartup('引导内容加载超时'), 10000)
    void this.overlay
      .loadFile(resource('usage-guide.html', options.resourceRoot))
      .catch((error) => this.failStartup(error.message))
    this.timer = setInterval(() => {
      void this.check()
    }, 250)
    // 鼠标在提示卡之外时透传给真实桌面和工具；不依赖网页模拟点击。
    this.mouseTimer = setInterval(() => {
      if (this.disposed || this.overlay.isDestroyed() || !this.rendered) return
      const pointer = screen.getCursorScreenPoint(),
        x = pointer.x - this.area.x,
        y = pointer.y - this.area.y
      const interactive =
        this.phase === 'welcome' ||
        this.phase === 'finished' ||
        (x >= this.card.x &&
          x <= this.card.x + this.card.width &&
          y >= this.card.y &&
          y <= this.card.y + this.card.height)
      // 按显示帧频跟随指针，只在命中区域改变时调用原生接口，减少跨卡片点击的滞后。
      if (this.ignoresMouse !== !interactive) {
        this.ignoresMouse = !interactive
        this.overlay.setIgnoreMouseEvents(this.ignoresMouse, { forward: true })
      }
    }, 16)
  }

  /**
   * 界面未就绪或渲染进程失败时立即释放覆盖层，不能留下透明的点击拦截窗口。
   * @param message 加载失败或进程退出的诊断。
   * @returns 无返回值；关闭覆盖窗口并通知所属引导实例退出。
   */
  private failStartup(message: string): void {
    if (this.disposed) return
    console.error('[UsageGuide] 界面加载失败:', message)
    this.overlay.setIgnoreMouseEvents(true)
    this.dispose()
    this.options.fail(`引导界面加载失败：${message}`)
  }

  /**
   * 发布纯展示状态，不传递识别全文、原图或正式用户资料。
   * @returns 无返回值。
   */
  private publish(): void {
    if (this.disposed || this.overlay.isDestroyed()) return
    const chapters = [...new Set(GUIDE_STEPS.map((step) => step.chapter))]
    const chapter = GUIDE_STEPS[this.index]?.chapter
    const targetWindow = this.target ? this.surface(this.target)?.window : undefined
    const spotlightWindow = this.highlighted ? this.surface(this.highlighted)?.window : undefined
    this.overlay.webContents.send('usage-guide:state', {
      windowBounds: this.overlay.getBounds(),
      displayBounds: this.area,
      phase: this.phase,
      index: this.index,
      total: GUIDE_STEPS.length,
      chapterIndex: chapter ? chapters.indexOf(chapter) + 1 : 0,
      chapterTotal: chapters.length,
      step: GUIDE_STEPS[this.index],
      completed: this.completed.length,
      skipped: this.skipped.length,
      workspace: this.options.workspace,
      error: this.error,
      card: this.card,
      spotlight: this.spotlight,
      anchorFound: this.anchorFound,
      targetId: this.target?.isDestroyed() === false ? this.target.id : null,
      targetContentBounds: this.targetContentBounds,
      targetWindowBounds: this.targetWindowBounds,
      spotlightTargetId: this.spotlightTargetId,
      spotlightContentBounds: this.spotlightContentBounds,
      ...(process.env.TABDO_E2E === '1'
        ? {
            targetWindowHandle: this.nativeWindowHandle(targetWindow),
            spotlightWindowHandle: this.nativeWindowHandle(spotlightWindow || targetWindow),
            overlayWindowHandle: this.nativeWindowHandle(this.overlay),
            targetProcessId: process.pid,
            targetWindowTitle: targetWindow?.getTitle() || ''
          }
        : {}),
      opening: this.opening || this.entering || this.nativeDialogs.active,
      nativeDialog: this.nativeDialogs.active,
      busy: this.busy
    })
  }

  /**
   * 为原生桌面验收提供所属窗口身份，避免用仅有 DOM 的证据冒充屏幕可操作。
   * @param win 当前隔离实例已确认归属的窗口。
   * @returns Windows HWND 的十进制表示；非 Windows 或窗口失效时为空字符串。
   */
  private nativeWindowHandle(win: BrowserWindow | undefined): string {
    if (process.platform !== 'win32' || !win || win.isDestroyed()) return ''
    try {
      const handle = win.getNativeWindowHandle()
      return handle.length >= 8
        ? handle.readBigUInt64LE().toString()
        : String(handle.readUInt32LE())
    } catch {
      return ''
    }
  }

  /**
   * 原生文件窗口显示期间让出全屏覆盖层，重复操作合并且嵌套调用等待全部收束。
   * @param operation 打开或保存对话框的受控原生操作。
   * @returns 对话框的实际完成或取消结果。
   * @throws 所属引导已退出或原生操作失败时抛错。
   */
  public async withNativeDialog<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) throw new Error('引导已退出，无法打开文件对话框')
    return this.nativeDialogs.run(operation)
  }

  /**
   * 暂停检查与自动换步，原生窗口关闭后只恢复仍属于当前体验的覆盖窗口。
   * @param active 是否仍有原生文件对话框在运行。
   * @returns 无返回值；退出后的迟到回调不会显示旧覆盖层。
   */
  private onNativeDialogState(active: boolean): void {
    if (this.disposed || this.overlay.isDestroyed()) return
    this.dialogRevision++
    if (active) {
      clearTimeout(this.nextTimer)
      this.dialogAdvanceGeneration = this.phase === 'success' ? this.generation : undefined
      // 先发布可观测状态，再隐藏，避免透明置顶覆盖层挡住真实 Windows 模态窗口。
      this.publish()
      this.overlay.hide()
      return
    }
    this.publish()
    if (!GUIDE_STEPS[this.index]?.native || !this.opening) this.overlay.showInactive()
    if (this.dialogAdvanceGeneration === this.generation && this.phase === 'success') {
      const generation = this.generation
      this.nextTimer = setTimeout(() => {
        if (!this.disposed && generation === this.generation && !this.nativeDialogs.active)
          void this.enter(this.index + 1)
      }, 650)
    }
    this.dialogAdvanceGeneration = undefined
  }

  /**
   * 接收明确的开始、重试、设置或跳过操作；没有“标记完成”捷径。
   * @param action 覆盖窗口中的受限动作或实测卡片尺寸。
   * @returns 操作完成后的 Promise。
   * @throws 不支持的动作时抛错。
   */
  private async action(
    action: string | { type: 'layout'; width: number; height: number }
  ): Promise<void> {
    if (typeof action === 'object' && action?.type === 'layout') {
      const { width, height } = action
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 100 || height < 80) return
      this.cardSize = {
        width: Math.min(this.area.width - 24, Math.ceil(width)),
        height: Math.min(this.area.height - 24, Math.ceil(height))
      }
      const card = guideCardRectangle(this.area, this.cardSize, this.spotlight)
      if (JSON.stringify(card) !== JSON.stringify(this.card)) {
        this.card = card
        this.publish()
      }
      return
    }
    if (action === 'mounted' && !this.rendered) {
      this.rendered = true
      clearTimeout(this.startupTimer)
      // 页面和按钮已渲染后才显示全屏窗口，加载失败期间保持桌面可点击。
      this.overlay.show()
      this.overlay.setBounds(this.area)
      this.publish()
      if (process.connected) process.send?.('usage-guide:ready')
      return
    }
    if (action === 'begin' && this.phase === 'welcome') return this.enter(0)
    if (action === 'finish') return this.finish()
    // 启动请求尚未收束时不再创建第二个工具实例，退出始终可以立即执行。
    if (this.opening || this.entering || this.nativeDialogs.active) return
    if (action === 'skip' && this.phase === 'active') {
      this.skipped.push(GUIDE_STEPS[this.index].id)
      return this.enter(this.index + 1)
    }
    if (action === 'skip-chapter' && this.phase === 'active') {
      const chapter = GUIDE_STEPS[this.index].chapter
      let next = this.index
      while (GUIDE_STEPS[next]?.chapter === chapter) {
        this.skipped.push(GUIDE_STEPS[next].id)
        next++
      }
      return this.enter(next)
    }
    if (action === 'retry' && this.phase === 'active') return this.openCurrent()
    if (action === 'settings' && this.phase === 'active') {
      const generation = this.generation
      this.opening = true
      this.publish()
      try {
        await awaitGuideOperation(
          this.options.openSettings('Providers&tab=ocr'),
          this.stepController.signal,
          15000,
          '打开相关设置'
        )
        if (this.disposed || generation !== this.generation) return
        this.target = this.findContents('setting')
        this.placeTarget()
      } finally {
        if (generation === this.generation) this.opening = false
        this.publish()
      }
      return
    }
    throw new Error('当前引导动作不可用')
  }

  /**
   * 进入下一步前建立实际基线并清除旧异步状态。
   * @param index 新步骤下标。
   * @returns 新步骤准备完成后的 Promise。
   */
  private async enter(index: number): Promise<void> {
    if (this.disposed || this.entering || this.nativeDialogs.active) return
    this.entering = true
    this.stepController.abort()
    this.stepController = new AbortController()
    const generation = ++this.generation
    const previous = GUIDE_STEPS[this.index]
    const step = GUIDE_STEPS[index]
    const previousFiles = this.before.files
    clearTimeout(this.nextTimer)
    try {
      await this.clearHighlight()
      if (this.disposed || generation !== this.generation) return
      // 连续子步骤共享真实会话；跨章后才关闭本次练习的悬浮窗口。
      const sameTool = Boolean(previous?.tool && previous.tool === step?.tool)
      const sameRoute = Boolean(previous?.route && previous.route === step?.route)
      if (previous?.tool && !sameTool && step?.launch !== 'manual') {
        for (const contents of this.floatingContents())
          BrowserWindow.fromWebContents(contents)?.close()
      }
      this.index = index
      this.error = ''
      this.scrolled.clear()
      this.stable = ''
      this.nativeConfirmed = false
      this.anchorFound = false
      if (!sameTool && !sameRoute) this.target = undefined
      this.spotlight = null
      this.targetContentBounds = null
      this.targetWindowBounds = null
      this.spotlightTargetId = null
      this.spotlightContentBounds = null
      this.card = guideCardRectangle(this.area, this.cardSize, null)
      this.phase = index >= GUIDE_STEPS.length ? 'finished' : 'active'
      if (this.phase === 'finished') return
      // 设置课程结束后释放所属独立设置页，不能让旧置顶设置挡住后续工具。
      if (!step.route) this.closeSettingsWindows()
      this.before = await this.evidence(step, false)
      // 用户可在参数预览阶段直接执行；结果步骤仍核对同工具最初的源文件身份。
      this.before.files = guideFileBaseline(
        previous?.tool,
        step.tool,
        previousFiles,
        this.before.files
      )
      if (this.disposed || generation !== this.generation) return
      this.publish()
      if (!step.native && step.launch !== 'manual' && step.launch !== 'panel') {
        if ((sameTool || sameRoute) && this.target && this.surface(this.target)) {
          this.placeTarget()
          await this.captureToolBaseline(step)
        } else await this.openCurrent()
      }
    } catch (cause) {
      if (!this.disposed && generation === this.generation)
        this.error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (generation === this.generation) this.entering = false
      this.publish()
    }
  }

  /**
   * 从真实宿主启动本步，原生选区期间隐藏覆盖层，取消保留本步。
   * @returns 启动和窗口定位完成后的 Promise。
   */
  private async openCurrent(): Promise<void> {
    const step = GUIDE_STEPS[this.index],
      generation = this.generation
    if (!step || this.disposed || this.opening || this.nativeDialogs.active) return
    if (step.launch === 'panel' || (!step.tool && !step.route)) return
    this.opening = true
    this.error = ''
    this.publish()
    try {
      if (!step.route) this.closeSettingsWindows()
      // 已存在的课程窗口只恢复显示，重复点击不会重建页面或丢弃当前练习状态。
      if (
        !step.native &&
        this.target &&
        this.surface(this.target) &&
        (await this.targetReady(step, this.target))
      ) {
        const surface = this.surface(this.target)!
        surface.window.show()
        surface.window.focus()
        this.activeTargetContents = undefined
        this.placeTarget()
        await this.captureToolBaseline(step)
        return
      }
      if (this.disposed || generation !== this.generation) return
      if (this.launchPending) throw new Error('上一次工具请求仍在收尾，可跳过或结束引导。')
      if (step.native) this.overlay.hide()
      const pending = Promise.resolve().then(() =>
        step.route ? this.options.openSettings(step.route) : this.options.launchTool(step.tool!)
      )
      this.launchPending = pending
      // 只合并当前请求；迟到的请求不能清除后来请求的引用。
      void pending.then(
        () => {
          if (this.launchPending === pending) this.launchPending = undefined
        },
        () => {
          if (this.launchPending === pending) this.launchPending = undefined
        }
      )
      const result = await awaitGuideOperation(
        pending,
        this.stepController.signal,
        step.native ? 180000 : 15000,
        '打开工具'
      )
      if (this.disposed || generation !== this.generation) return
      if (step.native) {
        this.nativeConfirmed = Boolean(result?.success && (result.image || result.hex))
        if (!this.nativeConfirmed) this.error = result?.error || '操作已取消，可重新打开。'
        if (!this.nativeDialogs.active) this.overlay.showInactive()
      } else {
        if (result?.success === false) throw new Error(result.error || '工具未打开，请重试或跳过。')
        await this.waitForTarget(step, generation)
        if (this.disposed || generation !== this.generation) return
        this.placeTarget()
        await this.captureToolBaseline(step)
      }
    } catch (cause) {
      if (this.disposed || generation !== this.generation) return
      this.error = cause instanceof Error ? cause.message : String(cause)
      if (!this.nativeDialogs.active) this.overlay.showInactive()
    } finally {
      if (generation === this.generation) this.opening = false
      this.publish()
    }
  }

  /**
   * 查找当前真实插件视图，退役的旧页不会作为完成证据。
   * @param name 内置插件名称。
   * @returns 当前视图或 undefined。
   */
  private findContents(name: string): WebContents | undefined {
    const current = pluginManager.getCurrentPluginView()?.webContents
    if (
      current &&
      !current.isDestroyed() &&
      pluginManager.getPluginInfoByWebContents(current)?.name === name
    )
      return current
    return detachedWindows.getAllWindows().find((item) => item.pluginName === name)?.view
      .webContents
  }

  /**
   * 枚举当前隔离实例仍存活的独立便签与图片窗口，不引用正式实例的页面。
   * @returns 当前实例的悬浮 WebContents。
   */
  private floatingContents(): WebContents[] {
    return guideCreationOrder(
      webContents
        .getAllWebContents()
        .filter((item) => !item.isDestroyed() && item.getURL().includes('tools-floating.html'))
    )
  }

  /**
   * 找到当前课程应观察的真实页面，面板与工具选择分别保留各自的操作阶段。
   * @param step 当前课程。
   * @returns 当前可见的课程页面；尚未实际打开时返回 undefined。
   */
  private findTarget(step: GuideStep): WebContents | undefined {
    if (step.check === 'copy') return undefined
    if (step.check === 'panel-open' || step.check === 'panel-pinned' || step.launch === 'panel') {
      const panel = webContents.getAllWebContents().find((contents) => {
        if (contents.isDestroyed() || !contents.getURL().includes('super-panel.html')) return false
        const owner = BrowserWindow.fromWebContents(contents)
        return Boolean(owner && !owner.isDestroyed() && owner.isVisible())
      })
      if (panel || step.launch !== 'panel') return panel
    }
    if (step.tool === 'sticky-note' || step.tool === 'image-annotate') {
      const floating = this.floatingContents().filter((contents) =>
        this.surface(contents)?.window.isVisible()
      )
      if (step.check === 'note-expand') {
        const collapsed = this.before.notes?.find((note) => note.collapsed)
        const original = floating.find((contents) => contents.id === collapsed?.id)
        if (original) return original
      }
      return floating.at(-1)
    }
    if (!step.route && !step.tool) return undefined
    return this.findContents(step.route ? 'setting' : 'system')
  }

  /**
   * 精确取得 WebContents 所属窗口和 WebContentsView 客户区，全部使用 Electron DIP。
   * @param contents 当前页面身份。
   * @returns 窗口与正文屏幕矩形；已销毁或退役页面返回 undefined。
   */
  private surface(contents: WebContents): { window: BrowserWindow; bounds: Rectangle } | undefined {
    if (contents.isDestroyed()) return undefined
    const detached = detachedWindows
      .getAllWindows()
      .find((item) => item.view.webContents === contents)
    const current = pluginManager.getCurrentPluginView()
    const view = detached?.view || (current?.webContents === contents ? current : undefined)
    const owner =
      detached?.window ||
      (view ? windowManager.getMainWindow() : BrowserWindow.fromWebContents(contents))
    if (!owner || owner.isDestroyed() || owner === this.overlay) return undefined
    const bounds = owner.getContentBounds()
    if (!view) return { window: owner, bounds }
    const child = guideAttachedViewBounds(owner.contentView, view)
    if (!child) return undefined
    return {
      window: owner,
      bounds: {
        x: bounds.x + child.x,
        y: bounds.y + child.y,
        width: child.width,
        height: child.height
      }
    }
  }

  /**
   * 等待课程实际正文挂载，避免把旧插件或只有空壳的首帧当成已打开。
   * @param step 当前课程。
   * @param contents 候选真实页面。
   * @returns 课程正文已就绪时返回 true。
   */
  private async targetReady(step: GuideStep, contents: WebContents): Promise<boolean> {
    if (contents.isDestroyed() || contents.isLoadingMainFrame()) return false
    const owner = this.surface(contents)?.window
    if (!owner || !owner.isVisible() || owner.isMinimized()) return false
    try {
      const result = await awaitGuideOperation(
        contents.executeJavaScript(guideDomEvidenceScript(step)),
        this.stepController.signal,
        1600,
        '等待工具正文'
      )
      return result?.toolReady === true
    } catch {
      return false
    }
  }

  /**
   * 在有界时限内追踪新工具，换步和退出会立即终止等待。
   * @param step 当前课程。
   * @param generation 发起启动时的步骤代次。
   * @returns 真实工具正文就绪后的 Promise。
   * @throws 工具正文在时限内未出现时抛错。
   */
  private async waitForTarget(step: GuideStep, generation: number): Promise<void> {
    const deadline = Date.now() + 12000
    while (!this.disposed && generation === this.generation && Date.now() < deadline) {
      const target = this.findTarget(step)
      if (
        target &&
        this.surface(target)?.window.isVisible() &&
        (await this.targetReady(step, target))
      ) {
        this.target = target
        return
      }
      await awaitGuideOperation(
        new Promise<void>((resolve) => setTimeout(resolve, 120)),
        this.stepController.signal,
        1000,
        '等待工具窗口'
      )
    }
    if (!this.disposed && generation === this.generation)
      throw new Error('工具正文未能加载，可重新打开、跳过或结束引导。')
  }

  /**
   * 为无明确目标值的扩展课程补充基线；当前明确目标与真实标注直接验证结果。
   * @param step 当前课程。
   * @returns 基线采集完成后的 Promise。
   */
  private async captureToolBaseline(step: GuideStep): Promise<void> {
    if (step.check !== 'tool-config' || this.before.toolState !== undefined) return
    // 明确的非默认目标不依赖准备期基线，用户在工具出现后立即操作也能被接受。
    if (step.configTargets?.length || step.tool === 'image-annotate') return
    const generation = this.generation
    let state: string | undefined
    let stableAt = Date.now()
    const deadline = Date.now() + 4000
    // 等样例与默认参数完成初次渲染，避免异步初始化自动满足“修改参数”。
    while (!this.disposed && generation === this.generation && Date.now() < deadline) {
      const evidence = await this.evidence(step)
      if (this.disposed || generation !== this.generation) return
      if (evidence.toolReady && evidence.toolState !== undefined) {
        if (state !== evidence.toolState) {
          state = evidence.toolState
          stableAt = Date.now()
        } else if (Date.now() - stableAt >= 500) {
          this.before.toolState = state
          return
        }
      }
      await awaitGuideOperation(
        new Promise<void>((resolve) => setTimeout(resolve, 150)),
        this.stepController.signal,
        1000,
        '等待初始参数'
      )
    }
    if (state !== undefined && generation === this.generation) this.before.toolState = state
  }

  /**
   * 释放隔离实例中已结束教学的独立设置窗口；设置数据仍保存在本次练习资料中。
   * @returns 无返回值；主宿主窗口由后续工具装配替换，不能直接关闭。
   */
  private closeSettingsWindows(): void {
    const main = windowManager.getMainWindow()
    for (const info of detachedWindows.getAllWindows()) {
      if (info.pluginName !== 'setting' || info.window === main || info.window.isDestroyed())
        continue
      info.window.close()
    }
  }

  /**
   * 将所属教学窗口提升到同一层级，仅首次发现或目标切换时调整顺序。
   * @param win 当前隔离实例创建的窗口。
   * @param selected 是否刚切换为当前教学目标。
   * @returns 无返回值；不聚焦窗口，不反复打断用户拖动或菜单。
   */
  private elevateWindow(win: BrowserWindow, selected = false): void {
    if (win.isDestroyed()) return
    const first = !this.elevated.has(win.id)
    if (first) this.elevated.add(win.id)
    if (first || selected) {
      // 便签默认已置顶，但仍须从默认层提升到与宿主工具相同的教学层级。
      win.setAlwaysOnTop(true, 'pop-up-menu')
      win.moveTop()
      if (!this.overlay.isDestroyed()) this.overlay.moveTop()
    }
  }

  /**
   * 教学窗口临时置顶并放在提示卡旁边，后续跟随拖动更新高亮区域。
   * @returns 无返回值。
   */
  private placeTarget(): void {
    if (!this.target || this.target.isDestroyed()) return
    const surface = this.surface(this.target)
    if (!surface) return
    const win = surface.window
    // 面板由真实鼠标位置决定，不能移动或聚焦它，否则 blur 会立刻把面板关闭。
    if (this.target.getURL().includes('super-panel.html')) {
      this.targetContentBounds = surface.bounds
      this.targetWindowBounds = win.getBounds()
      this.spotlight = guideSpotlightRectangle(
        { x: 0, y: 0, width: surface.bounds.width, height: surface.bounds.height },
        surface.bounds,
        this.area,
        1
      )
      this.card = guideCardRectangle(this.area, this.cardSize, this.spotlight)
      return
    }
    // 只提升当前隔离实例创建的教学窗口，避免被用户其他应用遮住。
    this.elevateWindow(win, this.activeTargetContents !== this.target.id)
    this.activeTargetContents = this.target.id
    if (!this.placed.has(win.id)) {
      this.placed.add(win.id)
      const available = Math.max(400, this.area.width - this.card.width - 70)
      const floatingIndex = this.target.getURL().includes('tools-floating.html')
        ? this.floatingContents().findIndex((contents) => contents === this.target)
        : 0
      const offset = Math.max(0, floatingIndex % 5) * 48
      const bounds = win.getBounds()
      const width = Math.min(available, bounds.width)
      const height = Math.min(this.area.height - 100, bounds.height)
      // 新便签错开标题栏，确保上一张便签仍能直接抓取和拖动。
      win.setBounds({
        x: this.area.x + Math.min(20 + offset, Math.max(20, this.area.width - width - 20)),
        y: this.area.y + Math.min(50 + offset, Math.max(20, this.area.height - height - 20)),
        width,
        height
      })
    }
    this.targetContentBounds = this.surface(this.target)?.bounds || null
    this.targetWindowBounds = win.getBounds()
    // 未找到具体目标时仅圈定正文区域；找到后由实时 DOM 矩形进一步收紧。
    if (this.targetContentBounds)
      this.spotlight = guideSpotlightRectangle(
        {
          x: 0,
          y: 0,
          width: this.targetContentBounds.width,
          height: this.targetContentBounds.height
        },
        this.targetContentBounds,
        this.area,
        1
      )
    this.card = guideCardRectangle(this.area, this.cardSize, this.spotlight)
    if (
      win.isVisible() &&
      !this.overlay.isVisible() &&
      !this.nativeDialogs.active &&
      !GUIDE_STEPS[this.index]?.native
    )
      this.overlay.showInactive()
  }

  /**
   * 收集当前步骤的只读证据，文件检查只限本次桌面目录。
   * @param step 当前课程。
   * @param includeDom 是否读取本步目标的正文；进入新步骤时先只采集外部基线。
   * @returns 有界的状态快照。
   */
  private async evidence(step: GuideStep, includeDom = true): Promise<GuideEvidence> {
    const signal = this.stepController.signal
    const target = this.target
    const evidence: GuideEvidence = {
      settings: database.dbGet('settings-general'),
      clipboard: clipboard.readText(),
      clipboardSequence: clipboardManager.getLastCopiedSequence()
    }
    if (
      ['rename', 'folder', 'image', 'video'].includes(step.check) ||
      [
        'file-renamer',
        'image-annotate',
        'image-batch',
        'image-manual-crop',
        'image-merge',
        'video-batch',
        'screen-recorder'
      ].includes(step.tool || '')
    )
      evidence.files = snapshotGuideFiles(this.options.workspace)
    if (step.tool === 'recognize' || step.tool === 'latex-recognize') {
      const value = lmdb.get(getPluginDocId('system', 'provider-tools-history'))
      evidence.history = value?.value ?? value?.data ?? []
    }
    if (step.check === 'web') {
      const value = lmdb.get(getPluginDocId('system', 'web-quick-open'))
      evidence.web = JSON.stringify(value?.value ?? value?.data ?? null)
    }
    if (step.check === 'provider-config')
      evidence.translationTarget =
        database.dbGet('provider-settings')?.params?.['builtin-google']?.to
    if (step.check === 'provider-enable')
      evidence.providerSettings = database.dbGet('provider-settings')
    if (step.native) evidence.dom = this.nativeConfirmed ? 'confirmed' : ''
    // 便签特性以全部可见便签的真实状态判定，新增窗口不能沿用旧目标的数量。
    if (step.tool === 'sticky-note' || step.check === 'clipboard-floating') {
      // 新悬浮窗可能在进入便签章节前出现，立即避免它被教学宿主工具遮住。
      for (const contents of this.floatingContents()) {
        const owner = this.surface(contents)?.window
        if (owner?.isVisible()) this.elevateWindow(owner)
      }
      const notes = await Promise.all(
        this.floatingContents()
          .filter((contents) => {
            const owner = this.surface(contents)?.window
            return Boolean(owner && owner.isVisible() && !owner.isMinimized())
          })
          .slice(-20)
          .map(async (contents) => {
            try {
              const note = await awaitGuideOperation(
                contents.executeJavaScript(guideNoteEvidenceScript()),
                signal,
                1000,
                '读取练习便签'
              )
              return note ? { ...note, id: contents.id } : null
            } catch {
              return null
            }
          })
      )
      evidence.notes = notes.filter((note) => note !== null)
    }
    const owner = target && !target.isDestroyed() ? this.surface(target)?.window : undefined
    if (includeDom && target && owner?.isVisible() && !owner.isMinimized()) {
      try {
        const result = await awaitGuideOperation(
          target.executeJavaScript(guideDomEvidenceScript(step)),
          signal,
          1600,
          '读取工具状态'
        )
        if (result && typeof result === 'object') Object.assign(evidence, result)
      } catch {
        // 关闭、超时或旧页面不提供完成证据，下一次检查可重新找到当前页面。
      }
    }
    if (step.check === 'panel-open' || step.check === 'panel-pinned') {
      const panel = this.findTarget(step)
      evidence.panel = { visible: Boolean(panel), pinned: false }
      if (includeDom && panel) {
        try {
          evidence.panel.pinned = await awaitGuideOperation(
            panel.executeJavaScript(
              `Boolean(document.querySelector('[data-guide-command="clipboard"], .pinned-grid .grid-item'))`
            ),
            signal,
            1000,
            '读取超级面板'
          )
        } catch {
          // 面板已隐藏时仍停留在当前操作步骤。
        }
      }
    }
    return evidence
  }

  /**
   * 持续跟随菜单、滚动与窗口位置，以实际可见 DOM 的矩形聚焦具体选项。
   * @param step 当前课程。
   * @returns 高亮处理完成后的 Promise。
   */
  private async highlight(step: GuideStep): Promise<void> {
    const generation = this.generation
    const target = this.target
    const contents = step.hostAnchor && target ? this.surface(target)?.window.webContents : target
    if (!contents || contents.isDestroyed()) return
    const surface = this.surface(contents)
    if (!surface || !surface.window.isVisible()) return
    const anchors = step.hostAnchor
      ? [step.hostAnchor]
      : [...(step.anchors || []), ...(step.anchor ? [step.anchor] : [])]
    this.anchorFound = false
    this.spotlightTargetId = null
    this.spotlightContentBounds = null
    if (!anchors.length) return
    const scrollKey = `${this.generation}:${contents.id}`
    const canScroll =
      !this.scrolled.has(scrollKey) && !contents.getURL().includes('super-panel.html')
    const rectangle = await awaitGuideOperation(
      contents.executeJavaScript(`(() => {
        const selectors = ${JSON.stringify(anchors)};
        const candidates = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
        const available = element => {
          const style = getComputedStyle(element), rectangle = element.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && rectangle.width > 0 && rectangle.height > 0;
        };
        const clipped = element => {
          const rectangle = element.getBoundingClientRect();
          let left = Math.max(0, rectangle.left), top = Math.max(0, rectangle.top);
          let right = Math.min(innerWidth, rectangle.right), bottom = Math.min(innerHeight, rectangle.bottom);
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
              left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
              top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
            }
          }
          return {x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
        };
        const visible = element => {
          if (!available(element)) return false;
          const rectangle = clipped(element);
          return rectangle.width > 0 && rectangle.height > 0;
        };
        let element = candidates.find(visible);
        if (!element && ${canScroll}) {
          element = candidates.find(available);
          element?.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'});
        }
        document.querySelectorAll('[data-usage-guide-highlight]').forEach(item => item.removeAttribute('data-usage-guide-highlight'));
        if (!element || !visible(element)) return null;
        element.dataset.usageGuideHighlight = 'true';
        if (!document.getElementById('usage-guide-target-style')) {
          const style = document.createElement('style');
          style.id = 'usage-guide-target-style';
          style.textContent = '[data-usage-guide-highlight]{outline:2px solid #10b981!important;outline-offset:3px!important}';
          document.head.append(style);
        }
        return clipped(element);
      })()`),
      this.stepController.signal,
      1600,
      '定位教学目标'
    )
    if (this.disposed || generation !== this.generation || target !== this.target) return
    if (!rectangle) return
    this.scrolled.add(scrollKey)
    this.highlighted = contents
    this.spotlightTargetId = contents.id
    this.spotlightContentBounds = surface.bounds
    this.spotlight = guideSpotlightRectangle(
      rectangle,
      surface.bounds,
      this.area,
      contents.getZoomFactor()
    )
    this.anchorFound = Boolean(this.spotlight)
    this.card = guideCardRectangle(this.area, this.cardSize, this.spotlight)
  }

  /**
   * 移除本步注入的临时强调，避免影响后续设置项。
   * @returns 清理结束后的 Promise。
   */
  private async clearHighlight(): Promise<void> {
    const contents = this.highlighted
    this.highlighted = undefined
    if (!contents || contents.isDestroyed()) return
    const controller = new AbortController()
    await awaitGuideOperation(
      contents.executeJavaScript(
        `document.querySelectorAll('[data-usage-guide-highlight]').forEach(element => element.removeAttribute('data-usage-guide-highlight')); document.getElementById('usage-guide-target-style')?.remove()`
      ),
      controller.signal,
      600,
      '清除教学目标'
    ).catch(() => {})
  }

  /**
   * 单次检查串行执行；结果稳定后自动推进，旧步骤迟到结果不能跳步。
   * @returns 检查结束后的 Promise。
   */
  private async check(): Promise<void> {
    if (
      this.disposed ||
      this.busy ||
      this.entering ||
      this.opening ||
      this.nativeDialogs.active ||
      this.phase !== 'active'
    )
      return
    this.busy = true
    const generation = this.generation,
      step = GUIDE_STEPS[this.index],
      dialogRevision = this.dialogRevision
    try {
      if (!step.native) {
        const target = this.findTarget(step)
        if (target !== this.target) {
          await this.clearHighlight()
          if (this.disposed || generation !== this.generation) return
          this.target = target
          this.anchorFound = false
          this.spotlight = null
        }
      }
      if (!this.target) {
        this.spotlight = null
        this.anchorFound = false
        this.targetContentBounds = null
        this.targetWindowBounds = null
        this.spotlightTargetId = null
        this.spotlightContentBounds = null
      }
      this.placeTarget()
      await this.highlight(step)
      if (
        this.disposed ||
        generation !== this.generation ||
        this.nativeDialogs.active ||
        dialogRevision !== this.dialogRevision
      )
        return
      const evidence = await this.evidence(step)
      if (
        this.disposed ||
        generation !== this.generation ||
        this.nativeDialogs.active ||
        dialogRevision !== this.dialogRevision ||
        step !== GUIDE_STEPS[this.index]
      )
        return
      // 首次正文必须先建立配置基线，再接受后续真实变化。
      if (step.check === 'tool-config' && this.before.toolState === undefined && evidence.toolReady)
        this.before.toolState = evidence.toolState
      if (verifyGuideStep(step, this.before, evidence)) {
        const signature = JSON.stringify(evidence)
        if (signature !== this.stable) {
          this.stable = signature
          this.stableAt = Date.now()
        }
        const delay = ['panel-open', 'panel-pinned', 'clipboard-menu', 'note-collapse'].includes(
          step.check
        )
          ? 200
          : 500
        if (Date.now() - this.stableAt >= delay) {
          this.completed.push(step.id)
          this.phase = 'success'
          this.nextTimer = setTimeout(() => {
            void this.enter(this.index + 1)
          }, 650)
        }
      } else this.stable = ''
    } catch (cause) {
      if (
        this.disposed ||
        generation !== this.generation ||
        this.nativeDialogs.active ||
        dialogRevision !== this.dialogRevision
      )
        return
      this.error = cause instanceof Error ? cause.message : String(cause)
      this.publish()
    } finally {
      this.busy = false
      this.publish()
    }
  }

  /**
   * 发送真实完成与跳过摘要，然后结束本次体验。
   * @returns 无返回值。
   */
  private finish(): void {
    const report = { completed: [...this.completed], skipped: [...this.skipped] }
    this.dispose()
    this.options.finish(report)
  }

  /**
   * 立即撤销检查、鼠标透传与异步推进，销毁覆盖窗口。
   * @returns 无返回值。
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.nativeDialogs.dispose()
    this.releaseGuideFocus?.()
    this.releaseGuideFocus = undefined
    this.stepController.abort()
    this.generation++
    clearInterval(this.timer)
    clearInterval(this.mouseTimer)
    clearTimeout(this.nextTimer)
    clearTimeout(this.startupTimer)
    ipcMain.removeHandler('usage-guide:action')
    void this.clearHighlight()
    if (!this.overlay.isDestroyed()) this.overlay.destroy()
  }
}
