@echo off
chcp 65001 >nul
title Решебник 1 класс - Локальный сервер для Учителя
cd /d "%~dp0"

echo ============================================================
echo   📚 Запуск локального решебника 1 класса для Учителя...
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден на этом компьютере!
    echo Пожалуйста, установите Node.js с официального сайта https://nodejs.org/
    pause
    exit /b 1
)

:: Открываем браузер через 1.5 секунды после старта сервера
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Запуск локального сервера
node server/server.js

pause
