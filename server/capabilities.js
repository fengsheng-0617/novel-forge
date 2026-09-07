'use strict';
// capabilities.js — 全能 AI 创作工具的「能力注册表」。
// 一个能力（capability）= 一条独立的创作/编辑流水线：它声明自己提供哪些生成动作（action key，
// 由 actions.js 实现）与元数据，供 API 与插件层批量枚举、挂载、与后续注册扩展。
// 设计要点：能力只做「注册与描述」，具体动作仍复用 actions.js 的生成/应用引擎，
// 这样 novel 之外的 content/doc/email 不需要另起一套 LLM 管线。

const CAPS = [];
const byId = new Map();

/**
 * 注册（或原地更新）一个能力。
 * @param {object} cap {id, name, label?, kind?, builtin?, actions:[{key,label,about?,kind?}], tools?:[string]}
 * @returns 已注册的能力对象
 */
function registerCapability(cap) {
  if (!cap || !cap.id) throw new Error('能力必须带 id');
  const existing = byId.get(cap.id);
  if (existing) {
    Object.assign(existing, cap);
    return existing;
  }
  const clean = {
    id: String(cap.id),
    name: String(cap.name || cap.id),
    label: String(cap.label || cap.name || cap.id),
    kind: String(cap.kind || 'studio'),
    builtin: !!cap.builtin,
    actions: Array.isArray(cap.actions) ? cap.actions.map((a) => ({
      key: String(a.key || a), about: String(a.about || '') || undefined,
      label: String(a.label || a.key), kind: String(a.kind || '') || undefined,
    })) : [],
    tools: Array.isArray(cap.tools) ? cap.tools.map(String) : [],
  };
  byId.set(clean.id, clean);
  CAPS.push(clean);
  return clean;
}

function getCapability(id) { return byId.get(id) || null; }

function listCapabilities() { return CAPS.map((c) => ({ ...c })); }

module.exports = { registerCapability, getCapability, listCapabilities };
