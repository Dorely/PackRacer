param(
  [string]$ExpectedTag = ""
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$releaseDirectory = Join-Path $repositoryRoot "release"

Push-Location $repositoryRoot
try {
  $workingTreeChanges = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the Git working tree."
  }

  if ($workingTreeChanges.Count -gt 0) {
    throw "Release builds must start from a clean Git working tree. Commit or stash changes first."
  }

  $rootVersion = node -p "require('./package.json').version"
  $desktopVersion = node -p "require('./apps/desktop/package.json').version"
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read package versions."
  }

  if ($rootVersion -ne $desktopVersion) {
    throw "Root version $rootVersion does not match desktop version $desktopVersion."
  }

  if ($ExpectedTag -and $ExpectedTag -ne "v$desktopVersion") {
    throw "Tag $ExpectedTag does not match desktop version $desktopVersion. Expected v$desktopVersion."
  }

  & npm.cmd test
  if ($LASTEXITCODE -ne 0) {
    throw "Race-engine tests exited with code $LASTEXITCODE."
  }

  & npm.cmd run dist:win
  if ($LASTEXITCODE -ne 0) {
    throw "Windows installer build exited with code $LASTEXITCODE."
  }

  $installerName = "PackRacer-Setup-$desktopVersion-x64.exe"
  $installerPath = Join-Path $releaseDirectory $installerName
  if (-not (Test-Path -LiteralPath $installerPath)) {
    throw "Expected installer was not created at $installerPath."
  }

  $checksumPath = "$installerPath.sha256"
  $installerStream = [System.IO.File]::OpenRead($installerPath)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $checksumBytes = $sha256.ComputeHash($installerStream)
      $checksum = ([System.BitConverter]::ToString($checksumBytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
      $sha256.Dispose()
    }
  }
  finally {
    $installerStream.Dispose()
  }
  Set-Content -LiteralPath $checksumPath -Value "$checksum *$installerName" -Encoding ascii

  Write-Host "Windows release candidate created:"
  Write-Host "  $installerPath"
  Write-Host "  $checksumPath"
}
finally {
  Pop-Location
}
