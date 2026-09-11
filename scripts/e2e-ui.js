// e2e-ui.js — 真实浏览器内核交互验收：输入→自动保存→服务端持久化（Edge headless + CDP）
// run: node scripts/e2e-ui.js [baseUrl]
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
const PID = 'nf_demo_fogport';
let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + x : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(p, method = 'GET', body) {
  const res = await fetch(BASE + p, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch (e) { return { status: res.status, text }; }
}

// ---- 极简 CDP ----
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let seq = 0;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({
      send(method, params = {}) { return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); },
      close: () => { try { ws.close(); } catch (e) {} },
    });
    ws.onerror = reject;
  });
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-e2e-'));
  const port = 9800 + Math.floor(Math.random() * 200);
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((x) => x.type === 'page');
      if (page) { target = page; break; }
    } catch (e) {}
  }
  if (!target) { child.kill(); throw new Error('无法连接 Edge CDP'); }
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return { child, profile, cdp };
}

async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text + ' @' + r.result.exceptionDetails.lineNumber };
  return r.result && r.result.result ? r.result.result.value : undefined;
}
async function waitFor(cdp, expr, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await evalJs(cdp, expr);
    if (v && !v.error) return true;
    await sleep(200);
  }
  return false;
}
async function nav(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await waitFor(cdp, `document.readyState === 'complete'`, 12000);
  await sleep(700);
}

async function main() {
  let env = null;
  try {
    env = await launch();
    const { cdp } = env;
    console.log('== A 点子页：编辑书名并自动保存 ==');
    await nav(cdp, `${BASE}/#/p/${PID}/idea`);
    t('点子页渲染', await waitFor(cdp, `document.querySelector('#view h1')?.textContent.includes('灵感点子')`));
    let v = await evalJs(cdp, `(() => { const i = document.querySelector('#view input[type=text]'); i.focus(); i.value='《雾中来信·浏览器验证》'; i.dispatchEvent(new Event('input',{bubbles:true})); return i.value; })()`);
    t('赋值成功', v === '《雾中来信·浏览器验证》', JSON.stringify(v));
    await sleep(2800);
    let pr = await httpJson('/api/projects/' + PID);
    t('服务端 title 已更新', pr.json.project.idea.title === '《雾中来信·浏览器验证》', pr.json.project.idea.title);

    console.log('== B 点子页：编辑最大多行文本（故事背景） ==');
    v = await evalJs(cdp, `(() => { const tas=[...document.querySelectorAll('#view textarea')]; const ta=tas.sort((a,b)=>b.offsetHeight-a.offsetHeight)[0]; ta.focus(); ta.value += '\\n\\n浏览器端到端验证追加行'; ta.dispatchEvent(new Event('input',{bubbles:true})); return ta.value.length; })()`);
    t('多行编辑执行', typeof v === 'number' && v > 100, String(v));
    await sleep(2800);
    pr = await httpJson('/api/projects/' + PID);
    t('服务端 premise 已更新', pr.json.project.idea.premise.includes('浏览器端到端验证追加行'));

    console.log('== C 写作页：正文自动保存（colOp 深路径） ==');
    const rowId = pr.json.project.rows[0].id;
    await nav(cdp, `${BASE}/#/p/${PID}/writing/${rowId}`);
    t('写作页渲染并选中第1章', await waitFor(cdp, `location.hash.includes('/writing/') && [...document.querySelectorAll('#view textarea')].some(t=>t.offsetHeight>300)`));
    v = await evalJs(cdp, `(() => { const tas=[...document.querySelectorAll('#view textarea')].filter(t=>t.offsetHeight>300); const ta=tas[0]||[...document.querySelectorAll('#view textarea')].pop(); ta.focus(); ta.value += '\\n\\n【浏览器端到端：正文自动保存】'; ta.dispatchEvent(new Event('input',{bubbles:true})); return ta.value.length; })()`);
    t('正文编辑执行', typeof v === 'number' && v > 200, String(v));
    await sleep(3200);
    pr = await httpJson('/api/projects/' + PID);
    const r0 = pr.json.project.rows[0];
    t('正文自动保存落盘', (r0.ch.content || '').includes('【浏览器端到端：正文自动保存】'));
    t('字数已同步', (r0.ch.words || 0) > 100, 'words=' + r0.ch.words);

    console.log('== D 复原示例项目（重建为出厂状态） ==');
    await httpJson('/api/projects/' + PID, 'DELETE');
    const rc = await httpJson('/api/projects', 'POST', { name: '示例 · 雾港来信', desc: 'x', sample: 'demo' });
    t('示例已重建', rc.status === 200 && rc.json.project.id === PID && rc.json.project.rows.length === 10);
    pr = await httpJson('/api/projects/' + PID);
    t('重建后标题/正文纯净', pr.json.project.idea.title === '《雾港来信》' && !pr.json.project.rows[0].ch.content.includes('端到端'));

    console.log(`\n浏览器交互验收: ${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('fatal:', e.message);
    // 兜底复原
    try { await httpJson('/api/projects/' + PID, 'DELETE'); await httpJson('/api/projects', 'POST', { sample: 'demo' }); } catch (x) {}
    process.exit(1);
  } finally {
    if (env) { try { env.child.kill(); } catch (e) {} try { fs.rmSync(env.profile, { recursive: true, force: true }); } catch (e) {} }
  }
}
main();
