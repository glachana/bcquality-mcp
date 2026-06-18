# bcquality-mcp — Liste d'améliorations

État au **2026-06-18**. Les items barrés ont été livrés. Les autres restent à arbitrer.

Légende effort : **XS** < 30 min · **S** < 2 h · **M** < 1 jour · **L** > 1 jour.

---

## 🔴 Haute priorité — Robustesse et correction

### 1. Version du serveur incohérente ✅ *(livré dans 0.2.0)*
~~`src/index.ts` hardcodait `version: '0.1.0'` alors que `package.json` était à `0.1.2`.~~
Implémenté via `src/version.ts` qui lit `package.json` au runtime.

### 2. Pas de cache TTL ni d'invalidation automatique
Le clone n'est jamais rafraîchi sauf via l'appel explicite à `bcquality_refresh`. Ajouter :
- une vérification `git fetch` au démarrage avec TTL configurable (`BCQUALITY_REFRESH_TTL_HOURS`)
- un watcher sur le dossier du clone (chokidar) en mode `BCQUALITY_REPO_PATH` pour rebuild automatique de l'index

**Effort : M**

### 3. Auto-clone destructif
`src/repo/manager.ts` supprime le dossier cache existant si ce n'est pas un repo git, sans confirmation. Risqué si l'utilisateur a pointé `BCQUALITY_CACHE_PATH` vers un dossier sensible par erreur. Ajouter un garde-fou (vérifier que le dossier est vide ou contient `.bcquality-cache.json`).

**Effort : S**

### 4. Aucune gestion des erreurs côté tools ✅ *(livré dans 0.2.0)*
~~Les `registerTool` n'avaient pas de try/catch. Une lecture qui échoue renvoyait une stack trace brute au client MCP.~~
Implémenté : classe `BCQualityError` avec codes typés + `withErrorHandling()` wrapper appliqué aux 10 tools. Erreurs retournées sous forme `{ isError: true, content: [{ error, message, hint, tool }] }`.

### 5. Path traversal potentiel dans `resolveRepoPath` ✅ *(livré dans 0.2.0)*
~~`bcquality_get_knowledge` et `bcquality_get_examples` acceptaient un `path` arbitraire.~~
Implémenté : `path.relative()` + check `..` + `isAbsolute()` + regex drive-letter Windows + whitelist d'extensions (`.md` uniquement pour les reads).

### 6. `parseKnowledgeFile` vs `safeParseKnowledgeFile`
`registerReadTools` utilise la version qui jette, alors que l'index utilise la version safe. Inconsistant — un fichier corrompu casse `bcquality_get_knowledge` mais pas la liste.

**Effort : S** — wrappé désormais par `withErrorHandling` mais le code mort `safeParseKnowledgeFile` mérite consolidation.

---

## 🟡 Priorité moyenne — Qualité du moteur de recherche

### 7. Scoring naïf
`src/search/score.ts` :
- Pas de TF-IDF
- Le match « sub-string keyword » peut sur-pondérer des termes très génériques
- Ne tokenise pas le body des sections `bestPractice`/`antiPattern` (seulement `description`)
- Ne supporte pas les requêtes phrasées ni la stemmatisation (FR/EN)

Améliorations possibles : intégrer **MiniSearch** ou **fuse.js** (légers, sans dépendance native) avec champs pondérés et fuzzy matching, ou implémenter un BM25 minimal.

**Effort : M**

### 8. Recherche sémantique optionnelle
Ajouter un mode `BCQUALITY_EMBEDDINGS=ollama|openai` pour générer des embeddings des descriptions et faire une recherche cosine. Très utile sur `bcquality_get_applicable_for_context` quand le `goal` est exprimé en français vague.

**Effort : L**

### 9. Stopwords combinés EN/FR avec doublons
Liste avec doublons (`'an'`, `'it'` apparaissent deux fois). Séparer EN/FR et sélectionner selon la langue détectée du query.

**Effort : XS**

---

## 🟢 Nouvelles fonctionnalités utiles aux agents

### 10. Tool `bcquality_get_bundle` (workflow)
Renvoie en un appel : la knowledge + son `.good.al` + son `.bad.al` + les skills liées du même domaine. Évite 3-4 round-trips pour l'agent.

**Effort : S**

### 11. Tool `bcquality_diff`
Compare deux fichiers du même slug entre layers (ex. `community/use-isempty…` vs `custom/use-isempty…`) pour voir ce que la couche custom a override. Très utile en revue interne.

**Effort : S**

### 12. Tool `bcquality_validate_custom`
Valide qu'un fichier `/custom/` respecte la convention BCQuality (frontmatter requis, sections `## Description` / `## Best Practice`, etc.) — particulièrement précieux pour Dynamics International qui maintiendra sa couche `/custom/`.

**Effort : M**

