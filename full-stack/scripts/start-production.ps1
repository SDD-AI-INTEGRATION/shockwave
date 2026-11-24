param([switch]$CreateAdmin,[switch]$Lan,[string]$LanAddress,[switch]$LocalOnly)
$ErrorActionPreference='Stop'
if(($Lan -and $LocalOnly) -or ($LanAddress -and -not $Lan)){throw 'Gunakan -Lan [-LanAddress IP] atau -LocalOnly.'}
function Test-PrivateAddress([string]$Value){
 $taskParsed=$null
 if(-not [Net.IPAddress]::TryParse($Value,[ref]$taskParsed)){return $false}
 if($taskParsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $taskParsed.ToString() -ne $Value){return $false}
 $taskOctets=$taskParsed.GetAddressBytes()
 return $taskOctets[0] -eq 10 -or ($taskOctets[0] -eq 172 -and $taskOctets[1] -ge 16 -and $taskOctets[1] -le 31) -or ($taskOctets[0] -eq 192 -and $taskOctets[1] -eq 168)
}
if($Lan){
 if(-not $LanAddress){$LanAddress=Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway} | ForEach-Object {$_.IPv4Address.IPAddress} | Where-Object {Test-PrivateAddress $_} | Select-Object -First 1}
 if(-not $LanAddress -or -not(Test-PrivateAddress $LanAddress)){throw 'IP LAN privat tidak ditemukan. Gunakan -Lan -LanAddress 192.168.x.x sesuai ipconfig.'}
 if(-not(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LanAddress -ErrorAction SilentlyContinue)){throw 'IP LAN harus terpasang pada komputer ini.'}
}
$taskSource=Split-Path $PSScriptRoot -Parent
$taskRuntime=Join-Path $env:LOCALAPPDATA 'ShockwavePMO'
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
foreach($taskDir in @('backend','frontend','database','ocr','deploy','scripts','docs')) {
 Get-ChildItem -LiteralPath (Join-Path $taskSource $taskDir) -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/](node_modules|dist|\.next|__pycache__)[\\/]' -and $_.Name -ne '.env' -and $_.Name -notlike '*.tsbuildinfo' } | ForEach-Object {
  $taskDest=Join-Path $taskRuntime ([IO.Path]::GetRelativePath($taskSource,$_.FullName))
  New-Item -ItemType Directory -Path (Split-Path $taskDest -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $taskDest -Force
 }
}
foreach($taskFile in @('package.json','package-lock.json','compose.production.yaml','.dockerignore','README.md')){Copy-Item -LiteralPath (Join-Path $taskSource $taskFile) -Destination $taskRuntime -Force}
Push-Location $taskRuntime
try{
 if(-not(Test-Path '.env')){$taskBytes=[byte[]]::new(32);[Security.Cryptography.RandomNumberGenerator]::Fill($taskBytes);Set-Content -LiteralPath '.env' -Value ('POSTGRES_PASSWORD='+[Convert]::ToHexString($taskBytes).ToLower()+"`nWEB_PORT=8080")}
 function Set-RuntimeSetting([string]$Key,[string]$Value){
  $taskContent=Get-Content -LiteralPath '.env' -Raw
  $taskPattern='(?m)^'+[regex]::Escape($Key)+'=[^\r\n]*'
  if([regex]::IsMatch($taskContent,$taskPattern)){$taskContent=[regex]::Replace($taskContent,$taskPattern,"$Key=$Value")}else{$taskContent=$taskContent.TrimEnd()+"`n$Key=$Value`n"}
  Set-Content -LiteralPath '.env' -Value $taskContent -NoNewline
 }
 $taskPortLine=Get-Content '.env' | Where-Object {$_ -match '^WEB_PORT=\d+$'} | Select-Object -Last 1
 $taskPort=if($env:WEB_PORT){[int]$env:WEB_PORT}elseif($taskPortLine){[int]($taskPortLine -split '=',2)[1]}else{8080}
 if($taskPort -lt 1024 -or $taskPort -gt 65535){throw 'WEB_PORT harus antara 1024 dan 65535.'}
 if($Lan){
  Set-RuntimeSetting 'WEB_BIND' '0.0.0.0'
  Set-RuntimeSetting 'APP_ORIGIN' "http://${LanAddress}:$taskPort"
  Set-RuntimeSetting 'APP_ORIGINS' "http://localhost:$taskPort,http://127.0.0.1:$taskPort"
  Set-RuntimeSetting 'LAN_HTTP' 'true'
 }elseif($LocalOnly){
  Set-RuntimeSetting 'WEB_BIND' '127.0.0.1'
  Set-RuntimeSetting 'APP_ORIGIN' "http://localhost:$taskPort"
  Set-RuntimeSetting 'APP_ORIGINS' ''
  Set-RuntimeSetting 'LAN_HTTP' 'false'
 }
 docker compose -f compose.production.yaml up -d --build --wait
 if($LASTEXITCODE -ne 0){throw 'Deployment gagal. Periksa docker compose logs; data volume tetap dipertahankan.'}
 if($CreateAdmin){
  $env:ADMIN_EMAIL=Read-Host 'Email admin Docker';$env:ADMIN_NAME=Read-Host 'Nama admin';$taskSecret=Read-Host 'Password admin (minimal 12 karakter)' -AsSecureString;$env:ADMIN_PASSWORD=[Net.NetworkCredential]::new('',$taskSecret).Password
  try{docker compose -f compose.production.yaml exec -T -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD backend node dist/create-admin.js;if($LASTEXITCODE -ne 0){throw 'Pembuatan admin gagal.'}}finally{Remove-Item Env:ADMIN_EMAIL,Env:ADMIN_NAME,Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue}
 }
 $taskOriginLine=Get-Content '.env' | Where-Object {$_ -match '^APP_ORIGIN='} | Select-Object -Last 1
 $taskOrigin=if($taskOriginLine){($taskOriginLine -split '=',2)[1]}else{"http://localhost:$taskPort"}
 Write-Host "Aplikasi siap: $taskOrigin"
 Write-Host "Akses komputer ini: http://localhost:$taskPort"
 if($Lan){
  Write-Host 'Mode HTTP LAN untuk jaringan tepercaya. Komputer teman harus berada pada jaringan yang sama.'
  Write-Host "Jika diblokir firewall, jalankan PowerShell sebagai Administrator: .\scripts\enable-lan-firewall.ps1 -Address $LanAddress -Port $taskPort"
 }
 Write-Host "Runtime dan konfigurasi: $taskRuntime"
}finally{Pop-Location}
