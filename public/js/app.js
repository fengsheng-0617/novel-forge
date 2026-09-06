// app.js — 织文 NovelForge 前端入口：状态/路由/顶栏/项目栏/SSE/视图调度
'use strict';
import { h, clear, toast, debounce, confirmDialog } from './ui.js';
import { api, TAB_ID, fmtTime } from './api.js';
import { openGen, closeGenPanel, setEngineProviders } from './components/genPanel.js';

import * as viewLibrary from './views/library.js';
import * as viewIdea from './views/idea.js';
import * as viewBible from './views/bible.js';
import * as viewChars from './views/characters.js';
import * as viewOutline from './views/outline.js';
import * as viewWriting from './views/writing.js';
import * as viewAudit from './views/audit.js';
import * as viewExport from './views/exportView.js';
import * as viewSettings from './views/settings.js';

// ---------- 路由与阶段 ----------
export const STAGES = [
  { key: 'idea', label: '灵感点子', n: '①', views: viewIdea, p: 'idea' },
  { key: 'bible', label: '世界观设定', n: '②', views: viewBible, p: 'bible' },
  { key: 'characters', label: '人物群像', n: '③', views: viewChars, p: 'characters' },
  { key: 'outline', label: '卷章大纲', n: '④', views: viewOutline, p: 'outline' },
  { key: 'writing', label: '章节写作', n: '⑤', views: viewWriting, p: 'writing' },
  { key: 'audit', label: '审校连续性', n: '⑥', views: viewAudit, p: 'audit' },
];
export const EXTRA_VIEWS = [
  { key: 'export', label: '导出成书', n: '⇩', views: viewExport, p: 'export' },
];

// ---------- 全局状态 ----------
export const state = {
  settings: null,
  projects: [],
  project: null,
  pid: null,
  stage: 'lib',
  pendingRowId: null,
  pipeline: { status: 'idle', last: null },
  editing: false,      // 输入框聚焦（防刷新打断编辑）
  stale: false,        // 有后台更新待刷新
};

const viewInst = { unmounts: [], abort: null };

// ---------- 工具 ----------
export const LS_LAST = 'nf_last_project';

export function toastErr(e) {
  toast('⚠ ' + (e && e.message ? e.message : String(e)), 'err', 6000);
  console.error(e);
}

export function stageSummary(p) {
  if (!p) return {};
  const rows = p.rows || [];
  return {
    idea: (p.idea && p.idea.title && p.idea.premise) ? '已立项' : '待深化',
    ideaN: (p.idea && p.idea.candidates || []).length,
    bible: (p.bible && p.bible.sections || []).length ? `${(p.bible.sections || []).length} 节设定` : '未生成',
    charsN: (p.characters || []).length,
    rowsN: rows.length,
    writtenN: rows.filter((r) => r.ch && r.ch.content).length,
    auditN: (p.continuity && p.continuity.entries || []).length,
  };
}

// ---------- 编辑守卫 ----------
function wireEditGuard() {
  document.addEventListener('focusin', () => { state.editing = true; });
  document.addEventListener('focusout', () => setTimeout(() => { state.editing = false; }, 180));
}

// ---------- 数据刷新 ----------
let reloading = null;
export async function reloadProject(opts = {}) {
  if (!state.pid) return;
  if (reloading) return reloading;
  reloading = (async () => {
    try {
      const r = await api.project(state.pid);
      state.project = r.project;
      renderShell();
    } catch (e) {
      if (e.status === 404) { state.project = null; location.hash = '#/'; }
      else toastErr(e);
    } finally { reloading = null; }
  })();
  return reloading;
}

export function onSelfChange() {
  // 本标签页发起的修改：同步内存对象用最新 server 返回即可；不自动重绘
  state.stale = false;
}

let lastChange = 0;
function handleProjectChanged(ev) {
  if (!state.project || ev.projectId !== state.project.id) return;
  if (ev.tab === TAB_ID) return; // 自己改的，无需重绘
  lastChange = Date.now();
  if (state.editing) { state.stale = true; renderPbar(); return; }
  // 高频合并（流水线逐章写入时）
  clearTimeout(handleProjectChanged._t);
  handleProjectChanged._t = setTimeout(() => reloadProject({ silent: true }), 260);
}

