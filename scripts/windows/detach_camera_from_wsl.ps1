$ErrorActionPreference = "Stop"

$Usbipd = "C:\Program Files\usbipd-win\usbipd.exe"
$BusId = "1-8"

if (-not (Test-Path $Usbipd)) {
    Write-Host "usbipd-win not found." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/2] Detach camera from WSL"
& $Usbipd detach --busid $BusId
Write-Host ""

Write-Host "[2/2] Unbind camera from usbipd"
& $Usbipd unbind --busid $BusId
Write-Host ""

Write-Host "Done. Current USB list:" -ForegroundColor Green
& $Usbipd list
Write-Host ""
Read-Host "Press Enter to exit"
