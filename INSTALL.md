# Installation rapide — pour vos collègues

> Documentation courte destinée aux **utilisateurs finaux** du serveur `bcquality-mcp`.
> Pour la documentation complète (architecture, dev, dépannage), voir [README.md](README.md).

## Pré-requis

- **Windows 10/11**
- **Node.js 18+** — https://nodejs.org/ (LTS recommandé)
- **Git** — https://git-scm.com/download/win
- **Un client MCP** : Claude Code, Claude Desktop, ou Cursor

## Installation en 1 commande (PowerShell)

Ouvrez **PowerShell** (touche Win + tapez "powershell"), copiez-collez :

```powershell
irm https://raw.githubusercontent.com/glachana/bcquality-mcp/main/scripts/install-from-github.ps1 | iex
```

Le script :
1. Clone le repo dans `%USERPROFILE%\bcquality-mcp\`
2. Installe les dépendances Node
3. Build le serveur
4. Vous demande quel client MCP utiliser et enregistre le serveur

> Si PowerShell bloque l'exécution : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (une fois).

## Installation manuelle (alternative)

```powershell
git clone https://github.com/glachana/bcquality-mcp.git $env:USERPROFILE\bcquality-mcp
cd $env:USERPROFILE\bcquality-mcp
.\scripts\setup.ps1
```

## Vérification

### Claude Code
```powershell
claude mcp list
```
Vous devez voir `bcquality: ... ✔ Connected`.

### Claude Desktop
Redémarrez Claude Desktop, ouvrez une nouvelle conversation, demandez :
> *Avec bcquality, quels sont les domaines disponibles ?*

Claude doit appeler le tool `bcquality_list_domains` et lister `performance`, `security`, `privacy`, `style`, `testing`.

## Mise à jour

```powershell
cd $env:USERPROFILE\bcquality-mcp
.\scripts\update.ps1
```
Puis redémarrez votre client MCP.

## Désinstallation

### Claude Code
```powershell
claude mcp remove bcquality -s user
```

### Claude Desktop
Éditez `%APPDATA%\Claude\claude_desktop_config.json` et supprimez la clé `bcquality` dans `mcpServers`.

Supprimez le dossier d'installation :
```powershell
Remove-Item -Recurse -Force $env:USERPROFILE\bcquality-mcp
```

## Premier usage

Ouvrez une nouvelle session de votre client MCP, et essayez :

> *Donne-moi les bonnes pratiques performance Microsoft pour AL en BC v27, version concise.*

> *Avec bcquality, montre-moi la règle sur SetLoadFields avec ses exemples .good.al et .bad.al.*

> *Liste les action-skills de la couche microsoft de bcquality.*

Claude appellera automatiquement les bons tools.

## Aide

| Problème | Action |
|---|---|
| `node` ou `git` introuvable | Installer Node.js LTS et Git pour Windows, puis relancer PowerShell. |
| `claude` introuvable | Installer Claude Code : https://docs.claude.com/en/docs/claude-code |
| Le serveur ne se connecte pas | `cd $env:USERPROFILE\bcquality-mcp ; node dist/index.js` et lire l'erreur. |
| Variables d'env, fork avec couche `/custom/`, etc. | Voir la section **Configuration** du [README.md](README.md). |
