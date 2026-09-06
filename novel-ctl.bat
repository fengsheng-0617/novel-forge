@echo off
setlocal EnableExtensions
chcp 65001 >nul
title NovelForge Service Control

rem ============================================================
rem  NovelForge service control (standalone edition)
rem  Usage :
rem    novel-ctl.bat            status
rem    novel-ctl.bat start      start service in background
rem    novel-ctl.bat stop       stop the running service
rem    novel-ctl.bat restart    restart it
rem    novel-ctl.bat status 7400 / start 7400 / ...
rem  Output is localized (Chinese) from the Node engine below.
rem ============================================================

set "NF_DIR=%~dp0"
cd /d "%NF_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo  [FAIL] Node.js not found. Install Node 18.17+ first.
  goto :end
)

if "%~1"=="" (
  echo  Running: novel-ctl status
  node "%NF_DIR%scripts\server-ctl.mjs" status %2
  goto :end
)

node "%NF_DIR%scripts\server-ctl.mjs" %1 %2
set "EXITCODE=%ERRORLEVEL%"
echo.
if "%EXITCODE%"=="0" (
  echo  OK - command finished.
) else (
  echo  Note: non-zero exit (%EXITCODE%) - see messages above.
)

:end
echo.
if not defined NF_NO_PAUSE pause
exit /b %EXITCODE%
