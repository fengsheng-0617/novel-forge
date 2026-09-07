'use strict';
// NovelForge — default settings, provider presets & app meta.
// Models/context sizes are editable estimates; users can adjust or fetch live lists.

const APP = {
  name: '织文 NovelForge',
  nameEn: 'NovelForge',
  version: '0.4.0',
  tagline: '从灵感火花到成书连载 —— 每一步都由你把关的 AI 小说工坊',
};

// ---------- provider presets ----------
// kind: 'openai'  → OpenAI Chat Completions 兼容 (OpenAI/DeepSeek/Qwen/GLM/Kimi/讯飞/豆包/SiliconFlow/Ollama/Grok/xAI…)
//       'gemini'  → Google Gemini generateContent / streamGenerateContent
//       'mock'    → 内置离线模拟引擎（无需网络与 Key，用于全流程演示与测试）

const PRESETS = [
  {
    id: 'mock', name: '模拟引擎（离线演示）', kind: 'mock', builtin: true, enabled: true,
    baseURL: '', apiKey: '', defaultModel: 'mock-prose',
    models: [{ id: 'mock-prose', name: '模拟创作引擎（无需联网/Key）', context: 131072, output: 8192 }],
    note: '零配置零联网：让 点子→设定→人物→大纲→章节 全流程可离线跑通，便于先体验再接入真实模型。接入真实模型后可在设置中关闭它。',
  },
  {
    id: 'openai', name: 'OpenAI', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://api.openai.com/v1', apiKey: '',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', context: 128000, output: 16384 },
      { id: 'gpt-4o', context: 128000, output: 16384 },
      { id: 'gpt-4.1-mini', context: 1047576, output: 32768 },
      { id: 'gpt-4.1', context: 1047576, output: 32768 },
    ],
    note: '官方 OpenAI 接口。需 API Key（sk-…）。',
  },
  {
    id: 'deepseek', name: 'DeepSeek 深度求索', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://api.deepseek.com/v1', apiKey: '',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', context: 131072, output: 8192 },
      { id: 'deepseek-reasoner', context: 131072, output: 8192 },
    ],
    note: '国产性价比之选；上下文与输出上限以官网为准。',
  },
  {
    id: 'qwen', name: '通义千问 Qwen', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '',
    defaultModel: 'qwen-plus',
    models: [
      { id: 'qwen-plus', context: 131072, output: 8192 },
      { id: 'qwen-max', context: 131072, output: 8192 },
      { id: 'qwen-turbo', context: 1048576, output: 8192 },
      { id: 'qwen-long', context: 10000000, output: 8192 },
    ],
    note: '阿里云百炼 DashScope 兼容模式，Key 为 sk-…（百炼控制台获取）。',
  },
  {
    id: 'zhipu', name: '智谱 GLM', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '',
    defaultModel: 'glm-4.5',
    models: [
      { id: 'glm-4.5', context: 131072, output: 8192 },
      { id: 'glm-4.5-air', context: 131072, output: 8192 },
      { id: 'glm-4-air', context: 131072, output: 8192 },
      { id: 'glm-4-flash', context: 131072, output: 8192 },
    ],
    note: 'bigmodel.cn 开放平台 Key。',
  },
  {
    id: 'moonshot', name: 'Kimi / 月之暗面', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://api.moonshot.cn/v1', apiKey: '',
    defaultModel: 'kimi-latest',
    models: [
      { id: 'kimi-latest', context: 131072, output: 8192 },
      { id: 'moonshot-v1-128k', context: 131072, output: 8192 },
      { id: 'moonshot-v1-32k', context: 32768, output: 8192 },
      { id: 'moonshot-v1-8k', context: 8192, output: 8192 },
    ],
    note: '模型名与限额以官方文档为准，可自行增删。',
  },
  {
    id: 'xfyun', name: '讯飞星火', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://spark-api-open.xf-yun.com/v1', apiKey: '',
    defaultModel: '4.0Ultra',
    models: [
      { id: '4.0Ultra', context: 131072, output: 8192 },
      { id: 'max-32k', context: 32768, output: 8192 },
      { id: 'generalv3.5', context: 131072, output: 8192 },
    ],
    note: '讯飞开放平台 OpenAI 兼容端点，Key 形如 api_key:api_secret。',
  },
  {
    id: 'doubao', name: '豆包 / 火山方舟', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '',
    defaultModel: '',
    models: [{ id: '', name: '填写火山方舟「接入点 ID」（需先开通模型服务）', context: 131072, output: 8192 }],
    note: '模型 ID 填接入点 ID（如 doubao-seed-1-6-250615 等，以控制台为准）。支持“获取模型列表”。',
  },
  {
    id: 'siliconflow', name: 'SiliconFlow 硅基流动', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://api.siliconflow.cn/v1', apiKey: '',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', context: 131072, output: 8192 },
      { id: 'Qwen/Qwen2.5-72B-Instruct', context: 131072, output: 8192 },
    ],
    note: '聚合多开源模型，模型名需带厂商前缀；可用“获取模型列表”。',
  },
  {
    id: 'grok', name: 'Grok (xAI)', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'https://api.x.ai/v1', apiKey: '',
    defaultModel: 'grok-3',
    models: [
      { id: 'grok-3', context: 131072, output: 32768 },
      { id: 'grok-3-mini', context: 131072, output: 32768 },
    ],
    note: 'xAI Grok 使用 OpenAI 兼容协议；最新模型名请以 xAI 文档为准。',
  },
  {
    id: 'ollama', name: 'Ollama（本地）', kind: 'openai', builtin: true, enabled: false,
    baseURL: 'http://127.0.0.1:11434/v1', apiKey: 'ollama',
    defaultModel: 'qwen3:8b',
    models: [
      { id: 'qwen3:8b', context: 32768, output: 4096 },
      { id: 'qwen2.5:7b', context: 32768, output: 4096 },
    ],
    note: '本机 Ollama 服务需已启动（ollama serve），模型需先 pull。',
  },
  {
    id: 'gemini', name: 'Google Gemini', kind: 'gemini', builtin: true, enabled: false,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey: '',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', context: 1048576, output: 65536 },
      { id: 'gemini-2.5-pro', context: 1048576, output: 65536 },
      { id: 'gemini-2.0-flash', context: 1048576, output: 8192 },
    ],
    note: '需 Google AI Studio 的 API Key。长上下文写作利器。',
  },
];

function defaultSettings() {
  return {
    version: 1,
    server: { port: 7390, bind: '127.0.0.1' },
    seedDemoOnFirstRun: true,
    ui: { theme: 'dark', fontSize: 15 },
    defaults: {
      providerId: 'mock',           // 全局默认厂商
      model: 'mock-prose',          // 空 = 用厂商 defaultModel
      temperature: 0.9,
      maxTokens: 4096,
      chapterWords: 3200,           // 单章目标字数
      retries: 1,
    },
    providers: JSON.parse(JSON.stringify(PRESETS)),
    templates: [],                  // 提示词模板，首次启动自动填充内置默认（server/templates.js）
    customActions: [],              // 用户自定义动作（后续阶段可用）
    pipeline: {
      autoSummary: true,            // 每章生成后自动写章节摘要
      autoContinuity: true,         // 每章生成后自动更新事实/伏笔连续性记忆
      continueOnError: false,       // 无人值守链遇错是否继续
    },
    logLevel: 'info',
  };
}

module.exports = { APP, PRESETS, defaultSettings };
