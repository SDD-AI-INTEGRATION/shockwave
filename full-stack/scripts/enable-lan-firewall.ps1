param(
 [Parameter(Mandatory)][string]$Address,
 [ValidateRange(1024,65535)][int]$Port=8080
)
$ErrorActionPreference='Stop'
$taskPrincipal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Windows memerlukan PowerShell yang dibuka dengan Run as administrator untuk mengubah firewall.'}
$taskParsed=$null
if(-not [Net.IPAddress]::TryParse($Address,[ref]$taskParsed) -or $taskParsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork){throw 'Gunakan alamat IPv4 LAN.'}
$taskOctets=$taskParsed.GetAddressBytes()
if(-not($taskOctets[0] -eq 10 -or ($taskOctets[0] -eq 172 -and $taskOctets[1] -ge 16 -and $taskOctets[1] -le 31) -or ($taskOctets[0] -eq 192 -and $taskOctets[1] -eq 168))){throw 'Hanya IP privat LAN yang diperbolehkan.'}
$taskInterface=Get-NetIPAddress -AddressFamily IPv4 -IPAddress $Address -ErrorAction Stop | Select-Object -First 1
$taskRule="ShockwavePMO-LAN-$Port"
Get-NetFirewallRule -Name $taskRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name $taskRule -DisplayName "Shockwave PMO LAN TCP $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $Address -RemoteAddress LocalSubnet -InterfaceAlias $taskInterface.InterfaceAlias -Profile Any -EdgeTraversalPolicy Block | Out-Null
Write-Host "Akses subnet lokal diizinkan pada http://${Address}:$Port ($($taskInterface.InterfaceAlias))."
