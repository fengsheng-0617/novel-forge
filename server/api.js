'use strict';
// NovelForge HTTP API — settings / providers / projects / doc-ops / events.
// Round-2 additions: /gen /pipeline /export live in separate modules mounted here.

const util = require('./util');
const settingsMod = require('./settings');
const store = require('./store');
const eventsMod = require('./events');
const llm = require('./llm');
const actionsMod = require('./actions');
const pipeline = require('./pipeline');
const exportMod = require('./export');
const { APP } = require('./defaults');
const { buildDemo } = require('./seedDemo');

const send = (res, status, obj) => {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};
const ok = (res, obj) => send(res, 200, Object.assign({ ok: true }, obj));

/** 落盘前规范化：Key 清理首尾空格/引号；kind 收敛 */
function sanitizeSettings(s) {
  if (s && Array.isArray(s.providers)) {
    for (const p of s.providers) {
      if (p && typeof p === 'object') {
        p.apiKey = util.normalizeKey(p.apiKey);
        if (!['openai', 'gemini', 'mock'].includes(p.kind)) p.kind = 'openai';
      }
    }
  }
  return s;
}

function routeTable() {
  return [
    // ---------- health / meta ----------
    ['GET', '/api/health', async (ctx) => ok(ctx.res, { app: APP.nameEn, version: APP.version, ts: Date.now() })],
    ['GET', '/api/meta', async (ctx) => ok(ctx.res, { app: APP })],

    // ---------- settings ----------
    ['GET', '/api/settings', async (ctx) => send(ctx.res, 200, { ok: true, settings: settingsMod.get() })],
    ['PUT', '/api/settings', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      sanitizeSettings(body.settings || body);
      const s = settingsMod.update(body.settings || body);
      settingsMod.save();
      eventsMod.hub.emit('settings.changed', { ts: Date.now() });
      send(ctx.res, 200, { ok: true, settings: s });
    }],
    ['POST', '/api/settings/templates/reset', async (ctx) => {
      let builtin = [];
      try { builtin = require('./templates').TEMPLATES; } catch (e) { builtin = []; }
      const t = settingsMod.resetTemplates(builtin);
      settingsMod.save();
      ok(ctx.res, { templates: t });
    }],
    ['GET', '/api/logs', async (ctx) => {
      const u = new URL(ctx.req.url, 'http://x');
      ok(ctx.res, { logs: eventsMod.getLogs(Number(u.searchParams.get('after')) || 0) });
    }],

    // ---------- providers ----------
    ['POST', '/api/providers/test', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      let prov = null;
      // 方式A：直接提交界面正在编辑的完整厂商配置（推荐——避免"改了没保存就去测"的竞态）
      if (body.provider && body.provider.id) {
        prov = util.clone(body.provider);
        const submittedKey = util.normalizeKey(prov.apiKey);
        prov.enabled = prov.enabled !== false;
        if (!['openai', 'gemini', 'mock'].includes(prov.kind)) prov.kind = 'openai';
        prov.models = Array.isArray(prov.models) ? prov.models : [];
        const list = settingsMod.get().providers;
        const i = list.findIndex((p) => p.id === prov.id);
        const stored = i >= 0 ? list[i] : null;
        // 若提交的 Key 为空且库里已有 Key（旧页面/旧状态场景），沿用已存 Key，避免空值覆盖
        prov.apiKey = submittedKey || (stored ? util.normalizeKey(stored.apiKey) : '');
        if (i >= 0) list[i] = util.clone(prov);
        else list.push(util.clone(prov));
        settingsMod.save();
      } else {
        // 方式B：按已保存配置测试
        prov = settingsMod.getProvider(body.providerId);
      }
      if (!prov) return send(ctx.res, 404, { ok: false, error: '找不到该厂商，请先保存设置' });
      const r = await llm.testProvider(prov, body.model);
      send(ctx.res, r.ok ? 200 : 400, {
        ok: r.ok,
        detail: r,
        error: r.ok ? null : (r.error || '连接测试失败'),
      });
    }],
    ['GET', '/api/providers/:id/models', async (ctx) => {
      const prov = settingsMod.getProvider(ctx.params.id);
      if (!prov) return send(ctx.res, 404, { ok: false, error: '找不到该厂商' });
      try {
        const list = await llm.listProviderModels(prov);
        ok(ctx.res, { models: list });
      } catch (e) {
        send(ctx.res, 400, { ok: false, error: '获取失败：' + e.message });
      }
    }],

    // ---------- project library ----------
    ['GET', '/api/projects', async (ctx) => ok(ctx.res, { projects: store.listProjects() })],
    ['POST', '/api/projects', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      if (body.sample === 'demo') {
        const p = store.importProject(buildDemo());
        eventsMod.log('system', `已创建示例项目《${p.name}》`, p.id);
        return ok(ctx.res, { project: p });
      }
      const p = store.create({ name: body.name, desc: body.desc });
      eventsMod.log('system', `新建项目《${p.name}》`, p.id);
      ok(ctx.res, { project: p });
    }],
    ['GET', '/api/projects/:id', async (ctx) => {
      const p = store.loadProject(ctx.params.id);
      if (!p) return send(ctx.res, 404, { ok: false, error: '项目不存在' });
      ok(ctx.res, { project: p });
    }],
    ['DELETE', '/api/projects/:id', async (ctx) => {
      const p = store.loadProject(ctx.params.id);
      if (!p) return send(ctx.res, 404, { ok: false, error: '项目不存在' });
      store.remove(p.id);
      eventsMod.hub.emit('project.deleted', { projectId: p.id });
      ok(ctx.res, {});
    }],
    ['POST', '/api/projects/:id/duplicate', async (ctx) => {
      const p = store.duplicate(ctx.params.id);
      if (!p) return send(ctx.res, 404, { ok: false, error: '项目不存在' });
      eventsMod.log('system', `复制项目《${p.name}》`, p.id);
      ok(ctx.res, { project: p });
    }],

    // ---------- project mutations ----------
    ['PUT', '/api/projects/:id/meta', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      const p = requireProject(ctx.params.id);
      store.metaPatch(p, body.patch || {}, tabOf(ctx));
      ok(ctx.res, { project: p });
    }],
    ['PUT', '/api/projects/:id/doc', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      const p = requireProject(ctx.params.id);
      store.docSet(p, body.pointer, body.value, tabOf(ctx));
      ok(ctx.res, { project: p });
    }],
    ['POST', '/api/projects/:id/col', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      const p = requireProject(ctx.params.id);
      const arr = store.colOp(p, body.target, body.op, body, tabOf(ctx));
      ok(ctx.res, { arr });
    }],
    ['POST', '/api/projects/:id/undo', async (ctx) => {
      const p = requireProject(ctx.params.id);
      const snap = store.undo(p);
      ok(ctx.res, { undone: snap ? snap.label : null });
    }],

    // ---------- 无人值守流水线 ----------
    ['GET', '/api/pipeline/status', async (ctx) => ok(ctx.res, { pipeline: pipeline.status() })],
    ['POST', '/api/pipeline/start', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      ok(ctx.res, { pipeline: pipeline.start(body) });
    }],
    ['POST', '/api/pipeline/pause', async (ctx) => ok(ctx.res, { pipeline: pipeline.pause() })],
    ['POST', '/api/pipeline/resume', async (ctx) => ok(ctx.res, { pipeline: pipeline.resume() })],
    ['POST', '/api/pipeline/stop', async (ctx) => ok(ctx.res, { pipeline: pipeline.stop() })],

    // ---------- 导出 ----------
    ['GET', '/api/projects/:id/export', async (ctx) => {
      const p = requireProject(ctx.params.id);
      const u = new URL(ctx.req.url, 'http://x');
      const fmt = (u.searchParams.get('fmt') || 'md').toLowerCase();
      if (!exportMod.FORMATS[fmt] && fmt !== 'manuscript') return send(ctx.res, 400, { ok: false, error: '未知导出格式: ' + fmt });
      const out = exportMod.render(p, fmt === 'manuscript' ? 'manuscript' : fmt);
      const asciiName = out.filename.replace(/[^\x20-\x7e]/g, '_');
      ctx.res.writeHead(200, {
        'Content-Type': out.mime,
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
        'Content-Length': Buffer.byteLength(out.body, 'utf8'),
      });
      ctx.res.end(out.body);
    }],

    // ---------- 生成引擎 ----------
    ['GET', '/api/actions', async (ctx) => ok(ctx.res, { actions: actionsMod.listActions() })],
    ['POST', '/api/gen', async (ctx) => handleGen(ctx)],
    ['POST', '/api/apply', async (ctx) => {
      const body = await util.readJSON(ctx.req);
      if (!body.projectId || !body.resultId) return send(ctx.res, 400, { ok: false, error: '缺少 projectId/resultId' });
      const r = actionsMod.applyResult(body.projectId, body.resultId, body);
      ok(ctx.res, { applied: r.applied, project: r.project });
    }],

    // ---------- events ----------
    ['GET', '/api/events', async (ctx) => {
      eventsMod.hub.attach(ctx.res);
      ctx.req.on('close', () => {});
    }],
  ];
}