// ---------- 顶栏 ----------
function renderTopbar() {
  const tb = document.getElementById('topbar');
  clear(tb);
  const brand = h('div', { class: 'brand', onclick: () => { location.hash = '#/'; } },
    h('div', { class: 'logo' }, '文'),
    h('div', {}, h('b', {}, '织文 NovelForge'), h('small', {}, 'AI 小说创作工坊')));
  tb.append(brand, h('div', { class: 'top-spacer' }));

  if (state.project) {
    const pname = h('b', { style: 'font-size:15px' }, state.project.name);
    tb.append(h('div', { class: 'small muted', style: 'margin-right:6px' }, '当前：'), pname);
  }
  tb.append(pipelineChip());
  const undoBtn = h('button', { class: 'undo-btn', title: '撤销上一步（AI 应用/结构修改）', onclick: doUndo }, '↶ 撤销');
  tb.append(undoBtn);
  const logBtn = h('button', { class: 'undo-btn', onclick: toggleLogs }, '日志');
  tb.append(logBtn);
  const settingsBtn = h('button', { class: 'undo-btn', onclick: () => { location.hash = '#/settings'; } }, '⚙ 设置');
  tb.append(settingsBtn);
}

async function doUndo() {
  if (!state.project) return;
  try {
    const r = await api.undo(state.project.id);
    toast(r.undone ? '已撤销：' + r.undone : '没有可撤销的操作', r.undone ? 'ok' : 'warn');
    await reloadProject();
  } catch (e) { toastErr(e); }
}

function pipelineChip() {
  const st = state.pipeline;
  const chip = h('div', { class: 'chip ' + (st.status === 'running' ? 'running' : st.status === 'error' ? 'error' : st.status === 'done' || st.status === 'stopped' ? 'done' : '') },
    h('span', { class: 'dot' }));
  if (st.status === 'idle') {
    chip.append('流水线空闲');
    if (st.last) chip.append(h('span', { class: 'faint' }, ` · 上次：${st.last.status}${st.last.done ? '(' + st.last.done + '步)' : ''}`));
  } else {
    chip.append(`${st.status === 'running' ? '连载中' : st.status === 'paused' ? '已暂停' : st.status === 'stopping' ? '停止中' : st.status} · ${st.label || ''}`);
    if (st.done != null) chip.append(h('b', {}, `${st.done}${st.total ? '/' + st.total : ''}`));
  }
  if (st.status === 'running' || st.status === 'paused' || st.status === 'stopping') {
    const wrap = h('div', { class: 'btn-row', style: 'gap:4px' });
    if (st.status === 'running') wrap.append(h('button', { class: 'btn sm', onclick: () => pipe('pause') }, '暂停'));
    if (st.status === 'paused') wrap.append(h('button', { class: 'btn sm', onclick: () => pipe('resume') }, '继续'));
    wrap.append(h('button', { class: 'btn sm danger', onclick: () => pipe('stop') }, '停止'));
    return h('span', { style: 'display:flex;gap:6px;align-items:center' }, chip, wrap);
  }
  return chip;
}

async function pipe(cmd) {
  try {
    if (cmd === 'pause') await api.pipelinePause();
    else if (cmd === 'resume') await api.pipelineResume();
    else if (cmd === 'stop') await api.pipelineStop();
  } catch (e) { toastErr(e); }
}

