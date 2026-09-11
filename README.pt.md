# NovelForge — ferramenta de criação com IA tudo-em-um

> **🌐 Idiomas**
> [简体中文](README.md) · [English](README.en.md) · [Français](README.fr.md) · [Русский](README.ru.md) · [Español](README.es.md) · Português
> Novidades no [CHANGELOG](CHANGELOG.md).

Uma ferramenta de criação com IA local, grande e totalmente personalizável, que unifica sob uma única **estrutura de capacidades** a **escrita de romances** e a **imitação/continuação/reescrita de conteúdo**, a **redação de resolução do Conselho de Segurança** e o **e-mail acadêmico de contato**, além de dar suporte à **escrita multilíngue**. Pipeline de romance: **ideia inspiradora → rota narrativa → ambientação do mundo → personagens → esboço de capítulos → texto dos capítulos**; cada etapa produzida pela IA pode ser **previsualizada antes de ser armazenada, editada livremente, regenerada, refinada em pontos específicos ou revertida de forma geral (desfazer)**. Há suporte para interfaces compatíveis com OpenAI (incluindo os fornecedores nacionais), Gemini e Grok/xAI; o **motor de simulação offline** e um romance de exemplo já vêm embutidos, então **todos os recursos podem ser plenamente experimentados sem nenhuma API Key**.

Zero dependências de terceiros (somente biblioteca padrão do Node.js + navegador nativo) e todos os dados ficam salvos na própria máquina.

---

## Início rápido

Requisito: Node.js ≥ 18.17 (recomendado 20+).

```bash
# Maneira 1: executar diretamente
node server/index.js

# Maneira 2: no Windows, dar duplo clique em run.bat (abre o navegador automaticamente)
```

Após a inicialização, o **navegador abre automaticamente** em http://127.0.0.1:7390 (defina a variável de ambiente `NOVEL_NO_OPEN=1` para desativar a abertura automática; `NOVEL_PORT` muda a porta, `NOVEL_DATA` muda o diretório de dados). Se houver aviso de porta ocupada, significa que já existe uma instância em execução — basta acessar diretamente esse endereço.

### Controle do serviço (modo de segundo plano, Windows)

Quando você não quer ocupar a janela em primeiro plano, use `novel-ctl.bat` para iniciar/parar o serviço como **processo em segundo plano** (o log é gravado em `data/server.log` e o PID é registrado em `data/server.pid`):

```bat
novel-ctl.bat          rem = status (padrão)
novel-ctl.bat status   rem verificar status/porta/PID em execução
novel-ctl.bat start    rem iniciar em segundo plano (sem janela, sem navegador)
novel-ctl.bat stop     rem parar o serviço
novel-ctl.bat restart  rem reiniciar
novel-ctl.bat start 7400   rem permite especificar a porta; ou, sem porta, lê NOVEL_PORT / settings
```

Na primeira inicialização, é feito automaticamente:
1. Gravam-se as configurações padrão (12 presets de fornecedores + 25 modelos de prompt);
2. Cria-se o projeto de exemplo embutido 《示例 · 雾港来信》 — o romance de exemplo «Carta do Porto Nebuloso» (suspense e fantasia: biblioteca de ambientação / 6 fichas de personagens / esboço de 2 volumes com 10 capítulos / 2 capítulos de texto de exemplo / arquivo de continuidade);
3. O motor padrão = motor de simulação offline → abra «Configurações → Motor padrão» para trocar pelo seu modelo real.

---

## Fluxo de criação (sete etapas + exportação)

