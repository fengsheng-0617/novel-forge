// library.js — 项目库页：卡片网格 + 新建/示例/复制/删除
'use strict';
import { h, clear, toast, modal, confirmDialog } from '../ui.js';
import { api } from '../api.js';

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
    h('div', { style: 'font-size:16px;color:var(--muted);margin-bottom:6px' }, '还没有任何作品'),
    h('div', { class: 'small', style: 'margin-bottom:14px' }, '从「空白项目」自由开始，或一键体验内置示例《雾港来信》——', '没有 API Key 也能用离线模拟引擎跑通 点子→人物→大纲→正文 全流程。'),
    h('div', { class: 'btn-row', style: 'justify-content:center' },
      h('button', { class: 'btn primary lg', onclick: () => newProjectDialog(grid, empty) }, '＋ 新建空白项目'),
      h('button', { class: 'btn lg', onclick: () => createSample(grid, empty) }, '📖 创建示例项目')));
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
        h('h1', {}, '项目库'),
        h('span', { class: 'sub' }, `共 ${list.length} 部作品 · 点卡片进入工作台`)),
      h('div', { class: 'btn-row', style: 'margin:4px 0 10px' },
        h('button', { class: 'btn primary', onclick: () => newProjectDialog(grid, empty) }, '＋ 新建空白项目'),
        h('button', { class: 'btn', onclick: () => createSample(grid, empty) }, '📖 创建示例项目'),
        h('button', { class: 'btn ghost', onclick: () => location.hash = '#/settings' }, '⚙ 配置模型引擎')));
  }
  await paint();

  function cardEl(p, g, em) {
    const c = p.counts || {};
    const stage = p.status;
    return h('div', { class: 'lib-card', onclick: (e) => {
      if (e.target.closest('.ops')) return;
      location.hash = '#/p/' + p.id + '/idea';
    } },
      h('div', { class: 'demo-flag' }, p.demo ? '内置示例' : ''),
      h('h3', {}, p.name || '未命名'),
      h('div', { class: 'd' }, p.desc || '（暂无简介）'),
      h('div', { class: 'meta' },
        h('span', {}, stage || '新项目'),
        h('span', {}, `章 ${c.written}/${c.chapters || 0}`),
        h('span', {}, `角色 ${c.characters || 0}`),
        c.words ? h('span', {}, `${(c.words / 10000).toFixed(1)} 万字`) : null),
      h('div', { class: 'progress-strip' },
        h('i', { class: (c.characters || 0) > 0 ? 'on' : '' }),
        h('i', { class: (c.chapters || 0) > 0 ? 'on' : '' }),
        h('i', { class: (c.written || 0) > 0 ? 'on' : '' }),
        h('i', { class: (c.written || 0) > 0 && (c.written || 0) >= (c.chapters || 1) ? 'on' : '' })),
      h('div', { class: 'ops' },
        h('button', { class: 'btn sm', title: '复制', onclick: async () => {
          try {
            const r = await api.duplicateProject(p.id);
            toast('已复制', 'ok');
            await paint();
          } catch (e) { toast('复制失败：' + e.message, 'err', 5000); }
        } }, '⧉'),
        h('button', { class: 'btn sm danger', title: '删除', onclick: async () => {
          const yes = await confirmDialog('删除项目', `删除《${p.name}》及其全部数据？`, { okText: '删除', danger: true });
          if (!yes) return;
          try { await api.deleteProject(p.id); toast('已删除', 'ok'); await paint(); } catch (e) { toast('删除失败：' + e.message, 'err', 5000); }
        } }, '🗑')));
  }
}

function newProjectDialog(grid, empty) {
  const name = h('input', { type: 'text', placeholder: '作品名，如《雾中来信》', value: '' });
  const desc = h('textarea', { rows: 3, placeholder: '一句话简介（可选）', value: '' });
  const tips = h('div', { class: 'help-note', style: 'margin:6px 0 4px' },
    '无需先配置任何 API Key：内置「离线模拟引擎」可完整体验全流程；想用真实大模型，之后在 ⚙ 设置 → 模型厂商 填入 Key 即可。');
  const tips2 = h('div', { class: 'small faint', style: 'margin-top:6px' }, '创建后进入「灵感点子」页：可手动填写，或点「AI 头脑风暴」生成点子池。');
  const m = modal({
    title: '新建空白项目',
    body: [h('label', { class: 'field' }, h('span', {}, '书名 *'), name),
      h('label', { class: 'field' }, h('span', {}, '简介'), desc), tips, tips2],
    foot: [h('button', { class: 'btn', onclick: () => m.close() }, '取消'),
      h('button', { class: 'btn primary', onclick: async () => {
        const v = name.value.trim();
        if (!v) { name.focus(); return; }
        try {
          const r = await api.createProject(v, desc.value.trim());
          m.close();
          location.hash = '#/p/' + r.project.id + '/idea';
        } catch (e) { toast('创建失败：' + e.message, 'err', 5000); }
      } }, '创建并进入')],
  });
  setTimeout(() => name.focus(), 50);
}

async function createSample(grid, empty) {
  try {
    const r = await api.createProject('示例 · 雾港来信', '内置示例：悬疑奇幻长篇（离线演示）', true);
    toast('示例项目已就绪', 'ok');
    location.hash = '#/p/' + r.project.id + '/idea';
  } catch (e) {
    toast('创建失败：' + e.message, 'err', 5000);
  }
}
