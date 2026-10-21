param([int]$StartX, [int]$StartY, [int]$EndX, [int]$EndY)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FloatingDragInput {
  /** Enable physical screen coordinates for this isolated test helper.
   * @returns Whether process DPI awareness was enabled.
   */
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  /** Move the system cursor to the fixture window.
   * @param x Physical screen X coordinate.
   * @param y Physical screen Y coordinate.
   * @returns Whether the cursor moved.
   */
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  /** Press or release the left mouse button during the fixture drag.
   * @param flags Native mouse event flags.
   * @param x Unused relative X coordinate.
   * @param y Unused relative Y coordinate.
   * @param data Unused mouse data.
   * @param extra Unused additional information.
   * @returns No return value.
   */
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
[FloatingDragInput]::SetProcessDPIAware() | Out-Null
[FloatingDragInput]::SetCursorPos($StartX, $StartY) | Out-Null
Start-Sleep -Milliseconds 100
[FloatingDragInput]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
try {
  Start-Sleep -Milliseconds 100
  for ($step = 1; $step -le 20; $step++) {
    $nextX = [int]($StartX + ($EndX - $StartX) * $step / 20)
    $nextY = [int]($StartY + ($EndY - $StartY) * $step / 20)
    [FloatingDragInput]::SetCursorPos($nextX, $nextY) | Out-Null
    Start-Sleep -Milliseconds 20
  }
} finally {
  [FloatingDragInput]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}
