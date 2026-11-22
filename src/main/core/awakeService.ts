import { powerSaveBlocker } from 'electron'
import databaseAPI from '../api/shared/database'

const SETTINGS_KEY = 'settings-general'
const DEFAULT_DURATION_MINUTES = 0
const MAX_DURATION_MINUTES = 24 * 60

export interface AwakeState {
  enabled: boolean
  keepDisplayOn: boolean
  durationMinutes: number
  expiresAt: number | null
  remainingMs: number | null
}

type AwakeStateHandler = (state: AwakeState) => void

/**
 * 宿主级唤醒服务，使用 Electron 电源阻塞器保持系统或屏幕唤醒。
 * 状态持久化到通用设置，托盘与设置页共享同一份运行时状态。
 */
class AwakeService {
  private enabled = false
  private keepDisplayOn = false
  private durationMinutes = DEFAULT_DURATION_MINUTES
  private expiresAt: number | null = null
  private blockerId: number | null = null
  private expiryTimer: NodeJS.Timeout | null = null
  private stateHandler: AwakeStateHandler | null = null

  /**
   * 注册状态变化回调，托盘菜单和设置页据此即时刷新。
   * @param handler 状态变化后调用的回调。
   * @returns 无返回值。
   */
  public setStateHandler(handler: AwakeStateHandler | null): void {
    this.stateHandler = handler
  }

  /**
   * 读取持久化设置并恢复唤醒状态，不覆盖其他通用设置。
   * @param settings 通用设置快照；省略时从数据库读取。
   * @returns 当前唤醒状态。
   */
  public syncFromSettings(settings?: any): AwakeState {
    const data = settings || databaseAPI.dbGet(SETTINGS_KEY) || {}
    this.enabled = data.awakeEnabled === true
    this.keepDisplayOn = data.awakeKeepDisplayOn === true
    this.durationMinutes = this.normalizeDuration(data.awakeDurationMinutes)
    if (!this.enabled) {
      this.stopRuntime()
      this.expiresAt = null
      return this.getState()
    }

    // 启动时重新计时，避免把上次运行的剩余时间错误地跨进程继承。
    this.applyPowerBlocker()
    this.scheduleExpiry()
    return this.getState()
  }

  /**
   * 开启或关闭唤醒，并同步持久化设置。
   * @param enabled 是否保持系统唤醒。
   * @returns 更新后的唤醒状态。
   */
  public setEnabled(enabled: boolean): AwakeState {
    const next = enabled === true
    if (this.enabled === next) return this.getState()

    this.enabled = next
    if (next) {
      this.applyPowerBlocker()
      this.scheduleExpiry()
    } else {
      this.stopRuntime()
      this.expiresAt = null
    }
    this.persist({ awakeEnabled: this.enabled })
    this.emitState()
    return this.getState()
  }

  /**
   * 设置是否一并阻止显示器休眠。
   * @param value 是否保持屏幕点亮。
   * @returns 更新后的唤醒状态。
   */
  public setKeepDisplayOn(value: boolean): AwakeState {
    const next = value === true
    if (this.keepDisplayOn === next) return this.getState()

    this.keepDisplayOn = next
    // 阻塞类型不同，必须替换现有 blocker 才能立即生效。
    if (this.enabled) this.applyPowerBlocker()
    this.persist({ awakeKeepDisplayOn: this.keepDisplayOn })
    this.emitState()
    return this.getState()
  }

  /**
   * 设置有限时长，0 表示无限期。
   * @param minutes 持续时间（分钟），会被限制在 0–1440。
   * @returns 更新后的唤醒状态。
   */
  public setDuration(minutes: number): AwakeState {
    const next = this.normalizeDuration(minutes)
    if (this.durationMinutes === next) return this.getState()

    this.durationMinutes = next
    if (this.enabled) this.scheduleExpiry()
    this.persist({ awakeDurationMinutes: this.durationMinutes })
    this.emitState()
    return this.getState()
  }

  /**
   * 读取当前唤醒状态与剩余时间。
   * @returns 当前状态的只读快照。
   */
  public getState(): AwakeState {
    const remainingMs =
      this.enabled && this.expiresAt ? Math.max(0, this.expiresAt - Date.now()) : null
    return {
      enabled: this.enabled,
      keepDisplayOn: this.keepDisplayOn,
      durationMinutes: this.durationMinutes,
      expiresAt: this.enabled ? this.expiresAt : null,
      remainingMs
    }
  }

  /**
   * 停止电源阻塞和计时器但不写回设置，用于应用退出。
   * @returns 无返回值。
   */
  public stop(): void {
    this.stopRuntime()
  }

  /**
   * 根据当前选项启动对应的电源阻塞器。
   * @returns 无返回值。
   */
  private applyPowerBlocker(): void {
    this.stopPowerBlocker()
    // prevent-display-sleep 同时保留系统唤醒，关闭屏幕点亮时使用应用级阻塞。
    this.blockerId = powerSaveBlocker.start(
      this.keepDisplayOn ? 'prevent-display-sleep' : 'prevent-app-suspension'
    )
  }

  /**
   * 停止现有电源阻塞器。
   * @returns 无返回值。
   */
  private stopPowerBlocker(): void {
    if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) {
      powerSaveBlocker.stop(this.blockerId)
    }
    this.blockerId = null
  }

  /**
   * 停止计时器和电源阻塞器。
   * @returns 无返回值。
   */
  private stopRuntime(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer)
      this.expiryTimer = null
    }
    this.stopPowerBlocker()
  }

  /**
   * 按当前持续时间安排自动关闭，0 分钟表示不设上限。
   * @returns 无返回值。
   */
  private scheduleExpiry(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer)
      this.expiryTimer = null
    }
    if (this.durationMinutes <= 0) {
      this.expiresAt = null
      return
    }

    const durationMs = this.durationMinutes * 60_000
    this.expiresAt = Date.now() + durationMs
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null
      this.enabled = false
      this.expiresAt = null
      this.stopPowerBlocker()
      this.persist({ awakeEnabled: false })
      this.emitState()
    }, durationMs)
  }

  /**
   * 归一化持久化时长，非法值回退为无限期。
   * @param value 原始分钟数。
   * @returns 0–1440 之间的整数分钟。
   */
  private normalizeDuration(value: unknown): number {
    const minutes = Number(value)
    if (!Number.isFinite(minutes) || minutes <= 0) return 0
    return Math.min(MAX_DURATION_MINUTES, Math.round(minutes))
  }

  /**
   * 合并写回唤醒字段，保留其他通用设置。
   * @param patch 需要更新的唤醒字段。
   * @returns 无返回值。
   */
  private persist(patch: Record<string, unknown>): void {
    const settings = databaseAPI.dbGet(SETTINGS_KEY) || {}
    databaseAPI.dbPut(SETTINGS_KEY, { ...settings, ...patch })
  }

  /**
   * 通知外部状态已变化。
   * @returns 无返回值。
   */
  private emitState(): void {
    this.stateHandler?.(this.getState())
  }
}

export default new AwakeService()
