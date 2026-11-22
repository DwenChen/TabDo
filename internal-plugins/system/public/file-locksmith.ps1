$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class TabDoRestartManager
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RM_UNIQUE_PROCESS
    {
        public int dwProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct RM_PROCESS_INFO
    {
        public RM_UNIQUE_PROCESS Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string strAppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string strServiceShortName;
        public int ApplicationType;
        public uint AppStatus;
        public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)]
        public bool bRestartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmEndSession(uint pSessionHandle);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmRegisterResources(
        uint pSessionHandle,
        uint nFiles,
        string[] rgsFilenames,
        uint nApplications,
        [In] RM_UNIQUE_PROCESS[] rgApplications,
        uint nServices,
        string[] rgsServiceNames);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmGetList(
        uint dwSessionHandle,
        out uint pnProcInfoNeeded,
        ref uint pnProcInfo,
        [In, Out] RM_PROCESS_INFO[] rgAffectedApps,
        out uint lpdwRebootReasons);
}
"@

$script:processCache = @{}
$script:maxErrors = 20
$script:maxDirectoryFiles = 20000
$script:batchSize = 1024

function Add-ScanError {
    param($Errors, [string]$Path, [string]$Message)

    if ($Errors.Count -ge $script:maxErrors) { return }
    [void]$Errors.Add(@{ path = $Path; message = $Message })
}

function Get-LockingProcessIds {
    param([string[]]$Files)

    $session = [uint32]0
    $key = [Guid]::NewGuid().ToString()
    $result = [TabDoRestartManager]::RmStartSession([ref]$session, 0, $key)
    if ($result -ne 0) { throw "RmStartSession failed: $result" }
    try {
        $result = [TabDoRestartManager]::RmRegisterResources($session, [uint32]$Files.Count, $Files, [uint32]0, $null, [uint32]0, $null)
        if ($result -ne 0) { throw "RmRegisterResources failed: $result" }

        while ($true) {
            $needed = [uint32]0
            $count = [uint32]0
            $reasons = [uint32]0
            $result = [TabDoRestartManager]::RmGetList($session, [ref]$needed, [ref]$count, $null, [ref]$reasons)
            if ($result -eq 0) { return @() }
            if ($result -ne 234) { throw "RmGetList failed: $result" }

            $count = $needed
            $apps = [Array]::CreateInstance([TabDoRestartManager+RM_PROCESS_INFO], [int]$count)
            $result = [TabDoRestartManager]::RmGetList($session, [ref]$needed, [ref]$count, $apps, [ref]$reasons)
            if ($result -eq 0) {
                return @($apps | Select-Object -First ([int]$count) | ForEach-Object { $_.Process.dwProcessId })
            }
            if ($result -ne 234) { throw "RmGetList failed: $result" }
        }
    } finally {
        [void][TabDoRestartManager]::RmEndSession($session)
    }
}

function Find-LockingProcessIds {
    param([string[]]$Files, $Errors)

    if ($Files.Count -eq 0) { return @() }
    try {
        return @(Get-LockingProcessIds -Files $Files)
    } catch {
        $message = $_.Exception.Message
        # Access denied usually comes from one protected item; split the batch to isolate it.
        if ($Files.Count -gt 1) {
            $middle = [int][Math]::Floor($Files.Count / 2)
            $left = @($Files[0..($middle - 1)])
            $right = @($Files[$middle..($Files.Count - 1)])
            $leftIds = @(Find-LockingProcessIds -Files $left -Errors $Errors)
            $rightIds = @(Find-LockingProcessIds -Files $right -Errors $Errors)
            return @($leftIds + $rightIds)
        }
        if ($message -match 'failed: 5') { $message = 'ACCESS_DENIED' }
        Add-ScanError -Errors $Errors -Path $Files[0] -Message $message
        return @()
    }
}

function Get-FilesRecursive {
    param([string]$Root, [int]$Remaining, $Errors)

    $files = New-Object System.Collections.Generic.List[string]
    $stack = New-Object System.Collections.Generic.Stack[string]
    $stack.Push($Root)
    $skipped = 0
    $truncated = $false
    while ($stack.Count -gt 0) {
        if ($files.Count -ge $Remaining) { $truncated = $true; break }
        $current = $stack.Pop()
        try {
            foreach ($file in [System.IO.Directory]::EnumerateFiles($current)) {
                $files.Add($file)
                if ($files.Count -ge $Remaining) { $truncated = $true; break }
            }
        } catch { $skipped++ }
        if ($files.Count -ge $Remaining) { break }
        try {
            foreach ($directory in [System.IO.Directory]::EnumerateDirectories($current)) {
                try {
                    $attributes = [System.IO.File]::GetAttributes($directory)
                    if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
                } catch { $skipped++; continue }
                $stack.Push($directory)
            }
        } catch { $skipped++ }
    }
    if ($skipped -gt 0) { Add-ScanError -Errors $Errors -Path $Root -Message "SKIPPED:$skipped" }
    if ($truncated) { Add-ScanError -Errors $Errors -Path $Root -Message "TRUNCATED:$Remaining" }
    return @{ Files = @($files.ToArray()); Truncated = $truncated; Skipped = $skipped }
}

