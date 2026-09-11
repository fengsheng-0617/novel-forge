# NovelForge —— All-in-One AI Creation Tool

> **🌐 Languages**
> [简体中文](README.md) · English · [Français](README.fr.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Português](README.pt.md)
> See the [CHANGELOG](CHANGELOG.md) for updates.

A large, fully customizable local AI creation tool that unifies **novel writing** with **content imitation / continuation / rewriting, UN Security Council resolution imitation, and academic cold-emails** under one capability framework, and supports **multilingual writing**. Novel pipeline: **spark of an idea → story route (outline approach) → world-setting/bible → characters → volume & chapter outline → chapter prose**. At every step the AI output can be **previewed, then committed to the store, freely edited, regenerated, spot-refined, or wholly rolled back (undo)**; supports OpenAI-compatible endpoints (including the domestic Chinese providers), Gemini, Grok/xAI; ships with a built-in **offline mock engine** and sample novel, so **no API Key is required to fully experience all features**.

Zero third-party dependencies (pure Node.js standard library + native browser); all data stays on your machine.

---

## Quick Start

Requirements: Node.js ≥ 18.17 (20+ recommended).

```bash
# Option 1: run directly
node server/index.js

# Option 2: Windows, double-click run.bat (opens browser automatically)
```

On startup the browser **opens automatically** to http://127.0.0.1:7390 (set the environment variable `NOVEL_NO_OPEN=1` to disable auto-open; `NOVEL_PORT` changes the port, `NOVEL_DATA` changes the data directory). If a message says the port is already in use, an instance is already running — just visit that address.

### Service Control (background mode, Windows)

If you don't want a foreground window, use `novel-ctl.bat` to start/stop the service as a **background process** (logs go to `data/server.log`, the PID is recorded in `data/server.pid`):

```bat
novel-ctl.bat          rem = status (default)
novel-ctl.bat status   rem view run status / port / PID
novel-ctl.bat start    rem start in background (no window, no browser)
novel-ctl.bat stop     rem stop the service
novel-ctl.bat restart  rem restart
novel-ctl.bat start 7400   rem optionally specify a port; otherwise reads NOVEL_PORT / settings
```

On first start it automatically:
1. Writes default settings (presets for 12 providers + 25 prompt templates);
2. Creates the built-in sample project 《Fog Harbor Letter · 示例》(mystery-fantasy: setting bible / 6 character cards / 2-volume 10-chapter outline / 2 sample chapters / continuity archive);
3. Default engine = offline mock engine → open **Settings → Default Engine** and switch to your real model.

---

## Creation Workflow (seven stages + export)

| Stage | What it does | Key capabilities |
|---|---|---|
| ① Spark of an idea | Title / one-liner / setting / conflict / tone | AI brainstorm (8 candidates, adopt one by one), one-click deepening into a project brief |
| ② Story route (outline approach) | 2–5 options: overall approach / stage-by-stage route / escalating core conflict / ending direction / trade-offs and risks | AI generates the options + **a human picks one** (by number / a custom route / adopting the AI recommendation); **only then** does the outline strictly follow it — this is the step that keeps the outline from drifting |
| ③ World-setting | Overview / hard rules / setting sections / glossary | AI generates the whole set, incremental additions, per-section refinement; hard rules auto-injected into every writing |
| ④ Characters | Full-field character cards | Generate ensemble / add / AI spot-refine a single card / **whole-group consistency calibration** (mutual verification of ages, relationships, timelines) |
| ⑤ Volume & chapter outline | Per-volume, per-chapter goal + beats + cast + POV + word count | AI full-book outline (volume arcs, with the selected route injected), append N chapters, refine one chapter, manual add-chapter / reorder / change-volume / rearrange |
| ⑥ Chapter writing | Prose editor | Streaming draft / continue / full rewrite / polish the whole piece / locally rewrite a selected passage; auto-save, live word count; **unattended serialization** (automatically writes all remaining chapters per the outline) |
| ⑦ Continuity review | Memory archive + foreshadowing overview + style baseline + full-text review | Every chapter is auto-archived as "summary + facts + foreshadowing status" and injected into later writing; AI editor-level final review (logic / timeline / world-setting conflicts / OOC / style / grammar), report stored without polluting the prose |
| Export | One-click download | `book.md` finished book / `manuscript.md` full creation draft (includes the story route) / `book.txt` plain text / `backup.json` project backup |

