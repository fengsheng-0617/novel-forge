'use strict';
// actions.js — 生成动作注册表与执行引擎。
// 每个动作：如何组装上下文、用什么模板、如何把模型输出解析并应用到项目。
// 流式能力：generate() 的 emitter 回调向客户端转发 chunk/meta/done/error。

const util = require('./util');
const store = require('./store');
const settingsMod = require('./settings');
const llm = require('./llm');
const ctxMod = require('./context');
const { TEMPLATES } = require('./templates');

// ============================================================ 常量与工具

const NAME_POOL = ['苏衍', '白芷', '陆沉舟', '秦昭雪', '顾长风', '叶未晚', '温砚', '霍青崖', '小满', '钟离澈'];
const KIND = { json: 'json', prose: 'prose' };

function clampNum(v, lo, hi, dft) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dft;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function emptyRow() {
  return { vol: 1, no: 1, title: '', goal: '', beats: [], cast: [], pov: '', words: 0, notes: '', ch: { status: 'plan', summary: '', content: '', words: 0, model: '', updatedAt: '', history: [] } };
}

function normalizeRows(rows) {
  const out = [];
  const volNo = new Map();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const row = Object.assign(emptyRow(), r);
    row.id = r.id || util.uid('r_');
    row.vol = clampNum(row.vol, 1, 999, 1);
    row.words = clampNum(row.words, 300, 50000, 3000);
    row.beats = Array.isArray(row.beats) ? row.beats.map(String) : [];
    row.cast = Array.isArray(row.cast) ? row.cast.map(String) : [];
    row.title = String(row.title || `第${row.no || '?'}章`).slice(0, 60);
    row.notes = String(row.notes || '');
    row.ch = Object.assign({ status: 'plan', summary: '', content: '', words: 0, model: '', updatedAt: '', history: [] }, r.ch || {});
    const n = (volNo.get(row.vol) || 0) + 1;
    volNo.set(row.vol, n);
    row.no = n;
    out.push(row);
  }
  return out;
}

function normalizeChar(c) {
  const out = Object.assign({
    id: '', name: '', aliases: [], role: '配角', oneLine: '', pov: false,
    appearance: '', personality: '', goals: '', backstory: '', arc: '', speechStyle: '', secrets: '',
    relations: [], notes: '',
  }, c || {});
  out.id = c && c.id ? c.id : util.uid('c_');
  out.name = String(out.name || '无名氏').slice(0, 40);
  out.aliases = Array.isArray(out.aliases) ? out.aliases.map(String).slice(0, 8) : [];
  out.pov = !!out.pov;
  out.relations = Array.isArray(out.relations) ? out.relations.slice(0, 24).map((r) => ({ name: String(r.name || '').slice(0, 30), desc: String(r.desc || '').slice(0, 80) })) : [];
  for (const k of ['oneLine', 'appearance', 'personality', 'goals', 'backstory', 'arc', 'speechStyle', 'secrets', 'notes']) {
    out[k] = String(out[k] || '').slice(0, 2400);
  }
  return out;
}

// 各类角色卡通用字段顺序（用于把数组/对象规整为人物列表）
function toCharList(payload) {
  const arr = Array.isArray(payload) ? payload : payload ? [payload] : [];
  return arr.map(normalizeChar);
}

// 结果缓存
const resultCache = new Map(); // projectId -> entry[]

function cacheResult(projectId, entry) {
  let list = resultCache.get(projectId) || [];
  list = list.filter((e) => Date.now() - e.ts < 30 * 60 * 1000);
  list.unshift(entry);
  resultCache.set(projectId, list.slice(0, 8));
  return entry;
}
function takeResult(projectId, resultId) {
  const list = resultCache.get(projectId) || [];
  const i = list.findIndex((e) => e.id === resultId);
  if (i < 0) return null;
  return list[i];
}

// ============================================================ 动作定义

const CAPS = {
  ideaText: 2400, styleText: 2600, bibleText: 15000, charsText: 10000, outlineText: 26000, routeText: 4200,
  tailRowsText: 10000, curRowText: 2800, castText: 4000, prevText: 3200, contText: 5600,
  existingContent: 12000, existingTail: 3600, auditScope: 34000, rowNow: 2800, charNow: 2600,
  charsTextName: 1400, openThreadText: 3000, chapterContent: 20000,
  sourceText: 22000, sourceLang: 400, paramsText: 3000, outputsText: 4000, projLang: 200,
};

