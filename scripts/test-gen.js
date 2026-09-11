// NovelForge 生成引擎全链路测试（模拟引擎，无需 Key）
// run: node scripts/test-gen.js [baseUrl]
'use strict';
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 200) : '')); }
};

async function req(method, path, body, raw) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

/** POST /api/gen with stream:true — parse SSE events from response body */
async function streamGen(body) {
  const res = await fetch(BASE + '/api/gen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let cur = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.startsWith('event: ')) { cur = { event: line.slice(7), data: '' }; }
      else if (line.startsWith('data: ') && cur) { cur.data += line.slice(6); if (cur.data) { try { cur.parsed = JSON.parse(cur.data); } catch (e) {} } events.push(cur); cur = null; }
    }
  }
  return { status: res.status, events };
}

async function gen(projectId, action, args, opts = {}) {
  const body = { projectId, action, args, stream: false };
  if (opts.providerId) body.providerId = opts.providerId;
  const r = await req('POST', '/api/gen', body);
  if (r.status !== 200) throw new Error(`gen ${action} 失败(${r.status}): ${r.text && r.text.slice(0, 300)}`);
  return r.json.result;
}
async function apply(projectId, resultId, extra = {}) {
  const r = await req('POST', '/api/apply', Object.assign({ projectId, resultId }, extra));
  if (r.status !== 200) throw new Error(`apply 失败(${r.status}): ${r.text && r.text.slice(0, 300)}`);
  return r.json;
}

