// characters.js — ③ 人物群像：角色列表 + 卡片全字段编辑 + AI（生成群像/新增/精修/一致性校准）
'use strict';
import { h, clear, toast, debounce, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';

const ROLES = ['主角', '关键配角', '反派', '配角', '龙套'];

const LONG_FIELDS = [
  ['backstory', '背景故事', 4], ['arc', '成长弧线', 3], ['secrets', '秘密 / 弱点', 2],
  ['notes', '叙事功能备注', 2],
];
const SHORT_FIELDS = [
  ['oneLine', '一句话定位', '如 退役测绘员，回雾港接任灯塔看守'],
  ['appearance', '外貌与标志性细节', ''],
  ['personality', '性格（外在 + 内在反差）', ''],
  ['goals', '欲望与目标', ''],
  ['speechStyle', '说话风格', '口头禅 / 用词习惯'],
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
    } catch (e) { toast('保存失败：' + e.message, 'err', 5000); }
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
  function toastErr(e) { toast('操作失败：' + e.message, 'err', 4000); }

  const hintEl = h('input', { type: 'text', placeholder: '新增角色的需求（可选）…', style: 'flex:1;min-width:180px' });
  root.append(
    h('div', { class: 'page-title' },
      h('h1', {}, '③ 人物群像'),
      h('span', { class: 'sub' }, `${list.length} 名角色 · 主角/反派动机必须自洽，说话风格直接影响正文对话质量`)),
    h('div', { class: 'page-desc' }, '左侧选人 → 右侧编辑卡片（自动保存）。所有字段都会注入「章节写作」的上下文中；先让 AI 生成群像，再逐卡精修，最后做一次全组一致性校准。'),
    h('div', { class: 'actions-bar' },
      h('button', { class: 'btn primary', onclick: () => openGen(p, { action: 'characters_generate', title: 'AI 生成完整人物群像', kind: 'json', args: { count: 10 }, onApplied: afterAi }) }, '🤖 生成群像（整组替换）'),
      h('button', { class: 'btn', onclick: () => openGen(p, { action: 'characters_align', title: 'AI 一致性校准（整组）', kind: 'json', args: {}, onApplied: afterAi }) }, '🤖 校准一致性'),
      h('button', { class: 'btn', onclick: () => openGen(p, {
        action: 'character_add', title: 'AI 新增一位角色', kind: 'json',
        args: { instruction: hintEl.value.trim() || '按题材需要补充一位新角色' }, onApplied: afterAi,
      }) }, '🤖 新增角色'),
      hintEl,
    ),
    h('div', { class: 'split' }, listPane(), sel ? cardPane(sel) : h('div', { class: 'empty' }, '← 选择或新建一个角色')));

  function listPane() {
    const box = h('div', { class: 'list-pane' });
    const head = h('div', { class: 'lp-head' });
    const q = h('input', { type: 'text', placeholder: '搜索', style: 'flex:1;min-width:0', oninput: (e) => { filter = e.target.value; refresh(); } });
    head.append(q);
    const roleSel = h('select', { style: 'width:auto', onchange: (e) => { filter = (e.target.value === '全部' ? '' : e.target.value + ':'); refresh(); } });
    roleSel.append(h('option', {}, '全部'), ...ROLES.map((r) => h('option', {}, r)));
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
      if (!items.length) listEl.append(h('div', { class: 'empty small', style: 'padding:22px' }, '无匹配角色'));
      items.forEach((c, idx) => {
        const item = h('div', { class: 'list-item' + (selId === c.id ? ' sel' : ''), onclick: () => { selId = c.id; remount(); } },
          h('span', { class: 'nm' }, c.name || '（无名）'),
          h('span', { class: 'role-pill role-' + (c.role || '配角') }, c.role || '配角'),
          h('span', { style: 'margin-left:auto;display:flex;gap:4px' },
            c.pov ? h('span', { class: 'small faint', title: '主视角角色' }, '🎥') : null,
            h('button', { class: 'btn sm', style: 'padding:1px 6px', title: '上移', onclick: (e) => { e.stopPropagation(); move(c.id, idx - 1); } }, '↑'),
            h('button', { class: 'btn sm', style: 'padding:1px 6px', title: '下移', onclick: (e) => { e.stopPropagation(); move(c.id, idx + 1); } }, '↓')));
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
    const toastErr = (e) => toast('操作失败：' + e.message, 'err', 4000);
    refresh();
    box.append(h('div', { class: 'lp-head', style: 'border-top:1px solid var(--line)' },
      h('button', { class: 'btn sm primary', onclick: () => addBlank() }, '＋ 空白卡')));
    async function addBlank() {
      try {
        const r = await api.colOp(p.id, 'characters', 'add', { item: { name: '新角色' + (list.length + 1), role: '配角' } });
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
      h('button', { class: 'btn sm primary', onclick: () => openGen(p, { action: 'character_flesh', title: `AI 精修「${c.name}」`, kind: 'json', args: { charId: c.id }, charId: c.id, onApplied: afterAi }) }, '🤖 精修此卡'),
      h('button', { class: 'btn sm danger', onclick: async () => {
        const yes = await confirmDialog('删除角色', `删除「${c.name}」？若正文章节已引用其名，请注意检查。`, { okText: '删除', danger: true });
        if (!yes) return;
        try {
          const r = await api.colOp(p.id, 'characters', 'remove', { id: c.id });
          p.characters = r.arr;
          selId = null;
          remount();
        } catch (e) { toast('删除失败：' + e.message, 'err', 4000); }
      } }, '删除'));
    head.prepend(h('b', { style: 'font-size:16px' }, `${c.name || '（无名）'}`));
    box.append(head);

    box.append(h('div', { class: 'two-col' },
      h('div', {},
        fieldInput(c, 'name', '姓名', ''),
        h('div', { class: 'row-line', style: 'align-items:center' },
          h('label', { class: 'field', style: 'flex:1;margin:0' }, h('span', {}, '角色定位'), h('select', { onchange: (e) => { c.role = e.target.value; saveDeb(); } }, ROLES.map((r) => h('option', { selected: c.role === r || undefined }, r)))),
          h('label', { class: 'field', style: 'flex:1;margin:0' }, h('span', {}, '主视角'),
            h('select', { onchange: (e) => { c.pov = e.target.value === 'true'; saveDeb(); } },
              h('option', { value: 'false', selected: !c.pov }, '否'),
              h('option', { value: 'true', selected: !!c.pov }, '是（🎥 有视角章节）')))),
        fieldInput(c, 'aliases', '别称（逗号分隔）', ''),
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
      relBox.append(h('div', { class: 'small muted', style: 'margin:2px 0 6px;font-weight:600' }, '人物关系'));
      rels.forEach((r, i) => {
        relBox.append(h('div', { class: 'row-line' },
          h('input', { type: 'text', value: r.name || '', placeholder: '相关人物名', style: 'flex:1.3', oninput: (e) => { r.name = e.target.value; saveDeb(); } }),
          h('input', { type: 'text', value: r.desc || '', placeholder: '关系 / 态度', style: 'flex:2', oninput: (e) => { r.desc = e.target.value; saveDeb(); } }),
          h('button', { class: 'btn sm danger grow0', onclick: () => { rels.splice(i, 1); saveDeb(); remount(); } }, '✕')));
      });
      relBox.append(h('button', { class: 'btn sm', onclick: () => { rels.push({ name: '', desc: '' }); remount(); } }, '＋ 关系'));
      return relBox;
    }
    return box;
  }
}
