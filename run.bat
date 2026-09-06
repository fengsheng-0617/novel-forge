@echo off
rem ============================================================
rem  织文 NovelForge - AI 小说创作工坊  启动脚本（Windows）
rem  - 端口：默认 7390；如需更换： set NOVEL_PORT=7400  再运行本脚本
rem  - 数据目录默认 ./data；更换： set NOVEL_DATA=D:\my-novels
rem ============================================================
setlocal
chcp 65001 >nul
title 织文 NovelForge

set "PORT=%NOVEL_PORT%"
if "%PORT%"=="" set "PORT=7390"

echo.
echo  ==============================================
echo   织文 NovelForge - AI 小说创作工坊
echo   端口: %PORT%    数据: 项目目录下 data\
echo   启动后会自动打开浏览器；关掉本窗口即停止服务。
echo   提示: 若提示端口被占用，说明已有一个实例在运行，
echo         直接打开 http://127.0.0.1:%PORT% 即可。
echo  ==============================================
echo.

node server\index.js

echo.
echo  ==============================================
if errorlevel 1 (
  echo  服务异常退出(错误码 %errorlevel%)。
  echo  若提示"端口已被占用"：请先关闭已运行的旧实例，
  echo  或用 set NOVEL_PORT=7400 换一个端口后重试。
) else (
  echo  服务已停止。
)
echo  ==============================================
echo.
pause
