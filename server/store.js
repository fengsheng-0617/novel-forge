'use strict';
// Project store: JSON-file persistence (data/projects/<id>.json), CRUD, doc/collection ops, undo.

const fs = require('fs');
const path = require('path');
const util = require('./util');
const { hub } = require('./events');

let DATA_DIR = '';
let projectsDir = '';
const cache = new Map();          // id -> project object (authoritative while cached)
const undoStacks = new Map();     // id -> [{label, t:'col'|'doc'|'meta', target, prev}]
const writeChains = new Map();    // id -> promise (serialize writes)

function init(dataDir) {
  DATA_DIR = dataDir;
  projectsDir = path.join(dataDir, 'projects');
  fs.mkdirSync(projectsDir, { recursive: true });
}

const validId = (id) => /^[a-z0-9_][a-z0-9_-]{0,63}$/i.test(id);
const fileOf = (id) => path.join(projectsDir, id + '.json');

function enqueueWrite(project) {
  const p = project;
  const prev = writeChains.get(p.id) || Promise.resolve();
  const next = prev.then(async () => {
    const tmp = fileOf(p.id) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(p, null, 1), 'utf8');
    fs.renameSync(tmp, fileOf(p.id));
  }).catch((e) => console.error('[store] 写盘失败', p.id, e.message));
  writeChains.set(p.id, next);
  return next;
}

function touch(p) { p.updatedAt = util.nowISO(); return p; }

function loadProject(id) {
  if (!validId(id)) return null;
  if (cache.has(id)) return cache.get(id);
  const f = fileOf(id);
  if (!fs.existsSync(f)) return null;
  try {
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    cache.set(id, p);
    return p;
  } catch (e) {
    console.error('[store] 读取项目失败', id, e.message);
    return null;
  }
}

