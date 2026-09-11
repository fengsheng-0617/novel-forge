# Changelog

> **🌐 Langues**
> [简体中文](CHANGELOG.md) · [English](CHANGELOG.en.md) · Français · [Русский](CHANGELOG.ru.md) · [Español](CHANGELOG.es.md) · [Português](CHANGELOG.pt.md)

Ce changelog consigne les changements notables de NovelForge, selon [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et [Semantic Versioning](https://semver.org/).

> Note historique : les versions antérieures à la v0.3.0 sont les premières versions façonnées (pipeline complet idée→cadre→personnages→plan→prose + passerelle multi-fournisseurs + pipeline sans surveillance) ; l'enregistrement débute à la v0.3.0.

## [0.4.1] - 2026-09-11

### Added
- **Étape de route narrative (plan d'ensemble)** : nouvelle étape de guidage obligatoire entre le « projet » et le « plan », qui évite les plans décousus.
  - Nouveau modèle `t_route_plan` (route · route narrative et plan d'ensemble) : produit 2 à 5 itinéraires candidats réellement distincts, chacun avec un plan d'ensemble (structure globale / rythme / point de vue), un itinéraire par étapes (3 à 5 étapes, avec plages de chapitres et tournant de fin d'étape), un chemin d'escalade du conflit principal, une direction de fin, des fils narratifs de bout en bout, des compromis et des risques, plus la proposition recommandée par l'IA.
  - Nouvelle action `route_plan` (stage=idea) ; le projet gagne un document `routes` (`{candidates, selected}`), lisible et modifiable via `/api/projects/:id/doc` avec `pointer=routes`.
  - **Variable `{{routeText}}`** : `t_outline_generate` et `t_outline_extend` la déclarent désormais et indiquent que le plan doit suivre la route narrative. Route sélectionnée → la route retenue par l'utilisateur est injectée ; candidats seuls, aucun choix → la route recommandée par l'IA est injectée et signalée comme non confirmée ; ni l'un ni l'autre → une invite à lancer l'étape de guidage.
- **Pipeline sans surveillance** : le mode `full` insère automatiquement une étape `route_plan` avant de générer le plan, qui s'appuie alors sur la route recommandée par l'IA.
- **Exports et listes** : le brouillon `manuscript` gagne une section « route narrative et plan d'ensemble » (route sélectionnée intégralement + les autres candidats) ; la liste des projets renvoie le statut `route` ; le statut du projet gagne « route fixée ».
- **Interface web** : la page des idées gagne une action « ① route narrative · plan d'ensemble » et une carte des routes candidates (sélectionner / adopter la recommandation IA / régénérer les candidats) ; la page du plan gagne en haut un bandeau de route (qui rappelle d'aller d'abord au guidage si rien n'est sélectionné).

### Changed
- Nombre total de modèles 24 → 25 ; nombre total d'actions du moteur 18 → 19 (`route_plan`).
- `context.js` gagne `fmtRoute / fmtRouteOne` et la prise en charge d'une option `route` dans `buildVars` ; `store.js` ajoute `routes` à la liste blanche des pointeurs de document.
- Version 0.4.0 → 0.4.1.

### Verify
- Nouvelle suite au niveau module `scripts/test-route.js` (17/17) : enregistrement du modèle et de l'action, normalisation des candidats et sémantique de l'application, les trois états d'injection de `routeText`, rendu sans espace réservé résiduel.
- Auto-tests complets tous au vert : moteur 43/43 (dont 6 cas sur l'étape de route) · API 26/26 · pipeline 21/21 · validation 20/20 · rendu 9/9 · interaction 11/11 · syntaxe 46/46 · import 15/15.
- Image moteur `engine-mirror verify` : source/plugin 32 vs 32, zéro dérive.

## [0.4.0] - 2026-09-07

### Added
- **Registre de capacités** : ajout de `server/capabilities.js`, fournissant `registerCapability / getCapability / listCapabilities` ; ajout d'un champ `cap` aux projets (`novel/content/doc/email`) ; les capacités non-fictionnelles passent par le modèle de données unifié « Text Workbench ».
- **Capacité de contenu (content)** : téléversement/collage du texte source → analyse → imitation / continuation / réécriture. Ajout des actions `content_analyze / content_imitate / content_continue / content_rewrite` et de 4 modèles correspondants.
- **Capacité de document (doc)** : imitation de résolutions du Conseil de sécurité de l'ONU. Ajout de l'action `doc_resolution` et de son modèle rédactionnel.
- **Capacité d'e-mail (email)** : rédaction d'e-mails académiques de prospection (cold outreach). Ajout de l'action `email_cold` et de son modèle.
- **Écriture multilingue** : champ `language` des projets + `langInstruction()`, qui injecte des instructions d'écriture selon la langue cible (zh/en/fr/ru/es/pt et toute autre langue).
- **API** : `GET /api/capabilities`, `GET /api/capabilities/:id`, `PUT /api/projects/:id/workspace` (écriture du texte source/paramètres/langue) ; la création d'un projet prend en charge `cap`.
- **Cadre i18n front-end** : `public/js/i18n.js` (dictionnaires complets zh/en + repli vers le chinois pour fr/ru/es/pt), sélecteur de langue dans la barre du haut, tous les vues principales connectées à `t()`.
- **Atelier de capacités Web** : `public/js/views/capStudio.js`, interface Web pour les projets content/doc/email allant du texte source → à la génération.
- Ajout de 6 modèles de capacités (`t_content_*`, `t_doc_resolution`, `t_email_cold`).

### Changed
- **Refonte du positionnement** : passage de « Atelier de création de romans IA » à un cadre « Outil de création IA tout-en-un » ; **la fiction devient l'une des capacités (novel)**, avec trois nouvelles capacités textuelles.
- Les textes d'interface du front-end sont entièrement intégrés à l'i18n (zh comme base, les autres langues reviennent au chinois pour les clés non couvertes).
- Nombre total de modèles passé de 18 → 24 ; nombre total d'actions du moteur passé de 18 → 24 (capacités incluses).

### Fixed
- Correction de 3 erreurs d'équilibrage des parenthèses révélées en mode strict ESM (`bible.js / audit.js / outline.js`), détectées auparavant par `check-syntax.js` (analyse stricte .mjs) mais non interceptées par `node --check` (mode tolérant CJS).
- Mise à jour de l'image moteur et des assertions de test pour s'adapter au nouveau nombre de capacités.

### Verify
- Auto-tests de la version autonome tous au vert : API 26/26 · moteur 35/35 · pipeline 21/21 · validation 20/20 · syntaxe 45/45 · import 15/15.
- Image moteur `engine-mirror verify` : source/plugin 32 vs 32, zéro dérive.

## [0.3.0] - 2026-09-06

### Added
- Première version officielle façonnée : idée → cadre (bible) → personnages → plan des tomes/chapitres → prose du chapitre ; l'ensemble du pipeline peut être édité manuellement / régénéré / affiné localement / annulé en un clic.
- Passerelle LLM multi-fournisseurs : OpenAI compatible / DeepSeek / Tongyi Qwen / Zhipu GLM / Kimi / iFlytek Spark / Doubao / SiliconFlow / Ollama / Grok / Gemini (y compris un moteur de simulation hors ligne mock, permettant d'exécuter tout le pipeline sans clé).
- Pipeline sans surveillance (`pipeline.js`) : tout automatique en un clic / plan→texte intégral en feuilleton, avec archivage automatique chapitre par chapitre de résumé+faits+mémoire de continuité des intrigues.
- Revue de cohérence de l'ensemble du texte (`audit_book`), 4 types d'export (md/manuscript/txt/json).
- Exemple intégré《Lettre du port de brume》et 12 préréglages de fournisseurs, générés automatiquement à la première exécution.

### Fixed
- (Aucun défaut préexistant à signaler pour la première version ; cette version constitue le point de départ retraçable.)

[0.4.1]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.1
[0.4.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.0
[0.3.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.3.0