async function handleGen(ctx) {
  const { req, res } = ctx;
  const body = await util.readJSON(req);
  const controller = new AbortController();
  let settled = false;
  const cleanup = () => { if (!settled) { settled = true; controller.abort(); } };
  req.on('close', cleanup);
  res.on('close', cleanup);

  const genOpts = Object.assign({}, body, { signal: controller.signal });

  if (body.stream) {
    const w = new util.SSEWriter(res);
    w.init();
    const emitter = {
      onMeta: (m) => w.send('meta', m),
      onChunk: (t) => w.send('chunk', { t }),
      onDone: (entry) => w.send('done', { result: entry }),
      onError: (message) => { try { w.send('error', { message }); } catch (e) {} },
    };
    try {
      await actionsMod.generate(Object.assign({}, genOpts, { emitter }));
    } catch (e) {
      if (!e || !e.cancelled) {
        try { w.send('error', { message: e.message || '生成失败', code: e.status || 500 }); } catch (x) {}
      }
    }
    w.end();
    return;
  }

  const r = await actionsMod.generate(genOpts);
  ok(res, { result: r.result });
}

function requireProject(id) {
  const p = store.loadProject(id);
  if (!p) { const e = new Error('项目不存在'); e.status = 404; throw e; }
  return p;
}
function tabOf(ctx) {
  return ctx.req.headers['x-tab'] || ctx.req.headers['x-tab-id'] || null;
}

