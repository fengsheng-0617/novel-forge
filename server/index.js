'use strict';
// NovelForge — server entry. Zero npm dependencies: node server/index.js
// Env: NOVEL_PORT, NOVEL_HOST, NOVEL_DATA

const http = require('http');
const fs = require('fs');
const path = require('path');
const util = require('./util');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.NOVEL_DATA || path.join(ROOT, 'data'));

console.log(`┌─ ${'织文 NovelForge'} AI 小说创作工坊`);
console.log(`│  数据目录: ${DATA_DIR}`);

// ---- boot modules ----
const settingsMod = require('./settings');
const store = require('./store');
const eventsMod = require('./events');

fs.mkdirSync(DATA_DIR, { recursive: true });
const settings = settingsMod.init(DATA_DIR);
store.init(DATA_DIR);

// merge built-in templates (if templates module exists — added in later rounds it self-merges)
try {
  const { TEMPLATES } = require('./templates');
  const list = settingsMod.mergeTemplates(TEMPLATES);
  if (list.length) settingsMod.save();
  console.log(`│  提示词模板: ${list.length} 套（可在 设置→模板 中编辑/重置）`);
} catch (e) {
  console.log('│  提示词模板: 内置模块尚未加载（' + e.code + '），下一版本轮次自动补齐');
}

// demo seed on first run
try {
  if (settings.seedDemoOnFirstRun && store.listProjects().length === 0) {
    const { buildDemo } = require('./seedDemo');
    store.importProject(buildDemo());
    eventsMod.log('system', '已自动创建示例项目《示例 · 雾港来信》（可在设置中关闭自动示例）', 'nf_demo_fogport');
    console.log('│  已创建示例项目《示例 · 雾港来信》，可直接体验全流程');
  }
} catch (e) {
  console.error('│  示例项目创建失败:', e.message);
}

const api = require('./api');
api.build();

// ---- static file serving ----
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send404(res, '仅支持 GET');
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel.includes('..')) return send404(res, 'bad path');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send404(res, 'bad path');
  fs.readFile(file, (err, buf) => {
    if (err) return send404(res, '文件不存在: ' + pathname);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': util.MIME[ext] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}
function send404(res, msg) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(msg || '404');
}

// ---- http server ----
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(u.pathname);
  if (pathname.startsWith('/api/')) {
    api.handle(req, res).catch((e) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      } else { try { res.end(); } catch (x) {} }
    });
    return;
  }
  serveStatic(req, res, pathname);
});
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 60 * 1000;

const host = process.env.NOVEL_HOST || settings.server.bind || '127.0.0.1';
const port = Number(process.env.NOVEL_PORT || settings.server.port || 7390);

function openBrowser(url) {
  if (process.env.NOVEL_NO_OPEN === '1') return;
  try {
    if (process.platform === 'win32') require('child_process').spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') require('child_process').spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else require('child_process').spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { /* 忽略打开失败 */ }
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('');
    console.error('──────────────────────────────────────────────────');
    console.error('  启动失败：端口 ' + port + ' 已被占用。');
    console.error('  通常意味着已经有一个 NovelForge 实例在运行。');
    console.error('  解决办法：');
    console.error('    1) 直接打开  http://127.0.0.1:' + port + '  即可使用；');
    console.error('    2) 或先关闭旧实例再启动：');
    console.error('       netstat -ano | findstr :' + port);
    console.error('       taskkill /PID <上面查到的PID> /F');
    console.error('    3) 或换端口启动：set NOVEL_PORT=7400 后重新运行。');
    console.error('──────────────────────────────────────────────────');
  } else {
    console.error('服务器启动失败:', err && err.message || err);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`│  服务地址: http://${host}:${port}`);
  console.log('│  按 Ctrl+C 停止。');
  console.log('└──────────────────────────────');
  openBrowser(`http://127.0.0.1:${port}`);
});

// heartbeat for SSE keep-alive
setInterval(() => eventsMod.hub.ping(), 20000).unref();

function shutdown() {
  eventsMod.hub.closeAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { ROOT, PUBLIC, DATA_DIR, server };
