@echo off
title AGX Salud - Iniciando
echo ============================================
echo   AGX Salud - Iniciando el sistema...
echo ============================================
echo.
echo Esto puede tardar unos minutos la primera vez.
echo.
docker compose up -d --build
if %errorlevel% neq 0 (
  echo.
  echo ERROR: Asegurate de que Docker Desktop este abierto y espera unos segundos.
  pause
  exit /b
)
echo.
echo ============================================
echo   Listo! Abre el navegador en:
echo   http://localhost:8080
echo ============================================
echo.
start http://localhost:8080
pause
