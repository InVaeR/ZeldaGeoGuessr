@echo off

chcp 65001 >nul

echo ========================================
echo   Сборка Zelda GeoGuessr Server
echo ========================================

cd /d "%~dp0"

echo.
echo Сборка для Windows (amd64)...
set GOOS=windows
set GOARCH=amd64
go build -ldflags="-s -w" -o ..\ZeldaGeoGuessr.exe .

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ОШИБКА сборки!
    pause
    exit /b 1
)

echo.
echo Готово! Файл: ..\ZeldaGeoGuessr.exe
echo.

pause