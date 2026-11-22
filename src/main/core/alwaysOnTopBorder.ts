import { app, systemPreferences } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** 置顶边框样式，由通用设置中的外观选项映射而来。 */
export interface AlwaysOnTopBorderStyle {
  colorMode: 'accent' | 'custom'
  color: string
  opacity: number
  thickness: number
  roundedCorners: boolean
}

/** 目标窗口在屏幕上的矩形，保留给调用方传递首帧位置。 */
export interface PhysicalRect {
  x: number
  y: number
  width: number
  height: number
}

const FALLBACK_COLOR = '#1A73E8'

/**
 * 规整自定义颜色，只有标准六位十六进制才可直接用于边框。
 * @param value 用户保存的颜色文本。
 * @returns 可用的十六进制颜色。
 */
function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : FALLBACK_COLOR
}

/**
 * 读取系统强调色并转换为 CSS 颜色；不可用时回退到固定蓝色。
 * @returns 形如 #RRGGBB 的颜色文本。
 */
function resolveAccentColor(): string {
  try {
    const accent = systemPreferences.getAccentColor()
    if (/^[0-9a-fA-F]{6,8}$/.test(accent)) return `#${accent.slice(0, 6)}`
  } catch {
    // 非 Windows 或系统未提供强调色时使用回退色。
  }
  return FALLBACK_COLOR
}

/**
 * 按当前设置解析边框实际颜色。
 * @param style 边框样式。
 * @returns 形如 #RRGGBB 的颜色文本。
 */
function resolveColor(style: AlwaysOnTopBorderStyle): string {
  return style.colorMode === 'accent' ? resolveAccentColor() : normalizeColor(style.color)
}

/**
 * 定位随包的置顶边框辅助脚本。
 * @returns 可由 PowerShell 直接读取的脚本路径。
 */
function resolveHelperPath(): string {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'resources',
      'always-on-top-border.ps1'
    )
  }
  return path.join(app.getAppPath(), 'resources', 'always-on-top-border.ps1')
}

/**
 * 窗口置顶高亮边框管理器：把目标句柄交给原生辅助进程，由 WinEvent 钩子
 * 驱动分层窗口实时跟随，避免轮询造成的拖尾。
 */
class AlwaysOnTopBorder {
  private helper: ChildProcess | null = null
  private tracked = new Set<number>()

  /**
   * 为指定窗口创建高亮边框。
   * @param hwnd 目标窗口句柄。
   * @param _initialRect 首帧位置，辅助进程会自行读取窗口边界。
   * @param style 当前边框样式。
   * @param _playSound 声音由宿主服务播放，不再传给辅助进程。
   * @returns 无返回值。
   */
  public pin(
    hwnd: number,
    _initialRect: PhysicalRect | null,
    style: AlwaysOnTopBorderStyle,
    _playSound: boolean
  ): void {
    if (!this.ensureHelper()) return
    this.tracked.add(hwnd)
    this.write(
      `pin|${hwnd}|${resolveColor(style)}|${style.opacity}|${style.thickness}|${
        style.roundedCorners ? 1 : 0
      }`
    )
  }

  /**
   * 停止跟踪并销毁指定窗口的边框。
   * @param hwnd 目标窗口句柄。
   * @returns 无返回值。
   */
  public unpin(hwnd: number): void {
    if (!this.tracked.delete(hwnd)) return
    this.write(`unpin|${hwnd}`)
    if (this.tracked.size === 0) this.shutdown()
  }

  /**
   * 更新所有已置顶窗口的边框样式。
   * @param style 新的边框样式。
   * @returns 无返回值。
   */
  public applyStyle(style: AlwaysOnTopBorderStyle): void {
    if (this.tracked.size === 0) return
    this.write(
      `style|${resolveColor(style)}|${style.opacity}|${style.thickness}|${
        style.roundedCorners ? 1 : 0
      }`
    )
  }

  /**
   * 停止辅助进程并清理全部边框。
   * @returns 无返回值。
   */
  public stop(): void {
    this.tracked.clear()
    this.shutdown()
  }

  /**
   * 获取当前仍被跟踪的窗口句柄，供服务在停用时统一清理。
   * @returns 窗口句柄列表。
   */
  public getTrackedHandles(): number[] {
    return [...this.tracked]
  }

  /**
   * 确保辅助进程存在。
   * @returns 是否可用。
   */
  private ensureHelper(): boolean {
    if (this.helper && this.helper.exitCode === null) return true
    try {
      const scriptPath = resolveHelperPath()
      if (!fs.existsSync(scriptPath)) {
        console.warn('[AlwaysOnTop] 找不到边框辅助脚本:', scriptPath)
        return false
      }
      const helper = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] }
      )
      helper.stderr?.on('data', (data: Buffer) => {
        const message = data.toString('utf8').trim()
        if (message) console.warn('[AlwaysOnTop] 边框辅助进程:', message)
      })
      helper.once('error', (error) => {
        console.warn('[AlwaysOnTop] 边框辅助进程启动失败:', error.message)
        if (this.helper === helper) this.helper = null
      })
      helper.once('close', () => {
        if (this.helper !== helper) return
        // 辅助进程意外退出时边框已不存在，同步清空跟踪状态以便下次重建。
        this.helper = null
        this.tracked.clear()
      })
      this.helper = helper
      return true
    } catch (error) {
      console.warn('[AlwaysOnTop] 启动边框辅助进程失败:', error)
      return false
    }
  }

  /**
   * 向辅助进程写入一条命令。
   * @param line 命令文本。
   * @returns 无返回值。
   */
  private write(line: string): void {
    try {
      this.helper?.stdin?.write(`${line}\n`)
    } catch (error) {
      console.warn('[AlwaysOnTop] 写入边框命令失败:', error)
    }
  }

  /**
   * 结束辅助进程，释放分层窗口和钩子。
   * @returns 无返回值。
   */
  private shutdown(): void {
    const helper = this.helper
    if (!helper) return
    this.helper = null
    try {
      helper.stdin?.write('quit\n')
      helper.stdin?.end()
    } catch {
      // 输入流已关闭时直接依赖进程回收。
    }
    // 给辅助进程短暂自行退出时间，超时后强制结束，避免残留窗口。
    const timer = setTimeout(() => {
      if (helper.exitCode === null) helper.kill()
    }, 600)
    helper.once('close', () => clearTimeout(timer))
  }
}

export default new AlwaysOnTopBorder()