| Etapa | O que faz | Capacidades essenciais |
|---|---|---|
| ① Ideia inspiradora | Título / frase de apresentação / contexto / conflito / tom | Brainstorming por IA (8 candidatas, adotáveis uma a uma), aprofundamento em um clique para virar projeto |
| ② Rota narrativa (plano geral do esboço) | 2~5 candidatas: plano geral / rota por etapas / escalada do conflito principal / direção do desfecho / trade-offs e riscos | A IA gera as candidatas + **escolha humana** (por número / rota personalizada / adotar a recomendação da IA); **só depois de escolhida o esboço a segue estritamente** — é a etapa que evita o «esboço disperso» |
| ③ Ambientação do mundo | Visão geral / regras rígidas / seções de ambientação / glossário | A IA gera o conjunto completo, suplementação incremental, detalhamento de uma seção; as regras rígidas são injetadas automaticamente em toda escrita |
| ④ Personagens | Todos os campos da ficha de personagem | Geração do grupo / adicionar / refinamento individual por IA / **calibração de consistência do grupo inteiro** (cruzamento de idade, relações e linha do tempo) |
| ⑤ Esboço de capítulos | Por volume, por capítulo: objetivo + batidas + quem aparece + ponto de vista + contagem de palavras | Esboço completo do livro por IA (arco de volumes, com a rota selecionada injetada), adicionar N capítulos, refinamento por capítulo, adicionar/ordenar/trocar de volume/reordenar manualmente |
| ⑥ Escrita de capítulos | Editor do corpo do texto | Escrita em fluxo / continuação / reescrita geral / polimento integral / reescrita local de trecho selecionado; salvamento automático, contagem de palavras em tempo real; **serialização automática sem supervisão** (escreve automaticamente todos os capítulos restantes conforme o esboço) |
| ⑦ Revisão de continuidade | Arquivo de memória + visão geral de indícios (foreshadowing) + base de estilo + revisão do texto completo | A cada capítulo, arquivamento automático de «resumo + fatos + status de indícios», injetado na escrita seguinte; revisão final de nível editorial por IA (lógica / linha do tempo / conflitos de ambientação / OOC / estilo / erros de linguagem), com o relatório armazenado sem contaminar o corpo do texto |
| Exportação | Download em um clique | `book.md` livro final / `manuscript.md` rascunho completo da criação (inclui a rota narrativa) / `book.txt` texto puro / `backup.json` backup do projeto |

> **Por que a rota é obrigatória**: sem a restrição de uma rota, o modelo tende a oscilar entre «tema, forma de escalada do conflito e direção do desfecho», e o esboço escrito perde o foco de uma parte para a outra.
> Por isso esta ferramenta transforma «rota narrativa + plano geral do esboço» em **etapa prévia** do esboço — mesmo uma ideia de apenas um parágrafo precisa primeiro receber várias rotas possíveis.
> O «automático com um clique» sem supervisão também executa essa etapa antes, com a rota recomendada pela IA como diretriz (com uma pessoa presente, recomenda-se escolher manualmente).

Durante todo o processo, disponíveis: **«Desfazer» na barra superior** (aplicações de IA e mudanças estruturais podem ser revertidas no projeto inteiro, 60 passos), o progresso da pipeline na barra lateral esquerda, o «log de execução» no canto inferior direito e as «Configurações» no canto superior direito.

### Serialização automática sem supervisão
Quando o esboço está pronto (ou a qualquer momento): no painel lateral, «⚡ Automático com um clique» percorre desde a etapa que falta até o livro finalizado; na página de escrita, «⚡ Esboço → serialização automática sem supervisão» escreve todos os capítulos restantes. Durante a execução é possível **pausar / continuar / parar**; a cada capítulo, automaticamente: escrever o corpo → resumo → arquivar fatos e status de indícios → próximo capítulo.

---

## Conectando um modelo real

