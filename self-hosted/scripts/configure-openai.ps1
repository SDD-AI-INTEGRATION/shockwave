param(
 [string]$Model='gpt-6-luna',
 [switch]$FromEnvironment,
 [switch]$Restart
)
$ErrorActionPreference='Stop'
if($Model -notmatch '^[a-zA-Z0-9._:-]{1,100}$'){throw 'Nama model tidak valid.'}
if($FromEnvironment){$taskKey=$env:OPENAI_API_KEY}else{
 $taskSecure=Read-Host 'OpenAI API key (input disembunyikan)' -AsSecureString
 $taskKey=[Net.NetworkCredential]::new('',$taskSecure).Password
}
if($taskKey -notmatch '^sk-[A-Za-z0-9_-]{20,}$'){throw 'Format API key tidak valid.'}
$taskTargets=@(
 (Join-Path $env:TEMP 'shockwave-pmo-validation\backend\.env'),
 (Join-Path $env:LOCALAPPDATA 'ShockwavePMO\.env')
)
foreach($taskTarget in $taskTargets){if(-not(Test-Path -LiteralPath $taskTarget)){throw 'Runtime belum tersedia. Jalankan launcher terlebih dahulu.'}}
foreach($taskTarget in $taskTargets){
 $taskContent=Get-Content -LiteralPath $taskTarget -Raw
 foreach($taskSetting in @(@('OPENAI_API_KEY',$taskKey),@('OPENAI_MODEL',$Model),@('ASSISTANT_AI','on'))){
  $taskPattern='(?m)^'+[regex]::Escape($taskSetting[0])+'=[^\r\n]*'
  $taskLine=$taskSetting[0]+'='+$taskSetting[1]
  if([regex]::IsMatch($taskContent,$taskPattern)){$taskContent=[regex]::Replace($taskContent,$taskPattern,$taskLine)}else{$taskContent=$taskContent.TrimEnd()+"`n"+$taskLine+"`n"}
 }
 Set-Content -LiteralPath $taskTarget -Value $taskContent -NoNewline
}
Write-Host "OpenAI dikonfigurasi untuk runtime 3000 dan Docker 8080. Model: $Model."
if($Restart){
 $taskSavedEnvironment=@{}
 foreach($taskName in @('OPENAI_API_KEY','OPENAI_MODEL','ASSISTANT_AI')){$taskSavedEnvironment[$taskName]=[Environment]::GetEnvironmentVariable($taskName,'Process')}
 $env:OPENAI_API_KEY=$taskKey; $env:OPENAI_MODEL=$Model; $env:ASSISTANT_AI='on'
 try{
 $taskDockerRuntime=Join-Path $env:LOCALAPPDATA 'ShockwavePMO'
 Push-Location $taskDockerRuntime
 try{docker compose -f compose.production.yaml up -d --no-deps --force-recreate --wait backend; if($LASTEXITCODE -ne 0){throw 'Backend Docker belum siap.'}}finally{Pop-Location}
 $taskDevRuntime=Join-Path $env:TEMP 'shockwave-pmo-validation'
 $taskNode=Join-Path $taskDevRuntime '.tools\node_modules\node\bin\node.exe'
 $taskLaunchers=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.ExecutablePath -eq $taskNode -and $_.CommandLine -match '\.tools[/\\]node_modules[/\\]npm[/\\]bin[/\\]npm-cli\.js"?\s+run\s+dev(?:\s|$)'})
 if($taskLaunchers.Count -gt 1){throw 'Lebih dari satu launcher lokal ditemukan. Periksa proses PMO sebelum restart.'}
 foreach($taskLauncher in $taskLaunchers){taskkill /PID $taskLauncher.ProcessId /T /F | Out-Null; if($LASTEXITCODE -ne 0){throw 'Launcher PMO belum berhenti.'}}
 $taskOtherProcesses=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Replace('/','\').Contains($taskDevRuntime+'\node_modules\')})
 if($taskOtherProcesses.Count){throw 'Masih ada server lokal terpisah. Hentikan server PMO tersebut sebelum menjalankan launcher lagi.'}
 $taskOldPath=$env:PATH
 try{
  $env:PATH=(Split-Path $taskNode -Parent)+[IO.Path]::PathSeparator+$env:PATH
  $taskArtifacts=Join-Path $taskDevRuntime 'artifacts'; New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
  $taskProcess=Start-Process -FilePath $taskNode -ArgumentList @('.tools/node_modules/npm/bin/npm-cli.js','run','dev') -WorkingDirectory $taskDevRuntime -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskArtifacts 'runtime.stdout.log') -RedirectStandardError (Join-Path $taskArtifacts 'runtime.stderr.log') -PassThru
  Set-Content -LiteralPath (Join-Path $taskArtifacts 'runtime.pid') -Value $taskProcess.Id
 }finally{$env:PATH=$taskOldPath}
 Write-Host 'Backend Docker dimuat ulang dan launcher lokal dijalankan kembali. Refresh browser.'
 }finally{
  foreach($taskName in @('OPENAI_API_KEY','OPENAI_MODEL','ASSISTANT_AI')){[Environment]::SetEnvironmentVariable($taskName,$taskSavedEnvironment[$taskName],'Process')}
  $taskKey=$null
 }
}else{Write-Host 'Jalankan ulang backend lokal dan launcher Docker agar konfigurasi dimuat, atau gunakan -Restart setelah image/dependensi OpenAI terpasang.'}
$taskKey=$null
