// 浏览器内核渲染验收：用 Edge headless --dump-dom 检查各路由真实挂载与内容
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:7390';
const CASES = [
  ['#/', ['织文 NovelForge', '项目库', '示例 · 雾港来信', '新建空白项目']],
  ['#/p/nf_demo_fogport/idea', ['① 灵感点子', '创意卡', '《雾港来信》', '头脑风暴 · 点子池']],
  ['#/p/nf_demo_fogport/bible', ['② 世界观设定', '世界铁律', '设定分节', '专有名词表', '增量补充设定']],
  ['#/p/nf_demo_fogport/characters', ['③ 人物群像', '沈既明', '林照影', '江彻', '空白卡', '校准一致性']],
  ['#/p/nf_demo_fogport/outline', ['④ 卷章大纲', '手动加章', '登场人物', '🤖 精修本章', '🤖 生成全书大纲']],
  ['#/p/nf_demo_fogport/writing', ['⑤ 章节写作', '归档记忆', '无人值守连载', '第2章']],
  ['#/p/nf_demo_fogport/audit', ['⑥ 审校 · 连续性 · 风格', '记忆档案', '文风与写作基准', '一致性审查', '后天来信']],
  ['#/p/nf_demo_fogport/export', ['导出成书', '创作底稿 Markdown', '下载']],
  ['#/settings', ['模型厂商', '默认引擎与生成参数', '提示词模板库', 'DeepSeek', 'Gemini', 'Grok']],
];

let pass = 0, fail = 0;
for (const [route, markers] of CASES) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-edge-'));
  let dom = '';
  try {
    const args = [
      '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--user-data-dir=' + profile, '--virtual-time-budget=20000', '--dump-dom', BASE + route,
    ];
    dom = execFileSync(EDGE, args, { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 45000 }).toString('utf8');
  } catch (e) {
    console.log('FAIL ' + route + ' 浏览器启动异常: ' + e.message.split('\n')[0]);
    fail++;
    continue;
  } finally {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
  const missing = markers.filter((m) => !dom.includes(m));
  if (!missing.length) {
    pass++;
    console.log('ok  ' + route + '  (' + markers.length + ' markers, dom ' + dom.length + ' chars)');
  } else {
    fail++;
    console.log('FAIL ' + route + ' 缺失: ' + missing.join(' | '));
    console.log('     dom 片段: ' + dom.replace(/\s+/g, ' ').slice(0, 300));
  }
}
console.log(`\n浏览器渲染验收: ${pass}/${CASES.length} 路由通过`);
process.exit(fail ? 1 : 0);
