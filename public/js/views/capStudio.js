// capStudio.js — 能力工作台视图（non-novel）：content 仿写/续写/改写、doc 安理会决议、email 套磁邮件。
// 复用引擎 /api/gen + /api/apply + /workspace，在网页端完成 上传原文→分析→仿写/续写/改写/公文/邮件。
'use strict';
import { h, clear, toast, debounce, numFmt } from '../ui.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

const CAP_LABEL = {
  content: { name: '内容 · 仿写/续写/改写', tone: '上传原文后：分析 → 仿写/续写/改写' },
  doc: { name: '公文 · 安理会决议', tone: '给议题与背景，生成正式决议草案' },
  email: { name: '学术 · 套磁邮件', tone: '给对象与要点，撰写/润色得体邮件' },
};

const ACTIONS = {
  content: { analyze: 'content_analyze', imitate: 'content_imitate', continue: 'content_continue', rewrite: 'content_rewrite' },
  doc: { analyze: null, imitate: 'doc_resolution', continue: null, rewrite: null },
  email: { analyze: null, imitate: 'email_cold', continue: null, rewrite: null },
};

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  const cap = p.cap || 'content';
  const meta = CAP_LABEL[cap] || CAP_LABEL.content;
  const ws = p.workspace = p.workspace || { kind: cap, source: [{ id: 's_', title: '', text: '', lang: '', meta: {} }], params: {}, outputs: [] };
  if (!Array.isArray(ws.source) || !ws.source.length) ws.source = [{ id: 's_', title: '', text: '', lang: '', meta: {} }];
  if (!Array.isArray(ws.outputs)) ws.outputs = [];

  const saveDeb = debounce(flushWorkspace, 800);
  let buf = null;

  async function flushWorkspace() {
    if (!buf) return;
    const b = buf; buf = null;
    try {
      const r = await api.put('/api/projects/' + p.id + '/workspace', { source: b.source, params: b.params });
      if (ctx.onSelfChange) ctx.onSelfChange();
      // 同步回内存，保留 meta
      sql_merge(p.workspace, r.workspace);
    } catch (e) { toast(t('lib.toast.saveFail', { msg: e.message }), 'err', 5000); }
  }
  function sql_merge(ws2, from) {
    if (!from) return;
    if (from.source) ws2.source = from.source;
    if (from.params) ws2.params = from.params;
  }
  function remount() { clear(root); mount(root, p, ctx); }
  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }

  const actions = ACTIONS[cap] || ACTIONS.content;
  const src = ws.source[0];

  root.append(
    h('div', { class: 'page-title' },
      h('h1', {}, meta.name),
      h('span', { class: 'sub' }, `${p.name || ''}${p.language ? ' · ' + p.language : ''} · ${meta.tone}`)),
    h('div', { class: 'page-desc' }, t('capStudio.desc', { cap: cap })),
    h('div', { class: 'two-col', style: 'align-items:start' },
      sourceCol(),
      outputCol()));

  function sourceCol() {
    const titleIn = h('input', { type: 'text', value: src.title || '', placeholder: t('capStudio.titlePh'), style: 'width:100%;margin-bottom:6px',
      oninput: (e) => { src.title = e.target.value; buf = buf || { source: ws.source, params: ws.params }; saveDeb(); } });
    const langIn = h('input', { type: 'text', value: src.lang || '', placeholder: t('capStudio.langPh'), style: 'width:130px;margin-left:6px',
      oninput: (e) => { src.lang = e.target.value; buf = buf || { source: ws.source, params: ws.params }; saveDeb(); } });
    const ta = h('textarea', { rows: 14, style: 'width:100%;font-family:var(--font-serif);font-size:15px;line-height:1.9',
      placeholder: t('capStudio.sourcePh'), oninput: (e) => { src.text = e.target.value; buf = buf || { source: ws.source, params: ws.params }; saveDeb(); } }, src.text || '');
    if (src.text) ta.value = src.text;
    const hint = h('input', { type: 'text', id: 'cap-inst', placeholder: t('capStudio.instPh'), style: 'width:100%;margin-bottom:8px' });
    const btn = (label, action) => action ? h('button', { class: 'btn sm', onclick: () => {
      const inst = hint.value.trim();
      openGenFor(action, inst);
    } }, label) : null;
    return h('div', {}, h('div', { class: 'card' },
      h('h3', {}, t('capStudio.source'), h('span', { class: 'hint' }, `${(src.text || '').length} ${t('common.words')}`)),
      titleIn, langIn, ta,
      h('div', { class: 'btn-row', style: 'margin-top:8px' },
        actions.analyze ? btn(t('capStudio.analyze'), actions.analyze) : null,
        btn(t('capStudio.imitate'), actions.imitate),
        btn(t('capStudio.continue'), actions.continue),
        btn(t('capStudio.rewrite'), actions.rewrite)),
      hint));
  }

  function outputCol() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('capStudio.outputs'), h('span', { class: 'hint' }, `${ws.outputs.length} 条`)));
    if (!ws.outputs.length) box.append(h('div', { class: 'small faint', style: 'padding:8px 0' }, t('capStudio.outputsEmpty')));
    for (const [i, o] of [...ws.outputs].reverse().entries()) {
      box.append(h('details', { class: 'fold' },
        h('summary', {}, `${o.label || o.action || '输出'} · ${numFmt((o.content || '').length)} ${t('common.words')}`),
        h('div', { class: 'fold-body' },
          h('pre', { class: 'txt mono', style: 'white-space:pre-wrap;max-height:380px;overflow:auto' }, o.content || ''),
          h('div', { class: 'btn-row', style: 'margin-top:6px' },
            h('button', { class: 'btn sm', onclick: () => { copyText(o.content); } }, t('capStudio.copy')),
            h('button', { class: 'btn sm danger', onclick: async () => {
              ws.outputs.splice(ws.outputs.length - 1 - i, 1);
              buf = buf || { source: ws.source, params: ws.params }; await flushWorkspace(); remount();
            } }, t('common.delete'))))));
    }
    return box;
  }

  async function openGenFor(action, inst) {
    const g = await api.post('/api/gen', {
      projectId: p.id, action,
      args: { instruction: inst || undefined, words: 900 },
      stream: false,
    });
    if (g && g.result) {
      const ap = await api.post('/api/apply', { projectId: p.id, resultId: g.result.id });
      if (ctx.reloadProject) ctx.reloadProject(); else remount();
      if (!ap.applied) toast(t('capStudio.applyFail'), 'err', 5000);
    }
  }
}

function copyText(s) {
  try { navigator.clipboard.writeText(s || ''); toast('✓ 已复制', 'ok', 1200); }
  catch (e) { toast(t('capStudio.copyFail'), 'err', 3000); }
}