const ACTIONS = {
  // ---------------- 点子 ----------------
  idea_brainstorm: {
    label: '点子 · 头脑风暴', stage: 'idea', kind: KIND.json, tpl: 't_idea_brainstorm',
    about: '生成一组候选点子（可预览、逐条采纳）',
    vars(ctx) {
      const i = ctx.p.idea;
      return {
        genreHint: (i.genres || []).join('/') || '未定——建议覆盖不同品类给出方向',
        ideaNow: [i.title && `《${i.title}》`, i.logline, i.premise && util.truncate(i.premise, 260)].filter(Boolean).join('\n') || '（暂无）',
        count: String(clampNum(ctx.args.count, 1, 10, 8)),
      };
    },
    order: ['genreHint', 'ideaNow', 'extraNote'],
    mock(ctx) {
      return {
        shape: 'json',
        jsonExample: Array.from({ length: clampNum(ctx.args.count, 1, 10, 8) }, (_, k) => ({
          title: `《${k === 0 ? '雾中灯塔' : k === 1 ? '时间修理铺' : '无名快递' + (k + 1)}》`,
          genre: k % 2 ? '悬疑·奇幻' : '都市·科幻',
          logline: `一句话钩子 ${k + 1}：当{核心设定}遇上{人物困境}`,
          concept: `（模拟引擎生成的点子 ${k + 1}）核心设定、主角处境与贯穿悬念的示例文本，用于演示流程。`,
        })),
      };
    },
    normalize(payload) {
      const list = Array.isArray(payload) ? payload : [];
      return list.slice(0, 12).map((c) => ({
        title: String(c.title || '未命名点子').slice(0, 60),
        genre: String(c.genre || c.genres || '未分类').slice(0, 60),
        logline: String(c.logline || '').slice(0, 200),
        concept: String(c.concept || c.premise || '').slice(0, 2000),
      }));
    },
    apply(p, v, meta) {
      p.idea = Object.assign({}, p.idea, { candidates: v });
      return `点子池更新（${v.length} 个候选）`;
    },
  },

  idea_flesh: {
    label: '点子 · 深化立项书', stage: 'idea', kind: KIND.json, tpl: 't_idea_flesh',
    about: '把当前创意扩写为完整立项书（覆盖 创意字段）',
    vars(ctx) {
      const i = ctx.p.idea;
      const sel = ctx.args.conceptIndex != null && i.candidates && i.candidates[ctx.args.conceptIndex];
      return {
        genreHint: (i.genres || []).join('/') || '未定',
        ideaNow: sel
          ? `《${sel.title}》【${sel.genre}】\n钩子：${sel.logline}\n${sel.concept || ''}`
          : [i.title && `《${i.title}》`, i.logline, i.premise, i.hook].filter(Boolean).join('\n') || '（暂无具体点子：请基于题材自由提出完整创意）',
      };
    },
    order: ['genreHint', 'ideaNow', 'extraNote'],
    mock(ctx) {
      const i = ctx.p.idea;
      return {
        shape: 'json',
        jsonExample: {
          title: i.title || '《雾中来信》', genres: (i.genres && i.genres.length ? i.genres : ['悬疑', '奇幻']).slice(0, 3),
          targetWords: i.targetWords || 100000,
          logline: i.logline || '（模拟）主角收到一封来自未来的信，信上写着自己的死期。',
          premise: i.premise || '（模拟立项书正文：世界观、主角目标、阻碍与开篇的完整示例文字，共数百字，用于演示；真实模型将输出正式内容。）',
          hook: i.hook || '（模拟）第一封信的落款日期，是他死亡的前一天。',
          conflict: i.conflict || '（模拟）外部冲突与内部冲突与贯穿悬念的示例。',
          pov: i.pov || '第三人称限知', tone: i.tone || '冷冽写实', audience: i.audience || '悬疑爱好者',
        },
      };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : (Array.isArray(payload) ? payload[0] : {});
      return {
        title: String(o.title || '').slice(0, 80),
        genres: Array.isArray(o.genres) ? o.genres.map(String).slice(0, 3) : [],
        targetWords: clampNum(o.targetWords, 10000, 10000000, 100000),
        logline: String(o.logline || '').slice(0, 300),
        premise: String(o.premise || '').slice(0, 6000),
        hook: String(o.hook || '').slice(0, 600),
        conflict: String(o.conflict || '').slice(0, 1200),
        pov: String(o.pov || '').slice(0, 200),
        tone: String(o.tone || '').slice(0, 400),
        audience: String(o.audience || '').slice(0, 200),
      };
    },
    apply(p, v, meta) {
      p.idea = Object.assign({}, p.idea, v, { candidates: p.idea.candidates || [] });
      return `立项书已更新：《${v.title || '未命名'}》`;
    },
  },

  // ---------------- 故事路线（大纲思路：立项与大纲之间的强制性引导环节） ----------------
  route_plan: {
    label: '路线 · 故事路线与大纲思路', stage: 'idea', kind: KIND.json, tpl: 't_route_plan',
    about: '给出 2~5 条互不相同的「故事路线 + 大纲思路」候选（整体结构/阶段路线/主线冲突/结局/风险）；候选需人工选定，选定后生成的大纲会严格遵循该路线',
    order: ['ideaText', 'extraNote'],
    vars(ctx) {
      return { routeCount: String(clampNum(ctx.args.count, 2, 5, 3)) };
    },
    mock(ctx) {
      const i = ctx.p.idea || {};
      const titles = i.title ? `《${i.title}》` : '（模拟项目）';
      const n = clampNum(ctx.args.count, 2, 5, 3);
      const seeds = [
        { name: '主线直推·层层加压', approach: `（模拟路线 1）${titles}以单线主力推进：前三章立起核心悬念与代价，中段每 8~10 章抬升一次筹码，末段用"虚假胜利→重大代价"完成反转，收束于主角主动选择。`, tone: '第三人称限知·冷冽写实' },
        { name: '双线对撞·真相反噬', approach: `（模拟路线 2）${titles}采用双线交替：明线追查、暗线倒叙施压；两条线在每卷末交汇一次，逐步揭示主角自身即真相的一部分。`, tone: '双视角交替·压迫感' },
        { name: '群像切面·时代回响', approach: `（模拟路线 3）${titles}以群像切面展开：每卷换一位主视角，用不同立场反复照见同一事件，最终在末卷合流，落点在群像共同承担。`, tone: '多视角群像·厚重' },
      ];
      return {
        shape: 'json',
        jsonExample: Array.from({ length: n }, (_, k) => Object.assign({
          structure: [
            { phase: '第一幕·立局', span: '第1~8章', goal: '（模拟）建立日常与第一个异常，让读者看到代价。', turn: '（模拟）第一次失控：主角被迫入局。' },
            { phase: '第二幕·加压', span: '第9~24章', goal: '（模拟）线索推进与关系深化，敌人获得优势。', turn: '（模拟）虚假胜利：看似解决，实则打开更大的口子。' },
            { phase: '第三幕·代价', span: '第25~34章', goal: '（模拟）重大代价与真相逼近。', turn: '（模拟）主角必须放弃最初想要的东西。' },
            { phase: '第四幕·收束', span: '第35~40章', goal: '（模拟）终局对决与回环。', turn: '（模拟）结局落点。' },
          ],
          coreConflict: '（模拟）外部：追查与阻止；内部：是否愿意为真相付出代价。冲突每卷抬升一级筹码。',
          ending: '（模拟）主角以自身代价换回秩序，留下一个温柔的回环物件。',
          hooks: ['（模拟）日历上的名字', '（模拟）灯塔的锚点作用'],
          risk: '（模拟）节奏偏紧、配角戏份被压缩；适合偏好悬疑推进的读者。',
          recommended: k === 0,
        }, seeds[k % seeds.length])),
      };
    },
    normalize(payload) {
      const list = Array.isArray(payload) ? payload
        : (payload && Array.isArray(payload.routes) ? payload.routes : (payload && Array.isArray(payload.candidates) ? payload.candidates : []));
      const out = list.slice(0, 6).map((r) => ({
        name: String((r && (r.name || r.title)) || '未命名路线').slice(0, 60),
        approach: String((r && (r.approach || r.idea || r.summary)) || '').slice(0, 2400),
        structure: (Array.isArray(r && r.structure) ? r.structure : []).slice(0, 8).map((s) => ({
          phase: String((s && (s.phase || s.title || s.name)) || '').slice(0, 60),
          span: String((s && s.span) || '').slice(0, 60),
          goal: String((s && s.goal) || '').slice(0, 600),
          turn: String((s && (s.turn || s.hook)) || '').slice(0, 600),
        })).filter((s) => s.phase || s.goal),
        coreConflict: String((r && r.coreConflict) || '').slice(0, 1200),
        ending: String((r && r.ending) || '').slice(0, 900),
        tone: String((r && r.tone) || '').slice(0, 400),
        hooks: (Array.isArray(r && r.hooks) ? r.hooks : []).slice(0, 8).map((h) => String(h).slice(0, 300)).filter(Boolean),
        risk: String((r && r.risk) || '').slice(0, 900),
        recommended: !!(r && r.recommended),
      })).filter((r) => r.name || r.approach);
      if (!out.length) { const e = new Error('模型未返回任何故事路线候选，未做任何修改'); e.status = 422; throw e; }
      if (!out.some((r) => r.recommended)) out[0].recommended = true;
      return out;
    },
    apply(p, v, meta) {
      const had = p.routes && p.routes.selected ? `（原选定路线「${p.routes.selected.name || '?'}」已作废，需重新选定）` : '';
      p.routes = { candidates: v, selected: null, updatedAt: util.nowISO() };
      return `已生成 ${v.length} 条故事路线候选${had}——需人工选定后才会用于生成大纲`;
    },
  },

  // ---------------- 设定 ----------------
  bible_generate: {
    label: '设定 · 生成世界观', stage: 'bible', kind: KIND.json, tpl: 't_bible_generate',
    about: '依据立项书生成完整设定集（整体替换，可预览）',
    order: ['ideaText', 'styleText', 'charsText', 'extraNote'],
    mock(ctx) {
      const i = ctx.p.idea;
      return {
        shape: 'json',
        jsonExample: {
          summary: (i.premise || '（模拟）').slice(0, 300),
          rules: ['（模拟铁律1）任何超自然力量都有可检验的代价与限制。', '（模拟铁律2）信息可以穿越，但改变过去需要付出对等的现在。', '（模拟铁律3）核心地标（灯塔）是规则锚点，毁坏它会连锁失效。'],
          sections: [
            { title: '核心舞台', content: '（模拟）故事舞台的核心设定与氛围细节，数百字示例文本。' },
            { title: '规则细节', content: '（模拟）力量/时间规则的运作细节与边界条件。' },
            { title: '势力与禁忌', content: '（模拟）主要势力、社会生态、镇民禁忌。' },
          ],
          glossary: [
            { term: '示例名词·雾路', def: '（模拟）跨时间信件通行的路径。' },
            { term: '示例名词·锚点', def: '（模拟）规则得以稳定的关键物。' },
          ],
        },
      };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      return {
        summary: String(o.summary || '').slice(0, 3000),
        rules: (Array.isArray(o.rules) ? o.rules : []).slice(0, 30).map((r) => String(r).slice(0, 400)).filter(Boolean),
        sections: (Array.isArray(o.sections) ? o.sections : []).slice(0, 24).map((s) => ({
          title: String(s.title || '未命名分节').slice(0, 80),
          content: String(s.content || '').slice(0, 8000),
        })).filter((s) => s.content),
        glossary: (Array.isArray(o.glossary) ? o.glossary : []).slice(0, 60).map((g) => ({
          term: String(g.term || '词').slice(0, 60), def: String(g.def || '').slice(0, 400),
        })),
      };
    },
    apply(p, v, meta) {
      p.bible = Object.assign({}, p.bible, v);
      return `设定集已替换（${v.sections.length} 节 · ${v.rules.length} 条铁律）`;
    },
  },

  bible_expand: {
    label: '设定 · 增量补充', stage: 'bible', kind: KIND.json, tpl: 't_bible_expand',
    about: '在现有设定基础上追加新分节/铁律/名词（不覆盖）',
    order: ['ideaText', 'bibleText', 'extraNote'],
    mock(ctx) {
      return { shape: 'json', jsonExample: { summary: '', rules: [], sections: [{ title: '新增分节（模拟）', content: '（模拟）针对补充需求新增的设定文字。' }], glossary: [] } };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      return {
        summary: String(o.summary || ''),
        rules: (Array.isArray(o.rules) ? o.rules : []).map((r) => String(r).slice(0, 400)),
        sections: (Array.isArray(o.sections) ? o.sections : []).slice(0, 24).map((s) => ({
          title: String(s.title || '未命名分节').slice(0, 80), content: String(s.content || '').slice(0, 8000),
        })).filter((s) => s.content),
        glossary: (Array.isArray(o.glossary) ? o.glossary : []).map((g) => ({ term: String(g.term || '词').slice(0, 60), def: String(g.def || '').slice(0, 400) })),
      };
    },
    apply(p, v, meta) {
      const b = p.bible || {};
      if (v.summary && !b.summary) b.summary = v.summary;
      b.rules = [...(b.rules || []), ...v.rules.filter((r) => !(b.rules || []).includes(r))].slice(0, 60);
      const haveTitle = new Set((b.sections || []).map((s) => s.title));
      b.sections = [...(b.sections || []), ...v.sections.filter((s) => !haveTitle.has(s.title))];
      const haveTerm = new Set((b.glossary || []).map((g) => g.term));
      b.glossary = [...(b.glossary || []), ...v.glossary.filter((g) => !haveTerm.has(g.term))].slice(0, 120);
      p.bible = b;
      return `设定已追加（新增 ${v.sections.length} 节 / ${v.rules.length} 条铁律 / ${v.glossary.length} 个名词）`;
    },
  },

  // ---------------- 人物 ----------------
  characters_generate: {
    label: '人物 · 生成群像', stage: 'characters', kind: KIND.json, tpl: 't_characters_generate',
    about: '基于立项书与世界观生成完整人物群像（整体替换，可预览）',
    order: ['ideaText', 'bibleText', 'styleText', 'extraNote'],
    vars(ctx) {
      return { count: String(clampNum(ctx.args.count, 4, 18, 10)), maxCount: '16' };
    },
    mock(ctx) {
      const p = ctx.p;
      const n = clampNum(ctx.args.count, 4, 12, 5);
      const names = (p.characters || []).map((c) => c.name).concat(NAME_POOL);
      return {
        shape: 'json',
        jsonExample: Array.from({ length: n }, (_, k) => ({
          name: names[k % names.length] + (k > 2 ? `（${k + 1}号位示例）` : ''),
          aliases: [], role: k === 0 ? '主角' : k === 1 ? '关键配角' : k === 2 ? '反派' : '配角',
          oneLine: '（模拟）一句话定位文本。', pov: k === 0,
          appearance: '（模拟）外貌与标志性细节。', personality: '（模拟）性格与反差。',
          goals: '（模拟）驱动行为的目标。', backstory: '（模拟）背景与隐藏关联。',
          arc: '（模拟）初始→转折→结局。', speechStyle: '（模拟）说话习惯。',
          secrets: '（模拟）秘密或弱点。',
          relations: k > 0 ? [{ name: names[0] + (k === 2 ? '（2号位示例）' : ''), desc: '（模拟）关系描述' }] : [],
          notes: '（模拟）叙事功能说明。',
        })),
      };
    },
    normalize(payload) { return toCharList(payload); },
    apply(p, v, meta) {
      p.characters = v;
      return `人物群像已更新（${v.length} 人）`;
    },
  },

  character_add: {
    label: '人物 · 新增单卡', stage: 'characters', kind: KIND.json, tpl: 't_character_add',
    about: '新增一个角色（追加到群像末尾，可预览）',
    order: ['ideaText', 'bibleText', 'charsText', 'extraNote'],
    mock(ctx) {
      const names = (ctx.p.characters || []).map((c) => c.name).concat(NAME_POOL);
      return {
        shape: 'json',
        jsonExample: {
          name: names[(ctx.p.characters || []).length] || '新登场', aliases: [], role: '配角', oneLine: '（模拟）一句话定位。', pov: false,
          appearance: '（模拟）外貌。', personality: '（模拟）性格。', goals: '（模拟）目标。', backstory: '（模拟）背景。',
          arc: '（模拟）弧线。', speechStyle: '（模拟）说话风格。', secrets: '（模拟）秘密。',
          relations: [], notes: '（模拟）功能定位。',
        },
      };
    },
    normalize(payload) {
      const arr = toCharList(payload);
      return arr[0] || null;
    },
    apply(p, v, meta) {
      if (!v) return '未生成角色数据';
      p.characters = [...(p.characters || []), v];
      return `已新增角色「${v.name}」`;
    },
  },

  character_flesh: {
    label: '人物 · 精修单卡', stage: 'characters', kind: KIND.json, tpl: 't_character_flesh',
    about: '深化指定角色为完整高质量卡片（仅替换该角色）',
    needsChar: true,
    order: ['ideaText', 'bibleText', 'charsText', 'charNow', 'extraNote'],
    mock(ctx) {
      const c = ctx.char;
      return {
        shape: 'json',
        jsonExample: c ? normalizeChar({ ...c, oneLine: '（模拟）' + c.oneLine, notes: (c.notes || '') + '[模拟精修]' }) : {},
      };
    },
    normalize(payload) {
      const arr = toCharList(payload);
      return arr[0] || null;
    },
    apply(p, v, meta) {
      const idx = (p.characters || []).findIndex((c) => c.id === meta.charId);
      if (idx < 0 || !v) return '角色不存在或未生成';
      p.characters[idx] = Object.assign({}, p.characters[idx], v, { id: meta.charId });
      return `角色「${v.name}」已深化`;
    },
  },

  characters_align: {
    label: '人物 · 一致性校准', stage: 'characters', kind: KIND.json, tpl: 't_characters_align',
    about: '全组检查年龄/关系/时间线等自洽性并就地修正（整体替换，可预览）',
    order: ['ideaText', 'bibleText', 'charsText', 'extraNote'],
    mock(ctx) {
      const list = (ctx.p.characters || []).slice(0, 20).map((c) => normalizeChar({ ...c, notes: (c.notes || '') + '[校准]示例' }));
      if (!list.length) {
        const names = NAME_POOL.slice(0, 3).map((name) => normalizeChar({ name, role: '配角', oneLine: '（模拟）示例角色。' }));
        return { shape: 'json', jsonExample: names };
      }
      return { shape: 'json', jsonExample: list };
    },
    normalize(payload) {
      // 按名字保 id：与现有卡同名的沿用原 id（保持引用稳定）
      return { list: toCharList(payload) };
    },
    apply(p, v, meta) {
      const oldByName = new Map((p.characters || []).map((c) => [c.name, c]));
      const merged = v.list.map((c) => {
        const old = oldByName.get(c.name);
        if (old && !c.id) c.id = old.id;
        return c;
      });
      p.characters = merged;
      return `群像一致性校准完成（${merged.length} 人）`;
    },
  },

  // ---------------- 大纲 ----------------
  outline_generate: {
    label: '大纲 · 全书卷章', stage: 'outline', kind: KIND.json, tpl: 't_outline_generate',
    about: '生成全书分卷大纲（整体替换；若已写正文会要求确认）。已选定故事路线时大纲会严格遵循该路线',
    order: ['ideaText', 'routeText', 'bibleText', 'charsText', 'styleText', 'extraNote'],
    vars(ctx) {
      const totalWords = clampNum(ctx.p.idea.targetWords, 10000, 10000000, 100000);
      const cw = clampNum(ctx.args.chapterWords, 800, 20000, ctx.settings.defaults.chapterWords || 3200);
      const count = clampNum(Math.round(totalWords / cw), 8, 300, 30);
      return { totalWords: String(totalWords), chapterWords: String(cw), chapterCount: String(count) };
    },
    guard(p) {
      const written = (p.rows || []).filter((r) => r.ch && r.ch.content);
      return written.length ? `重新生成全书大纲将替换现有 ${p.rows.length} 行大纲，其中 ${written.length} 章已有正文（会被一并移除）。建议先导出备份，或在侧栏确认“保留正文”前的明确意图。` : null;
    },
    mock(ctx) {
      const names = (ctx.p.characters || []).map((c) => c.name);
      const a = (k) => names[k % Math.max(names.length, 1)] || NAME_POOL[0];
      return {
        shape: 'json',
        jsonExample: {
          volumes: [{ vol: 1, title: '第一卷（模拟）·雾起', arc: '（模拟）本卷弧线与终局文字。' }],
          chapters: [1, 2, 3, 4].map((k) => ({
            vol: 1, no: k, title: `第${k}章 模拟标题${k}`, goal: '（模拟）本章目标：推进/揭示/解决什么。',
            beats: ['（模拟）节拍一：场景与动作。', '（模拟）节拍二：信息交换与转折。', '（模拟）节拍三：章末钩子。'],
            cast: names.length ? [a(0), a(1)].filter((x, i, s) => s.indexOf(x) === i) : [NAME_POOL[0]],
            pov: names[0] || NAME_POOL[0], words: 3000, note: '（模拟）伏笔备注。',
          })),
        },
      };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      const volumes = (Array.isArray(o.volumes) ? o.volumes : []).slice(0, 40).map((v) => ({
        vol: clampNum(v.vol, 1, 999, 1), title: String(v.title || '').slice(0, 60), arc: String(v.arc || '').slice(0, 1200),
      }));
      const rows = normalizeRows(Array.isArray(o.chapters) ? o.chapters : []);
      if (!rows.length) { const e = new Error('模型未返回任何章节行，未做任何修改'); e.status = 422; throw e; }
      return { volumes, rows };
    },
    apply(p, v, meta) {
      p.volumes = v.volumes || [];
      p.rows = v.rows || [];
      return `全书大纲已生成：${p.volumes.length} 卷 / ${p.rows.length} 章`;
    },
  },

  outline_extend: {
    label: '大纲 · 追加章节', stage: 'outline', kind: KIND.json, tpl: 't_outline_extend',
    about: '在大纲末尾续写 N 章（自动规划新卷，保留全部已有内容）；续写同样遵循已选定故事路线',
    order: ['ideaText', 'routeText', 'bibleText', 'charsText', 'tailRowsText', 'extraNote'],
    vars(ctx) {
      return {
        count: String(clampNum(ctx.args.count, 1, 40, 5)),
        chapterWords: String(clampNum(ctx.args.chapterWords, 800, 20000, ctx.settings.defaults.chapterWords || 3200)),
      };
    },
    mock(ctx) {
      const last = (ctx.p.rows || []).slice(-1)[0] || {};
      const names = (ctx.p.characters || []).map((c) => c.name);
      return {
        shape: 'json',
        jsonExample: {
          volumes: [],
          chapters: Array.from({ length: clampNum(ctx.args.count, 1, 5, 2) }, (_, k) => ({
            vol: last.vol || 1, no: (last.no || 0) + k + 1, title: `续章·模拟${k + 1}`,
            goal: '（模拟）承接前文的本章目标。', beats: ['（模拟）节拍。'], cast: names.slice(0, 2),
            pov: names[0] || '', words: 3000, note: '',
          })),
        },
      };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      const rows = normalizeRows(Array.isArray(o.chapters) ? o.chapters : []);
      if (!rows.length) { const e = new Error('模型未返回任何新章节，未做任何修改'); e.status = 422; throw e; }
      return {
        volumes: (Array.isArray(o.volumes) ? o.volumes : []).slice(0, 10).map((v) => ({
          vol: clampNum(v.vol, 1, 999, 1), title: String(v.title || '').slice(0, 60), arc: String(v.arc || '').slice(0, 1200),
        })),
        rows,
      };
    },
    apply(p, v, meta) {
      if (v.volumes && v.volumes.length) {
        const vols = (p.volumes || []).concat(v.volumes);
        const seen = new Set();
        p.volumes = vols.filter((x) => { const k = x.vol; if (seen.has(k)) return false; seen.add(k); return true; });
      }
      p.rows = normalizeRows([...(p.rows || []), ...(v.rows || [])]);
      return `大纲已追加 ${v.rows.length} 章`;
    },
  },

  outline_refine: {
    label: '大纲 · 单章精修', stage: 'outline', kind: KIND.json, tpl: 't_outline_refine',
    about: '重做某一章的计划（仅影响该章大纲行）',
    needsRow: true,
    order: ['ideaText', 'charsText', 'outlineText', 'rowNow', 'extraNote'],
    vars(ctx) {
      return { chapterWords: String(clampNum(ctx.row.words || ctx.args.chapterWords, 800, 20000, 3200)) };
    },
    mock(ctx) {
      const r = ctx.row || {};
      return {
        shape: 'json',
        jsonExample: { vol: r.vol || 1, no: r.no || 1, title: (r.title || '标题') + '·精修', goal: r.goal || '（模拟）本章目标。', beats: ['（模拟）节拍一。', '（模拟）节拍二。'], cast: r.cast || [], pov: r.pov || '', words: r.words || 3000, note: (r.note || '') + '[精修]' },
      };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      return {
        title: String(o.title || '').slice(0, 60), goal: String(o.goal || '').slice(0, 1600),
        beats: (Array.isArray(o.beats) ? o.beats : []).slice(0, 12).map(String),
        cast: (Array.isArray(o.cast) ? o.cast : []).slice(0, 12).map(String),
        pov: String(o.pov || '').slice(0, 60),
        words: clampNum(o.words, 500, 20000, 3000),
        note: String(o.note || '').slice(0, 800),
      };
    },
    apply(p, v, meta) {
      const row = (p.rows || []).find((r) => r.id === meta.rowId);
      if (!row) return '章节不存在';
      Object.assign(row, v);
      return `章节计划已精修：第${row.no}章《${row.title}》`;
    },
  },

  // ---------------- 写作（输出散文） ----------------
  _proseCtx(ctx) {
    const row = ctx.row;
    return {
      chapterWords: String(clampNum(row.words || ctx.args.words || ctx.settings.defaults.chapterWords, 800, 20000, 3200)),
    };
  },

  chapter_write: {
    label: '章节 · 全新撰写', stage: 'writing', kind: KIND.prose, tpl: 't_chapter_write',
    needsRow: true,
    order: ['ideaText', 'bibleKeyText', 'styleText', 'castText', 'curRowText', 'prevText', 'contText', 'extraNote'],
    vars(ctx) { return this._proseCtx(ctx); },
    mock(ctx) {
      return { shape: 'text', length: clampNum(ctx.row.words || 3200, 500, 12000), names: (ctx.p.characters || []).map((c) => c.name), title: ctx.row.title || '' };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) { return applyChapterContent(p, meta.rowId, v, meta, 'AI生成'); },
  },
  chapter_continue: {
    label: '章节 · 续写', stage: 'writing', kind: KIND.prose, tpl: 't_chapter_continue',
    needsRow: true,
    order: ['bibleKeyText', 'styleText', 'castText', 'curRowText', 'existingTail', 'prevText', 'contText', 'extraNote'],
    vars(ctx) { return this._proseCtx(ctx); },
    mock(ctx) {
      return { shape: 'text', length: clampNum((ctx.args.words || ctx.settings.defaults.chapterWords || 3200), 500, 12000), names: (ctx.p.characters || []).map((c) => c.name) };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) {
      const row = (p.rows || []).find((r) => r.id === meta.rowId);
      if (!row) return '章节不存在';
      const merged = [(row.ch.content || ''), v].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
      return applyChapterContent(p, meta.rowId, merged, meta, 'AI续写');
    },
  },
  chapter_rewrite: {
    label: '章节 · 整体重写', stage: 'writing', kind: KIND.prose, tpl: 't_chapter_rewrite',
    needsRow: true,
    order: ['bibleKeyText', 'styleText', 'castText', 'curRowText', 'existingContent', 'prevText', 'contText', 'extraNote'],
    vars(ctx) { return this._proseCtx(ctx); },
    mock(ctx) {
      return { shape: 'text', length: clampNum(ctx.row.words || 3200, 500, 12000), names: (ctx.p.characters || []).map((c) => c.name), title: ctx.row.title || '' };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) { return applyChapterContent(p, meta.rowId, v, meta, 'AI整体重写'); },
  },
  chapter_polish: {
    label: '章节 · 通篇润色', stage: 'writing', kind: KIND.prose, tpl: 't_chapter_polish',
    needsRow: true,
    order: ['styleText', 'curRowText', 'existingContent', 'extraNote'],
    mock(ctx) {
      return { shape: 'text', length: Math.max(400, Math.min(12000, util.charCount((ctx.row.ch && ctx.row.ch.content) || '') + 200)), names: [] };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) { return applyChapterContent(p, meta.rowId, v, meta, 'AI润色'); },
  },
  excerpt_fix: {
    label: '片段 · 局部改写', stage: 'writing', kind: KIND.prose, tpl: 't_excerpt_fix',
    about: '改写选中片段（结果由前端就地替换，不入库）',
    needsRow: true, noApply: true,
    order: ['styleText', 'curRowText', 'selText', 'extraNote'],
    mock(ctx) {
      return { shape: 'text', length: Math.max(80, util.charCount(ctx.args.selText || '') + 60), names: [] };
    },
    normalize(text) { return String(text || '').trim(); },
  },

  // ---------------- 记忆 / 审校 ----------------
  chapter_summary: {
    label: '章节记忆 · 摘要+事实+伏笔', stage: 'audit', kind: KIND.json, tpl: 't_chapter_summary',
    needsRow: true,
    order: ['curRowText', 'contText', 'chapterContent', 'extraNote'],
    vars(ctx) {
      const rows = ctx.p.rows || [];
      const idx = (rows || []).findIndex((r) => r.id === ctx.args.rowId);
      const from = Math.max(0, idx - 1);
      return {};
    },
    mock(ctx) {
      const p = ctx.p;
      const lastThreads = ((p.continuity && p.continuity.entries) || []).slice(-1)[0];
      return {
        shape: 'json',
        jsonExample: {
          summary: `（模拟）第${ctx.row ? ctx.row.no : '?'}章《${ctx.row ? ctx.row.title : ''}》摘要：本章发生了哪些关键转折的概括文字。`,
          facts: [`（模拟事实）${ctx.row ? ctx.row.title : ''} 的主要事件与人物状态变化。`],
          threads: (lastThreads && lastThreads.threads ? lastThreads.threads : [{ name: '主线悬念', state: '推进中' }]).slice(0, 4).map((t) => ({ name: t.name, state: t.state || '推进中' })),
        },
      };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      return {
        summary: String(o.summary || '').slice(0, 1200),
        facts: (Array.isArray(o.facts) ? o.facts : []).slice(0, 30).map((f) => String(f).slice(0, 200)).filter(Boolean),
        threads: (Array.isArray(o.threads) ? o.threads : []).slice(0, 40).map((t) => ({
          name: String(t.name || '').slice(0, 40), state: String(t.state || t.status || '').slice(0, 300),
        })).filter((t) => t.name && t.state),
      };
    },
    apply(p, v, meta) {
      const row = (p.rows || []).find((r) => r.id === meta.rowId);
      if (!row) return '章节不存在';
      if (v.summary) { row.ch = row.ch || {}; row.ch.summary = v.summary; }
      const entries = (p.continuity && p.continuity.entries) || [];
      const entry = {
        at: `第${row.no}章《${row.title}》`, chapterNo: row.no, summary: v.summary || '',
        facts: v.facts || [], threads: v.threads || [],
      };
      entries.push(entry);
      p.continuity = { entries: entries.slice(-200) };
      return `记忆已写入：第${row.no}章（${v.facts.length} 条事实 · ${v.threads.length} 条线索状态）`;
    },
  },

  // ---------------- 记忆 / 审校 ----------------
  chapter_summary: {
    label: '章节记忆 · 摘要+事实+伏笔', stage: 'audit', kind: KIND.json, tpl: 't_chapter_summary',
    needsRow: true,
    order: ['curRowText', 'contText', 'chapterContent', 'extraNote'],
    vars(ctx) {
      const rows = ctx.p.rows || [];
      const idx = (rows || []).findIndex((r) => r.id === ctx.args.rowId);
      const from = Math.max(0, idx - 1);
      return {};
    },
    mock(ctx) {
      const p = ctx.p;
      const lastThreads = ((p.continuity && p.continuity.entries) || []).slice(-1)[0];
      return {
        shape: 'json',
        jsonExample: {
          summary: `（模拟）第${ctx.row ? ctx.row.no : '?'}章《${ctx.row ? ctx.row.title : ''}》摘要：本章发生了哪些关键转折的概括文字。`,
          facts: [`（模拟事实）${ctx.row ? ctx.row.title : ''} 的主要事件与人物状态变化。`],
          threads: (lastThreads && lastThreads.threads ? lastThreads.threads : [{ name: '主线悬念', state: '推进中' }]).slice(0, 4).map((t) => ({ name: t.name, state: t.state || '推进中' })),
        },
      };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      return {
        summary: String(o.summary || '').slice(0, 1200),
        facts: (Array.isArray(o.facts) ? o.facts : []).slice(0, 30).map((f) => String(f).slice(0, 200)).filter(Boolean),
        threads: (Array.isArray(o.threads) ? o.threads : []).slice(0, 40).map((t) => ({
          name: String(t.name || '').slice(0, 40), state: String(t.state || t.status || '').slice(0, 300),
        })).filter((t) => t.name && t.state),
      };
    },
    apply(p, v, meta) {
      const row = (p.rows || []).find((r) => r.id === meta.rowId);
      if (!row) return '章节不存在';
      if (v.summary) { row.ch = row.ch || {}; row.ch.summary = v.summary; }
      const entries = (p.continuity && p.continuity.entries) || [];
      const entry = {
        at: `第${row.no}章《${row.title}》`, chapterNo: row.no, summary: v.summary || '',
        facts: v.facts || [], threads: v.threads || [],
      };
      entries.push(entry);
      p.continuity = { entries: entries.slice(-200) };
      return `记忆已写入：第${row.no}章（${v.facts.length} 条事实 · ${v.threads.length} 条线索状态）`;
    },
  },

  audit_book: {
    label: '审校 · 全文一致性', stage: 'audit', kind: KIND.json, tpl: 't_audit_book',
    about: '对指定范围章节做编辑级审查，问题清单不入正文（可另存报告）',
    order: ['styleText', 'bibleText', 'charsText', 'contText', 'auditScope', 'extraNote'],
    mock(ctx) {
      const items = [];
      const rows = (ctx.p.rows || []).filter((r) => r.ch && r.ch.content).slice(0, 3);
      if (rows.length) {
        items.push({ no: rows[0].no, kind: '文风', sev: '低', quote: '（模拟）' + (rows[0].ch.content || '').slice(0, 30), issue: '（模拟）示例问题说明。', fix: '（模拟）示例修改建议。' });
      }
      return { shape: 'json', jsonExample: { items } };
    },
    normalize(payload) {
      const o = payload && typeof payload === 'object' ? payload : {};
      return {
        items: (Array.isArray(o.items) ? o.items : []).slice(0, 300).map((it) => ({
          no: clampNum(it.no, 0, 99999, 0),
          kind: String(it.kind || '其他').slice(0, 40),
          sev: String(it.sev || '中').slice(0, 10),
          quote: String(it.quote || '').slice(0, 300),
          issue: String(it.issue || '').slice(0, 800),
          fix: String(it.fix || '').slice(0, 1000),
        })),
      };
    },
    apply(p, v, meta) {
      p.audits = { at: util.nowISO(), range: meta.rangeLabel || '', items: v.items || [] };
      return `审查报告已生成：${(v.items || []).length} 条意见`;
    },
  },

  // ---------------- 能力工作台：内容仿写/续写/改写 ----------------
  content_analyze: {
    label: '内容 · 分析原文', stage: 'content', kind: KIND.json, tpl: 't_content_analyze',
    about: '分析上传/粘贴的源文本：题材、文风、基调、结构、人物与脉络，为仿写/续写/改写做准备。',
    order: ['capKind', 'capTitle', 'sourceText', 'sourceLang', 'paramsText', 'outputsText', 'extraNote'],
    vars(ctx) { return ctxMod.fmtWorkspaceVars(ctx.p); },
    mock(ctx) {
      const w = (ctx.p.workspace || {}).source && ctx.p.workspace.source[0];
      return {
        shape: 'json',
        jsonExample: {
          genre: '（模拟）题材判定。', style: '（模拟）文风关键词。', tone: '（模拟）基调。',
          structure: ['（模拟）结构一', '（模拟）结构二'], pov: '（模拟）人称/视角。',
          characters: ['（模拟）角色A', '（模拟）角色B'], themes: ['（模拟）主题一', '（模拟）主题二'],
          summary: '（模拟）' + String((w && w.text) || '').slice(0, 60),
        },
      };
    },
    normalize(payload) { return normalizeCapAnalyze(payload); },
    apply(p, v, meta) { return applyCapAnalyze(p, v, meta); },
  },
  content_imitate: {
    label: '内容 · 仿写', stage: 'content', kind: KIND.prose, tpl: 't_content_imitate',
    about: '按源文本的文风/结构/人物脉络，仿写出同风格的新内容（可给新主题/情节）。',
    order: ['capKind', 'capTitle', 'sourceText', 'sourceLang', 'paramsText', 'outputsText', 'extraNote'],
    vars(ctx) { return ctxMod.fmtWorkspaceVars(ctx.p); },
    mock(ctx) {
      return { shape: 'text', length: clampNum(ctx.args.words || 900, 200, 6000), names: (ctx.p.workspace && ctx.p.workspace.source && []) || [] };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) { return applyCapOutput(p, v, meta, '内容仿写'); },
  },
  content_continue: {
    label: '内容 · 续写', stage: 'content', kind: KIND.prose, tpl: 't_content_continue',
    about: '从源文本末尾无缝接续写下去（保留原文，结果追加）。',
    order: ['capKind', 'capTitle', 'sourceText', 'sourceLang', 'paramsText', 'outputsText', 'extraNote'],
    vars(ctx) { return ctxMod.fmtWorkspaceVars(ctx.p); },
    mock(ctx) {
      return { shape: 'text', length: clampNum(ctx.args.words || 900, 200, 6000), names: [] };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) { return applyCapOutputCont(p, v, meta, '内容续写'); },
  },
  content_rewrite: {
    label: '内容 · 改写', stage: 'content', kind: KIND.prose, tpl: 't_content_rewrite',
    about: '按指令改写源文本（换风格/换主角/压缩/扩写/改语言等）。',
    order: ['capKind', 'capTitle', 'sourceText', 'sourceLang', 'paramsText', 'outputsText', 'extraNote'],
    vars(ctx) { return ctxMod.fmtWorkspaceVars(ctx.p); },
    mock(ctx) {
      return { shape: 'text', length: clampNum(ctx.args.words || 900, 200, 6000), names: [] };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) { return applyCapOutput(p, v, meta, '内容改写'); },
  },

  // ---------------- 能力：联合国安理会决议仿写 ----------------
  doc_resolution: {
    label: '公文 · 安理会决议仿写', stage: 'doc', kind: KIND.prose, tpl: 't_doc_resolution',
    about: '仿照联合国安理会决议的体例（序言+编号条款+表决/主送），按议题生成一份决议草案。',
    order: ['capKind', 'capTitle', 'sourceText', 'sourceLang', 'paramsText', 'outputsText', 'extraNote'],
    vars(ctx) { return ctxMod.fmtWorkspaceVars(ctx.p); },
    mock(ctx) {
      return { shape: 'text', length: clampNum(ctx.args.words || 1200, 400, 4000), names: [] };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) {
      // 更新 params.topic 若由指令提供，并落库
      return applyCapOutput(p, v, meta, '安理会决议仿写');
    },
  },

  // ---------------- 能力：学术套磁邮件编辑 ----------------
  email_cold: {
    label: '邮件 · 学术套磁编辑', stage: 'email', kind: KIND.prose, tpl: 't_email_cold',
    about: '撰写/润色一封学术套磁邮件（申请博士/访学/合作），兼顾礼貌、信息量与得体表达。',
    order: ['capKind', 'capTitle', 'sourceText', 'sourceLang', 'paramsText', 'outputsText', 'extraNote'],
    vars(ctx) { return ctxMod.fmtWorkspaceVars(ctx.p); },
    mock(ctx) {
      return { shape: 'text', length: clampNum(ctx.args.words || 500, 200, 2000), names: [] };
    },
    normalize(text) { return String(text || '').trim(); },
    apply(p, v, meta) { return applyCapOutput(p, v, meta, '套磁邮件'); },
  },
};

