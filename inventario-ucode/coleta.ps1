# uCode Inventario - Coleta de hardware, software e rede (somente leitura).
# Execute somente com autorizacao da empresa. Nao coleta arquivos pessoais, senhas ou chaves.
$ErrorActionPreference = 'SilentlyContinue'
function S($b) { try { & $b } catch { $null } }
$pc=S { Get-CimInstance Win32_ComputerSystem }
$os=S { Get-CimInstance Win32_OperatingSystem }
# A data de instalacao pode mudar com reinstalacao ou atualizacoes do Windows.
$windowsInstallDate=S { if($os.InstallDate){([datetime]$os.InstallDate).ToString('yyyy-MM-dd')} else {''} }
$bios=S { Get-CimInstance Win32_BIOS }
$processor=S { Get-CimInstance Win32_Processor | Select-Object -First 1 }
# GPUs: Win32_VideoController mostra GPUs reconhecidas pelo driver, mas
# AdapterRAM pode ser limitado a 4 GB e memoria compartilhada nao e VRAM dedicada.
$gpuControllers=@(S { Get-CimInstance Win32_VideoController | Where-Object { $_.Name } })
$gpus=@($gpuControllers | ForEach-Object {
 $g=$_
 $name=[string]$g.Name
 $possibleType='Nao confirmado'
 if($name -match '(?i)intel.*(uhd|iris|hd graphics|arc graphics)' -and $name -notmatch '(?i)intel arc (a[0-9]|b[0-9])'){$possibleType='Integrada (provavel)'}
 elseif($name -match '(?i)nvidia.*(geforce|quadro|rtx|gtx|tesla|t[0-9]+)' -or $name -match '(?i)radeon\s+rx\s*[0-9]'){$possibleType='Dedicada (provavel)'}
 $memBytes=0
 try { $memBytes=[double]$g.AdapterRAM } catch {}
 $reportedGB=$null
 if($memBytes -gt 0 -and $memBytes -lt 4294960000 -and $possibleType -notmatch 'Integrada'){
   $reportedGB=[math]::Round($memBytes/1GB,2)
 }
 [ordered]@{
  Model=$name
  Manufacturer=[string]$g.AdapterCompatibility
  PossibleType=$possibleType
  ReportedMemoryGB=$reportedGB
  DriverVersion=[string]$g.DriverVersion
  Status=[string]$g.Status
 }
})
$gpuType='Nao confirmado'
if($gpus.Count -gt 0){
 $hasI=@($gpus|Where-Object { $_.PossibleType -match '^Integrada' }).Count -gt 0
 $hasD=@($gpus|Where-Object { $_.PossibleType -match '^Dedicada' }).Count -gt 0
 if($hasI -and $hasD){$gpuType='Integrada + dedicada (provavel)'}
 elseif($hasI -and -not $hasD -and $gpus.Count -eq 1){$gpuType='Integrada (provavel)'}
 elseif($hasD -and -not $hasI -and $gpus.Count -eq 1){$gpuType='Dedicada (provavel)'}
}
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
 collector='uCode Inventario Windows v4'
 collectedAt=(Get-Date).ToString('o')
 hostname=$env:COMPUTERNAME
 serial=[string]$bios.SerialNumber
 vendor=[string]$pc.Manufacturer
 model=[string]$pc.Model
 cpu=[string]$processor.Name
 ramGB=[math]::Round(($pc.TotalPhysicalMemory / 1GB),1)
 ramModules=$ram
 gpus=$gpus
 gpuType=$gpuType
 os=[string]$os.Caption
 osVersion=[string]$os.Version
 windowsInstallDate=[string]$windowsInstallDate
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
# Conversao verificada: em caso de falha, mostrar o motivo.
try {
 $json=$obj | ConvertTo-Json -Depth 8 -ErrorAction Stop
 if([string]::IsNullOrWhiteSpace($json)){ throw "O JSON gerado ficou vazio." }
} catch {
 Write-Host "[ERRO] Nao foi possivel gerar o JSON: $($_.Exception.Message)" -ForegroundColor Red
 Write-Host "Copie ou fotografe este erro para suporte uCode." -ForegroundColor Yellow
 return
}

