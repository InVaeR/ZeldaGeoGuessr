@echo off
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

:: Опционально: сборка для других платформ
:: echo Сборка для Linux...
:: set GOOS=linux
:: set GOARCH=amd64
:: go build -ldflags="-s -w" -o ..\ZeldaGeoGuessr_linux .

:: echo Сборка для macOS...
:: set GOOS=darwin
:: set GOARCH=amd64
:: go build -ldflags="-s -w" -o ..\ZeldaGeoGuessr_mac .

pause