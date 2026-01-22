param(
  [string]$RepoRoot = (Get-Location).Path
)

Set-Location $RepoRoot

# Ensure repo-shared hooks path is set
git config core.hooksPath .githooks | Out-Null

Write-Host "hooksPath => $(git config core.hooksPath)"
Write-Host "Done: repo hooks are active."