// attach shared prose context helper
ACTIONS.chapter_write._proseCtx = ACTIONS._proseCtx;
ACTIONS.chapter_continue._proseCtx = ACTIONS._proseCtx;
ACTIONS.chapter_rewrite._proseCtx = ACTIONS._proseCtx;
ACTIONS.chapter_polish._proseCtx = ACTIONS._proseCtx;

function applyChapterContent(p, rowId, newContent, meta, histLabel) {
  const row = (p.rows || []).find((r) => r.id === rowId);
  if (!row) return '章节不存在';
  const old = (row.ch && row.ch.content) || '';
  const ch = row.ch || {};
  if (old && old !== newContent) {
    ch.history = [{ ts: util.nowISO(), label: histLabel || 'AI生成', model: meta.modelLabel || '', content: util.truncate(old, 4000, 200) }, ...(ch.history || [])].slice(0, 3);
  }
  ch.content = newContent;
  ch.status = old ? 'revised' : 'written';
  if (!old) ch.status = 'written';
  ch.words = util.charCount(newContent);
  ch.model = meta.modelLabel || ch.model || '';
  ch.updatedAt = util.nowISO();
  row.ch = ch;
  return `第${row.no}章《${row.title}》正文已${histLabel === 'AI续写' ? '续写' : histLabel === 'AI润色' ? '润色' : '更新'}（${ch.words} 字）`;
}

