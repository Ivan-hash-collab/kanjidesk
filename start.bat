@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title KanjiDesk

if exist "dist\index.html" goto run

where node >nul 2>nul
if errorlevel 1 goto need_node
if not exist "node_modules\" call npm install
if errorlevel 1 goto fail_npm
call npm run build
if errorlevel 1 goto fail_build
goto run

:need_node
echo Node.js is required for the first build: https://nodejs.org
pause
exit /b 1

:fail_npm
echo npm install failed.
pause
exit /b 1

:fail_build
echo Build failed.
pause
exit /b 1

:run
where py >nul 2>nul
if errorlevel 1 goto py_fallback
py -3 "%~dp0launch.py"
if errorlevel 1 pause
exit /b %ERRORLEVEL%

:py_fallback
where python >nul 2>nul
if errorlevel 1 goto need_python
python "%~dp0launch.py"
if errorlevel 1 pause
exit /b %ERRORLEVEL%

:need_python
echo Python 3 not found.
pause
exit /b 1