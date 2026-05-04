#!/usr/bin/env powershell
# EduPay Smart System - Quick Start Script

Write-Host "🚀 EduPay Smart System - Quick Start" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Check requirements
Write-Host "✓ Checking prerequisites..." -ForegroundColor Green
$checks = @(
    ("Node.js", "node --version"),
    ("npm", "npm --version"),
    ("pnpm", "pnpm --version")
)

foreach ($check in $checks) {
    $name = $check[0]
    $cmd = $check[1]
    try {
        $version = Invoke-Expression $cmd 2>$null
        Write-Host "  ✓ $name: $version" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ $name: NOT FOUND" -ForegroundColor Red
        Write-Host "    Install from: https://nodejs.org/" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Choose deployment mode:" -ForegroundColor Cyan
Write-Host "1. Development (local, no DB)"
Write-Host "2. Development with Docker"
Write-Host "3. Production Local"
Write-Host "4. Production Deploy (Render)"
Write-Host ""

$choice = Read-Host "Enter choice (1-4)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🎬 Starting Development Mode..." -ForegroundColor Green
        Write-Host "One command starts Web + demo API:" -ForegroundColor Cyan
        Write-Host "  pnpm dev:demo" -ForegroundColor Yellow
        Write-Host ""

        Start-Process powershell -ArgumentList "-NoExit", "-Command", "pnpm dev:demo"

        Write-Host "✅ Development terminal opened!" -ForegroundColor Green
        Write-Host "   Web: http://localhost:5173 (or next free port)" -ForegroundColor Cyan
        Write-Host "   API: http://localhost:4000" -ForegroundColor Cyan
        Write-Host "   Login: admin@school.com / password123" -ForegroundColor Yellow
        Write-Host "   Parent: parent@school.com / password123" -ForegroundColor Yellow
    }
    
    "2" {
        Write-Host ""
        Write-Host "🐳 Starting Docker Compose..." -ForegroundColor Green
        Write-Host ""
        
        # Check if .env exists
        if (-not (Test-Path ".env")) {
            Write-Host "⚠️  .env file not found!" -ForegroundColor Yellow
            Write-Host "Creating .env from .env.example..." -ForegroundColor Cyan
            Copy-Item ".env.example" ".env"
            Write-Host "✓ .env created (edit before running)" -ForegroundColor Green
        }
        
        Write-Host "Starting all services..." -ForegroundColor Cyan
        docker-compose up -d
        
        Write-Host ""
        Write-Host "✅ Services started!" -ForegroundColor Green
        Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Cyan
        Write-Host "   API: http://localhost:4000" -ForegroundColor Cyan
        Write-Host "   PostgreSQL: localhost:5432" -ForegroundColor Cyan
        Write-Host "   Redis: localhost:6379" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "View logs: docker-compose logs -f" -ForegroundColor Yellow
        Write-Host "Stop: docker-compose down" -ForegroundColor Yellow
    }
    
    "3" {
        Write-Host ""
        Write-Host "🏢 Building for Production..." -ForegroundColor Green
        Write-Host ""
        
        Write-Host "Building Frontend..." -ForegroundColor Cyan
        cd apps\web
        npm run build
        
        Write-Host ""
        Write-Host "Building API..." -ForegroundColor Cyan
        cd ..\api
        npm run build
        
        Write-Host ""
        Write-Host "✅ Production build complete!" -ForegroundColor Green
        Write-Host "   Frontend dist: apps/web/dist/" -ForegroundColor Cyan
        Write-Host "   API build: apps/api/dist/" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "To start in production:" -ForegroundColor Yellow
        Write-Host "  Terminal 1: cd apps/api && npm run start" -ForegroundColor Cyan
        Write-Host "  Terminal 2: cd apps/web && npm run preview" -ForegroundColor Cyan
    }
    
    "4" {
        Write-Host ""
        Write-Host "🌐 Preparing for Render Deployment..." -ForegroundColor Green
        Write-Host ""
        
        # Check git
        if (-not (Test-Path ".git")) {
            Write-Host "⚠️  Git not initialized!" -ForegroundColor Yellow
            Write-Host "Initializing git..." -ForegroundColor Cyan
            git init
            git add .
            git commit -m "Initial commit: EduPay Smart System"
        }
        
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Go to https://render.com" -ForegroundColor White
        Write-Host "2. Sign up or log in" -ForegroundColor White
        Write-Host "3. Create New Project → Blueprint" -ForegroundColor White
        Write-Host "4. Connect this GitHub repo" -ForegroundColor White
        Write-Host "5. Click Deploy" -ForegroundColor White
        Write-Host ""
        Write-Host "Make sure your repo has:" -ForegroundColor Yellow
        Write-Host "  ✓ render.yaml at root" -ForegroundColor Cyan
        Write-Host "  ✓ All files committed to GitHub" -ForegroundColor Cyan
        Write-Host "  ✓ .env vars configured in Render dashboard" -ForegroundColor Cyan
        Write-Host ""
        
        $openBrowser = Read-Host "Open Render.com? (Y/n)"
        if ($openBrowser -ne "n") {
            Start-Process "https://render.com"
        }
    }
    
    default {
        Write-Host "Invalid choice!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "For full documentation, see: DEPLOYMENT_GUIDE.md" -ForegroundColor Yellow
