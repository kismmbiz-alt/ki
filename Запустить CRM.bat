@echo off
chcp 65001 >nul
title Мастерская CRM
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Скачайте и установите его с https://nodejs.org ^(кнопка LTS^), затем запустите этот файл снова.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Первый запуск: скачиваю компоненты, это займёт несколько минут...
  call npm ci --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)
node scripts\local.mjs
pause
