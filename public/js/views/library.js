// library.js — 项目库页：卡片网格 + 新建/示例/复制/删除
'use strict';
import { h, clear, toast, modal, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

async function reloadList() {
  const r = await api.projects();
  return r.projects;
}

export async function mount(root, _project, ctx) {
  clear(root);
  root.classList.add('page');
  const top = h('div', {}, '');
  const grid = h('div', { class: 'lib-grid' });
  const empty = h('div', { class: 'empty', hidden: true },
    h('div', { style: 'font-size:26px;margin-bottom:10px' }, '✒️'),
    h('div', { style: 'font-size:16px;color:var(--muted);margin-bottom:6px' }, t('lib.empty.title')),
    h('div', { class: 'small', style: 'margin-bottom:14px' }, t('lib.empty.sub')),
    h('div', { class: 'btn-row', style: 'justify-content:center' },
      h('button', { class: 'btn primary lg', onclick: () => newProjectDialog(grid, empty) }, t('lib.new')),
      h('button', { class: 'btn lg', onclick: () => createSample(grid, empty) }, t('lib.sample'))));
  root.append(top, grid, empty);

  async function paint() {
    const list = await reloadList();
    clear(grid);
    let any = false;
    for (const p of list) {
      any = true;
      grid.append(cardEl(p, grid, empty));
    }
    empty.hidden = !!list.length;
    top.replaceChildren(
      h('div', { class: 'page-title' },
        h('h1', {}, t('lib.title')),
        h('span', { class: 'sub' }, t('lib.sub', { n: list.length }))),
      h('div', { class: 'btn-row', style: 'margin:4px 0 10px' },
        h('button', { class: 'btn primary', onclick: () => newProjectDialog(grid, empty) }, t('lib.new')),
        h('button', { class: 'btn', onclick: () => createSample(grid, empty) }, t('lib.sample')),
        h('button', { class: 'btn ghost', onclick: () => location.hash = '#/settings' }, t('lib.settings'))));
  }
  await paint();

  function cardEl(p, g, em) {
    const c = p.counts || {};
    const stage = p.status;
    return h('div', { class: 'lib-card', onclick: (e) => {
      if (e.target.closest('.ops')) return;
      location.hash = '#/p/' + p.id + '/idea';
    } },
      h('div', { class: 'demo-flag' }, p.demo ? t('lib.card.demo') : ''),
      h('h3', {}, p.name || t('lib.card.name')),
      h('div', { class: 'd' }, p.desc || t('lib.card.desc')),
      h('div', { class: 'meta' },
        h('span', {}, stage || t('lib.card.statusNew')),
        h('span', {}, t('lib.card.ch', { written: c.written, total: c.chapters || 0 })),
        h('span', {}, t('lib.card.chars', { n: c.characters || 0 })),
        c.words ? h('span', {}, t('lib.card.words', { w: (c.words / 10000).toFixed(1) })) : null),
      h('div', { class: 'progress-strip' },
        h('i', { class: (c.characters || 0) > 0 ? 'on' : '' }),
        h('i', { class: (c.chapters || 0) > 0 ? 'on' : '' }),
        h('i', { class: (c.written || 0) > 0 ? 'on' : '' }),
        h('i', { class: (c.written || 0) > 0 && (c.written || 0) >= (c.chapters || 1) ? 'on' : '' })),
      h('div', { class: 'ops' },
        h('button', { class: 'btn sm', title: t('lib.card.copyTitle'), onclick: async () => {
          try {
            const r = await api.duplicateProject(p.id);
            toast(t('lib.toast.dup'), 'ok');
            await paint();
          } catch (e) { toast(t('lib.toast.copyFail', { msg: e.message }), 'err', 5000); }
        } }, '⧉'),
        h('button', { class: 'btn sm danger', title: t('lib.card.delTitle'), onclick: async () => {
          const yes = await confirmDialog(t('common.delete'), t('lib.delConfirm', { name: p.name }), { okText: t('common.delete'), danger: true });
          if (!yes) return;
          try { await api.deleteProject(p.id); toast(t('lib.toast.del'), 'ok'); await paint(); } catch (e) { toast(t('lib.toast.delFail', { msg: e.message }), 'err', 5000); }
        } }, '🗑')));
  }
}

function newProjectDialog(grid, empty) {
  const name = h('input', { type: 'text', placeholder: t('lib.newDialog.namePh'), value: '' });
  const desc = h('textarea', { rows: 3, placeholder: t('lib.newDialog.desc'), value: '' });
  const tips = h('div', { class: 'help-note', style: 'margin:6px 0 4px' }, t('lib.newDialog.tip'));
  const tips2 = h('div', { class: 'small faint', style: 'margin-top:6px' }, t('lib.newDialog.tip2'));
  const m = modal({
    title: t('lib.newDialog.title'),
    body: [h('label', { class: 'field' }, h('span', {}, t('lib.newDialog.name')), name),
      h('label', { class: 'field' }, h('span', {}, t('lib.newDialog.desc')), desc), tips, tips2],
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { class: 'btn primary', onclick: async () => {
        const v = name.value.trim();
        if (!v) { name.focus(); return; }
        try {
          const r = await api.createProject(v, desc.value.trim());
          m.close();
          location.hash = '#/p/' + r.project.id + '/idea';
        } catch (e) { toast(t('lib.toast.createFail', { msg: e.message }), 'err', 5000); }
      } }, t('lib.newDialog.create'))],
  });
  setTimeout(() => name.focus(), 50);
}

async function createSample(grid, empty) {
  try {
    const r = await api.createProject(t('lib.createSample'), t('lib.createSampleDesc'), true);
    toast(t('lib.sample.done'), 'ok');
    location.hash = '#/p/' + r.project.id + '/idea';
  } catch (e) {
    toast(t('lib.toast.createFail', { msg: e.message }), 'err', 5000);
  }
}
