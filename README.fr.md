# NovelForge —— Outil de création IA tout-en-un

> **🌐 Langues**
> [简体中文](README.md) · [English](README.en.md) · Français · [Русский](README.ru.md) · [Español](README.es.md) · [Português](README.pt.md)
> Consultez le [CHANGELOG](CHANGELOG.md) pour les nouveautés.

---

Outil local de création IA vaste et entièrement personnalisable qui réunit **l'écriture de romans** et l'**imitation/suite/réécriture de contenu, la rédaction de résolution du Conseil de sécurité, l'email académique de prise de contact** au sein d'un cadre de capacités unique, tout en prenant en charge **l'écriture multilingue**. La chaîne de production de romans : **idées d'inspiration → route narrative → contexte du monde → personnages → plan de chapitres → texte des chapitres**, et chaque production IA peut être **prévisualisée avant intégration, librement modifiée, régénérée, affinée ponctuellement et annulée dans son ensemble (undo)** ; elle prend en charge les interfaces compatibles OpenAI (y compris les fournisseurs nationaux), Gemini, Grok/xAI ; elle intègre un **moteur de simulation hors ligne** et un roman d'exemple — **aucune clé API n'est requise pour expérimenter l'intégralité des fonctionnalités**.

Zéro dépendance tierce (bibliothèque standard Node.js pure + navigateur natif), toutes les données sont stockées sur la machine locale.

---

## Démarrage rapide

Prérequis : Node.js ≥ 18.17 (20+ recommandé).

```bash
# Méthode 1 : exécution directe
node server/index.js

# Méthode 2 : double-clic sur run.bat sous Windows (ouvre automatiquement le navigateur)
```

Au lancement, le **navigateur s'ouvre automatiquement** sur http://127.0.0.1:7390 (définissez la variable d'environnement `NOVEL_NO_OPEN=1` pour désactiver l'ouverture automatique ; `NOVEL_PORT` pour changer le port, `NOVEL_DATA` pour changer le répertoire des données). Si le port est signalé comme occupé, cela signifie qu'une instance tourne déjà : accédez simplement à cette adresse.

### Contrôle du service (mode arrière-plan, Windows)

Sans occuper une fenêtre au premier plan, utilisez `novel-ctl.bat` pour démarrer/arrêter le service en tant que **processus d'arrière-plan** (les journaux sont écrits dans `data/server.log`, le PID est enregistré dans `data/server.pid`) :

```bat
novel-ctl.bat          rem = statut (défaut)
novel-ctl.bat status   rem  Afficher l'état de fonctionnement / le port / le PID
novel-ctl.bat start    rem  Démarrage en arrière-plan (sans fenêtre, sans navigateur)
novel-ctl.bat stop     rem  Arrêter le service
novel-ctl.bat restart  rem  Redémarrer
novel-ctl.bat start 7400   rem  Peut spécifier un port ; sinon lit NOVEL_PORT / settings
```

Au premier démarrage, les opérations suivantes sont effectuées automatiquement :
1. écriture des paramètres par défaut (12 préréglages de fournisseurs + 25 modèles de prompt) ;
2. création du projet d'exemple intégré《示例 · 雾港来信》(La Lettre du port de brume) (mystère-fantastique : bibliothèque de contexte / 6 fiches de personnages / 2 volumes et 10 chapitres de plan / 2 chapitres de texte d'exemple / archives de continuité) ;
3. moteur par défaut = moteur de simulation hors ligne → ouvrez « Paramètres → Moteur par défaut » pour le remplacer par votre véritable modèle.

---

## Chaîne de création (sept phases + export)

