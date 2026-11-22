import { globalShortcut, shell } from 'electron'
import { spawn } from 'node:child_process'
import dndManager from './dndManager.js'
import { WindowManager as NativeWindowManager } from './native/index.js'
import alwaysOnTopBorder, { type AlwaysOnTopBorderStyle } from './alwaysOnTopBorder.js'
import databaseAPI from '../api/shared/database'

const SETTINGS_KEY = 'settings-general'
export const DEFAULT_ALWAYS_ON_TOP_SHORTCUT = 'Shift+T'
const TEST_ACCELERATOR = 'Super+Control+F12'
const FALLBACK_COLOR = '#1A73E8'

// E2E 与用户正在运行的预览实例隔离，避免同一全局快捷键被占用导致测试误判。
export const ALWAYS_ON_TOP_ACCELERATOR =
  process.env.TABDO_E2E === '1' ? TEST_ACCELERATOR : DEFAULT_ALWAYS_ON_TOP_SHORTCUT

/** 窗口置顶功能的完整配置，外观选项对应通用设置中的置顶子项。 */
export interface AlwaysOnTopConfig {
  enabled: boolean
  shortcut: string
  borderEnabled: boolean
  colorMode: 'accent' | 'custom'
  borderColor: string
  opacity: number
  thickness: number
  roundedCorners: boolean
  playSound: boolean
}

export interface AlwaysOnTopToggleResult {
  success: boolean
  topmost?: boolean
  error?: string
}

export const DEFAULT_ALWAYS_ON_TOP_CONFIG: AlwaysOnTopConfig = {
  enabled: false,
  shortcut: DEFAULT_ALWAYS_ON_TOP_SHORTCUT,
  borderEnabled: true,
  colorMode: 'accent',
  borderColor: FALLBACK_COLOR,
  opacity: 100,
  thickness: 3,
  roundedCorners: true,
  playSound: true
}

/**
 * 归一化通用设置中的置顶配置，缺失或非法值回退到默认值。
 * @param settings 通用设置快照。
 * @returns 完整的置顶配置。
 */
export function readAlwaysOnTopConfig(settings: any): AlwaysOnTopConfig {
  const data = settings || {}
  const shortcut =
    typeof data.alwaysOnTopShortcut === 'string' && data.alwaysOnTopShortcut.trim()
      ? data.alwaysOnTopShortcut.trim()
      : DEFAULT_ALWAYS_ON_TOP_SHORTCUT
  const color =
    typeof data.alwaysOnTopBorderColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(data.alwaysOnTopBorderColor)
      ? data.alwaysOnTopBorderColor
      : FALLBACK_COLOR
  return {
    enabled: data.alwaysOnTopEnabled === true,
    shortcut,
    borderEnabled: data.alwaysOnTopBorderEnabled !== false,
    colorMode: data.alwaysOnTopBorderColorMode === 'custom' ? 'custom' : 'accent',
    borderColor: color,
    opacity: normalizeNumber(data.alwaysOnTopBorderOpacity, 100, 0, 100),
    thickness: normalizeNumber(data.alwaysOnTopBorderThickness, 3, 1, 10),
    roundedCorners: data.alwaysOnTopRoundedCorners !== false,
    playSound: data.alwaysOnTopPlaySound !== false
  }
}

/**
 * 把数值限制在整数区间内，非法值使用回退值。
 * @param value 原始值。
 * @param fallback 回退值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 区间内的整数。
 */
function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

/**
 * 计算当前应注册的全局快捷键；E2E 始终使用隔离组合。
 * @param shortcut 用户配置的快捷键。
 * @returns Electron accelerator 文本。
 */
function resolveAccelerator(shortcut: string): string {
  return process.env.TABDO_E2E === '1' ? TEST_ACCELERATOR : shortcut
}

/**
 * 构建切换指定窗口置顶状态的 PowerShell 脚本。
 * @param hwnd Windows 前台窗口句柄。
 * @returns 可直接交给 EncodedCommand 的脚本文本。
 */
