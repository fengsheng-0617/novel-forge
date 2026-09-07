'use strict';
// context.js — 把项目数据组装成可注入模板的变量文本（含统一裁剪）。
// 每个变量是纯文本块；裁剪按调用方给定的顺序（先重要）与预算执行。

const util = require('./util');

// ---------------- 单项格式化 ----------------

function fmtIdea(p) {
  const i = p.idea || {};
  const parts = [];
  parts.push(`书名：${i.title || '（未定）'}`);
  if (i.genres && i.genres.length) parts.push(`类型：${i.genres.join('/')}`);
  if (i.targetWords) parts.push(`目标总字数：${i.targetWords} 字`);
  if (i.logline) parts.push(`一句话故事：${i.logline}`);
  if (i.premise) parts.push(`故事背景：${i.premise}`);
  if (i.hook) parts.push(`开篇钩子：${i.hook}`);
  if (i.conflict) parts.push(`核心冲突：${i.conflict}`);
  if (i.pov) parts.push(`视角方案：${i.pov}`);
  if (i.tone) parts.push(`基调：${i.tone}`);
  if (i.audience) parts.push(`读者定位：${i.audience}`);
  if (i.extra) parts.push(`补充：${i.extra}`);
  return parts.join('\n');
}

function fmtStyle(p) {
  const s = p.styleGuide || {};
  const parts = [];
  if (s.pov) parts.push('视角规范：' + s.pov);
  if (s.voice) parts.push('叙事声音：' + s.voice);
  if (s.prose) parts.push('行文风格：' + s.prose);
  if (s.dialogue) parts.push('对话风格：' + s.dialogue);
  if (s.taboo && s.taboo.length) parts.push('禁忌（不要做）：' + s.taboo.map((x) => '·' + x).join(' '));
  if (s.must && s.must.length) parts.push('必须做到：' + s.must.map((x) => '·' + x).join(' '));
  if (s.formatting) parts.push('格式要求：' + s.formatting);
  if (s.extra) parts.push('补充：' + s.extra);
  return parts.join('\n');
}