// ---------------- 能力工作台 helpers ----------------

function normalizeCapAnalyze(payload) {
  const o = payload && typeof payload === 'object' ? payload : {};
  return {
    genre: String(o.genre || '').slice(0, 80),
    style: String(o.style || '').slice(0, 400),
    tone: String(o.tone || '').slice(0, 200),
    structure: (Array.isArray(o.structure) ? o.structure : []).slice(0, 12).map((s) => String(s).slice(0, 200)),
    pov: String(o.pov || '').slice(0, 200),
    characters: (Array.isArray(o.characters) ? o.characters : []).slice(0, 40).map((s) => String(s).slice(0, 80)),
    themes: (Array.isArray(o.themes) ? o.themes : []).slice(0, 20).map((s) => String(s).slice(0, 160)),
    summary: String(o.summary || '').slice(0, 1200),
    language: String(o.language || '').slice(0, 60),
  };
}

function ensureWorkspace(p) {
  if (!p.workspace) p.workspace = { kind: p.cap || 'text', source: [{ id: 's_' + util.uid(''), title: '', text: '', lang: '', meta: {} }], params: {}, outputs: [] };
  if (!Array.isArray(p.workspace.outputs)) p.workspace.outputs = [];
  if (!Array.isArray(p.workspace.source) || !p.workspace.source.length) p.workspace.source = [{ id: 's_' + util.uid(''), title: '', text: '', lang: '', meta: {} }];
  return p.workspace;
}