// ---------- 项目侧栏 ----------
function renderPbar() {
  const bar = document.getElementById('pbar');
  if (!state.project) { bar.hidden = true; return; }
  bar.hidden = false;
  clear(bar);
  const p = state.project;
  const sum = stageSummary(p);
  // 书名行：显示态（点击书名或"改名"进入编辑）/ 编辑态（输入+保存/取消，Enter 保存 Esc 取消）
  const nameRow = h('div', {});
  let editingName = false;
  const paintName = () => {
    clear(nameRow);
    if (!editingName) {
      nameRow.append(
        h('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:4px' },
          h('b', { title: '点击重命名', style: 'font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer',
            onclick: () => { editingName = true; paintName(); } }, p.name),
          h('span', { class: 'demo-flag', style: 'position:static;flex:0 0 auto' }, p.demo ? '示例' : ''),
          h('button', { class: 'btn sm', style: 'margin-left:auto', title: '重命名作品', onclick: () => { editingName = true; paintName(); } }, '改名')));
    } else {
      const inp = h('input', { type: 'text', value: p.name, placeholder: '作品名', style: 'flex:1;min-width:0' });
      const save = async () => {
        const v = inp.value.trim();
        editingName = false;
        if (v && v !== state.project.name) {
          try { await api.metaPatch(p.id, { patch: { name: v } }); } catch (e) { toastErr(e); }
        }
        await reloadProject();
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        else if (e.key === 'Escape') { editingName = false; paintName(); }
      });
      nameRow.append(h('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:4px' },
        inp,
        h('button', { class: 'btn sm primary', onclick: save }, '保存'),
        h('button', { class: 'btn sm', onclick: () => { editingName = false; paintName(); } }, '取消')));
      inp.focus();
      inp.select();
    }
  };
  paintName();
  bar.append(
    nameRow,
    h('div', { class: 'small faint', style: 'margin-bottom:8px' },
      `已写 ${sum.writtenN}/${sum.rowsN || 0} 章 · ${sum.charsN} 角色`),
  );

  const title = h('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
    h('span', { class: 'small muted', style: 'font-weight:600' }, '创作流水线'),
    h('span', { style: 'display:flex;gap:4px' },
      h('button', { class: 'btn sm', title: '复制项目', onclick: () => dupProject() }, '复制'),
      h('button', { class: 'btn sm danger', title: '删除项目', onclick: () => delProject() }, '删除')));
  bar.append(title);

  const pills = h('div', { style: 'margin-top:6px' });
  for (const s of [...STAGES, ...EXTRA_VIEWS]) {
    const active = state.stage === s.key;
    const badge = s.key === 'idea' ? sum.ideaN
      : s.key === 'bible' ? sum.bible
      : s.key === 'characters' ? (sum.charsN ? sum.charsN + ' 人' : '')
      : s.key === 'outline' ? (sum.rowsN ? sum.rowsN + ' 章' : '')
      : s.key === 'writing' ? (sum.writtenN ? `${sum.writtenN}/${sum.rowsN}` : '')
      : s.key === 'audit' ? (sum.auditN ? sum.auditN + ' 条' : '') : '';
    pills.append(h('div', { class: 'stage-pill ' + (active ? 'active' : ''), onclick: () => { location.hash = '#/p/' + p.id + '/' + s.p; } },
      h('span', { class: 'num' }, s.n),
      h('span', {}, s.label),
      badge ? h('span', { class: 'cnt' }, String(badge)) : null));
  }
  bar.append(pills);

  if (state.stale) {
    bar.append(h('button', { class: 'btn sm', style: 'width:100%;margin:4px 0', onclick: async () => { state.stale = false; await reloadProject(); } }, '🔄 有后台更新，点击刷新'));
  }
  bar.append(pipelinePanel(p));
}

async function dupProject() {
  if (!state.project) return;
  try {
    const r = await api.duplicateProject(state.project.id);
    toast('已复制项目', 'ok');
    await refreshLibrary();
    location.hash = '#/p/' + r.project.id + '/idea';
  } catch (e) { toastErr(e); }
}
async function delProject() {
  const p = state.project;
  if (!p) return;
  const yes = await confirmDialog('删除项目', `确定删除《${p.name}》？项目数据将被永久移除（文件级删除，不可恢复）。建议先导出 JSON 备份。`, { okText: '删除', danger: true });
  if (!yes) return;
  try {
    await api.deleteProject(p.id);
    state.project = null; state.pid = null;
    localStorage.removeItem(LS_LAST);
    location.hash = '#/';
  } catch (e) { toastErr(e); }
}