function Get-ProcessDetails {
    param([int]$ProcessId)

    if ($script:processCache.ContainsKey($ProcessId)) { return $script:processCache[$ProcessId] }
    $details = [ordered]@{
        pid = $ProcessId
        name = ''
        user = ''
        path = ''
        startedAt = $null
    }
    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        $details.name = $process.ProcessName
        try { $details.path = $process.Path } catch { }
        try { $details.startedAt = $process.StartTime.ToUniversalTime().ToString('o') } catch { }
    } catch { }
    try {
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        if (-not $details.name -and $cim.Name) { $details.name = [IO.Path]::GetFileNameWithoutExtension($cim.Name) }
        if (-not $details.path -and $cim.ExecutablePath) { $details.path = $cim.ExecutablePath }
        $owner = Invoke-CimMethod -InputObject $cim -MethodName GetOwner -ErrorAction Stop
        if ($owner.User) { $details.user = if ($owner.Domain) { "$($owner.Domain)\$($owner.User)" } else { $owner.User } }
    } catch { }
    $script:processCache[$ProcessId] = $details
    return $details
}

function Add-LockMatch {
    param($LockMap, [int]$ProcessId, [string[]]$Labels)

    if ($ProcessId -le 0) { return }
    $key = [string]$ProcessId
    if (-not $LockMap.Contains($key)) {
        $LockMap[$key] = @{
            process = Get-ProcessDetails -ProcessId $ProcessId
            files = New-Object System.Collections.Generic.List[string]
        }
    }
    foreach ($label in $Labels) {
        if (-not $LockMap[$key].files.Contains($label)) { [void]$LockMap[$key].files.Add($label) }
    }
}

function Invoke-Scan {
    param([string[]]$Paths)

    $script:processCache = @{}
    $lockMap = [ordered]@{}
    $errors = New-Object System.Collections.ArrayList
    $files = New-Object System.Collections.ArrayList
    $directories = New-Object System.Collections.ArrayList
    $truncated = $false

    foreach ($path in $Paths) {
        try {
            $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
            if ($item.PSIsContainer) { [void]$directories.Add($path) }
            else { [void]$files.Add($path) }
        } catch {
            Add-ScanError -Errors $errors -Path $path -Message 'NOT_ACCESSIBLE'
        }
    }

    # Direct file selections are queried one by one so the result keeps precise file mapping.
    foreach ($file in $files) {
        $processIds = @(Find-LockingProcessIds -Files @($file) -Errors $errors)
        foreach ($processId in $processIds) { Add-LockMatch -LockMap $lockMap -ProcessId $processId -Labels @($file) }
    }

    # Directories are expanded once, then queried in bounded batches to avoid one session per file.
    $remaining = $script:maxDirectoryFiles
    foreach ($directory in $directories) {
        if ($remaining -le 0) {
            Add-ScanError -Errors $errors -Path $directory -Message "TRUNCATED:$($script:maxDirectoryFiles)"
            $truncated = $true
            continue
        }
        $scan = Get-FilesRecursive -Root $directory -Remaining $remaining -Errors $errors
        $directoryFiles = @($scan.Files)
        $remaining -= $directoryFiles.Count
        if ($scan.Truncated) { $truncated = $true }
        for ($index = 0; $index -lt $directoryFiles.Count; $index += $script:batchSize) {
            $end = [Math]::Min($index + $script:batchSize - 1, $directoryFiles.Count - 1)
            $batch = @($directoryFiles[$index..$end])
            $processIds = @(Find-LockingProcessIds -Files $batch -Errors $errors)
            foreach ($processId in $processIds) { Add-LockMatch -LockMap $lockMap -ProcessId $processId -Labels @($directory) }
        }
    }

    $processes = @()
    foreach ($entry in $lockMap.Values) {
        $processes += @{
            pid = $entry.process.pid
            name = $entry.process.name
            user = $entry.process.user
            path = $entry.process.path
            startedAt = $entry.process.startedAt
            files = @($entry.files.ToArray())
        }
    }
    return @{
        processes = @($processes)
        errors = @($errors.ToArray())
        scannedFiles = $files.Count + ($script:maxDirectoryFiles - $remaining)
        truncated = $truncated
    }
}

function Invoke-Kill {
    param([int[]]$ProcessIds)

    $results = @()
    foreach ($processId in $ProcessIds) {
        if ($processId -le 4 -or $processId -eq $PID) {
            $results += @{ pid = $processId; success = $false; error = 'Protected process' }
            continue
        }
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            $results += @{ pid = $processId; success = $true; error = $null }
        } catch {
            $results += @{ pid = $processId; success = $false; error = $_.Exception.Message }
        }
    }
    return @{ results = @($results) }
}

while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $null
    try {
        $request = $line | ConvertFrom-Json
        if ($request.action -eq 'scan') {
            $payload = Invoke-Scan -Paths @($request.paths)
            $response = @{
                id = $request.id
                ok = $true
                processes = $payload.processes
                errors = $payload.errors
                scannedFiles = $payload.scannedFiles
                truncated = $payload.truncated
            }
        } elseif ($request.action -eq 'kill') {
            $payload = Invoke-Kill -ProcessIds @($request.pids)
            $response = @{ id = $request.id; ok = $true; results = $payload.results }
        } else {
            throw "Unknown action"
        }
    } catch {
        $response = @{ id = $(if ($request) { $request.id } else { $null }); ok = $false; error = $_.Exception.Message }
    }
    $response | ConvertTo-Json -Depth 8 -Compress | ForEach-Object { [Console]::WriteLine($_) }
}
