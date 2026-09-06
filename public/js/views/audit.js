// audit.js — ⑥ 审校 · 连续性 · 风格：记忆档案 / 伏笔清单 / 全文一致性审查 / 文风基准编辑
'use strict';
import { h, clear, toast, debounce, confirmDialog, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';

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
      h('h1', {}, '⑥ 审校 · 连续性 · 风格'),
      h('span', { class: 'sub' }, `记忆 ${entries.length} 条 · 报告 ${audits ? audits.items.length : 0} 条`)),
    h('div', { class: 'page-desc' }, '「连续性记忆」是长篇不崩的关键：每章归档后，后续写作会自动注入 已立事实 与 未回收伏笔。定期跑「全文一致性审查」抓逻辑/设定/文风问题。文风基准影响所有 AI 写作动作。'),
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
    box.append(h('h3', {}, '文风与写作基准', h('span', { class: 'hint' }, 'AI 每次写作都遵循以下要求；全部可编辑，改动即时保存')));
    const saveStyle = debounce(async () => {
      try {
        const r = await api.docSet(p.id, 'styleGuide', style);
        p.styleGuide = r.project.styleGuide;
      } catch (e) { toast('风格保存失败：' + e.message, 'err', 5000); }
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
    box.append(ta('pov', '视角规范', 2, '如：第三人称限知，主视角沈既明；个别章节切林照影'),
      ta('voice', '叙事声音', 3, '叙述的质感/距离/口吻…'),
      ta('prose', '行文风格', 3, '句子长短、意象偏好、节奏要求…'),
      ta('dialogue', '对话风格', 2, '对话的功能与语言习惯…'),
      ta('formatting', '格式要求', 2, '如：段落间空行；*时间·地点* 斜体行…'),
      listTa('must', '必须做到（每行一条）', '每章结尾留钩子…'),
      listTa('taboo', '禁忌（每行一条）', '不滥用网络流行语…'),
      ta('extra', '补充', 2, '其他要求…'));
    return box;
  }

  function archiveCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, '连续性记忆档案', h('span', { class: 'hint' }, '每章 摘要+事实+伏笔状态')));
    // 缺归档提示
    const missing = rows.filter((r) => r.ch && r.ch.content && !entries.some((e) => e.chapterNo === r.no));
    if (missing.length) {
      const note = h('div', { class: 'help-note' }, `${missing.length} 章已有正文但未归档：`);
      for (const r of missing) {
        note.append(h('button', { class: 'btn sm', style: 'margin-left:8px', onclick: () => openGen(p, {
          action: 'chapter_summary', title: `归档记忆：第${r.no}章`, kind: 'json',
          args: { rowId: r.id }, rowId: r.id, onApplied: afterAi,
        }) }, `归档 第${r.no}章`));
      }
      box.append(note);
    }
    if (!entries.length) {
      box.append(h('div', { class: 'empty small', style: 'padding:16px' }, '尚无记忆条目：写完章节后点「📌 归档记忆」，或直接在写作页启动无人值守连载（自动逐章归档）。'));
    }
    for (const e of entries.slice().reverse()) {
      box.append(h('details', { class: 'fold' },
        h('summary', {}, `${e.at || ('第' + e.chapterNo + '章')}${e.summary ? ' — ' + String(e.summary).slice(0, 70) : ''}`),
        h('div', { class: 'fold-body' },
          e.summary ? h('div', { class: 'small muted', style: 'margin-bottom:6px' }, e.summary) : null,
          (e.facts || []).length ? h('div', { class: 'small', style: 'margin-bottom:6px' },
            h('b', { class: 'faint' }, '已立事实：'), h('div', {}, (e.facts || []).map((f) => h('span', { class: 'tag', style: 'margin:2px' }, f)))) : null,
          (e.threads || []).length ? h('div', { class: 'small' },
            h('b', { class: 'faint' }, '线索状态：'), h('div', {}, (e.threads || []).map((t) => h('div', { style: 'margin:2px 0' }, h('span', { style: 'color:var(--accent2)' }, t.name), ' → ', t.state)))) : null,
          h('div', { class: 'btn-row', style: 'margin-top:8px' },
            h('button', { class: 'btn sm danger', onclick: async () => {
              const yes = await confirmDialog('删除记忆条目', `删除「${e.at || ''}」的记忆条目？（不影响正文）`, { okText: '删除', danger: true });
              if (!yes) return;
              const arr = entries.filter((x) => x !== e);
              try {
                const r = await api.docSet(p.id, 'continuity', { entries: arr });
                p.continuity = r.project.continuity;
                remount();
              } catch (err) { toast('删除失败：' + err.message, 'err', 4000); }
            } }, '删')))));
    }
    if (entries.length) {
      box.append(h('button', { class: 'btn sm ghost', style: 'margin-top:6px', onclick: async () => {
        const yes = await confirmDialog('清空全部记忆', '清空整个连续性档案？（不影响正文，可撤销）', { okText: '清空', danger: true });
        if (!yes) return;
        try {
          const r = await api.docSet(p.id, 'continuity', { entries: [] });
          p.continuity = r.project.continuity;
          remount();
        } catch (e) { toast('清空失败：' + e.message, 'err', 4000); }
      } }, '清空全部记忆'));
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
    box.append(h('h3', {}, '伏笔 / 线索总览', h('span', { class: 'hint' }, `${list.length} 条：未回收 ${open.length} · 已了结 ${closed.length}`)));
    if (!list.length) { box.append(h('div', { class: 'small faint' }, '（尚无线索记录——每章归档后自动汇总）')); return box; }
    for (const [name, v] of open) {
      box.append(h('div', { class: 'row-line' },
        h('span', { style: 'color:var(--accent2);font-weight:600;min-width:110px' }, name),
        h('span', { class: 'small muted', style: 'flex:1' }, v.state || '…'),
        v.at ? h('span', { class: 'small faint' }, v.at) : null));
    }
    if (closed.length) {
      box.append(h('details', { class: 'fold', style: 'margin-top:6px' },
        h('summary', {}, `已了结 ${closed.length} 条（展开查看）`),
        h('div', { class: 'fold-body' }, ...closed.map(([name, v]) => h('div', { class: 'row-line' },
          h('span', { class: 'small faint' }, name), h('span', { class: 'small', style: 'color:var(--green)' }, v.state))))));
    }
    return box;
  }

  function auditCard() {
    const box = h('div', { class: 'card' });
    const rangeN = h('select', { style: 'width:auto' },
      h('option', { value: 'all' }, '全部已写章节'),
      h('option', { value: '10' }, '最近 10 章'),
      h('option', { value: '5' }, '最近 5 章'),
      h('option', { value: '3' }, '最近 3 章'));
    box.append(h('h3', {}, '全文一致性审查', h('span', { class: 'hint' }, '逻辑/时间线/设定冲突/人物OOC/文风/语病错字')));
    box.append(h('div', { class: 'actions-bar' },
      rangeN,
      h('button', { class: 'btn primary', onclick: () => {
        const sel = rangeN.value;
        const written = rows.filter((r) => r.ch && r.ch.content).map((r) => r.no);
        const range = sel === 'all' || !written.length ? undefined : [Math.max(1, written[written.length - 1] - Number(sel) + 1), written[written.length - 1]];
        openGen(p, { action: 'audit_book', title: 'AI 全文一致性审查', kind: 'json',
          args: range ? { range } : { instruction: '审查全部已写章节' }, onApplied: afterAi });
      } }, '🤖 开始审查（结果不入正文，只生成报告）'),
      audits ? h('button', { class: 'btn sm ghost', onclick: async () => {
        try { await api.docSet(p.id, 'audits', []); p.audits = []; remount(); }
        catch (e) { toast('清空失败：' + e.message, 'err', 4000); }
      } }, '清空报告') : null));
    if (!audits) {
      box.append(h('div', { class: 'small faint', style: 'margin-top:6px' }, '尚无审查报告。'));
      return box;
    }
    const items = audits.items || [];
    box.append(h('div', { class: 'small faint', style: 'margin:6px 0' },
      `${items.length} 条意见${audits.at ? ' · ' + new Date(audits.at).toLocaleString('zh-CN', { hour12: false }) : ''}${audits.range ? ' · 范围：' + audits.range : ''}`));
    const sevColor = { 高: 'var(--red)', 中: 'var(--accent)', 低: 'var(--green)' };
    for (const [i, it] of items.entries()) {
      const d = h('div', { class: 'fieldset' },
        h('div', { class: 'fs-t' },
          h('b', { style: 'color:' + (sevColor[it.sev] || 'var(--text)') }, `[${it.sev || '?'}] 第${it.no || '?'}章 · ${it.kind || ''}`),
          h('span', {}, `#${i + 1}`)),
        it.quote ? h('div', { class: 'small', style: 'margin:2px 0' }, '原文：', h('i', {}, it.quote)) : null,
        it.issue ? h('div', { class: 'small' }, '问题：' + it.issue) : null,
        it.fix ? h('div', { class: 'small', style: 'color:var(--green)' }, '建议：' + it.fix) : null);
      box.append(d);
    }
    return box;
  }

  function twoCol(a, b) {
    return h('div', { class: 'two-col', style: 'align-items:start' }, a, b);
  }
}
