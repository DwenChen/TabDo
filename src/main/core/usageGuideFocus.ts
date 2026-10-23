interface GuideFocusWindow {
  isDestroyed(): boolean
  isVisible(): boolean
  isFocused(): boolean
}

/** 仅为本次注册的教学覆盖窗口保留宿主前台，不豁免其它窗口或外部程序。 */
export class GuideOverlayFocusGate {
  private overlay?: GuideFocusWindow
  private revision = 0
  private timer?: ReturnType<typeof setTimeout>

  /**
   * 记录本次运行的准确窗口对象，旧注册的清理不能撤销新运行的身份。
   * @param overlay 所属控制器创建的覆盖窗口。
   * @returns 只注销本次身份并取消其待处理焦点检查的清理函数。
   */
  register(overlay: GuideFocusWindow): () => void {
    clearTimeout(this.timer)
    const revision = ++this.revision
    this.overlay = overlay
    return () => {
      if (revision !== this.revision) return
      clearTimeout(this.timer)
      this.overlay = undefined
      this.revision++
    }
  }

  /**
   * 等 Windows 完成一次焦点交接后，仅保留转入本次覆盖窗口的真实可见工具。
   * @param main 当前工具所属主窗口。
   * @param focused 获取当前真正聚焦的 Electron 窗口。
   * @param suppressed 查询现有原生模态或拖拽流程是否已抑制隐藏。
   * @param onExternal 仍为外部焦点时执行原有隐藏流程。
   * @returns 已登记覆盖窗口并接管本次延迟判断时为 true，否则继续原流程。
   */
  defer(
    main: GuideFocusWindow,
    focused: () => GuideFocusWindow | null,
    suppressed: () => boolean,
    onExternal: () => void
  ): boolean {
    const overlay = this.overlay
    if (!overlay || overlay.isDestroyed()) return false
    const revision = this.revision
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (
        revision !== this.revision ||
        main.isDestroyed() ||
        !main.isVisible() ||
        main.isFocused() ||
        suppressed()
      )
        return
      const target = focused()
      if (target === main) return
      // 只认精确注册对象；相同 URL、标题或同进程其它窗口均不能获得此豁免。
      if (
        target === overlay &&
        !overlay.isDestroyed() &&
        overlay.isVisible() &&
        overlay.isFocused()
      )
        return
      onExternal()
    }, 30)
    return true
  }
}
