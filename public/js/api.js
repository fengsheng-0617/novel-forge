// api.js — NovelForge 前端 API 客户端（fetch + SSE）
'use strict';

export const TAB_ID = 'tab_' + Math.random().toString(36).slice(2, 10);

class ApiError extends Error {
  constructor(message, status, json) {
    super(message);
    this.status = status;
    this.json = json;
  }
}

async function j(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  opt.headers['X-Tab'] = TAB_ID;
  const res = await fetch(path, opt);
  let json = null;
  const text = await res.text().catch(() => '');
  try { json = JSON.parse(text); } catch (e) { /* non-json */ }
  if (!res.ok) {
    throw new ApiError((json && json.error) || ('请求失败 ' + res.status), res.status, json);
  }
  return json;
}

export const api = {
  get: (p) => j('GET', p),
  post: (p, body) => j('POST', p, body || {}),
  put: (p, body) => j('PUT', p, body),

  // ---- meta ----
  health: () => j('GET', '/api/health'),
  settings: () => j('GET', '/api/settings'),
  saveSettings: (settings) => j('PUT', '/api/settings', { settings }),
  resetTemplates: () => j('POST', '/api/settings/templates/reset', {}),
  logs: (after) => j('GET', '/api/logs' + (after ? '?after=' + after : '')),

  // ---- projects ----
  projects: () => j('GET', '/api/projects'),
  project: (id) => j('GET', '/api/projects/' + id),
  createProject: (name, desc, sample) => j('POST', '/api/projects', sample ? { name, desc, sample: 'demo' } : { name, desc }),
  duplicateProject: (id) => j('POST', '/api/projects/' + id + '/duplicate', {}),
  deleteProject: (id) => j('DELETE', '/api/projects/' + id),
  metaPatch: (id, patch) => j('PUT', '/api/projects/' + id + '/meta', { patch }),
  docSet: (id, pointer, value) => j('PUT', '/api/projects/' + id + '/doc', { pointer, value }),
  colOp: (id, target, op, body) => j('POST', '/api/projects/' + id + '/col', Object.assign({ target, op }, body)),
  undo: (id) => j('POST', '/api/projects/' + id + '/undo', {}),

  // ---- actions & gen ----
  actions: () => j('GET', '/api/actions'),
  /** 非流式生成 */
  gen: (body) => j('POST', '/api/gen', Object.assign({ stream: false }, body)),
  apply: (projectId, resultId, extra) => j('POST', '/api/apply', Object.assign({ projectId, resultId }, extra || {})),
  /**
   * 流式生成（POST + SSE 事件流）。
   * 返回 { abort } ；回调 onMeta/onChunk/onDone/onError。
   */
  genStream(body, { onMeta, onChunk, onDone, onError } = {}) {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/gen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tab': TAB_ID },
          body: JSON.stringify(Object.assign({ stream: true }, body)),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => '');
          let msg = txt;
          try { msg = JSON.parse(txt).error || txt; } catch (e) {}
          throw new ApiError('生成请求失败：' + msg, res.status);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder('utf-8');
        let buf = '';
        let curEvent = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, '');
            buf = buf.slice(idx + 1);
            if (line.startsWith('event: ')) {
              curEvent = { name: line.slice(7).trim(), data: '' };
            } else if (line.startsWith('data: ') && curEvent) {
              curEvent.data += line.slice(6);
              try {
                const payload = JSON.parse(curEvent.data);
                const e = curEvent.name;
                curEvent = null;
                if (e === 'meta' && onMeta) onMeta(payload);
                else if (e === 'chunk' && onChunk) onChunk(payload.t || '');
                else if (e === 'done' && onDone) onDone(payload.result);
                else if (e === 'error' && onError) { onError(payload.message); return; }
              } catch (err) { /* 不完整 JSON 行，继续累积 */ }
            }
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') { if (onError) onError('已停止'); }
        else if (onError) onError(e.message || '连接中断');
      }
    })();
    return { abort: () => controller.abort() };
  },

  // ---- pipeline ----
  pipelineStatus: () => j('GET', '/api/pipeline/status'),
  pipelineStart: (body) => j('POST', '/api/pipeline/start', body),
  pipelinePause: () => j('POST', '/api/pipeline/pause', {}),
  pipelineResume: () => j('POST', '/api/pipeline/resume', {}),
  pipelineStop: () => j('POST', '/api/pipeline/stop', {}),

  // ---- export ----
  exportUrl: (projectId, fmt) => '/api/projects/' + projectId + '/export?fmt=' + fmt,

  // ---- events (SSE 长连接) ----
  /** handlers: {log, pipeline, projectChanged, projectDeleted, settingsChanged} */
  connectEvents(handlers) {
    let closed = false;
    let retry = 0;
    const run = async () => {
      try {
        const res = await fetch('/api/events', { headers: { 'X-Tab': TAB_ID } });
        if (!res.ok || !res.body) throw new Error('status ' + res.status);
        retry = 0;
        const reader = res.body.getReader();
        const dec = new TextDecoder('utf-8');
        let buf = '';
        let ev = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, '');
            buf = buf.slice(idx + 1);
            if (line.startsWith('event: ')) ev = { name: line.slice(7).trim(), data: '' };
            else if (line.startsWith('data: ') && ev) {
              ev.data += line.slice(6);
              try {
                const payload = JSON.parse(ev.data);
                const name = ev.name;
                ev = null;
                if (name === 'log' && handlers.log) handlers.log(payload);
                else if (name === 'pipeline.status' && handlers.pipeline) handlers.pipeline(payload);
                else if (name === 'project.changed' && handlers.projectChanged) handlers.projectChanged(payload);
                else if (name === 'project.deleted' && handlers.projectDeleted) handlers.projectDeleted(payload);
                else if (name === 'settings.changed' && handlers.settingsChanged) handlers.settingsChanged(payload);
              } catch (err) { /* ignore */ }
            }
          }
        }
      } catch (e) { /* drop */ }
      if (!closed) {
        const wait = Math.min(8000, 600 * (2 ** retry++));
        setTimeout(run, wait);
      }
    };
    run();
    return { close: () => { closed = true; } };
  },
};

export function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
