# Changelog

> **🌐 Languages**
> [简体中文](CHANGELOG.md) · English · [Français](CHANGELOG.fr.md) · [Русский](CHANGELOG.ru.md) · [Español](CHANGELOG.es.md) · [Português](CHANGELOG.pt.md)

This changelog records notable changes to NovelForge, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

> History note: versions before v0.3.0 are the early shaped releases (idea→setting→characters→outline→prose full pipeline + multi-provider gateway + unattended pipeline); recording starts at v0.3.0.

## [0.4.0] - 2026-09-07

### Added
- **Capability registry**: added `server/capabilities.js`, providing `registerCapability / getCapability / listCapabilities`; projects gained a `cap` field (`novel/content/doc/email`), with non-novel capabilities following a unified "text workbench" data model.
- **Content capability (content)**: upload/paste source text → analyze → imitate / continue / rewrite. Added actions `content_analyze / content_imitate / content_continue / content_rewrite`, with 4 corresponding templates.
- **Official-document capability (doc)**: UN Security Council resolution imitation. Added action `doc_resolution` and its formatting template.
- **Email capability (email)**: academic cold-email drafting. Added action `email_cold` and its template.
- **Multilingual writing**: project `language` field + `langInstruction()`, injecting writing instructions per target language (zh/en/fr/ru/es/pt and any language).
- **API**: `GET /api/capabilities`, `GET /api/capabilities/:id`, `PUT /api/projects/:id/workspace` (writes source text/parameters/language); project creation supports `cap`.
- **Frontend i18n framework**: `public/js/i18n.js` (full zh/en dictionaries + fr/ru/es/pt fall back to Chinese), top-bar language selector, all core views wired into `t()`.
- **Web capability workbench**: `public/js/views/capStudio.js`, providing a web UI for source text → generation across content/doc/email projects.
- Added 6 capability templates (`t_content_*`, `t_doc_resolution`, `t_email_cold`).

### Changed
- **Repositioning**: upgraded from an "AI novel-writing studio" to an "all-purpose AI creation tool" framework; **novel is now one capability among several (novel)**, with three additional text capabilities added.
- Frontend UI copy fully migrated to i18n (zh is the base; keys not covered in other languages fall back to Chinese).
- Total templates went from 18 → 24; total engine actions went from 18 → 24 (including capability actions).

### Fixed
- Fixed 3 parenthesis-balance errors exposed under ESM strict mode (`bible.js / audit.js / outline.js`), which `check-syntax.js` (.mjs strict parsing) had previously caught but `node --check` (CJS lenient mode) had not.
- Updated engine mirror and test assertions to match the new capability counts.

### Verify
- Standalone self-test all green: API 26/26 · engine 35/35 · pipeline 21/21 · acceptance 20/20 · syntax 45/45 · imports 15/15.
- Engine mirror `engine-mirror verify`: source/plugin 32 vs 32, zero drift.

## [0.3.0] - 2026-09-06

### Added
- First shaped formal release: the full pipeline of idea → setting (bible) → characters → volume/chapter outline → chapter prose, fully editable/regenerable/partially polishable/one-click undo.
- Multi-provider LLM gateway: OpenAI-compatible / DeepSeek / Qwen (Tongyi) / Zhipu GLM / Kimi / iFlytek Spark / Doubao / SiliconFlow / Ollama / Grok / Gemini (includes an offline mock engine; the full pipeline runs with no Key).
- Unattended pipeline (`pipeline.js`): one-click fully automatic / outline → full serialized prose, with per-chapter automatic archiving of summaries + facts + foreshadowing continuity memory.
- Full-text consistency review (`audit_book`), 4 export formats (md/manuscript/txt/json).
- Built-in example _Letters from the Misty Harbor_ and 12 provider presets, auto-generated on first run.

### Fixed
- — (no prior defects recorded in this first trackable release)

[0.4.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.0
[0.3.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.3.0
