param([string]$Instance, [string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'everything-ipc.cs') -ReferencedAssemblies System.Windows.Forms,System,System.Core
[EverythingFixture]::Run($Instance, $Output)