| Phase | Fonction | Capacité clé |
|---|---|---|
| ① Idées d'inspiration | titre / résumé en une phrase / contexte / conflit / ton | IA brainstorming (8 candidats, adoption au cas par cas), approfondissement en un clic en document de projet |
| ② Route narrative (plan d'ensemble) | 2 à 5 candidats : plan d'ensemble / itinéraire par étapes / escalade du conflit principal / direction de fin / compromis et risques | l'IA génère les candidats + **sélection humaine** (par numéro / route personnalisée / adoption de la recommandation IA) ; **le plan ne s'y conforme strictement qu'après ce choix** — c'est l'étape clé qui évite un « plan décousu » |
| ③ Contexte du monde | vue d'ensemble / règles immuables / sections de contexte / glossaire | l'IA génère des blocs entiers, compléments incrémentaux, affinement par section ; les règles immuables sont injectées à chaque écriture |
| ④ Personnages | fiches de personnages tous champs | génération de groupe / ajout / affinement IA par fiche / **calibrage de cohérence de tout le groupe** (âge, relations, validation croisée de la chronologie) |
| ⑤ Plan de chapitres | volumes, chapitre par chapitre : objectif + battements + apparitions + point de vue + nombre de mots | plan IA du roman complet (arc des volumes, avec la route sélectionnée injectée), ajout de N chapitres, affinement d'un chapitre, ajout manuel / tri / changement de volume / réorganisation |
| ⑥ Écriture des chapitres | éditeur de texte | rédaction en streaming / suite / réécriture complète / polissage général / réécriture locale d'un passage sélectionné ; sauvegarde automatique, compteur de mots en temps réel ; **écriture en série sans surveillance** (termine automatiquement tous les chapitres restants selon le plan) |
| ⑦ Révision de continuité | archives de mémoire + vue d'ensemble des fils narratifs + référentiel de style + revue complète | chaque chapitre est automatiquement archivé (« résumé + faits + état des fils narratifs ») et injecté dans l'écriture suivante ; relecture finale de niveau éditorial IA (logique / chronologie / conflits de contexte / OOC / style / fautes de langue), rapport conservé sans polluer le texte |
| Export | téléchargement en un clic | `book.md` livre achevé / `manuscript.md` brouillon de création complet (contient la route narrative) / `book.txt` texte brut / `backup.json` sauvegarde du projet |

> **Pourquoi la route narrative est obligatoire** : sans contrainte de route, le modèle a tendance à hésiter sur le thème,
> la manière de faire monter le conflit et la direction de la fin, et le plan produit perd son cap d'un bout à l'autre.
> Cet outil fait donc de « route narrative + plan d'ensemble » un **préalable** du plan — même une idée d'un seul paragraphe
> doit d'abord donner plusieurs routes au choix. Le « tout automatique en un clic » sans surveillance effectue lui aussi
> cette étape en premier et prend la route recommandée par l'IA pour fil conducteur (en présence d'une personne, il est
> conseillé de choisir manuellement).

Disponible en continu : **« Annuler »** dans la barre supérieure (les applications IA et les modifications structurelles peuvent être annulées sur tout le projet, 60 pas), la progression du pipeline à gauche, le « journal d'exécution » en bas à droite, les « paramètres » en haut à droite.

### Écriture en série sans surveillance
Une fois le plan prêt (ou à tout moment) : « ⚡ Tout automatique en un clic » dans la barre latérale va de l'élément manquant jusqu'à la mise en forme complète du livre ; « ⚡ Plan → écriture en série sans surveillance » sur la page d'écriture termine tous les chapitres restants. Pendant l'exécution, vous pouvez **mettre en pause / reprendre / arrêter** ; chaque chapitre effectue automatiquement : rédaction du texte → résumé → archivage des faits et de l'état des fils narratifs → chapitre suivant.

---

## Connexion à de véritables modèles

