// genPanel.js — 全局「AI 生成面板」：流式生成、实时预览、应用/替换入库。
'use strict';
import { h, clear, toast, numFmt } from '../ui.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

const ENG_KEY = 'nf_engine_override';
function loadEngine() { try { return JSON.parse(localStorage.getItem(ENG_KEY)) || {}; } catch (e) { return {}; } }
function saveEngine(o) { localStorage.setItem(ENG_KEY, JSON.stringify(o)); }

const FIELDS_LABEL = {
  title: 'gen.field.title', genres: 'gen.field.genres', genre: 'gen.field.genre', logline: 'gen.field.logline', concept: 'gen.field.concept', oneLine: 'gen.field.oneLine',
  role: 'gen.field.role', name: 'gen.field.name', goal: 'gen.field.goal', beats: 'gen.field.beats', cast: 'gen.field.cast', pov: 'gen.field.pov', words: 'gen.field.words',
  vol: 'gen.field.vol', no: 'gen.field.no', summary: 'gen.field.summary', facts: 'gen.field.facts', threads: 'gen.field.threads', note: 'gen.field.note', notes: 'gen.field.notes',
  appearance: 'gen.field.appearance', personality: 'gen.field.personality', backstory: 'gen.field.backstory', arc: 'gen.field.arc', speechStyle: 'gen.field.speechStyle', secrets: 'gen.field.secrets',
  relations: 'gen.field.relations', glossary: 'gen.field.glossary', sections: 'gen.field.sections', rules: 'gen.field.rules', volumes: 'gen.field.volumes',
  items: 'gen.field.items', status: 'gen.field.status', quote: 'gen.field.quote', issue: 'gen.field.issue', fix: 'gen.field.fix', sev: 'gen.field.sev', kind: 'gen.field.kind', def: 'gen.field.def',
};

function shortVal(v) {
  const s = String(v ?? '');
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

function renderObjPreview(obj, idx) {
  const head = h('div', { class: 'fs-t' },
    h('b', {}, idx ? t('gen.entry', { i: idx }) : (obj.title || obj.name || obj.term || t('gen.result'))),
    h('span', { class: 'faint' }, t('gen.fields', { n: Object.keys(obj).length })));
  const rows = h('dl', { class: 'kv' });
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    let val;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      val = h('span', {}, v.slice(0, 6).map((x) => h('div', {},
        typeof x === 'object'
          ? `${x.name || x.title || x.term || x.state || ''}${x.state && x.name ? '：' + x.state : ''}${x.def ? '：' + shortVal(x.def) : ''}${x.desc ? ' — ' + shortVal(x.desc) : ''}`
          : shortVal(x))));
      if (v.length > 6) val.append(h('div', { class: 'faint' }, t('gen.itemsMore', { n: v.length })));
    } else if (typeof v === 'object') {
      continue;
    } else {
      val = h('span', {}, shortVal(v));
    }
    rows.append(h('dt', {}, t(FIELDS_LABEL[k] || k)), h('dd', {}, val));
  }
  return h('div', { class: 'fieldset' }, head, rows);
}

function renderJsonPreview(payload, root) {
  clear(root);
  const wrap = h('div', { class: 'gen-output' });
  if (Array.isArray(payload)) {
    if (!payload.length) wrap.append(h('div', { class: 'muted small' }, t('gen.emptyArr')));
    payload.forEach((item, i) => wrap.append(renderObjPreview(item, payload.length > 1 ? String(i + 1) : null)));
  } else if (payload && typeof payload === 'object') {
    wrap.append(renderObjPreview(payload));
  } else {
    wrap.append(h('pre', { class: 'txt' }, String(payload)));
  }
  root.append(wrap);
  root.append(h('details', { class: 'fold' },
    h('summary', {}, t('gen.rawJson')),
    h('div', { class: 'fold-body' }, h('pre', { class: 'txt mono', style: 'max-height:300px;overflow:auto' }, JSON.stringify(payload, null, 1)))));
}

