// bible.js — ② 世界观设定：总述 / 铁律 / 设定分节 / 名词表（自动保存）+ AI 生成与增量补充
'use strict';
import { h, clear, toast, debounce, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  const b = p.bible || {};
  b.rules = Array.isArray(b.rules) ? b.rules : [];
  b.sections = Array.isArray(b.sections) ? b.sections : [];
  b.glossary = Array.isArray(b.glossary) ? b.glossary : [];
  const words = (b.sections || []).reduce((a, s) => a + (s.content || '').replace(/\s/g, '').length, 0);

  const saveDeb = debounce(save, 700);
  async function save() {
    try {
      const r = await api.docSet(p.id, 'bible', b);
      p.bible = r.project.bible;
    } catch (e) { toast('保存失败：' + e.message, 'err', 5000); }
  }
  function remount() { clear(root); mount(root, p, ctx); }
  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }

  root.append(
    h('div', { class: 'page-title' },
      h('h1', {}, '② 世界观设定'),
      h('span', { class: 'sub' }, `${(b.sections || []).length} 节 · ${(b.rules || []).length} 条铁律 · ${(b.glossary || []).length} 个名词 · 约 ${numFmt(words)} 字`)),
    h('div', { class: 'page-desc' }, '设定是整本书的「宪法」：铁律必须具体可检验（能量代价/时间限制/势力边界），正文写作时会按相关性自动注入这些内容，因此写得越细，AI 越不容易跑偏。'),
    h('div', { class: 'two-col', style: 'align-items:start' },
      editorCol(),
      aiCol()));

  function editorCol() {
    return h('div', {},
      h('div', { class: 'card' },
        h('h3', {}, '世界观总述', h('span', { class: 'hint' }, '一句话说清世界的特殊之处 + 当前处于什么状态')),
        h('textarea', { rows: 5, style: 'width:100%', placeholder: '世界总述…', oninput: (e) => { b.summary = e.target.value; saveDeb(); } }, b.summary || '')),
      h('div', { class: 'card' },
        h('h3', {}, '世界铁律', h('span', { class: 'hint' }, '每行一条，正文写作会被严格注入')),
        h('textarea', { rows: Math.max(4, b.rules.length), style: 'width:100%;font-family:var(--mono);font-size:13px', placeholder: '铁律1\n铁律2\n…', oninput: (e) => {
          b.rules = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
          saveDeb();
        } }, b.rules.join('\n'))),
      sectionsCard(),
      glossaryCard());
  }

  function sectionsCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, '设定分节', h('span', { class: 'hint' }, '如 地理/力量体系/势力格局/禁忌；写作时自动按相关性注入')));
    for (const [i, s] of b.sections.entries()) {
      box.append(h('div', { class: 'fieldset' },
        h('input', { type: 'text', value: s.title || '', placeholder: '分节标题（如 力量体系）', style: 'width:calc(100% - 80px)',
          oninput: (e) => { s.title = e.target.value; saveDeb(); } }),
        h('button', { class: 'btn sm danger', style: 'float:right', onclick: async () => {
          b.sections.splice(i, 1); await save(); remount();
        } }, '删'),
        h('div', { style: 'clear:both' }),
        h('textarea', { rows: 5, style: 'width:100%;margin-top:6px', placeholder: '本节内容（300-550 字为宜）', oninput: (e) => { s.content = e.target.value; saveDeb(); } }, s.content || ''),
        h('div', { class: 'btn-row', style: 'margin-top:6px' },
          h('button', { class: 'btn sm', onclick: () => openGen(p, { action: 'bible_expand', title: `补充：${s.title}`, kind: 'json', args: { instruction: '细化并扩充设定分节《' + (s.title || '') + '》，保持与现有设定兼容。' }, onApplied: afterAi }) }, '🤖 细化本节'),
          h('button', { class: 'btn sm ghost', onclick: () => openGen(p, { action: 'bible_expand', title: 'AI 补全本节空缺', kind: 'json', args: { instruction: '检查设定集缺失或薄弱处并补充。' }, onApplied: afterAi }) }, 'AI 查漏补缺'))));
    }
    box.append(h('button', { class: 'btn sm', onclick: () => { b.sections.push({ title: '', content: '' }); remount(); } }, '＋ 新增分节'));
    return box;
  }

  function glossaryCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, '专有名词表', h('span', { class: 'hint' }, '正文反复出现的名词定义')));
    if (!b.glossary.length) box.append(h('div', { class: 'small faint', style: 'padding:4px 0 8px' }, '（暂无）'));
    for (const [i, g] of b.glossary.entries()) {
      box.append(h('div', { class: 'row-line' },
        h('input', { type: 'text', value: g.term || '', placeholder: '名词', style: 'flex:1.2', oninput: (e) => { g.term = e.target.value; saveDeb(); } }),
        h('input', { type: 'text', value: g.def || '', placeholder: '定义', style: 'flex:3', oninput: (e) => { g.def = e.target.value; saveDeb(); } }),
        h('button', { class: 'btn sm danger grow0', onclick: async () => { b.glossary.splice(i, 1); await save(); remount(); } }, '✕')));
    }
    box.append(h('button', { class: 'btn sm', onclick: () => { b.glossary.push({ term: '', def: '' }); remount(); } }, '＋ 名词'));
    return box;
  }

  function aiCol() {
    const need = h('textarea', { id: 'bible-need', rows: 2, placeholder: '补充需求（可选）：如「补充经济体系」「细化时间规则的应用边界」…', style: 'width:100%;margin-bottom:8px' });
    const ai = (label, desc, action, args = {}, extra = {}) =>
      h('button', { class: 'btn', style: 'width:100%;justify-content:flex-start;text-align:left;padding:10px 12px;margin-bottom:8px;height:auto', onclick: () => openGen(p, Object.assign({ action, title: label, kind: 'json', args }, extra)) },
        h('div', {}, h('div', { style: 'font-weight:600' }, label), h('div', { class: 'small faint' }, desc)));
    return h('div', {},
      h('div', { class: 'card' },
        h('h3', {}, '🤖 AI 动作'),
        ai('生成世界观设定集', '根据创意立项书生成 总述+铁律+分节+名词表（整组替换，可预览）', 'bible_generate', {}, { onApplied: afterAi }),
        need,
        h('button', { class: 'btn', style: 'width:100%;justify-content:flex-start;text-align:left;padding:10px 12px;margin-bottom:8px;height:auto',
          onclick: () => openGen(p, {
            action: 'bible_expand', title: '增量补充设定', kind: 'json',
            args: { instruction: need.value.trim() || '检查设定集缺失或薄弱之处并补充。' },
            onApplied: afterAi,
          }) },
          h('div', {}, h('div', { style: 'font-weight:600' }, '增量补充设定'), h('div', { class: 'small faint' }, '按上方补充需求追加新分节/铁律/名词（不覆盖已有）'))),
        h('div', { class: 'small faint', style: 'margin-top:2px' }, '提示：内容库越厚，正文阶段注入的上下文越精准。'),
        h('button', { class: 'btn ghost', style: 'width:100%;margin-top:6px', onclick: () => { location.hash = '#/p/' + p.id + '/characters'; } }, '下一步：人物群像 →')));
  }
}
