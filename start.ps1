# ============================================================
# start.ps1 - launch QMS services
#
# Usage:
#   .\start.ps1          # backend + frontend (core)
#   .\start.ps1 -All     # + ai-face + ml-wait-time
#   .\start.ps1 -Ai      # + ai-face only
#   .\start.ps1 -Ml      # + ml-wait-time only
#
# Each service opens in its own PowerShell window for log visibility.
# ============================================================
param(
    [switch]$All,
    [switch]$Ai,
    [switch]$Ml
)

$root = $PSScriptRoot

function Stop-Port($port) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        } catch {}
    }
}

function Start-Service-Window($title, $workingDir, $command, $color = "Green") {
    $script = @"
`$Host.UI.RawUI.WindowTitle = '$title'
Set-Location '$workingDir'
Write-Host '=== $title ===' -ForegroundColor $color
$command
"@
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $script
}

Write-Host ""
Write-Host "===  Starting QMS  ===" -ForegroundColor Cyan
Write-Host ""

# 0. Refresh demo data dates to today (so queues are not empty)
#    All SP_002/SP_004 filter WHERE NgayThucHien = today; demo data
#    has fixed dates so it must be shifted forward each day.
$refreshSql = "$root\database\setup\41_refresh_demo_today.sql"
if (Test-Path $refreshSql) {
    Write-Host "[DB]           refreshing demo data to today..." -ForegroundColor Yellow
    try {
        # -f 65001 = UTF-8 code page. Bắt buộc nếu file .sql có ký tự
        # tiếng Việt N'...' — mặc định sqlcmd đọc cp1252/cp1258 sẽ lưu
        # mojibake vào DB (vd "Bạn" → "Báº¡n").
        sqlcmd -S "localhost\SQLEXPRESS" -E -d QMS_DA -f 65001 -i $refreshSql -b | Out-Null
        Write-Host "[DB]           demo data refreshed OK" -ForegroundColor DarkGray
    } catch {
        Write-Host "[DB]           refresh skipped (sqlcmd not found or DB down)" -ForegroundColor DarkYellow
    }
}

# 1. Backend (always)
Write-Host "[Backend]      port 5000  - cleaning old processes..." -ForegroundColor Yellow
Get-Process -Name "Qms.API" -ErrorAction SilentlyContinue | Stop-Process -Force
Stop-Port 5000
Start-Service-Window "QMS Backend (5000)" "$root\backend\Qms.API" "dotnet run" "Cyan"

Start-Sleep -Seconds 2

# 2. Frontend (always)
Write-Host "[Frontend]     port 5173  - cleaning old processes..." -ForegroundColor Yellow
Stop-Port 5173
Start-Service-Window "QMS Frontend (5173)" "$root\frontend" "npm run dev" "Magenta"

# 3. ai-face (optional)
if ($All -or $Ai) {
    Write-Host "[ai-face]      port 5010  - cleaning old processes..." -ForegroundColor Yellow
    Stop-Port 5010
    # Token nội bộ phải KHỚP FaceAi:InternalToken trong backend appsettings.json
    # (backend gửi header X-Internal-Token; service từ chối 401 nếu sai/thiếu).
    $faceToken = if ($env:FACE_INTERNAL_TOKEN) { $env:FACE_INTERNAL_TOKEN } else { "CHANGE_ME_SET_FACE_INTERNAL_TOKEN_IN_ENV" }
    $faceEnv = "`$env:FACE_INTERNAL_TOKEN='$faceToken'; `$env:FACE_COSINE_THRESHOLD='0.62'; `$env:FACE_MATCH_MARGIN='0.06'; "
    $cmd = "$faceEnv uvicorn app:app --host 0.0.0.0 --port 5010 --reload"
    Start-Service-Window "QMS ai-face (5010)" "$root\ai-face" $cmd "Yellow"
}

# 4. ml-wait-time (optional)
if ($All -or $Ml) {
    Write-Host "[ml-wait-time] port 5011  - cleaning old processes..." -ForegroundColor Yellow
    Stop-Port 5011
    $cmd = "uvicorn serve:app --host 0.0.0.0 --port 5011 --reload"
    Start-Service-Window "QMS ml-wait-time (5011)" "$root\ml-wait-time" $cmd "Yellow"
}

Write-Host ""
Write-Host "===  Started (wait 5-10s for Vite + dotnet to warm up)  ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend       http://localhost:5173"
Write-Host "  Backend API    http://localhost:5000"
Write-Host "  Backend docs   http://localhost:5000/scalar/v1"
if ($All -or $Ai) { Write-Host "  ai-face        http://localhost:5010/docs" }
if ($All -or $Ml) { Write-Host "  ml-wait-time   http://localhost:5011/docs" }
Write-Host ""
Write-Host "  Login with a user from Sys_Users (e.g. ADMIN)."
Write-Host "  Stop all: .\stop.ps1"
Write-Host ""
