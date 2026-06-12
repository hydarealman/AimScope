$ErrorActionPreference = "Stop"

$Usbipd = "C:\Program Files\usbipd-win\usbipd.exe"
$BusId = "1-8"

if (-not (Test-Path $Usbipd)) {
    Write-Host "usbipd-win not found. Install it first:" -ForegroundColor Red
    Write-Host "winget install --id dorssel.usbipd-win -e"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Camera BUSID: $BusId" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Current USB list"
& $Usbipd list
Write-Host ""

Write-Host "[2/3] Bind camera to usbipd"
& $Usbipd bind --busid $BusId
Write-Host ""

Write-Host "[3/3] Attach camera to WSL"
& $Usbipd attach --wsl --busid $BusId
Write-Host ""

Write-Host "Done. Current USB list:" -ForegroundColor Green
& $Usbipd list
Write-Host ""
Write-Host "Now check in WSL:" -ForegroundColor Yellow
Write-Host "ls /dev/video*"
Write-Host ""
Read-Host "Press Enter to exit"
