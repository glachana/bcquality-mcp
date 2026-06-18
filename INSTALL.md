# Installation rapide — pour vos collègues

> Documentation courte destinée aux **utilisateurs finaux** du serveur `bcquality-mcp`.
> Pour la documentation complète (architecture, dev, dépannage), voir [README.md](README.md).

## Pré-requis

- **Windows 10/11**
- **Node.js 18+** — https://nodejs.org/ (LTS recommandé)
- **Git** — https://git-scm.com/download/win
- **Un client MCP** : Claude Code, Claude Desktop, ou Cursor

## Installation via npm (recommandé)

```powershell
npm install -g bcquality-mcp
claude mcp add bcquality bcquality-mcp -s user
```

C'est tout. Pas de clone, pas de build local. Pour Claude Desktop, éditez `%APPDATA%\Claude\claude_desktop_config.json` :
```jsonc
{
  "mcpServers": {
    "bcquality": { "command": "bcquality-mcp" }
  }
}
```

## Installation depuis GitHub (PowerShell, 1 commande)

Alternative si vous voulez le code source localement (pour modifier, debugger, etc.) :

```powershell
irm https://raw.githubusercontent.com/glachana/bcquality-mcp/main/scripts/install-from-github.ps1 | iex
```

Le script clone, installe les deps, build, et enregistre le serveur.

> Si PowerShell bloque l'exécution : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (une fois).

## Installation manuelle (clone + setup)

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

### Si installé via npm
```powershell
npm update -g bcquality-mcp
```

### Si installé depuis GitHub
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

### Supprimer le package
```powershell
# Si installé via npm
npm uninstall -g bcquality-mcp

# Si installé depuis GitHub
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
