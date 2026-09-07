# Changelog

> **🌐 Idiomas**
> [简体中文](CHANGELOG.md) · [English](CHANGELOG.en.md) · [Français](CHANGELOG.fr.md) · [Русский](CHANGELOG.ru.md) · [Español](CHANGELOG.es.md) · Português

Este changelog registra as mudanças notáveis do NovelForge seguindo [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [Versionamento Semântico](https://semver.org/).

Nota de histórico: as versões anteriores à v0.3.0 são os primeiros lançamentos consolidados (pipeline completo ideia→mundo→personagens→esboço→prosa + gateway multiprovedor + pipeline sem supervisão); o registro começa na v0.3.0.

## [0.4.0] - 2026-09-07

### Added
- **Registro de capacidades**: novo `server/capabilities.js`, que fornece `registerCapability / getCapability / listCapabilities`; o projeto ganhou o campo `cap` (`novel/content/doc/email`); as capacidades não-novela usam o modelo de dados unificado do «workbench de texto».
- **Capacidade de conteúdo (content)**: enviar/colar texto-fonte → analisar → imitar / continuar / reescrever. Novas ações `content_analyze / content_imitate / content_continue / content_rewrite`, com 4 conjuntos de modelos correspondentes.
- **Capacidade de documento (doc)**: imitação de resoluções do Conselho de Segurança da ONU. Nova ação `doc_resolution` e seu modelo de redação.
- **Capacidade de e-mail (email)**: edição de e-mails acadêmicos de aproximação. Nova ação `email_cold` e seu modelo.
- **Escrita multilíngue**: campo `language` no projeto + `langInstruction()`, que injeta instruções de escrita conforme o idioma de destino (zh/en/fr/ru/es/pt e qualquer idioma).
- **API**: `GET /api/capabilities`, `GET /api/capabilities/:id`, `PUT /api/projects/:id/workspace` (grava texto-fonte/parâmetros/idioma); a criação de projeto suporta `cap`.
- **Framework i18n do frontend**: `public/js/i18n.js` (dicionário completo zh/en + fallback para chinês em fr/ru/es/pt), seletor de idioma na barra superior e todas as views principais conectadas ao `t()`.
- **Workbench de capacidades na Web**: `public/js/views/capStudio.js`, que fornece a interface Web operacional texto-fonte → geração para projetos content/doc/email.
- 6 novos modelos de capacidade (`t_content_*`, `t_doc_resolution`, `t_email_cold`).

### Changed
- **Atualização de posicionamento**: de «oficina de criação de romances com IA» para um framework «ferramenta de criação com IA tudo-em-um»; **a novela foi reduzida a uma das capacidades (novel)** e foram adicionadas três novas capacidades de texto.
- Os textos de UI do frontend foram totalmente conectados ao i18n (zh é a base; os idiomas não cobertos retornam ao chinês nas chaves ausentes).
- Total de modelos de 18 → 24; total de ações do motor de 18 → 24 (incluindo as ações de capacidade).

### Fixed
- Corrigidos 3 erros de balanceamento de parênteses expostos no modo estrito ESM (`bible.js / audit.js / outline.js`), previamente detectados por `check-syntax.js` (análise estrita .mjs), mas não capturados por `node --check` (modo permissivo CJS).
- Imagem do motor e asserções de teste atualizadas para se adaptar à nova quantidade de capacidades.

### Verify
- Autoteste da versão independente totalmente verde: API 26/26 · motor 35/35 · pipeline 21/21 · aceitação 20/20 · sintaxe 45/45 · importação 15/15.
- Imagem do motor `engine-mirror verify`: origem/plugins 32 vs 32 com desvio zero.

## [0.3.0] - 2026-09-06

### Added
- Primeira versão consolidada oficial: o fluxo completo ponto → mundo (bible) → personagens → esboço por volumes/capítulos → corpo do capítulo, tudo editável manualmente/regenerável/refinável localmente/desfazer com um clique.
- Gateway LLM multiprovedor: OpenAI compatível / DeepSeek / Tongyi Qwen / Zhipu GLM / Kimi / iFlytek Spark / Doubao / SiliconFlow / Ollama / Grok / Gemini (inclui o motor de simulação offline mock, que permite executar todo o fluxo sem Key).
- Pipeline sem supervisão (`pipeline.js`): totalmente automático com um clique / esboço → texto seriado completo, com arquivamento automático capítulo a capítulo de resumo + fatos + memória de continuidade de prenúncios.
- Revisão de consistência do texto completo (`audit_book`) e 4 tipos de exportação (md/manuscript/txt/json).
- Exemplo integrado «Carta de Mist Harbor» (雾港来信) e 12 predefinições de provedores, gerados automaticamente na primeira execução.

### Fixed
- (A primeira versão não possui registro de defeitos pré-existentes; esta versão é o ponto inicial rastreável.)

[0.4.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.0
[0.3.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.3.0
