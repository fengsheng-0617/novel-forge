// ui.js — DOM 小工具（无框架、防注入：默认 textContent）
'use strict';
import { t } from './i18n.js';

/** 创建元素: h('div', {class:'x', onclick}, 'text'|node|[...]) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v; // 仅限白名单静态 HTML
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'disabled') el.disabled = !!v;
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  // DOM 创建的 textarea 不会从子文本初始化 value，需显式设置
  if (tag.toLowerCase() === 'textarea' && !('value' in (attrs || {}))) {
    el.value = el.textContent;
    el.textContent = '';
  }
  return el;
}

export const el = (tag, attrs, ...kids) => h(tag, attrs, ...kids);

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** 简易转义文本（保险用，大部分场景直接用 textContent） */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms = 500) {
  let t = null;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.flush = () => { if (t) { clearTimeout(t); fn(); } };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

let toasts = [];
export function toast(msg, kind = 'ok', ms = 3600) {
  const root = document.getElementById('toast-root');
  const node = h('div', { class: 'toast ' + kind }, msg);
  root.appendChild(node);
  toasts.push(node);
  if (toasts.length > 5) { toasts.shift().remove(); }
  setTimeout(() => { node.remove(); toasts = toasts.filter((x) => x !== node); }, ms);
  return node;
}

/** 模态框（返回 {close}；可直接复用 node 挂载自定义内容） */
export function modal({ title, body, foot, width, onClose }) {
  const root = document.getElementById('modal-root');
  const box = h('div', { class: 'modal', style: width ? `width:${width}` : '' },
    title !== undefined ? h('h2', {}, title) : null,
    h('div', { class: 'body' }, body),
    foot ? h('div', { class: 'foot' }, foot) : null,
  );
  const close = () => { root.classList.remove('on'); root.innerHTML = ''; if (onClose) onClose(); };
  box.addEventListener('click', (e) => e.stopPropagation());
  root.innerHTML = '';
  root.appendChild(box);
  root.classList.add('on');
  root.onclick = close; // 点击遮罩关闭
  const escClose = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escClose);
  return { root: box, close: () => { document.removeEventListener('keydown', escClose); close(); } };
}

export function confirmDialog(title, message, { okText = t('ui.ok'), danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title, body: h('div', { class: 'muted' }, message),
      foot: [
        h('button', { class: 'btn', onclick: () => { m.close(); resolve(false); } }, t('ui.cancel')),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { m.close(); resolve(true); } }, okText),
      ],
    });
  });
}

/** busy 遮罩（异步包装） */
export async function busy(promise, label = t('ui.processing')) {
  const b = document.getElementById('busy');
  const card = clear(b).appendChild(h('div', { class: 'card' }, h('div', { class: 'spin' }), h('span', {}, label)));
  b.classList.add('on');
  try { return await promise; } finally { b.classList.remove('on'); card.remove(); }
}

export const numFmt = (n) => (n == null ? '0' : Number(n).toLocaleString('zh-CN'));

export function wordStat(s) {
  return String(s || '').replace(/\s/g, '').length;
}