# Resolucao de pastas: a area de trabalho pode estar redirecionada ao OneDrive.
$name=($env:COMPUTERNAME -replace '[^a-zA-Z0-9_-]','_')
$stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$filename='ucode_inventario_'+$name+'_'+$stamp+'.json'
$folders=New-Object 'System.Collections.Generic.List[string]'
function Add-SaveFolder([string]$candidate){
 if([string]::IsNullOrWhiteSpace($candidate)){return}
 try {
  if((Test-Path -LiteralPath $candidate -PathType Container) -and -not $folders.Contains($candidate)){
   $folders.Add($candidate)
  }
 } catch {}
}
Add-SaveFolder ([Environment]::GetFolderPath('Desktop'))
if($env:USERPROFILE){
 Add-SaveFolder (Join-Path $env:USERPROFILE 'Desktop')
 Add-SaveFolder (Join-Path $env:USERPROFILE 'Downloads')
 Add-SaveFolder (Join-Path $env:USERPROFILE 'Documents')
}
if($env:OneDrive){Add-SaveFolder (Join-Path $env:OneDrive 'Desktop')}
if($env:OneDriveCommercial){Add-SaveFolder (Join-Path $env:OneDriveCommercial 'Desktop')}
Add-SaveFolder ([Environment]::GetFolderPath('MyDocuments'))
if($env:TEMP){Add-SaveFolder $env:TEMP}

$savedPath=$null
$writeErrors=New-Object 'System.Collections.Generic.List[string]'
foreach($folder in $folders){
 $destination=Join-Path $folder $filename
 try {
  $json | Out-File -LiteralPath $destination -Encoding UTF8 -ErrorAction Stop
  if(-not (Test-Path -LiteralPath $destination -PathType Leaf)){
   throw 'O arquivo nao apareceu depois da gravacao.'
  }
  $info=Get-Item -LiteralPath $destination -ErrorAction Stop
  if($info.Length -lt 10){ throw 'O arquivo salvo esta vazio ou incompleto.' }
  $savedPath=$info.FullName
  break
 } catch {
  $writeErrors.Add("$folder - $($_.Exception.Message)")
 }
}
Write-Host ''
if($savedPath){
 Write-Host '[OK] INVENTARIO GERADO E VERIFICADO' -ForegroundColor Green
 Write-Host ("Arquivo: "+$savedPath) -ForegroundColor Green
 Write-Host ('Tamanho: '+(Get-Item -LiteralPath $savedPath).Length+' bytes') -ForegroundColor Green
 Write-Host 'A pasta do arquivo sera aberta no Explorador do Windows.' -ForegroundColor Cyan
 try {
  Start-Process -FilePath explorer.exe -ArgumentList ('/select,"'+$savedPath+'"') -ErrorAction Stop
 } catch {
  Write-Host 'Abra manualmente o caminho acima pelo Explorador de Arquivos.' -ForegroundColor Yellow
 }
} else {
 Write-Host '[ERRO] Nao foi possivel salvar o JSON em nenhuma pasta disponivel.' -ForegroundColor Red
 foreach($reason in $writeErrors){Write-Host (" - "+$reason) -ForegroundColor Yellow}
}
try {
 Set-Clipboard -Value $json -ErrorAction Stop
 Write-Host '[OK] JSON copiado: no inventario, abra Windows / PowerShell e cole no campo JSON (Ctrl+V).' -ForegroundColor Green
} catch {
 Write-Host 'Nao foi possivel copiar para a area de transferencia.' -ForegroundColor Yellow
}
if($savedPath){
 Write-Host 'No site uCode, importe o arquivo JSON indicado acima e confira os dados.' -ForegroundColor Cyan
} else {
 Write-Host 'Se o JSON foi copiado, cole direto no site sem precisar do arquivo.' -ForegroundColor Cyan
}
Write-Host 'Coleta finalizada. Se houve erro, fotografe as mensagens acima.'
