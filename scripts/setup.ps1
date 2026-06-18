<#
.SYNOPSIS
    Installe et configure bcquality-mcp sur le poste d'un développeur.

.DESCRIPTION
    Vérifie les pré-requis (Node 18+, Git), installe les dépendances, build le serveur,
    puis l'enregistre auprès de Claude Code et/ou Claude Desktop.

.PARAMETER ClaudeCode
    Enregistre le serveur dans la config user de Claude Code (claude mcp add).

.PARAMETER ClaudeDesktop
    Ajoute le serveur dans %APPDATA%\Claude\claude_desktop_config.json.

.PARAMETER RepoPath
    Chemin vers un clone existant de microsoft/BCQuality (ou de votre fork). Optionnel.
    Si omis, le serveur clonera automatiquement le repo public.

.EXAMPLE
    .\setup.ps1 -ClaudeCode

.EXAMPLE
    .\setup.ps1 -ClaudeCode -ClaudeDesktop -RepoPath "C:\Users\me\dev\BCQuality-fork"
#>

[CmdletBinding()]
param(
    [switch]$ClaudeCode,
    [switch]$ClaudeDesktop,
    [string]$RepoPath
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Write-Step($msg)    { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)      { Write-Host "    ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)    { Write-Host "    ! $msg" -ForegroundColor Yellow }
function Write-ErrMsg($msg)  { Write-Host "    ✘ $msg" -ForegroundColor Red }

# ----- 1. Pré-requis -----
Write-Step "Vérification des pré-requis"
try {
    $nodeVer = (node --version) -replace 'v',''
    $nodeMajor = [int]($nodeVer.Split('.')[0])
    if ($nodeMajor -lt 18) {
        Write-ErrMsg "Node $nodeVer trouvé, mais Node 18+ requis. Installez https://nodejs.org/"
        exit 1
    }
    Write-Ok "Node $nodeVer"
} catch {
    Write-ErrMsg "Node.js n'est pas installé. Installez https://nodejs.org/ (LTS)."
    exit 1
}
try {
    $gitVer = (git --version) -replace 'git version ',''
    Write-Ok "Git $gitVer"
} catch {
    Write-ErrMsg "Git n'est pas installé."
    exit 1
}

# ----- 2. Install + build -----
Write-Step "Installation des dépendances"
Push-Location $ProjectRoot
try {
    npm install --silent
    if ($LASTEXITCODE -ne 0) { throw "npm install a échoué" }
    Write-Ok "npm install terminé"

    Write-Step "Build (esbuild)"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build a échoué" }
    if (-not (Test-Path "$ProjectRoot\dist\index.js")) {
        throw "dist\index.js manquant après build"
    }
    Write-Ok "dist/index.js prêt"
} finally {
    Pop-Location
}

# ----- 3. Choix client si rien n'est passé -----
if (-not $ClaudeCode -and -not $ClaudeDesktop) {
    Write-Host ""
    Write-Host "Quel client MCP utilisez-vous ?" -ForegroundColor White
    Write-Host "  [1] Claude Code (CLI + extension VS Code)"
    Write-Host "  [2] Claude Desktop (app Windows)"
    Write-Host "  [3] Les deux"
    Write-Host "  [4] Aucun pour l'instant (juste build)"
    $choice = Read-Host "Choix (1-4)"
    switch ($choice) {
        '1' { $ClaudeCode = $true }
        '2' { $ClaudeDesktop = $true }
        '3' { $ClaudeCode = $true; $ClaudeDesktop = $true }
        '4' { Write-Step "Setup terminé sans enregistrement. Lancez ce script avec -ClaudeCode ou -ClaudeDesktop plus tard."; exit 0 }
        default { Write-ErrMsg "Choix invalide"; exit 1 }
    }
}

$serverEntry = "$ProjectRoot\dist\index.js" -replace '\\','/'

# ----- 4. Claude Code -----
if ($ClaudeCode) {
    Write-Step "Enregistrement dans Claude Code"
    try {
        # Supprimer l'éventuel ancien enregistrement, ignorer si absent
        & claude mcp remove bcquality -s user 2>$null | Out-Null

        $args = @('mcp', 'add', 'bcquality', 'node', $serverEntry, '-s', 'user')
        if ($RepoPath) {
            $args += @('-e', "BCQUALITY_REPO_PATH=$RepoPath")
        }
        & claude @args
        if ($LASTEXITCODE -ne 0) { throw "claude mcp add a échoué" }
        Write-Ok "Serveur enregistré (scope user)"
        Write-Host "       Vérifiez avec : claude mcp list"
    } catch {
        Write-ErrMsg $_.Exception.Message
        Write-Warn "La CLI 'claude' est-elle installée ? https://docs.claude.com/en/docs/claude-code"
    }
}

# ----- 5. Claude Desktop -----
if ($ClaudeDesktop) {
    Write-Step "Enregistrement dans Claude Desktop"
    $configDir = Join-Path $env:APPDATA 'Claude'
    $configPath = Join-Path $configDir 'claude_desktop_config.json'
    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir | Out-Null
    }
    $config = if (Test-Path $configPath) {
        try { Get-Content $configPath -Raw | ConvertFrom-Json } catch { @{} }
    } else { @{} }

    if (-not $config.PSObject.Properties.Match('mcpServers').Count) {
        $config | Add-Member -MemberType NoteProperty -Name mcpServers -Value (New-Object PSObject)
    }
    $entry = [ordered]@{
        command = 'node'
        args    = @($serverEntry)
    }
    if ($RepoPath) {
        $entry.env = [ordered]@{ BCQUALITY_REPO_PATH = $RepoPath }
    }
    if ($config.mcpServers.PSObject.Properties.Match('bcquality').Count) {
        $config.mcpServers.bcquality = [PSCustomObject]$entry
    } else {
        $config.mcpServers | Add-Member -MemberType NoteProperty -Name bcquality -Value ([PSCustomObject]$entry)
    }
    $config | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath -Encoding UTF8
    Write-Ok "Ajouté à $configPath"
    Write-Warn "Redémarrez Claude Desktop pour activer le serveur."
}

Write-Host ""
Write-Host "🎉 Setup terminé." -ForegroundColor Green
Write-Host "   Test rapide :  node `"$ProjectRoot\dist\index.js`""
Write-Host "                 (Ctrl+C pour quitter — vous devez voir 'Indexed N knowledge files')"
