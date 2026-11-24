$ErrorActionPreference = 'Stop'
$taskDirectory = if ($env:PMO_DEMO_DIR) { $env:PMO_DEMO_DIR } else { Join-Path $env:LOCALAPPDATA 'ShockwavePMO\demo-data\pmo-demo-v1' }
$taskPath = Join-Path $taskDirectory 'accounts.dpapi'
if (-not (Test-Path -LiteralPath $taskPath)) { throw 'Akun demo belum dibuat. Jalankan scripts\seed-demo.ps1 terlebih dahulu.' }
$taskProtected = Get-Content -LiteralPath $taskPath -Raw | ConvertTo-SecureString
try {
  $taskAccounts = [Net.NetworkCredential]::new('', $taskProtected).Password | ConvertFrom-Json -AsHashtable
  Write-Host 'Password berikut khusus akun DEMO. Hanya pengguna Windows pembuat dataset yang dapat membuka berkas ini.'
  foreach ($taskEntry in $taskAccounts.GetEnumerator()) {
    $taskAccount = $taskEntry.Value
    [pscustomobject]@{
      Nama = $taskAccount.name
      Role = $taskAccount.role
      Email = $taskAccount.email
      Password = if ($taskAccount.firstLogin) { $taskAccount.temporary_password } else { $taskAccount.password }
      Catatan = if ($taskAccount.firstLogin) { 'Wajib ganti password saat login pertama' } else { 'Siap dipakai pada port yang selesai diisi' }
    } | Format-List
  }
} finally {
  $taskAccounts = $null
  $taskProtected.Dispose()
}
