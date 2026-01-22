param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][ScriptBlock]$Transform
)

$full = (Resolve-Path $Path).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "$full.bak.$stamp"

Copy-Item -LiteralPath $full -Destination $bak -Force

$txt = Get-Content -LiteralPath $full -Raw
$txt2 = & $Transform $txt

# Use safe write
& (Join-Path $PSScriptRoot "safe-write.ps1") -Path $full -Content $txt2

# quick sanity checks: must not contain obvious PowerShell tokens inside TS
$bad = @('param\(', '\$m', '\b-ireplace\b', '\b-match\b')
foreach ($p in $bad) {
  if ((Get-Content -LiteralPath $full -Raw) -match $p) {
    Write-Host "BAD TOKEN DETECTED ($p) -> rolling back $Path" -ForegroundColor Red
    Copy-Item -LiteralPath $bak -Destination $full -Force
    exit 1
  }
}

Write-Host "OK: $Path (backup: $bak)" -ForegroundColor Green
