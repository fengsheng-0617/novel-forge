// probe-key.js — 复现“填了 Key 却提示未填写”（输入→自动保存→再输入→测试）时序验证
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:7390';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + x : '')); } };
async function httpJson(p, method = 'GET', body) {
  const res = await fetch(BASE + p, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch (e) { return { status: res.status, text }; }
}
const findInp = `(() => [...document.querySelectorAll('input[type=password]')].find(i => i.closest('.fieldset') && i.closest('.fieldset').textContent.includes('DeepSeek')))()`;
const setKey = (v) => `(() => { const i = ${findInp}; if (!i) return 'noinp'; i.focus(); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 'set:' + i.value; })()`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-key-'));
  const port = 11200 + Math.floor(Math.random() * 150);
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 40; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const pg = l.find((x) => x.type === 'page'); if (pg) { target = pg; break; } } catch (e) {} }
  if (!target) { child.kill(); throw new Error('no cdp'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pend = new Map(); let seq = 0;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  const E = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  try {
    // 确保初始为空
    let st = await httpJson('/api/settings');
    for (const p of st.json.settings.providers) if (p.id === 'deepseek') p.apiKey = '';
    await httpJson('/api/settings', 'PUT', { settings: st.json.settings });

    await send('Page.navigate', { url: BASE + '/#/settings' });
    await sleep(3500);
    t('找到 DeepSeek Key 输入框', (await E(`(() => { const i = ${findInp}; return i ? 'yes' : 'no'; })()`)) === 'yes');

    const KEY = 'sk-abcdef0123456789-DEMO';
    // 阶段1：先输入前半 → 等待超过防抖(700ms) 触发一次自动保存
    let r = await E(setKey(KEY.slice(0, 9)));
    await sleep(1500);
    // 阶段2：再补全 → 再等待一次保存
    r = await E(setKey(KEY));
    await sleep(1600);
    st = await httpJson('/api/settings');
    const savedKey = (st.json.settings.providers || []).find((p) => p.id === 'deepseek').apiKey || '';
    t('两段输入后服务端已存完整 Key（不再丢字段）', savedKey === KEY, JSON.stringify(savedKey));

    // 阶段3：点击该行测试连接
    const c = await E(`(() => { const b = document.getElementById('test-deepseek'); if (!b) return 'nobtn'; b.click(); return 'clicked'; })()`);
    t('已点击测试连接', c === 'clicked', String(c));
    await sleep(4000);
    const toastText = String(await E(`([...document.querySelectorAll('.toast')].map(x => x.textContent).join(' || '))`));
    console.log('    toast: ' + toastText.slice(0, 220));
    t('不再出现“未填写 API Key”', !toastText.includes('未填写 API Key'), toastText.slice(0, 120));
    t('给出网络/鉴权类实质反馈', /网络|无法连接|401|失败|成功/.test(toastText), toastText.slice(0, 120));
  } finally {
    const st = await httpJson('/api/settings');
    for (const p of st.json.settings.providers) if (p.id === 'deepseek') p.apiKey = '';
    await httpJson('/api/settings', 'PUT', { settings: st.json.settings });
    child.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nKey 场景验收: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('fatal:', e.message); process.exit(1); });
