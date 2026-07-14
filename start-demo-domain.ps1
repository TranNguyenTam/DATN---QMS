# start-demo-domain.ps1 - Run the QMS demo on a fixed domain
# via a Cloudflare NAMED tunnel + production build (so PWA + Web Push work).
#
# One-time setup (already done): cloudflared tunnel login + `tunnel create qms`
#   + `tunnel route dns qms qms.pharmahome.shop` + %USERPROFILE%\.cloudflared\config.yml.
# This script: backend -> set domain env -> build FE -> serve build -> run tunnel.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cf = Join-Path $root 'tools\cloudflared.exe'

# 1) Backend (if down)
if (-not (Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue)) {
    Write-Host "==> Starting backend :5000 ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; dotnet run --project backend/Qms.API --urls http://localhost:5000"
}

# 1b) AI services (if down): ml-wait-time :5011 (wait prediction) + ai-face :5010 (face check-in).
#     Need Python deps installed once via `.\setup.ps1 -All`.
if (-not (Get-NetTCPConnection -State Listen -LocalPort 5011 -ErrorAction SilentlyContinue)) {
    Write-Host "==> Starting ml-wait-time :5011 ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\ml-wait-time'; uvicorn serve:app --port 5011"
}
if (-not (Get-NetTCPConnection -State Listen -LocalPort 5010 -ErrorAction SilentlyContinue)) {
    Write-Host "==> Starting ai-face :5010 (loads Facenet512, ~30-60s) ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\ai-face'; uvicorn app:app --port 5010"
}

# 2) Pin VITE_PUBLIC_URL to the domain, then production build (bakes URL + PWA SW)
@"
# AUTO by start-demo-domain.ps1 - fixed domain via Cloudflare named tunnel.
VITE_PUBLIC_URL=https://your-domain.example.com
"@ | Set-Content -Path (Join-Path $root 'frontend\.env.local') -Encoding utf8
Write-Host "==> Building frontend (PWA + Web Push)..." -ForegroundColor Cyan
Push-Location (Join-Path $root 'frontend')
npm run build
Pop-Location

# 3) Serve the build (vite preview :4173, proxies /api + /ws -> :5000)
$fe = Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue
if ($fe) { $fe.OwningProcess | Select-Object -Unique | ForEach-Object { try { Stop-Process -Id $_ -Force } catch {} } }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run preview"

# 4) Named tunnel -> domain (kill any old cloudflared first)
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$cf' tunnel run qms"

Write-Host "DONE." -ForegroundColor Green
Write-Host "Login: ADMIN / (password from seed)" -ForegroundColor Green
Write-Host "Started: backend(5000) + ml-wait-time(5011) + ai-face(5010) + preview(4173) + tunnel." -ForegroundColor Green
Write-Host "Keep all those windows open during the demo." -ForegroundColor Green