function listProjects() {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json')); } catch (e) { return out; }
  for (const f of names) {
    const id = f.slice(0, -5);
    const p = loadProject(id);
    if (!p) continue;
    out.push({
      id: p.id, name: p.name || '未命名', desc: p.desc || '', demo: !!p.demo,
      createdAt: p.createdAt, updatedAt: p.updatedAt || '',
      status: projectStatus(p),
      counts: {
        chapters: p.rows ? p.rows.length : 0,
        written: p.rows ? p.rows.filter((r) => r.ch && r.ch.content).length : 0,
        characters: p.characters ? p.characters.length : 0,
        words: p.rows ? p.rows.reduce((a, r) => a + (r.ch && r.ch.content ? util.charCount(r.ch.content) : 0), 0) : 0,
      },
    });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}

function projectStatus(p) {
  const r = p.rows || [];
  if (r.some((x) => x.ch && x.ch.content)) return '写作中';
  if (r.length) return '已建大纲';
  if (p.characters && p.characters.length) return '人物设定中';
  if ((p.bible && p.bible.sections && p.bible.sections.length) || (p.idea && p.idea.premise)) return '设定中';
  return '灵感阶段';
}

function capWorkspace(cap) {
  // 非 novel 能力的通用「文本工作台」数据模型：源文本 + 能力专属参数 + 生成输出。
  return {
    kind: cap || 'text',
    source: [{ id: 's_' + util.uid(''), title: '', text: '', lang: '', meta: {} }], // 上传/粘贴的源文本
    params: {},                   // 能力专属参数（如 doc: {topic} / email: {recipient,goal}）
    outputs: [],                  // [{id, cap, action, label, kind, content, meta, createdAt}]
  };
}

function newProject({ name, desc, demo, cap } = {}) {
  const now = util.nowISO();
  const capId = cap && cap !== 'novel' ? String(cap) : 'novel';
  const base = {
    id: 'nf_' + util.uid(''),
    name: (name || '未命名项目').slice(0, 60),
    desc: (desc || '').slice(0, 200),
    demo: !!demo,
    cap: capId,                   // 能力：novel 默认；content/doc/email 为非小说工作台
    language: '',                 // 创作/输出语言（空=自动/跟随源，或项目设置覆盖）
    createdAt: now,
    updatedAt: now,
    settings: {},                 // 项目级模型覆盖 {providerId,model,temperature,chapterWords}
    idea: {
      title: '', genres: [], targetWords: 100000, logline: '', premise: '',
      hook: '', conflict: '', pov: '第三人称限知', tone: '', audience: '', extra: '',
      candidates: [],             // AI 头脑风暴备选池
    },
    bible: { summary: '', rules: [], sections: [], glossary: [] },
    styleGuide: { pov: '', voice: '', prose: '', dialogue: '', taboo: [], must: [], formatting: '', extra: '' },
    characters: [],
    rows: [],                     // 统一「大纲行 = 章节行」，含写作状态 ch
    continuity: { entries: [] },
    audits: [],
  };
  if (capId === 'novel') return base;
  return Object.assign(base, { workspace: capWorkspace(capId) });
}

function create(opts) {
  const p = newProject(opts);
  cache.set(p.id, p);
  touch(p);
  enqueueWrite(p);
  return p;
}

function duplicate(id, nameSuffix = '（副本）') {
  const src = loadProject(id);
  if (!src) return null;
  const p = util.clone(src);
  p.id = 'nf_' + util.uid('');
  p.demo = false;
  p.name = (p.name || '未命名') + nameSuffix;
  p.createdAt = util.nowISO();
  touch(p);
  cache.set(p.id, p);
  enqueueWrite(p);
  return p;
}

function remove(id) {
  cache.delete(id);
  undoStacks.delete(id);
  try { fs.unlinkSync(fileOf(id)); } catch (e) { /* ignore */ }
}

/** Import a full project document (e.g. demo seed). Returns the stored project. */
function importProject(proj) {
  const p = util.clone(proj);
  if (!p.id || !validId(p.id)) p.id = newProject({}).id;
  if (!cache.has(p.id) && fs.existsSync(fileOf(p.id))) p.id = 'nf_' + util.uid('');
  cache.set(p.id, p);
  touch(p);
  enqueueWrite(p);
  return p;
}

function saveNow(p) { return enqueueWrite(p); }

// ---------------- snapshot & undo ----------------

function pushUndo(p, label, t, target, prev) {
  let st = undoStacks.get(p.id);
  if (!st) { st = []; undoStacks.set(p.id, st); }
  st.push({ label, t, target, prev: util.clone(prev) });
  if (st.length > 60) st.shift();
}

function undo(p) {
  const st = undoStacks.get(p.id);
  if (!st || !st.length) return null;
  const snap = st.pop();
  if (snap.t === 'whole') {
    // 整体快照：将 p 复位为快照内容（保持引用）
    const prev = util.clone(snap.prev);
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, prev);
  } else if (snap.t === 'col') {
    const key = snap.target === 'characters' ? 'characters' : snap.target === 'rows' ? 'rows' : null;
    if (!key) return null;
    p[key] = util.clone(snap.prev);
  } else if (snap.t === 'doc') {
    util.setByPointer(p, snap.pointer, util.clone(snap.prev));
  } else if (snap.t === 'meta') {
    for (const k of Object.keys(snap.prev)) p[k] = util.clone(snap.prev[k]);
  }
  touch(p);
  saveNow(p);
  hub.emit('project.changed', { projectId: p.id, ts: Date.now(), by: 'undo' });
  return snap;
}

/** 原子操作：单条整项目快照（用于 AI 应用等复合变更），fn 内直接修改 p。 */
function transact(p, label, fn) {
  pushUndo(p, label, 'whole', null, util.clone(p));
  fn();
  touch(p);
  saveNow(p);
  hub.emit('project.changed', { projectId: p.id, ts: Date.now(), by: label });
  return p;
}

// ---------------- ops ----------------

const DOC_POINTERS = new Set(['idea', 'bible', 'styleGuide', 'continuity', 'audits', 'volumes', 'workspace', 'language']);

function docSet(p, pointer, value, tab) {
  if (!DOC_POINTERS.has(pointer)) { const e = new Error('不允许直接修改该字段'); e.status = 400; throw e; }
  pushUndo(p, '修改·' + pointer, 'doc', pointer, p[pointer]);
  p[pointer] = util.clone(value);
  touch(p);
  saveNow(p);
  hub.emit('project.changed', { projectId: p.id, ts: Date.now(), tab: tab || null });
  return p[pointer];
}