### 13. Resources MCP
Aucune `resource` n'est exposée. Selon la spec MCP, exposer chaque knowledge file comme resource `bcquality://microsoft/knowledge/performance/xxx.md` permettrait aux clients qui le supportent d'attacher directement les fichiers au contexte (Claude Desktop notamment).

**Effort : M**

### 14. Prompts MCP
Aucun prompt n'est enregistré. Exposer des **prompt templates** réutilisables :
- `bcquality_review_al_code` (review d'un objet AL avec les règles applicables)
- `bcquality_pick_pattern` (choisir entre N patterns pour un cas donné)

**Effort : M**

### 15. Tool `bcquality_list_layers_for_slug`
Renvoie toutes les versions d'un même slug à travers les layers (pour debug de précédence avant d'utiliser `get_applicable_for_context`).

**Effort : XS**

### 16. Pagination sur `list_skills`
`bcquality_list_skills` n'a ni `limit` ni `offset`. Si le repo grossit, retour massif.

**Effort : XS**

---

## 🔵 DX et tooling

### 17. Schémas de sortie plus stricts
Plusieurs `outputSchema` utilisent `z.record(z.unknown())` pour `frontmatter`. Définir un schéma typé du frontmatter BCQuality (bc-version, technologies, application-area, countries, severity…) — plus utile pour les clients qui consomment `structuredContent`.

**Effort : M**

### 18. Annotations manquantes ✅ *(livré dans 0.2.0)*
~~Aucun tool ne définissait `idempotentHint`.~~
Tous les tools read-only sont désormais marqués `idempotentHint: true`.

### 19. Pas de mode HTTP/SSE
Seul `StdioServerTransport` est exposé. Ajouter un mode `BCQUALITY_TRANSPORT=http` avec streamable HTTP permettrait un déploiement central (utile dans un setup multi-dev chez Dynamics International).

**Effort : M**

### 20. Logging structuré
Les `console.error` ad hoc devraient passer par un logger (pino) avec niveau (`BCQUALITY_LOG_LEVEL`). Aujourd'hui impossible de monter en debug pour diagnostiquer un index foireux sans modifier le code.

**Effort : S**

### 21. Métriques d'usage
Compter le nombre d'appels par tool et exposer via `bcquality_status` — utile pour identifier les tools peu utilisés à supprimer.

**Effort : S**

### 22. CI/CD manquant 🚧 *(en cours)*
Pas de GitHub Actions. À ajouter :
- build + tests unitaires + e2e sur PR
- publication npm automatique sur tag
- audit `npm audit` hebdomadaire

**Effort : S**

### 23. Tests de fuzzing du frontmatter
Tester avec des fichiers BCQuality réels (corrompus, incomplets, frontmatter avec encodage non-UTF8) au-delà de la mini-repo.

**Effort : M**

### 24. Documenter le contrat de score
La sémantique du `score` retourné par `search_knowledge` n'est pas documentée (échelle ? interprétable ? seuil ?). Soit normaliser entre 0-1, soit l'expliquer dans la description du tool.

**Effort : XS**

---

## ⚪ Polish

### 25. `bcquality_refresh` ne change pas `ctx.repo.commit`
`ctx.reload()` rebuild l'index mais l'objet `ctx.repo` reste figé avec l'ancien commit. Le `bcquality_status` retournera l'ancien SHA après un refresh.

**Effort : XS**

### 26. Pas de `--version` / `--help` CLI
L'utilisateur ne peut pas vérifier la version installée sans lancer le serveur MCP. Ajouter parsing minimal `process.argv`.

**Effort : XS**

### 27. Couche `global` mentionnée mais non gérée
`LAYER_PRECEDENCE` dans `src/repo/index.ts` inclut `'global'` mais `KNOWN_LAYERS` ne le contient pas. Mort-code ou bug ?

**Effort : XS**

### 28. Index reconstruit à chaque reload sans incrémentalité
Pour un repo BCQuality qui grossit (centaines de fichiers .md), la reconstruction full est OK aujourd'hui mais deviendrait visible. Ajouter un mode incrémental basé sur mtime + invalidate-key.

**Effort : M**

---

## Priorisation 0.2.0 → 0.3.0

| Pri | Item | Effort | Impact | État |
|-----|------|--------|--------|------|
| 1 | #4 Gestion d'erreurs structurée | S | Élevé | ✅ |
| 2 | #5 Path traversal guard | S | Élevé (sécurité) | ✅ |
| 3 | #1 Version dynamique | XS | Faible mais propre | ✅ |
| 4 | #22 CI GitHub Actions | S | Moyen | 🚧 |
| 5 | #10 `get_bundle` workflow | M | Élevé (UX agent) | ⏳ |
| 6 | #14 Prompts MCP | M | Élevé (différenciation) | ⏳ |
| 7 | #7 Scoring MiniSearch | M | Élevé (qualité) | ⏳ |
| 8 | #13 Resources MCP | M | Moyen | ⏳ |