function fmtBible(p) {
  const b = p.bible || {};
  const parts = [];
  if (b.summary) parts.push('【世界观总述】\n' + b.summary);
  if (b.rules && b.rules.length) parts.push('【世界铁律】\n' + b.rules.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  for (const s of b.sections || []) {
    if (s.title && s.content) parts.push(`【${s.title}】\n${s.content}`);
  }
  if (b.glossary && b.glossary.length) {
    parts.push('【专有名词】\n' + b.glossary.map((g) => `${g.term}：${g.def}`).join('\n'));
  }
  return parts.join('\n\n');
}

/** 单个角色的紧凑卡（capChars 后强制截断）。 */
function fmtChar(c) {
  const rel = (c.relations || []).map((r) => `${r.name}（${r.desc || ''}）`).join('、');
  return [
    `【${c.name}】${c.role || ''}${c.pov ? '〔主视角〕' : ''}`,
    c.oneLine ? `定位：${c.oneLine}` : '',
    c.appearance ? `外貌：${c.appearance}` : '',
    c.personality ? `性格：${c.personality}` : '',
    c.goals ? `目标：${c.goals}` : '',
    c.backstory ? `背景：${c.backstory}` : '',
    c.arc ? `弧线：${c.arc}` : '',
    c.speechStyle ? `说话：${c.speechStyle}` : '',
    c.secrets ? `秘密/弱点：${c.secrets}` : '',
    rel ? `关系：${rel}` : '',
    c.notes ? `备注：${c.notes}` : '',
  ].filter(Boolean).join('\n');
}

function fmtChars(list, maxChars) {
  const out = [];
  let used = 0;
  for (const c of list || []) {
    const s = fmtChar(c) + '\n';
    if (maxChars && used + s.length > maxChars) {
      if (used + 200 < maxChars) out.push(s.slice(0, maxChars - used) + '\n…');
      break;
    }
    used += s.length;
    out.push(s);
  }
  if ((list || []).length > out.length) out.push(`…（共 ${list.length} 人，余下从略）`);
  return out.join('\n');
}

/** 简洁名单：名字（角色定位）— 用于大纲/视角校验。 */
function fmtCharNames(list) {
  return (list || []).map((c) => `${c.name}（${c.role || ''}${c.pov ? '·主视角' : ''}：${c.oneLine || ''}）`).join('\n');
}

function fmtRow(r) {
  const p = r || {};
  return [
    `第${p.no || '?'}章《${p.title || '（未命名）'}》（卷${p.vol || 1}，目标 ${p.words || 0} 字${p.pov ? '，视角 ' + p.pov : ''}）`,
    p.goal ? `目标：${p.goal}` : '',
    p.beats && p.beats.length ? `节拍：\n${p.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}` : '',
    p.cast && p.cast.length ? `登场：${p.cast.join('、')}` : '',
    p.note ? `备注：${p.note}` : '',
  ].filter(Boolean).join('\n');
}

function fmtRows(rows, from, to, maxChars) {
  const list = (rows || []).slice(from, to == null ? undefined : to);
  const out = [];
  let used = 0;
  for (const r of list) {
    const s = fmtRow(r) + '\n';
    if (maxChars && used + s.length > maxChars) {
      if (used + 260 < maxChars) out.push(s.slice(0, maxChars - used) + '\n…（大纲过长，其余从略）');
      break;
    }
    used += s.length;
    out.push(s);
  }
  return out.join('\n');
}

function fmtContinuity(p, tailN) {
  const entries = (p.continuity && p.continuity.entries) || [];
  const list = entries.slice(-(tailN || 2));
  if (!list.length) return '（尚无连续性档案）';
  const out = [];
  for (const e of list) {
    const lines = [`· ${e.at || '第?章'}：${e.summary || ''}`];
    if (e.facts && e.facts.length) lines.push('  已立事实：' + e.facts.map((f) => `〔${f}〕`).join(' '));
    if (e.threads && e.threads.length) lines.push('  线索状态：' + e.threads.map((t) => `${t.name}→${t.state}`).join('；'));
    out.push(lines.join('\n'));
  }
  return out.join('\n');
}

/** 全部未回收线索（供写作/审查提示避免遗忘）。 */
function openThreads(p) {
  const out = [];
  for (const e of (p.continuity && p.continuity.entries) || []) {
    for (const t of e.threads || []) {
      const st = String(t.state || '');
      if (!/回收|已了结|关闭|完结/.test(st)) out.push(t);
    }
  }
  return out;
}

function prevTextFor(p, idx, maxChars) {
  const rows = p.rows || [];
  // 向前找最近 2 个已写章节
  const prev = [];
  for (let i = idx - 1; i >= 0 && prev.length < 2; i--) {
    const r = rows[i];
    if (r.ch && r.ch.content && r.ch.status !== 'plan') prev.unshift(r);
  }
  const parts = [];
  let used = 0;
  for (const r of prev) {
    const head = `第${r.no}章《${r.title}》摘要：${r.ch.summary || '（无摘要）'}`;
    parts.push(head);
    used += head.length;
    const tail = util.truncate((r.ch.content || '').replace(/\n{2,}/g, '\n'), 600);
    const tailS = '\n该章末尾：\n' + tail;
    parts.push(used + tailS.length <= (maxChars || 2600) ? tailS : '');
  }
  return parts.filter(Boolean).join('\n\n');
}

// ---------------- 裁剪 ----------------

/**
 * 按顺序装入变量；预算字符不足时，较早（更重要）变量优先，超预算变量整体截断。
 * @param vars 原始文本变量 {key: text}
 * @param order 优先级顺序数组
 * @param budget 总字符预算
 * @param perPiece {key: max} 单项上限
 */
function trimVars(vars, order, budget, perPiece) {
  const out = {};
  let used = 0;
  for (const key of order) {
    const src = (vars[key] || '').trim();
    if (!src) { out[key] = ''; continue; }
    const cap = (perPiece && perPiece[key]) || Infinity;
    let piece = src.length > cap ? util.truncate(src, cap, 120) : src;
    if (used + piece.length <= budget) {
      out[key] = piece;
      used += piece.length;
    } else if (budget - used >= 260) {
      out[key] = util.truncate(piece, budget - used - 40, 0) + '\n…（上下文过长，已省略）';
      used = budget;
    } else {
      out[key] = '';
    }
  }
  return out;
}

// ---------------- 组合器 ----------------

/**
 * 组装一批常用上下文变量。
 * picks: {idea, bible, style, chars, charNames, rowsAll, rowsWindow, castOfRowId, cont, prevOfRowIdx, rowIdx}
 */
function buildVars(project, picks = {}) {
  const rows = project.rows || [];
  const idx = picks.rowIdx != null ? picks.rowIdx : -1;
  const row = idx >= 0 && idx < rows.length ? rows[idx] : null;
  const p = project;
  const v = {};

  if (picks.idea !== false) v.ideaText = fmtIdea(p);
  if (picks.bible !== false) v.bibleText = fmtBible(p);
  if (picks.style !== false) v.styleText = fmtStyle(p) || '（未定义风格，默认：中文叙事、段落间空行。）';
  if (picks.chars !== false) v.charsText = fmtChars(p.characters);
  if (picks.charNames) v.charsTextName = fmtCharNames(p.characters);
  if (picks.rowsAll) v.outlineText = fmtRows(rows);
  if (picks.rowsTail && rows.length) {
    const from = Math.max(0, rows.length - picks.rowsTail);
    v.tailRowsText = fmtRows(rows, from);
  }
  if (picks.curRow && row) {
    v.curRowText = fmtRow(row);
    v.chapterNo = String(row.no || '');
  }
  if (picks.cast && row && row.cast && row.cast.length && p.characters) {
    const names = row.cast;
    const cards = p.characters.filter((c) => names.includes(c.name));
    v.castText = cards.length ? fmtChars(cards, 3600) : `（群像中没有找到登场人物卡：${names.join('、')}，请按名字直觉塑造）`;
  }
  if (picks.bibleKey && row) v.bibleKeyText = bibleKeyText(p, row);
  if (picks.cont !== false) v.contText = fmtContinuity(p, 3);
  if (picks.contOpen) {
    const open = openThreads(p);
    v.openThreadText = open.length ? open.map((t, i) => `${i + 1}. ${t.name}：${t.state}`).join('\n') : '（无未回收线索）';
  }
  if (picks.prev && idx > 0) v.prevText = prevTextFor(p, idx, 2600);
  if (picks.existing && row && row.ch) {
    const content = row.ch.content || '';
    v.existingContent = content ? util.truncate(content, 9000, 200) : '（本章尚无正文）';
    v.existingTail = content ? util.truncate(content.replace(/\n{2,}/g, '\n'), 2600, 400) : '';
  }
  if (picks.sel && picks.selText) v.selText = picks.selText;
  if (picks.instruction) v.extraNote = picks.instruction;
  if (picks.auditScope) v.auditScope = picks.auditScope;
  return v;
}

/** 从世界观中挑选与本章相关的节选 + 完整铁律（写作注入用，控制体积）。 */
function bibleKeyText(p, row) {
  const b = p.bible || {};
  const out = [];
  if (b.rules && b.rules.length) out.push('【铁律】\n' + b.rules.map((r, i) => `${i + 1}. ${r}`).join('\n'));
  if (b.glossary && b.glossary.length) {
    const g = b.glossary.filter((x) => {
      const hay = ((row.title || '') + (row.goal || '') + (row.beats || []).join('') + (row.note || ''));
      return x.term && hay.includes(x.term);
    });
    if (g.length) out.push('【涉及名词】\n' + g.map((x) => `${x.term}：${x.def}`).join('\n'));
  }
  // 命中率最高的分节（标题或开头 60 字命中关键词），最多 2 节，每节裁剪
  const hay = ((row.title || '') + ' ' + (row.goal || '') + ' ' + (row.beats || []).join(' ') + ' ' + (row.note || '') + ' ' + ((row.cast || []).join(' ')));
  const scored = (b.sections || []).map((s) => {
    let score = 0;
    for (const t of (row.cast || [])) if (s.title.includes(t) || s.content.includes(t)) score += 2;
    const kw = hay.replace(/[，。；：、！？\s]/g, '').slice(0, 60);
    for (const ch of kw) if (s.content.includes(ch)) score += 1;
    return { s, score };
  }).filter((x) => x.score > 4).sort((a, b) => b.score - a.score);
  for (const { s } of scored.slice(0, 2)) {
    out.push(`【${s.title}（相关节选）】\n${util.truncate(s.content || '', 900, 90)}`);
  }
  return out.length ? out.join('\n\n') : '（世界观设定中无与本章直接相关条目；如需新设定，请遵守其铁律并保持克制）';
}

// ---------------- 多语言指令 ----------------
const LANG_TEXT = {
  zh: '【语言要求】用简体中文写作。',
  en: '【Language】Write in English.',
  fr: '【Langue】Écrivez en français.',
  ru: '【Язык】Пишите на русском.',
  es: '【Idioma】Escriba en español.',
  pt: '【Idioma】Escreva em português.',
};
function langInstruction(lang) {
  const k = String(lang || '').trim();
  if (!k) return '';
  if (/^(zh|cn|chinese)/i.test(k)) return '\n【语言要求】用简体中文写作。';
  if (/^(en|english)/i.test(k)) return '\n【Language】Write in English.';
  return '\n' + (LANG_TEXT[k] || `【语言要求】请用 ${k} 写作。`);
}

// ---------------- 能力工作台（非 novel 通用文本能力） ----------------

/** 把任意项目的「模板变量块」串起来，供能力动作注入模板。 */
function fmtWorkspaceVars(project) {
  const ws = project.workspace || {};
  const src = (ws.source && ws.source[0]) || {};
  return {
    capKind: ws.kind || 'text',
    capTitle: String(src.title || project.name || '（未命名）'),
    sourceText: String(src.text || ''),
    sourceLang: String(src.lang || project.language || ''),
    paramsText: fmtParams(ws.params),
    outputsText: fmtOutputs(ws.outputs),
    projLang: String(project.language || ''),
  };
}

function fmtParams(params) {
  const o = params || {};
  const keys = Object.keys(o);
  if (!keys.length) return '（无）';
  return keys.map((k) => `${k}：${String(o[k])}`).join('\n');
}

function fmtOutputs(outputs) {
  const list = outputs || [];
  if (!list.length) return '（尚无输出）';
  return list.slice(-4).map((x) => `【${x.label || x.action}】\n${String(x.content || '').slice(0, 900)}`).join('\n\n---\n\n');
}

// ---------------- 模板渲染 ----------------

function renderTemplate(tpl, vars) {
  let s = tpl.system;
  let u = tpl.user;
  for (const k of Object.keys(vars)) {
    const re = new RegExp('\\{\\{' + k + '\\}\\}', 'g');
    const val = String(vars[k] ?? '');
    if (s.includes('{{' + k + '}}')) s = s.replace(re, val);
    if (u.includes('{{' + k + '}}')) u = u.replace(re, val);
  }
  // 清掉未填充的占位符
  s = s.replace(/\{\{[A-Za-z0-9_]+\}\}/g, '');
  u = u.replace(/\{\{[A-Za-z0-9_]+\}\}/g, '');
  return { system: s, user: u };
}

module.exports = { buildVars, trimVars, renderTemplate, fmtIdea, fmtStyle, fmtBible, fmtChars, fmtRow, fmtRows, fmtContinuity, prevTextFor, openThreads, bibleKeyText, fmtWorkspaceVars, langInstruction };