Ouvrez **⚙ Paramètres** :
1. **Fournisseurs de modèles** : OpenAI, DeepSeek, 通义千问 (Qwen/DashScope), 智谱 GLM, Kimi (Moonshot AI), 讯飞星火, 豆包 (Volcano Ark), SiliconFlow, Ollama (local), Grok (xAI), Gemini, moteur de simulation sont déjà préconfigurés.
2. Renseignez le **BaseURL / la clé API** (la clé peut rester vide pour `ollama` et les autres points d'accès locaux) ; vous pouvez ajouter ou supprimer des **lignes de modèles** au sein d'un fournisseur (ID du modèle / nom affiché / fenêtre de contexte — la fenêtre sert au découpage automatique du budget de contexte).
3. Cliquez sur **⛁ Tester la connexion** pour vérifier ; **⇣ Obtenir la liste des modèles** permet de la récupérer en ligne.
4. Pour tout **point d'accès compatible OpenAI** sans préréglage intégré : cliquez sur « ＋ Fournisseur compatible OpenAI personnalisé », puis renseignez le BaseURL jusqu'à `/v1`.
5. **Moteur par défaut et paramètres de génération** : fournisseur/modèle par défaut, température, tokens de sortie maximaux, nombre de mots cible par chapitre.
6. Dans le panneau de génération de chaque action IA, vous pouvez aussi basculer temporairement le moteur et la température (effet limité à cette session).

### Protocoles déjà adaptés
- `kind: openai` : `POST {baseURL}/chat/completions` (OpenAI/DeepSeek/Qwen/GLM/Kimi/讯飞/豆包/SiliconFlow/Ollama/Grok et tout point d'accès compatible), avec prise en charge du streaming SSE et de la nouvelle tentative automatique sur 429
- `kind: gemini` : `generateContent` / `streamGenerateContent?alt=sse`
- `kind: mock` : moteur de simulation hors ligne local (sans réseau, sans clé)

---

## Modèles de prompt (personnalisables)

Paramètres → **Bibliothèque de modèles de prompt** : 25 modèles groupés par phase, prompts System/User éditables en ligne (les espaces réservés `{{ideaText}}`, `{{bibleText}}`, `{{charsText}}`, `{{curRowText}}`, `{{contText}}`, etc. sont injectés automatiquement par le système), toute modification s'applique immédiatement à toutes les générations suivantes ; « tout réinitialiser aux valeurs par défaut intégrées » en un clic. Les spécifications de sortie des actions de type JSON (JSON pur, anti-blocs de code) et les règles de mise en page des actions de type texte (texte pur, interdiction des remarques explicatives) sont ajoutées automatiquement par le système.

---

## Données et sécurité

- Toutes les données sur la machine locale : `data/projects/*.json` (un fichier par livre, contenant toutes les données de création et l'historique), `data/settings.json` (fournisseurs et clés).
- Copier un projet = instantané au niveau du fichier ; exporter `backup.json` permet une archive à long terme.
- Le service n'écoute par défaut que sur `127.0.0.1` (vous pouvez modifier `server.bind` dans `data/settings.json` en `0.0.0.0` pour ouvrir au réseau local — veillez à bien protéger les clés).
- Les clés API des modèles sont stockées en clair dans le fichier de paramètres local — cet outil est conçu comme un poste d'écriture personnel et local ; ne le déployez pas dans un environnement non fiable.

---

## Structure des répertoires

```
novel-forge/
├─ run.bat / package.json         # Démarrage et scripts
├─ server/                        # Serveur Node sans dépendance
│  ├─ index.js                    # Point d'entrée : hébergement statique + routage
│  ├─ api.js                      # Routes REST/SSE
│  ├─ store.js                    # Stockage des projets / opérations sur les collections / annulation
│  ├─ llm.js                      # Passerelle LLM unifiée (compatible OpenAI/Gemini/simulation)
│  ├─ templates.js                # 25 modèles de prompt intégrés
│  ├─ context.js                  # Assemblage du contexte de projet et découpage du budget
│  ├─ actions.js                  # 25 actions de génération (19 pour le roman + 6 pour les capacités)
│  ├─ pipeline.js                 # Pipeline sans surveillance
│  ├─ export.js                   # Export livre/brouillon/TXT/JSON
│  ├─ seedDemo.js / defaults.js / settings.js / events.js / util.js
├─ public/                        # Front-end navigateur (modules ES natifs, sans build)
│  ├─ index.html / css/style.css
│  └─ js/ app.js + views/* (9 pages) + components/genPanel.js
├─ scripts/                       # Vérifications et recette
└─ data/                          # Données d'exécution (créées automatiquement)
```

## Relation avec la version plugin DSH (dépôts séparés · source unique du moteur)

Ce dépôt est **la seule source de vérité du moteur d'écriture de romans**, avec un positionnement dédié : il fait uniquement le travail de  idée → **route narrative** → contexte → personnages → plan → texte en tant qu'outil de création.
La version plugin DSH (`dsh-novel-forge`, dépôt/répertoire indépendant `../novel-forge-plugin`) gère l'orchestration des services côté écosystème harness et les outils de session `novel_forge_*` ; elle **embarque une copie en miroir de ce moteur** (`app/server`, `app/public`),
synchronisée de façon unidirectionnelle par un outil de miroir afin d'éviter toute divergence entre les deux :

```sh
# À exécuter dans le dépôt du plugin :
node scripts/engine-mirror.mjs verify   # Vérifie que le miroir du moteur est identique (réussi uniquement si 0 divergence)
node scripts/engine-mirror.mjs sync     # Synchronise server/ et public/ de ce dépôt vers app/ du plugin, puis revérifie
```

Convention : **les changements de comportement du moteur ne se font que dans ce dépôt** (après modification, lancez les tests → `sync` dans le dépôt du plugin → trois suites d'autotests du plugin) ;
le dépôt du plugin n'écrit que du code côté harness (service index.js / tools.js / client UI), sans modifier le contenu de `app/`.

## Tests et recette

```bash
node scripts/check-syntax.js      # Syntaxe de tous les JS (serveur + ESM navigateur)
node scripts/check-imports.js     # Intégrité des imports de modules front-end
node scripts/test-route.js        # Étape de route narrative (modèle/action/injection de {{routeText}}, 17 éléments, sans service)
node scripts/test-api.js          # Smoke REST/stockage/annulation      (26 éléments)
node scripts/test-gen.js          # Chaîne complète du moteur de génération          (43 éléments, guidage de route inclus)
node scripts/test-pipeline.js     # Pipeline + export             (21 éléments)
node scripts/acceptance.js        # Recette du flux complet (équivalent curl du flux complet, 20 éléments)
node scripts/verify-ui.js         # Rendu des 9 routes par un vrai moteur Edge headless
```

Les trois suites de régression du back-end peuvent s'exécuter sans configurer aucune clé (en utilisant le moteur de simulation intégré).

## Foire aux questions

- **Erreur « port déjà occupé / EADDRINUSE »** : cela signifie qu'un NovelForge est déjà en cours d'exécution — ouvrez simplement http://127.0.0.1:7390 ; ou utilisez `set NOVEL_PORT=7400` pour changer de port et démarrer une seconde instance ; sous Windows, vous pouvez utiliser `netstat -ano | findstr :7390` + `taskkill /PID <PID> /F` pour terminer l'ancienne instance.
- **Taper directement `NOVEL_PORT=7400 node server/index.js` dans cmd renvoie « n'est pas une commande interne ou externe »** : c'est la syntaxe Linux/macOS ; sous Windows cmd, utilisez `set NOVEL_PORT=7400` puis `node server/index.js` (ou double-cliquez simplement sur `run.bat`, le port est détecté automatiquement).
- **Vouloir repartir de zéro avec des données propres** : après l'arrêt du service, supprimez/déplacez `data/`, puis redémarrez pour repartir à neuf (l'exemple est recréé automatiquement).
- **Ollama local** : lancez d'abord `ollama serve` puis `ollama pull` sur le modèle ; le préréglage du fournisseur pointe déjà vers `http://127.0.0.1:11434/v1`.
- **Les sorties du moteur de simulation portent des marques visibles** : c'est une indication normale — la création formelle démarre une fois un véritable modèle connecté.
- **Les modifications des modèles de prompt ne prennent pas effet ?** : les modèles sont enregistrés fusionnés par clé dans les paramètres, toute modification prend effet immédiatement ; si vous les abîmez, vous pouvez tout réinitialiser en un clic.

---

*NovelForge · MIT · Bonne création*
