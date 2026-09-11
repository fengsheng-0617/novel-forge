// probe-min.js — 最小复现：点子页 头脑风暴 → 面板状态转储（含异常全文）
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
const PID = 'nf_demo_fogport';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exceptions = [];

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-probe-min-'));
  const port = 10500 + Math.floor(Math.random() * 200);
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const page = list.find((x) => x.type === 'page'); if (page) { target = page; break; } } catch (e) {}
  }
  if (!target) { child.kill(); throw new Error('no cdp'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push((d.exception ? d.exception.description : (d.text + ' @' + (d.url || 'inline') + ':' + d.lineNumber + ':' + d.columnNumber)));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  return { child, profile, send,
    async evalJs(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (r.result && r.result.exceptionDetails) {
        const d = r.result.exceptionDetails;
        exceptions.push('[eval] ' + (d.exception ? d.exception.description : d.text));
        return undefined;
      }
      return r.result && r.result.result ? r.result.result.value : undefined;
    },
    async nav(url) { await send('Page.navigate', { url }); await sleep(3000); },
  };
}

async function main() {
  const env = await launch();
  const E = (x) => env.evalJs(x);
  await env.nav(`${BASE}/#/p/${PID}/idea`);
  console.log('h1:', await E(`document.querySelector('#view h1')?.textContent`));
  // 列出全部按钮文本，定位头脑风暴按钮
  const btns = await E(`[...document.querySelectorAll('#view button')].map(b=>({t:b.textContent.trim().slice(0,30), hasClick: typeof b.onclick}))`);
  console.log('view 按钮:', JSON.stringify(btns));
  const clicked = await E(`(() => { const b=[...document.querySelectorAll('#view button')].find(b=>b.textContent.includes('头脑风暴')); if(!b) return 'NOT FOUND'; b.click(); return 'clicked:'+b.textContent.trim().slice(0,20); })()`);
  console.log('click:', clicked);
  await sleep(6000);
  console.log('gen-root on:', await E(`document.querySelector('#gen-root')?.classList.contains('on')`));
  console.log('gen title:', await E(`document.querySelector('#gen-root b')?.textContent`));
  console.log('apply btn:', await E(`document.querySelector('#gen-apply')?.textContent || 'NONE'`));
  console.log('foot html:', await E(`document.querySelector('#gen-root .g-foot')?.innerHTML?.slice(0,700) || 'NOFOOT'`));
  console.log('foot buttons:', await E(`[...document.querySelectorAll('#gen-root .g-foot button')].map(b=>b.textContent.trim().slice(0,30))`));
  console.log('state text:', await E(`document.querySelector('#gen-state')?.textContent || 'NOSTATE'`));
  console.log('error notes:', await E(`[...document.querySelectorAll('#gen-root .help-note')].map(n=>n.textContent.trim().slice(0,400))`));
  console.log('gen-root body 文本前500:', await E(`document.querySelector('#gen-root .g-body')?.textContent?.slice(0,500)`));
  console.log('exceptions:', exceptions.length ? exceptions.slice(0, 6) : '无');
  env.child.kill();
  try { fs.rmSync(env.profile, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
}
main().catch((e) => { console.error('fatal', e.message); process.exit(1); });