> **Why the route step is mandatory**: without a route constraint, the model tends to waver between themes,
> conflict escalation paths and endings, so the outline loses focus from one part to the next. This tool therefore makes
> "story route + outline approach" a **precondition** of the outline — even a one-paragraph idea must first yield
> several selectable routes. The unattended "one-click full-auto" also runs this step first and outlines against the
> AI-recommended route (with a human present, picking one manually is recommended).

Available throughout: **top-bar "Undo"** (AI applications and structural changes can be rolled back across the whole project, 60 steps), left-side pipeline progress, bottom-right "Run Log", top-right "Settings".

### Unattended serialization
Once the outline is ready (or at any time): the sidebar **"⚡ One-click full-auto"** runs from whichever stage is missing all the way to a finished book; on the writing page **"⚡ Outline → Unattended serialization"** finishes all remaining chapters. While running you can **pause / resume / stop**; each chapter automatically: writes prose → summaries → archives facts and foreshadowing status → next chapter.

---

## Connecting a Real Model

Open **⚙ Settings**:
1. **Model providers**: OpenAI, DeepSeek, 通义千问 (Qwen/DashScope), 智谱 GLM, Kimi (月之暗面 / Moonshot), 讯飞星火 (iFlytek Spark), 豆包 (Volcano Ark / Doubao), SiliconFlow, Ollama (local), Grok (xAI), Gemini, and the mock engine are all preconfigured.
2. Fill in **BaseURL / API Key** (leave blank when no Key is needed or for local endpoints such as `ollama`); you can add or remove **model rows** within a provider (model ID / display name / context window — the window is used to auto-trim the context budget).
3. Click **⛁ Test Connection** to verify; **⇣ Fetch model list** pulls it online.
4. Any **OpenAI-compatible endpoint** not covered by a built-in preset: click "＋ Custom OpenAI-compatible provider" and set BaseURL to `/v1`.
5. **Default engine and generation parameters**: default provider/model, temperature, max output tokens, per-chapter target word count.
6. Every AI action's generation panel also lets you temporarily switch engine and temperature (effective only for that session).

### Adapted protocols
- `kind: openai`: `POST {baseURL}/chat/completions` (all compatible endpoints such as OpenAI/DeepSeek/Qwen/GLM/Kimi/讯飞/豆包/SiliconFlow/Ollama/Grok), with streaming SSE and automatic 429 retry
- `kind: gemini`: `generateContent` / `streamGenerateContent?alt=sse`
- `kind: mock`: local offline mock engine (no network, no Key)

---

## Prompt Templates (customizable)

Settings → **Prompt template library**: 25 templates grouped by stage, System/User prompts editable online (placeholders such as `{{ideaText}}`, `{{bibleText}}`, `{{charsText}}`, `{{curRowText}}`, `{{contText}}` are auto-injected by the system); changes take effect immediately on all subsequent generations; one-click **"Reset all to built-in defaults"**. The output spec for JSON-style actions (pure JSON, no code blocks) and the formatting spec for prose-style actions (pure prose, no explanations) are appended automatically by the system.

---

## Data & Security

- Everything stays on your machine: `data/projects/*.json` (one file per book, containing all creation data and history), `data/settings.json` (providers and Keys).
- Copying a project = a file-level snapshot; exporting `backup.json` allows long-term archiving.
- By default the service only listens on `127.0.0.1` (you can change `server.bind` to `0.0.0.0` in `data/settings.json` to open it to the LAN — mind your Keys).
- Model API Keys are stored in plaintext in the local settings file — this tool is positioned as a personal local writing desk; do not deploy it to an untrusted environment.

---

## Directory Structure

