'use strict';
// LLM gateway: single interface over OpenAI-compatible, Gemini, and the offline mock engine.
// All adapters support {stream:false} → {text, usage} and {stream:true} → async generator
// yielding {kind:'text', text} chunks, then {kind:'done', usage}.

const util = require('./util');

// ============================================================ helpers

function trimModel(id) { return String(id || '').trim(); }

function httpError(res, body, providerName) {
  let msg = '';
  try {
    const j = JSON.parse(body);
    msg = j.error?.message || j.message || j.error || '';
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
  } catch (e) { msg = body ? String(body).slice(0, 400) : ''; }
  const err = new Error(`[${providerName}] ${res.status} ${res.statusText}${msg ? ' — ' + msg : ''}`);
  err.status = res.status;
  return err;
}

/** 鉴权/凭据类错误 → 中文自查诊断（附 Key 前缀/平台/BaseURL 线索） */
function enrichAuthError(err, provider) {
  if (!err || err._enhanced) return err;
  const m = err.message || '';
  const looksAuth = /401|403/.test(String(err.status || '')) ||
    /(invalid|incorrect|unauthorized|authentication|not.*recognized|api[ -]?key|credential|apikey|鉴权|认证|密钥|无效|无法识别|不存在)/i.test(m);
  if (!looksAuth) return err;
  const key = util.normalizeKey(provider && provider.apiKey);
  const base = String((provider && provider.baseURL) || '').replace(/\/+$/, '');
  const lineKey = key
    ? `① Key 是否复制完整？已自动清理首尾空格/引号，当前前缀 ${key.slice(0, 8)}…（共 ${key.length} 位）`
    : '① 尚未填写 API Key —— 请先在下方输入框粘贴该平台的 Key（可放心，仅存本机）。';
  const lines = [
    '【凭据类错误 · 自查清单】',
    lineKey,
    '② Key 是否来自“' + ((provider && provider.name) || '该平台') + '”对应的开发者控制台？不同平台/公司的 Key 互不通用（Gemini 需 Google AI Studio 的 Key）。',
    base ? `③ BaseURL（${base}）与 Key 是否同一平台？使用第三方中转时，BaseURL 必须填中转服务地址。` : '③ 该厂商尚未填写 BaseURL（OpenAI 兼容端点必须填，如 https://api.deepseek.com/v1 ）。',
    '④ 平台原始返回：' + m.slice(0, 300),
  ];
  if (provider && provider.id === 'xfyun') lines.push('特别提示：讯飞星火需在 API Key 处填写「APIKey:APISecret」组合（中间冒号分隔、无空格）。');
  if (provider && provider.kind === 'gemini') lines.push('特别提示：Gemini 的 Key 形如 AIza…，需在 Google AI Studio 中生成。');
  err.message = lines.join('\n');
  err._enhanced = true;
  return err;
}

/** Split an SSE body stream into event objects {event?, data} */
async function* readSSE(res) {
  const dec = new TextDecoder('utf-8');
  let buf = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data) {
          try { yield JSON.parse(data); } catch (e) { /* ignore keep-alives */ }
        }
      }
    }
  }
}

function jsonDeltaOpenAI(ev) {
  const c = ev.choices && ev.choices[0];
  const delta = c && c.delta ? c.delta : null;
  if (delta && typeof delta.content === 'string') return delta.content;
  return '';
}

// ============================================================ OpenAI-compatible

async function openaiRequest(provider, model, messages, { temperature, maxTokens, stream, signal, maxRetries = 1 }) {
  const base = String(provider.baseURL || '').replace(/\/+$/, '');
  const url = base + '/chat/completions';
  const key = util.normalizeKey(provider.apiKey);
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = 'Bearer ' + key;
  const body = {
    model,
    messages,
    stream,
    temperature: typeof temperature === 'number' ? temperature : undefined,
    max_tokens: maxTokens || undefined,
  };
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e.name === 'AbortError') { const er = new Error('请求已取消'); er.cancelled = true; throw er; }
    const er = new Error(`[${provider.name}] 网络错误：无法连接 ${base}（${e.message}）`);
    er.status = 0; throw er;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = httpError(res, txt, provider.name);
    enrichAuthError(err, provider);
    if (res.status === 429 && maxRetries > 0) {
      const wait = Number(res.headers.get('retry-after') || 3) * 1000;
      await new Promise((r) => setTimeout(r, Math.min(wait, 15000)));
      return openaiRequest(provider, model, messages, { temperature, maxTokens, stream, signal, maxRetries: maxRetries - 1 });
    }
    throw err;
  }
  return res;
}

