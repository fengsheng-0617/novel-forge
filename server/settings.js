'use strict';
// Settings load/save + template registry merge (server/data/settings.json)

const fs = require('fs');
const path = require('path');
const { defaultSettings } = require('./defaults');
const util = require('./util');

let settingsPath = '';
let settings = null;
let saveChain = Promise.resolve();

function init(dataDir) {
  settingsPath = path.join(dataDir, 'settings.json');
  settings = defaultSettings();
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings = deepMerge(defaultSettings(), raw);
    }
  } catch (e) {
    console.error('[settings] 读取失败，使用默认设置:', e.message);
  }
  // fill provider presets that don't exist yet (new built-ins appear on upgrade)
  const have = new Set((settings.providers || []).map((p) => p.id));
  for (const pre of defaultSettings().providers) {
    if (!have.has(pre.id)) settings.providers.push(pre);
  }
  return settings;
}

function deepMerge(base, extra) {
  if (extra == null || typeof extra !== 'object' || Array.isArray(extra)) return util.clone(extra == null ? {} : extra);
  const out = util.clone(base || {});
  for (const k of Object.keys(extra)) {
    if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) && typeof extra[k] === 'object' && !Array.isArray(extra[k])) {
      out[k] = deepMerge(out[k], extra[k]);
    } else {
      out[k] = util.clone(extra[k]);
    }
  }
  return out;
}

function get() { return settings; }

function save() {
  const s = util.clone(settings);
  saveChain = saveChain.then(() => new Promise((res) => {
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath + '.tmp', JSON.stringify(s, null, 2), 'utf8');
      fs.renameSync(settingsPath + '.tmp', settingsPath);
    } catch (e) { console.error('[settings] 保存失败:', e.message); }
    res();
  }));
  return saveChain;
}

/** Update whole settings (client PUT). Returns sanitized settings. */
function update(next) {
  settings = deepMerge(defaultSettings(), next || {});
  return settings;
}

/** Merge built-in template defaults into stored templates (adds missing by key, never overwrites user edits). */
function mergeTemplates(builtinList) {
  const list = Array.isArray(settings.templates) ? settings.templates : [];
  const have = new Set(list.map((t) => t.key));
  for (const t of builtinList) {
    if (!have.has(t.key)) list.push(util.clone(t));
  }
  settings.templates = list;
  return list;
}

function resetTemplates(builtinList) {
  settings.templates = util.clone(builtinList || []);
  return settings.templates;
}

function getTemplate(key) {
  const list = settings.templates || [];
  const t = list.find((x) => x.key === key);
  if (t) return t;
  // built-in fallback if stored copy missing
  try {
    const builtin = require('./templates').TEMPLATES.find((x) => x.key === key);
    return builtin || null;
  } catch (e) { return null; }
}

function getProvider(id) {
  return (settings.providers || []).find((p) => p.id === id) || null;
}

function enabledProviders() {
  return (settings.providers || []).filter((p) => p.enabled !== false);
}

module.exports = { init, get, save, update, mergeTemplates, resetTemplates, getTemplate, getProvider, enabledProviders };
