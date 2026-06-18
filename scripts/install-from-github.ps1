<#
.SYNOPSIS
    Installe bcquality-mcp depuis GitHub en une seule commande.

.DESCRIPTION
    Pour les collègues qui n'ont pas encore le repo localement.
    Clone le repo, installe les dépendances, build, puis enregistre le serveur
    dans le client MCP de leur choix.

.PARAMETER InstallPath
    Dossier où cloner le repo. Défaut : $env:USERPROFILE\bcquality-mcp

.PARAMETER ClaudeCode
    Enregistre dans Claude Code.

.PARAMETER ClaudeDesktop
    Enregistre dans Claude Desktop.

.EXAMPLE
    # Lancement direct depuis le web :
    irm https://raw.githubusercontent.com/glachana/bcquality-mcp/main/scripts/install-from-github.ps1 | iex

.EXAMPLE
    .\install-from-github.ps1 -ClaudeCode -InstallPath C:\tools\bcquality-mcp
#>

[CmdletBinding()]
param(
    [string]$InstallPath = (Join-Path $env:USERPROFILE 'bcquality-mcp'),
    [switch]$ClaudeCode,
    [switch]$ClaudeDesktop,
    [string]$RepoUrl = 'https://github.com/glachana/bcquality-mcp.git',
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

function Write-Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "    ✓ $m" -ForegroundColor Green }

# 1. Pré-requis
Write-Step "Vérification des pré-requis"
try {
    $nodeMajor = [int](((node --version) -replace 'v','').Split('.')[0])
    if ($nodeMajor -lt 18) { throw "Node 18+ requis, $nodeMajor détecté." }
    Write-Ok "Node OK"
} catch {
    Write-Host "✘ Node.js 18+ est requis. Installez https://nodejs.org/" -ForegroundColor Red
    exit 1
}
try { git --version | Out-Null; Write-Ok "Git OK" } catch {
    Write-Host "✘ Git est requis." -ForegroundColor Red; exit 1
}

# 2. Clone ou pull
if (Test-Path (Join-Path $InstallPath '.git')) {
    Write-Step "Repo déjà présent à $InstallPath — git pull"
    Push-Location $InstallPath
    git pull --ff-only origin $Branch
    Pop-Location
} else {
    Write-Step "Clonage dans $InstallPath"
    if (Test-Path $InstallPath) {
        Write-Host "    ! Dossier existant et non vide. Annulez ou supprimez-le." -ForegroundColor Yellow
        exit 1
    }
    git clone --branch $Branch $RepoUrl $InstallPath
}

# 3. Délégation au setup.ps1 du projet
Write-Step "Délégation à scripts\setup.ps1"
$setupArgs = @{}
if ($ClaudeCode)    { $setupArgs.ClaudeCode    = $true }
if ($ClaudeDesktop) { $setupArgs.ClaudeDesktop = $true }
& (Join-Path $InstallPath 'scripts\setup.ps1') @setupArgs
