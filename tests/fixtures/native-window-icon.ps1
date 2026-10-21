param([Parameter(Mandatory=$true)][long]$WindowHandle)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ToolIconProbe {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
  public static int Probe(long hwnd, int kind) {
    UIntPtr icon;
    var sent = SendMessageTimeout(new IntPtr(hwnd), 0x007f, new UIntPtr((uint)kind), IntPtr.Zero, 2, 2000, out icon);
    return (sent != IntPtr.Zero ? 1 : 0) | (icon != UIntPtr.Zero ? 2 : 0);
  }
}
'@
# Read actual native icons with a timeout so a stuck window cannot hang the test.
$results = foreach ($kind in @(0, 1, 2)) {
  $state = [ToolIconProbe]::Probe($WindowHandle, $kind)
  @{ kind = $kind; sent = ($state -band 1) -ne 0; present = ($state -band 2) -ne 0 }
}
ConvertTo-Json -Compress -InputObject @($results)
