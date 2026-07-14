# ============================================================
# setup.ps1 - run once to restore dependencies
#
# Usage:
#   .\setup.ps1            # backend + frontend
#   .\setup.ps1 -All       # + ai-face + ml-wait-time (need Python)
# ============================================================
param(
    [switch]$All
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host ""
Write-Host "===  QMS Final - Setup Dependencies  ===" -ForegroundColor Cyan
Write-Host ""

# 1. Backend
Write-Host "[1/4] Backend ASP.NET Core - dotnet restore..." -ForegroundColor Yellow
Push-Location "$root\backend"
try {
    dotnet restore
    if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed" }
    Write-Host "      OK" -ForegroundColor Green
} finally {
    Pop-Location
}

# 2. Frontend
Write-Host ""
Write-Host "[2/4] Frontend React - npm install..." -ForegroundColor Yellow
Push-Location "$root\frontend"
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Write-Host "      OK" -ForegroundColor Green
} finally {
    Pop-Location
}

# 3 + 4. Python services (optional)
if ($All) {
    $py = (Get-Command python -ErrorAction SilentlyContinue)
    if (-not $py) {
        Write-Host ""
        Write-Host "Skip Python services (python not in PATH)." -ForegroundColor DarkYellow
    } else {
        Write-Host ""
        Write-Host "[3/4] ai-face - pip install..." -ForegroundColor Yellow
        Push-Location "$root\ai-face"
        try {
            python -m pip install --quiet -r requirements.txt
            Write-Host "      OK (Facenet512 ~90MB downloaded on first run)" -ForegroundColor Green
        } finally {
            Pop-Location
        }

        Write-Host ""
        Write-Host "[4/4] ml-wait-time - pip install..." -ForegroundColor Yellow
        Push-Location "$root\ml-wait-time"
        try {
            python -m pip install --quiet -r requirements.txt
            Write-Host "      OK" -ForegroundColor Green
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Host ""
    Write-Host "Skip Python services (run with -All to install)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "===  Setup done. Run .\start.ps1 to launch.  ===" -ForegroundColor Cyan
Write-Host ""
