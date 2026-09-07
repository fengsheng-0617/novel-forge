// bible.js — ② 世界观设定：总述 / 铁律 / 设定分节 / 名词表（自动保存）+ AI 生成与增量补充
'use strict';
import { h, clear, toast, debounce, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';
import { t } from '../i18n.js';

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
    } catch (e) { toast(t('bible.saveFail', { msg: e.message }), 'err', 5000); }
  }
  function remount() { clear(root); mount(root, p, ctx); }
  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }

  root.append(
    h('div', { class: 'page-title' },
      h('h1', {}, t('bible.title')),
      h('span', { class: 'sub' }, t('bible.sub', { s: (b.sections || []).length, r: (b.rules || []).length, g: (b.glossary || []).length, w: numFmt(words) }))),
    h('div', { class: 'page-desc' }, t('bible.desc')),
    h('div', { class: 'two-col', style: 'align-items:start' },
      editorCol(),
      aiCol()));

  function editorCol() {
    return h('div', {},
      h('div', { class: 'card' },
        h('h3', {}, t('bible.summary'), h('span', { class: 'hint' }, t('bible.summaryHint'))),
        h('textarea', { rows: 5, style: 'width:100%', placeholder: t('bible.summaryPh'), oninput: (e) => { b.summary = e.target.value; saveDeb(); } }, b.summary || '')),
      h('div', { class: 'card' },
        h('h3', {}, t('bible.rules'), h('span', { class: 'hint' }, t('bible.rulesHint'))),
        h('textarea', { rows: Math.max(4, b.rules.length), style: 'width:100%;font-family:var(--mono);font-size:13px', placeholder: t('bible.rulesPh'), oninput: (e) => {
          b.rules = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
          saveDeb();
        } }, b.rules.join('\n'))),
      sectionsCard(),
      glossaryCard());
  }

  function sectionsCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('bible.sections'), h('span', { class: 'hint' }, t('bible.sectionsHint'))));
    for (const [i, s] of b.sections.entries()) {
      box.append(h('div', { class: 'fieldset' },
        h('input', { type: 'text', value: s.title || '', placeholder: t('bible.sectionTitlePh'), style: 'width:calc(100% - 80px)',
          oninput: (e) => { s.title = e.target.value; saveDeb(); } }),
        h('button', { class: 'btn sm danger', style: 'float:right', onclick: async () => {
          b.sections.splice(i, 1); await save(); remount();
        } }, t('bible.del')),
        h('div', { style: 'clear:both' }),
        h('textarea', { rows: 5, style: 'width:100%;margin-top:6px', placeholder: t('bible.sectionContentPh'), oninput: (e) => { s.content = e.target.value; saveDeb(); } }, s.content || ''),
        h('div', { class: 'btn-row', style: 'margin-top:6px' },
          h('button', { class: 'btn sm', onclick: () => openGen(p, { action: 'bible_expand', title: `补充：${s.title}`, kind: 'json', args: { instruction: '细化并扩充设定分节《' + (s.title || '') + '》，保持与现有设定兼容。' }, onApplied: afterAi }) }, t('bible.sectionAi')),
          h('button', { class: 'btn sm ghost', onclick: () => openGen(p, { action: 'bible_expand', title: 'AI 补全本节空缺', kind: 'json', args: { instruction: '检查设定集缺失或薄弱处并补充。' }, onApplied: afterAi }) }, t('bible.sectionFill')))));
    }
    box.append(h('button', { class: 'btn sm', onclick: () => { b.sections.push({ title: '', content: '' }); remount(); } }, t('bible.addSection')));
    return box;
  }

  function glossaryCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('bible.glossary'), h('span', { class: 'hint' }, t('bible.glossaryHint'))));
    if (!b.glossary.length) box.append(h('div', { class: 'small faint', style: 'padding:4px 0 8px' }, t('bible.glossaryEmpty')));
    for (const [i, g] of b.glossary.entries()) {
      box.append(h('div', { class: 'row-line' },
        h('input', { type: 'text', value: g.term || '', placeholder: t('bible.termPh'), style: 'flex:1.2', oninput: (e) => { g.term = e.target.value; saveDeb(); } }),
        h('input', { type: 'text', value: g.def || '', placeholder: t('bible.defPh'), style: 'flex:3', oninput: (e) => { g.def = e.target.value; saveDeb(); } }),
        h('button', { class: 'btn sm danger grow0', onclick: async () => { b.glossary.splice(i, 1); await save(); remount(); } }, '✕')));
    }
    box.append(h('button', { class: 'btn sm', onclick: () => { b.glossary.push({ term: '', def: '' }); remount(); } }, t('bible.addTerm')));
    return box;
  }

  function aiCol() {
    const need = h('textarea', { id: 'bible-need', rows: 2, placeholder: t('bible.aiNeedPh'), style: 'width:100%;margin-bottom:8px' });
    const ai = (label, desc, action, args = {}, extra = {}) =>
      h('button', { class: 'btn', style: 'width:100%;justify-content:flex-start;text-align:left;padding:10px 12px;margin-bottom:8px;height:auto', onclick: () => openGen(p, Object.assign({ action, title: label, kind: 'json', args }, extra)) },
        h('div', {}, h('div', { style: 'font-weight:600' }, label), h('div', { class: 'small faint' }, desc)));
    return h('div', {},
      h('div', { class: 'card' },
        h('h3', {}, t('bible.aiTitle')),
        ai(t('bible.aiGenerate'), t('bible.aiGenerateDesc'), 'bible_generate', {}, { onApplied: afterAi }),
        need,
        h('button', { class: 'btn', style: 'width:100%;justify-content:flex-start;text-align:left;padding:10px 12px;margin-bottom:8px;height:auto',
          onclick: () => openGen(p, {
            action: 'bible_expand', title: t('bible.aiExpand'), kind: 'json',
            args: { instruction: need.value.trim() || '检查设定集缺失或薄弱之处并补充。' },
            onApplied: afterAi,
          }) },
          h('div', {}, h('div', { style: 'font-weight:600' }, t('bible.aiExpand')), h('div', { class: 'small faint' }, t('bible.aiExpandDesc')))),
        h('div', { class: 'small faint', style: 'margin-top:2px' }, t('bible.aiTip')),
        h('button', { class: 'btn ghost', style: 'width:100%;margin-top:6px', onclick: () => { location.hash = '#/p/' + p.id + '/characters'; } }, t('bible.next'))));
  }
}
