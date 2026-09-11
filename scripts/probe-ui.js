// probe-ui.js — 交互链路探针：点击各页 AI 按钮 → 生成面板 → 应用入库，捕获一切前端异常
// run: node scripts/probe-ui.js [baseUrl]
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
const PID = 'nf_demo_fogport';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let exceptions = [];
let consoleErrs = [];

async function httpJson(p, method = 'GET', body) {
  const res = await fetch(BASE + p, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch (e) { return { status: res.status, text }; }
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-probe-'));
  const port = 10000 + Math.floor(Math.random() * 400);
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
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push((d.exception && d.exception.description) || d.text + ' @' + (d.url || '') + ':' + d.lineNumber);
    } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(m.params.type)) {
      consoleErrs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  return {
    child, profile,
    send,
    async evalJs(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (r.result && r.result.exceptionDetails) { exceptions.push('eval: ' + r.result.exceptionDetails.text); return undefined; }
      return r.result && r.result.result ? r.result.result.value : undefined;
    },
    async nav(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 60; i++) { await sleep(250); if (await this.evalJs(`document.readyState==='complete' && !!document.querySelector('#view')`)) break; }
      await sleep(600);
    },
  };
}

async function runStep(label, fn) {
  const before = exceptions.length;
  try {
    await fn();
  } catch (e) {
    console.log('✗ 步骤异常', label, e.message);
  }
  const fresh = exceptions.slice(before);
  if (fresh.length) console.log(`✗ ${label} —— 页面抛错 ${fresh.length} 条:`);
  for (const f of fresh) console.log('    ' + f.slice(0, 240));
  return fresh.length === 0;
}

async function main() {
  const env = await launch();
  const E = (expr) => env.evalJs(expr);
  const mark = (m) => `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('${m}'))`;
  const steps = [];

  // 1 点子 → 头脑风暴 → 采用（应用 idea.candidates）
  await env.nav(`${BASE}/#/p/${PID}/idea`);
  steps.push(['点子页 AI 头脑风暴+应用', async () => {
    await E(`${mark('头脑风暴 · 点子池')}.click(); true`);
    await sleep(3500);
    const done = await E(`!!document.querySelector('#gen-apply')`);
    if (!done) { console.log('   面板未出现采用按钮（面板是否报错见上方）'); return; }
    await E(`document.querySelector('#gen-apply').click(); true`);
    await sleep(2200);
  }]);

  // 2 点子 → 深化当前创意 → 应用（覆盖 idea 字段）
  steps.push(['点子页 AI 深化+应用', async () => {
    await E(`${mark('深化当前创意')}.click(); true`);
    await sleep(3500);
    await E(`document.querySelector('#gen-apply')?.click(); true`);
    await sleep(2200);
  }]);

  // 3 人物 → 生成群像(整组替换) → 应用
  await env.nav(`${BASE}/#/p/${PID}/characters`);
  steps.push(['人物页 生成群像+应用', async () => {
    await E(`${mark('生成群像')}.click(); true`);
    await sleep(4000);
    await E(`document.querySelector('#gen-apply')?.click(); true`);
    await sleep(2200);
  }]);

  // 4 人物 → 校准一致性 → 应用
  steps.push(['人物页 一致性校准+应用', async () => {
    await E(`${mark('校准一致性')}.click(); true`);
    await sleep(4000);
    await E(`document.querySelector('#gen-apply')?.click(); true`);
    await sleep(2200);
  }]);

  // 5 设定 → 生成世界观 → 应用
  await env.nav(`${BASE}/#/p/${PID}/bible`);
  steps.push(['设定页 生成世界观+应用', async () => {
    await E(`${mark('生成世界观设定集')}.click(); true`);
    await sleep(4000);
    await E(`document.querySelector('#gen-apply')?.click(); true`);
    await sleep(2200);
  }]);

  // 6 大纲 → 精修本章（第一个 🤖 精修本章按钮）→ 应用
  await env.nav(`${BASE}/#/p/${PID}/outline`);
  steps.push(['大纲页 单章精修+应用', async () => {
    await E(`${mark('精修本章')}.click(); true`);
    await sleep(4000);
    await E(`document.querySelector('#gen-apply')?.click(); true`);
    await sleep(2200);
  }]);

  // 7 写作 → 撰写流式生成 → 采用
  const pr = await httpJson('/api/projects/' + PID);
  const r0 = pr.json.project.rows[0];
  await env.nav(`${BASE}/#/p/${PID}/writing/${r0.id}`);
  steps.push(['写作页 AI 撰写(流式)+采用', async () => {
    await E(`${mark('✍ 撰写')}.click(); true`);
    await sleep(9000);
    const ok = await E(`(document.querySelector('#gen-apply')?.textContent||'').includes('采用') || (document.querySelector('#gen-apply')?.textContent||'').includes('已应用')`);
    if (!ok) console.log('   采用按钮状态异常: ' + (await E(`document.querySelector('#gen-apply')?.textContent || '无'`)));
    else await E(`document.querySelector('#gen-apply').click(); true`);
    await sleep(2500);
  }]);

  // 8 设置页渲染 & 模板展开
  await env.nav(`${BASE}/#/settings`);
  steps.push(['设置页 展开模板详情', async () => {
    const d = await E(`(()=>{const ds=[...document.querySelectorAll('details.fold details.fold')]; if(ds[0]){ds[0].open=true; return ds.length;} return -1;})()`);
    await sleep(800);
    if (d <= 0) console.log('   未找到模板折叠组');
  }]);

  // 9 日志抽屉
  steps.push(['日志抽屉打开', async () => {
    await E(`[...document.querySelectorAll('button')].find(b=>b.textContent==='日志')?.click(); true`);
    await sleep(1200);
  }]);

  let okAll = true;
  for (const [name, fn] of steps) {
    const ok = await runStep(name, fn);
    if (!ok) okAll = false;
    else console.log('✓ ' + name);
  }
  if (consoleErrs.length) {
    console.log('\n页面 console.error 共 ' + consoleErrs.length + ' 条（前5）:');
    consoleErrs.slice(0, 5).forEach((e) => console.log('   ' + e));
    okAll = false;
  }
  if (exceptions.length) {
    console.log('\n未处理异常共 ' + exceptions.length + ' 条:');
    exceptions.slice(0, 10).forEach((e) => console.log('   ' + e.slice(0, 260)));
  } else {
    console.log('\n全程无未捕获 JS 异常');
  }

  // 复原示例项目
  try { await httpJson('/api/projects/' + PID, 'DELETE'); await httpJson('/api/projects', 'POST', { sample: 'demo' }); } catch (e) {}
  env.child.kill();
  try { fs.rmSync(env.profile, { recursive: true, force: true }); } catch (e) {}
  console.log('\n探针结束，okAll=' + okAll);
  process.exit(okAll ? 0 : 1);
}
main().catch((e) => { console.error('fatal:', e); process.exit(1); });
