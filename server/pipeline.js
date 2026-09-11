'use strict';
// pipeline.js — 无人值守自动流水线（串行执行 生成→应用 步骤，SSE 推送状态）。
// 模式：
//   full  —— 从当前状态补全整条链：点子(必要时先头脑风暴)→立项→设定→人物→故事路线→大纲→逐章连载
//   write —— 仅「大纲→章节正文」无人值守连载（每章自动摘要/连续性记忆按全局设置）
// 并发：同一时间仅一条流水线；停止=中止当前模型调用；暂停=当步结束后挂起。

const store = require('./store');
const settingsMod = require('./settings');
const actionsMod = require('./actions');
const { log, hub } = require('./events');
const util = require('./util');

let active = null;
let lastFinished = null;

function snapshot() {
  if (!active) {
    return { status: 'idle', projectId: null, last: lastFinished ? Object.assign({}, lastFinished) : null };
  }
  const a = active;
  return {
    status: a.state.status, projectId: a.projectId, mode: a.mode,
    label: a.state.label || '', done: a.state.done, step: a.state.step,
    error: a.state.error || null,
    startedAt: a.state.startedAt || null, finishedAt: a.state.finishedAt || null,
  };
}

function markFinished(statusStr, label, errorMsg) {
  const a = active;
  if (!a) return;
  a.state.status = statusStr;
  a.state.label = label;
  a.state.error = errorMsg || null;
  a.state.finishedAt = util.nowISO();
  const snap = {
    status: statusStr, projectId: a.projectId, mode: a.mode,
    label, done: a.state.done, step: a.state.step, error: a.state.error,
    startedAt: a.state.startedAt, finishedAt: a.state.finishedAt,
  };
  lastFinished = snap;
  broadcast();
  if (active === a) active = null;
}
function broadcast() {
  const s = snapshot();
  hub.emit('pipeline.status', s);
  return s;
}

/** 基于当前项目状态求步骤清单（每轮动态重算，完成后自动消失）。 */
function planSteps(project, mode, autoSummary) {
  const steps = [];
  const idea = project.idea || {};
  const fleshed = idea.premise && idea.title;
  if (mode === 'full') {
    if (!fleshed) {
      if (!(idea.candidates || []).length) steps.push({ action: 'idea_brainstorm', args: {}, label: '头脑风暴点子池' });
      steps.push({ action: 'idea_flesh', args: { conceptIndex: 0 }, label: '深化创意立项书' });
    }
    const bible = project.bible || {};
    if (!(bible.sections || []).length && !bible.summary) {
      steps.push({ action: 'bible_generate', args: {}, label: '生成世界观设定' });
    }
    if (!(project.characters || []).length) {
      steps.push({ action: 'characters_generate', args: { count: 10 }, label: '生成人物群像' });
    }
    if (!(project.rows || []).length) {
      // 生成大纲前先产出「故事路线 + 大纲思路」候选；无人值守时以 AI 推荐路线为纲（大纲会遵循它）
      const routes = project.routes || {};
      if (!routes.selected && !(routes.candidates || []).length) {
        steps.push({ action: 'route_plan', args: { count: 3 }, label: '生成故事路线候选（大纲将遵循推荐路线）' });
      }
      steps.push({ action: 'outline_generate', args: {}, label: '生成全书大纲' });
    }
  }
  for (const row of project.rows || []) {
    if (!row.ch || !row.ch.content) {
      steps.push({ action: 'chapter_write', rowId: row.id, label: `撰写第${row.no}章《${row.title || '?'}》` });
    }
  }
  // 记忆归档：凡有正文但尚未归档（无对应 chapterNo 记忆条目）的行，且开启 autoSummary
  if (autoSummary) {
    const archivedNos = new Set(((project.continuity && project.continuity.entries) || []).map((e) => e.chapterNo));
    for (const row of project.rows || []) {
      if (row.ch && row.ch.content && !archivedNos.has(row.no) && !steps.some((s) => s.action === 'chapter_summary' && s.rowId === row.id)) {
        steps.push({ action: 'chapter_summary', rowId: row.id, label: `第${row.no}章记忆归档` });
      }
    }
  }
  return steps;
}

function stepKey(s) {
  return (s.action === 'chapter_write' || s.action === 'chapter_summary') ? `${s.action}#${s.rowId}` : `build#${s.action}`;
}

