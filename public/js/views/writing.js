// writing.js — ⑤ 章节写作：章节列表 + 正文编辑器（自动保存）+ AI（撰写/续写/重写/润色/局部改写/记忆归档）
'use strict';
import { h, clear, toast, debounce, confirmDialog, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';

let selRowId = null;

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  const rows = p.rows || [];
  const written = rows.filter((r) => r.ch && r.ch.content);
  if (ctx.pendingRowId && rows.some((r) => r.id === ctx.pendingRowId)) selRowId = ctx.pendingRowId;
  else if (!selRowId || !rows.some((r) => r.id === selRowId)) selRowId = rows.find((r) => r.ch && r.ch.content)?.id || rows[0]?.id || null;
  const sel = rows.find((r) => r.id === selRowId) || null;

  let editor = null;           // 当前正文 textarea
  let draftBuf = null;         // {rowId, patch} 未保存
  let genCfg = null;           // 关闭面板前需 flush

  const saveEditorDeb = debounce(flushEditor, 900);
  function editorChanged(row, field, value) {
    draftBuf = draftBuf || { rowId: row.id, content: undefined };
    if (field === 'content') {
      row.ch.content = value;
      row.ch.words = String(value).replace(/\s/g, '').length;
      row.ch.status = (row.ch.content && !row.ch._prevHas) ? 'written' : 'revised';
      if (row.ch.content && !row.ch.status) row.ch.status = 'written';
    } else {
      row[field] = value;
    }
    updateWordCounter();
    saveEditorDeb();
  }
  async function flushEditor() {
    if (!draftBuf) return;
    const buf = draftBuf;
    draftBuf = null;
    const row = rows.find((r) => r.id === buf.rowId);
    if (!row) return;
    const ch = row.ch || {};
    const patch = {
      'ch.content': ch.content || '',
      'ch.words': ch.words || 0,
      'ch.status': ch.content ? (ch.status === 'written' ? 'written' : 'revised') : 'plan',
      'ch.updatedAt': new Date().toISOString(),
    };
    try {
      const r = await api.colOp(p.id, 'rows', 'update', { id: row.id, patch });
      p.rows = r.arr;
      if (ctx.onSelfChange) ctx.onSelfChange();
    } catch (e) { toast('正文保存失败：' + e.message, 'err', 5000); draftBuf = buf; }
  }
  function updateWordCounter() {
    const el = root.querySelector('#writing-wc');
    if (el && sel) el.textContent = numFmt((sel.ch && sel.ch.content || '').replace(/\s/g, '').length);
  }

  function remount() {
    clear(root);
    mount(root, p, ctx);
  }
  function afterReload() {
    if (ctx.reloadProject) ctx.reloadProject();
    else remount();
  }
  const openGenFor = (cfg) => {
    flushEditor();
    draftBuf = null;
    openGen(p, cfg);
  };

  root.append(
    header(),
    rows.length ? h('div', { class: 'split', style: 'grid-template-columns:280px 1fr' },
      chapterNav(),
      sel ? editorPane(sel) : h('div', { class: 'empty' }, '暂无章节')) : emptyState());

  function header() {
    return h('div', {},
      h('div', { class: 'page-title' },
        h('h1', {}, '⑤ 章节写作'),
        h('span', { class: 'sub' }, `已写 ${written.length}/${rows.length} 章 · ${numFmt(written.reduce((a, r) => a + (r.ch && r.ch.words || 0), 0))} 字`)),
      h('div', { class: 'actions-bar' },
        rows.length && rows.some((r) => !r.ch || !r.ch.content)
          ? h('button', { class: 'btn', onclick: () => {
            confirmDialog('无人值守连载', `将按大纲顺序自动撰写剩余 ${rows.filter((r) => !r.ch || !r.ch.content).length} 章（每章后自动生成摘要并归档伏笔/事实记忆），可随时暂停/停止。`, { okText: '启动连载' }).then(async (yes) => {
              if (!yes) return;
              try { await api.pipelineStart({ projectId: p.id, mode: 'write' }); toast('连载已启动（顶栏芯片可暂停/停止）', 'ok'); }
              catch (e) { toast('启动失败：' + e.message, 'err', 5000); }
            });
          } }, '⚡ 大纲→无人值守连载（剩余全部）')
          : null,
        h('button', { class: 'btn ghost', onclick: () => { location.hash = '#/p/' + p.id + '/outline'; } }, '← 回大纲'),
        h('button', { class: 'btn ghost', onclick: () => { location.hash = '#/p/' + p.id + '/audit'; } }, '审校 →')));
  }

  function emptyState() {
    return h('div', { class: 'empty' },
      h('div', {}, '还没有任何章节行 —— 先去「卷章大纲」生成或添加章节。'),
      h('div', { class: 'btn-row', style: 'justify-content:center;margin-top:12px' },
        h('button', { class: 'btn primary', onclick: () => { location.hash = '#/p/' + p.id + '/outline'; } }, '前往 大纲页')));
  }

  function chapterNav() {
    const box = h('div', { class: 'list-pane' });
    const head = h('div', { class: 'lp-head' },
      h('span', { class: 'small muted', style: 'font-weight:600' }, '章节'));
    box.append(head);
    const listEl = h('div', {});
    box.append(listEl);
    const filter = h('input', { type: 'text', placeholder: '筛选章节', style: 'margin:8px;width:calc(100% - 16px)', oninput: (e) => paint(e.target.value) });
    head.append(filter);
    const paint = (kw = '') => {
      clear(listEl);
      const items = rows.filter((r) => !kw || (r.title || '').includes(kw) || String(r.no).includes(kw));
      for (const r of items) {
        const has = r.ch && r.ch.content;
        const it = h('div', { class: 'list-item' + (selRowId === r.id ? ' sel' : ''), onclick: () => {
          flushEditor();
          draftBuf = null;
          selRowId = r.id;
          remount();
        } },
          h('span', { class: 'small faint' }, `第${r.no}章`),
          h('span', { class: 'nm', style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, r.title || '（未命名）'),
          h('span', { style: 'margin-left:auto;font-size:11px;color:' + (has ? 'var(--green)' : 'var(--faint)') },
            has ? `${numFmt(r.ch.words || 0)}字` : '待写'));
        listEl.append(it);
      }
      if (!items.length) listEl.append(h('div', { class: 'empty small', style: 'padding:14px' }, '无匹配'));
    };
    paint();
    return box;
  }

  function goToChapter(rowId) {
    flushEditor();
    draftBuf = null;
    const target = (p.rows || []).find((r) => r.id === rowId);
    if (target) selRowId = target.id;
    remount();
  }

  function editorPane(row) {
    const ch = row.ch = row.ch || { status: 'plan', summary: '', content: '', words: 0, model: '', updatedAt: '', history: [] };
    const hadBefore = !!ch.content;
    const box = h('div', {});
    const has = !!ch.content;

    // 章头
    const titleInput = h('input', { type: 'text', value: row.title || '', placeholder: '章节标题（双击大纲页可改；此处同步）',
      oninput: debounce(async (e) => {
        try {
          const r = await api.colOp(p.id, 'rows', 'update', { id: row.id, patch: { title: e.target.value } });
          p.rows = r.arr;
        } catch (err) { toast('标题保存失败：' + err.message, 'err', 4000); }
      }, 700) });
    const wcSpan = h('span', { id: 'writing-wc' }, numFmt(ch.words || 0));
    const stTag = h('span', { class: 'tag', style: has ? 'border-color:rgba(76,195,138,.5);color:var(--green)' : '' });
    if (has) stTag.append('已写 ', wcSpan, ' 字');
    else stTag.textContent = '待写';
    const curIdx = (p.rows || []).findIndex((x) => x.id === row.id);
    const prevBtn = h('button', { class: 'btn sm', title: '上一章', disabled: curIdx <= 0, onclick: () => goToChapter((p.rows || [])[curIdx - 1].id) }, '← 上章');
    const nextBtn = h('button', { class: 'btn sm', title: '下一章', disabled: curIdx >= (p.rows || []).length - 1, onclick: () => goToChapter((p.rows || [])[curIdx + 1].id) }, '下章 →');
    const head = h('div', { class: 'card', style: 'padding:10px 14px' },
      h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
        prevBtn,
        h('b', { style: 'font-size:15px' }, `卷${row.vol} · 第${row.no}章`),
        titleInput,
        stTag,
        h('span', { class: 'small faint' }, ch.model ? '最近：' + ch.model : ''),
        h('span', { style: 'margin-left:auto;display:flex;gap:6px' }, nextBtn)));
    box.append(head);

    // 大纲速览
    box.append(h('details', { class: 'fold' },
      h('summary', {}, `本章大纲 ${row.goal ? '：' + String(row.goal).slice(0, 60) : '（未填目标）'}`),
      h('div', { class: 'fold-body' },
        row.goal ? h('div', {}, h('b', { class: 'small' }, '目标：'), row.goal) : null,
        (row.beats || []).length ? h('div', { class: 'small muted', style: 'margin-top:4px' }, '节拍：' + (row.beats || []).map((b, i) => `${i + 1}.${b}`).join('　')) : null,
        (row.cast || []).length ? h('div', { class: 'small muted', style: 'margin-top:4px' }, '登场：' + row.cast.join('、') + (row.pov ? `　·　视角：${row.pov}` : '')) : null,
        row.note ? h('div', { class: 'small muted', style: 'margin-top:4px' }, '备注：' + row.note) : null)));

    // AI 动作
    const hint = h('input', { type: 'text', id: 'write-inst', placeholder: 'AI 指令（如：以林照影视角重写 / 补一段氛围 / 让冲突更含蓄）…', style: 'flex:1;min-width:160px' });
    const aiRow = h('div', { class: 'actions-bar' },
      aiBtn('✍ 撰写', '全新撰写本章（按大纲+前情+记忆）', 'chapter_write', 'prose'),
      aiBtn('＋ 续写', '从当前末尾继续写', 'chapter_continue', 'prose'),
      aiBtn('⟳ 重写', '按指令整体重写', 'chapter_rewrite', 'prose'),
      aiBtn('✨ 润色', '保持剧情润色文字', 'chapter_polish', 'prose'),
      hint,
      h('button', { class: 'btn sm', onclick: () => openGenFor({ action: 'chapter_summary', title: `归档记忆：第${row.no}章`, kind: 'json', args: { rowId: row.id }, rowId: row.id, onApplied: afterReload }) }, '📌 归档记忆'),
      h('button', { class: 'btn sm ghost', onclick: async () => {
        const yes = await confirmDialog('清除本章正文', '将清空本章已写内容（可撤销）。', { okText: '清空', danger: true });
        if (!yes) return;
        draftBuf = null;
        try {
          await api.colOp(p.id, 'rows', 'update', { id: row.id, patch: { 'ch.content': '', 'ch.words': 0, 'ch.status': 'plan' } });
          remount();
        } catch (e) { toast('清空失败：' + e.message, 'err', 4000); }
      } }, '清空'));
    box.append(aiRow);

    // 正文编辑器
    const ta = editor = h('textarea', {
      spellcheck: 'false',
      placeholder: '在这里写正文… 或点击上方 AI 动作生成初稿后继续手改。\n\n提示：正文会自动保存；每章写完点「归档记忆」记录 事实/伏笔状态。',
      style: 'width:100%;min-height:520px;font-family:var(--font-serif);font-size:16px;line-height:2.05;padding:18px 20px;background:var(--bg)',
      oninput: (e) => {
        ch._prevHas = hadBefore || !!ch.content;
        editorChanged(row, 'content', e.target.value);
      },
    }, ch.content || '');
    if (ch.content) ta.value = ch.content;
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); flushEditor(); toast('已保存', 'ok', 1200); }
    });
    ta.addEventListener('select', () => updateSelBtn());
    ta.addEventListener('mouseup', updateSelBtn);
    ta.addEventListener('keyup', updateSelBtn);
    ta.addEventListener('focus', updateSelBtn);
    box.append(ta);

    // 底部：摘要/字数/局部改写
    const selBtn = h('button', { class: 'btn sm', disabled: true, title: '先在正文中选中一段文字', onclick: fixSelection });
    const statusBar = h('div', { class: 'btn-row', style: 'margin-top:8px' },
      selBtn,
      ch.summary ? h('span', { class: 'small muted', style: 'flex:1' }, '已归档摘要：' + String(ch.summary).slice(0, 90) + (ch.summary.length > 90 ? '…' : '')) : null);
    box.append(statusBar);
    return box;

    function aiBtn(label, tip, action, kind) {
      return h('button', { class: 'btn sm', title: tip, onclick: () => openGenFor({
        action, kind, title: `${label} · 第${row.no}章`,
        args: { rowId: row.id, instruction: hint.value.trim() || undefined },
        rowId: row.id, onApplied: afterReload,
      }) }, label);
    }
    function updateSelBtn() {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const hasSel = ta.value && e > s;
      selBtn.disabled = !hasSel;
      selBtn.textContent = hasSel ? '✂ 局部改写选中段（AI）' : '✂ 局部改写（需先选中文字）';
    }
    function fixSelection() {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const selText = ta.value.slice(s, e).trim();
      if (!selText) return toast('请先在正文中选中一段文字', 'warn');
      const instruction = prompt('改写要求（如：更口语化 / 删减 / 改成侧面描写）：');
      if (instruction == null) return;
      openGenFor({
        action: 'excerpt_fix', kind: 'prose', noApply: true, rowId: row.id,
        title: '局部改写选中段',
        args: { rowId: row.id, selText: selText.slice(0, 3800), instruction: instruction || '润色这段文字' },
        clientApply: async (payload) => {
          const newText = payload;
          ta.value = ta.value.slice(0, s) + newText + ta.value.slice(e);
          ta.focus();
          const pos = s + newText.length;
          ta.setSelectionRange(pos, pos);
          ch._prevHas = true;
          editorChanged(row, 'content', ta.value);
          await flushEditor();
        },
      });
    }
  }
}
