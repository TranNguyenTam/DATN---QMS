# ============================================================
# stop.ps1 - kill all QMS services running on fixed ports
# ============================================================

$ports = @(5000, 5173, 5010, 5011)

Write-Host ""
Write-Host "===  Stopping QMS  ===" -ForegroundColor Cyan

foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "  port $port  - no process" -ForegroundColor DarkGray
        continue
    }
    foreach ($c in $conns) {
        try {
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            $name = if ($proc) { $proc.ProcessName } else { "?" }
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "  port $port  - stopped $name (pid $($c.OwningProcess))" -ForegroundColor Yellow
        } catch {
            Write-Host "  port $port  - cannot kill pid $($c.OwningProcess)" -ForegroundColor Red
        }
    }
}

# Cleanup leftover Qms.API processes (lock dll on rebuild)
Get-Process -Name "Qms.API" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Qms.API   - stopped pid $($_.Id)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===  Done  ===" -ForegroundColor Green
Write-Host ""
