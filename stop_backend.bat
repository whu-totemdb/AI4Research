@echo off
echo Stopping all Python processes on port 8000...

REM Find and kill all processes listening on port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING"') do (
    echo Killing process %%a
    taskkill /F /PID %%a 2>nul
)

echo.
echo All old backend processes stopped.
echo.
echo Please restart the backend manually:
echo   cd backend
echo   python main.py
echo.
pause
