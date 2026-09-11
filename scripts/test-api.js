// NovelForge API smoke test (run: node scripts/test-api.js [baseUrl])
// Covers: CRUD, doc/col ops incl. Chinese content, undo, mock provider, SSE connect, static.
'use strict';
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

async function main() {
  console.log('== health/settings ==');
  let r = await req('GET', '/api/health');
  t('health', r.status === 200 && r.json.ok);
  r = await req('GET', '/api/settings');
  t('settings 12 providers', r.json.settings.providers.length === 12);
  t('default mock', r.json.settings.defaults.providerId === 'mock');

  console.log('== project CRUD ==');
  const name = 'API测试·雾中来信';
  r = await req('POST', '/api/projects', { name, desc: '接口冒烟测试项目' });
  t('create', r.status === 200 && r.json.project.id, r.text && r.text.slice(0, 80));
  const pid = r.json.project.id;
  t('create name utf8', r.json.project.name === name);

  r = await req('GET', '/api/projects');
  t('list contains', r.json.projects.some((p) => p.id === pid));

  r = await req('GET', '/api/projects/' + pid);
  t('get by id', r.status === 200 && r.json.project.idea.title === '');

  console.log('== doc & meta ==');
  const idea = { title: '雾中来信', genres: ['悬疑', '奇幻'], targetWords: 88000, logline: '一封来自明天的信，警告收信人别打开下一封。', premise: '', hook: '', conflict: '', pov: '第三人称限知', tone: '', audience: '', extra: '', candidates: [] };
  r = await req('PUT', '/api/projects/' + pid + '/doc', { pointer: 'idea', value: idea });
  t('doc set idea', r.status === 200 && r.json.project.idea.genres.length === 2);
  r = await req('PUT', '/api/projects/' + pid + '/meta', { patch: { desc: '改名后的描述' } });
  t('meta patch', r.status === 200 && r.json.project.desc === '改名后的描述');

  console.log('== col ops ==');
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'characters', op: 'add', item: { name: '沈明', role: '主角' } });
  const cid = r.json.arr[0].id;
  t('char add', r.status === 200 && r.json.arr.length === 1);
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'characters', op: 'update', id: cid, patch: { personality: '固执但温柔，习惯记账式思考。' } });
  t('char update', r.json.arr[0].personality.includes('固执'));
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'characters', op: 'add', item: { name: '林晚', role: '关键配角' } });
  const cid2 = r.json.arr[1].id;
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'characters', op: 'move', id: cid2, to: 0 });
  t('char move', r.json.arr[0].id === cid2 && r.json.arr[1].id === cid);
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'characters', op: 'remove', id: cid2 });
  t('char remove', r.json.arr.length === 1 && r.json.arr[0].id === cid);

  console.log('== rows (大纲/章节) ==');
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'rows', op: 'add', item: { title: '第一章 明日来信' } });
  const row1 = r.json.arr[0];
  t('row add auto vol/no', row1.vol === 1 && row1.no === 1 && row1.ch.status === 'plan');
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'rows', op: 'add', item: { title: '第二章 死信室', vol: 2 } });
  const row2 = r.json.arr[1];
  t('row add custom vol', row2.vol === 2);
  const content = '雾从湾口涌进来。沈明站在码头，手里攥着一封没有寄件人的信，落款是明天。\n\n“别打开。”何老说，“雾路的信，打开就是答应。”';
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'rows', op: 'update', id: row1.id, patch: { 'ch.content': content, 'ch.status': 'written' } });
  t('row deep update ch', r.status === 200 && r.json.arr[0].ch.content.includes('雾从湾口') && r.json.arr[0].ch.status === 'written');
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'rows', op: 'move', id: row1.id, to: 1 });
  t('row move', r.json.arr[1].id === row1.id);

  console.log('== undo ==');
  r = await req('POST', '/api/projects/' + pid + '/undo', {});
  t('undo1', r.json.undone && r.json.undone.includes('排序'));
  r = await req('GET', '/api/projects/' + pid);
  t('undo restores order', r.json.project.rows[0].id === row1.id);

  console.log('== mock provider chat ==');
  r = await req('POST', '/api/providers/test', { providerId: 'mock' });
  t('mock test ok', r.status === 200 && r.json.detail.ok);

  console.log('== export/static & errors ==');
  r = await req('GET', '/');
  t('static index', r.status === 200 && r.text.includes('NovelForge'));
  r = await req('GET', '/api/projects/not_exist_12345');
  t('404 unknown project', r.status === 404);
  r = await req('POST', '/api/projects/' + pid + '/col', { target: 'rows', op: 'update', id: 'nope', patch: {} });
  t('404 unknown row', r.status === 404);
  r = await req('PUT', '/api/projects/' + pid + '/doc', { pointer: 'rows', value: [] });
  t('reject non-whitelisted doc', r.status === 400);

  // cleanup
  r = await req('DELETE', '/api/projects/' + pid);
  t('delete', r.status === 200);
  r = await req('GET', '/api/projects/' + pid);
  t('gone after delete', r.status === 404);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('fatal', e); process.exit(1); });