```
novel-forge/
├─ run.bat / package.json         # startup and scripts
├─ server/                        # zero-dependency Node server
│  ├─ index.js                    # entry: static hosting + routing
│  ├─ api.js                      # REST/SSE routes
│  ├─ store.js                    # project store / collection ops / undo
│  ├─ llm.js                      # unified LLM gateway (OpenAI-compatible / Gemini / mock)
│  ├─ templates.js                # 25 built-in prompt templates
│  ├─ context.js                  # project context assembly & budget trimming
│  ├─ actions.js                  # 25 generation actions (19 novel + 6 capability)
│  ├─ pipeline.js                 # unattended pipeline
│  ├─ export.js                   # finished book / draft / TXT / JSON export
│  ├─ seedDemo.js / defaults.js / settings.js / events.js / util.js
├─ public/                        # browser frontend (native ES Module, no build)
│  ├─ index.html / css/style.css
│  └─ js/ app.js + views/* (9 pages) + components/genPanel.js
├─ scripts/                       # checks & acceptance
└─ data/                          # runtime data (auto-created)
```

## Relationship with the DSH Plugin Edition (separate repos · single engine source)

This repository is the **single source of truth for the novel-writing engine**, with a focused scope: only the idea → **story route** → world-setting → characters → outline → prose creation tool.
The DSH plugin edition (`dsh-novel-forge`, a separate repo/directory `../novel-forge-plugin`) handles service orchestration on the harness side and the `novel_forge_*` session tools; it **embeds a mirror of this engine** (`app/server`, `app/public`) that is synced one-way by the mirror tool to prevent the two from drifting:

```sh
# run inside the plugin repo:
node scripts/engine-mirror.mjs verify   # verify the engine mirror is identical (passes only with 0 drift)
node scripts/engine-mirror.mjs sync     # sync this repo's server/ public/ into the plugin's app/ and re-verify
```

Convention: **engine-behavior changes are made only in this repo** (run the tests after changes → `sync` in the plugin repo → run the plugin's three test suites);
the plugin repo only writes harness-side code (index.js service / tools.js / client UI) and never edits the `app/` contents.

## Testing & Acceptance

```bash
node scripts/check-syntax.js      # all JS syntax (server + browser ESM)
node scripts/check-imports.js     # frontend module import integrity
node scripts/test-route.js        # story-route stage (template/action/{{routeText}} injection, 17 items, no server needed)
node scripts/test-api.js          # REST / store / undo smoke        (26 items)
node scripts/test-gen.js          # full generation-engine pipeline  (43 items, route stage included)
node scripts/test-pipeline.js     # pipeline + export                (21 items)
node scripts/acceptance.js        # full-flow acceptance (curl-equivalent full flow, 20 items)
node scripts/verify-ui.js         # Edge headless real-kernel rendering of the 9 routes
```

The server-side regression suites can run without configuring any Key (using the built-in mock engine).

## FAQ

- **"Port already in use / EADDRINUSE"**: it means a NovelForge instance is already running — just open http://127.0.0.1:7390; or use `set NOVEL_PORT=7400` to start a second instance on another port; on Windows you can run `netstat -ano | findstr :7390` plus `taskkill /PID <PID> /F` to kill the old instance.
- **Typing `NOVEL_PORT=7400 node server/index.js` directly in cmd reports "is not recognized as an internal or external command"**: that's the Linux/macOS syntax; in Windows cmd use `set NOVEL_PORT=7400` and then `node server/index.js` (or just double-click `run.bat`, which detects the port automatically).
- **Want a clean slate to restart fresh**: stop the service, delete or move away `data/`, and restart — you get a brand-new install (the sample is rebuilt automatically).
- **Local Ollama**: first run `ollama serve` and `ollama pull` the model; the provider preset already points to `http://127.0.0.1:11434/v1`.
- **The mock engine's output carries obvious markers**: that's a normal hint — once you connect a real model, output becomes official creation.
- **My prompt-template edits don't take effect?**: templates are saved merged by key in settings, so edits apply immediately; if you break one, you can reset with one click.

---

*NovelForge · MIT · Happy creating*
