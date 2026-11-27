param(
  [switch]$VerifyOnly,
  [string]$Email = 'dicky_s@swadharma.com',
  [ValidateSet('http://localhost:3000','http://localhost:8080')]
  [string[]]$Origins = @('http://localhost:3000','http://localhost:8080')
)
$ErrorActionPreference = 'Stop'
$taskNode = Join-Path $env:TEMP 'shockwave-pmo-validation\.tools\node_modules\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $taskNode)) { $taskNode = (Get-Command node -ErrorAction Stop).Source }
$taskPassword = Read-Host "Password admin untuk $Email" -AsSecureString
$taskStart = [Diagnostics.ProcessStartInfo]::new()
$taskStart.FileName = $taskNode
$taskEntry = if ($VerifyOnly) { 'verify-demo.mjs' } else { 'seed-demo.mjs' }
$taskStart.ArgumentList.Add((Join-Path $PSScriptRoot $taskEntry))
$taskStart.UseShellExecute = $false
$taskStart.RedirectStandardInput = $true
$taskProcess = [Diagnostics.Process]::Start($taskStart)
try {
  $taskPayload = @{
    email = $Email
    password = [Net.NetworkCredential]::new('', $taskPassword).Password
    origins = $Origins
  } | ConvertTo-Json -Compress
  $taskProcess.StandardInput.WriteLine($taskPayload)
  $taskProcess.StandardInput.Close()
  $taskPayload = $null
  $taskProcess.WaitForExit()
  if ($taskProcess.ExitCode -ne 0) {
    if ($VerifyOnly) { throw 'Verifikasi demo gagal. Periksa pesan pemeriksaan di atas.' }
    throw 'Pembuatan data demo belum selesai. Jalankan kembali untuk melanjutkan dari checkpoint.'
  }
} finally {
  $taskPayload = $null
  $taskPassword.Dispose()
  $taskProcess.Dispose()
}
