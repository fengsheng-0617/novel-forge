# 织文 NovelForge —— 全能 AI 创作工具

> **🌐 语言 / Languages**
> 简体中文 | [English](README.en.md) · [Français](README.fr.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Português](README.pt.md)
> 更新记录见 [CHANGELOG](CHANGELOG.md)。

大型、可完全自定义的本地 AI 创作工具，把 **小说创作** 与 **内容仿写/续写/改写、安理会决议仿写、学术套磁邮件** 统一在能力框架下，并支持**多语言写作**。小说流水线：**灵感点子 → 故事路线（大纲思路）→ 世界观设定 → 人物群像 → 卷章大纲 → 章节正文**，每一步 AI 产出都可**预览后入库、自由编辑、重新生成、单点精修、整体回退（撤销）**；支持接入 OpenAI 兼容接口（含国产各家）、Gemini、Grok/xAI；内置**离线模拟引擎**与示例小说，**无需任何 API Key 即可完整体验全部功能**。

零第三方依赖（纯 Node.js 标准库 + 原生浏览器），数据全部保存在本机。

---

## 快速开始

要求：Node.js ≥ 18.17（推荐 20+）。

```bash
# 方式一：直接运行
node server/index.js

# 方式二：Windows 双击 run.bat（自动打开浏览器）
```

启动后**自动打开浏览器**至 http://127.0.0.1:7390（设置环境变量 `NOVEL_NO_OPEN=1` 可关闭自动打开；`NOVEL_PORT` 改端口、`NOVEL_DATA` 改数据目录）。若提示端口被占用，说明已有一个实例在运行，直接访问该地址即可。

### 服务控制（后台模式，Windows）

不想占用前台窗口时，可用 `novel-ctl.bat` 把服务作为**后台进程**启停（日志写 `data/server.log`，PID 记于 `data/server.pid`）：

```bat
novel-ctl.bat          rem = status（默认）
novel-ctl.bat status   rem 查看运行状态/端口/PID
novel-ctl.bat start    rem 后台启动（不弹窗口、不开浏览器）
novel-ctl.bat stop     rem 停止服务
novel-ctl.bat restart  rem 重启
novel-ctl.bat start 7400   rem 可指定端口；或不带端口时读 NOVEL_PORT / settings
```

首次启动自动完成：
1. 写入默认设置（12 家厂商预设 + 25 套提示词模板）；
2. 创建内置示例项目《示例 · 雾港来信》（悬疑奇幻：设定库/6 张人物卡/2 卷 10 章大纲/2 章示例正文/连续性档案）；
3. 默认引擎 = 离线模拟引擎 → 打开「设置 → 默认引擎」换成你的真实模型即可。

---

## 创作流程（七个阶段 + 导出）

| 阶段 | 做什么 | 关键能力 |
|---|---|---|
| ① 灵感点子 | 书名/一句话/背景/冲突/基调 | AI 头脑风暴（8 个候选，逐条采纳）、一键深化为立项书 |
| ② 故事路线（大纲思路） | 2~5 条候选：整体思路 / 阶段路线 / 主线冲突升级 / 结局走向 / 取舍风险 | AI 生成候选 + **人工选定**（可选编号 / 自定义 / 采用 AI 推荐）；**选定后大纲才会严格遵循它**，是防止「大纲散乱」的关键一步 |
| ③ 世界观设定 | 总述 / 铁律 / 设定分节 / 名词表 | AI 生成整集、增量补充、单节细化；铁律自动注入每次写作 |
| ④ 人物群像 | 角色卡全字段 | 群像生成 / 新增 / 单卡 AI 精修 / **全组一致性校准**（年龄、关系、时间线互验） |
| ⑤ 卷章大纲 | 分卷、逐章 目标+节拍+登场+视角+字数 | AI 全书大纲（卷弧线，注入已选定路线）、追加 N 章、单章精修、手动加章/排序/改卷/重排 |
| ⑥ 章节写作 | 正文编辑器 | 流式撰写/续写/整体重写/通篇润色/选中段局部改写；自动保存、字数实时；**无人值守连载**（按大纲自动写完剩余全部章节） |
| ⑦ 审校连续性 | 记忆档案 + 伏笔总览 + 文风基准 + 全文审查 | 每章自动「摘要+事实+伏笔状态」归档并注入后续写作；AI 编辑级终审（逻辑/时间线/设定冲突/OOC/文风/语病），报告入库不污染正文 |
| 导出 | 一键下载 | `book.md` 成书 / `manuscript.md` 全创作底稿（含故事路线）/ `book.txt` 纯文本 / `backup.json` 项目备份 |

