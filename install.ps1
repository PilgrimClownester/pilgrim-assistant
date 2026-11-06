$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $RootDir "frontend-react"

function Stop-Install([string]$Message) {
    Write-Error "[Firefly] $Message"
    exit 1
}

$Python = Get-Command py -ErrorAction SilentlyContinue
if ($Python) {
    $PythonExe = "py"
    $PythonArgs = @("-3")
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonExe = "python"
    $PythonArgs = @()
} else {
    Stop-Install "Python 3.11+ is required."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-Install "Node.js 20+ is required." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-Install "npm is required." }

$PythonVersion = & $PythonExe @PythonArgs -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$PythonParts = $PythonVersion.Split('.')
if ([int]$PythonParts[0] -lt 3 -or ([int]$PythonParts[0] -eq 3 -and [int]$PythonParts[1] -lt 11)) {
    Stop-Install "Python 3.11 or newer is required."
}

$NodeMajor = [int](& node -p "Number(process.versions.node.split('.')[0])")
if ($NodeMajor -lt 20) { Stop-Install "Node.js 20 or newer is required." }

Write-Host "[Firefly] Creating the Python environment..."
& $PythonExe @PythonArgs -m venv (Join-Path $RootDir ".venv")
$VenvPython = Join-Path $RootDir ".venv\Scripts\python.exe"
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $RootDir "requirements.txt")

Write-Host "[Firefly] Installing desktop dependencies..."
Push-Location $FrontendDir
try {
    & npm.cmd ci
    & npm.cmd run build
} finally {
    Pop-Location
}

$EnvFile = Join-Path $RootDir ".env"
if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $RootDir ".env.example") $EnvFile
    Write-Host "[Firefly] Created .env from the safe example."
}

@("logs", "vector_db", "documents") | ForEach-Object {
    New-Item -ItemType Directory -Force -Path (Join-Path $RootDir "data\$_") | Out-Null
}

$StartMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$ShortcutPath = Join-Path $StartMenu "Firefly.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = Join-Path $RootDir "start_firefly.bat"
$Shortcut.WorkingDirectory = $RootDir
$Shortcut.IconLocation = Join-Path $RootDir "figure\firefly.ico"
$Shortcut.Save()

Write-Host ""
Write-Host "[Firefly] Installation complete."
Write-Host "1. Put your API key in: $EnvFile"
Write-Host "2. Start Firefly from the Start menu or run start_firefly.bat."
