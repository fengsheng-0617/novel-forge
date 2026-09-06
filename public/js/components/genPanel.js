// genPanel.js — 全局「AI 生成面板」：流式生成、实时预览、应用/替换入库。
'use strict';
import { h, clear, toast, numFmt } from '../ui.js';
import { api } from '../api.js';

const ENG_KEY = 'nf_engine_override';
function loadEngine() { try { return JSON.parse(localStorage.getItem(ENG_KEY)) || {}; } catch (e) { return {}; } }
function saveEngine(o) { localStorage.setItem(ENG_KEY, JSON.stringify(o)); }

const FIELDS_LABEL = {
  title: '书名/标题', genres: '类型', genre: '类型', logline: '一句话', concept: '点子详述', oneLine: '定位',
  role: '角色定位', name: '姓名', goal: '目标', beats: '节拍', cast: '登场', pov: '视角', words: '字数',
  vol: '卷', no: '章', summary: '摘要', facts: '事实', threads: '线索', note: '备注', notes: '备注',
  appearance: '外貌', personality: '性格', backstory: '背景', arc: '弧线', speechStyle: '说话', secrets: '秘密',
  relations: '关系', glossary: '名词', sections: '设定分节', rules: '铁律', volumes: '卷规划',
  items: '审查条目', status: '状态', quote: '原文', issue: '问题', fix: '建议', sev: '严重度', kind: '类别', def: '定义',
};

function shortVal(v) {
  const s = String(v ?? '');
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

function renderObjPreview(obj, idx) {
  const head = h('div', { class: 'fs-t' },
    h('b', {}, idx ? '条目 ' + idx : (obj.title || obj.name || obj.term || '结果')),
    h('span', { class: 'faint' }, Object.keys(obj).length + ' 字段'));
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
      if (v.length > 6) val.append(h('div', { class: 'faint' }, `… 共 ${v.length} 项`));
    } else if (typeof v === 'object') {
      continue;
    } else {
      val = h('span', {}, shortVal(v));
    }
    rows.append(h('dt', {}, FIELDS_LABEL[k] || k), h('dd', {}, val));
  }
  return h('div', { class: 'fieldset' }, head, rows);
}

function renderJsonPreview(payload, root) {
  clear(root);
  const wrap = h('div', { class: 'gen-output' });
  if (Array.isArray(payload)) {
    if (!payload.length) wrap.append(h('div', { class: 'muted small' }, '（结果为空数组）'));
    payload.forEach((item, i) => wrap.append(renderObjPreview(item, payload.length > 1 ? String(i + 1) : null)));
  } else if (payload && typeof payload === 'object') {
    wrap.append(renderObjPreview(payload));
  } else {
    wrap.append(h('pre', { class: 'txt' }, String(payload)));
  }
  root.append(wrap);
  root.append(h('details', { class: 'fold' },
    h('summary', {}, '原始 JSON（查看/复制）'),
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
    titleEl = h('b', {}, 'AI 生成');
    headEl.append(titleEl, spinEl,
      h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: () => close() }, '✕ 关闭'));
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
    const sel = h('select', { class: 'gen-engine', style: 'flex:1;min-width:110px', title: '本次生成引擎（仅本次会话生效）' });
    sel.append(h('option', { value: '' }, '⚙ 全局默认引擎'));
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
      sel, h('label', { class: 'small faint', style: 'white-space:nowrap' }, '温度'), temp);
  }

  function clearAll() { clear(body); clear(foot); }

  function open(cfg) {
    ensureDom();
    current = cfg;
    spinEl = root.querySelector('.g-head .spin');
    titleEl = root.querySelector('.g-head b');
    titleEl.textContent = cfg.title || 'AI 生成';
    clearAll();
    const hint = h('div', { class: 'small muted', style: 'margin-bottom:8px' },
      '正在生成' + (cfg.kind === 'json' ? '结构化结果' : '正文') + '… 可随时停止');
    const out = h('div', { class: 'gen-output txt', style: 'white-space:pre-wrap' });
    body.append(hint, out);
    foot.append(buildEngineBar(), h('button', { class: 'btn', onclick: () => stop() }, '停止'));
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
            `已生成约 ${numFmt(String(result.payload).replace(/\s/g, '').length)} 字${result.model ? ' · ' + result.model : ''}`);
          body.append(info);
        }
        if (!cfg.noApply) renderApplyBar();
        else renderClientBar();
        toast('生成完成，请审阅', 'ok', 1600);
      },
      onError: (message) => {
        if (spinEl) spinEl.style.display = 'none';
        body.append(h('div', { class: 'help-note', style: 'border-color:rgba(229,83,75,.45);color:#f2a3a0' }, '⚠ ' + message));
        clear(foot);
        foot.append(buildEngineBar(), h('button', { class: 'btn primary', onclick: () => { clear(body); const hint = h('div', { class: 'small muted' }, '重新生成中…'); const o = h('div', { class: 'gen-output txt', style: 'white-space:pre-wrap' }); body.append(hint, o); start(o); } }, '↻ 重新生成'));
      },
    });
  }

  function stop() {
    if (streamCtl) { try { streamCtl.abort(); } catch (e) {} streamCtl = null; }
    if (spinEl) spinEl.style.display = 'none';
    clear(foot);
    foot.append(buildEngineBar(), h('button', { class: 'btn primary', onclick: () => { clear(body); const hint = h('div', { class: 'small muted' }, '重新生成中…'); const o = h('div', { class: 'gen-output txt', style: 'white-space:pre-wrap' }); body.append(hint, o); start(o); } }, '↻ 重新生成'));
  }

  function renderApplyBar() {
    clear(foot);
    const st = h('span', { class: 'small muted', id: 'gen-state' });
    const btn = h('button', { class: 'btn primary', onclick: () => doApply(btn, st) }, current.kind === 'json' ? '✓ 采用此结果（入库）' : '✓ 采用此正文（入库）');
    foot.append(buildEngineBar(), h('div', { style: 'display:flex;gap:10px;align-items:center;margin-left:auto' }, st, btn));
  }

  function renderClientBar() {
    clear(foot);
    foot.append(buildEngineBar(), h('button', { class: 'btn primary', style: 'margin-left:auto', onclick: doClientApply }, '✓ 就地替换'));
  }

  async function doApply(btn, st) {
    const cfg = current;
    const res = cfg.result;
    if (!res || res.applied) return;
    btn.disabled = true; btn.textContent = '应用中…';
    try {
      const r = await api.apply(cfg.projectId, res.id, { rowId: cfg.rowId, charId: cfg.charId });
      res.applied = true;
      if (st) st.textContent = r.applied || '已应用';
      btn.textContent = '✓ 已应用';
      toast('已应用：' + (r.applied || '完成'), 'ok');
      if (cfg.onApplied) cfg.onApplied(r);
    } catch (e) {
      btn.disabled = false; btn.textContent = '重试应用';
      toast('应用失败：' + e.message, 'err', 6000);
    }
  }

  async function doClientApply() {
    const cfg = current;
    try {
      if (cfg.clientApply) await cfg.clientApply(cfg.result.payload, cfg);
      toast('已替换', 'ok');
    } catch (e) {
      toast('替换失败：' + e.message, 'err', 5000);
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
