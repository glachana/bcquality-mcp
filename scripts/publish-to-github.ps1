<#
.SYNOPSIS
    Copie le projet dans un nouveau dossier, initialise un repo Git propre
    (identité perso), crée le repo GitHub public et y pousse le premier commit.

.DESCRIPTION
    Pensé pour basculer un repo privé en public sans transporter l'historique
    git avec une identité professionnelle. Effectue :
      1. Copie filtrée (robocopy) — exclut .git/, node_modules/, dist/, .env
      2. git init avec user.name/email perso (sans --global)
      3. Premier commit
      4. Création du repo public via gh CLI (skippable)
      5. Push initial

    Demande confirmation explicite avant de pousser quoi que ce soit en ligne.

.PARAMETER Source
    Dossier source contenant le projet à publier. Défaut : racine de ce repo.

.PARAMETER Destination
    Dossier neuf où copier le projet. Défaut : <parent>\bcquality-mcp.

.PARAMETER Email
    Email à utiliser pour les commits. Obligatoire.
    Si l'email correspond à un domaine professionnel sensible (par défaut 'dynamicsinternational'),
    le script affiche un avertissement et demande confirmation explicite avant de continuer.

.PARAMETER AllowProEmail
    Saute le warning si l'email contient un domaine pro. À utiliser uniquement si vous êtes
    sûr de vouloir publier sous votre identité professionnelle.

.PARAMETER AuthorName
    Nom à utiliser pour les commits. Défaut : "Gabriel Lachana".

.PARAMETER RepoOwner
    Owner GitHub du nouveau repo. Défaut : "glachana".

.PARAMETER RepoName
    Nom du repo GitHub à créer. Défaut : "bcquality-mcp".

.PARAMETER Description
    Description du repo GitHub.

.PARAMETER SkipGhCreate
    Si activé, ne crée pas le repo via gh CLI — vous devrez le faire à la main
    avant de relancer pour le push.

.PARAMETER NoPush
    Prépare tout localement mais ne push pas. Vous pourrez `git push -u origin main` plus tard.

.EXAMPLE
    .\publish-to-github.ps1 -Email "gabriel.lachana@gmail.com"

.EXAMPLE
    .\publish-to-github.ps1 -Email "moi@perso.fr" -Destination "D:\dev\bcquality-mcp" -NoPush
#>

[CmdletBinding()]
param(
    [string]$Source = (Split-Path -Parent $PSScriptRoot),
    [string]$Destination,

    [Parameter(Mandatory = $true)]
    [string]$Email,

    [string]$AuthorName  = "Gabriel Lachana",
    [string]$RepoOwner   = "glachana",
    [string]$RepoName    = "bcquality-mcp",
    [string]$Description = "MCP server exposing microsoft/BCQuality knowledge and skills to AI agents.",
    [string]$Homepage    = "https://github.com/microsoft/BCQuality",
    [switch]$SkipGhCreate,
    [switch]$NoPush,
    [switch]$AllowProEmail
)

$ErrorActionPreference = 'Stop'

function Write-Step($m)    { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m)      { Write-Host "    ✓ $m" -ForegroundColor Green }
function Write-Warn($m)    { Write-Host "    ! $m" -ForegroundColor Yellow }
function Write-ErrMsg($m)  { Write-Host "    ✘ $m" -ForegroundColor Red }
function Confirm-Or-Abort($prompt) {
    $r = Read-Host "$prompt (yes/no)"
    if ($r -ne 'yes') { Write-ErrMsg "Annulé par l'utilisateur."; exit 1 }
}

# ----- 0. Validation de l'identité -----
Write-Step "Validation de l'identité"
if ($Email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    Write-ErrMsg "Email '$Email' n'a pas un format valide."
    exit 1
}
if (($Email -match 'dynamicsinternational') -and -not $AllowProEmail) {
    Write-Warn "L'email '$Email' contient 'dynamicsinternational'."
    Write-Warn "Cet email apparaîtra publiquement dans l'historique des commits."
    Write-Warn "Pour sauter ce warning, passez le switch -AllowProEmail."
    Confirm-Or-Abort "Confirmer l'utilisation de cet email professionnel ?"
}
Write-Ok "Identité : $AuthorName <$Email>"

# ----- 1. Pré-requis -----
Write-Step "Vérification des pré-requis"
foreach ($cmd in @('git','node','npm')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-ErrMsg "'$cmd' introuvable dans le PATH."
        exit 1
    }
}
Write-Ok "git, node, npm OK"

if (-not $SkipGhCreate) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Warn "gh CLI introuvable. Le script ne pourra pas créer le repo automatiquement."
        Write-Warn "Installez https://cli.github.com/ ou relancez avec -SkipGhCreate."
        exit 1
    }
    try {
        gh auth status 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "not authed" }
        Write-Ok "gh CLI authentifié"
    } catch {
        Write-ErrMsg "gh CLI non authentifié. Lancez 'gh auth login' d'abord."
        exit 1
    }
}

# ----- 2. Calcul des chemins -----
if (-not $Destination) {
    $Destination = Join-Path (Split-Path -Parent $Source) $RepoName
}
$Source      = (Resolve-Path $Source).Path
$DestParent  = Split-Path -Parent $Destination