function metaPatch(p, patch, tab) {
  if (!patch || typeof patch !== 'object') return p;
  pushUndo(p, '修改项目信息', 'meta', 'settings', util.clone(p.settings || {}));
  // whitelisted top-level meta + settings overlay
  for (const k of Object.keys(patch)) {
    if (k === 'id' || k === 'createdAt' || k === 'demo' || k === 'rows' || k === 'characters' || k === 'cap') continue;
    if (k === 'settings') {
      p.settings = Object.assign({}, p.settings || {}, util.clone(patch.settings));
      continue;
    }
    p[k] = util.clone(patch[k]);
  }
  touch(p);
  saveNow(p);
  hub.emit('project.changed', { projectId: p.id, ts: Date.now(), tab: tab || null });
  return p;
}

/** Collection op on 'characters' | 'rows'. patch supports dotted keys for deep fields (e.g. 'ch.content'). */
function colOp(p, target, op, body, tab) {
  const key = target === 'characters' ? 'characters' : target === 'rows' ? 'rows' : null;
  if (!key) { const e = new Error('未知集合: ' + target); e.status = 400; throw e; }
  const arr = p[key] || [];
  pushUndo(p, `${target === 'rows' ? '章节大纲' : '人物'}·${opName(op)}`, 'col', target, arr);

  let item;
  switch (op) {
    case 'set': {
      if (!Array.isArray(body.value)) { const e = new Error('set 需要 value 数组'); e.status = 400; throw e; }
      p[key] = util.clone(body.value);
      break;
    }
    case 'add': {
      item = util.clone(body.item || {});
      if (!item.id) item.id = util.uid('i_');
      if (key === 'characters') {
        item.name = item.name || '新人物';
        item.role = item.role || '配角';
      } else if (key === 'rows') {
        const last = arr[arr.length - 1];
        item.vol = item.vol != null ? item.vol : last ? last.vol : 1;
        item.no = item.no != null ? item.no : last ? (last.no + 1) : 1;
        item.title = item.title || `第${item.no}章`;
        item.beats = Array.isArray(item.beats) ? item.beats : [];
        item.cast = Array.isArray(item.cast) ? item.cast : [];
        item.pov = item.pov || '';
        item.words = item.words || 0;
        item.ch = Object.assign({ status: 'plan', summary: '', content: '', words: 0, model: '', updatedAt: '', history: [] }, item.ch || {});
      }
      const at = typeof body.at === 'number' ? body.at : arr.length;
      arr.splice(Math.min(Math.max(at, 0), arr.length), 0, item);
      break;
    }
    case 'update': {
      const i = arr.findIndex((x) => x.id === body.id);
      if (i < 0) { const e = new Error('找不到目标条目'); e.status = 404; throw e; }
      const cur = arr[i];
      for (const k of Object.keys(body.patch || {})) {
        if (k === 'id') continue;
        const v = body.patch[k];
        if (k.includes('.')) util.setByPointer(cur, k, util.clone(v));
        else cur[k] = util.clone(v);
      }
      break;
    }
    case 'remove': {
      const i = arr.findIndex((x) => x.id === body.id);
      if (i < 0) { const e = new Error('找不到目标条目'); e.status = 404; throw e; }
      arr.splice(i, 1);
      break;
    }
    case 'move': {
      const from = arr.findIndex((x) => x.id === body.id);
      if (from < 0) { const e = new Error('找不到目标条目'); e.status = 404; throw e; }
      const [moved] = arr.splice(from, 1);
      let to = typeof body.to === 'number' ? body.to : from;
      to = Math.min(Math.max(to, 0), arr.length);
      arr.splice(to, 0, moved);
      break;
    }
    default: {
      const e = new Error('未知操作: ' + op); e.status = 400; throw e;
    }
  }
  touch(p);
  saveNow(p);
  hub.emit('project.changed', { projectId: p.id, ts: Date.now(), tab: tab || null });
  return p[key];
}

function opName(op) {
  return { set: '整体替换', add: '新增', update: '修改', remove: '删除', move: '排序' }[op] || op;
}

function countsOf(p) {
  return {
    rows: (p.rows || []).length,
    written: (p.rows || []).filter((r) => r.ch && r.ch.content).length,
    chars: (p.characters || []).length,
    words: (p.rows || []).reduce((a, r) => a + (r.ch && r.ch.content ? util.charCount(r.ch.content) : 0), 0),
  };
}

module.exports = {
  init, validId, listProjects, loadProject, create, duplicate, remove, saveNow, importProject,
  docSet, metaPatch, colOp, undo, transact, countsOf, newProject, capWorkspace,
};