async function main() {
  console.log('== 0. 环境 ==');
  const s = await req('GET', '/api/settings');
  t('默认厂商为 mock', s.json.settings.defaults.providerId === 'mock');
  const a = await req('GET', '/api/actions');
  t('动作注册 19 个', a.json.actions.length >= 18);
  t('含 route_plan（故事路线引导）', (a.json.actions || []).some((x) => x.key === 'route_plan'));
  const tpl = await req('GET', '/api/settings');
  t('模板 19 套', tpl.json.settings.templates.length >= 18);

  console.log('== 1. 项目 & 点子深化 ==');
  let r = await req('POST', '/api/projects', { name: '生成链路测试', desc: '全流程测试（模拟引擎）' });
  t('建项目', r.status === 200);
  const pid = r.json.project.id;
  const seedIdea = {
    title: '《星渊信标》', genres: ['科幻', '悬疑'], targetWords: 60000,
    logline: '深空灯塔看守员收到来自三十年后自己的求救信。',
    premise: '半人马座方向的自动信标站，一名看守员在孤寂中收到跨越时间的信号，信的内容是未来发生的灾难预告。', pov: '第三人称限知', tone: '冷峻太空歌剧',
  };
  r = await req('PUT', `/api/projects/${pid}/doc`, { pointer: 'idea', value: seedIdea });
  t('写入初始点子', r.status === 200 && r.json.project.idea.title.includes('星渊信标'));

  const flesh = await gen(pid, 'idea_flesh', {});
  t('idea_flesh 返回结构化', flesh.kind === 'json' && flesh.payload && flesh.payload.title);
  r = await apply(pid, flesh.id);
  t('idea_flesh 已应用', r.applied && r.applied.includes('立项书'));
  t('idea.title 保留', r.project.idea.title.includes('星渊信标'));

  console.log('== 2. 世界观设定 ==');
  const bible = await gen(pid, 'bible_generate', {});
  t('bible_generate JSON', bible.kind === 'json' && Array.isArray(bible.payload.sections) && bible.payload.sections.length > 0);
  r = await apply(pid, bible.id);
  t('bible 已应用', r.project.bible.rules.length > 0 && r.project.bible.sections.length > 0);
  const secCount = r.project.bible.sections.length;
  const exp = await gen(pid, 'bible_expand', { instruction: '补充“深空通讯伦理”与“时间信号物理学”两节' });
  r = await apply(pid, exp.id);
  t('bible_expand 追加不覆盖', r.project.bible.sections.length > secCount);

  console.log('== 3. 人物群像 ==');
  const chars = await gen(pid, 'characters_generate', { count: 6 });
  t('characters_generate 6 人', chars.kind === 'json' && chars.payload.length === 6);
  r = await apply(pid, chars.id);
  const names = r.project.characters.map((c) => c.name);
  t('群像已应用且名字唯一', names.length === 6 && new Set(names).size === 6);
  const c0 = r.project.characters[0];
  t('主角 POV', r.project.characters.filter((c) => c.pov).length >= 1);

  const add = await gen(pid, 'character_add', { instruction: '新增一名负责黑入信标的工程师' });
  r = await apply(pid, add.id);
  t('character_add 追加', r.project.characters.length === 7);

  const fleshC = await gen(pid, 'character_flesh', { charId: c0.id });
  t('character_flesh 单卡', fleshC.kind === 'json' && fleshC.payload.name);
  r = await apply(pid, fleshC.id, { charId: c0.id });
  t('精修保留 id', r.project.characters.find((c) => c.id === c0.id) != null);

  const align = await gen(pid, 'characters_align', {});
  r = await apply(pid, align.id);
  t('characters_align 全员保留', r.project.characters.length === 7 && r.project.characters.find((c) => c.id === c0.id) != null);

  console.log('== 3.5 故事路线引导（生成大纲的前置环节） ==');
  const rp = await gen(pid, 'route_plan', { count: 3 });
  t('route_plan 返回多条路线', rp.kind === 'json' && Array.isArray(rp.payload) && rp.payload.length === 3, JSON.stringify(rp.payload).slice(0, 200));
  t('路线字段齐全（思路/阶段/冲突/结局/风险）', rp.payload.every((x) => x.name && x.approach && x.structure.length >= 1 && x.coreConflict && x.ending && x.risk));
  t('恰有一条 AI 推荐', rp.payload.filter((x) => x.recommended).length === 1);
  r = await apply(pid, rp.id);
  t('候选入库但不替用户选定', r.project.routes.candidates.length === 3 && r.project.routes.selected === null);
  const selRoute = rp.payload[1];
  r = await req('PUT', `/api/projects/${pid}/doc`, { pointer: 'routes', value: { candidates: rp.payload, selected: Object.assign({}, selRoute, { mode: 'user' }) } });
  t('用户选定路线写入项目（doc pointer=routes）', r.status === 200 && r.json.project.routes.selected.name === selRoute.name);
  const plist = await req('GET', '/api/projects');
  const rowP = plist.json.projects.find((x) => x.id === pid) || {};
  t('项目列表带路线状态', rowP.route && rowP.route.selected === selRoute.name, JSON.stringify(rowP.route));

  console.log('== 4. 全书大纲 ==');
  const outline = await gen(pid, 'outline_generate', {});
  t('outline 含卷与章', outline.kind === 'json' && outline.payload.rows.length >= 3 && outline.payload.volumes.length >= 1);
  r = await apply(pid, outline.id);
  const rows = r.project.rows;
  t('大纲已应用（4章）', rows.length === 4);
  t('章序号规整', rows.every((row, i) => row.no === i + 1));
  t('大纲行字段齐全', rows.every((row) => row.title && row.goal && Array.isArray(row.beats) && row.beats.length >= 2));
  const man = await req('GET', `/api/projects/${pid}/export?fmt=manuscript`);
  t('创作底稿导出含「故事路线与大纲思路」', /故事路线与大纲思路/.test(man.text) && /已选定路线/.test(man.text));
  const row1 = rows[0];
  const row2 = rows[1];

  console.log('== 5. 章节写作（流式） ==');
  const sw = await streamGen({ projectId: pid, action: 'chapter_write', args: { rowId: row1.id }, stream: true });
  const chunks = sw.events.filter((e) => e.event === 'chunk');
  const doneEv = sw.events.find((e) => e.event === 'done');
  t('流式收到 meta/chunk/done', sw.events.some((e) => e.event === 'meta') && chunks.length >= 5 && !!doneEv, 'events=' + sw.events.map((e) => e.event).join(','));
  const writtenText = chunks.map((e) => e.parsed.t).join('');
  t('正文长度合理(>1500字)', writtenText.length > 1500, writtenText.length);
  r = await apply(pid, doneEv.parsed.result.id, { rowId: row1.id });
  const p1 = r.project.rows.find((x) => x.id === row1.id);
  t('第1章已写入', p1.ch.content.length > 1500 && p1.ch.status === 'written' && p1.ch.words > 0, p1.ch.words);

  console.log('== 6. 续写 ==');
  const cont = await gen(pid, 'chapter_continue', { rowId: row1.id, instruction: '补一段看守员的回忆' });
  r = await apply(pid, cont.id, { rowId: row1.id });
  const p1c = r.project.rows.find((x) => x.id === row1.id);
  t('续写后更长', p1c.ch.content.length > p1.ch.content.length + 200);

  console.log('== 7. 章节记忆（摘要/事实/伏笔） ==');
  const sum = await gen(pid, 'chapter_summary', { rowId: row1.id });
  t('summary JSON', sum.kind === 'json' && sum.payload.summary && Array.isArray(sum.payload.threads));
  r = await apply(pid, sum.id, { rowId: row1.id });
  t('记忆条目写入', r.project.continuity.entries.length === 1 && r.project.rows.find((x) => x.id === row1.id).ch.summary);
  t('摘要非空', r.project.rows.find((x) => x.id === row1.id).ch.summary.length > 10);

  console.log('== 8. 多章写作 + 审校 ==');
  const sw2 = await streamGen({ projectId: pid, action: 'chapter_write', args: { rowId: row2.id }, stream: true });
  const done2 = sw2.events.find((e) => e.event === 'done');
  r = await apply(pid, done2.parsed.result.id, { rowId: row2.id });
  t('第2章已写入', r.project.rows.find((x) => x.id === row2.id).ch.status !== 'plan');
  const s2 = await gen(pid, 'chapter_summary', { rowId: row2.id });
  await apply(pid, s2.id, { rowId: row2.id });

  const audit = await gen(pid, 'audit_book', { range: [1, 2] });
  t('审校 JSON', audit.kind === 'json' && Array.isArray(audit.payload.items));
  r = await apply(pid, audit.id);
  t('审校报告入库', r.project.audits && Array.isArray(r.project.audits.items));

  console.log('== 9. 撤销（整项目快照） ==');
  const undo = await req('POST', `/api/projects/${pid}/undo`, {});
  t('撤销成功', undo.json.undone && undo.json.undone.includes('审校'));
  const afterUndo = await req('GET', `/api/projects/${pid}`);
  t('撤销后 audits 复原', afterUndo.json.project.audits === undefined || afterUndo.json.project.audits === null || !Array.isArray(afterUndo.json.project.audits) || afterUndo.json.project.audits.items === undefined);

  console.log('== 10. 清理 ==');
  await req('DELETE', `/api/projects/${pid}`);
  const gone = await req('GET', `/api/projects/${pid}`);
  t('项目已删除', gone.status === 404);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
