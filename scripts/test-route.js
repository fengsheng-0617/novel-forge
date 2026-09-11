// test-route.js —— 故事路线（大纲思路）引导环节的模块级测试（无需服务、无需 Key）
// 覆盖：① route_plan 模板/动作注册与字段规范；② 候选归一化与入库语义；
//       ③ {{routeText}} 变量注入（未选定→AI 推荐并标注；已选定→按用户选择），保证大纲不跑偏。
// run: node scripts/test-route.js
'use strict';
const ctxMod = require('../server/context');
const { TEMPLATES } = require('../server/templates');
const actionsMod = require('../server/actions');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 240) : '')); }
};

function fakeProject() {
  return {
    id: 'nf_route_test', name: '路线测试',
    idea: { title: '雾港来信', genres: ['悬疑'], targetWords: 200000, logline: '守夜人收到来自未来的信。', premise: '雾港的灯塔与一叠未寄出的信。' },
    bible: {}, styleGuide: {}, characters: [], rows: [], continuity: { entries: [] },
    routes: { candidates: [], selected: null, updatedAt: '' },
  };
}

console.log('== 1. 模板与动作注册 ==');
const tpl = TEMPLATES.find((x) => x.key === 't_route_plan');
t('存在 t_route_plan 模板（stage=idea, json）', !!tpl && tpl.stage === 'idea' && tpl.output === 'json');
t('模板要求输出 思路/阶段路线/结局/风险/推荐', !!tpl
  && /approach/.test(tpl.user) && /structure/.test(tpl.user) && /ending/.test(tpl.user) && /risk/.test(tpl.user) && /recommended/.test(tpl.user));
const tplOutline = TEMPLATES.find((x) => x.key === 't_outline_generate');
t('大纲模板声明 routeText 变量并强制遵循路线', !!tplOutline
  && (tplOutline.vars || []).includes('routeText') && /\{\{routeText\}\}/.test(tplOutline.user) && /故事路线/.test(tplOutline.system));
const tplExtend = TEMPLATES.find((x) => x.key === 't_outline_extend');
t('续写大纲同样注入 routeText', !!tplExtend
  && (tplExtend.vars || []).includes('routeText') && /\{\{routeText\}\}/.test(tplExtend.user));

const def = actionsMod.ACTIONS && actionsMod.ACTIONS.route_plan;
t('ACTIONS 注册 route_plan', !!def && def.tpl === 't_route_plan' && def.kind === 'json');
t('route_plan 在 order 里给足变量（ideaText/extraNote）', !!def && ['ideaText', 'extraNote'].every((k) => def.order.includes(k)));
t('outline_generate / outline_extend 的 order 含 routeText',
  actionsMod.ACTIONS.outline_generate.order.includes('routeText') && actionsMod.ACTIONS.outline_extend.order.includes('routeText'));

console.log('== 2. 候选归一化与入库 ==');
const raw = [
  { name: 'A 单线直推', approach: '思路 A', structure: [{ phase: '第一幕', span: '第1~8章', goal: '立局', turn: '入局' }], coreConflict: '冲突 A', ending: '结局 A', risk: '风险 A' },
  { name: 'B 双线对撞', approach: '思路 B', structure: [{ phase: '第一幕', span: '第1~6章', goal: '立局', turn: '入局' }], coreConflict: '冲突 B', ending: '结局 B', risk: '风险 B', recommended: true },
  { name: 'C 群像切面', approach: '思路 C' },
];
const norm = def.normalize(raw);
t('归一化保留全部候选与结构', norm.length === 3 && norm[0].structure.length === 1 && norm[0].structure[0].phase === '第一幕');
t('归一化保证恰有一条 recommended', norm.filter((x) => x.recommended).length === 1 && norm[1].recommended === true);
let threw = false;
try { def.normalize([]); } catch (e) { threw = e.status === 422; }
t('空候选直接报错（422，不改数据）', threw);

const p = fakeProject();
const applied = def.apply(p, norm, {});
t('apply 写入候选池且未替用户选定', p.routes.candidates.length === 3 && p.routes.selected === null, applied);
const p2 = fakeProject();
def.apply(p2, norm, {});
p2.routes.selected = Object.assign({}, norm[0], { mode: 'user' });
def.apply(p2, norm, {});
t('重新生成候选会作废旧选择（需重新选定）', p2.routes.selected === null);

console.log('== 3. routeText 注入 ==');
const pNone = fakeProject();
const vNone = ctxMod.buildVars(pNone, { idea: true, route: true });
t('无候选时提示先做引导', /尚未给出故事路线/.test(vNone.routeText), vNone.routeText);

const pCand = fakeProject();
pCand.routes.candidates = norm;
const vCand = ctxMod.buildVars(pCand, { idea: true, route: true });
t('有候选未选定时按 AI 推荐路线注入并明确标注', /尚未确认路线/.test(vCand.routeText) && vCand.routeText.includes('B 双线对撞'));

const pSel = fakeProject();
pSel.routes.candidates = norm;
pSel.routes.selected = Object.assign({}, norm[0], { mode: 'custom', approach: '用户自定义：冷硬派双线' });
const vSel = ctxMod.buildVars(pSel, { idea: true, route: true });
t('已选定时注入用户选定路线（含思路/冲突/结局/风险全文）',
  /用户自定义并确认/.test(vSel.routeText) && vSel.routeText.includes('冷硬派双线') && vSel.routeText.includes('阶段路线'));

const rendered = ctxMod.renderTemplate(tplOutline, Object.assign({ totalWords: '200000', chapterCount: '60', chapterWords: '3200', extraNote: '（无）', bibleText: '', charsText: '', styleText: '' }, vSel));
t('渲染后大纲提示词内出现选定路线且无残留占位符',
  rendered.user.includes('冷硬派双线') && !/\{\{[A-Za-z0-9_]+\}\}/.test(rendered.user + rendered.system));

const vPlain = ctxMod.buildVars(fakeProject(), { idea: true });
t('未点选 route 的动作不受影响（不注入 routeText）', vPlain.routeText === undefined);

console.log(`\n路线引导测试: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