function pipelinePanel(p) {
  const box = h('div', { class: 'card', style: 'padding:10px 12px;margin-top:6px' });
  const st = state.pipeline;
  box.append(h('div', { class: 'small muted', style: 'font-weight:600;margin-bottom:6px' }, '⚡ 无人值守流水线'));
  if (st.status === 'running' || st.status === 'paused' || st.status === 'stopping') {
    box.append(h('div', { class: 'small', style: 'margin-bottom:6px;word-break:break-all' }, `${st.status === 'running' ? '▶' : st.status === 'paused' ? '⏸' : '⏹'} ${st.label || ''}`));
    box.append(h('div', { class: 'btn-row' },
      st.status === 'running' ? h('button', { class: 'btn sm', onclick: () => pipe('pause') }, '暂停') : null,
      st.status === 'paused' ? h('button', { class: 'btn sm', onclick: () => pipe('resume') }, '继续') : null,
      h('button', { class: 'btn sm danger', onclick: () => pipe('stop') }, '停止')));
  } else {
    const msg = st.last && st.last.projectId === p.id
      ? h('div', { class: 'small faint', style: 'margin:2px 0 8px' }, `上次：${st.last.label || st.last.status}${st.last.error ? '（' + st.last.error.slice(0, 40) + '）' : ''}`) : null;
    box.append(msg || h('div', { class: 'small faint', style: 'margin-bottom:8px' }, '把当前阶段推进到全书成稿：'));
    box.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', onclick: () => startPipe(p.id, 'full') }, '▶ 一键全自动'),
      h('button', { class: 'btn sm', onclick: () => startPipe(p.id, 'write') }, '📖 大纲→连载全文')));
  }
  return box;
}

async function startPipe(pid, mode) {
  const p = state.project;
  const modeName = mode === 'full' ? '「一键全自动」' : '「大纲→连载全文」';
  const yes = await confirmDialog('启动无人值守流水线',
    `将以当前全局默认引擎${mode === 'full' ? '：从点子开始补全 设定→人物→大纲→逐章连载 的整条链路' : '：把大纲中尚未创作的章节按顺序全部写完并逐章归档记忆'}。\n\n确认启动${modeName}？`,
    { okText: '启动' });
  if (!yes) return;
  try {
    await api.pipelineStart({ projectId: pid, mode });
    toast('流水线已启动（可随时暂停/停止）', 'ok');
    pollPipeline();
  } catch (e) { toastErr(e); }
}

let pipelinePolling = false;
async function pollPipeline() {
  if (pipelinePolling) return;
  pipelinePolling = true;
  try {
    const r = await api.pipelineStatus();
    state.pipeline = r.pipeline;
    renderShell();
  } finally { pipelinePolling = false; }
}

// ---------- 日志抽屉 ----------
let logBox = null;
function toggleLogs() {
  if (!logBox) {
    logBox = h('div', { id: 'log-root' },
      h('div', { style: 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)' },
        h('b', { class: 'small' }, '运行日志'),
        h('button', { class: 'btn sm', style: 'margin-left:auto', onclick: () => clearLogs() }, '清屏'),
        h('button', { class: 'btn sm', onclick: () => { logBox.classList.remove('on'); } }, '收起')));
    document.body.appendChild(logBox);
  }
  logBox.classList.toggle('on');
  if (logBox.classList.contains('on')) fetchLogs();
}
function clearLogs() {
  const list = logBox.querySelector('.log-list');
  if (list) list.innerHTML = '';
}
function logLine(entry) {
  if (!logBox) return;
  let list = logBox.querySelector('.log-list');
  if (!list) {
    list = h('div', { class: 'log-list' });
    logBox.append(list);
  }
  list.append(h('div', { class: 'log-line ' + (entry.kind || '') },
    h('span', { class: 'tm' }, fmtTime(entry.ts)),
    h('span', {}, entry.text)));
  while (list.children.length > 400) list.firstChild.remove();
  list.scrollTop = list.scrollHeight;
}
async function fetchLogs() {
  try {
    const r = await api.logs();
    clearLogs();
    for (const e of r.logs) logLine(e);
  } catch (e) { /* ignore */ }
}

// ---------- 视图渲染 ----------
function renderShell() {
  renderTopbar();
  renderPbar();
  const view = document.getElementById('view');
  const p = state.project;
  const stage = state.stage;
  if (stage === 'lib') {
    viewLibrary.mount(view, p, { reload: renderShell });
    return;
  }
  if (stage === 'settings') {
    viewSettings.mount(view, null, { reload: renderShell });
    return;
  }
  if (!p) { viewLibrary.mount(view, null, { reload: renderShell }); return; }
  const s = [...STAGES, ...EXTRA_VIEWS].find((x) => x.key === stage);
  if (!s) { viewLibrary.mount(view, null, { reload: renderShell }); return; }
  s.views.mount(view, p, mkCtx());
  // 章节页等长页回到顶部
}

