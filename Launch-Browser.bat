@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo Starting Classroom Educational Browser...
echo ========================================================
echo Checking build...
call npm run build
echo Launching application...
call npm start
pause
