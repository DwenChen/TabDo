import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureNativeWindowListBinary } from '../paths/binaries'
import {
  cachedNativeMacWindowSources,
  cachedNativeMacWindowSourcesAtMs,
  interactionCaptureCleanup,
  selectedSource,
  setCachedNativeMacWindowSources,
  setCachedNativeMacWindowSourcesAtMs,
  setInteractionCaptureCleanup,
  setSelectedWindowBounds,
  setWindowBoundsCaptureInterval,
  windowBoundsCaptureInterval
} from '../state'
import type { NativeMacWindowSource, SelectedSource, WindowBounds } from '../types'
import { parseWindowId } from '../utils'
import { resolveWindowsWindowBounds } from '../windowsWindowControl'

const execFileAsync = promisify(execFile)
let boundsGeneration = 0

export async function getNativeMacWindowSources(options?: { maxAgeMs?: number }) {
  if (process.platform !== 'darwin') {
    return [] as NativeMacWindowSource[]
  }

  const maxAgeMs = options?.maxAgeMs ?? 5000
  const now = Date.now()
  if (cachedNativeMacWindowSources && now - cachedNativeMacWindowSourcesAtMs < maxAgeMs) {
    return cachedNativeMacWindowSources
  }

  try {
    const binaryPath = await ensureNativeWindowListBinary()
    const { stdout } = await execFileAsync(binaryPath, [], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    })

    const parsed = JSON.parse(stdout)
    if (!Array.isArray(parsed)) {
      return [] as NativeMacWindowSource[]
    }

    const entries = parsed.filter((entry: unknown): entry is NativeMacWindowSource => {
      if (!entry || typeof entry !== 'object') {
        return false
      }

      const candidate = entry as Partial<NativeMacWindowSource>
      return typeof candidate.id === 'string' && typeof candidate.name === 'string'
    })

    setCachedNativeMacWindowSources(entries)
    setCachedNativeMacWindowSourcesAtMs(now)
    return entries
  } catch {
    return cachedNativeMacWindowSources ?? ([] as NativeMacWindowSource[])
  }
}

/** On-screen windows ordered front to back, for finding the window under a point. */
export async function getNativeMacWindowsFrontToBack(options?: {
  strict?: boolean
}): Promise<NativeMacWindowSource[]> {
  if (process.platform !== 'darwin') {
    return []
  }

  try {
    const binaryPath = await ensureNativeWindowListBinary()
    const { stdout } = await execFileAsync(binaryPath, ['--z-order'], {
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024
    })
    const parsed: unknown = JSON.parse(stdout)
    if (!Array.isArray(parsed)) {
      if (options?.strict) throw new Error('Unable to read window positions.')
      return []
    }
    return parsed.filter(
      (entry): entry is NativeMacWindowSource =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as NativeMacWindowSource).id === 'string'
    )
  } catch (error) {
    if (options?.strict)
      throw new Error('Unable to detect windows. Check screen recording permission and try again.')
    console.warn('Failed to list windows front to back:', error)
    return []
  }
}

export function getWindowBoundsFromNativeSource(
  source?: NativeMacWindowSource | null
): WindowBounds | null {
  if (!source) {
    return null
  }

  const { x, y, width, height } = source
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    typeof height !== 'number' ||
    !Number.isFinite(height)
  ) {
    return null
  }

  if (width <= 0 || height <= 0) {
    return null
  }

  return { x, y, width, height }
}

export async function resolveMacWindowBounds(source: SelectedSource): Promise<WindowBounds | null> {
  const windowId = parseWindowId(source.id)
  if (!windowId) {
    return null
  }

  try {
    const nativeSources = await getNativeMacWindowSources({ maxAgeMs: 250 })
    const matchedSource = nativeSources.find((entry) => parseWindowId(entry.id) === windowId)
    return getWindowBoundsFromNativeSource(matchedSource)
  } catch {
    return null
  }
}

