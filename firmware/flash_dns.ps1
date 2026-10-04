$ErrorActionPreference = 'Continue'
$fw = "C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware"
$log = Join-Path $fw "flash_dns.log"
$build = Join-Path $fw "tecrural_station\build-cdc"
$sketch = Join-Path $fw "tecrural_station"

function Log($m) { "$(Get-Date -Format 'HH:mm:ss') $m" | Add-Content -Path $log }

"=== start $(Get-Date) ===" | Set-Content -Path $log

function GetEspPort {
  $dev = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_303A' -and $_.FriendlyName -match '\((COM\d+)\)' } | Select-Object -First 1
  if ($dev) { return [regex]::Match($dev.FriendlyName, '\((COM\d+)\)').Groups[1].Value }
  return $null
}

Get-CimInstance Win32_Process -Filter "Name like '%python%'" |
  Where-Object { $_.CommandLine -match 'serial_listen' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Log "killed listener pid=$($_.ProcessId)" }

$deadline = (Get-Date).AddMinutes(30)
$done = $false
while ((Get-Date) -lt $deadline -and -not $done) {
  $p = GetEspPort
  if ($p) {
    Log "intento en $p"
    $out = arduino-cli upload -p $p --fqbn esp32:esp32:esp32c3 --board-options CDCOnBoot=cdc --build-path $build $sketch 2>&1
    ($out | Select-Object -Last 3) | ForEach-Object { Log "  $_" }
    if ($out -match 'Hash of data verified') { $done = $true; Log "FLASH_OK en $p" }
    else { Log "fallo, reintentando" }
  }
  Start-Sleep -Seconds 2
}

Log "done=$done"
if ($done) {
  Start-Process -FilePath "python" -ArgumentList '"C:\Users\Manuel Q\Proyectos\TECRURAL_MICROESTACION\firmware\serial_listen.py"' -WorkingDirectory $fw -WindowStyle Hidden
  Log "listener lanzado"
}