async function run() {
  const a = active;
  if (!a) return;
  const project0 = store.loadProject(a.projectId);
  a.state.status = 'running';
  a.state.startedAt = util.nowISO();
  a.state.total = project0 ? planSteps(project0, a.mode, true).length : 1;
  broadcast();

  const skipped = new Set();
  let guard = 0;
  while (!a.cancelled) {
    // 暂停门
    if (a.paused) {
      a.state.status = 'paused';
      a.state.label = '已暂停（每步完成后可恢复）';
      broadcast();
      await new Promise((resolve) => { a.waiter = resolve; });
      a.waiter = null;
      if (a.cancelled) break;
      a.state.status = 'running';
      broadcast();
    }
    const project = store.loadProject(a.projectId);
    if (!project) { markFinished('error', '项目已不存在', '项目已不存在'); return; }
    const autoSummary = !!settingsMod.get().pipeline.autoSummary;
    const next = (planSteps(project, a.mode, autoSummary) || []).find((s) => !skipped.has(stepKey(s)));
    if (!next) break;
    if (++guard > 600) { markFinished('error', '步数超限保护（可能循环未收敛）', '步数超限保护（可能循环未收敛）'); return; }

    const controller = new AbortController();
    a.controller = controller;
    a.state.label = next.label;
    a.state.step = a.state.done + 1;
    broadcast();
    try {
      const args = Object.assign({}, next.args || {}, next.rowId ? { rowId: next.rowId } : {});
      const genRes = await actionsMod.generate({
        projectId: a.projectId, action: next.action, args,
        stream: false, signal: controller.signal,
        providerId: a.providerId || undefined, model: a.model || undefined,
        temperature: a.temperature,
      });
      if (a.cancelled) break;
      await actionsMod.applyResult(a.projectId, genRes.result.id, { rowId: next.rowId });
      a.state.done += 1;
      a.state.lastOk = next.label;
      log('chain', `✓ ${next.label}`, a.projectId);
    } catch (e) {
      if (a.cancelled || (e && e.cancelled)) break;
      const msg = e.message || '未知错误';
      log('chain', `✗ ${next.label}：${msg}`, a.projectId);
      if (!settingsMod.get().pipeline.continueOnError) {
        a.controller = null;
        markFinished('error', `${next.label} 失败`, `${next.label} 失败：${msg}`);
        return;
      }
      skipped.add(stepKey(next));
      a.state.done += 1;
    }
    a.controller = null;
    broadcast();
  }

  markFinished(a.cancelled ? 'stopped' : 'done',
    a.cancelled ? `已停止（已完成 ${a.state.done} 步）` : `全部完成（共 ${a.state.done} 步）`, null);
  log('chain', a.cancelled ? `流水线已停止（完成 ${a.state.done} 步）` : `流水线完成（共 ${a.state.done} 步）`, a.projectId);
}

const api = {
  start({ projectId, mode = 'full', providerId, model, temperature }) {
    if (active && (active.state.status === 'running' || active.state.status === 'paused')) {
      const e = new Error('已有流水线在运行中：请先等待完成或停止'); e.status = 409; throw e;
    }
    const project = store.loadProject(projectId);
    if (!project) { const e = new Error('项目不存在'); e.status = 404; throw e; }
    if (mode === 'write' && !(project.rows || []).length) {
      const e = new Error('尚无大纲：请先生成大纲（或使用「一键全自动」从头跑）'); e.status = 400; throw e;
    }
    const a = active = {
      projectId, mode,
      providerId: providerId || '', model: model || '', temperature,
      state: { status: 'queued', label: '准备中…', done: 0, step: 0, total: 0, error: null, startedAt: null, finishedAt: null },
      cancelled: false, paused: false, controller: null, waiter: null,
    };
    broadcast();
    setTimeout(() => { if (active === a) run(); }, 30);
    return snapshot();
  },

  pause() {
    if (!active) { const e = new Error('没有运行中的流水线'); e.status = 400; throw e; }
    if (active.state.status !== 'running') { const e = new Error('流水线当前不可暂停'); e.status = 400; throw e; }
    active.paused = true;
    return broadcast();
  },

  resume() {
    if (!active) { const e = new Error('没有暂停中的流水线'); e.status = 400; throw e; }
    if (active.state.status !== 'paused') { const e = new Error('流水线不在暂停状态'); e.status = 400; throw e; }
    active.paused = false;
    if (active.waiter) { const w = active.waiter; active.waiter = null; w(); }
    return snapshot();
  },

  stop() {
    if (!active) { const e = new Error('没有运行中的流水线'); e.status = 400; throw e; }
    const a = active;
    a.cancelled = true;
    a.paused = false;
    if (a.controller) { try { a.controller.abort(); } catch (x) {} }
    if (a.waiter) { const w = a.waiter; a.waiter = null; w(); }
    a.state.status = 'stopping';
    broadcast();
    return snapshot();
  },

  status() { return snapshot(); },
};

module.exports = api;
