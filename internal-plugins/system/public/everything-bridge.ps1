$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -Path (Join-Path $PSScriptRoot 'everything-bridge.cs') -ReferencedAssemblies System.Windows.Forms,System,System.Core
$client = New-Object TabDoEverything
try {
  while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $null
    try {
      $request = $line | ConvertFrom-Json
      # Explicit enumeration accepts an empty query; ordinary empty requests only probe status.
      if (($request.query -or $request.enumerate) -and ([string]$request.query).Length -le 2000) {
        $result = $client.Query([string]$request.query, [int]$request.offset, [int]$request.sort, [bool]$request.regex, [bool]$request.matchCase, [string]$request.instance, [bool]$request.matchPath)
      } else { $result = $client.Status([string]$request.instance) }
      $response = @{ id = $request.id; state = $result.state; executable = $result.executable; total = $result.total; items = @($result.items.ToArray()) }
      if ($result.state -eq 'missing') {
        # Detect ordinary installed paths without starting an external application.
        $candidates = @("$env:ProgramFiles\Everything\Everything.exe", "${env:ProgramFiles(x86)}\Everything\Everything.exe", "$env:LOCALAPPDATA\Everything\Everything.exe")
        foreach ($key in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Everything', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Everything')) {
          $install = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
          if ($install.InstallLocation) { $candidates += Join-Path $install.InstallLocation 'Everything.exe' }
        }
        $found = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        if ($found) { $response.state = 'installed'; $response.executable = $found }
      }
      $response | ConvertTo-Json -Depth 6 -Compress | ForEach-Object { [Console]::WriteLine($_) }
    } catch { [Console]::WriteLine((@{ id = $request.id; error = $_.Exception.Message } | ConvertTo-Json -Compress)) }
  }
} finally { $client.Dispose() }
