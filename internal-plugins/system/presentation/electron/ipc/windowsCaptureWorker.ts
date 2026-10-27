import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

// 保留原版 HWND 前后层级、DWM 可见边界与 DPI 规则；只复用当前操作链的原生查询进程。
const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class TabDoCaptureWindows {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint command);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT rect);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int command);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out RECT rect, int size);
 public class Entry { public long id; public int x, y, width, height; }
 public static Entry Bounds(long id) {
  SetThreadDpiAwarenessContext(new IntPtr(-4));
  var h = new IntPtr(id); RECT rect;
  if (!IsWindowVisible(h) || IsIconic(h)) return null;
  if (DwmGetWindowAttribute(h, 9, out rect, Marshal.SizeOf(typeof(RECT))) != 0 && !GetWindowRect(h, out rect)) return null;
  if (rect.Right <= rect.Left || rect.Bottom <= rect.Top) return null;
  return new Entry { id = id, x = rect.Left, y = rect.Top, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top };
 }
 public static Entry[] List() {
  var list = new List<Entry>(); var seen = new HashSet<long>();
  for (var h = GetTopWindow(IntPtr.Zero); h != IntPtr.Zero && seen.Add(h.ToInt64()); h = GetWindow(h, 2)) {
   var entry = Bounds(h.ToInt64()); if (entry != null) list.Add(entry);
  }
  return list.ToArray();
 }
 public static bool Front(long id) {
  var h = new IntPtr(id); if (IsIconic(h)) ShowWindowAsync(h, 9);
  return SetForegroundWindow(h);
 }
}
"@
while ($null -ne ($line = [Console]::ReadLine())) {
 try {
  $request = ConvertFrom-Json $line
  $result = $null
  switch ($request.command) {
   'list' { $result = @([TabDoCaptureWindows]::List()) }
   'bounds' { $result = [TabDoCaptureWindows]::Bounds([long]$request.windowId) }
   'front' { $result = [TabDoCaptureWindows]::Front([long]$request.windowId) }
   default { throw '不支持的窗口查询' }
  }
  [Console]::WriteLine((ConvertTo-Json -Depth 5 -Compress -InputObject @{ id = $request.id; result = $result }))
 } catch {
  [Console]::WriteLine((ConvertTo-Json -Compress -InputObject @{ id = $request.id; error = $_.Exception.Message }))
 }
}
`

type Pending = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}
let worker: ChildProcessWithoutNullStreams | null = null
let nextId = 0
let output = ''
let idle: ReturnType<typeof setTimeout> | undefined
const pending = new Map<number, Pending>()

/**
 * 终止本会话的原生查询进程并拒绝未完成请求，不操作任何用户应用。
 * @returns 子进程关闭后的 Promise。
 */
export async function releaseWindowsCaptureWorker(): Promise<void> {
  clearTimeout(idle)
  const previous = worker
  worker = null
  output = ''
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.reject(new Error('窗口查询已结束'))
  }
  pending.clear()
  if (!previous || previous.exitCode !== null) return
  // 原生操作没有后续写入；关闭管道并确认进程结束，不能留下轮询用 PowerShell。
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => previous.kill(), 1500)
    previous.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
    previous.stdin.end()
  })
}

/**
 * 查询当前 Windows 窗口；同一操作链只编译一次原生接口，空闲后立即退役。
 * @param command 原版窗口层级、边界或前置操作。
 * @param windowId 需要操作的 HWND，列表查询时省略。
 * @returns 对应原生查询结果。
 * @throws 查询超时、进程失败或原生 API 出错时抛出。
 */
export function queryWindowsCapture(
  command: 'list' | 'bounds' | 'front',
  windowId = 0
): Promise<any> {
  clearTimeout(idle)
  if (!worker) {
    output = ''
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    worker = child
    child.stdin.on('error', () => {})
    child.stderr.on('data', () => {})
    child.on('error', () => {
      if (worker === child) void releaseWindowsCaptureWorker()
    })
    child.once('close', () => {
      if (worker === child) void releaseWindowsCaptureWorker()
    })
    child.stdout.on('data', (chunk: Buffer) => {
      if (worker !== child) return
      output += chunk.toString('utf8')
      for (let index = output.indexOf('\n'); index >= 0; index = output.indexOf('\n')) {
        const line = output.slice(0, index).trim()
        output = output.slice(index + 1)
        let response: { id: number; result?: unknown; error?: string }
        try {
          response = JSON.parse(line)
        } catch {
          continue
        }
        const request = pending.get(response.id)
        if (!request) continue
        pending.delete(response.id)
        clearTimeout(request.timer)
        if (response.error) request.reject(new Error(response.error))
        else request.resolve(response.result)
        if (!pending.size) idle = setTimeout(() => void releaseWindowsCaptureWorker(), 2000)
      }
    })
  }
  const child = worker
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => void releaseWindowsCaptureWorker(), 10000)
    pending.set(id, { resolve, reject, timer })
    // 只发送结构化的数字身份；用户窗口标题不会拼接成 PowerShell 源码。
    child.stdin.write(JSON.stringify({ id, command, windowId }) + '\n', (error) => {
      if (error && worker === child) void releaseWindowsCaptureWorker()
    })
  })
}