Abra **⚙ Configurações**:
1. **Fornecedores de modelo**: já vêm pré-configurados OpenAI, DeepSeek, 通义千问 (Qwen/DashScope), 智谱 GLM, Kimi (月之暗面), 讯飞星火, 豆包 (火山方舟), SiliconFlow, Ollama (local), Grok (xAI), Gemini e o motor de simulação.
2. Preencha a **BaseURL / API Key** (sem chave, ou pontos de extremidade locais como `ollama`, podem ficar vazios); você pode adicionar/remover **linhas de modelo** dentro do fornecedor (ID do modelo / nome de exibição / janela de contexto — a janela serve para cortar automaticamente o orçamento de contexto).
3. Clique em **⛁ Testar conexão** para verificar; **⇣ Obter lista de modelos** pode buscar online.
4. Para qualquer **ponto de extremidade compatível com OpenAI** sem preset embutido: clique em «＋ Fornecedor compatível com OpenAI personalizado» e preencha a BaseURL até `/v1`.
5. **Motor padrão e parâmetros de geração**: fornecedor/modelo padrão, temperatura, tokens máximos de saída, contagem-alvo de palavras por capítulo.
6. O painel de geração de cada ação da IA também permite alternar temporariamente o motor e a temperatura (vale somente para esta sessão).

### Protocolos já adaptados
- `kind: openai`: `POST {baseURL}/chat/completions` (todos os pontos de extremidade compatíveis, como OpenAI/DeepSeek/Qwen/GLM/Kimi/讯飞/豆包/SiliconFlow/Ollama/Grok), com suporte a SSE de streaming e nova tentativa automática em 429
- `kind: gemini`: `generateContent` / `streamGenerateContent?alt=sse`
- `kind: mock`: motor de simulação offline local (sem rede e sem Key)

---

## Modelos de prompt (personalizáveis)

Configurações → **Biblioteca de modelos de prompt**: 25 modelos agrupados por etapa, editáveis online (placeholders como `{{ideaText}}`, `{{bibleText}}`, `{{charsText}}`, `{{curRowText}}`, `{{contText}}` são injetados automaticamente pelo sistema); a alteração passa a valer imediatamente em todas as gerações seguintes; há «redefinir tudo para os padrões embutidos» em um clique. As especificações de saída para ações do tipo JSON (JSON puro, sem bloco de código) e as de formatação para ações do tipo texto (texto puro, sem linguagem explicativa) são anexadas automaticamente pelo sistema.

---

## Dados e segurança

- Todos os dados ficam na sua máquina: `data/projects/*.json` (um arquivo por livro, com todos os dados de criação e o histórico), `data/settings.json` (fornecedores e Keys).
- Copiar um projeto = snapshot em nível de arquivo; exportar `backup.json` permite arquivamento de longo prazo.
- Por padrão, o serviço só escuta em `127.0.0.1` (você pode alterar `server.bind` em `data/settings.json` para `0.0.0.0` e abrir para a rede local, mas cuidado ao guardar as Keys).
- As API Keys dos modelos ficam armazenadas em texto puro no arquivo de configurações local — esta ferramenta se destina a ser uma mesa de escrita local pessoal; não a implante em ambientes não confiáveis.

---

## Estrutura de diretórios

```
novel-forge/
├─ run.bat / package.json         # inicialização e scripts
├─ server/                        # servidor Node sem dependências
│  ├─ index.js                    # entrada: hospedagem estática + rotas
│  ├─ api.js                      # rotas REST/SSE
│  ├─ store.js                    # armazenamento de projetos / operações de coleção / desfazer
│  ├─ llm.js                      # gateway LLM unificado (compatível com OpenAI/Gemini/simulação)
│  ├─ templates.js                # 25 modelos de prompt embutidos
│  ├─ context.js                  # montagem do contexto do projeto e corte de orçamento
│  ├─ actions.js                  # 25 ações de geração (19 de romance + 6 de capacidade)
│  ├─ pipeline.js                 # pipeline sem supervisão
│  ├─ export.js                   # exportação de livro/rascunho/TXT/JSON
│  ├─ seedDemo.js / defaults.js / settings.js / events.js / util.js
├─ public/                        # frontend do navegador (ES Module nativo, sem build)
│  ├─ index.html / css/style.css
│  └─ js/ app.js + views/* (9 páginas) + components/genPanel.js
├─ scripts/                       # verificação e aceitação
└─ data/                          # dados em tempo de execução (criados automaticamente)
```

