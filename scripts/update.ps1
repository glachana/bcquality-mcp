<#
.SYNOPSIS
    Met à jour bcquality-mcp depuis le repo Azure DevOps.

.DESCRIPTION
    Récupère la dernière version (git pull), réinstalle les dépendances si nécessaire,
    rebuild le serveur. Le client MCP doit être redémarré ensuite.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Write-Step($msg)   { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "    ✓ $msg" -ForegroundColor Green }

Push-Location $ProjectRoot
try {
    Write-Step "git pull"
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull a échoué (conflits ?)" }
    Write-Ok "Repo à jour"

    Write-Step "npm install (si package-lock.json a changé)"
    npm install --silent
    Write-Ok "Dépendances OK"

    Write-Step "Build"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build a échoué" }
    Write-Ok "Build OK"

    Write-Host ""
    Write-Host "🔁 Mise à jour terminée. Redémarrez votre client MCP (Claude Code/Desktop)." -ForegroundColor Green
} finally {
    Pop-Location
}
