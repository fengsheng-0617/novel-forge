// exportView.js — 导出（占位骨架；下一轮完善：成书/底稿/纯文本/JSON 一键下载）
'use strict';
import { h, clear, numFmt } from '../ui.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

const FMTS = [
  ['md', 'export.fmt.md', 'export.fmt.mdDesc'],
  ['manuscript', 'export.fmt.manuscript', 'export.fmt.manuscriptDesc'],
  ['txt', 'export.fmt.txt', 'export.fmt.txtDesc'],
  ['json', 'export.fmt.json', 'export.fmt.jsonDesc'],
];

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  const rows = (p.rows || []).filter((r) => r.ch && r.ch.content);
  const words = rows.reduce((a, r) => a + (r.ch.words || 0), 0);
  root.append(
    h('div', { class: 'page-title' }, h('h1', {}, t('export.title')), h('span', { class: 'sub' }, t('export.sub'))),
    h('div', { class: 'card' },
      h('h3', {}, t('export.book'), h('span', { class: 'hint' }, t('export.bookHint'))),
      h('div', { class: 'small muted' }, t('export.bookMeta', { n: rows.length, w: numFmt(words), title: p.idea && p.idea.title ? ' · 《' + p.idea.title + '》' : '' }))),
    ...FMTS.map(([fmt, nameK, descK]) =>
      h('div', { class: 'card', style: 'display:flex;gap:14px;align-items:center' },
        h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:600' }, t(nameK)), h('div', { class: 'small faint' }, t(descK))),
        h('a', { class: 'btn primary', href: api.exportUrl(p.id, fmt) }, t('export.download')))),
    h('div', { class: 'small faint' }, t('export.tip')));
}
