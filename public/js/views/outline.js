// outline.js — ④ 卷章大纲：分卷卡片列表 + 行级编辑/增删排序 + AI（整卷生成/追加/单章精修）
'use strict';
import { h, clear, toast, debounce, confirmDialog, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';
import { t } from '../i18n.js';

const ROW_FIELDS = ['title', 'goal', 'pov', 'words', 'note'];

export function mount(root, project, ctx) {
  clear(root);
  root.classList.add('page');
  const p = project;
  const rows = p.rows || [];
  const writtenN = rows.filter((r) => r.ch && r.ch.content).length;
  const volCount = new Set(rows.map((r) => r.vol)).size;
  const volumes = (p.volumes || []);

  const saveDeb = debounce(doUpdate, 850);
  async function doUpdate(row, patch) {
    if (!row || !row.id) return;
    try {
      const r = await api.colOp(p.id, 'rows', 'update', { id: row.id, patch });
      p.rows = r.arr;
    } catch (e) { toast(t('outline.saveFail', { msg: e.message }), 'err', 5000); }
  }

  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }
  function remount() { clear(root); mount(root, p, ctx); }

  const countN = h('input', { type: 'number', min: '1', max: '40', value: '5', style: 'width:70px' });

  root.append(
    header(),
    h('div', { class: 'actions-bar' },
      genBtn(t('outline.gen'), 'outline_generate', {}),
      genBtn(t('outline.extend'), 'outline_extend', { count: () => Number(countN.value) || 5 }),
      countN,
      h('button', { class: 'btn', onclick: () => addRowAtEnd() }, t('outline.addManual')),
      h('button', { class: 'btn ghost', onclick: () => { location.hash = '#/p/' + p.id + '/writing'; } }, t('outline.next'))),
    routeBanner(),
    h('div', { class: 'small faint', style: 'margin-bottom:14px' },
      t('outline.summary', { v: volCount, c: rows.length, w: writtenN, tw: numFmt(p.idea && p.idea.targetWords || 0) })),
    rowsByVol());

  /** 故事路线提示条：未选定路线时提醒先做引导（大纲会遵循选定路线，避免散乱）。 */
  function routeBanner() {
    const sel = (p.routes && p.routes.selected) || null;
    const goIdea = () => { location.hash = '#/p/' + p.id + '/idea'; };
    if (sel) {
      const ap = String(sel.approach || '');
      return h('div', { class: 'card small', style: 'padding:10px 12px;margin-bottom:12px' },
        h('b', {}, t('outline.routeOk', { name: sel.name || '—' })),
        ap ? h('span', { class: 'small muted' }, '：' + (ap.length > 140 ? ap.slice(0, 140) + '…' : ap)) : null,
        h('button', { class: 'btn sm ghost', style: 'margin-left:8px', onclick: goIdea }, t('outline.routeChange')));
    }
    return h('div', { class: 'card small', style: 'padding:10px 12px;margin-bottom:12px;border-color:#8a6a3a' },
      h('b', {}, t('outline.routeMissing')),
      h('button', { class: 'btn sm primary', style: 'margin-left:8px', onclick: goIdea }, t('outline.routeGo')));
  }

  function header() {
    return h('div', { class: 'page-title' },
      h('h1', {}, t('outline.title')),
      h('span', { class: 'sub' }, t('outline.sub')));
  }

  function genBtn(label, action, makeArgs) {
    return h('button', { class: 'btn ' + (action === 'outline_generate' ? 'primary' : ''), onclick: () => {
      if (action === 'outline_generate' && rows.some((r) => r.ch && r.ch.content)) {
        confirmDialog(t('outline.genConfirmTitle'),
          t('outline.genConfirm', { n: rows.filter((r) => r.ch && r.ch.content).length }),
          { okText: t('outline.genConfirmOk') }).then((yes) => { if (yes) doGen({ force: true }); });
        return;
      }
      doGen({});
      function doGen(extraArgs) {
        openGen(p, {
          action, kind: 'json', title: label,
          args: Object.assign({}, typeof makeArgs === 'function' ? makeArgs() : {}, extraArgs),
          onApplied: afterAi,
        });
      }
    } }, label);
  }

  function addRowAtEnd(vol) {
    const last = rows[rows.length - 1];
    const nextVol = vol || (last ? last.vol : 1);
    const item = { title: '', goal: '', beats: [], cast: [], pov: '', words: 3200, note: '', vol: nextVol };
    api.colOp(p.id, 'rows', 'add', { item }).then((r) => {
      p.rows = r.arr;
      remount();
    }).catch((e) => toast(t('outline.addFail', { msg: e.message }), 'err', 4000));
  }

  function rowsByVol() {
    const wrap = h('div', {});
    const byVol = new Map();
    for (const row of rows) {
      if (!byVol.has(row.vol)) byVol.set(row.vol, []);
      byVol.get(row.vol).push(row);
    }
    const volNos = [...byVol.keys()].sort((a, b) => a - b);
    if (!rows.length) {
      wrap.append(h('div', { class: 'empty' },
        h('div', {}, t('outline.empty')),
        h('div', { class: 'small', style: 'margin-top:8px' }, t('outline.emptyHint'))));
      return wrap;
    }
    for (const vn of volNos) {
      const volMeta = volumes.find((v) => v.vol === vn);
      const group = byVol.get(vn);
      const volCard = h('div', { class: 'card', style: 'padding:12px' },
        h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' },
          h('b', { style: 'font-size:15px' }, `${t('outline.vol', { n: vn })}${volMeta && volMeta.title ? '《' + volMeta.title + '》' : ''}`),
          h('span', { class: 'small faint' }, t('outline.chCount', { n: group.length })),
          volMeta && volMeta.arc ? h('span', { class: 'small faint', style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, '——' + volMeta.arc) : null,
          h('span', { style: 'margin-left:auto' },
            h('button', { class: 'btn sm', onclick: () => addRowAtEnd(vn) }, t('outline.addCh')))));
      // 卷 meta 编辑
      if (volMeta) {
        const metaRow = h('div', { class: 'row-line', style: 'margin-bottom:8px' },
          h('input', { type: 'text', value: volMeta.title || '', placeholder: t('outline.volName'), style: 'flex:1', oninput: (e) => { volMeta.title = e.target.value; saveVols(); } }),
          h('input', { type: 'text', value: volMeta.arc || '', placeholder: t('outline.volArc'), style: 'flex:3', oninput: (e) => { volMeta.arc = e.target.value; saveVols(); } }));
        volCard.append(metaRow);
      }
      for (const row of group) {
        volCard.append(rowCard(row, vn, volNos));
      }
      wrap.append(volCard);
    }
    return wrap;
  }

  const saveVols = debounce(async () => {
    try {
      await api.docSet(p.id, 'volumes', (p.volumes || []).map((v) => ({ vol: v.vol, title: v.title || '', arc: v.arc || '' })));
    } catch (e) { toast(t('outline.volSaveFail', { msg: e.message }), 'err', 4000); }
  }, 800);


  function rowCard(row, vn, volNos) {
    const written = !!(row.ch && row.ch.content);
    const card = h('div', { class: 'card', style: 'padding:10px 12px;margin:6px 0;background:var(--bg2)' });
    const idx = rows.indexOf(row);
    // 头行
    const headL = h('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap' },
      h('span', { class: 'small faint' }, `第${row.no}章`),
      h('input', { type: 'text', value: row.title || '', placeholder: t('outline.chTitlePh'), style: 'flex:1;min-width:160px', oninput: (e) => { row.title = e.target.value; saveDeb(row, { title: row.title }); } }),
      h('span', { class: 'tag', style: written ? 'border-color:rgba(76,195,138,.5);color:var(--green)' : '' }, written ? t('outline.written', { w: row.ch.words || 0 }) : t('outline.todo')));
    headL.append(
      h('select', { title: t('outline.volSelTitle'), onchange: (e) => moveVol(row, Number(e.target.value)) },
        volNos.map((v) => h('option', { value: String(v), selected: v === row.vol || undefined }, `${t('outline.vol', { n: v })}`))),
      h('select', { title: t('outline.povTitle'), onchange: (e) => { row.pov = e.target.value; saveDeb(row, { pov: row.pov }); } },
        h('option', { value: '', selected: !row.pov || undefined }, `${t('outline.povTitle')}：`),
        (p.characters || []).filter((c) => c.pov).map((c) => h('option', { value: c.name, selected: row.pov === c.name || undefined }, '🎥' + c.name)),
        (p.characters || []).filter((c) => !c.pov).slice(0, 6).map((c) => h('option', { value: c.name, selected: row.pov === c.name || undefined }, c.name))),
      h('input', { type: 'number', value: row.words || '', style: 'width:92px', title: t('outline.wordsTitle'), oninput: (e) => { row.words = Number(e.target.value) || 0; saveDeb(row, { words: row.words }); } }),
      h('button', { class: 'btn sm', disabled: idx <= 0, onclick: () => move(idx, idx - 1) }, '↑'),
      h('button', { class: 'btn sm', disabled: idx >= rows.length - 1, onclick: () => move(idx, idx + 1) }, '↓'),
      h('button', { class: 'btn sm danger', title: t('outline.delTitle'), onclick: () => removeRow(row) }, '✕'));
    card.append(headL);

    const goal = h('textarea', { rows: 1, value: row.goal || '', placeholder: t('outline.goalPh'), style: 'width:100%;margin-top:6px', oninput: (e) => { row.goal = e.target.value; saveDeb(row, { goal: row.goal }); } });
    autoGrow(goal);
    card.append(goal);

    // 节拍
    const beatsBox = h('div', {});
    const paintBeats = () => {
      clear(beatsBox);
      const beats = row.beats = Array.isArray(row.beats) ? row.beats : [];
      beats.forEach((bt, bi) => {
        const inp = h('input', { type: 'text', value: bt || '', placeholder: t('outline.beatPh', { i: bi + 1 }), style: 'flex:1',
          oninput: (e) => { row.beats[bi] = e.target.value; saveDeb(row, { beats: row.beats.slice() }); } });
        const li = h('div', { class: 'row-line', style: 'margin:4px 0' },
          h('span', { class: 'small faint', style: 'flex:0 0 46px' }, t('outline.beat', { i: bi + 1 })),
          inp,
          h('button', { class: 'btn sm danger grow0', onclick: () => { row.beats.splice(bi, 1); saveDeb(row, { beats: row.beats.slice() }); paintBeats(); } }, '✕'));
        beatsBox.append(li);
      });
      beatsBox.append(h('button', { class: 'btn sm', onclick: () => { row.beats.push(''); paintBeats(); } }, t('outline.addBeat')));
    };
    paintBeats();
    card.append(beatsBox);

    // 登场人物 + 备注
    const castInp = h('input', { type: 'text', value: (row.cast || []).join('、'), placeholder: t('outline.castPh'),
      style: 'width:100%;margin-top:4px', oninput: (e) => { row.cast = e.target.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean); saveDeb(row, { cast: row.cast }); } });
    card.append(h('div', { class: 'small faint', style: 'margin-top:6px' }, t('outline.cast')), castInp);
    const note = h('input', { type: 'text', value: row.note || '', placeholder: t('outline.notePh'), style: 'width:100%;margin-top:6px',
      oninput: (e) => { row.note = e.target.value; saveDeb(row, { note: row.note }); } });
    card.append(note);

    // 操作
    card.append(h('div', { class: 'btn-row', style: 'margin-top:8px' },
      h('button', { class: 'btn sm primary', onclick: () => {
        flush(row);
        location.hash = '#/p/' + p.id + '/writing/' + row.id;
      } }, written ? t('outline.openWritten') : t('outline.openWrite')),
      h('button', { class: 'btn sm', onclick: () => openGen(p, { action: 'outline_refine', title: `AI 精修 第${row.no}章`, kind: 'json', args: { rowId: row.id }, rowId: row.id, onApplied: afterAi }) }, t('outline.refine')),
      h('button', { class: 'btn sm', onclick: () => openGen(p, { action: 'chapter_write', title: `AI 直接撰写 第${row.no}章`, kind: 'prose', args: { rowId: row.id }, rowId: row.id, onApplied: afterAi }) }, t('outline.writeAi'))));
    return card;

    function flush(r) { saveDeb.flush(); }
    async function move(f, t2) {
      if (t2 < 0 || t2 >= rows.length) return;
      try {
        const r = await api.colOp(p.id, 'rows', 'move', { id: rows[f].id, to: t2 });
        p.rows = r.arr;
        remount();
      } catch (e) { toast(t('outline.moveFail', { msg: e.message }), 'err', 4000); }
    }
    async function moveVol(r, newVol) {
      // 改卷并保持全局顺序，重排卷内序号后整表提交
      const arr = rows.map((x) => Object.assign({}, x));
      const it = arr.find((x) => x.id === r.id);
      if (!it) return;
      it.vol = newVol;
      const renum = arr.map((x) => {
        const no = arr.filter((y) => y.vol === x.vol && arr.indexOf(y) <= arr.indexOf(x)).length;
        return Object.assign({}, x, { no });
      });
      p.rows = renum;
      try {
        const resp = await api.colOp(p.id, 'rows', 'set', { value: renum });
        p.rows = resp.arr;
        remount();
      } catch (e) { toast(t('outline.moveFail', { msg: e.message }), 'err', 4000); }
    }
    async function removeRow(r) {
      const msg = r.ch && r.ch.content
        ? t('outline.delRowConfirmWritten', { no: r.no, title: r.title || '', w: r.ch.words || 0 })
        : t('outline.delRowConfirm', { no: r.no, title: r.title || '' });
      const yes = await confirmDialog(t('outline.delRowTitle'), msg, { okText: t('common.delete'), danger: true });
      if (!yes) return;
      try {
        const resp = await api.colOp(p.id, 'rows', 'remove', { id: r.id });
        p.rows = resp.arr;
        remount();
      } catch (e) { toast(t('outline.delFail', { msg: e.message }), 'err', 4000); }
    }
  }

  function autoGrow(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(40, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
  }
}
