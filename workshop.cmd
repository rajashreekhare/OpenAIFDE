@echo off
setlocal
pushd "%~dp0" || exit /b 1
node tools\workshop.mjs %*
set "RESULT=%ERRORLEVEL%"
popd
exit /b %RESULT%
