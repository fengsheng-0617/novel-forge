// exportView.js — 导出（占位骨架；下一轮完善：成书/底稿/纯文本/JSON 一键下载）
'use strict';
import { h, clear, numFmt } from '../ui.js';
import { api } from '../api.js';

const FMTS = [
  ['md', '成书 Markdown（book.md）', '书名/卷章分组 + 全部已写正文，适合导入写作软件'],
  ['manuscript', '创作底稿 Markdown（manuscript.md）', '创意/设定/人物卡/大纲/连续性档案/审查报告 全量底稿'],
  ['txt', '纯文本（book.txt）', '仅正文，适合手机阅读/上传'],
  ['json', 'JSON 项目备份（backup.json）', '项目完整数据，可长期存档'],
];

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  const rows = (p.rows || []).filter((r) => r.ch && r.ch.content);
  const words = rows.reduce((a, r) => a + (r.ch.words || 0), 0);
  root.append(
    h('div', { class: 'page-title' }, h('h1', {}, '导出成书'), h('span', { class: 'sub' }, '一键下载，全部在本地生成')),
    h('div', { class: 'card' },
      h('h3', {}, '当前书稿', h('span', { class: 'hint' }, '由服务端直接渲染')),
      h('div', { class: 'small muted' }, `已写 ${rows.length} 章 · ${numFmt(words)} 字${p.idea && p.idea.title ? ' · 《' + p.idea.title + '》' : ''}`)),
    ...FMTS.map(([fmt, name, desc]) =>
      h('div', { class: 'card', style: 'display:flex;gap:14px;align-items:center' },
        h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:600' }, name), h('div', { class: 'small faint' }, desc)),
        h('a', { class: 'btn primary', href: api.exportUrl(p.id, fmt) }, '⬇ 下载'))),
    h('div', { class: 'small faint' }, '提示：导出前建议先「刷新」页面确保最新；JSON 备份可与 复制项目 配合使用。'));
}