async function openaiChat(provider, model, messages, opts) {
  model = trimModel(model || provider.defaultModel);
  if (!model) { const e = new Error(`[${provider.name}] 未配置模型 ID`); e.status = 400; throw e; }
  const res = await openaiRequest(provider, model, messages, { ...opts, stream: !!opts.stream });
  if (!opts.stream) {
    const j = await res.json().catch(() => null);
    if (!j || !j.choices || !j.choices[0]) {
      const err = new Error(`[${provider.name}] 响应格式异常（无 choices）`);
      err.status = 502; throw err;
    }
    const text = j.choices[0].message && j.choices[0].message.content || '';
    return {
      text: String(text).trim(),
      usage: j.usage ? { in: j.usage.prompt_tokens, out: j.usage.completion_tokens } : null,
    };
  }
  // stream
  return (async function* () {
    let text = '';
    for await (const ev of readSSE(res)) {
      const d = jsonDeltaOpenAI(ev);
      if (d) { text += d; yield { kind: 'text', text: d }; }
      if (ev.choices && ev.choices[0] && ev.choices[0].finish_reason) break;
    }
    yield { kind: 'done', usage: null, text: text.trim() };
  })();
}

// ============================================================ Gemini

function geminiMessages(messages) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: '(空)' }] });
  return { sys, contents };
}

async function geminiChat(provider, model, messages, opts) {
  model = trimModel(model || provider.defaultModel);
  if (!model) { const e = new Error(`[${provider.name}] 未配置模型 ID`); e.status = 400; throw e; }
  const base = String(provider.baseURL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const { sys, contents } = geminiMessages(messages);
  const body = {
    contents,
    generationConfig: {
      temperature: typeof opts.temperature === 'number' ? opts.temperature : undefined,
      maxOutputTokens: opts.maxTokens || undefined,
    },
  };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const key = util.normalizeKey(provider.apiKey);
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-goog-api-key'] = key;
  const isDefaultHost = /generativelanguage\.googleapis\.com/.test(base);
  const qKey = isDefaultHost && key ? `&key=${encodeURIComponent(key)}` : '';
  const url = opts.stream
    ? `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse${qKey ? '&' + qKey.slice(1) : ''}`
    : `${base}/models/${encodeURIComponent(model)}:generateContent${qKey ? '?' + qKey.slice(1) : ''}`;

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    if (e.name === 'AbortError') { const er = new Error('请求已取消'); er.cancelled = true; throw er; }
    const er = new Error(`[${provider.name}] 网络错误（${e.message}）`);
    er.status = 0; throw er;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = httpError(res, txt, provider.name);
    enrichAuthError(err, provider);
    throw err;
  }
  const partsOf = (j) => (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [])
    .map((p) => p.text || '').join('');

  if (!opts.stream) {
    const j = await res.json().catch(() => null);
    if (!j) { const e = new Error(`[${provider.name}] 响应解析失败`); e.status = 502; throw e; }
    return { text: partsOf(j).trim(), usage: j.usageMetadata ? { in: j.usageMetadata.promptTokenCount, out: j.usageMetadata.candidatesTokenCount } : null };
  }
  return (async function* () {
    let text = '';
    for await (const ev of readSSE(res)) {
      const d = partsOf(ev);
      if (d) { text += d; yield { kind: 'text', text: d }; }
      if (ev.usageMetadata) yield { kind: 'usage', usage: { in: ev.usageMetadata.promptTokenCount, out: ev.usageMetadata.candidatesTokenCount } };
    }
    yield { kind: 'done', usage: null, text: text.trim() };
  })();
}

// ============================================================ Mock engine (offline demo)