let ctxCache = null;
function mkCtx() {
  const p = () => state.project;
  return ctxCache = {
    project: p,
    pendingRowId: state.pendingRowId,
    reloadProject,
    onSelfChange,
    openGen: (cfg) => openGen(p(), cfg),
    toast: (m, k) => toast(m, k),
    err: toastErr,
    stage: state.stage,
  };
}

// ---------- 路由 ----------
function parseHash() {
  const hsh = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!hsh.length) return { stage: 'lib' };
  if (hsh[0] === 'settings') return { stage: 'settings' };
  if (hsh[0] === 'p' && hsh[1]) {
    const map = {};
    for (const s of [...STAGES, ...EXTRA_VIEWS]) map[s.p] = s.key;
    const r = { stage: map[hsh[2]] || 'idea', pid: hsh[1] };
    if (hsh[3] && hsh[2] === 'writing') r.rowId = hsh[3];
    return r;
  }
  return { stage: 'lib' };
}

async function route() {
  const r = parseHash();
  closeGenPanel();
  if (r.stage === 'lib') {
    state.pid = null; state.project = null;
    state.stage = 'lib';
    localStorage.removeItem(LS_LAST);
    await refreshLibrary();
    renderShell();
    return;
  }
  if (r.stage === 'settings') {
    state.pid = null; state.project = null;
    state.stage = 'settings';
    renderShell();
    return;
  }
  state.stage = r.stage;
  state.pid = r.pid;
  state.pendingRowId = r.rowId || null;
  try {
    const pr = await api.project(r.pid);
    state.project = pr.project;
    localStorage.setItem(LS_LAST, r.pid);
    renderShell();
  } catch (e) {
    if (e.status === 404) { location.hash = '#/'; return; }
    toastErr(e);
  }
}

export async function refreshLibrary() {
  try {
    const r = await api.projects();
    state.projects = r.projects;
  } catch (e) { /* lib 会自己报错 */ }
}

// ---------- SSE ----------
function connectEvents() {
  api.connectEvents({
    log: (entry) => logLine(entry),
    pipeline: (p) => {
      state.pipeline = p;
      const bar = document.getElementById('pbar');
      renderTopbar();
      if (bar && !bar.hidden) renderPbar();
      const done = ['done', 'stopped', 'error'].includes(p.status);
      if (done && state.project && p.last && p.last.projectId === state.project.id) {
        // 流水线收尾：若当前正展示该项目的写作页等，静默刷新一次
        if (!state.editing) setTimeout(() => reloadProject({ silent: true }), 300);
        else state.stale = true;
      }
    },
    projectChanged: handleProjectChanged,
    projectDeleted: (ev) => {
      if (state.project && ev.projectId === state.project.id) { location.hash = '#/'; }
    },
    settingsChanged: () => { /* 设置页自行处理 */ },
  });
}

// ---------- boot ----------
async function boot() {
  wireEditGuard();
  try {
    const [s, a, pl] = await Promise.all([api.settings(), api.actions(), api.pipelineStatus()]);
    state.settings = s.settings;
    state.actions = a.actions;
    state.pipeline = pl.pipeline;
    setEngineProviders(state.settings.providers);
  } catch (e) {
    console.error('boot 失败', e);
  }
  connectEvents();
  window.addEventListener('hashchange', route);
  window.addEventListener('nf-settings-saved', (e) => {
    if (e.detail) {
      state.settings = e.detail;
      setEngineProviders(e.detail.providers || []);
    }
  });
  // 起始路由：无 hash 时优先回到上次项目，否则项目库；始终走统一路由（支持直链深链）
  if (!location.hash || location.hash === '#/') {
    const last = localStorage.getItem(LS_LAST);
    if (last) location.hash = '#/p/' + last + '/idea';
    else location.hash = '#/';
  }
  await route();
}

document.addEventListener('DOMContentLoaded', boot);