> **路线为何强制**：没有路线约束时，模型容易在「主题、冲突升级方式、结局走向」上摇摆，写出来的大纲前后失焦。
> 因此本工具把「故事路线 + 大纲思路」做成大纲的**前置环节**——哪怕是只有一段话的点子，也要先给出多条可选路线。
> 无人值守「一键全自动」同样会先补这一步，并以 AI 推荐路线为纲（人在场时建议人工选定）。

全程可用：**顶栏「撤销」**（AI 应用与结构改动可整项目回退，60 步）、左侧流水线进度、右下「运行日志」、右上「设置」。

### 无人值守连载
大纲就绪后（或任意时刻）：侧栏「⚡ 一键全自动」从当前缺的环节一路跑到全书成稿；写作页「⚡ 大纲→无人值守连载」写完剩余全部章节。运行中可**暂停 / 继续 / 停止**，每章自动：写正文 → 摘要 → 事实与伏笔状态归档 → 下一章。

---

## 接入真实模型

打开 **⚙ 设置**：
1. **模型厂商**：已预置 OpenAI、DeepSeek、通义千问(Qwen/DashScope)、智谱 GLM、Kimi(月之暗面)、讯飞星火、豆包(火山方舟)、SiliconFlow、Ollama(本地)、Grok(xAI)、Gemini、模拟引擎。
2. 填入 **BaseURL / API Key**（不填 Key 或 `ollama` 等本地端点可留空），可在厂商内增删**模型行**（模型 ID / 显示名 / 上下文窗口——窗口用于自动裁剪上下文预算）。
3. 点 **⛁ 测试连接** 验证；**⇣ 获取模型列表** 可在线拉取。
4. 任何不支持内置预设的 **OpenAI 兼容端点**：点「＋ 自定义 OpenAI 兼容厂商」，BaseURL 填到 `/v1` 即可。
5. **默认引擎与生成参数**：默认厂商/模型、温度、最大输出 tokens、单章目标字数。
6. 每个 AI 动作的生成面板内也可临时切换引擎与温度（仅本会话生效）。

### 已适配协议
- `kind: openai`：`POST {baseURL}/chat/completions`（OpenAI/DeepSeek/Qwen/GLM/Kimi/讯飞/豆包/SiliconFlow/Ollama/Grok 等一切兼容端点），支持流式 SSE 与 429 自动重试
- `kind: gemini`：`generateContent` / `streamGenerateContent?alt=sse`
- `kind: mock`：本地离线模拟引擎（无网络无 Key）

---

## 提示词模板（可自定义）

设置 → **提示词模板库**：25 套模板按阶段分组，可在线编辑 System/User 提示词（占位符 `{{ideaText}}`、`{{bibleText}}`、`{{charsText}}`、`{{curRowText}}`、`{{contText}}` 等由系统自动注入），改动即刻生效于后续所有生成；可一键「全部重置为内置默认」。JSON 类动作的输出规范（纯 JSON、防代码块）与正文类动作的排版规范（纯正文、禁说明语）由系统自动追加。

---

## 数据与安全

- 一切数据在本机：`data/projects/*.json`（每书一个文件，含全部创作数据与历史）、`data/settings.json`（厂商与 Key）。
- 复制项目 = 文件级快照；导出 `backup.json` 可长期存档。
- 服务默认只监听 `127.0.0.1`（可在 `data/settings.json` 的 `server.bind` 改 `0.0.0.0` 开放局域网，注意保管 Key）。
- 模型 API Key 以明文保存在本机设置文件中——本工具定位为个人本地写作台，请勿部署到不受信环境。

---

## 目录结构

