'use strict';
// export.js — 导出：book.md（成书）、manuscript.md（全创作底稿）、book.txt（纯正文）、backup.json（项目备份）。
// 全部由服务端直接渲染项目文档，零依赖。

const util = require('./util');

function writtenRows(p) {
  return (p.rows || []).filter((r) => r.ch && r.ch.content);
}

function stats(p) {
  const rows = writtenRows(p);
  const words = rows.reduce((a, r) => a + util.charCount(r.ch.content), 0);
  return { chapters: rows.length, totalPlanned: (p.rows || []).length, words };
}

/** 故事路线（大纲思路）：底稿里保留"大纲是照哪条路线写的"这一环。 */
function routeLines(r) {
  if (!r) return [];
  return [
    ['路线名', r.name],
    ['大纲思路', r.approach],
    ['主线冲突', r.coreConflict],
    ['结局走向', r.ending],
    ['基调/视角', r.tone],
    ['贯穿伏笔', (r.hooks || []).join('；')],
    ['取舍与风险', r.risk],
    ['用户补充', r.custom],
  ].filter((x) => x[1]);
}

function volumeTitle(p, vol) {
  const v = (p.volumes || []).find((x) => x.vol === vol);
  return v && v.title ? v.title : `第${vol}卷`;
}

// ---------------- Markdown 成书 ----------------
function bookMarkdown(p) {
  const idea = p.idea || {};
  const L = [];
  L.push(`# ${idea.title || p.name || '未命名书稿'}`);
  L.push('');
  if (idea.logline) L.push(`> ${idea.logline}`);
  L.push('');
  const metaBits = [];
  if (idea.genres && idea.genres.length) metaBits.push('类型：' + idea.genres.join(' / '));
  if (idea.targetWords) metaBits.push(`计划 ${idea.targetWords} 字`);
  if (idea.pov) metaBits.push('视角：' + idea.pov);
  if (idea.tone) metaBits.push('基调：' + idea.tone);
  if (metaBits.length) { L.push('*' + metaBits.join('　·　') + '*'); L.push(''); }
  L.push('---');
  L.push('');
  let lastVol = -1;
  const rows = writtenRows(p);
  if (!rows.length) {
    L.push('（本书暂未写入任何章节正文。请在「章节写作」页生成，或在左侧发起无人值守连载。）');
  }
  for (const r of rows) {
    const ch = r.ch || {};
    if (r.vol !== lastVol) {
      lastVol = r.vol;
      L.push(`\n## ${volumeTitle(p, r.vol)}\n`);
    }
    L.push(`### 第${r.no}章　${r.title || ''}\n`);
    if (ch.summary && false) L.push(`> ${ch.summary}\n`); // 成书不带创作摘要
    L.push(String(ch.content || '').trim());
    L.push('');
  }
  const st = stats(p);
  L.push('\n---');
  L.push(`*导出自 ${'织文 NovelForge'} · ${new Date().toLocaleString('zh-CN', { hour12: false })} · ${st.chapters} 章 / ${st.words} 字（未创作 ${Math.max(0, st.totalPlanned - st.chapters)} 章）*`);
  return L.join('\n');
}

