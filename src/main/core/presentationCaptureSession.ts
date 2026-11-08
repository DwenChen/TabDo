import { session, type Session } from 'electron'

const slots: Array<{ capture: Session; busy: boolean }> = []

/**
 * 租用独立的临时捕获分区；分区按同时存在的会话数量增长，退出清空后才可复用。
 * @returns 当前独占的Session及幂等归还操作；不读写插件持久分区。
 */
export function acquirePresentationCaptureSession(): {
  capture: Session
  release: () => Promise<void>
} {
  let slot = slots.find((item) => !item.busy)
  if (!slot) {
    // Electron会保留已创建的Session；不再为每次开关创建永久增长的新分区。
    slot = {
      capture: session.fromPartition(`presentation-capture-${slots.length}`, { cache: false }),
      busy: false
    }
    slots.push(slot)
  }
  const leased = slot
  leased.busy = true
  let releasing: Promise<void> | undefined
  return {
    capture: leased.capture,
    /**
     * 所属窗口与任务全部结束后归还分区，撤销权限闭包并清理本次临时站点数据。
     * @returns 连接和临时数据清理完成后的Promise；重复调用共享同次结果。
     */
    release(): Promise<void> {
      if (releasing) return releasing
      leased.capture.setPermissionRequestHandler(null)
      leased.capture.setDisplayMediaRequestHandler(null)
      releasing = (async () => {
        // 清理仅针对本次内存分区，插件数据、项目与录制素材均位于其他位置。
        await leased.capture.closeAllConnections()
        await leased.capture.clearStorageData()
        leased.busy = false
      })()
      return releasing
    }
  }
}
