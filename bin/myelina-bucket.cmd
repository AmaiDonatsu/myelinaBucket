@echo off
setlocal

set "ROOT=%MYELINA_BUCKET_HOME%"
if not defined ROOT set "ROOT=%~dp0.."

set "NODE_PATH=%MYELINA_BUCKET_NODE_PATH%"
if not defined NODE_PATH set "NODE_PATH=C:\Users\rodol\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_PATH%" set "NODE_PATH=node"

"%NODE_PATH%" "%ROOT%\src\cli.js" %*