function buildToggleScript(hwnd: number): string {
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TabDoTopMost {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
$handle = [IntPtr]${hwnd}
if (-not [TabDoTopMost]::IsWindow($handle)) {
  Write-Output 'ERROR:窗口已关闭'
  exit 1
}
$extendedStyle = [TabDoTopMost]::GetWindowLong($handle, -20)
$isTopMost = (($extendedStyle -band 0x00000008) -ne 0)
$insertAfter = if ($isTopMost) { [IntPtr](-2) } else { [IntPtr](-1) }
$success = [TabDoTopMost]::SetWindowPos($handle, $insertAfter, 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0010)
if (-not $success) {
  $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Write-Output "ERROR:SetWindowPos $code"
  exit 1
}
if ($isTopMost) { Write-Output 'TOPMOST_OFF' } else { Write-Output 'TOPMOST_ON' }
`
}

/**
 * 宿主级“窗口置顶”服务：注册可配置的全局快捷键切换前台窗口置顶状态，
 * 并为置顶窗口维护高亮边框与可选的置顶提示音，不再弹出 TabDo 通知。
 */
class AlwaysOnTopService {
  private config: AlwaysOnTopConfig = { ...DEFAULT_ALWAYS_ON_TOP_CONFIG }
  private registeredAccelerator: string | null = null
  private toggleQueue: Promise<AlwaysOnTopToggleResult> = Promise.resolve({ success: true })
  // 记录通过快捷键置顶的窗口，便于关闭或重新开启边框时统一处理。
  private pinnedHandles = new Set<number>()

  /**
   * 读取持久化设置并同步快捷键与边框状态。
   * @param settings 通用设置快照；省略时从数据库读取。
   * @returns 同步结果。
   */
  public syncFromSettings(settings?: any): { success: boolean; error?: string } {
    const data = settings || databaseAPI.dbGet(SETTINGS_KEY) || {}
    this.config = readAlwaysOnTopConfig(data)
    alwaysOnTopBorder.applyStyle(this.getBorderStyle())
    if (!this.config.enabled) {
      this.unregisterAccelerator()
      this.pinnedHandles.clear()
      alwaysOnTopBorder.stop()
      return { success: true }
    }
    return this.registerAccelerator(this.config.shortcut)
  }

  /**
   * 读取当前运行时配置。
   * @returns 配置副本。
   */
  public getConfig(): AlwaysOnTopConfig {
    return { ...this.config }
  }

  /**
   * 启用或停用窗口置顶；停用时立即释放所有边框和追踪进程。
   * @param enabled 是否启用。
   * @returns 注册结果；非 Windows 平台返回失败说明。
   */
  public setEnabled(enabled: boolean): { success: boolean; error?: string } {
    return this.updateConfig({ enabled: enabled === true })
  }

  /**
   * 合并更新置顶配置；快捷键变化会在启用状态下立即重新注册。
   * @param patch 需要更新的配置字段。
   * @returns 更新结果；快捷键注册失败时不落库。
   */
  public updateConfig(patch: Partial<AlwaysOnTopConfig>): { success: boolean; error?: string } {
    const next = this.normalizeConfig({ ...this.config, ...patch })
    const shortcutChanged = next.shortcut !== this.config.shortcut
    const enabling = next.enabled && !this.config.enabled

    if (next.enabled && (enabling || shortcutChanged)) {
      const registration = this.registerAccelerator(next.shortcut)
      if (!registration.success) return registration
    }
    if (!next.enabled && this.config.enabled) {
      this.unregisterAccelerator()
      this.pinnedHandles.clear()
      alwaysOnTopBorder.stop()
    } else if (this.config.borderEnabled && !next.borderEnabled) {
      alwaysOnTopBorder.stop()
    } else if (!this.config.borderEnabled && next.borderEnabled) {
      // 重新开启边框时补画当前仍处于置顶状态的窗口。
      for (const hwnd of this.pinnedHandles) {
        alwaysOnTopBorder.pin(hwnd, null, this.getBorderStyle(), false)
      }
    }

    this.config = next
    alwaysOnTopBorder.applyStyle(this.getBorderStyle())
    this.persist()
    return { success: true }
  }

  /**
   * 切换当前前台窗口的置顶状态，并把多个快速按键串行执行。
   * @returns 本次切换结果。
   */
  public toggleForegroundWindow(): Promise<AlwaysOnTopToggleResult> {
    const next = this.toggleQueue.then(
      () => this.performToggle(),
      () => this.performToggle()
    )
    this.toggleQueue = next.then(
      (result) => result,
      (error) => ({ success: false, error: String(error) })
    )
    return next
  }

  /**
   * 停止服务并注销快捷键，同时销毁全部边框覆盖层。
   * @returns 无返回值。
   */
  public stop(): void {
    this.unregisterAccelerator()
    this.pinnedHandles.clear()
    alwaysOnTopBorder.stop()
    // 停止后不再声称处于启用状态，后续 setEnabled(true) 必须重新注册。
    this.config = { ...this.config, enabled: false }
  }

  /**
   * 归一化外部传入的配置，避免非法快捷键或数值进入运行时。
   * @param config 合并后的配置。
   * @returns 可安全使用的配置。
   */
  private normalizeConfig(config: AlwaysOnTopConfig): AlwaysOnTopConfig {
    const shortcut =
      typeof config.shortcut === 'string' && config.shortcut.trim()
        ? config.shortcut.trim()
        : DEFAULT_ALWAYS_ON_TOP_SHORTCUT
    return {
      enabled: config.enabled === true,
      shortcut,
      borderEnabled: config.borderEnabled !== false,
      colorMode: config.colorMode === 'custom' ? 'custom' : 'accent',
      borderColor:
        typeof config.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(config.borderColor)
          ? config.borderColor
          : FALLBACK_COLOR,
      opacity: normalizeNumber(config.opacity, 100, 0, 100),
      thickness: normalizeNumber(config.thickness, 3, 1, 10),
      roundedCorners: config.roundedCorners !== false,
      playSound: config.playSound !== false
    }
  }

  /**
   * 把配置转换为边框样式。
   * @returns 边框管理器需要的样式。
   */
  private getBorderStyle(): AlwaysOnTopBorderStyle {
    return {
      colorMode: this.config.colorMode,
      color: this.config.borderColor,
      opacity: this.config.opacity,
      thickness: this.config.thickness,
      roundedCorners: this.config.roundedCorners
    }
  }

  /**
   * 注册全局快捷键；新组合失败时恢复原组合，避免设置静默失效。
   * @param shortcut 目标快捷键文本。
   * @returns 注册结果。
   */
  private registerAccelerator(shortcut: string): { success: boolean; error?: string } {
    if (process.platform !== 'win32') {
      return { success: false, error: '“窗口置顶”仅支持 Windows' }
    }

    const accelerator = resolveAccelerator(shortcut)
    const previous = this.registeredAccelerator
    if (previous === accelerator && globalShortcut.isRegistered(accelerator)) {
      return { success: true }
    }
    if (previous) {
      globalShortcut.unregister(previous)
      this.registeredAccelerator = null
    }

    const registered = globalShortcut.register(accelerator, () => {
      if (dndManager.shouldIgnoreHotkeys()) return
      void this.toggleForegroundWindow()
    })
    if (!registered) {
      // 新快捷键被占用时恢复上一组合，保留用户此前可用的置顶入口。
      if (previous && globalShortcut.register(previous, () => this.handleShortcut())) {
        this.registeredAccelerator = previous
      }
      return { success: false, error: `快捷键 ${shortcut} 已被占用` }
    }

    this.registeredAccelerator = accelerator
    return { success: true }
  }

  /**
   * 全局快捷键触发后的统一入口。
   * @returns 无返回值。
   */
  private handleShortcut(): void {
    if (dndManager.shouldIgnoreHotkeys()) return
    void this.toggleForegroundWindow()
  }

  /**
   * 注销当前已注册的置顶快捷键。
   * @returns 无返回值。
   */
  private unregisterAccelerator(): void {
    if (this.registeredAccelerator) {
      globalShortcut.unregister(this.registeredAccelerator)
      this.registeredAccelerator = null
    }
  }

  /**
   * 读取前台窗口并执行一次原生置顶切换。
   * @returns 切换结果。
   */
  private async performToggle(): Promise<AlwaysOnTopToggleResult> {
    if (process.platform !== 'win32') {
      return { success: false, error: '“窗口置顶”仅支持 Windows' }
    }
    const window = NativeWindowManager.getActiveWindow()
    if (!window?.hwnd) {
      return { success: false, error: '未获取到当前前台窗口' }
    }

    const result = await this.runToggle(window.hwnd)
    if (result.success) {
      if (result.topmost) {
        this.pinnedHandles.add(window.hwnd)
        // 边框由原生辅助进程绘制；关闭边框时仍保留置顶和提示音。
        if (this.config.borderEnabled) {
          alwaysOnTopBorder.pin(window.hwnd, null, this.getBorderStyle(), false)
        }
        if (this.config.playSound) shell.beep()
      } else {
        this.pinnedHandles.delete(window.hwnd)
        alwaysOnTopBorder.unpin(window.hwnd)
      }
    }
    return result
  }

  /**
   * 在独立 PowerShell 进程中调用 SetWindowPos，进程结束即释放。
   * @param hwnd 目标窗口句柄。
   * @returns 切换结果。
   */
  private runToggle(hwnd: number): Promise<AlwaysOnTopToggleResult> {
    return new Promise((resolve) => {
      const encoded = Buffer.from(buildToggleScript(hwnd), 'utf16le').toString('base64')
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      )
      let stdout = ''
      let stderr = ''
      let settled = false

      /**
       * 结束本次切换并清理进程与超时监听。
       * @param result 本次结果。
       * @returns 无返回值。
       */
      const finish = (result: AlwaysOnTopToggleResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child.removeAllListeners()
        if (child.exitCode === null && !child.killed) child.kill()
        resolve(result)
      }

      const timer = setTimeout(() => finish({ success: false, error: '切换置顶状态超时' }), 8_000)
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf8')
      })
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })
      child.once('error', (error) => finish({ success: false, error: error.message }))
      child.once('close', () => {
        const output = stdout.trim()
        if (output.includes('TOPMOST_ON')) {
          finish({ success: true, topmost: true })
        } else if (output.includes('TOPMOST_OFF')) {
          finish({ success: true, topmost: false })
        } else {
          const message =
            output.replace(/^ERROR:/, '').trim() || stderr.trim() || '无法切换窗口置顶状态'
          finish({ success: false, error: message })
        }
      })
    })
  }

  /**
   * 合并写回置顶字段，保留其他通用设置。
   * @returns 无返回值。
   */
  private persist(): void {
    const settings = databaseAPI.dbGet(SETTINGS_KEY) || {}
    databaseAPI.dbPut(SETTINGS_KEY, {
      ...settings,
      alwaysOnTopEnabled: this.config.enabled,
      alwaysOnTopShortcut: this.config.shortcut,
      alwaysOnTopBorderEnabled: this.config.borderEnabled,
      alwaysOnTopBorderColorMode: this.config.colorMode,
      alwaysOnTopBorderColor: this.config.borderColor,
      alwaysOnTopBorderOpacity: this.config.opacity,
      alwaysOnTopBorderThickness: this.config.thickness,
      alwaysOnTopRoundedCorners: this.config.roundedCorners,
      alwaysOnTopPlaySound: this.config.playSound
    })
  }
}

export default new AlwaysOnTopService()