## Relação com a versão de plugin do DSH (repositórios separados · fonte única do motor)

Este repositório é a **única fonte de verdade do motor de escrita de romances**, com foco único: é apenas uma ferramenta de criação para ideia→**rota narrativa**→ambientação→personagens→esboço→texto.
A versão de plugin do DSH (`dsh-novel-forge`, repositório/diretório independente `../novel-forge-plugin`) é responsável pela orquestração de serviços do lado do ecossistema harness e pelas ferramentas de sessão `novel_forge_*`; ela **incorpora uma imagem espelhada deste motor** (`app/server`, `app/public`),
sincronizada de forma unidirecional pelo script de espelhamento, para evitar divergência entre os dois lugares:

```sh
# Executar dentro do repositório do plugin:
node scripts/engine-mirror.mjs verify   # verifica se a imagem do motor é idêntica (só passa com 0 de divergência)
node scripts/engine-mirror.mjs sync     # sincroniza server/ e public/ deste repositório para dentro de app/ do plugin e reverifica
```

Convenção: **mudanças de comportamento do motor são feitas apenas neste repositório** (após alterar, rodar os testes → `sync` no repositório do plugin → as três suítes de autoteste do plugin);
o repositório do plugin só escreve código do lado do harness (serviço index.js / tools.js / UI do cliente) e não altera o conteúdo de `app/`.

## Testes e aceitação

```bash
node scripts/check-syntax.js      # sintaxe de todo o JS (ESM do servidor + do navegador)
node scripts/check-imports.js     # integridade das importações de módulos do frontend
node scripts/test-route.js        # etapa de rota narrativa (modelo/ação/injeção de {{routeText}}, 17 itens, sem servidor)
node scripts/test-api.js          # fumaça REST/armazenamento/desfazer      (26 itens)
node scripts/test-gen.js          # cadeia completa do motor de geração     (43 itens, incluindo a orientação de rota)
node scripts/test-pipeline.js     # pipeline + exportação                   (21 itens)
node scripts/acceptance.js        # aceitação do fluxo completo (equivalente a fluxo curl completo, 20 itens)
node scripts/verify-ui.js         # renderização com kernel real do Edge headless, 9 rotas
```

As três suítes de regressão do backend podem ser executadas sem configurar nenhuma Key (usando o motor de simulação embutido).

## Perguntas frequentes

- **"Porta já está em uso / EADDRINUSE"**: significa que já há um NovelForge em execução — basta abrir http://127.0.0.1:7390; ou use `set NOVEL_PORT=7400` para trocar de porta e iniciar uma segunda instância; no Windows, use `netstat -ano | findstr :7390` + `taskkill /PID <PID> /F` para encerrar a instância antiga.
- **Digitar diretamente `NOVEL_PORT=7400 node server/index.js` no cmd dá "não é um comando interno ou externo"**: isso é sintaxe de Linux/macOS; no prompt do Windows use `set NOVEL_PORT=7400` e depois `node server/index.js` (ou dê duplo clique em `run.bat`, e a porta será detectada automaticamente).
- **Quer recomeçar com dados limpos**: depois de parar o serviço, apague/remova `data/`; ao reiniciar tudo será novo (o exemplo é recriado automaticamente).
- **Ollama local**: primeiro `ollama serve` e `ollama pull` do modelo; o preset do fornecedor já aponta para `http://127.0.0.1:11434/v1`.
- **A saída do motor de simulação tem marcações visíveis**: é um aviso normal — depois de conectar um modelo real, passa a ser uma criação de verdade.
- **A mudança de modelo de prompt não valeu?**: os modelos são salvos na configuração mesclados por chave e a mudança vale imediatamente; se você estragar algo, pode redefinir em um clique.

---

*NovelForge · MIT · boa criação*
