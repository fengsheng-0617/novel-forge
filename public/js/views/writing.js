// writing.js — ⑤ 章节写作：章节列表 + 正文编辑器（自动保存）+ AI（撰写/续写/重写/润色/局部改写/记忆归档）
'use strict';
import { h, clear, toast, debounce, confirmDialog, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';
import { t } from '../i18n.js';

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
    } catch (e) { toast(t('writing.saveFail', { msg: e.message }), 'err', 5000); draftBuf = buf; }
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
      sel ? editorPane(sel) : h('div', { class: 'empty' }, t('writing.first'))) : emptyState());

  function header() {
    return h('div', {},
      h('div', { class: 'page-title' },
        h('h1', {}, t('writing.title')),
        h('span', { class: 'sub' }, t('writing.sub', { w: written.length, t: rows.length, c: numFmt(written.reduce((a, r) => a + (r.ch && r.ch.words || 0), 0)) }))),
      h('div', { class: 'actions-bar' },
        rows.length && rows.some((r) => !r.ch || !r.ch.content)
          ? h('button', { class: 'btn', onclick: () => {
            confirmDialog(t('writing.pipeTitle'), t('writing.pipeMsg', { n: rows.filter((r) => !r.ch || !r.ch.content).length }), { okText: t('writing.pipeOk') }).then(async (yes) => {
              if (!yes) return;
              try { await api.pipelineStart({ projectId: p.id, mode: 'write' }); toast(t('writing.pipeStarted'), 'ok'); }
              catch (e) { toast(t('writing.pipeFail', { msg: e.message }), 'err', 5000); }
            });
          } }, t('writing.pipeStart'))
          : null,
        h('button', { class: 'btn ghost', onclick: () => { location.hash = '#/p/' + p.id + '/outline'; } }, t('writing.backOutline')),
        h('button', { class: 'btn ghost', onclick: () => { location.hash = '#/p/' + p.id + '/audit'; } }, t('writing.toAudit'))));
  }

  function emptyState() {
    return h('div', { class: 'empty' },
      h('div', {}, t('writing.empty')),
      h('div', { class: 'btn-row', style: 'justify-content:center;margin-top:12px' },
        h('button', { class: 'btn primary', onclick: () => { location.hash = '#/p/' + p.id + '/outline'; } }, t('writing.goOutline'))));
  }

  function chapterNav() {
    const box = h('div', { class: 'list-pane' });
    const head = h('div', { class: 'lp-head' },
      h('span', { class: 'small muted', style: 'font-weight:600' }, t('writing.nav')));
    box.append(head);
    const listEl = h('div', {});
    box.append(listEl);
    const filter = h('input', { type: 'text', placeholder: t('writing.filterPh'), style: 'margin:8px;width:calc(100% - 16px)', oninput: (e) => paint(e.target.value) });
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
          h('span', { class: 'nm', style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, r.title || t('writing.noname')),
          h('span', { style: 'margin-left:auto;font-size:11px;color:' + (has ? 'var(--green)' : 'var(--faint)') },
            has ? `${numFmt(r.ch.words || 0)}${t('common.wordsShort')}` : t('writing.todo')));
        listEl.append(it);
      }
      if (!items.length) listEl.append(h('div', { class: 'empty small', style: 'padding:14px' }, t('writing.noMatch')));
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
    const titleInput = h('input', { type: 'text', value: row.title || '', placeholder: t('writing.titlePh'),
      oninput: debounce(async (e) => {
        try {
          const r = await api.colOp(p.id, 'rows', 'update', { id: row.id, patch: { title: e.target.value } });
          p.rows = r.arr;
        } catch (err) { toast(t('writing.titleSaveFail', { msg: err.message }), 'err', 4000); }
      }, 700) });
    const wcSpan = h('span', { id: 'writing-wc' }, numFmt(ch.words || 0));
    const stTag = h('span', { class: 'tag', style: has ? 'border-color:rgba(76,195,138,.5);color:var(--green)' : '' });
    if (has) stTag.append(t('writing.writtenTag'), wcSpan, t('writing.writtenSuffix'));
    else stTag.textContent = t('writing.todo');
    const curIdx = (p.rows || []).findIndex((x) => x.id === row.id);
    const prevBtn = h('button', { class: 'btn sm', title: t('writing.prev'), disabled: curIdx <= 0, onclick: () => goToChapter((p.rows || [])[curIdx - 1].id) }, t('writing.prev'));
    const nextBtn = h('button', { class: 'btn sm', title: t('writing.next'), disabled: curIdx >= (p.rows || []).length - 1, onclick: () => goToChapter((p.rows || [])[curIdx + 1].id) }, t('writing.next'));
    const head = h('div', { class: 'card', style: 'padding:10px 14px' },
      h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
        prevBtn,
        h('b', { style: 'font-size:15px' }, t('writing.chHead', { vol: row.vol, no: row.no })),
        titleInput,
        stTag,
        h('span', { class: 'small faint' }, ch.model ? t('writing.recent', { model: ch.model }) : ''),
        h('span', { style: 'margin-left:auto;display:flex;gap:6px' }, nextBtn)));
    box.append(head);

    // 大纲速览
    box.append(h('details', { class: 'fold' },
      h('summary', {}, t('writing.fold', { goal: row.goal ? '：' + String(row.goal).slice(0, 60) : t('writing.foldNone') })),
      h('div', { class: 'fold-body' },
        row.goal ? h('div', {}, h('b', { class: 'small' }, t('writing.goal')), row.goal) : null,
        (row.beats || []).length ? h('div', { class: 'small muted', style: 'margin-top:4px' }, t('writing.beats') + (row.beats || []).map((b, i) => `${i + 1}.${b}`).join('　')) : null,
        (row.cast || []).length ? h('div', { class: 'small muted', style: 'margin-top:4px' }, t('writing.cast') + row.cast.join('、') + (row.pov ? `　·　视角：${row.pov}` : '')) : null,
        row.note ? h('div', { class: 'small muted', style: 'margin-top:4px' }, t('writing.note') + row.note) : null)));

    // AI 动作
    const hint = h('input', { type: 'text', id: 'write-inst', placeholder: t('writing.aiHint'), style: 'flex:1;min-width:160px' });
    const aiRow = h('div', { class: 'actions-bar' },
      aiBtn(t('writing.write'), t('writing.writeTip'), 'chapter_write', 'prose'),
      aiBtn(t('writing.continue'), t('writing.continueTip'), 'chapter_continue', 'prose'),
      aiBtn(t('writing.rewrite'), t('writing.rewriteTip'), 'chapter_rewrite', 'prose'),
      aiBtn(t('writing.polish'), t('writing.polishTip'), 'chapter_polish', 'prose'),
      hint,
      h('button', { class: 'btn sm', onclick: () => openGenFor({ action: 'chapter_summary', title: t('writing.archiveTitle', { no: row.no }), kind: 'json', args: { rowId: row.id }, rowId: row.id, onApplied: afterReload }) }, t('writing.archive')),
      h('button', { class: 'btn sm ghost', onclick: async () => {
        const yes = await confirmDialog(t('writing.clearTitle'), t('writing.clearMsg'), { okText: t('writing.clearOk'), danger: true });
        if (!yes) return;
        draftBuf = null;
        try {
          await api.colOp(p.id, 'rows', 'update', { id: row.id, patch: { 'ch.content': '', 'ch.words': 0, 'ch.status': 'plan' } });
          remount();
        } catch (e) { toast(t('writing.clearFail', { msg: e.message }), 'err', 4000); }
      } }, t('writing.clear')));
    box.append(aiRow);

    // 正文编辑器
    const ta = editor = h('textarea', {
      spellcheck: 'false',
      placeholder: t('writing.editorPh'),
      style: 'width:100%;min-height:520px;font-family:var(--font-serif);font-size:16px;line-height:2.05;padding:18px 20px;background:var(--bg)',
      oninput: (e) => {
        ch._prevHas = hadBefore || !!ch.content;
        editorChanged(row, 'content', e.target.value);
      },
    }, ch.content || '');
    if (ch.content) ta.value = ch.content;
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); flushEditor(); toast(t('writing.saved'), 'ok', 1200); }
    });
    ta.addEventListener('select', () => updateSelBtn());
    ta.addEventListener('mouseup', updateSelBtn);
    ta.addEventListener('keyup', updateSelBtn);
    ta.addEventListener('focus', updateSelBtn);
    box.append(ta);

    // 底部：摘要/字数/局部改写
    const selBtn = h('button', { class: 'btn sm', disabled: true, title: t('writing.selTitle'), onclick: fixSelection });
    const statusBar = h('div', { class: 'btn-row', style: 'margin-top:8px' },
      selBtn,
      ch.summary ? h('span', { class: 'small muted', style: 'flex:1' }, t('writing.archived') + String(ch.summary).slice(0, 90) + (ch.summary.length > 90 ? '…' : '')) : null);
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
      selBtn.textContent = hasSel ? t('writing.selPh') : t('writing.selPhNone');
    }
    function fixSelection() {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const selText = ta.value.slice(s, e).trim();
      if (!selText) return toast(t('writing.selNeed'), 'warn');
      const instruction = prompt(t('writing.selPrompt'));
      if (instruction == null) return;
      openGenFor({
        action: 'excerpt_fix', kind: 'prose', noApply: true, rowId: row.id,
        title: t('writing.selTitle2'),
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