if (-not (Test-Path $Source)) { Write-ErrMsg "Source '$Source' introuvable."; exit 1 }
if (-not (Test-Path (Join-Path $Source 'package.json'))) {
    Write-ErrMsg "Source '$Source' ne contient pas package.json."
    exit 1
}

Write-Step "Plan"
Write-Host "    Source      : $Source"
Write-Host "    Destination : $Destination"
Write-Host "    Auteur      : $AuthorName <$Email>"
Write-Host "    Repo GitHub : $RepoOwner/$RepoName (public)"
Write-Host "    Push        : $(if ($NoPush) { 'non' } else { 'oui' })"
Confirm-Or-Abort "Continuer ?"

# ----- 3. Copie filtrée -----
Write-Step "Copie filtrée vers $Destination"
if (Test-Path $Destination) {
    if (Test-Path (Join-Path $Destination '.git')) {
        Write-Warn "$Destination contient déjà un .git/. Ne sera pas écrasé."
        Confirm-Or-Abort "Continuer quand même (risque de mélange) ?"
    }
} else {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}

# robocopy : /E récursif, /XD exclude dirs, /XF exclude files, /NFL /NDL /NJH /NJS quiet
robocopy $Source $Destination /E /XD .git node_modules dist /XF .env /NFL /NDL /NJH /NJS | Out-Null
$rc = $LASTEXITCODE
# robocopy : 0,1,2,3 = succès ; ≥8 = erreur
if ($rc -ge 8) {
    Write-ErrMsg "robocopy a échoué (code $rc)"
    exit 1
}
Write-Ok "Fichiers copiés"

# ----- 4. Init git avec identité perso -----
Push-Location $Destination
try {
    if (Test-Path .git) {
        Write-Step "Repo Git déjà initialisé — on saute le init."
    } else {
        Write-Step "git init -b main"
        git init -b main | Out-Null
    }

    git config user.name $AuthorName
    git config user.email $Email
    $confName  = git config user.name
    $confEmail = git config user.email
    Write-Ok "git user.name  = $confName"
    Write-Ok "git user.email = $confEmail"

    if (($confEmail -match 'dynamicsinternational') -and -not $AllowProEmail) {
        # Déjà confirmé en amont, on garde juste un rappel visuel.
        Write-Warn "Note : commits signés avec un email professionnel."
    }

    # ----- 5. Stage + commit -----
    Write-Step "Stage des fichiers"
    git add . | Out-Null
    $staged = (git diff --cached --numstat | Measure-Object -Line).Lines
    if ($staged -eq 0) {
        Write-Warn "Rien à committer. Repo déjà à jour ?"
    } else {
        Write-Ok "$staged fichiers stagés"
        Write-Step "Premier commit"
        git commit -m "feat: initial release" | Out-Null
        Write-Ok "Commit créé"
    }

    # ----- 6. Création du repo GitHub -----
    if (-not $SkipGhCreate) {
        Write-Step "Création du repo public $RepoOwner/$RepoName"
        $exists = $false
        try {
            gh repo view "$RepoOwner/$RepoName" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { $exists = $true }
        } catch { }

        if ($exists) {
            Write-Warn "Le repo $RepoOwner/$RepoName existe déjà sur GitHub."
            Confirm-Or-Abort "Utiliser le repo existant et juste push ?"
            git remote remove origin 2>$null
            git remote add origin "https://github.com/$RepoOwner/$RepoName.git"
        } else {
            $createArgs = @(
                'repo', 'create', "$RepoOwner/$RepoName",
                '--public',
                '--description', $Description,
                '--homepage', $Homepage,
                '--source', '.',
                '--remote', 'origin'
            )
            if (-not $NoPush) { $createArgs += '--push' }
            gh @createArgs
            if ($LASTEXITCODE -ne 0) { throw "gh repo create a échoué" }
            Write-Ok "Repo créé sur GitHub"
        }
    } else {
        Write-Warn "Création du repo skippée. Ajoutez le remote manuellement :"
        Write-Host "    git remote add origin https://github.com/$RepoOwner/$RepoName.git"
    }

    # ----- 7. Push (si pas déjà fait par gh create --push) -----
    if (-not $NoPush -and ($SkipGhCreate -or $exists)) {
        Write-Step "Push initial"
        git push -u origin main
        if ($LASTEXITCODE -ne 0) { throw "git push a échoué" }
        Write-Ok "Pushed"
    }

} finally {
    Pop-Location
}

# ----- 8. Récap -----
Write-Host ""
Write-Host "🎉 Publication terminée." -ForegroundColor Green
Write-Host "   Dossier local : $Destination"
Write-Host "   Repo GitHub   : https://github.com/$RepoOwner/$RepoName"
Write-Host ""
Write-Host "Étapes suivantes recommandées :"
Write-Host "  - Vérifiez l'auteur des commits : git -C `"$Destination`" log --pretty=fuller -1"
Write-Host "  - Testez le one-liner depuis un autre poste :"
Write-Host "      irm https://raw.githubusercontent.com/$RepoOwner/$RepoName/main/scripts/install-from-github.ps1 | iex"
Write-Host "  - Archivez ou supprimez l'ancien repo privé glachana/BC-QUALITY si plus utile."
