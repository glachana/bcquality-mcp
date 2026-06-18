# bcquality-mcp

[![npm version](https://img.shields.io/npm/v/bcquality-mcp.svg)](https://www.npmjs.com/package/bcquality-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Serveur MCP (Model Context Protocol) qui expose le contenu de [`microsoft/BCQuality`](https://github.com/microsoft/BCQuality) à des agents IA (Claude Code, Claude Desktop, Cursor, etc.) sous forme de tools structurés.

`microsoft/BCQuality` est un référentiel Microsoft (MIT) qui codifie les bonnes pratiques de développement Business Central — fichiers `.md` à frontmatter YAML structuré + exemples `.good.al` / `.bad.al`. Le repo est conçu pour la consommation par agents IA, mais il faut une mécanique d'orchestration pour l'exploiter (filtrage par frontmatter, application du workflow Source → Relevance → Worklist → Action, gestion de précédence entre couches).

**Ce serveur fait ce travail.** Un agent IA n'a qu'à appeler les tools pour récupérer les règles pertinentes à son contexte de développement AL.

> 📦 **Vous voulez juste l'installer pour l'utiliser ?** Voir [INSTALL.md](INSTALL.md) — guide court avec one-liner PowerShell. Le présent README est destiné aux contributeurs / mainteneurs.

---

## Table des matières

1. [Architecture](#architecture)
2. [Prérequis](#prérequis)
3. [Installation de A à Z](#installation-de-a-à-z)
4. [Configuration](#configuration)
5. [Intégration aux clients MCP](#intégration-aux-clients-mcp)
6. [Tools exposés](#tools-exposés)
7. [Cas d'usage](#cas-dusage)
8. [Fork avec une couche `/custom/` interne](#fork-avec-une-couche-custom-interne)
9. [Maintenance et mise à jour](#maintenance-et-mise-à-jour)
10. [Dépannage](#dépannage)
11. [Développement](#développement)

---

## Architecture

```
┌─────────────────┐    JSON-RPC stdio    ┌──────────────────────┐
│  Agent IA       │ ◄────────────────► │  bcquality-mcp       │
│  (Claude Code,  │                     │  (Node.js, stdio)    │
│   Cursor, …)    │                     │                      │
└─────────────────┘                     │  ┌──────────────┐   │
                                         │  │ Tools (10)   │   │
                                         │  │ list/get/    │   │
                                         │  │ search/...   │   │
                                         │  └──────────────┘   │
                                         │         │           │
                                         │  ┌──────▼───────┐   │
                                         │  │ In-memory    │   │
                                         │  │ index        │   │
                                         │  └──────┬───────┘   │
                                         └─────────┼───────────┘
                                                   │ filesystem read
                                         ┌─────────▼───────────┐
                                         │ BCQuality clone     │
                                         │ (microsoft, ou fork)│
                                         │                     │
                                         │ /microsoft/         │
                                         │ /community/         │
                                         │ /custom/   ← VOUS   │
                                         │ /skills/            │
                                         └─────────────────────┘
```

**Source de données** : un clone git local du repo `microsoft/BCQuality` (ou de votre fork). Le serveur peut :
- pointer vers un clone existant (variable `BCQUALITY_REPO_PATH`)
- cloner automatiquement le repo dans un cache si rien n'est défini

**Couches** : précédence croissante `microsoft` < `community` < `custom`. Quand deux fichiers ont le même slug, `custom/` gagne ; les autres sont reportés en `suppressed[]`.

---

## Prérequis

| Outil | Version min | Notes |
|---|---|---|
| Node.js | 18.x | LTS recommandé (18, 20, 22). |
| Git | toute version récente | Pour le clone auto + `bcquality_refresh`. |
| Un client MCP | — | Claude Code (recommandé), Claude Desktop, Cursor, etc. |

Vérifiez :
```powershell
node --version
git --version
```

---

## Installation de A à Z

### Voie la plus simple — npm

Le package est publié sur npm : [`bcquality-mcp`](https://www.npmjs.com/package/bcquality-mcp).

```powershell
npm install -g bcquality-mcp
claude mcp add bcquality bcquality-mcp -s user
```

Pas de clone, pas de build local. Le binaire `bcquality-mcp` est disponible dans le `PATH` après installation globale. Pour Claude Desktop / Cursor, voir [Intégration aux clients MCP](#intégration-aux-clients-mcp).

### Voie rapide depuis GitHub — un script

Utile si vous voulez le code source local (modif, debug, fork avec couche `custom/`) :

```powershell
git clone https://github.com/glachana/bcquality-mcp.git "$env:USERPROFILE\bcquality-mcp"
cd "$env:USERPROFILE\bcquality-mcp"
.\scripts\setup.ps1
```

`setup.ps1` vérifie Node/Git, fait `npm install` + `npm run build`, puis vous demande dans quel client MCP enregistrer le serveur (Claude Code, Claude Desktop, les deux).

Pour les **collègues** sans clone local, un one-liner existe :
```powershell
irm https://raw.githubusercontent.com/glachana/bcquality-mcp/main/scripts/install-from-github.ps1 | iex
```
Voir [INSTALL.md](INSTALL.md) pour la doc utilisateur final.

### Voie manuelle (pour comprendre / debugger)

#### Étape 1 — Cloner le projet

```powershell
git clone https://github.com/glachana/bcquality-mcp.git "$env:USERPROFILE\bcquality-mcp"
cd "$env:USERPROFILE\bcquality-mcp"
```

#### Étape 2 — Installer les dépendances

```powershell
npm install
```

Installe `@modelcontextprotocol/sdk`, `zod`, `gray-matter`, `simple-git`, `esbuild` et leurs dépendances.

#### Étape 3 — Builder le serveur

```powershell
npm run build
```

Transpile `src/**/*.ts` → `dist/**/*.js` via **esbuild** (≈ 100 ms). Le `dist/index.js` est l'entrée à passer au client MCP.

> **Pourquoi esbuild et pas tsc ?** Le couple `@modelcontextprotocol/sdk` 1.29 + `zod` 3.25 fait exploser l'inférence de types de `tsc` (heap > 8 Go). Le type-check reste accessible via `npm run typecheck` si vous voulez le faire ponctuellement.

#### Étape 4 — Premier démarrage (smoke test)

```powershell
node dist/index.js
```

Au premier lancement, le serveur clone automatiquement `microsoft/BCQuality` dans `%LOCALAPPDATA%\bcquality\cache`. Vous devez voir :

```
[bcquality-mcp] Loaded repo from %LOCALAPPDATA%\bcquality\cache (source=cloned, layers=microsoft,community,custom)
[bcquality-mcp] Indexed 156 knowledge files, 12 skills
[bcquality-mcp] Connected on stdio.
```

(Le serveur attend ensuite des messages JSON-RPC sur stdin — `Ctrl+C` pour quitter.)

#### Étape 5 — Connecter le serveur à votre client MCP

Voir [Intégration aux clients MCP](#intégration-aux-clients-mcp) ci-dessous.

---

## Configuration

Toutes les options se passent par **variables d'environnement** au lancement du serveur. Un fichier `.env.example` est fourni à titre de référence (ce serveur ne le charge pas automatiquement — c'est le client MCP qui injecte les variables).

| Variable | Défaut | Rôle |
|---|---|---|
| `BCQUALITY_REPO_PATH` | _(vide)_ | Chemin local **prioritaire** vers un clone (votre fork avec `/custom/`). Si défini, ignore le cache. |
| `BCQUALITY_REPO_URL` | `https://github.com/microsoft/BCQuality.git` | URL utilisée par le clone automatique et par `bcquality_refresh`. |
| `BCQUALITY_CACHE_PATH` | `%LOCALAPPDATA%\bcquality\cache` (Windows) / `~/.cache/bcquality` (Unix) | Dossier où le serveur clone si aucun `REPO_PATH` n'est fourni. |
| `BCQUALITY_LAYERS` | `microsoft,community,custom` | Couches activées, dans l'ordre de **précédence croissante**. |
| `BCQUALITY_AUTO_CLONE` | `true` | Si `false` et qu'aucun clone n'existe → erreur explicite au démarrage. |

### Logique de résolution du repo au démarrage

1. Si `BCQUALITY_REPO_PATH` est défini **et** que le dossier existe **et** ressemble à un clone BCQuality → on l'utilise (`source=env`).
2. Sinon, si `CACHE_PATH` contient déjà un clone → on l'utilise (`source=cache`).
3. Sinon, si `AUTO_CLONE=true` → `git clone --depth 1 BCQUALITY_REPO_URL` dans `CACHE_PATH` (`source=cloned`).
4. Sinon → erreur explicite avec instructions.

---

## Intégration aux clients MCP

### Claude Code (CLI / VS Code extension)

**Méthode rapide** — installation déjà effectuée par la commande :

```powershell
claude mcp add bcquality node "$env:USERPROFILE/bcquality-mcp/dist/index.js" -s user
```

Vérification :
```powershell
claude mcp list
# bcquality: node <path>/bcquality-mcp/dist/index.js - ✔ Connected
```

Pour pointer vers votre fork avec variables d'environnement :
```powershell
claude mcp remove bcquality -s user
claude mcp add bcquality node "$env:USERPROFILE/bcquality-mcp/dist/index.js" -s user -e BCQUALITY_REPO_PATH="C:/path/to/your/fork"
```

> **Important** : redémarrez la session Claude Code après l'ajout. Les serveurs MCP sont chargés au lancement.

### Claude Desktop

Éditez `%APPDATA%\Claude\claude_desktop_config.json` :

```jsonc
{
  "mcpServers": {
    "bcquality": {
      "command": "node",
      "args": ["<absolute-path-to>/bcquality-mcp/dist/index.js"],
      "env": {
        "BCQUALITY_REPO_PATH": "C:/path/to/your/fork"
      }
    }
  }
}
```

Redémarrez Claude Desktop.

### Cursor

Éditez `~/.cursor/mcp.json` (même format que Claude Desktop).

### MCP Inspector (test interactif)

Pour explorer manuellement les tools dans une UI web :

```powershell
npm run inspect
```

Ouvre une UI sur `http://localhost:5173` où vous pouvez appeler chaque tool avec des inputs personnalisés.

---

## Tools exposés

Tous les tools sont préfixés `bcquality_` et retournent à la fois du texte JSON formaté (`content[0].text`) et un objet structuré (`structuredContent`) typé via Zod.

### Découverte

#### `bcquality_list_domains`
Liste les domaines de connaissance (performance, security, privacy, …).

**Inputs** :
- `layers?: ("microsoft"|"community"|"custom")[]` — sous-ensemble de couches.

**Output** : `{ domains: [{ name, fileCount, layers[] }] }`

**Exemple d'output réel** :
```json
{
  "domains": [
    { "name": "performance", "fileCount": 42, "layers": ["community", "microsoft"] },
    { "name": "privacy",     "fileCount": 17, "layers": ["microsoft"] },
    { "name": "security",    "fileCount": 24, "layers": ["community", "microsoft"] },
    { "name": "style",       "fileCount": 35, "layers": ["microsoft"] },
    { "name": "testing",     "fileCount": 1,  "layers": ["microsoft"] }
  ]
}
```

#### `bcquality_list_knowledge`
Liste les fichiers de connaissance avec filtres.

**Inputs** : `layer?`, `domain?`, `technologies?`, `bcVersion?`, `countries?`, `applicationArea?`, `keywords?`, `limit` (1–500, défaut 50), `offset`.

**Output** : `{ items: [{ path, layer, domain, slug, title, descriptionExcerpt, keywords, bcVersion, … }], total, nextOffset? }`

#### `bcquality_list_skills`
Liste les meta-skills (`/skills/entry.md`, `read.md`, `do.md`, `write.md`) et action skills (`<layer>/skills/…`).

**Inputs** : `layer?`, `kind?` (`action-skill` | `meta`).

**Output** : `{ items: [{ path, kind, id?, version?, title, inputs?, outputs?, subSkills? }] }`

### Lecture

#### `bcquality_get_knowledge`
Récupère un fichier de connaissance parsé.

**Inputs** : `path: string` (chemin repo-relatif, ex. `microsoft/knowledge/performance/use-setloadfields-for-partial-records.md`)

**Output** : `{ path, title, frontmatter, sections: { description, bestPractice?, antiPattern?, other[] }, exampleFiles: { good?, bad? }, body }`

#### `bcquality_get_examples`
Récupère le contenu des exemples `.good.al` / `.bad.al` associés à un knowledge.

**Inputs** : `knowledgePath: string`, `kind: 'good'|'bad'|'both'` (défaut `both`).

**Output** : `{ good?: { path, content }, bad?: { path, content } }`

#### `bcquality_get_skill`
Récupère une skill (meta ou action).

**Inputs** : `path: string` (ex. `skills/entry.md`, `microsoft/skills/review/al-performance-review.md`).

**Output** : `{ path, kind, title, frontmatter, body }`

### Workflow haut niveau (les tools « phares »)

#### `bcquality_search_knowledge`
Recherche full-text avec filtres.

**Inputs** : `query: string`, `layers?`, `domain?`, `technologies?`, `bcVersion?`, `countries?`, `applicationArea?`, `limit` (1–100, défaut 20).

**Output** : `{ matches: [{ path, score, layer, domain, title, descriptionExcerpt, matchedKeywords }] }`

**Logique** : applique `Source` (filtrage par couches/domain) → `Relevance` (intersection frontmatter) → `Worklist` (scoring sur keywords/title/domain/description).

#### `bcquality_get_applicable_for_context` 🌟
Le tool le plus puissant. Donné un objectif de développement + un contexte BC, retourne **les règles applicables avec leurs sections inlinées**, prêtes à être consommées par le LLM.

**Inputs** :
- `goal: string` — description libre de ce que l'agent essaie de faire
- `technologies: string[]` (défaut `["al"]`)
- `bcVersion?: string | number`
- `countries?`, `applicationArea?`, `layers?`, `limit` (1–50, défaut 10)

**Output** :
```typescript
{
  applicable: [{
    path, layer, domain, title, score,
    sections: { description?, bestPractice?, antiPattern? }
  }],
  suppressed: [{ path, layer, supersededBy, reason: "layer-precedence" }]
}
```

Applique la précédence des couches : si une règle existe en `custom/`, `community/` et `microsoft/` sur le même slug, `custom/` gagne ; les autres remontent en `suppressed[]`.

### Méta

#### `bcquality_status`
Renvoie l'état du serveur : path du clone, source de résolution (`env`/`cache`/`cloned`), commit actuel, couches actives, nombre d'articles par couche.

#### `bcquality_refresh`
Lance `git pull` sur le clone actif et reconstruit l'index en mémoire.

**Output** : `{ before, after, changedFiles, rebuiltAt }`

---

## Cas d'usage

### 1. Revue de code AL en début de session

Vous travaillez sur une procédure AL et voulez consulter les règles applicables.

**Vous demandez à Claude Code** :
> *Avec BCQuality, donne-moi toutes les règles performance applicables à du code AL pour BC v27.*

Claude appelle `bcquality_get_applicable_for_context` avec `{ goal: "performance review of AL code", technologies: ["al"], bcVersion: 27 }` et reçoit la liste filtrée + les sections `Description` / `Best Practice` / `Anti Pattern` directement utilisables.

### 2. Diagnostic d'une règle spécifique

> *Montre-moi la règle BCQuality sur SetLoadFields, avec son exemple bon et mauvais.*

Claude enchaîne :
1. `bcquality_search_knowledge { query: "setloadfields" }` → trouve `microsoft/knowledge/performance/use-setloadfields-for-partial-records.md`
2. `bcquality_get_knowledge { path: ... }` → titre, frontmatter, sections
3. `bcquality_get_examples { knowledgePath: ... }` → contenu `.good.al` + `.bad.al`

### 3. Découverte du référentiel

> *Quels domaines de qualité Microsoft maintient-il pour Business Central, et combien de règles par domaine ?*

Claude appelle simplement `bcquality_list_domains`.

### 4. Audit de PR

> *J'ai modifié cette codeunit, vérifie si elle respecte les règles security et privacy de BCQuality.*

Claude appelle `bcquality_list_knowledge { domain: "security" }` puis `bcquality_list_knowledge { domain: "privacy" }`, lit les `.md` pertinents, puis compare avec votre code.

### 5. Inspection des action skills officielles

> *Quelles skills de review Microsoft a-t-elle publiées dans BCQuality ?*

Claude appelle `bcquality_list_skills { layer: "microsoft", kind: "action-skill" }` → liste les 7 skills (`al-code-review` + 6 sous-skills `performance`, `security`, `privacy`, `upgrade`, `style`, `ui`).

---

## Fork avec une couche `/custom/` interne

L'intérêt principal de BCQuality est de pouvoir surcharger les règles Microsoft avec vos propres standards organisationnels.

### Étape 1 — Forker le repo

Allez sur https://github.com/microsoft/BCQuality, cliquez **Fork** vers votre organisation ou compte personnel.

### Étape 2 — Cloner le fork localement

```powershell
git clone https://github.com/<your-org>/BCQuality.git $env:USERPROFILE\BCQuality-fork
```

### Étape 3 — Ajouter votre couche custom

Créez des fichiers sous `custom/knowledge/<domain>/<slug>.md` en respectant le format frontmatter (cf. `skills/write.md` du repo). Exemple :

```markdown
---
bc-version: [all]
domain: performance
keywords: [naming, helper-function, internal]
technologies: [al]
countries: [w1]
application-area: [all]
---

# Préférer les helpers internes pour les calculs récurrents

## Description
Au sein de notre organisation, …

## Best Practice
…
```

### Étape 4 — Reconfigurer le serveur

```powershell
claude mcp remove bcquality -s user
claude mcp add bcquality node "$env:USERPROFILE/bcquality-mcp/dist/index.js" -s user -e BCQUALITY_REPO_PATH="$env:USERPROFILE/BCQuality-fork"
```

Redémarrez Claude Code. Vérifiez via le tool `bcquality_status` que `source` = `env` et que `custom` a `articleCount > 0`.

À partir de ce moment, vos règles `custom/` priment automatiquement sur celles de `microsoft/` et `community/` (et apparaissent comme superseding dans `suppressed[]`).

---

## Maintenance et mise à jour

### Mettre à jour le serveur (code + build)

```powershell
cd "$env:USERPROFILE\bcquality-mcp"  # ou le dossier où vous l'avez cloné
.\scripts\update.ps1
```

Fait `git pull` + `npm install` + `npm run build`. Redémarrez votre client MCP ensuite.

### Mettre à jour le contenu BCQuality (clone des règles)

Depuis Claude (sans quitter la session) :
> *Lance `bcquality_refresh` pour mettre à jour le clone.*

Ou manuellement :
```powershell
cd "$env:LOCALAPPDATA\bcquality\cache"
git pull
```
(Puis redémarrez la session Claude Code pour reconstruire l'index.)

### Rebuilder uniquement (après modif locale du code source)

```powershell
npm run build
```

Puis redémarrez la session du client MCP.

### Vérifier les types ponctuellement

```powershell
npm run typecheck
```

(Peut prendre 1–2 minutes et nécessiter beaucoup de RAM.)

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `claude mcp list` montre `✘ Failed to connect` | Le chemin de `dist/index.js` est invalide ou `npm run build` n'a pas été lancé | Vérifiez `Test-Path "dist/index.js"`, relancez `npm run build`. |
| Au démarrage : `BCQUALITY_REPO_PATH points to "..." which does not exist` | Variable d'env pointe vers un dossier supprimé | Corrigez ou supprimez la variable pour basculer sur l'auto-clone. |
| `Directory ... does not look like a BCQuality clone` | Le `REPO_PATH` n'a pas la structure attendue (README.md + dossier `microsoft/`/`community/`/`skills/`) | Vérifiez que c'est bien un fork de microsoft/BCQuality, pas un autre repo. |
| Le tool `bcquality_list_domains` retourne `[]` | Le repo cloné est vide ou les couches activées n'ont aucun contenu | Inspectez avec `bcquality_status`, vérifiez la valeur de `BCQUALITY_LAYERS`. |
| Le clone auto échoue | Pas d'accès internet, ou git non installé | Installez git, vérifiez la connectivité, ou clonez manuellement et pointez `BCQUALITY_REPO_PATH`. |
| `tsc` plante en OOM lors de `npm run typecheck` | Bug d'inférence SDK MCP ↔ Zod | Ignorez — utilisez `npm run build` (esbuild) qui n'est pas affecté. Le runtime fonctionne. |

### Test de bout en bout manuel (JSON-RPC)

Si vous voulez vérifier sans client MCP :

```powershell
cd "$env:USERPROFILE\bcquality-mcp"
node dist/index.js
```

Tapez (et `Entrée` après chaque ligne) :
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"bcquality_status","arguments":{}}}
```

Vous devez recevoir une réponse JSON avec `repoPath`, `commit`, `layers`, etc.

---

## Développement

### Structure du projet

```
BC QUALITY/
├── src/
│   ├── index.ts              # entrée stdio, McpServer registration
│   ├── config.ts             # parse env vars
│   ├── repo/
│   │   ├── manager.ts        # clone/pull + résolution
│   │   ├── walker.ts         # parcours filesystem
│   │   └── index.ts          # index en mémoire + précédence couches
│   ├── parser/
│   │   ├── frontmatter.ts    # validation Zod du YAML
│   │   ├── knowledge.ts      # split body en sections
│   │   └── skill.ts          # parse action skills
│   ├── search/
│   │   ├── filter.ts         # matching frontmatter
│   │   └── score.ts          # ranking keywords/domain/title
│   └── tools/                # tools MCP (1 fichier par groupe)
│       ├── shared.ts
│       ├── discovery.ts      # list_domains, list_knowledge, list_skills
│       ├── read.ts           # get_knowledge, get_examples, get_skill
│       ├── workflow.ts       # search_knowledge, get_applicable_for_context
│       └── meta.ts           # status, refresh
├── eval/
│   └── questions.xml         # 10 questions d'évaluation
├── build.mjs                 # script esbuild
├── package.json
├── tsconfig.json
└── README.md (ce fichier)
```

### Scripts npm

| Commande | Effet |
|---|---|
| `npm run build` | Transpile `src/**/*.ts` → `dist/` via esbuild (~100 ms). |
| `npm run typecheck` | Vérifie les types via `tsc --noEmit` (long, heap 8 Go). |
| `npm run dev` | Lance le serveur via `tsx` (compile à la volée). |
| `npm start` | Lance le serveur compilé (`node dist/index.js`). |
| `npm run inspect` | Ouvre MCP Inspector pour tester les tools en UI web. |
| `npm test` | Lance les 42 tests unitaires + intégration (vitest, < 1 s). |
| `npm run test:watch` | Mode watch des tests unitaires. |
| `npm run test:e2e` | Lance les 7 tests E2E qui spawnent le serveur sur stdio (~1 s). |

### Suite de tests

- `tests/unit/` — parsers (frontmatter, knowledge, skill), search (filter, score). Pas d'I/O sur le repo réel.
- `tests/integration/` — `buildIndex` + `applyLayerPrecedence` contre le mini-repo de `tests/fixtures/mini-repo/` (couvre la précédence custom > community > microsoft).
- `tests/e2e/` — spawn `dist/index.js` et envoie de vrais messages JSON-RPC. Vérifie l'init, le `tools/list` complet, et les payloads `structuredContent` des tools clés. **Pré-requis : `npm run build` avant.**

Le mini-repo de fixture contient les 3 couches avec un slug volontairement dupliqué (`use-isempty-for-existence-check`) pour valider la logique de précédence.

### Ajouter un nouveau tool

1. Créer une fonction `registerXxxTool(server, ctx)` dans le bon fichier sous `src/tools/`.
2. L'appeler depuis `src/index.ts`.
3. `npm run build`.
4. Tester via MCP Inspector ou JSON-RPC manuel.

---

## Licence

MIT — comme `microsoft/BCQuality` lui-même.