const compiled = [];

function build() {
  compiled.length = 0;
  for (const [m, pattern, fn] of routeTable()) {
    const segs = pattern.split('/').filter(Boolean);
    compiled.push({ m, segs, fn, paramIdx: [] });
  }
}

function match(method, pathname) {
  const segs = pathname.split('/').filter(Boolean);
  for (const r of compiled) {
    if (r.m !== method || r.segs.length !== segs.length) continue;
    const params = {};
    let hit = true;
    for (let i = 0; i < segs.length; i++) {
      const pat = r.segs[i];
      if (pat.startsWith(':')) params[pat.slice(1)] = decodeURIComponent(segs[i]);
      else if (pat !== segs[i]) { hit = false; break; }
    }
    if (hit) return { fn: r.fn, params };
  }
  return null;
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(u.pathname);
  if (!pathname.startsWith('/api/')) return send(res, 404, { ok: false, error: 'not api' });
  const hit = match(req.method, pathname);
  if (!hit) return send(res, 404, { ok: false, error: '接口不存在: ' + req.method + ' ' + pathname });
  const ctx = { req, res, params: hit.params };
  try {
    await hit.fn(ctx);
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (x) {} return; }
    const status = e.status || 500;
    if (status >= 500) console.error('[api]', req.method, pathname, e);
    send(res, status, { ok: false, error: e.message || '服务器错误' });
  }
}

module.exports = { handle, build };
