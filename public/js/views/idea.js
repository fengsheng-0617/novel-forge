// idea.js — ① 灵感点子：创意卡编辑（自动保存）+ 头脑风暴点子池 + AI 深化
'use strict';
import { h, clear, toast, debounce, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';

const FIELDS = [
  ['title', '书名', '如《雾中来信》'],
  ['genres', '类型标签（逗号分隔）', '如 悬疑, 奇幻, 轻惊悚'],
  ['targetWords', '目标总字数', '如 150000（决定卷章规模）'],
  ['logline', '一句话故事', '主角+目标+阻碍，45字内'],
  ['premise', '故事背景', '世界/时代/核心设定、主角是谁、想要什么、最大阻碍、从哪里开始（400-700字）'],
  ['hook', '开篇钩子', '第一幕最抓人的悬念或画面'],
  ['conflict', '核心冲突', '外部冲突+内部冲突+贯穿悬念'],
  ['pov', '视角方案', '如 第三人称限知（主视角：沈既明）'],
  ['tone', '叙事基调', '风格关键词，如 冷冽潮湿的北地悬疑'],
  ['audience', '目标读者', '如 悬疑爱好者 / 15+'],
  ['extra', '补充说明', '可写任何约束与备忘'],
];

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  // 本地草稿（防刷新冲突由全局编辑守卫保护）
  const draft = JSON.parse(JSON.stringify(p.idea || {}));
  draft.genres = Array.isArray(draft.genres) ? draft.genres : [];

  const saver = debounce(save, 800);
  let saveSeq = 0;
  async function save() {
    const seq = ++saveSeq;
    const candidates = Array.isArray(p.idea && p.idea.candidates) ? p.idea.candidates : [];
    const value = {
      title: draft.title || '',
      genres: splitGenres(draft.genres),
      targetWords: Math.max(0, Math.floor(Number(draft.targetWords) || 0)),
      logline: draft.logline || '', premise: draft.premise || '', hook: draft.hook || '',
      conflict: draft.conflict || '', pov: draft.pov || '', tone: draft.tone || '',
      audience: draft.audience || '', extra: draft.extra || '',
      candidates,
    };
    try {
      const r = await api.docSet(p.id, 'idea', value);
      if (seq === saveSeq) p.idea = r.project.idea; // 同步（不整页刷新）
    } catch (e) { toast('保存失败：' + e.message, 'err', 5000); }
  }
  function splitGenres(arr) {
    const src = Array.isArray(arr) ? arr : String(arr || '').split(/[,，、\s]+/);
    return src.map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
  }

  const aiCard = (title, desc, action, args, extraCfg = {}) =>
    h('button', { class: 'btn', style: 'width:100%;justify-content:flex-start;text-align:left;padding:10px 12px;margin-bottom:8px;height:auto',
      onclick: () => openGen(p, Object.assign({ action, title, args: args || {}, kind: 'json' }, extraCfg)) },
      h('div', {}, h('div', { style: 'font-weight:600' }, title), h('div', { class: 'small faint' }, desc)));

  const colLeft = h('div', {},
    h('div', { class: 'card' },
      h('h3', {}, '创意卡', h('span', { class: 'hint' }, '自动保存')),
      ...FIELDS.map(([k, label, ph]) => {
        const isLong = ['premise', 'conflict', 'extra'].includes(k);
        const input = isLong
          ? h('textarea', { rows: k === 'premise' ? 9 : 4, placeholder: ph })
          : h('input', { type: k === 'targetWords' ? 'number' : 'text', placeholder: ph });
        input.value = draft[k] ?? '';
        if (k === 'genres') input.value = (draft.genres || []).join(', ');
        input.addEventListener('input', () => {
          draft[k] = k === 'targetWords' ? input.value : input.value;
          if (k === 'genres') draft.genres = input.value;
          saver();
        });
        return h('label', { class: 'field' }, h('span', {}, label), input);
      })),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => { saver.flush(); ctx.toast('已保存', 'ok'); } }, '保存'),
      h('button', { class: 'btn ghost', onclick: () => { if (ctx.project()) location.hash = '#/p/' + p.id + '/bible'; } }, '下一步：世界观 →')));

  const colRight = h('div', {},
    h('div', { class: 'card' },
      h('h3', {}, '🤖 AI 动作'),
      aiCard('① 故事路线 · 大纲思路（生成大纲前必做）', '给出 3 条互不相同的路线候选：整体结构/阶段路线/主线冲突/结局/取舍——选定后大纲会严格遵循它', 'route_plan', { count: 3 }, { onApplied: afterAi }),
      aiCard('头脑风暴 · 点子池', '无中生有：生成 8 个差异化候选点子（可逐条采纳）', 'idea_brainstorm', {}),
      aiCard('深化当前创意', '把当前创意卡扩写为完整立项书（覆盖创意字段）', 'idea_flesh', {}, { onApplied: afterAi })),
    routesCard(),
    candidatesCard());

  const titleRow = h('div', { class: 'page-title' },
    h('h1', {}, '① 灵感点子'),
    h('span', { class: 'sub' }, '先有值得写的一颗种子：书名、一句话故事、故事背景与核心冲突。所有文字都能直接编辑，改动自动保存。'));
  const descRow = h('div', { class: 'page-desc' }, '推荐路径：a) 已有想法 → 逐项填写或点「AI 深化当前创意」；b) 还没有想法 → 点「头脑风暴」生成 8 个点子，挑中后「采纳并深化」。无论点子多少，进入大纲之前都要先产出并选定「故事路线 · 大纲思路」——这是防止大纲散乱的关键一步。');

  root.append(titleRow, descRow, h('div', { class: 'two-col', style: 'align-items:start' }, colLeft, colRight));

  // ---- 故事路线（大纲思路）：候选 + 选定 ----
  function routesCard() {
    const routes = p.routes || { candidates: [], selected: null };
    const list = Array.isArray(routes.candidates) ? routes.candidates : [];
    const sel = routes.selected || null;
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, '故事路线（大纲思路）',
      h('span', { class: 'hint' }, sel ? '✅ 已选定：' + (sel.name || '未命名') : (list.length ? '⚠ 尚未选定 · 生成大纲前必须选一条' : '生成大纲前必做'))));
    if (!list.length) {
      box.append(h('div', { class: 'empty small', style: 'padding:18px' }, '点上方「① 故事路线 · 大纲思路」生成 2~5 条互不相同的路线候选；选定后生成的大纲会严格遵循该路线，不再前后失焦。'));
      return box;
    }
    for (const c of list) {
      const isSel = !!(sel && sel.name === c.name);
      const rows = [];
      if (c.approach) rows.push(h('div', { class: 'small', style: 'margin:2px 0 6px' }, h('b', {}, '思路：'), c.approach));
      const st = Array.isArray(c.structure) ? c.structure : [];
      if (st.length) rows.push(h('div', { class: 'small muted', style: 'margin-bottom:6px' },
        h('b', {}, '阶段：'), st.map((s) => `${s.phase || '阶段'}${s.span ? '（' + s.span + '）' : ''}${s.goal ? '·' + s.goal : ''}`).join('；')));
      if (c.coreConflict) rows.push(h('div', { class: 'small' }, h('b', {}, '主线冲突：'), c.coreConflict));
      if (c.ending) rows.push(h('div', { class: 'small' }, h('b', {}, '结局：'), c.ending));
      if (c.risk) rows.push(h('div', { class: 'small muted' }, h('b', {}, '取舍：'), c.risk));
      box.append(h('div', { class: 'fieldset', style: isSel ? 'border-color:var(--accent)' : '' },
        h('div', { class: 'fs-t' }, h('b', {}, c.name || '未命名路线'),
          h('span', {}, [c.recommended ? '★ AI 推荐' : '', isSel ? '已选定' : ''].filter(Boolean).join(' · '))),
        ...rows,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm ' + (isSel ? '' : 'primary'), disabled: isSel, onclick: () => saveRoutes(list, c, 'user') }, isSel ? '已选定' : '选定此路线'),
          h('button', { class: 'btn sm ghost', onclick: () => saveRoutes(list, c, 'delegate') }, '记为用户授权 AI 选定'))));
    }
    const rec = list.find((x) => x.recommended) || list[0];
    box.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', onclick: () => saveRoutes(list, rec, 'delegate') }, '⭐ 采用 AI 推荐路线'),
      h('button', { class: 'btn sm ghost', onclick: () => openGen(p, { action: 'route_plan', title: '重新生成故事路线候选', args: { count: 3 }, kind: 'json', onApplied: afterAi }) }, '换一批候选')));
    return box;
  }

  async function saveRoutes(candidates, route, mode) {
    const selected = Object.assign({}, route, { mode, chosenAt: new Date().toISOString() });
    try {
      const r = await api.docSet(p.id, 'routes', { candidates, selected, updatedAt: selected.chosenAt });
      p.routes = r.project.routes;
      toast(mode === 'delegate' ? `已按 AI 推荐选定「${route.name || '未命名'}」` : `已选定路线「${route.name || '未命名'}」：接下来生成的大纲会严格遵循它`, 'ok', 4200);
      remount();
    } catch (e) { toast('保存路线失败：' + e.message, 'err', 5000); }
  }

  function candidatesCard() {
    const list = Array.isArray(p.idea && p.idea.candidates) ? p.idea.candidates : [];
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, '点子池', h('span', { class: 'hint' }, list.length + ' 条 · 采纳即填入创意卡')));
    if (!list.length) box.append(h('div', { class: 'empty small', style: 'padding:18px' }, '点上方「头脑风暴」生成候选点子'));
    for (const [i, c] of list.entries()) {
      box.append(h('div', { class: 'fieldset' },
        h('div', { class: 'fs-t' }, h('b', {}, `《${c.title || '未命名'}》`), h('span', {}, c.genre || '')),
        h('div', { class: 'small', style: 'margin:2px 0 6px' }, h('b', {}, '钩子：'), c.logline || '（无）'),
        c.concept ? h('div', { class: 'small muted', style: 'margin-bottom:6px' }, c.concept.length > 160 ? c.concept.slice(0, 160) + '…' : c.concept) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm primary', onclick: async () => {
            draft.title = c.title; draft.genres = [c.genre]; draft.logline = c.logline || ''; draft.premise = c.concept || '';
            await save();
            toast(`已采纳《${c.title}》：创意卡已填入，可点右侧「深化当前创意」生成完整立项书`, 'ok', 4200);
            remount();
          } }, '采纳到创意卡'),
          h('button', { class: 'btn sm', onclick: () => openGen(p, { action: 'idea_flesh', title: `深化《${c.title}》为立项书`, args: { conceptIndex: i }, kind: 'json', onApplied: afterAi }) }, '以此深化'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            p.idea.candidates.splice(i, 1);
            await save(); remount();
          } }, '删'))));
    }
    return box;
  }

  function remount() {
    clear(root);
    mount(root, p, ctx);
  }
  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }
}