function applyCapAnalyze(p, v, meta) {
  const ws = ensureWorkspace(p);
  if (!ws.source[0]) ws.source[0] = { id: 's_' + util.uid(''), title: '', text: '', lang: '', meta: {} };
  ws.source[0].meta = Object.assign({}, ws.source[0].meta || {}, { analysis: v });
  return `原文分析已更新（${v.genre ? v.genre + ' · ' : ''}${(v.characters || []).length} 角色 · ${(v.themes || []).length} 主题）`;
}

function capOutputEntry(p, v, meta, label) {
  const ws = ensureWorkspace(p);
  const entries = ws.outputs;
  const action = meta && meta.action ? (ws._lastAction || '') : '';
  const id = 'o_' + util.uid('');
  if (meta && meta.replaceId) {
    // 覆盖上一版输出（改写/重写时便于迭代）
    const i = entries.findIndex((x) => x.id === meta.replaceId);
    if (i >= 0) { entries[i].content = v; entries[i].updatedAt = util.nowISO(); return entries[i]; }
  }
  const e = { id, cap: p.cap || 'text', action: action || 'cap', label, kind: 'prose', content: v, meta: Object.assign({}, meta && meta.payload), createdAt: util.nowISO(), updatedAt: util.nowISO() };
  entries.push(e);
  // 只保留最近若干条，避免无限增长
  if (entries.length > 60) entries.splice(0, entries.length - 60);
  return e;
}