// ---------------- Markdown 全创作底稿 ----------------
function manuscriptMarkdown(p) {
  const L = [];
  const idea = p.idea || {};
  L.push(`# ${idea.title || p.name || '未命名书稿'} — 创作底稿`);
  L.push('> 本文件为「织文 NovelForge」工作底稿导出，包含全部创作数据。');
  L.push('');

  L.push('## 一、创意立项');
  L.push('');
  for (const [label, key] of [['书名', 'title'], ['类型', 'genres'], ['目标字数', 'targetWords'], ['一句话故事', 'logline'], ['故事背景', 'premise'], ['开篇钩子', 'hook'], ['核心冲突', 'conflict'], ['视角方案', 'pov'], ['基调', 'tone'], ['读者定位', 'audience']]) {
    const v = idea[key];
    if (v == null || v === '') continue;
    L.push(`- **${label}**：${Array.isArray(v) ? v.join(' / ') : v}`);
  }
  if (idea.candidates && idea.candidates.length) {
    L.push('');
    L.push('### 备用点子池');
    for (const c of idea.candidates) {
      L.push(`- 《${c.title || '?'}》【${c.genre || ''}】${c.logline ? ' — ' + c.logline : ''}${c.concept ? '\n  ' + c.concept : ''}`);
    }
  }
  const routes = p.routes || {};
  if (routes.selected || (routes.candidates && routes.candidates.length)) {
    L.push('');
    L.push('### 故事路线与大纲思路');
    L.push('');
    if (routes.selected) {
      const modeLabel = routes.selected.mode === 'custom' ? '用户自定义' : routes.selected.mode === 'delegate' ? '用户授权 AI 选定' : '用户选定';
      L.push(`**已选定路线（${modeLabel}）**`);
      for (const [label, v] of routeLines(routes.selected)) L.push(`- **${label}**：${v}`);
      const st = routes.selected.structure || [];
      if (st.length) {
        L.push('- **阶段路线**：');
        for (const s of st) L.push(`  ${st.indexOf(s) + 1}. ${s.phase || '阶段'}${s.span ? '（' + s.span + '）' : ''}：${s.goal || ''}${s.turn ? ' → ' + s.turn : ''}`);
      }
    } else {
      L.push('（尚未选定路线；大纲将以 AI 推荐路线为纲，可在生成前改选）');
    }
    const others = (routes.candidates || []).filter((c) => !routes.selected || c.name !== routes.selected.name);
    if (others.length) {
      L.push('');
      L.push('**候选路线**');
      for (const c of others) L.push(`- ${c.name || '未命名'}${c.recommended ? '〔AI 推荐〕' : ''}：${(c.approach || '').slice(0, 180)}`);
    }
  }
  L.push('');

  const bible = p.bible || {};
  if ((bible.summary) || (bible.rules && bible.rules.length) || (bible.sections && bible.sections.length) || (bible.glossary && bible.glossary.length)) {
    L.push('## 二、世界观设定');
    L.push('');
    if (bible.summary) L.push('**总述**：' + bible.summary + '\n');
    if (bible.rules && bible.rules.length) {
      L.push('**世界铁律**');
      for (const r of bible.rules) L.push(`${bible.rules.indexOf(r) + 1}. ${r}`);
      L.push('');
    }
    for (const s of bible.sections || []) {
      L.push(`### ${s.title}`);
      L.push(s.content);
      L.push('');
    }
    if (bible.glossary && bible.glossary.length) {
      L.push('**专有名词**');
      for (const g of bible.glossary) L.push(`- **${g.term}**：${g.def}`);
      L.push('');
    }
  }

  const style = p.styleGuide || {};
  if (Object.keys(style).some((k) => style[k])) {
    L.push('## 三、风格与铁律');
    L.push('');
    for (const [label, key] of [['视角规范', 'pov'], ['叙事声音', 'voice'], ['行文风格', 'prose'], ['对话风格', 'dialogue'], ['格式要求', 'formatting'], ['补充', 'extra']]) {
      if (style[key]) L.push(`- **${label}**：${style[key]}`);
    }
    if (style.taboo && style.taboo.length) L.push('- **禁忌**：' + style.taboo.map((x) => `~~${x}~~`).join('　'));
    if (style.must && style.must.length) L.push('- **必须**：' + style.must.map((x) => `**${x}**`).join('　'));
    L.push('');
  }

  L.push('## 四、人物卡');
  L.push('');
  for (const c of p.characters || []) {
    L.push(`### ${c.name} ${c.pov ? '〔主视角〕' : ''} · ${c.role || ''}`);
    L.push('');
    const pairs = [['定位', 'oneLine'], ['外貌', 'appearance'], ['性格', 'personality'], ['目标', 'goals'], ['背景', 'backstory'], ['弧线', 'arc'], ['说话风格', 'speechStyle'], ['秘密/弱点', 'secrets'], ['备注', 'notes']];
    for (const [label, key] of pairs) if (c[key]) L.push(`- **${label}**：${c[key]}`);
    if (c.aliases && c.aliases.length) L.push(`- **别称**：${c.aliases.join('、')}`);
    if (c.relations && c.relations.length) L.push('- **关系**：' + c.relations.map((r) => `${r.name}（${r.desc || ''}）`).join('；'));
    L.push('');
  }

  L.push('## 五、大纲（章节计划）');
  L.push('');
  let lastVol = -1;
  for (const r of p.rows || []) {
    if (r.vol !== lastVol) { lastVol = r.vol; L.push(`\n### ${volumeTitle(p, r.vol)}\n`); }
    const ch = r.ch || {};
    const state = ch.content ? (ch.status === 'revised' ? '已修订' : '已创作') : '未创作';
    L.push(`**第${r.no}章　${r.title}**　（${state}${ch.words ? ' · ' + ch.words + '字' : ''}${r.words ? ' · 目标' + r.words + '字' : ''}）`);
    if (r.goal) L.push(`- 目标：${r.goal}`);
    if (r.beats && r.beats.length) L.push(`- 节拍：${r.beats.map((b, i) => `${i + 1}.${b}`).join('；')}`);
    if (r.cast && r.cast.length) L.push(`- 登场：${r.cast.join('、')}`);
    if (r.note) L.push(`- 备注：${r.note}`);
    if (ch.summary) L.push(`- 已写摘要：${ch.summary}`);
    if (ch.content) {
      L.push('');
      L.push('<details><summary>正文预览（点击展开）</summary>');
      L.push('');
      L.push(util.truncate(String(ch.content), 2400, 260));
      L.push('');
      L.push('</details>');
    }
    L.push('');
  }

  const cont = p.continuity || { entries: [] };
  if (cont.entries && cont.entries.length) {
    L.push('## 六、连续性记忆档案');
    L.push('');
    for (const e of cont.entries) {
      L.push(`### ${e.at || ('第' + (e.chapterNo || '?') + '章')}`);
      if (e.summary) L.push(e.summary);
      if (e.facts && e.facts.length) L.push('\n已立事实：\n' + e.facts.map((f) => `- ${f}`).join('\n'));
      if (e.threads && e.threads.length) L.push('\n线索状态：\n' + e.threads.map((t) => `- ${t.name}：${t.state}`).join('\n'));
      L.push('');
    }
  }
  if (p.audits && Array.isArray(p.audits.items) && p.audits.items.length) {
    L.push('## 七、最近一次一致性审查');
    L.push('');
    L.push(`（${p.audits.at || ''}${p.audits.range ? ' · 范围' + p.audits.range : ''}）`);
    for (const it of p.audits.items) {
      L.push(`- [${it.sev}/${it.kind}] 第${it.no || '?'}章 ${it.quote ? '「' + it.quote + '」' : ''}：${it.issue} → ${it.fix}`);
    }
    L.push('');
  }
  const st = stats(p);
  L.push('---');
  L.push(`*${'织文 NovelForge'} 导出 · ${new Date().toLocaleString('zh-CN', { hour12: false })} · 已创作 ${st.chapters}/${st.totalPlanned} 章 · ${st.words} 字*`);
  return L.join('\n');
}

