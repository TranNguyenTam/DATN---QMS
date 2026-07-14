# start-demo-tunnel.ps1 - Public HTTPS demo via cloudflared quick tunnel.
# Works on ANY network (phone can use mobile data). HTTPS => browser notifications work.
# Needs internet on this laptop. Tunnel URL is random each run; this script feeds it
# into frontend/.env.local so the Kiosk QR uses the public URL automatically.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cf = Join-Path $root 'tools\cloudflared.exe'
if (-not (Test-Path $cf)) {
  Write-Host "Missing tools\cloudflared.exe. Download cloudflared-windows-amd64.exe into the tools\ folder." -ForegroundColor Red
  exit 1
}

# 1) Start backend if down
if (-not (Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue)) {
  Write-Host "==> Starting backend :5000 ..." -ForegroundColor Cyan
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; dotnet run --project backend/Qms.API --urls http://localhost:5000"
}

# 2) Start cloudflared tunnel -> capture public URL
$log = Join-Path $env:TEMP 'qms-cf.out.log'
$errlog = Join-Path $env:TEMP 'qms-cf.err.log'
Remove-Item $log, $errlog -Force -ErrorAction SilentlyContinue
Write-Host "==> Starting cloudflared tunnel ..." -ForegroundColor Cyan
Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', 'http://localhost:5173' `
  -RedirectStandardOutput $log -RedirectStandardError $errlog -WindowStyle Hidden
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  $txt = (Get-Content $log, $errlog -ErrorAction SilentlyContinue) -join "`n"
  if ($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $Matches[0] }
}
if (-not $url) { Write-Host "Could not obtain tunnel URL (check internet)." -ForegroundColor Red; exit 1 }
Write-Host "==> Public URL: $url" -ForegroundColor Green

# 3) Write .env.local so Kiosk QR uses the tunnel URL
@"
# AUTO by start-demo-tunnel.ps1 - public HTTPS tunnel URL (changes each run).
VITE_PUBLIC_URL=$url
"@ | Set-Content -Path (Join-Path $root 'frontend\.env.local') -Encoding utf8

# 4) (re)start frontend so it picks up the new env
$fe = Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue
if ($fe) { $fe.OwningProcess | Select-Object -Unique | ForEach-Object { try { Stop-Process -Id $_ -Force } catch {} } }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "DONE. Public demo URL: $url" -ForegroundColor Green
Write-Host "Open kiosk:  $url/kiosk/tiep-nhan  -> take a number -> QR uses this URL." -ForegroundColor Green
Write-Host "Scan the QR from ANY phone (even mobile data). Keep this window open during the demo." -ForegroundColor Green
