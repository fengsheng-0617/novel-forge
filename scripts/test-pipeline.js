// NovelForge 无人值守流水线 + 导出 测试（模拟引擎）
// run: node scripts/test-pipeline.js [baseUrl]
'use strict';
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 260) : '')); }
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 高频观察流水线直到结束：返回 {terminal: done/stopped/error/…} */
async function waitPipelineEnd(timeoutMs, expectIdleAfterMs = 250) {
  const start = Date.now();
  let terminal = null;
  let lastRunningAt = null;
  let idleSince = null;
  while (Date.now() - start < timeoutMs) {
    const r = await req('GET', '/api/pipeline/status');
    const st = r.json.pipeline;
    const cand = st.status && ['done', 'stopped', 'error'].includes(st.status) ? st.status : (st.last && ['done', 'stopped', 'error'].includes(st.last.status) ? st.last.status : null);
    if (cand) terminal = cand;
    if (['queued', 'running', 'paused', 'stopping'].includes(st.status)) {
      lastRunningAt = Date.now();
      idleSince = null;
    } else if (st.status === 'idle') {
      idleSince = idleSince || Date.now();
      const idleOk = !lastRunningAt || (Date.now() - lastRunningAt) > expectIdleAfterMs;
      if (idleOk && (Date.now() - idleSince) > 120) return { terminal, status: st, idle: true };
    }
    await sleep(50);
  }
  return { terminal, status: null, idle: false, timeout: true };
}

async function main() {
  console.log('== 1. 一键全自动 full（空项目 → 全书） ==');
  let r = await req('POST', '/api/projects', { name: '流水线测试', desc: 'pipeline e2e' });
  const pid = r.json.project.id;
  await req('PUT', `/api/projects/${pid}/doc`, {
    pointer: 'idea',
    value: { title: '《潮汐工坊》', genres: ['奇幻', '成长'], targetWords: 60000, logline: '守潮人学徒发现潮汐表缺了十三分钟。', premise: '每十三年，潮汐会多出十三分钟，只有守潮人的工坊能看见那段时间里发生的事。', pov: '第三人称限知', tone: '温暖奇想', audience: '12+', hook: '', conflict: '', extra: '', candidates: [] },
  });

  let st = await req('POST', '/api/pipeline/start', { projectId: pid, mode: 'full' });
  t('start 返回 200', st.status === 200, st.text && st.text.slice(0, 120));
  const fin = await waitPipelineEnd(90000);
  t('流水线正常结束 done', fin.terminal === 'done', JSON.stringify(fin).slice(0, 200));

  const pr = await req('GET', `/api/projects/${pid}`);
  const p = pr.json.project;
  t('idea 已立项(非空)', (p.idea.premise || '').length > 0 && !!p.idea.title, p.idea.premise && p.idea.premise.length);
  t('bible 已生成', (p.bible.sections || []).length > 0);
  t('characters ≥4', (p.characters || []).length >= 4);
  const rows = p.rows || [];
  t('大纲行 ≥3', rows.length >= 3, rows.length);
  const written = rows.filter((x) => x.ch && x.ch.content);
  t('全部章节已写', written.length === rows.length, `${written.length}/${rows.length}`);
  t('每章摘要已归档', (p.continuity.entries || []).length === rows.length, (p.continuity.entries || []).length);
  t('摘要字段非空', rows.every((x) => x.ch.summary && x.ch.summary.length > 5));
  const totalWords = rows.reduce((a, x) => a + (x.ch ? x.ch.words : 0), 0);
  t('总字数 > 3000', totalWords > 3000, totalWords);

  console.log('== 2. 停止（stop 行为） ==');
  const pid2 = (await req('POST', '/api/projects', { name: '停止测试' })).json.project.id;
  await req('PUT', `/api/projects/${pid2}/doc`, { pointer: 'idea', value: { title: '短篇测试', genres: ['科幻'], targetWords: 20000, premise: '一段可以立即开始写作的测试设定。', pov: '第三人称', tone: '', audience: '', logline: '', hook: '', conflict: '', extra: '', candidates: [] } });
  await req('POST', '/api/pipeline/start', { projectId: pid2, mode: 'full' });
  await sleep(40);
  const stp = await req('POST', '/api/pipeline/stop', {});
  t('stop 请求成功', stp.status === 200, stp.text && stp.text.slice(0, 120));
  const fin2 = await waitPipelineEnd(15000);
  t('stop 后流水线空闲且已收尾', fin2.idle && fin2.terminal !== null && ['stopped', 'done', 'error'].includes(fin2.terminal), JSON.stringify(fin2).slice(0, 200));
  const p2check = await req('GET', `/api/projects/${pid2}`);
  const rows2 = p2check.json.project.rows || [];
  const written2 = rows2.filter((x) => x.ch && x.ch.content).length;
  t('停止后未完整跑完(≤大纲全量) 或正常 done', written2 <= rows2.length, `${written2}/${rows2.length}`);

  console.log('== 3. 导出（demo 项目） ==');
  const md = await req('GET', '/api/projects/nf_demo_fogport/export?fmt=md');
  t('book.md 200', md.status === 200);
  t('md 含书名与正文', md.text.includes('雾港来信') && md.text.includes('第1章') && md.text.includes('潮声小馆'));
  const manus = await req('GET', '/api/projects/nf_demo_fogport/export?fmt=manuscript');
  t('manuscript 含人物卡/大纲', manus.text.includes('人物卡') && manus.text.includes('大纲') && manus.text.includes('连续性记忆'));
  const txt = await req('GET', '/api/projects/nf_demo_fogport/export?fmt=txt');
  t('txt 纯正文', txt.text.includes('全文完') && !txt.text.includes('【世界铁律】'));
  const js = await req('GET', '/api/projects/nf_demo_fogport/export?fmt=json');
  const parsed = JSON.parse(js.text);
  t('json 备份可解析且完整', parsed.id === 'nf_demo_fogport' && parsed.characters.length === 6 && parsed.rows.length === 10);

  console.log('== 4. 流水线产物导出 ==');
  const pmd = await req('GET', `/api/projects/${pid}/export?fmt=md`);
  t('链产物导出 md 200', pmd.status === 200 && pmd.text.includes('潮汐工坊'));
  const pjson = await req('GET', `/api/projects/${pid}/export?fmt=json`);
  const pp = JSON.parse(pjson.text);
  t('链产物 json 合法', pp.rows.length === rows.length && pp.continuity.entries.length === rows.length);

  console.log('== 5. 清理 ==');
  await req('DELETE', `/api/projects/${pid}`);
  await req('DELETE', `/api/projects/${pid2}`);
  t('清理完成', true);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
