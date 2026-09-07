// characters.js — ③ 人物群像：角色列表 + 卡片全字段编辑 + AI（生成群像/新增/精修/一致性校准）
'use strict';
import { h, clear, toast, debounce, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';
import { t } from '../i18n.js';

const ROLES = ['主角', '关键配角', '反派', '配角', '龙套'];

const LONG_FIELDS = [
  ['backstory', t('chars.backstory'), 4], ['arc', t('chars.arc'), 3], ['secrets', t('chars.secrets'), 2],
  ['notes', t('chars.notes'), 2],
];
const SHORT_FIELDS = [
  ['oneLine', t('chars.oneLine'), t('chars.oneLinePh')],
  ['appearance', t('chars.appearance'), ''],
  ['personality', t('chars.personality'), ''],
  ['goals', t('chars.goals'), ''],
  ['speechStyle', t('chars.speechStyle'), t('chars.speechPh')],
];

let selId = null;
let filter = '';
let lastPid = null;

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  if (lastPid !== p.id) { lastPid = p.id; selId = null; filter = ''; }
  const list = p.characters || [];
  if (selId && !list.some((c) => c.id === selId)) selId = null;
  const sel = list.find((c) => c.id === selId) || null;

  const saveDeb = debounce(async () => { if (sel) await pushCard(sel); }, 900);
  async function pushCard(card) {
    try {
      const r = await api.colOp(p.id, 'characters', 'update', { id: card.id, patch: normalizePatch(card) });
      p.characters = r.arr;
      if (ctx && ctx.onSelfChange) ctx.onSelfChange();
    } catch (e) { toast(t('chars.saveFail', { msg: e.message }), 'err', 5000); }
  }
  function normalizePatch(c) {
    const patch = {};
    for (const k of ['name', 'role', 'oneLine', 'appearance', 'personality', 'goals', 'backstory', 'arc', 'speechStyle', 'secrets', 'notes']) {
      if (c[k] !== undefined) patch[k] = String(c[k] ?? '');
    }
    patch.pov = !!c.pov;
    patch.aliases = (Array.isArray(c.aliases) ? c.aliases : String(c.aliases || '').split(/[,，、]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
    patch.relations = Array.isArray(c.relations) ? c.relations.map((r) => ({ name: String(r.name || '').slice(0, 40), desc: String(r.desc || '').slice(0, 120) })) : [];
    return patch;
  }

  function remount() { clear(root); mount(root, p, ctx); }
  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }
  function toastErr(e) { toast(t('chars.opFail', { msg: e.message }), 'err', 4000); }

  const hintEl = h('input', { type: 'text', placeholder: t('chars.hintPh'), style: 'flex:1;min-width:180px' });
  root.append(
    h('div', { class: 'page-title' },
      h('h1', {}, t('chars.title')),
      h('span', { class: 'sub' }, t('chars.sub', { n: list.length }))),
    h('div', { class: 'page-desc' }, t('chars.desc')),
    h('div', { class: 'actions-bar' },
      h('button', { class: 'btn primary', onclick: () => openGen(p, { action: 'characters_generate', title: t('chars.gen'), kind: 'json', args: { count: 10 }, onApplied: afterAi }) }, t('chars.gen')),
      h('button', { class: 'btn', onclick: () => openGen(p, { action: 'characters_align', title: t('chars.align'), kind: 'json', args: {}, onApplied: afterAi }) }, t('chars.align')),
      h('button', { class: 'btn', onclick: () => openGen(p, {
        action: 'character_add', title: t('chars.add'), kind: 'json',
        args: { instruction: hintEl.value.trim() || t('chars.addNeed') }, onApplied: afterAi,
      }) }, t('chars.add')),
      hintEl,
    ),
    h('div', { class: 'split' }, listPane(), sel ? cardPane(sel) : h('div', { class: 'empty' }, t('chars.empty'))));

  function listPane() {
    const box = h('div', { class: 'list-pane' });
    const head = h('div', { class: 'lp-head' });
    const q = h('input', { type: 'text', placeholder: t('chars.search'), style: 'flex:1;min-width:0', oninput: (e) => { filter = e.target.value; refresh(); } });
    head.append(q);
    const roleSel = h('select', { style: 'width:auto', onchange: (e) => { filter = (e.target.value === t('chars.all') ? '' : e.target.value + ':'); refresh(); } });
    roleSel.append(h('option', {}, t('chars.all')), ...ROLES.map((r) => h('option', {}, r)));
    head.append(roleSel);
    const listEl = h('div', {});
    box.append(head, listEl);
    const refresh = () => {
      clear(listEl);
      const items = list.filter((c) => {
        if (!filter) return true;
        if (filter.endsWith(':')) return c.role === filter.slice(0, -1);
        return (c.name || '').includes(filter) || (c.oneLine || '').includes(filter);
      });
      if (!items.length) listEl.append(h('div', { class: 'empty small', style: 'padding:22px' }, t('chars.none')));
      items.forEach((c, idx) => {
        const item = h('div', { class: 'list-item' + (selId === c.id ? ' sel' : ''), onclick: () => { selId = c.id; remount(); } },
          h('span', { class: 'nm' }, c.name || t('chars.noname')),
          h('span', { class: 'role-pill role-' + (c.role || t('chars.supporting')) }, c.role || t('chars.supporting')),
          h('span', { style: 'margin-left:auto;display:flex;gap:4px' },
            c.pov ? h('span', { class: 'small faint', title: t('chars.povChar') }, '🎥') : null,
            h('button', { class: 'btn sm', style: 'padding:1px 6px', title: t('chars.up'), onclick: (e) => { e.stopPropagation(); move(c.id, idx - 1); } }, '↑'),
            h('button', { class: 'btn sm', style: 'padding:1px 6px', title: t('chars.down'), onclick: (e) => { e.stopPropagation(); move(c.id, idx + 1); } }, '↓')));
        listEl.append(item);
      });
    };
    const move = async (id, to) => {
      try {
        const r = await api.colOp(p.id, 'characters', 'move', { id, to: Math.max(0, Math.min(list.length - 1, to)) });
        p.characters = r.arr;
        remount();
      } catch (e) { toastErr(e); }
    };
    const toastErr = (e) => toast(t('chars.opFail', { msg: e.message }), 'err', 4000);
    refresh();
    box.append(h('div', { class: 'lp-head', style: 'border-top:1px solid var(--line)' },
      h('button', { class: 'btn sm primary', onclick: () => addBlank() }, t('chars.addBlank'))));
    async function addBlank() {
      try {
        const r = await api.colOp(p.id, 'characters', 'add', { item: { name: t('chars.newChar', { n: list.length + 1 }), role: '配角' } });
        p.characters = r.arr;
        selId = r.arr[r.arr.length - 1].id;
        remount();
      } catch (e) { toastErr(e); }
    }
    return box;
  }

  function cardPane(c) {
    const box = h('div', { class: 'card' });
    const head = h('div', { class: 'btn-row', style: 'margin-bottom:10px' },
      h('button', { class: 'btn sm primary', onclick: () => openGen(p, { action: 'character_flesh', title: `AI 精修「${c.name}」`, kind: 'json', args: { charId: c.id }, charId: c.id, onApplied: afterAi }) }, t('chars.flesh')),
      h('button', { class: 'btn sm danger', onclick: async () => {
        const yes = await confirmDialog(t('chars.delete'), t('chars.delConfirm', { n: c.name }), { okText: t('common.delete'), danger: true });
        if (!yes) return;
        try {
          const r = await api.colOp(p.id, 'characters', 'remove', { id: c.id });
          p.characters = r.arr;
          selId = null;
          remount();
        } catch (e) { toast(t('chars.delFail', { msg: e.message }), 'err', 4000); }
      } }, t('chars.delete')));
    head.prepend(h('b', { style: 'font-size:16px' }, `${c.name || t('chars.noname')}`));
    box.append(head);

    box.append(h('div', { class: 'two-col' },
      h('div', {},
        fieldInput(c, 'name', t('chars.name'), ''),
        h('div', { class: 'row-line', style: 'align-items:center' },
          h('label', { class: 'field', style: 'flex:1;margin:0' }, h('span', {}, t('chars.role')), h('select', { onchange: (e) => { c.role = e.target.value; saveDeb(); } }, ROLES.map((r) => h('option', { selected: c.role === r || undefined }, r)))),
          h('label', { class: 'field', style: 'flex:1;margin:0' }, h('span', {}, t('chars.pov')),
            h('select', { onchange: (e) => { c.pov = e.target.value === 'true'; saveDeb(); } },
              h('option', { value: 'false', selected: !c.pov }, t('chars.povNo')),
              h('option', { value: 'true', selected: !!c.pov }, t('chars.povYes'))))),
        fieldInput(c, 'aliases', t('chars.aliases'), ''),
        ...SHORT_FIELDS.map(([k, label, ph]) => fieldArea(c, k, label, 2, ph)),
      ),
      h('div', {},
        ...LONG_FIELDS.map(([k, label, rows]) => fieldArea(c, k, label, rows, '')),
        relationEditor(c))));

    function fieldInput(card, k, label, ph) {
      return h('label', { class: 'field' }, h('span', {}, label),
        h('input', { type: 'text', value: card[k] || '', placeholder: ph, oninput: (e) => { card[k] = e.target.value; saveDeb(); } }));
    }
    function fieldArea(card, k, label, rows, ph) {
      return h('label', { class: 'field' }, h('span', {}, label),
        h('textarea', { rows, value: card[k] || '', placeholder: ph, oninput: (e) => { card[k] = e.target.value; saveDeb(); } }));
    }
    function relationEditor(card) {
      const rels = card.relations = Array.isArray(card.relations) ? card.relations : [];
      const relBox = h('div', {});
      relBox.append(h('div', { class: 'small muted', style: 'margin:2px 0 6px;font-weight:600' }, t('chars.rels')));
      rels.forEach((r, i) => {
        relBox.append(h('div', { class: 'row-line' },
          h('input', { type: 'text', value: r.name || '', placeholder: t('chars.relNamePh'), style: 'flex:1.3', oninput: (e) => { r.name = e.target.value; saveDeb(); } }),
          h('input', { type: 'text', value: r.desc || '', placeholder: t('chars.relDescPh'), style: 'flex:2', oninput: (e) => { r.desc = e.target.value; saveDeb(); } }),
          h('button', { class: 'btn sm danger grow0', onclick: () => { rels.splice(i, 1); saveDeb(); remount(); } }, '✕')));
      });
      relBox.append(h('button', { class: 'btn sm', onclick: () => { rels.push({ name: '', desc: '' }); remount(); } }, t('chars.addRel')));
      return relBox;
    }
    return box;
  }
}
