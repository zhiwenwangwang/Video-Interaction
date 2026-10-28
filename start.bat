@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
  node server.mjs --open
  goto :end
)
where python >nul 2>nul
if %errorlevel% equ 0 (
  echo 未找到 Node.js，改用 Python 本地服务器。
  start "" "http://localhost:5173"
  python -m http.server 5173 --bind 127.0.0.1
  goto :end
)
where py >nul 2>nul
if %errorlevel% equ 0 (
  echo 未找到 Node.js，改用 Python 本地服务器。
  start "" "http://localhost:5173"
  py -3 -m http.server 5173 --bind 127.0.0.1
  goto :end
)
set "PUPPET_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%PUPPET_NODE%" (
  "%PUPPET_NODE%" server.mjs --open
  goto :end
)
echo 未找到 Node.js。请安装 Node.js 18 或更新版本，然后再次双击本文件。
pause
:end