export function parseXwininfoBounds(stdout: string): WindowBounds | null {
  const absX = stdout.match(/Absolute upper-left X:\s+(-?\d+)/)
  const absY = stdout.match(/Absolute upper-left Y:\s+(-?\d+)/)
  const width = stdout.match(/Width:\s+(\d+)/)
  const height = stdout.match(/Height:\s+(\d+)/)

  if (!absX || !absY || !width || !height) {
    return null
  }

  return {
    x: Number.parseInt(absX[1], 10),
    y: Number.parseInt(absY[1], 10),
    width: Number.parseInt(width[1], 10),
    height: Number.parseInt(height[1], 10)
  }
}

export async function resolveLinuxWindowBounds(
  source: SelectedSource
): Promise<WindowBounds | null> {
  const windowId = parseWindowId(source?.id)

  if (windowId) {
    try {
      const { stdout } = await execFileAsync('xwininfo', ['-id', String(windowId)], {
        timeout: 1500
      })
      const bounds = parseXwininfoBounds(stdout)
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        return bounds
      }
    } catch {
      return null
    }
    // Do not track a different same-title window after the selected ID disappears.
    return null
  }

  const windowTitle =
    typeof source.windowTitle === 'string' ? source.windowTitle.trim() : source.name.trim()
  if (!windowTitle) {
    return null
  }

  try {
    const { stdout } = await execFileAsync('xwininfo', ['-name', windowTitle], {
      timeout: 1500
    })
    const bounds = parseXwininfoBounds(stdout)
    return bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null
  } catch {
    return null
  }
}

export function stopInteractionCapture() {
  if (interactionCaptureCleanup) {
    interactionCaptureCleanup()
    setInteractionCaptureCleanup(null)
  }
}

/**
 * 结束当前窗口跟踪并使迟到查询失效，防止旧录制污染下一次来源。
 * @returns 无返回值。
 */
export function stopWindowBoundsCapture() {
  boundsGeneration++
  if (windowBoundsCaptureInterval) {
    clearInterval(windowBoundsCaptureInterval)
    setWindowBoundsCaptureInterval(null)
  }
  setSelectedWindowBounds(null)
}

/**
 * 读取本轮捕获窗口的边界，仅向仍属于同一来源与代次的录制回填。
 * @param generation 当前窗口跟踪代次。
 * @returns 本次边界查询完成后的 Promise。
 */
async function refreshSelectedWindowBounds(generation: number) {
  const source = selectedSource
  if (!source?.id?.startsWith('window:')) {
    setSelectedWindowBounds(null)
    return
  }

  let bounds: WindowBounds | null = null

  if (process.platform === 'darwin') {
    bounds = await resolveMacWindowBounds(source)
  } else if (process.platform === 'win32') {
    bounds = await resolveWindowsWindowBounds(source)
  } else if (process.platform === 'linux') {
    bounds = await resolveLinuxWindowBounds(source)
  }

  if (generation === boundsGeneration && selectedSource?.id === source?.id)
    setSelectedWindowBounds(bounds)
}

/**
 * 为当前窗口启动有界、单请求跟踪，避免较慢的原生查询并发堆积。
 * @returns 无返回值。
 */
export function startWindowBoundsCapture() {
  stopWindowBoundsCapture()

  if (
    !['darwin', 'win32', 'linux'].includes(process.platform) ||
    !selectedSource?.id?.startsWith('window:')
  ) {
    return
  }

  const generation = boundsGeneration
  let pending = false
  /**
   * 当前请求完成后才允许下一次跟踪查询。
   * @returns 查询和状态回填结束后的 Promise。
   */
  const refresh = async () => {
    if (pending || generation !== boundsGeneration) return
    pending = true
    try {
      await refreshSelectedWindowBounds(generation)
    } finally {
      pending = false
    }
  }
  void refresh()
  setWindowBoundsCaptureInterval(
    setInterval(() => {
      void refresh()
    }, 250)
  )
}
