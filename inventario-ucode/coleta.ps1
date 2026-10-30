# uCode Inventario - Coleta de hardware, software e rede (somente leitura).
# Execute somente com autorizacao da empresa. Nao coleta arquivos pessoais, senhas ou chaves.
$ErrorActionPreference = 'SilentlyContinue'
function S($b) { try { & $b } catch { $null } }
$pc=S { Get-CimInstance Win32_ComputerSystem }
$os=S { Get-CimInstance Win32_OperatingSystem }
$bios=S { Get-CimInstance Win32_BIOS }
$processor=S { Get-CimInstance Win32_Processor | Select-Object -First 1 }
$ram=@(S { Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer,PartNumber,Speed,@{n='CapacityGB';e={[math]::Round($_.Capacity/1GB,2)}} })
$disks=@(S { Get-CimInstance Win32_DiskDrive | Select-Object Model,SerialNumber,MediaType,@{n='SizeGB';e={[math]::Round($_.Size/1GB,2)}} })
$net=@(S { Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' } })
$adapters=@(S { Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name,MacAddress,LinkSpeed })
$paths=@('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
$apps=@(S { Get-ItemProperty $paths | Where-Object DisplayName | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate | Sort-Object DisplayName -Unique })
$obj=[ordered]@{
 collector='uCode Inventario Windows v2'
 collectedAt=(Get-Date).ToString('o')
 hostname=$env:COMPUTERNAME
 serial=[string]$bios.SerialNumber
 vendor=[string]$pc.Manufacturer
 model=[string]$pc.Model
 cpu=[string]$processor.Name
 ramGB=[math]::Round(($pc.TotalPhysicalMemory / 1GB),1)
 ramModules=$ram
 os=[string]$os.Caption
 osVersion=[string]$os.Version
 windowsBuild=[string]$os.BuildNumber
 lastBoot=[string]$os.LastBootUpTime
 disks=$disks
 network=@($net | ForEach-Object { [ordered]@{name=$_.InterfaceAlias;ipv4=[string]$_.IPv4Address.IPAddress;gateway=[string]$_.IPv4DefaultGateway.NextHop;dns=($_.DNSServer.ServerAddresses -join ', ')} })
 adapters=$adapters
 software=$apps
}
$json=$obj|ConvertTo-Json -Depth 8
$file=Join-Path ([Environment]::GetFolderPath('Desktop')) ('ucode_inventario_'+($env:COMPUTERNAME -replace '[^a-zA-Z0-9_-]','_')+'.json')
try{$json|Out-File -FilePath $file -Encoding utf8;Write-Host 'JSON gerado na area de trabalho:' $file -ForegroundColor Green}catch{Write-Host 'Nao foi possivel salvar automaticamente.'}
try{Set-Clipboard -Value $json;Write-Host 'JSON copiado para a area de transferencia.' -ForegroundColor Green}catch{}
Write-Host 'Importe o arquivo no portal uCode e confira as informacoes antes de salvar.'