function applyCapOutput(p, v, meta, label) {
  const e = capOutputEntry(p, v, meta, label);
  return `${label} 已生成（第 ${(p.workspace && p.workspace.outputs || []).length} 条输出，${util.charCount(v)} 字）`;
}

function applyCapOutputCont(p, v, meta, label) {
  // 续写：把已写内容与原文衔接，替换源文本的上一版输出
  const ws = ensureWorkspace(p);
  const src = ws.source[0] || (ws.source[0] = { id: 's_' + util.uid(''), title: '', text: '', lang: '', meta: {} });
  const merged = [(src.text || ''), v].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  const e = { id: 'o_' + util.uid(''), cap: p.cap || 'text', action: 'content_continue', label, kind: 'prose', content: merged, meta: {}, createdAt: util.nowISO(), updatedAt: util.nowISO() };
  ws.outputs.push(e);
  src.text = merged;
  return `${label} 已续写（原文 + ${util.charCount(v)} 字，共 ${util.charCount(merged)} 字）`;
}

// ============================================================ 执行引擎

const DEF_ORDER = ['extraNote', 'ideaText', 'styleText', 'bibleText', 'charsText', 'contText', 'curRowText', 'castText', 'bibleKeyText', 'prevText', 'existingContent', 'existingTail', 'charNow', 'rowNow', 'tailRowsText', 'outlineText', 'auditScope', 'chapterContent', 'selText'];

