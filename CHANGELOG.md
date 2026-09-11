# Changelog

> **🌐 语言 / Languages**
> 简体中文 | [English](CHANGELOG.en.md) · [Français](CHANGELOG.fr.md) · [Русский](CHANGELOG.ru.md) · [Español](CHANGELOG.es.md) · [Português](CHANGELOG.pt.md)

本文件记录「织文 NovelForge」每一版的显著变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

> 版本历史追溯：v0.3.0 之前为首次成形的早期版本（点子→设定→人物→大纲→正文全流程 + 多厂商网关 + 无人值守流水线），此处从可追溯的 v0.3.0 版本开始记录。

## [0.4.1] - 2026-09-11

### Added
- **故事路线（大纲思路）环节**：在「立项」与「大纲」之间新增强制引导步骤，防止大纲散乱。
  - 新模板 `t_route_plan`（路线 · 故事路线与大纲思路）：产出 2~5 条互不相同的路线候选，每条含
    大纲思路（整体结构/节奏/视角）、阶段路线（3~5 阶段，含章节区间与阶段末转折）、主线冲突升级路径、结局走向、贯穿伏笔、取舍与风险，并标出 AI 推荐项。
  - 新动作 `route_plan`（stage=idea）；项目新增 `routes` 文档（`{candidates, selected}`），可在 `/api/projects/:id/doc` 以 `pointer=routes` 读写。
  - **`{{routeText}}` 变量**：`t_outline_generate` 与 `t_outline_extend` 新增该变量并声明"必须遵循故事路线"；
    已选定 → 注入用户选定的路线；仅生成候选未选定 → 注入 AI 推荐路线并标注"用户尚未确认"；两者都没有 → 注入催办提示。
- **无人值守流水线**：`full` 模式在生成大纲前自动补一步 `route_plan`，大纲以 AI 推荐路线为纲。
- **导出与列表**：`manuscript` 底稿新增「故事路线与大纲思路」区块（选定路线全文 + 其余候选）；项目列表返回 `route` 状态；项目状态新增「路线已定」。
- **网页端**：点子页新增「① 故事路线 · 大纲思路」动作与路线候选卡片（选定 / 采用 AI 推荐 / 换一批候选）；大纲页顶部新增路线提示条（未选定则提醒先去引导）。

### Changed
- 模板总数 24 → 25；引擎动作总数 18 → 19（`route_plan`）。
- `context.js` 新增 `fmtRoute / fmtRouteOne`，`buildVars` 支持 `route` 选项；`store.js` 的文档指针白名单加入 `routes`。
- 版本 0.4.0 → 0.4.1。

### Verify
- 新增模块级测试 `scripts/test-route.js`（17/17）：模板/动作注册、候选归一化与入库语义、`routeText` 三种注入状态、渲染无残留占位符。
- 全量自测全绿：引擎 43/43（含路线环节 6 项）· API 26/26 · 流水线 21/21 · 验收 20/20 · 渲染 9/9 · 交互 11/11 · 语法 46/46 · 导入 15/15。
- 引擎镜像 `engine-mirror verify`：源/插件 32 vs 32 零漂移。

## [0.4.0] - 2026-09-07

### Added
- **能力注册表**：新增 `server/capabilities.js`，提供 `registerCapability / getCapability / listCapabilities`；项目新增 `cap` 字段（`novel/content/doc/email`），非小说能力走统一「文本工作台」数据模型。
- **内容能力（content）**：上传/粘贴原文 → 分析 → 仿写 / 续写 / 改写。新增动作 `content_analyze / content_imitate / content_continue / content_rewrite`，相应模板 4 套。
- **公文能力（doc）**：联合国安理会决议仿写。新增动作 `doc_resolution` 及其体例模板。
- **邮件能力（email）**：学术套磁邮件编辑。新增动作 `email_cold` 及其模板。
- **多语言写作**：项目 `language` 字段 + `langInstruction()`，按目标语言注入写作指令（zh/en/fr/ru/es/pt 及任意语言）。
- **API**：`GET /api/capabilities`、`GET /api/capabilities/:id`、`PUT /api/projects/:id/workspace`（写入源文本/参数/语言）；创建项目支持 `cap`。
- **前端 i18n 框架**：`public/js/i18n.js`（中/英全量字典 + 法/俄/西/葡回退中文），顶栏语言选择器，全部核心视图接入 `t()`。
- **网页能力工作台**：`public/js/views/capStudio.js`，为 content/doc/email 项目提供源文本 → 生成的网页操作界面。
- 新增能力模板 6 套（`t_content_*`、`t_doc_resolution`、`t_email_cold`）。

### Changed
- **定位升级**：从「AI 小说创作工坊」升级为「全能 AI 创作工具」框架；**小说降为其中一个能力（novel）**，新增三类文本能力。
- 前端 UI 文案全面接入 i18n（zh 为基座，其它语言未覆盖键回退中文）。
- 模板总数由 18 → 24；引擎动作总数由 18 → 24（含能力动作）。

### Fixed
- 修正 3 处 ESM 严格模式下暴露的括号平衡错误（`bible.js / audit.js / outline.js`），`check-syntax.js`（.mjs 严格解析）此前发现、`node --check`（CJS 宽容模式）未捕获。
- 更新引擎镜像与测试断言以适配新能力数量。

### Verify
- 独立版自测全绿：API 26/26 · 引擎 35/35 · 流水线 21/21 · 验收 20/20 · 语法 45/45 · 导入 15/15。
- 引擎镜像 `engine-mirror verify`：源/插件 32 vs 32 零漂移。

## [0.3.0] - 2026-09-06

### Added
- 首次成形正式版本：点子 → 设定(bible) → 人物 → 卷章大纲 → 章节正文 全流程可人工编辑/重生成/局部精修/一键撤销。
- 多厂商 LLM 网关：OpenAI 兼容 / DeepSeek / 通义 Qwen / 智谱 GLM / Kimi / 讯飞星火 / 豆包 / SiliconFlow / Ollama / Grok / Gemini（含离线模拟引擎 mock，无需 Key 可跑通全流程）。
- 无人值守流水线（`pipeline.js`）：一键全自动 / 大纲→连载全文，逐章自动归档摘要+事实+伏笔连续性记忆。
- 全文一致性审查（`audit_book`）、4 种导出（md/manuscript/txt/json）。
- 内置示例《雾港来信》与 12 家厂商预设，首次运行自动生成。

### Fixed
- （首版无既有缺陷记录；此版本为可追溯起始点。）

[0.4.1]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.1
[0.4.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.4.0
[0.3.0]: https://github.com/fengsheng-0617/novel-forge/releases/tag/v0.3.0
