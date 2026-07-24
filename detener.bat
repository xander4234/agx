@echo off
title AGX Salud - Deteniendo
echo Deteniendo el sistema AGX Salud...
docker compose down
echo.
echo Sistema detenido. Los datos quedan guardados.
echo Para volver a usarlo, ejecuta iniciar.bat
echo.
pause
