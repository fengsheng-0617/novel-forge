// outline.js — ④ 卷章大纲：分卷卡片列表 + 行级编辑/增删排序 + AI（整卷生成/追加/单章精修）
'use strict';
import { h, clear, toast, debounce, confirmDialog, numFmt } from '../ui.js';
import { api } from '../api.js';
import { openGen } from '../components/genPanel.js';

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
    } catch (e) { toast('保存失败：' + e.message, 'err', 5000); }
  }

  function afterAi() { if (ctx.reloadProject) ctx.reloadProject(); else remount(); }
  function remount() { clear(root); mount(root, p, ctx); }

  const countN = h('input', { type: 'number', min: '1', max: '40', value: '5', style: 'width:70px' });

  root.append(
    header(),
    h('div', { class: 'actions-bar' },
      genBtn('🤖 生成全书大纲（整组替换）', 'outline_generate', {}),
      genBtn('🤖 追加 N 章（保留已有内容）', 'outline_extend', { count: () => Number(countN.value) || 5 }),
      countN,
      h('button', { class: 'btn', onclick: () => addRowAtEnd() }, '＋ 手动加章'),
      h('button', { class: 'btn ghost', onclick: () => { location.hash = '#/p/' + p.id + '/writing'; } }, '下一步：写作 →')),
    h('div', { class: 'small faint', style: 'margin-bottom:14px' },
      `卷 ${volCount} · 章 ${rows.length} · 已写 ${writtenN} · 目标总字数 ${numFmt(p.idea && p.idea.targetWords || 0)}`),
    rowsByVol());

  function header() {
    return h('div', { class: 'page-title' },
      h('h1', {}, '④ 卷章大纲'),
      h('span', { class: 'sub' }, '每行一章：目标要可检验、节拍要具体、章末留钩子。已写正文的章节仍可移动/精修计划。'));
  }

  function genBtn(label, action, makeArgs) {
    return h('button', { class: 'btn ' + (action === 'outline_generate' ? 'primary' : ''), onclick: () => {
      if (action === 'outline_generate' && rows.some((r) => r.ch && r.ch.content)) {
        confirmDialog('重新生成全书大纲',
          `当前有 ${rows.filter((r) => r.ch && r.ch.content).length} 章已写正文；整组替换后这些行的大纲与正文将从列表中移除（可通过「撤销」恢复，也建议先导出备份）。确认继续？`,
          { okText: '继续替换' }).then((yes) => { if (yes) doGen({ force: true }); });
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
    }).catch((e) => toast('新增失败：' + e.message, 'err', 4000));
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
        h('div', {}, '还没有大纲。'),
        h('div', { class: 'small', style: 'margin-top:8px' }, '让 AI 根据「点子+设定+人物」生成整本分卷大纲（约 目标字数÷单章字数 章），或手动添加章节行。')));
      return wrap;
    }
    for (const vn of volNos) {
      const volMeta = volumes.find((v) => v.vol === vn);
      const group = byVol.get(vn);
      const volCard = h('div', { class: 'card', style: 'padding:12px' },
        h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' },
          h('b', { style: 'font-size:15px' }, `卷 ${vn}${volMeta && volMeta.title ? '《' + volMeta.title + '》' : ''}`),
          h('span', { class: 'small faint' }, `${group.length} 章`),
          volMeta && volMeta.arc ? h('span', { class: 'small faint', style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, '——' + volMeta.arc) : null,
          h('span', { style: 'margin-left:auto' },
            h('button', { class: 'btn sm', onclick: () => addRowAtEnd(vn) }, '＋章'))));
      // 卷 meta 编辑
      if (volMeta) {
        const metaRow = h('div', { class: 'row-line', style: 'margin-bottom:8px' },
          h('input', { type: 'text', value: volMeta.title || '', placeholder: '卷名', style: 'flex:1', oninput: (e) => { volMeta.title = e.target.value; saveVols(); } }),
          h('input', { type: 'text', value: volMeta.arc || '', placeholder: '本卷弧线（可选）', style: 'flex:3', oninput: (e) => { volMeta.arc = e.target.value; saveVols(); } }));
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
    } catch (e) { toast('卷信息保存失败：' + e.message, 'err', 4000); }
  }, 800);


  function rowCard(row, vn, volNos) {
    const written = !!(row.ch && row.ch.content);
    const card = h('div', { class: 'card', style: 'padding:10px 12px;margin:6px 0;background:var(--bg2)' });
    const idx = rows.indexOf(row);
    // 头行
    const headL = h('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap' },
      h('span', { class: 'small faint' }, `第${row.no}章`),
      h('input', { type: 'text', value: row.title || '', placeholder: '章节标题', style: 'flex:1;min-width:160px', oninput: (e) => { row.title = e.target.value; saveDeb(row, { title: row.title }); } }),
      h('span', { class: 'tag', style: written ? 'border-color:rgba(76,195,138,.5);color:var(--green)' : '' }, written ? `已写 ${row.ch.words || 0} 字` : '待写'));
    headL.append(
      h('select', { title: '所属卷', onchange: (e) => moveVol(row, Number(e.target.value)) },
        volNos.map((v) => h('option', { value: String(v), selected: v === row.vol || undefined }, `卷${v}`))),
      h('select', { title: '视角', onchange: (e) => { row.pov = e.target.value; saveDeb(row, { pov: row.pov }); } },
        h('option', { value: '', selected: !row.pov || undefined }, '视角：'),
        (p.characters || []).filter((c) => c.pov).map((c) => h('option', { value: c.name, selected: row.pov === c.name || undefined }, '🎥' + c.name)),
        (p.characters || []).filter((c) => !c.pov).slice(0, 6).map((c) => h('option', { value: c.name, selected: row.pov === c.name || undefined }, c.name))),
      h('input', { type: 'number', value: row.words || '', style: 'width:92px', title: '目标字数', oninput: (e) => { row.words = Number(e.target.value) || 0; saveDeb(row, { words: row.words }); } }),
      h('button', { class: 'btn sm', disabled: idx <= 0, onclick: () => move(idx, idx - 1) }, '↑'),
      h('button', { class: 'btn sm', disabled: idx >= rows.length - 1, onclick: () => move(idx, idx + 1) }, '↓'),
      h('button', { class: 'btn sm danger', title: '删除该行（含已写正文，可撤销）', onclick: () => removeRow(row) }, '✕'));
    card.append(headL);

    const goal = h('textarea', { rows: 1, value: row.goal || '', placeholder: '本章目标：解决/触发/揭示什么', style: 'width:100%;margin-top:6px', oninput: (e) => { row.goal = e.target.value; saveDeb(row, { goal: row.goal }); } });
    autoGrow(goal);
    card.append(goal);

    // 节拍
    const beatsBox = h('div', {});
    const paintBeats = () => {
      clear(beatsBox);
      const beats = row.beats = Array.isArray(row.beats) ? row.beats : [];
      beats.forEach((bt, bi) => {
        const inp = h('input', { type: 'text', value: bt || '', placeholder: `节拍 ${bi + 1}：场景动作/信息/转折…`, style: 'flex:1',
          oninput: (e) => { row.beats[bi] = e.target.value; saveDeb(row, { beats: row.beats.slice() }); } });
        const li = h('div', { class: 'row-line', style: 'margin:4px 0' },
          h('span', { class: 'small faint', style: 'flex:0 0 46px' }, `节拍${bi + 1}`),
          inp,
          h('button', { class: 'btn sm danger grow0', onclick: () => { row.beats.splice(bi, 1); saveDeb(row, { beats: row.beats.slice() }); paintBeats(); } }, '✕'));
        beatsBox.append(li);
      });
      beatsBox.append(h('button', { class: 'btn sm', onclick: () => { row.beats.push(''); paintBeats(); } }, '＋ 节拍'));
    };
    paintBeats();
    card.append(beatsBox);

    // 登场人物 + 备注
    const castInp = h('input', { type: 'text', value: (row.cast || []).join('、'), placeholder: '登场人物（顿号分隔）',
      style: 'width:100%;margin-top:4px', oninput: (e) => { row.cast = e.target.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean); saveDeb(row, { cast: row.cast }); } });
    card.append(h('div', { class: 'small faint', style: 'margin-top:6px' }, '登场人物'), castInp);
    const note = h('input', { type: 'text', value: row.note || '', placeholder: '备注：伏笔布置 / 呼应前文…', style: 'width:100%;margin-top:6px',
      oninput: (e) => { row.note = e.target.value; saveDeb(row, { note: row.note }); } });
    card.append(note);

    // 操作
    card.append(h('div', { class: 'btn-row', style: 'margin-top:8px' },
      h('button', { class: 'btn sm primary', onclick: () => {
        flush(row);
        location.hash = '#/p/' + p.id + '/writing/' + row.id;
      } }, written ? '✍ 打开正文' : '✍ 写正文'),
      h('button', { class: 'btn sm', onclick: () => openGen(p, { action: 'outline_refine', title: `AI 精修 第${row.no}章`, kind: 'json', args: { rowId: row.id }, rowId: row.id, onApplied: afterAi }) }, '🤖 精修本章'),
      h('button', { class: 'btn sm', onclick: () => openGen(p, { action: 'chapter_write', title: `AI 直接撰写 第${row.no}章`, kind: 'prose', args: { rowId: row.id }, rowId: row.id, onApplied: afterAi }) }, '🤖 直接撰写')));
    return card;

    function flush(r) { saveDeb.flush(); }
    async function move(f, t) {
      if (t < 0 || t >= rows.length) return;
      try {
        const r = await api.colOp(p.id, 'rows', 'move', { id: rows[f].id, to: t });
        p.rows = r.arr;
        remount();
      } catch (e) { toast('移动失败：' + e.message, 'err', 4000); }
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
      } catch (e) { toast('移动失败：' + e.message, 'err', 4000); }
    }
    async function removeRow(r) {
      const msg = r.ch && r.ch.content
        ? `删除第${r.no}章《${r.title || ''}》将同时移除已写正文（${r.ch.words || 0} 字）。可通过顶栏「撤销」恢复。继续？`
        : `删除第${r.no}章《${r.title || ''}》大纲行？`;
      const yes = await confirmDialog('删除章节行', msg, { okText: '删除', danger: true });
      if (!yes) return;
      try {
        const resp = await api.colOp(p.id, 'rows', 'remove', { id: r.id });
        p.rows = resp.arr;
        remount();
      } catch (e) { toast('删除失败：' + e.message, 'err', 4000); }
    }
  }

  function autoGrow(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(40, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
  }
}
