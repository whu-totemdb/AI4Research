Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI4Research Service Stopper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Stopping services..." -ForegroundColor Yellow
Write-Host ""

# Stop backend on port 8000
Write-Host "[1/2] Stopping backend (port 8000)..." -ForegroundColor White
$backend = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($backend) {
    $backend | ForEach-Object {
        $pid = $_.OwningProcess
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Stopped process $pid" -ForegroundColor Green
    }
} else {
    Write-Host "  [-] Backend not running" -ForegroundColor Gray
}

# Stop frontend on port 3000
Write-Host "[2/2] Stopping frontend (port 3000)..." -ForegroundColor White
$frontend = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($frontend) {
    $frontend | ForEach-Object {
        $pid = $_.OwningProcess
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Stopped process $pid" -ForegroundColor Green
    }
} else {
    Write-Host "  [-] Frontend not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services stopped" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
