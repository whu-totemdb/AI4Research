@echo off
title AI4Research - Start Services

echo ========================================
echo   AI4Research Service Launcher
echo ========================================
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found, please install Python first
    pause
    exit /b 1
)

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found, please install Node.js first
    pause
    exit /b 1
)

echo [1/3] Starting backend service (FastAPI)...
start "AI4Research-Backend" cmd /k "cd /d %~dp0backend && python main.py"
timeout /t 2 /nobreak >nul

echo [2/3] Starting frontend service (React)...
start "AI4Research-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 3 /nobreak >nul

echo [3/3] Services started!
echo.
echo ========================================
echo   Service URLs:
echo   - Backend: http://localhost:8000
echo   - Frontend: http://localhost:3000
echo ========================================
echo.
echo Note: Two service windows are now open
echo       Close the windows to stop services
echo.
echo Press any key to open frontend in browser...
pause >nul

:: Open browser
start http://localhost:3000

exit
