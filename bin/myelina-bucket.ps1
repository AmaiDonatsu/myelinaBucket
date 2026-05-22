$ErrorActionPreference = "Stop"

$configuredRoot = $env:MYELINA_BUCKET_HOME
$root = if ($configuredRoot) { $configuredRoot } else { Split-Path -Parent $PSScriptRoot }
$bundledNode = "C:\Users\rodol\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodePath = $env:MYELINA_BUCKET_NODE_PATH

if (-not $nodePath) {
  if (Test-Path $bundledNode) {
    $nodePath = $bundledNode
  } else {
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
  }
}

if (-not $nodePath) {
  throw "Node.js no está disponible. Define MYELINA_BUCKET_NODE_PATH o instala Node."
}

& $nodePath (Join-Path $root "src\\cli.js") @args