/** 面板单例 */
const panelState = (() => {
  let root, body, foot, headEl, spinEl, titleEl;
  let current = null;
  let streamCtl = null;
  let engineEls = {};

  function ensureDom() {
    let el = document.getElementById('gen-root');
    if (el) { root = el; body = el.querySelector('.g-body'); foot = el.querySelector('.g-foot'); headEl = el.querySelector('.g-head'); return; }
    el = h('div', { id: 'gen-root' });
    document.body.appendChild(el);
    root = el;
    headEl = h('div', { class: 'g-head' });
    spinEl = h('div', { class: 'spin', style: 'display:none' });
    titleEl = h('b', {}, t('gen.title'));
    headEl.append(titleEl, spinEl,
      h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: () => close() }, t('gen.close')));
    body = h('div', { class: 'g-body' });
    foot = h('div', { class: 'g-foot' });
    el.append(headEl, body, foot);
  }

  function engineOptions() {
    const providers = (window.__NF_PROVIDERS || []).filter((p) => p.enabled !== false && Array.isArray(p.models));
    const list = [];
    for (const p of providers) for (const m of p.models) if (m && m.id) list.push({ value: `${p.id}::${m.id}`, label: `${p.name} · ${m.name || m.id}` });
    return list;
  }

  function buildEngineBar() {
    const ov = loadEngine();
    const sel = h('select', { class: 'gen-engine', style: 'flex:1;min-width:110px', title: t('gen.engineTitle') });
    sel.append(h('option', { value: '' }, t('gen.defaultEngine')));
    for (const o of engineOptions()) sel.append(h('option', { value: o.value }, o.label));
    const want = ov.providerId && ov.model ? `${ov.providerId}::${ov.model}` : '';
    if (want && [...sel.options].some((o) => o.value === want)) sel.value = want;
    const temp = h('input', { type: 'number', min: '0', max: '2', step: '0.1', class: 'gen-temp',
      value: ov.temperature != null ? String(ov.temperature) : '', style: 'width:70px' });
    temp.title = 'temperature 0~2，留空用全局默认';
    const onSave = () => {
      const [providerId, model] = String(sel.value).split('::');
      const tv = temp.value === '' ? null : Number(temp.value);
      const next = { providerId: providerId || '', model: model || '', temperature: tv };
      if (!providerId) delete next.providerId;
      saveEngine(next);
    };
    sel.onchange = onSave;
    temp.onchange = onSave;
    return h('div', { style: 'display:flex;gap:8px;align-items:center;flex:1;min-width:0' },
      sel, h('label', { class: 'small faint', style: 'white-space:nowrap' }, t('gen.temp')), temp);
  }

  function clearAll() { clear(body); clear(foot); }

  function open(cfg) {
    ensureDom();
    current = cfg;
    spinEl = root.querySelector('.g-head .spin');
    titleEl = root.querySelector('.g-head b');
    titleEl.textContent = cfg.title || t('gen.title');
    clearAll();
    const hint = h('div', { class: 'small muted', style: 'margin-bottom:8px' },
      t('gen.generating', { kind: cfg.kind === 'json' ? t('gen.structured') : t('gen.prose') }));
    const out = h('div', { class: 'gen-output txt', style: 'white-space:pre-wrap' });
    body.append(hint, out);
    foot.append(buildEngineBar(), h('button', { class: 'btn', onclick: () => stop() }, t('gen.stop')));
    root.classList.add('on');
    start(out);
    return { close: () => close() };
  }

  function start(outEl) {
    const cfg = current;
    if (!cfg) return;
    if (spinEl) spinEl.style.display = '';
    outEl.textContent = '';
    if (!outEl.isConnected) body.append(outEl);
    if (!outEl.parentElement.classList.contains('g-body')) {} // no-op safeguard
    streamCtl = api.genStream({
      projectId: cfg.projectId || null,
      action: cfg.action,
      args: cfg.args || {},
      providerId: loadEngine().providerId || undefined,
      model: loadEngine().model || undefined,
      temperature: loadEngine().temperature != null ? loadEngine().temperature : undefined,
    }, {
      onChunk: (t) => {
        outEl.textContent += t;
        outEl.scrollTop = outEl.scrollHeight;
      },
      onDone: (result) => {
        current.result = result;
        if (spinEl) spinEl.style.display = 'none';
        if (result.kind === 'json') {
          renderJsonPreview(result.payload, body);
        } else {
          const info = h('div', { class: 'small faint', style: 'margin:10px 0' },
            t('gen.charsGen', { n: numFmt(String(result.payload).replace(/\s/g, '').length), model: result.model ? ' · ' + result.model : '' }));
          body.append(info);
        }
        if (!cfg.noApply) renderApplyBar();
        else renderClientBar();
        toast(t('gen.done'), 'ok', 1600);
      },
      onError: (message) => {
        if (spinEl) spinEl.style.display = 'none';
        body.append(h('div', { class: 'help-note', style: 'border-color:rgba(229,83,75,.45);color:#f2a3a0' }, '⚠ ' + message));
        clear(foot);
        foot.append(buildEngineBar(), h('button', { class: 'btn primary', onclick: () => { clear(body); const hint = h('div', { class: 'small muted' }, t('gen.regenerating')); const o = h('div', { class: 'gen-output txt', style: 'white-space:pre-wrap' }); body.append(hint, o); start(o); } }, t('gen.regenerate')));
      },
    });
  }

  function stop() {
    if (streamCtl) { try { streamCtl.abort(); } catch (e) {} streamCtl = null; }
    if (spinEl) spinEl.style.display = 'none';
    clear(foot);
    foot.append(buildEngineBar(), h('button', { class: 'btn primary', onclick: () => { clear(body); const hint = h('div', { class: 'small muted' }, t('gen.regenerating')); const o = h('div', { class: 'gen-output txt', style: 'white-space:pre-wrap' }); body.append(hint, o); start(o); } }, t('gen.regenerate')));
  }

  function renderApplyBar() {
    clear(foot);
    const st = h('span', { class: 'small muted', id: 'gen-state' });
    const btn = h('button', { class: 'btn primary', onclick: () => doApply(btn, st) }, current.kind === 'json' ? t('gen.applyJson') : t('gen.applyProse'));
    foot.append(buildEngineBar(), h('div', { style: 'display:flex;gap:10px;align-items:center;margin-left:auto' }, st, btn));
  }

  function renderClientBar() {
    clear(foot);
    foot.append(buildEngineBar(), h('button', { class: 'btn primary', style: 'margin-left:auto', onclick: doClientApply }, t('gen.replace')));
  }

  async function doApply(btn, st) {
    const cfg = current;
    const res = cfg.result;
    if (!res || res.applied) return;
    btn.disabled = true; btn.textContent = t('gen.applying');
    try {
      const r = await api.apply(cfg.projectId, res.id, { rowId: cfg.rowId, charId: cfg.charId });
      res.applied = true;
      if (st) st.textContent = r.applied || '已应用';
      btn.textContent = t('gen.applied');
      toast(t('gen.applyDone', { label: r.applied || '完成' }), 'ok');
      if (cfg.onApplied) cfg.onApplied(r);
    } catch (e) {
      btn.disabled = false; btn.textContent = t('gen.retryApply');
      toast(t('gen.applyFail', { msg: e.message }), 'err', 6000);
    }
  }

  async function doClientApply() {
    const cfg = current;
    try {
      if (cfg.clientApply) await cfg.clientApply(cfg.result.payload, cfg);
      toast(t('gen.replaced'), 'ok');
    } catch (e) {
      toast(t('gen.replaceFail', { msg: e.message }), 'err', 5000);
    }
  }

  function close() {
    if (!root) return; // 从未打开过面板
    if (streamCtl) { try { streamCtl.abort(); } catch (e) {} streamCtl = null; }
    root.classList.remove('on');
    current = null;
  }

  return { open, close, setEngineOptions: (list) => { window.__NF_PROVIDERS = list; } };
})();

/** 便捷入口：openGen(project, {action,title,kind,args,rowId,charId,noApply,clientApply,onApplied}) */
export function openGen(project, cfg) {
  panelState.open(Object.assign({
    projectId: project ? project.id : null,
    kind: 'json', args: {}, rowId: null, charId: null,
    noApply: false, clientApply: null, onApplied: null,
  }, cfg));
}

export function setEngineProviders(list) { panelState.setEngineOptions(list); }
export function closeGenPanel() { panelState.close(); }