```
novel-forge/
├─ run.bat / package.json         # 启动与脚本
├─ server/                        # 零依赖 Node 服务端
│  ├─ index.js                    # 入口：静态托管 + 路由
│  ├─ api.js                      # REST/SSE 路由
│  ├─ store.js                    # 项目存储 / 集合操作 / 撤销
│  ├─ llm.js                      # 统一 LLM 网关（OpenAI兼容/Gemini/模拟）
│  ├─ templates.js                # 25 套内置提示词模板
│  ├─ context.js                  # 项目上下文组装与预算裁剪
│  ├─ actions.js                  # 25 个生成动作（小说 19 + 能力 6）
│  ├─ pipeline.js                 # 无人值守流水线
│  ├─ export.js                   # 成书/底稿/TXT/JSON 导出
│  ├─ seedDemo.js / defaults.js / settings.js / events.js / util.js
├─ public/                        # 浏览器前端（原生 ES Module，无构建）
│  ├─ index.html / css/style.css
│  └─ js/ app.js + views/*（9 个页面）+ components/genPanel.js
├─ scripts/                       # 检查与验收
└─ data/                          # 运行时数据（自动创建）
```

## 与 DSH 插件版的关系（分仓库 · 单一引擎来源）

本仓库是**小说写作引擎的唯一真源**，定位专一：只做 点子→**故事路线**→设定→人物→大纲→正文 的创作工具。
DSH 插件版（`dsh-novel-forge`，独立仓库/目录 `../novel-forge-plugin`）负责 harness 生态侧的
服务编排与 `novel_forge_*` 会话工具，它**内嵌本引擎的镜像**（`app/server`、`app/public`），
由镜像工具单向同步，防止两处漂移：

```sh
# 在插件仓库内执行：
node scripts/engine-mirror.mjs verify   # 校验引擎镜像是否一致（0 漂移才通过）
node scripts/engine-mirror.mjs sync     # 把本仓库 server/ public/ 同步进插件 app/ 并复验
```

约定：**引擎行为改动只在本仓库做**（改完跑测试 → 插件仓库 `sync` → 插件三套自测）；
插件仓库只写 harness 侧代码（index.js 服务 / tools.js / client UI），不改 `app/` 内容。

## 测试与验收

```bash
node scripts/check-syntax.js      # 全部 JS 语法（服务端+浏览器 ESM）
node scripts/check-imports.js     # 前端模块导入完整性
node scripts/test-route.js        # 故事路线环节（模板/动作/{{routeText}} 注入，17 项，无需服务）
node scripts/test-api.js          # REST/存储/撤销冒烟      （26 项）
node scripts/test-gen.js          # 生成引擎全链路          （43 项，含路线引导）
node scripts/test-pipeline.js     # 流水线+导出             （21 项）
node scripts/acceptance.js        # 全流程验收（等效 curl 全流程，20 项）
node scripts/verify-ui.js         # Edge headless 真实内核渲染 9 路由
```

后端几套回归可在不配置任何 Key 的情况下运行（使用内置模拟引擎）。

## 常见问题

- **报"端口已被占用 / EADDRINUSE"**：说明已有一个 NovelForge 在运行 —— 直接打开 http://127.0.0.1:7390 即可；或用 `set NOVEL_PORT=7400` 换端口启动第二个实例；Windows 下可用 `netstat -ano | findstr :7390` + `taskkill /PID <PID> /F` 结束旧实例。
- **在 cmd 里直接敲 `NOVEL_PORT=7400 node server/index.js` 报"不是内部或外部命令"**：那是 Linux/macOS 写法；Windows cmd 请用 `set NOVEL_PORT=7400` 后再 `node server/index.js`（或直接双击 `run.bat`，端口会自动识别）。
- **想换干净数据重新开始**：停服后删除/移走 `data/`，重启即全新（自动重建示例）。
- **本地 Ollama**：先 `ollama serve` 并 `ollama pull` 模型，厂商预设已指向 `http://127.0.0.1:11434/v1`。
- **模拟引擎产出带明显标记**：属正常提示——接入真实模型后即为正式创作。
- **提示词模板改动没生效？**：模板按 key 合并保存于设置中，改动即时生效；如改坏可一键重置。

---

*织文 NovelForge · MIT · 创作愉快*
