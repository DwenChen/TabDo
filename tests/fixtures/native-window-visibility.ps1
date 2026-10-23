param([string]$PointsJson, [string]$ExpectedHandle, [string]$OverlayHandle)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public struct VisibilityPoint { public int X; public int Y; }
public struct VisibilityRect { public int Left; public int Top; public int Right; public int Bottom; }
public class VisibleWindowInfo {
  public string Handle;
  public string Title;
  public string ClassName;
  public uint ProcessId;
  public bool Visible;
  public int[] Bounds;
}
public class VisibilityResult {
  public VisibleWindowInfo Hit;
  public VisibleWindowInfo Effective;
  public VisibleWindowInfo Expected;
  public VisibleWindowInfo Foreground;
  public VisibleWindowInfo[] ForegroundControls;
}
public static class WindowsVisibilityProbe {
  /** Enable physical coordinates before inspecting the user's actual window stack.
   * @returns Whether DPI awareness was enabled.
   */
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  /** Read the native window at a physical screen point.
   * @param point Physical screen point.
   * @returns Native window handle.
   */
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(VisibilityPoint point);
  /** Resolve a child to its top-level root.
   * @param handle Native window handle.
   * @param flags Ancestor selector.
   * @returns Root window handle.
   */
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr handle, uint flags);
  /** Read the highest window in native z order.
   * @param handle Parent handle, or zero for the desktop.
   * @returns Highest window handle.
   */
  [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr handle);
  /** Advance through the native window stack.
   * @param handle Current window handle.
   * @param command Next-window selector.
   * @returns Following window handle.
   */
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr handle, uint command);
  /** Read visibility without activating the target.
   * @param handle Native window handle.
   * @returns Whether Windows marks the window visible.
   */
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr handle);
  /** Read physical window bounds.
   * @param handle Native window handle.
   * @param rectangle Receives the physical rectangle.
   * @returns Whether bounds were available.
   */
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr handle, out VisibilityRect rectangle);
  /** Read extended styles, including mouse-transparent overlays.
   * @param handle Native window handle.
   * @param index Style selector.
   * @returns Extended style bits.
   */
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr handle, int index);
  /** Read a title for failure diagnosis.
   * @param handle Native window handle.
   * @param text Receives the title.
   * @param count Buffer capacity.
   * @returns Number of characters copied.
   */
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  /** Read a native control class for dialog readiness.
   * @param handle Native control handle.
   * @param text Receives the class name.
   * @param count Buffer capacity.
   * @returns Number of characters copied.
   */
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr handle, StringBuilder text, int count);
  /** Receive one child control during bounded native dialog inspection.
   * @param handle Child control handle.
   * @param parameter Unused callback state.
   * @returns Whether inspection should continue.
   */
  delegate bool ChildCallback(IntPtr handle, IntPtr parameter);
  /** Enumerate native dialog child controls without activating them.
   * @param handle Parent dialog handle.
   * @param callback Bounded child-control reader.
   * @param parameter Unused callback state.
   * @returns Whether enumeration completed.
   */
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr handle, ChildCallback callback, IntPtr parameter);
  /** Read the owning process without entering another application's runtime.
   * @param handle Native window handle.
   * @param processId Receives the owner process id.
   * @returns Window thread id.
   */
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  /** Read the foreground window for failure diagnosis.
   * @returns Foreground native handle.
   */
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  /** Convert a handle into bounded diagnostic fields.
   * @param handle Native window handle.
   * @returns Visibility, owner and bounds without activating the window.
   */
  static VisibleWindowInfo Read(IntPtr handle) {
    var text = new StringBuilder(256); GetWindowText(handle, text, text.Capacity);
    var className = new StringBuilder(128); GetClassName(handle, className, className.Capacity);
    uint pid; GetWindowThreadProcessId(handle, out pid);
    VisibilityRect bounds; GetWindowRect(handle, out bounds);
    return new VisibleWindowInfo { Handle=handle.ToInt64().ToString(), Title=text.ToString(), ClassName=className.ToString(), ProcessId=pid,
      Visible=IsWindowVisible(handle), Bounds=new int[] {bounds.Left,bounds.Top,bounds.Right-bounds.Left,bounds.Bottom-bounds.Top} };
  }
  /** Inspect actual occlusion at a point, skipping only the teaching overlay and mouse-transparent windows.
   * @param x Physical screen X coordinate.
   * @param y Physical screen Y coordinate.
   * @param expected Decimal target HWND.
   * @param overlay Decimal teaching-overlay HWND.
   * @returns Native hit, effective window, expected window and foreground owner.
   */
  public static VisibilityResult Probe(int x, int y, string expected, string overlay) {
    var point = new VisibilityPoint { X=x, Y=y };
    var result = new VisibilityResult { Hit=Read(GetAncestor(WindowFromPoint(point),2)),
      Expected=Read(new IntPtr(Int64.Parse(expected))), Foreground=Read(GetAncestor(GetForegroundWindow(),2)) };
    var controls = new List<VisibleWindowInfo>();
    if (result.Foreground.ClassName=="#32770") EnumChildWindows(new IntPtr(Int64.Parse(result.Foreground.Handle)),(handle,parameter)=> {
      if (IsWindowVisible(handle)) controls.Add(Read(handle));
      return controls.Count<128;
    },IntPtr.Zero);
    result.ForegroundControls=controls.ToArray();
    var current=GetTopWindow(IntPtr.Zero);
    // Bound traversal so a disappearing or cycling window cannot stall the E2E worker.
    for (int count=0; current!=IntPtr.Zero && count<4096; count++) {
      VisibilityRect bounds;
      if (current.ToInt64().ToString()!=overlay && IsWindowVisible(current) &&
          (GetWindowLongPtr(current,-20).ToInt64() & 0x20)==0 && GetWindowRect(current,out bounds) &&
          x>=bounds.Left && x<bounds.Right && y>=bounds.Top && y<bounds.Bottom) {
        result.Effective=Read(GetAncestor(current,2)); break;
      }
      current=GetWindow(current,2);
    }
    return result;
  }
}
'@
[WindowsVisibilityProbe]::SetProcessDPIAware() | Out-Null
$probeResults = @((ConvertFrom-Json $PointsJson) | ForEach-Object {
  [WindowsVisibilityProbe]::Probe([int]$_.x, [int]$_.y, $ExpectedHandle, $OverlayHandle)
})
ConvertTo-Json -InputObject $probeResults -Depth 6 -Compress
