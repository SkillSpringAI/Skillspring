param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][string]$Content
)

$enc = New-Object System.Text.UTF8Encoding($false)

# Normalize: remove BOM if present, ensure trailing newline
$c = $Content.TrimStart([char]0xFEFF)
$c = $c.TrimEnd("`r","`n") + "`n"

[System.IO.File]::WriteAllText((Resolve-Path $Path), $c, $enc)
