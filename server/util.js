// NovelForge server shared helpers
'use strict';

const crypto = require('crypto');

const uid = (p = '') => p + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

const nowISO = () => new Date().toISOString();
const nowCN = () => new Date().toLocaleString('zh-CN', { hour12: false });

/** Count visible characters (Chinese-friendly word count). */
function charCount(s) {
  if (s == null) return 0;
  return String(s).replace(/\s/g, '').length;
}

/** Rough token estimate for CJK-heavy text: chars * 0.75 */
function estTokens(s) {
  if (!s) return 0;
  return Math.ceil(charCount(s) * 0.75);
}

function truncate(s, max, tail = 0) {
  if (!s) return s;
  if (s.length <= max) return s;
  if (tail > 0) return s.slice(0, max - tail) + '\n…[内容省略]…\n' + s.slice(-tail);
  return s.slice(0, max) + '\n…[内容省略]…';
}

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Deep-ish set value along dotted pointer (e.g. 'ch.content'). Creates missing objects. */
function setByPointer(obj, pointer, value) {
  const parts = String(pointer).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

function getByPointer(obj, pointer) {
  const parts = String(pointer).split('.');
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function safeJSON(text, fallback) {
  if (text == null) return fallback;
  let t = String(text).trim();
  // strip code fences
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  // find the first balanced [ or { block
  let start = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '[' || t[i] === '{') { start = i; break; }
  }
  if (start >= 0) {
    const open = t[start];
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { t = t.slice(start, i + 1); break; } }
    }
  }
  try { return JSON.parse(t); }
  catch (e) { return fallback; }
}

/** Take valid JSON path text: if object has only 'result'/'data'/'output' style wrappers, unwrap best effort. */
function jsonExtract(raw) {
  const parsed = safeJSON(raw, null);
  return parsed;
}

/** 清理粘贴 Key：去首尾空白、成对引号（含全角/中文引号） */
function normalizeKey(raw) {
  let k = String(raw == null ? '' : raw).trim();
  const qs = ['"', "'", '`', '“', '”', '‘', '’', '＇', '「', '」'];
  for (let guard = 0; guard < 4; guard++) {
    const c = k[0];
    if (c && qs.includes(c) && k.length > 1 && (k.endsWith(c) || (c === '“' && k.endsWith('”')) || (c === '‘' && k.endsWith('’')))) {
      k = k.slice(1, -1).trim();
    } else break;
  }
  return k;
}

/** 脱敏预览：前缀 + 长度，便于用户自查是否贴错 */
function keyMask(k) {
  const s = normalizeKey(k);
  if (!s) return '（空）';
  return `${s.slice(0, 6)}…（共 ${s.length} 位）`;
}

function stripMd(s) {
  return String(s || '')
    .replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '').trim();
}

async function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch (e) { const err = new Error('请求体不是合法 JSON'); err.status = 400; throw err; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.epub': 'application/epub+zip',
  '.zip': 'application/zip',
};

/** SSE-serialised writer bound to an http response */
class SSEWriter {
  constructor(res) { this.res = res; this.closed = false; }
  init() {
    const res = this.res;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':ok\n\n');
  }
  send(name, data) {
    if (this.closed) return;
    try {
      this.res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) { this.closed = true; }
  }
  comment() { if (!this.closed) { try { this.res.write(':ping\n\n'); } catch (e) { this.closed = true; } } }
  end() { if (!this.closed) { this.closed = true; try { this.res.end(); } catch (e) {} } }
  close() { this.closed = true; try { this.res.end(); } catch (e) {} }
}

/** Parse a length-hex-delimited SSE stream body (used by some Gemini/OpenAI variants). Not used but kept for safety. */
function parseNDJSON(lines) { return lines; }

module.exports = {
  uid, nowISO, nowCN, charCount, estTokens, truncate, clone,
  setByPointer, getByPointer, safeJSON, jsonExtract, stripMd, normalizeKey, keyMask,
  readBody, readJSON, MIME, SSEWriter,
};