function listActions() {
  return Object.keys(ACTIONS).filter((k) => !k.startsWith('_')).map((k) => ({
    key: k, label: ACTIONS[k].label, stage: ACTIONS[k].stage, kind: ACTIONS[k].kind,
    needsRow: !!ACTIONS[k].needsRow, needsChar: !!ACTIONS[k].needsChar,
    about: ACTIONS[k].about || '', noApply: !!ACTIONS[k].noApply,
  }));
}

function pickProvider(project, o) {
  const pid = o.providerId || (project && project.settings && project.settings.providerId) || settingsMod.get().defaults.providerId;
  const provider = settingsMod.getProvider(pid);
  if (!provider) { const e = new Error(`找不到模型厂商「${pid}」：请在 设置→模型厂商 中检查`); e.status = 400; throw e; }
  if (provider.enabled === false) { const e = new Error(`厂商「${provider.name}」已停用，请先在设置中启用`); e.status = 400; throw e; }
  let model = o.model || (project && project.settings && project.settings.model) || settingsMod.get().defaults.model || provider.defaultModel || '';
  if (!model && provider.models && provider.models.length && provider.models[0].id) model = provider.models[0].id;
  if (!model) { const e = new Error(`厂商「${provider.name}」未配置模型 ID`); e.status = 400; throw e; }
  const mInfo = (provider.models || []).find((m) => m.id === model);
  const tempRaw = (typeof o.temperature === 'number' && Number.isFinite(o.temperature))
    ? o.temperature : Number(settingsMod.get().defaults.temperature ?? 0.9);
  return {
    provider, model,
    temperature: Math.min(2, Math.max(0, tempRaw)),
    maxTokens: Number.isFinite(Number(o.maxTokens)) && o.maxTokens > 0 ? Math.min(100000, Math.round(o.maxTokens)) : 0,
    context: (mInfo && mInfo.context) || 131072,
    output: (mInfo && mInfo.output) || 8192,
  };
}

function buildExecContext(project, def, args, sel) {
  // 定位行/角色
  const rows = project.rows || [];
  let rowIdx = -1;
  let row = null;
  if (args.rowId) {
    rowIdx = rows.findIndex((r) => r.id === args.rowId);
    if (rowIdx >= 0) row = rows[rowIdx];
    else if (def.needsRow) { const e = new Error('找不到目标章节（可能已删除）'); e.status = 404; throw e; }
  } else if (def.needsRow) {
    const e = new Error('该操作需要指定目标章节'); e.status = 400; throw e;
  }
  let char = null;
  if (def.needsChar) {
    char = (project.characters || []).find((c) => c.id === args.charId);
    if (!char) { const e = new Error('找不到目标角色'); e.status = 404; throw e; }
  }
  return { p: project, row, rowIdx, char, args, settings: settingsMod.get(), action: def.key };
}

function finalizeResult(def, text, exec, modelLabel, usage) {
  let payload;
  if (def.kind === KIND.json) {
    const parsed = util.jsonExtract(text);
    if (parsed == null) {
      const e = new Error('模型未返回合法 JSON，已展示原文；可点击“重试”。');
      e.raw = text;
      throw e;
    }
    payload = def.normalize ? def.normalize(parsed, exec) : parsed;
  } else {
    payload = def.normalize ? def.normalize(text, exec) : String(text || '').trim();
  }
  if (!payload || (Array.isArray(payload) && !payload.length && def.kind === KIND.json)) {
    const e = new Error('模型返回内容为空，请重试');
    e.raw = text;
    throw e;
  }
  return {
    id: util.uid('res_'), ts: Date.now(), action: exec.action, label: def.label, kind: def.kind,
    payload, usage: usage || null, applied: false, model: modelLabel,
    rowId: (exec.args && exec.args.rowId) || null, charId: (exec.args && exec.args.charId) || null,
    preview: def.kind === KIND.json ? JSON.stringify(payload, null, 1) : (payload.length > 600 ? payload.slice(0, 600) + '\n…' : payload),
  };
}

/**
 * 执行一次生成。opts: {projectId, action, args, providerId, model, temperature, maxTokens, stream, signal}
 * 返回非流式结果 {result}；流式时通过 opts.emitter {onMeta,onChunk,onDone,onError} 回调。
 */
async function generate(opts) {
  const { projectId, action } = opts;
  const def = ACTIONS[action];
  if (!def) { const e = new Error('未知动作: ' + action); e.status = 400; throw e; }
  const project = projectId ? store.loadProject(projectId) : null;
  if (projectId && !project) { const e = new Error('项目不存在'); e.status = 404; throw e; }
  const args = opts.args || {};
  const exec = buildExecContext(project, def, args);
  exec.action = action; // 规范动作键（entry.action 等依赖它）

  // 危险动作确认（覆盖已写正文等）
  if (def.guard && !args.force) {
    const warn = def.guard(project);
    if (warn) { const e = new Error('需要确认：' + warn); e.status = 409; e.needConfirm = true; throw e; }
  }

  const pick = pickProvider(project, { providerId: opts.providerId, model: opts.model, temperature: opts.temperature, maxTokens: opts.maxTokens });
  const tpl = settingsMod.getTemplate(def.tpl);
  if (!tpl) { const e = new Error(`模板 ${def.tpl} 缺失`); e.status = 500; throw e; }

  // ---- 组装变量 ----
  const picked = pickVarsFor(project, def, args, exec);
  const extraVars = {};
  const counts = def.vars ? def.vars(exec) || {} : {};
  Object.assign(extraVars, counts, { extraNote: args.instruction || '（无）' });
  const varsRaw = Object.assign({}, picked, extraVars);
  const order = def.order || DEF_ORDER;
  const budgetChars = clampNum(Math.floor((pick.context - Math.max(pick.maxTokens || 0, pick.output || 0, 2000) - 2500) * 0.72), 1600, 48000);
  const trimmed = ctxMod.trimVars(varsRaw, order.filter((k) => !(k in extraVars)).concat(order.filter((k) => k in extraVars)), budgetChars, CAPS);
  Object.assign(trimmed, extraVars);
  // 多语言：把项目创建/能力语言映射为写作语言指令（空则保持模板默认中文）
  const lang = (project && (project.language || (project.workspace && project.workspace.source && project.workspace.source[0] && project.workspace.source[0].lang))) || '';
  trimmed.langText = ctxMod.langInstruction ? ctxMod.langInstruction(lang) : '';
  const rendered = ctxMod.renderTemplate(tpl, trimmed);
  const messages = [
    { role: 'system', content: rendered.system },
    { role: 'user', content: rendered.user },
  ];
  const modelLabel = `${pick.provider.name} / ${pick.model}`;
  const mockSpec = pick.provider.kind === 'mock' && def.mock ? def.mock(exec) : null;

  const logText = `${def.label}（${project ? '《' + project.name + '》' : '对话'}）→ ${modelLabel}`;
  const emitter = opts.emitter || null;
  if (emitter) emitter.onMeta({ action: def.label, model: modelLabel, actionKey: action });

  const runChat = (stream) => llm.chat(pick.provider, pick.model, messages, {
    temperature: pick.temperature,
    maxTokens: pick.maxTokens || Math.min(pick.output || 8192, def.kind === KIND.prose ? 9000 : 4000),
    stream,
    signal: opts.signal,
    mock: mockSpec || {},
  });

  const finish = (resultText, usage) => {
    let entry;
    try {
      entry = finalizeResult(def, resultText, exec, modelLabel, usage);
    } catch (e) {
      if (e.raw) { if (emitter) emitter.onError(e.message); }
      throw e;
    }
    if (projectId) cacheResult(projectId, entry);
    return entry;
  };

  if (!opts.stream) {
    const r = await runChat(false);
    const entry = finish(r.text, r.usage);
    require('./events').log('gen', logText + ' ✔ ' + (entry.kind === 'json' ? '(结构化结果)' : util.charCount(entry.payload) + ' 字'), projectId);
    return { result: entry };
  }

  // 流式：消费者为 HTTP SSE（见 api.js /api/gen）
  const finalText = { s: '', usage: null };
  const iter = await runChat(true);
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        for await (const ev of iter) {
          if (ev.kind === 'text') {
            finalText.s += ev.text;
            if (emitter) emitter.onChunk(ev.text);
          } else if (ev.kind === 'usage') {
            finalText.usage = ev.usage;
          } else if (ev.kind === 'done') {
            const entry = finish(finalText.s || ev.text, finalText.usage);
            require('./events').log('gen', logText + ' ✔ ' + (entry.kind === 'json' ? '(结构化结果)' : util.charCount(entry.payload) + ' 字'), projectId);
            if (emitter) emitter.onDone(entry);
            resolve({ result: entry });
          }
        }
      } catch (e) {
        if (e && e.cancelled) { if (emitter) emitter.onError('已取消'); }
        else if (emitter) emitter.onError(e.message);
        reject(e);
      }
    })();
  });
}

