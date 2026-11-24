param([switch]$CreateAdmin, [switch]$PrepareOnly, [switch]$RepairDependencies)
$ErrorActionPreference = 'Stop'
$taskSource = Split-Path $PSScriptRoot -Parent
$taskRuntime = Join-Path $env:TEMP 'shockwave-pmo-validation'
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
function Test-RuntimeInUse {
  $taskModules = (Join-Path $taskRuntime 'node_modules').Replace('/', '\') + '\'
  $taskProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
  return [bool]($taskProcesses | Where-Object {
    $_.CommandLine -and $_.CommandLine.Replace('/', '\').IndexOf($taskModules, [StringComparison]::OrdinalIgnoreCase) -ge 0
  } | Select-Object -First 1)
}
function Copy-SourceFile([string]$Source, [string]$Destination) {
  if ((Test-Path -LiteralPath $Destination) -and
      (Get-FileHash -LiteralPath $Source).Hash -eq (Get-FileHash -LiteralPath $Destination).Hash) { return }
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}
# Check before copying manifests or running npm: native modules cannot be
# replaced while a development server is using them on Windows.
if (Test-RuntimeInUse) {
  foreach ($taskInput in @('package.json','package-lock.json','frontend/package.json','backend/package.json')) {
    $taskInstalledInput = Join-Path $taskRuntime $taskInput
    if (-not (Test-Path -LiteralPath $taskInstalledInput) -or
        (Get-FileHash -LiteralPath (Join-Path $taskSource $taskInput)).Hash -ne (Get-FileHash -LiteralPath $taskInstalledInput).Hash) {
      throw 'Dependensi berubah saat aplikasi masih berjalan. Tekan Ctrl+C di terminal aplikasi, lalu jalankan launcher kembali.'
    }
  }
}
# Run outside the protected OneDrive folder; source files remain in the workspace.
foreach ($taskDir in @('frontend','backend','database','ocr','scripts')) {
  $taskBase = Join-Path $taskSource $taskDir
  Get-ChildItem -LiteralPath $taskBase -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/](node_modules|dist|\.next|__pycache__)[\\/]' -and $_.Name -ne '.env' -and $_.Extension -ne '.tsbuildinfo'
  } | ForEach-Object {
    $taskRelative = [IO.Path]::GetRelativePath($taskSource, $_.FullName)
    $taskDestination = Join-Path $taskRuntime $taskRelative
    New-Item -ItemType Directory -Path (Split-Path $taskDestination -Parent) -Force | Out-Null
    Copy-SourceFile $_.FullName $taskDestination
  }
}
foreach ($taskFile in @('package.json','package-lock.json','compose.yaml')) {
  Copy-SourceFile (Join-Path $taskSource $taskFile) (Join-Path $taskRuntime $taskFile)
}
$taskOriginalPath = $env:Path
Push-Location $taskRuntime
try {
  if (-not (Test-Path '.tools/node_modules/node/bin/node.exe') -or
      -not (Test-Path '.tools/node_modules/npm/bin/npm-cli.js')) {
    npm install --prefix .tools --workspaces=false --save-exact node@26.13.1 npm@12.2.2 --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Instalasi Node/npm gagal.' }
  }
  $env:Path = (Join-Path $taskRuntime '.tools/node_modules/node/bin') + [IO.Path]::PathSeparator + $env:Path
  node scripts/check-dependencies.mjs
  $taskNeedsInstall = $RepairDependencies -or $LASTEXITCODE -ne 0
  if ($taskNeedsInstall) {
    if (Test-RuntimeInUse) {
      throw 'Dependensi perlu dipulihkan, tetapi aplikasi masih berjalan. Tekan Ctrl+C di terminal aplikasi, lalu ulangi perintah ini. Tidak ada dependensi yang dihapus.'
    }
    node .tools/node_modules/npm/bin/npm-cli.js ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Instalasi dependensi gagal. Pastikan aplikasi sudah dihentikan, lalu ulangi launcher.' }
    node scripts/check-dependencies.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Verifikasi dependensi gagal setelah instalasi.' }
  } else {
    Write-Host 'Dependensi sudah lengkap; instalasi ulang dilewati.'
  }
  if (-not (Test-Path '.env')) {
    $taskRandom = [byte[]]::new(24)
    [Security.Cryptography.RandomNumberGenerator]::Fill($taskRandom)
    Set-Content -LiteralPath '.env' -Value ('POSTGRES_PASSWORD=' + [Convert]::ToHexString($taskRandom).ToLower())
  }
  if (-not (Test-Path 'backend/.env')) {
    $taskPassword = (Get-Content '.env' | Where-Object { $_ -match '^POSTGRES_PASSWORD=' }) -replace '^POSTGRES_PASSWORD=',''
    Set-Content -LiteralPath 'backend/.env' -Value "DATABASE_URL=postgresql://shockwave:$taskPassword@localhost:55432/shockwave`nAPP_ORIGIN=http://localhost:3000`nPORT=4000`nNODE_ENV=development"
  }
  docker compose up -d --wait database
  if ($LASTEXITCODE -ne 0) { throw 'Database belum siap. Jalankan Docker Desktop lalu ulangi.' }
  if ($CreateAdmin) {
    $env:ADMIN_EMAIL = Read-Host 'Email admin'
    $env:ADMIN_NAME = Read-Host 'Nama admin'
    $taskSecurePassword = Read-Host 'Password admin (minimal 12 karakter)' -AsSecureString
    $env:ADMIN_PASSWORD = [Net.NetworkCredential]::new('', $taskSecurePassword).Password
    try {
      node .tools/node_modules/npm/bin/npm-cli.js run admin:create -w backend
      if ($LASTEXITCODE -ne 0) { throw 'Pembuatan admin gagal.' }
    } finally {
      Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
      Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
      Remove-Item Env:ADMIN_NAME -ErrorAction SilentlyContinue
    }
  }
  Write-Host 'Workspace: http://localhost:3000'
  Write-Host "Runtime lokal: $taskRuntime"
  if (-not $PrepareOnly) {
    if (Test-RuntimeInUse) {
      Write-Host 'Aplikasi sudah berjalan. Gunakan browser atau terminal aplikasi yang sudah terbuka.'
    } else {
      node .tools/node_modules/npm/bin/npm-cli.js run dev
    }
  }
} finally { $env:Path = $taskOriginalPath; Pop-Location }