function seededRand(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const MOCK_OPEN = [
  '夜色像一层未干的墨，从檐角缓缓淌下来',
  '风把远处的钟声切成碎片，撒进巷口',
  '她推开那扇门的时候，灯恰好灭了',
  '雨从凌晨开始下，一直没停',
  '信纸的边缘已经泛黄，字迹却还清晰',
  '有人站在雪里，望着灯火通明的窗口',
  '脚步声在走廊尽头消失了',
  '他把怀表按停，时间仿佛也随之凝固',
  '第一道晨光爬上窗台的时候，她终于做了决定',
  '迷雾散开了一角，露出石砌的高塔',
];
const MOCK_BODY = [
  '他下意识握紧了袖口里的东西，指节发白，呼吸却刻意放得平稳，仿佛稍一松懈就会被什么察觉。',
  '“你信么？”她忽然问，语气轻得像在试探一个秘密的重量。他张了张嘴，最终只是摇头。',
  '真相往往藏在最不起眼的细节里——一枚磨旧的纽扣、一句脱口而出的乡音，或是门缝下那道转瞬即逝的影子。',
  '远处传来断续的争执声，很快又被雨声吞没。他数着自己的心跳，一步，两步，三步。',
  '记忆像潮水般涌来，带着旧书页与铁锈的气味，那些以为早已遗忘的片段重新变得锋利。',
  '她冷笑了一声，指尖轻轻叩着桌面，节奏却泄露了内心的动摇。',
  '答案并不在眼前，而在他们都不愿提起的那一夜。',
  '他忽然明白，这场看似偶然的相遇，早在很久以前就被人精心摆上了棋盘。',
  '风铃响了三下。按老人们的说法，那是有人在门外等着赴约。',
  '真相或许残酷，可比起谎言织成的安宁，她宁愿选择清醒。',
];
const MOCK_CLOSE = [
  '而真正的风暴，此刻才刚刚抵达港口的边缘。',
  '那一夜之后，所有人都默契地不再提起那扇门。',
  '他抬头望向窗外，天边压着一道不祥的紫云。',
  '故事在这里拐了一个弯，谁也没有料到。',
  '她将信折好，收进贴身的口袋，走向灯火深处。',
];

function mockProse({ seedText = '', names = [], length = 600, title = '' }) {
  const rnd = seededRand(seedText + length);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const nameA = names && names.length ? names[Math.floor(rnd() * names.length)] : '她';
  const nameB = names && names.length > 1 ? names[(Math.floor(rnd() * (names.length - 1)) + 1) % names.length] : '他';
  const paras = [];
  if (title) paras.push('【模拟正文 · 示意片段】' + title);
  let budget = Math.max(120, length);
  let sentinel = 0;
  while (budget > 90 && sentinel < 40) {
    sentinel++;
    const kind = rnd();
    let p;
    if (kind < 0.4) p = pick(MOCK_OPEN) + '。' + pick(MOCK_BODY);
    else if (kind < 0.8) p = pick(MOCK_BODY) + ' ' + nameB + '没有回答，只是把目光投向更远处。';
    else p = pick(MOCK_BODY) + ' ' + nameA + '沉默片刻，声音低了下去：“如果……当初换一种选择呢？”';
    if (kind > 0.85) p += pick(MOCK_CLOSE);
    paras.push(p.replace(/^./, (c) => c));
    budget -= util.charCount(p);
  }
  if (budget > 60) paras.push(pick(MOCK_BODY) + '（段落长度由目标字数自动分配，此处为模拟示意。）');
  const out = paras.join('\n\n');
  return '【本段为离线“模拟引擎”生成的演示文案，非真实 AI 成品。接入任意真实模型（OpenAI/DeepSeek/Qwen/GLM/Gemini/Grok…）后将替换为正式创作。】\n\n' + out + '\n\n【模拟引擎·段落完】';
}

async function mockChat(provider, model, messages, opts) {
  const spec = opts.mock || {};
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  const allText = (sys + '\n' + user).slice(0, 3000);
  const target = spec.length || (opts.maxTokens || 2000) * 2;
  let text;
  if (spec.shape === 'json') {
    text = JSON.stringify(spec.jsonExample ?? { mock: true, note: '该动作需要模型生成结构化结果，模拟引擎按空模板给出。' }, null, 2);
    if (!spec.jsonExample) text = JSON.stringify({ note: '离线模拟引擎：请接入真实模型获取该动作的结果。' }, null, 2);
  } else {
    text = mockProse({
      seedText: allText,
      names: spec.names || [],
      length: typeof target === 'number' ? Math.min(target, 12000) : 600,
      title: spec.title || '',
    });
  }
  const chunks = [];
  const step = 160;
  for (let i = 0; i < text.length; i += step) chunks.push(text.slice(i, i + step));
  if (!opts.stream) {
    await new Promise((r) => setTimeout(r, 40));
    return { text: text.trim(), usage: null };
  }
  return (async function* () {
    for (const c of chunks) {
      if (opts.signal && opts.signal.aborted) {
        const e = new Error('已取消'); e.cancelled = true; throw e;
      }
      yield { kind: 'text', text: c };
      await new Promise((r) => setTimeout(r, 2));
    }
    yield { kind: 'done', usage: null, text: text.trim() };
  })();
}

// ============================================================ gateway

function buildSystemMessages(provider, messages) {
  return messages;
}

async function chat(provider, model, messages, opts = {}) {
  if (!provider) { const e = new Error('未选择模型厂商'); e.status = 400; throw e; }
  if (!Array.isArray(messages) || !messages.length) { const e = new Error('消息不能为空'); e.status = 400; throw e; }
  const kind = provider.kind || 'openai';
  const fn = kind === 'gemini' ? geminiChat : kind === 'mock' ? mockChat : openaiChat;
  const cleaned = messages.map((m) => ({ role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  const res = await fn(provider, model, buildSystemMessages(provider, cleaned), {
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    stream: !!opts.stream,
    signal: opts.signal,
    mock: opts.mock || {},
  });
  if (!opts.stream) return res;
  const final = { text: '', usage: null };
  return {
    [Symbol.asyncIterator]() {
      return (async function* () {
        for await (const ev of res) {
          if (ev.kind === 'text') { final.text += ev.text; yield ev; }
          else if (ev.kind === 'usage') final.usage = ev.usage;
          else if (ev.kind === 'done') { final.usage = final.usage || ev.usage; yield { kind: 'done', text: final.text, usage: final.usage }; }
        }
      })();
    },
    get final() { return final; },
  };
}

/** Quick connectivity test. */
async function testProvider(provider, model) {
  const t0 = Date.now();
  const modelId = trimModel(model || provider.defaultModel || (provider.models || []).map((m) => m.id).find(Boolean) || '');
  if (!modelId && provider.kind !== 'mock') {
    return { ok: false, ms: 0, error: '未配置模型：请在该厂商下填写「默认模型」，或添加至少一个非空的「模型 ID」后再测试' };
  }
  if (provider.kind !== 'mock' && !String(provider.apiKey || '').trim() && provider.kind !== 'ollama' && !/localhost|127\.0\.0\.1/.test(provider.baseURL || '')) {
    return { ok: false, ms: 0, error: '未填写 API Key（可在下方输入后重试；本地 Ollama/局域网端点可不填）' };
  }
  try {
    const r = await chat(provider, modelId,
      [{ role: 'user', content: '你好，请只回复：连接成功。' }],
      { temperature: 0, maxTokens: 32 });
    return { ok: true, ms: Date.now() - t0, reply: (r.text || '').slice(0, 60), usage: r.usage };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message };
  }
}

/** Fetch model list for openai-kind (GET /models) or gemini. */
async function listProviderModels(provider) {
  if (provider.kind === 'mock') return (provider.models || []).map((m) => ({ id: m.id, label: m.name || m.id }));
  if (provider.kind === 'gemini') {
    const base = String(provider.baseURL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const key = util.normalizeKey(provider.apiKey);
    const headers = {};
    if (key) headers['x-goog-api-key'] = key;
    const isDefault = /generativelanguage\.googleapis\.com/.test(base);
    const q = isDefault && key ? '?key=' + encodeURIComponent(key) : '';
    const res = await fetch(base + '/models' + q, { headers });
    if (!res.ok) { const err = httpError(res, await res.text().catch(() => ''), provider.name); enrichAuthError(err, provider); throw err; }
    const j = await res.json();
    return (j.models || []).map((m) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName || String(m.name).replace(/^models\//, '') }))
      .filter((m) => m.id.includes('generateContent') === false);
  }
  const base = String(provider.baseURL || '').replace(/\/+$/, '');
  const key = util.normalizeKey(provider.apiKey);
  const headers = {};
  if (key) headers.Authorization = 'Bearer ' + key;
  const res = await fetch(base + '/models', { headers });
  if (!res.ok) { const err = httpError(res, await res.text().catch(() => ''), provider.name); enrichAuthError(err, provider); throw err; }
  const j = await res.json();
  return (j.data || []).map((m) => ({ id: m.id, label: m.id }));
}

module.exports = { chat, testProvider, listProviderModels };
