// acceptance.js — 全流程验收（模拟引擎，等价验收标准“curl 全流程”）
// run: node scripts/acceptance.js [baseUrl]
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
const OUT = path.resolve(__dirname, '../data/acceptance-out');
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 220) : '')); }
};
async function req(method, p, body) {
  const res = await fetch(BASE + p, {
    method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}
async function streamGen(body) {
  const res = await fetch(BASE + '/api/gen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ stream: true }, body)) });
  const events = [];
  const reader = res.body.getReader(); const dec = new TextDecoder('utf-8');
  let buf = '', cur = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      if (line.startsWith('event: ')) cur = { event: line.slice(7), data: '' };
      else if (line.startsWith('data: ') && cur) { cur.data += line.slice(6); try { cur.parsed = JSON.parse(cur.data); } catch (e) {} events.push(cur); cur = null; }
    }
  }
  return { events };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('== 0 环境 ==');
  let r = await req('GET', '/api/health');
  t('服务健康', r.status === 200 && r.json.ok);
  const demo = await req('GET', '/api/projects/nf_demo_fogport');
  t('示例项目在位', demo.status === 200 && demo.json.project.rows.length >= 8);

  console.log('== 1 点子（flesh） ==');
  r = await req('POST', '/api/projects', { name: '验收·长夜星图', desc: 'acceptance e2e' });
  const pid = r.json.project.id;
  await req('PUT', `/api/projects/${pid}/doc`, { pointer: 'idea', value: { title: '《长夜星图》', genres: ['奇幻', '冒险'], targetWords: 100000, logline: '守星人学徒在星图缺失的第十三个星座里，发现自己的名字。', premise: '王朝以“星图”治理四季，学徒阿澈发现第十三星座被抹除，而他的名字刻在其中。', pov: '第三人称限知', tone: '恢弘而克制', audience: '', hook: '', conflict: '', extra: '', candidates: [] } });
  let g = await req('POST', '/api/gen', { projectId: pid, action: 'idea_flesh', args: {}, stream: false });
  t('idea_flesh 生成', g.status === 200 && g.json.result.kind === 'json' && g.json.result.payload.title);
  r = await req('POST', '/api/apply', { projectId: pid, resultId: g.json.result.id });
  t('应用立项书', r.status === 200);

  console.log('== 2 人物群像 ==');
  g = await req('POST', '/api/gen', { projectId: pid, action: 'characters_generate', args: { count: 5 }, stream: false });
  t('群像 5 人', g.json.result.payload.length === 5);
  await req('POST', '/api/apply', { projectId: pid, resultId: g.json.result.id });
  r = await req('GET', `/api/projects/${pid}`);
  t('群像入库', r.json.project.characters.length === 5);

  console.log('== 3 世界观 ==');
  g = await req('POST', '/api/gen', { projectId: pid, action: 'bible_generate', args: {}, stream: false });
  await req('POST', '/api/apply', { projectId: pid, resultId: g.json.result.id });
  r = await req('GET', `/api/projects/${pid}`);
  t('设定入库', (r.json.project.bible.sections || []).length >= 3 && (r.json.project.bible.rules || []).length >= 3);

  console.log('== 4 全书大纲 ==');
  g = await req('POST', '/api/gen', { projectId: pid, action: 'outline_generate', args: {}, stream: false });
  await req('POST', '/api/apply', { projectId: pid, resultId: g.json.result.id });
  r = await req('GET', `/api/projects/${pid}`);
  const rows = r.json.project.rows;
  t('大纲 ≥3 章且编号规整', rows.length >= 3 && rows.every((x, i) => x.no === i + 1));

  console.log('== 5 流式章节写作 ×2 + 记忆归档 ==');
  for (const row of rows.slice(0, 2)) {
    const s = await streamGen({ projectId: pid, action: 'chapter_write', args: { rowId: row.id } });
    const chunks = s.events.filter((e) => e.event === 'chunk');
    const done = s.events.find((e) => e.event === 'done');
    if (!done || chunks.length < 3) { t(`第${row.no}章流式失败`, false); continue; }
    await req('POST', '/api/apply', { projectId: pid, resultId: done.parsed.result.id, rowId: row.id });
    const sg = await req('POST', '/api/gen', { projectId: pid, action: 'chapter_summary', args: { rowId: row.id }, stream: false });
    await req('POST', '/api/apply', { projectId: pid, resultId: sg.json.result.id, rowId: row.id });
    t(`第${row.no}章：流式写正文+归档`, done.parsed.result.payload.length > 800);
  }
  r = await req('GET', `/api/projects/${pid}`);
  const cont = r.json.project.continuity.entries;
  t('记忆 2 条（含事实与线索字段）', cont.length === 2 && cont.every((e) => Array.isArray(e.facts)));

  console.log('== 6 全文一致性审查 ==');
  g = await req('POST', '/api/gen', { projectId: pid, action: 'audit_book', args: {}, stream: false });
  t('审查结构化', g.status === 200 && Array.isArray(g.json.result.payload.items));
  await req('POST', '/api/apply', { projectId: pid, resultId: g.json.result.id });
  r = await req('GET', `/api/projects/${pid}`);
  t('审查报告入库', r.json.project.audits && Array.isArray(r.json.project.audits.items));

  console.log('== 7 无人值守写完全部剩余章 ==');
  await req('POST', '/api/pipeline/start', { projectId: pid, mode: 'write' });
  await new Promise((res) => setTimeout(res, 120));
  for (let i = 0; i < 120; i++) {
    const st = await req('GET', '/api/pipeline/status');
    const pl = st.json.pipeline;
    if (pl.status === 'idle' && pl.last && ['done', 'stopped', 'error'].includes(pl.last.status)) break;
    if (pl.last && ['done', 'stopped', 'error'].includes(pl.last.status) && pl.status === 'idle') break;
    await new Promise((res) => setTimeout(res, 100));
  }
  r = await req('GET', `/api/projects/${pid}`);
  const pAll = r.json.project;
  t('剩余章节全部写完', (pAll.rows || []).every((x) => x.ch && x.ch.content));
  t('连续性记忆覆盖全部章', (pAll.continuity.entries || []).length === pAll.rows.length);

  console.log('== 8 导出与文件校验 ==');
  const outFiles = [];
  for (const fmt of ['md', 'manuscript', 'txt', 'json']) {
    const ex = await req('GET', `/api/projects/${pid}/export?fmt=${fmt}`);
    const fn = path.join(OUT, `accept_${fmt}.${fmt === 'json' ? 'json' : fmt === 'manuscript' ? 'md' : fmt}`);
    fs.writeFileSync(fn, ex.text, 'utf8');
    outFiles.push({ fn, size: ex.text.length, fmt });
  }
  const mdOk = outFiles.find((x) => x.fmt === 'md');
  const mdTxt = fs.readFileSync(mdOk.fn, 'utf8');
  t('md 文件含全书标题与全部章', mdTxt.includes('长夜星图') && (mdTxt.match(/^### /gm) || []).length === pAll.rows.length, '章数=' + (mdTxt.match(/^### /gm) || []).length);
  const jsTxt = fs.readFileSync(path.join(OUT, 'accept_json.json'), 'utf8');
  const jsParsed = JSON.parse(jsTxt);
  t('json 备份与库内一致（行/记忆/人物）', jsParsed.rows.length === pAll.rows.length && jsParsed.characters.length === 5 && jsParsed.idea.title.includes('长夜星图'));
  const txtOk = fs.readFileSync(path.join(OUT, 'accept_txt.txt'), 'utf8');
  t('txt 纯正文含 全文完', txtOk.includes('全文完'));
  const manuOk = fs.readFileSync(path.join(OUT, 'accept_manuscript.md'), 'utf8');
  t('manuscript 含创作底稿区块', manuOk.includes('人物卡') && manuOk.includes('连续性记忆档案') && manuOk.includes('大纲'));
  for (const o of outFiles) console.log(`    · ${path.basename(o.fn)} = ${o.size} B`);

  console.log('== 9 清理 ==');
  await req('DELETE', `/api/projects/${pid}`);
  t('验收项目已清理', true);

  console.log(`\n验收结果: ${pass} 通过 / ${fail} 失败（导出物保留于 data/acceptance-out/）`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('fatal:', e); process.exit(1); });