function pickVarsFor(project, def, args, exec) {
  const ctx = { p: project, row: exec.row, args, settings: exec.settings };
  const chars = (project.characters || []);
  const rows = (project.rows || []);
  switch (def.key) {
    case 'idea_brainstorm':
    case 'idea_flesh':
      return { genreHint: '', ideaNow: '' };
    case 'route_plan':
      return ctxMod.buildVars(project, { idea: true, bible: false, style: false, chars: false, cont: false });
    case 'bible_generate':
      return ctxMod.buildVars(project, { idea: true, style: true, chars: true });
    case 'bible_expand':
      return ctxMod.buildVars(project, { idea: true, bible: true });
    case 'characters_generate':
      return ctxMod.buildVars(project, { idea: true, bible: true, style: true });
    case 'character_add':
      return ctxMod.buildVars(project, { idea: true, bible: true, chars: true });
    case 'character_flesh':
      return Object.assign(ctxMod.buildVars(project, { idea: true, bible: true, chars: true }),
        { charNow: ctxMod.fmtChars([exec.char], 2600) });
    case 'characters_align':
      return ctxMod.buildVars(project, { idea: true, bible: true, chars: true });
    case 'outline_generate':
      return ctxMod.buildVars(project, { idea: true, route: true, bible: true, chars: true, style: true });
    case 'outline_extend':
      return ctxMod.buildVars(project, { idea: true, route: true, bible: true, chars: true });
    case 'outline_refine':
      return Object.assign(ctxMod.buildVars(project, { idea: true, chars: true, rowsAll: true }),
        { rowNow: exec.row ? ctxMod.fmtRow(exec.row) : '' });
    case 'chapter_write':
      return chapterVars(project, exec, true);
    case 'chapter_continue':
    case 'chapter_rewrite':
    case 'chapter_polish':
      return chapterVars(project, exec, false);
    case 'excerpt_fix':
      return Object.assign(chapterVars(project, exec, false),
        { selText: String(args.selText || '').slice(0, 4000) });
    case 'chapter_summary':
      return Object.assign(ctxMod.buildVars(project, { cont: true }),
        { curRowText: exec.row ? ctxMod.fmtRow(exec.row) : '', chapterContent: (exec.row && exec.row.ch && exec.row.ch.content) || '' });
    case 'audit_book':
      return auditVars(project, args, ctx);
    case 'content_analyze':
    case 'content_imitate':
    case 'content_continue':
    case 'content_rewrite':
    case 'doc_resolution':
    case 'email_cold':
      return ctxMod.fmtWorkspaceVars(project);
    default:
      return {};
  }
}

function chapterVars(project, exec, fullIdea) {
  const picks = {
    idea: !!fullIdea, style: true, bible: false,
    cont: true, contOpen: false,
    prev: exec.rowIdx > 0,
    curRow: true, cast: true, bibleKey: true,
    existing: true,
  };  const v = ctxMod.buildVars(project, picks);
  v.contText = ctxMod.fmtContinuity(project, 3) + (ctxMod.openThreads(project).length ? '\n\n未回收线索提示：' + ctxMod.openThreads(project).map((t, i) => `${i + 1}.${t.name}（${t.state}）`).join(' ') : '');
  if (fullIdea) v.ideaText = ctxMod.fmtIdea(project);
  return v;
}

function auditVars(project, args, ctx) {
  const rows = (project.rows || []);
  const written = rows.map((r, i) => ({ r, i })).filter((x) => x.r.ch && x.r.ch.content);
  let sel;
  if (Array.isArray(args.range) && args.range.length === 2) sel = written.filter((x) => x.r.no >= args.range[0] && x.r.no <= args.range[1]);
  else sel = written;
  const parts = [];
  for (const { r } of sel) {
    parts.push(`\n========== 第${r.no}章《${r.title}》 ==========\n${util.truncate(r.ch.content || '', 8000, 200)}`);
  }
  const scope = parts.join('\n');
  const v = ctxMod.buildVars(project, { style: true, bible: true, chars: true, cont: true });
  v.auditScope = scope || '（尚无已写正文）';
  v.contText = ctxMod.fmtContinuity(project, 5);
  return v;
}

/** 应用一次生成结果（apply 语义在动作中）。 */
function applyResult(projectId, resultId, extra) {
  const project = store.loadProject(projectId);
  if (!project) { const e = new Error('项目不存在'); e.status = 404; throw e; }
  const entry = takeResult(projectId, resultId);
  if (!entry) { const e = new Error('生成结果已过期（超过 30 分钟或已被新结果替换），请重新生成'); e.status = 410; throw e; }
  if (entry.applied) { const e = new Error('该结果已应用过，请勿重复应用'); e.status = 409; throw e; }
  const def = ACTIONS[entry.action];
  if (!def) { const e = new Error('动作不存在'); e.status = 400; throw e; }
  if (!def.apply) { const e = new Error('该动作由前端就地应用（不入库）'); e.status = 400; throw e; }
  let summary;
  store.transact(project, entry.label, () => {
    summary = def.apply(project, util.clone(entry.payload), {
      rowId: (extra && extra.rowId) || entry.rowId,
      charId: (extra && extra.charId) || entry.charId,
      modelLabel: entry.model,
      rangeLabel: (extra && extra.rangeLabel) || '',
    });
    if (def.key === 'outline_generate' || def.key === 'outline_extend') {
      project.rows = normalizeRows(project.rows || []);
    }
  });
  entry.applied = true;
  return { applied: summary, project };
}

// ---------------- 能力注册（内置能力 = ACTIONS 的子集） ----------------
const capsMod = require('./capabilities');
function registerBuiltInCaps() {
  const keys = Object.keys(ACTIONS).filter((k) => !k.startsWith('_'));
  const stageOf = (k) => ACTIONS[k].stage || 'studio';
  const byCap = {};
  for (const k of keys) {
    const s = stageOf(k);
    const cap = (byCap[s] = byCap[s] || { id: s, name: s, actions: [] });
    cap.actions.push({ key: k, label: ACTIONS[k].label, about: ACTIONS[k].about || '', kind: ACTIONS[k].kind });
  }
  const meta = {
    novel: { id: 'novel', name: '小说创作', label: '小说创作', kind: 'studio', builtin: true },
    content: { id: 'content', name: '文本内容', label: '内容仿写/续写/改写', kind: 'text', builtin: true },
    doc: { id: 'doc', name: '公文体例', label: '公文·安理会决议仿写', kind: 'doc', builtin: true },
    email: { id: 'email', name: '学术沟通', label: '学术套磁邮件', kind: 'email', builtin: true },
  };
  for (const [stageId, capActions] of Object.entries(byCap)) {
    const m = meta[stageId] || { id: stageId, name: stageId, label: stageId, kind: stageId, builtin: true };
    capsMod.registerCapability({ ...m, actions: capActions.actions });
  }
}
registerBuiltInCaps();

module.exports = {
  ACTIONS, listActions, generate, applyResult, normalizeRows, normalizeChar, cacheResult,
};
