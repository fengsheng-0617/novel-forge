// audit.js — ⑥ 审校 · 连续性 · 风格：记忆档案 / 伏笔清单 / 全文一致性审查 / 文风基准编辑
'use strict';
import { h, clear, toast, debounce, confirmDialog, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';
import { t } from '../i18n.js';

const OPEN_RE = /回收|已了结|关闭|完结|解决|揭开/;

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  const entries = (p.continuity && p.continuity.entries) || [];
  const rows = p.rows || [];
  const audits = (p.audits && Array.isArray(p.audits.items)) ? p.audits : null;
  const style = p.styleGuide = p.styleGuide || {};

  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }
  function remount() { clear(root); mount(root, p, ctx); }

  root.append(
    h('div', { class: 'page-title' },
      h('h1', {}, t('audit.title')),
      h('span', { class: 'sub' }, t('audit.sub', { m: entries.length, r: audits ? audits.items.length : 0 }))),
    h('div', { class: 'page-desc' }, t('audit.desc')),
    twoCol(styleCard(), rightCol()));

  // ---------- 右列：记忆/伏笔/审查 ----------
  function rightCol() {
    return h('div', {},
      archiveCard(),
      threadsCard(),
      auditCard());
  }

  function styleCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('audit.style'), h('span', { class: 'hint' }, t('audit.styleHint'))));
    const saveStyle = debounce(async () => {
      try {
        const r = await api.docSet(p.id, 'styleGuide', style);
        p.styleGuide = r.project.styleGuide;
      } catch (e) { toast(t('audit.styleSaveFail', { msg: e.message }), 'err', 5000); }
    }, 800);
    const ta = (key, label, rows, ph) => h('label', { class: 'field' },
      h('span', {}, label),
      h('textarea', { rows, placeholder: ph, oninput: (e) => { style[key] = e.target.value; saveStyle(); } }, style[key] || ''));
    const listTa = (key, label, ph) => h('label', { class: 'field' },
      h('span', {}, label),
      h('textarea', { rows: Math.max(2, (style[key] || []).length), placeholder: ph, oninput: (e) => {
        style[key] = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
        saveStyle();
      } }, (style[key] || []).join('\n')));
    box.append(ta('pov', t('audit.stylePov'), 2, t('audit.stylePovPh')),
      ta('voice', t('audit.styleVoice'), 3, t('audit.styleVoicePh')),
      ta('prose', t('audit.styleProse'), 3, t('audit.styleProsePh')),
      ta('dialogue', t('audit.styleDialogue'), 2, t('audit.styleDialoguePh')),
      ta('formatting', t('audit.styleFormat'), 2, t('audit.styleFormatPh')),
      listTa('must', t('audit.styleMust'), t('audit.styleMustPh')),
      listTa('taboo', t('audit.styleTaboo'), t('audit.styleTabooPh')),
      ta('extra', t('audit.styleExtra'), 2, t('audit.styleExtraPh')));
    return box;
  }

  function archiveCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('audit.archive'), h('span', { class: 'hint' }, t('audit.archiveHint'))));
    // 缺归档提示
    const missing = rows.filter((r) => r.ch && r.ch.content && !entries.some((e) => e.chapterNo === r.no));
    if (missing.length) {
      const note = h('div', { class: 'help-note' }, t('audit.missingNote', { n: missing.length }));
      for (const r of missing) {
        note.append(h('button', { class: 'btn sm', style: 'margin-left:8px', onclick: () => openGen(p, {
          action: 'chapter_summary', title: `归档记忆：第${r.no}章`, kind: 'json',
          args: { rowId: r.id }, rowId: r.id, onApplied: afterAi,
        }) }, t('audit.archiveCh', { n: r.no })));
      }
      box.append(note);
    }
    if (!entries.length) {
      box.append(h('div', { class: 'empty small', style: 'padding:16px' }, t('audit.archiveEmpty')));
    }
    for (const e of entries.slice().reverse()) {
      box.append(h('details', { class: 'fold' },
        h('summary', {}, `${e.at || ('第' + e.chapterNo + '章')}${e.summary ? ' — ' + String(e.summary).slice(0, 70) : ''}`),
        h('div', { class: 'fold-body' },
          e.summary ? h('div', { class: 'small muted', style: 'margin-bottom:6px' }, e.summary) : null,
          (e.facts || []).length ? h('div', { class: 'small', style: 'margin-bottom:6px' },
            h('b', { class: 'faint' }, t('audit.facts')), h('div', {}, (e.facts || []).map((f) => h('span', { class: 'tag', style: 'margin:2px' }, f)))) : null,
          (e.threads || []).length ? h('div', { class: 'small' },
            h('b', { class: 'faint' }, t('audit.threads')), h('div', {}, (e.threads || []).map((t) => h('div', { style: 'margin:2px 0' }, h('span', { style: 'color:var(--accent2)' }, t.name), ' → ', t.state)))) : null,
          h('div', { class: 'btn-row', style: 'margin-top:8px' },
            h('button', { class: 'btn sm danger', onclick: async () => {
              const yes = await confirmDialog(t('audit.delEntry'), t('audit.delEntryMsg', { at: e.at || '' }), { okText: t('audit.del'), danger: true });
              if (!yes) return;
              const arr = entries.filter((x) => x !== e);
              try {
                const r = await api.docSet(p.id, 'continuity', { entries: arr });
                p.continuity = r.project.continuity;
                remount();
              } catch (err) { toast(t('audit.delFail', { msg: err.message }), 'err', 4000); }
            } }, t('audit.del'))))));
    }
    if (entries.length) {
      box.append(h('button', { class: 'btn sm ghost', style: 'margin-top:6px', onclick: async () => {
        const yes = await confirmDialog(t('audit.clearAll'), t('audit.clearAllMsg'), { okText: t('audit.clearAllOk'), danger: true });
        if (!yes) return;
        try {
          const r = await api.docSet(p.id, 'continuity', { entries: [] });
          p.continuity = r.project.continuity;
          remount();
        } catch (e) { toast(t('audit.clearFail', { msg: e.message }), 'err', 4000); }
      } }, t('audit.clearAll')));
    }
    return box;
  }

  function threadsCard() {
    const box = h('div', { class: 'card' });
    const agg = new Map(); // name -> {state, at}
    for (const e of entries) {
      for (const t of e.threads || []) {
        if (!t || !t.name) continue;
        if (!agg.has(t.name)) agg.set(t.name, { state: t.state || '', at: e.at || '' });
        else if (e.chapterNo >= 0) agg.get(t.name).state = t.state || agg.get(t.name).state;
      }
    }
    const list = [...agg.entries()];
    const open = list.filter(([, v]) => !OPEN_RE.test(v.state));
    const closed = list.filter(([, v]) => OPEN_RE.test(v.state));
    box.append(h('h3', {}, t('audit.threadsTitle'), h('span', { class: 'hint' }, t('audit.threadsHint', { n: list.length, o: open.length, c: closed.length }))));
    if (!list.length) { box.append(h('div', { class: 'small faint' }, t('audit.threadsEmpty'))); return box; }
    for (const [name, v] of open) {
      box.append(h('div', { class: 'row-line' },
        h('span', { style: 'color:var(--accent2);font-weight:600;min-width:110px' }, name),
        h('span', { class: 'small muted', style: 'flex:1' }, v.state || '…'),
        v.at ? h('span', { class: 'small faint' }, v.at) : null));
    }
    if (closed.length) {
      box.append(h('details', { class: 'fold', style: 'margin-top:6px' },
        h('summary', {}, t('audit.closedFold', { n: closed.length })),
        h('div', { class: 'fold-body' }, ...closed.map(([name, v]) => h('div', { class: 'row-line' },
          h('span', { class: 'small faint' }, name), h('span', { class: 'small', style: 'color:var(--green)' }, v.state))))));
    }
    return box;
  }

  function auditCard() {
    const box = h('div', { class: 'card' });
    const rangeN = h('select', { style: 'width:auto' },
      h('option', { value: 'all' }, t('audit.rangeAll')),
      h('option', { value: '10' }, t('audit.range10')),
      h('option', { value: '5' }, t('audit.range5')),
      h('option', { value: '3' }, t('audit.range3')));
    box.append(h('h3', {}, t('audit.title2'), h('span', { class: 'hint' }, t('audit.title2Hint'))));
    box.append(h('div', { class: 'actions-bar' },
      rangeN,
      h('button', { class: 'btn primary', onclick: () => {
        const sel = rangeN.value;
        const written = rows.filter((r) => r.ch && r.ch.content).map((r) => r.no);
        const range = sel === 'all' || !written.length ? undefined : [Math.max(1, written[written.length - 1] - Number(sel) + 1), written[written.length - 1]];
        openGen(p, { action: 'audit_book', title: t('audit.start'), kind: 'json',
          args: range ? { range } : { instruction: '审查全部已写章节' }, onApplied: afterAi });
      } }, t('audit.start')),
      audits ? h('button', { class: 'btn sm ghost', onclick: async () => {
        try { await api.docSet(p.id, 'audits', []); p.audits = []; remount(); }
        catch (e) { toast(t('audit.clearFail', { msg: e.message }), 'err', 4000); }
      } }, t('audit.clearReport')) : null));
    if (!audits) {
      box.append(h('div', { class: 'small faint', style: 'margin-top:6px' }, t('audit.noReport')));
      return box;
    }
    const items = audits.items || [];
    box.append(h('div', { class: 'small faint', style: 'margin:6px 0' },
      t('audit.reportMeta', {
        n: items.length,
        at: audits.at ? t('audit.reportAt', { at: new Date(audits.at).toLocaleString('zh-CN', { hour12: false }) }) : '',
        range: audits.range ? t('audit.reportRange', { range: audits.range }) : '',
      })));
    const sevColor = { 高: 'var(--red)', 中: 'var(--accent)', 低: 'var(--green)' };
    for (const [i, it] of items.entries()) {
      const d = h('div', { class: 'fieldset' },
        h('div', { class: 'fs-t' },
          h('b', { style: 'color:' + (sevColor[it.sev] || 'var(--text)') }, `[${it.sev || '?'}] 第${it.no || '?'}章 · ${it.kind || ''}`),
          h('span', {}, `#${i + 1}`)),
        it.quote ? h('div', { class: 'small', style: 'margin:2px 0' }, t('audit.quote'), h('i', {}, it.quote)) : null,
        it.issue ? h('div', { class: 'small' }, t('audit.issue') + it.issue) : null,
        it.fix ? h('div', { class: 'small', style: 'color:var(--green)' }, t('audit.fix') + it.fix) : null);
      box.append(d);
    }
    return box;
  }

  function twoCol(a, b) {
    return h('div', { class: 'two-col', style: 'align-items:start' }, a, b);
  }
}
