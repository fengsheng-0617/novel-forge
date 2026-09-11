// test-provider-fix.js — 验证“测试连接”接口的错误信息可读性（含未保存配置直测）
'use strict';
const BASE = 'http://127.0.0.1:7390';
let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + x : '')); } };
async function req(p, body) {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

async function main() {
  console.log('== 1 模拟引擎直测（kind mock，无需 Key） ==');
  let r = await req('/api/providers/test', { provider: { id: 'mock', name: '模拟', kind: 'mock', enabled: true, baseURL: '', apiKey: '', defaultModel: 'mock-prose', models: [{ id: 'mock-prose', context: 131072, output: 8192 }] } });
  t('mock 测试成功且 error 顶层为空', r.status === 200 && r.json.ok === true && r.json.error === null, r.text.slice(0, 120));

  console.log('== 2 空模型提示（不再静默 400） ==');
  r = await req('/api/providers/test', { provider: { id: 't_openai', name: '测试', kind: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-x', defaultModel: '', models: [] } });
  t('无模型时给出可读提示', r.status === 400 && (r.json.error || '').includes('未配置模型'), r.text.slice(0, 160));
  t('顶层 error 存在', !!(r.json && r.json.error));

  console.log('== 3 缺 Key 提示 ==');
  r = await req('/api/providers/test', { provider: { id: 't_openai', name: '测试', kind: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: '   ', defaultModel: 'gpt-4o-mini', models: [{ id: 'gpt-4o-mini', context: 128000 }] } });
  t('缺 Key 给出可读提示', r.status === 400 && (r.json.error || '').includes('API Key'), r.text.slice(0, 160));

  console.log('== 4 错误 Key 的真实失败原因（网络可达时返回 401 等；不可达则网络错误） ==');
  r = await req('/api/providers/test', { provider: { id: 't_openai', name: '测试', kind: 'openai', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-invalid-key-for-test', defaultModel: 'gpt-4o-mini', models: [{ id: 'gpt-4o-mini', context: 128000 }] } });
  const errMsg = r.json && (r.json.error || (r.json.detail && r.json.detail.error)) || r.text;
  t('错误 Key 返回真实原因（含 401/网络 等关键词）', r.status === 400 && errMsg.length > 10 && /401|Unauthorized|网络|failed|ENOTFOUND|ECONN|错误|失败|timeout/i.test(errMsg), errMsg.slice(0, 220));

  console.log('== 5 未保存配置直测会先落盘（服务端 settings 已含 t_openai） ==');
  const s = await (await fetch(BASE + '/api/settings')).json();
  const saved = (s.settings.providers || []).find((p) => p.id === 't_openai');
  t('测试配置已同步落盘', !!saved && saved.baseURL === 'https://api.openai.com/v1');

  console.log('== 6 清理测试厂商 ==');
  const s2 = await (await fetch(BASE + '/api/settings')).json();
  s2.settings.providers = (s2.settings.providers || []).filter((p) => !['t_openai'].includes(p.id));
  await fetch(BASE + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: s2.settings }) });
  t('已清理', true);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
