# uCode Inventario - Coleta de hardware, software e rede (somente leitura).
# Execute somente com autorizacao da empresa. Nao coleta arquivos pessoais, senhas ou chaves.
$ErrorActionPreference = 'SilentlyContinue'
function S($b) { try { & $b } catch { $null } }
$pc=S { Get-CimInstance Win32_ComputerSystem }
$os=S { Get-CimInstance Win32_OperatingSystem }
$bios=S { Get-CimInstance Win32_BIOS }
$processor=S { Get-CimInstance Win32_Processor | Select-Object -First 1 }
$ram=@(S { Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer,PartNumber,Speed,@{n='CapacityGB';e={[math]::Round($_.Capacity/1GB,2)}} })
# A classe Win32_DiskDrive informa capacidade, mas seu MediaType geralmente nao distingue SSD de HD.
$physicalDisks=@(S { Get-PhysicalDisk | Select-Object FriendlyName,SerialNumber,MediaType,BusType,HealthStatus,OperationalStatus,@{n='SizeGB';e={[math]::Round($_.Size/1GB,2)}} })
$logicalDisks=@(S { Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,VolumeName,FileSystem,@{n='SizeGB';e={[math]::Round($_.Size/1GB,2)}},@{n='FreeGB';e={[math]::Round($_.FreeSpace/1GB,2)}} })
$winDisks=@(S { Get-CimInstance Win32_DiskDrive | Select-Object Model,SerialNumber,InterfaceType,PNPDeviceID,MediaType,@{n='SizeGB';e={[math]::Round($_.Size/1GB,2)}} })
$disks=@($winDisks | ForEach-Object {
 $d=$_
 $diskSerial=([string]$d.SerialNumber).Trim()
 $match=@($physicalDisks | Where-Object { $diskSerial -and ([string]$_.SerialNumber).Trim() -eq $diskSerial })
 if($match.Count -ne 1){
   $match=@($physicalDisks | Where-Object { $_.SizeGB -and [math]::Abs([double]$_.SizeGB - [double]$d.SizeGB) -lt 2 })
 }
 if($match.Count -ne 1 -and $physicalDisks.Count -eq 1 -and $winDisks.Count -eq 1){ $match=@($physicalDisks) }
 $p=if($match.Count -eq 1){$match[0]}else{$null}
 $bus=[string]$p.BusType
 $media=[string]$p.MediaType
 $diskType='Nao identificado'
 if($media -eq 'HDD'){$diskType='HD'}
 elseif($media -eq 'SSD'){
  if($bus -eq 'NVMe'){$diskType='SSD NVMe'}
  elseif($bus -eq 'SATA'){$diskType='SSD SATA'}
  else{$diskType='SSD (barramento nao confirmado)'}
 }
 elseif($bus -eq 'NVMe'){$diskType='SSD NVMe'}
 [ordered]@{
  Model=[string]$d.Model
  SerialNumber=[string]$d.SerialNumber
  SizeGB=$d.SizeGB
  DiskType=$diskType
  BusType=$bus
  HealthStatus=[string]$p.HealthStatus
  MediaType=[string]$d.MediaType
 }
})
$totalGB=[math]::Round(($winDisks|Measure-Object -Property SizeGB -Sum).Sum,2)
$freeGB=[math]::Round(($logicalDisks|Measure-Object -Property FreeGB -Sum).Sum,2)
$types=@($disks|ForEach-Object { $_.DiskType }|Where-Object { $_ -ne 'Nao identificado' }|Select-Object -Unique)
$storageType='Nao identificado'
if(($types -contains 'HD') -and (@($types|Where-Object { $_ -like 'SSD*' }).Count -gt 0)){$storageType='Hibrido (HD + SSD)'}
elseif($types.Count -eq 1){$storageType=$types[0]}
elseif($types.Count -gt 1){$storageType=($types -join ' + ')}
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
 physicalDisks=$physicalDisks
 logicalDisks=$logicalDisks
 storageType=$storageType
 storageTotalGB=$totalGB
 storageFreeGB=$freeGB
 network=@($net | ForEach-Object { [ordered]@{name=$_.InterfaceAlias;ipv4=[string]$_.IPv4Address.IPAddress;gateway=[string]$_.IPv4DefaultGateway.NextHop;dns=($_.DNSServer.ServerAddresses -join ', ')} })
 adapters=$adapters
 software=$apps
}
$json=$obj|ConvertTo-Json -Depth 8
$file=Join-Path ([Environment]::GetFolderPath('Desktop')) ('ucode_inventario_'+($env:COMPUTERNAME -replace '[^a-zA-Z0-9_-]','_')+'.json')
try{$json|Out-File -FilePath $file -Encoding utf8;Write-Host 'JSON gerado na area de trabalho:' $file -ForegroundColor Green}catch{Write-Host 'Nao foi possivel salvar automaticamente.'}
try{Set-Clipboard -Value $json;Write-Host 'JSON copiado para a area de transferencia.' -ForegroundColor Green}catch{}
Write-Host 'Importe o arquivo no portal uCode e confira as informacoes antes de salvar.'
