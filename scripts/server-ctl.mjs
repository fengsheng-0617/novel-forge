// server-ctl.mjs —— NovelForge 独立版「服务控制」（后台启停/状态），被 novel-ctl.bat 调用
// 用法：node scripts/server-ctl.mjs <status|start|stop|restart> [port]
// 端口：参数 > 环境 NOVEL_PORT > data/settings.json server.port > 7390
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server', 'index.js');
const DATA = path.resolve(process.env.NOVEL_DATA || path.join(ROOT, 'data'));
const PID_FILE = path.join(DATA, 'server.pid');
const LOG_FILE = path.join(DATA, 'server.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...a) { console.log(...a); }

async function effectivePort(arg) {
  if (arg) return Number(arg);
  if (process.env.NOVEL_PORT) return Number(process.env.NOVEL_PORT);
  try {
    const s = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'));
    if (s.server && s.server.port) return Number(s.server.port);
  } catch { /* 默认 */ }
  return 7390;
}

async function healthOk(url, ms = 1200) {
  try {
    const res = await fetch(url + '/api/health', { signal: AbortSignal.timeout(ms) });
    const j = await res.json().catch(() => null);
    return !!(res.ok && j && j.ok);
  } catch { return false; }
}

/** Windows 上按端口找监听 PID；其它平台返回 null */
function findPidByPort(port) {
  if (process.platform !== 'win32') return null;
  try {
    const r = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    if (r.status !== 0) return null;
    for (const line of (r.stdout || '').split('\n')) {
      if (/LISTENING/i.test(line) && line.includes(':' + port + ' ')) {
        const m = line.trim().split(/\s+/);
        const pid = Number(m[m.length - 1]);
        if (Number.isInteger(pid) && pid > 0) return pid;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function killByPid(pid) {
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }); } catch { /* ignore */ }
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
  }
}

async function cmdStatus(port, url) {
  const ok = await healthOk(url);
  const pid = findPidByPort(port);
  log(`端口 ${port}：${ok ? '● 运行中（服务健康）' : '○ 已停止（无服务响应）'}${pid ? '，PID=' + pid : ''}`);
  if (ok) log(`  地址：${url}`);
  const pidNote = fs.existsSync(PID_FILE) ? '（存在）' : '（无）';
  const logNote = fs.existsSync(LOG_FILE) ? '（存在）' : '（暂无）';
  log(`  PID 文件：${PID_FILE}${pidNote}`);
  log(`  日志文件：${LOG_FILE}${logNote}`);
  return ok ? 0 : 3;
}

async function cmdStop(port, url) {
  const ok = await healthOk(url);
  if (!ok) {
    log(`服务未在运行（端口 ${port} 无响应）。`);
    // 兜底：清理残留 PID 文件
    try { if (fs.existsSync(PID_FILE)) { fs.unlinkSync(PID_FILE); log('已清理残留 PID 文件。'); } } catch { /* ignore */ }
    return 0;
  }
  let pid = null;
  try { pid = Number(fs.readFileSync(PID_FILE, 'utf8')) || null; } catch { /* ignore */ }
  const livePid = findPidByPort(port);
  const target = (pid && livePid && pid === livePid) ? pid : (livePid || pid);
  if (target) {
    log(`正在停止服务（PID=${target}）…`);
    killByPid(target);
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      if (!(await healthOk(url, 600))) break;
    }
  } else {
    log('未找到服务进程（端口监听 PID 缺失），无法停止。');
    return 2;
  }
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  const still = await healthOk(url, 800);
  log(still ? '✗ 服务仍在响应，停止失败（请手动结束进程）。' : '✓ 服务已停止。');
  return still ? 2 : 0;
}

async function cmdStart(port, url) {
  if (await healthOk(url)) {
    log(`服务已在运行：${url}`);
    return cmdStatus(port, url).then(() => 0);
  }
  fs.mkdirSync(DATA, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
  fs.writeSync(logFd, `\n===== ${stamp} 由 novel-ctl start 启动 =====\n`);
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      NOVEL_PORT: String(port),
      NOVEL_NO_OPEN: '1',
      ...(process.env.NOVEL_DATA ? { NOVEL_DATA: process.env.NOVEL_DATA } : {}),
    },
  });
  child.unref();
  try { fs.writeFileSync(PID_FILE, String(child.pid || ''), 'utf8'); } catch { /* ignore */ }
  log(`正在后台启动服务（PID=${child.pid || '?'}）…日志：${LOG_FILE}`);
  let up = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (child.exitCode !== null) break;
    if (await healthOk(url)) { up = true; break; }
  }
  if (up) {
    log(`✓ 服务已就绪：${url}`);
    log(`  提示：浏览器打开 ${url} 使用；停止请运行 novel-ctl.bat stop`);
    return 0;
  }
  log(`✗ 服务未在 ${15 * 1000}ms 内就绪；请查看日志：${LOG_FILE}`);
  return 2;
}

async function main() {
  const cmd = String(process.argv[2] || 'status').toLowerCase();
  const port = await effectivePort(process.argv[3]);
  const url = `http://127.0.0.1:${port}`;
  log(`NovelForge 服务控制 · ${url}\n`);
  let code = 0;
  if (cmd === 'start') code = await cmdStart(port, url);
  else if (cmd === 'stop') code = await cmdStop(port, url);
  else if (cmd === 'restart') {
    await cmdStop(port, url);
    log('');
    code = await cmdStart(port, url);
  } else {
    code = await cmdStatus(port, url);
  }
  process.exit(code);
}

main().catch((e) => { console.error('控制脚本异常：', e); process.exit(2); });