// ---------------- TXT 纯正文 ----------------
function bookTxt(p) {
  const idea = p.idea || {};
  const L = [`《${idea.title || p.name || '未命名书稿'}》`];
  let lastVol = -1;
  for (const r of writtenRows(p)) {
    if (r.vol !== lastVol) {
      lastVol = r.vol;
      L.push('');
      L.push(volumeTitle(p, r.vol));
      L.push('');
    }
    L.push('');
    L.push(`第${r.no}章 ${r.title || ''}`);
    L.push('');
    L.push(String((r.ch || {}).content || '').trim());
  }
  const st = stats(p);
  L.push('');
  L.push(`【全文完 · ${st.chapters} 章 / ${st.words} 字 · ${'织文 NovelForge'} 导出】`);
  return L.join('\n');
}

// ---------------- JSON 备份 ----------------
function backupJson(p) {
  return JSON.stringify(p, null, 2);
}

const FORMATS = {
  md: { ext: '.md', mime: 'text/markdown; charset=utf-8', render: (p) => bookMarkdown(p), label: '成书 Markdown' },
  manuscript: { ext: '.md', mime: 'text/markdown; charset=utf-8', render: (p) => manuscriptMarkdown(p), label: '创作底稿 Markdown' },
  txt: { ext: '.txt', mime: 'text/plain; charset=utf-8', render: (p) => bookTxt(p), label: '纯文本' },
  json: { ext: '.json', mime: 'application/json; charset=utf-8', render: (p) => backupJson(p), label: 'JSON 项目备份' },
};

function safeName(s) {
  return String(s || 'novel').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'novel';
}

function render(p, fmt) {
  const f = FORMATS[fmt] || FORMATS.md;
  const body = f.render(p);
  const st = stats(p);
  return {
    body,
    mime: f.mime,
    filename: `${safeName(p.idea && p.idea.title ? p.idea.title : p.name)}${f.ext}`,
    label: f.label,
    stats: st,
  };
}

module.exports = { render, FORMATS, stats, safeName };
