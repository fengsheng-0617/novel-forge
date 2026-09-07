// settings.js — ⚙ 设置：模型厂商 / 默认引擎 / 提示词模板 / 流水线参数（整体自动保存）
'use strict';
import { h, clear, toast, debounce, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

const KIND_LABEL = { openai: 'OpenAI 兼容', gemini: 'Gemini', mock: '本地模拟' };

let S = null;          // 本地工作副本
let saver = null;

export function mount(root, _project, ctx) {
  clear(root);
  root.classList.add('page');
  if (!S) { api.settings().then((r) => { S = r.settings; render(); }).catch((e) => toast('加载设置失败：' + e.message, 'err', 6000)); return; }
  render();

  function render() {
    clear(root);
    saver = debounce(saveAll, 700);
    root.append(
      h('div', { class: 'page-title' },
        h('h1', {}, '⚙ ' + t('settings.title')),
        h('span', { class: 'sub' }, t('settings.sub'))),
      h('button', { class: 'btn ghost', onclick: () => { location.hash = '#/'; } }, '← ' + t('settings.back')),
      providersCard(),
      defaultsCard(),
      templatesCard(),
      pipelineCard());
  }

  async function saveAll() {
    try {
      const r = await api.saveSettings(S);
      // 关键：不整体替换 S —— 页面所有输入框/按钮仍绑定着旧对象；
      // 若直接 S = r.settings，会丢失对象身份 → 之后输入内容写到“孤儿对象”上，
      // 界面上填了 Key，测试/保存拿到的却是空 Key。
      // 这里只把服务端清洗后的 Key 同步回本地对应条目。
      const srv = (r.settings && r.settings.providers) || [];
      for (const sp of srv) {
        const local = (S.providers || []).find((x) => x.id === sp.id);
        if (local && sp.apiKey !== undefined) local.apiKey = sp.apiKey || '';
      }
      window.dispatchEvent(new CustomEvent('nf-settings-saved', { detail: S }));
      toast('设置已保存', 'ok', 1200);
    } catch (e) { toast('保存失败：' + e.message, 'err', 6000); }
  }

  // ---------- 厂商 ----------
  function providersCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('settings.providers'), h('span', { class: 'hint' }, t('settings.providersHint', { n: S.providers.length }))));
    for (const prov of S.providers) {
      box.append(providerRow(prov, () => render()));
    }
    box.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => {
        S.providers.push({
          id: 'custom_' + Math.random().toString(36).slice(2, 8), name: t('settings.customName'), kind: 'openai',
          baseURL: 'https://api.example.com/v1', apiKey: '', defaultModel: '', models: [],
          enabled: true, builtin: false, note: t('settings.customNote'),
        });
        saver.flush(); render();
      } }, t('settings.addCustom'))));
    return box;
  }

  function providerRow(prov, rerender) {
    const row = h('div', { class: 'fieldset' });
    const head = h('div', { class: 'fs-t' },
      h('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:600' },
        h('input', { type: 'checkbox', checked: prov.enabled !== false, title: '启用', onchange: (e) => { prov.enabled = e.target.checked; saver(); } }),
        prov.name,
        h('span', { class: 'small faint', style: 'font-weight:400' }, KIND_LABEL[prov.kind] || prov.kind, prov.builtin ? '' : ' · 自定义')));
    head.append(h('button', { class: 'btn sm danger', style: 'margin-left:auto', disabled: prov.builtin, title: prov.builtin ? '内置厂商不可删除（可停用）' : '删除',
      onclick: async () => {
        const yes = await confirmDialog('删除厂商', `删除「${prov.name}」配置？`, { okText: '删除', danger: true });
        if (!yes) return;
        S.providers = S.providers.filter((x) => x !== prov);
        saver.flush(); rerender();
      } }, '✕'));
    row.append(head);
    if (prov.kind === 'mock') {
      row.append(h('div', { class: 'small faint' }, prov.note || '离线模拟引擎：无需 Key/联网。'));
      return row;
    }
    row.append(h('div', { class: 'row-line' },
      h('label', { class: 'field', style: 'flex:1.6;margin:0' }, h('span', {}, '显示名'), h('input', { type: 'text', value: prov.name, oninput: (e) => { prov.name = e.target.value; saver(); } })),
      h('label', { class: 'field', style: 'flex:2.4;margin:0' }, h('span', {}, 'BaseURL（OpenAI 兼容端点）'),
        h('input', { type: 'text', value: prov.baseURL || '', placeholder: prov.kind === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : 'https://api.xxx.com/v1', spellcheck: 'false', oninput: (e) => { prov.baseURL = e.target.value; saver(); } })),
      h('label', { class: 'field', style: 'flex:2.4;margin:0' }, h('span', {}, 'API Key'),
        h('input', { type: 'password', value: prov.apiKey || '', placeholder: 'sk-…', spellcheck: 'false', oninput: (e) => { prov.apiKey = e.target.value; saver(); } }))));
    row.append(h('div', { class: 'row-line' },
      h('label', { class: 'field', style: 'flex:1;margin:0' }, h('span', {}, '默认模型'), h('input', { type: 'text', value: prov.defaultModel || '', list: 'model-list-' + prov.id, placeholder: '不填则用第一个模型', oninput: (e) => { prov.defaultModel = e.target.value; saver(); } })),
      h('div', { class: 'btn-row', style: 'align-items:flex-end;padding-bottom:6px' },
        h('button', { class: 'btn sm', id: 'test-' + prov.id, onclick: async (e) => { await testProv(prov, e.currentTarget); } }, '⛁ 测试连接'),
        h('button', { class: 'btn sm', onclick: async () => { await fetchModels(prov, rerender); } }, '⇣ 获取模型列表'))));
    // 模型表
    prov.models = Array.isArray(prov.models) ? prov.models : [];
    const mBox = h('div', {});
    prov.models.forEach((m, i) => {
      const mrow = h('div', { class: 'row-line' },
        h('input', { type: 'text', value: m.id || '', placeholder: '模型 ID', spellcheck: 'false', style: 'flex:1.6', oninput: (e) => { m.id = e.target.value; saver(); } }),
        h('input', { type: 'text', value: m.name || '', placeholder: '显示名', style: 'flex:1.6', oninput: (e) => { m.name = e.target.value; saver(); } }),
        h('input', { type: 'number', value: m.context || 32000, title: '上下文 token 上限（影响自动裁剪）', style: 'width:130px', oninput: (e) => { m.context = Math.max(1024, Number(e.target.value) || 32000); saver(); } }),
        h('button', { class: 'btn sm danger grow0', onclick: () => { prov.models.splice(i, 1); saver(); rerender(); } }, '✕'));
      mBox.append(mrow);
    });
    mBox.append(h('button', { class: 'btn sm', onclick: () => { prov.models.push({ id: '', name: '', context: 32000 }); rerender(); } }, '＋ 模型行'));
    row.append(mBox);
    if (prov.note) row.append(h('div', { class: 'small faint', style: 'margin-top:4px' }, '提示：' + prov.note));
    return row;
  }

  async function testProv(prov, btn) {
    const old = btn.textContent;
    btn.textContent = '测试中…'; btn.disabled = true;
    const modelId = prov.defaultModel || ((prov.models || []).map((m) => m.id).find(Boolean) || '');
    if (!modelId && prov.kind !== 'mock') {
      toast(`请先在「${prov.name}」里填写 默认模型 或添加一个非空的 模型 ID，再点测试`, 'warn', 7000);
      btn.textContent = old; btn.disabled = false;
      return;
    }
    try {
      // 直接把当前界面正在编辑的配置提交测试（并同步落盘），避免“改了还没保存就去测”
      const payload = { provider: prov, model: modelId };
      const r = await api.post('/api/providers/test', payload);
      const d = r.detail || {};
      toast(d.ok ? `✓ ${prov.name} 连接成功（${d.ms}ms）${d.reply ? '：' + d.reply : ''}` : `✗ ${prov.name}：${d.error || '测试失败'}`, d.ok ? 'ok' : 'err', 7000);
    } catch (e) {
      // 服务端 400 会带真实原因：e.json.error
      const msg = (e.json && (e.json.error || (e.json.detail && e.json.detail.error))) || e.message;
      toast(`✗ ${prov.name} 测试失败：${msg}`, 'err', 10000);
    } finally {
      btn.textContent = old; btn.disabled = false;
    }
  }

  async function fetchModels(prov, rerender) {
    if (!prov.apiKey && prov.kind !== 'ollama') {
      toast('请先填写 API Key 再拉取模型列表', 'warn');
      return;
    }
    try {
      const r = await api.get('/api/providers/' + prov.id + '/models');
      prov.models = r.models.map((m) => ({ id: m.id, name: m.label || m.id, context: (prov.models.find((x) => x.id === m.id) || {}).context || 32000 }));
      saver.flush();
      rerender();
      toast(`已拉取 ${prov.models.length} 个模型`, 'ok');
    } catch (e) { toast('拉取失败：' + e.message, 'err', 6000); }
  }

  // ---------- 默认引擎 ----------
  function defaultsCard() {
    const d = S.defaults = S.defaults || {};
    const box = h('div', { class: 'card' });
    const enabled = S.providers.filter((p) => p.enabled !== false && p.models && p.models.length);
    box.append(h('h3', {}, t('settings.defaults'), h('span', { class: 'hint' }, t('settings.defaultsHint'))));
    const provSel = h('select', { style: 'width:auto', onchange: (e) => { d.providerId = e.target.value; saver(); } },
      ...enabled.map((p) => h('option', { value: p.id, selected: d.providerId === p.id || undefined }, p.name)));
    const modelSel = h('select', { style: 'flex:1;min-width:180px', onchange: (e) => { d.model = e.target.value; saver(); } });
    const fillModels = () => {
      clear(modelSel);
      const prov = enabled.find((p) => p.id === d.providerId) || enabled[0];
      const defM = prov && prov.defaultModel;
      modelSel.append(h('option', { value: '' }, defM ? `跟随厂商默认（${defM}）` : '（厂商默认）'));
      for (const m of (prov && prov.models || [])) {
        if (!m || !m.id) continue;
        modelSel.append(h('option', { value: m.id, selected: d.model === m.id || (!d.model && defM === m.id) || undefined }, m.name || m.id));
      }
    };
    fillModels();
    provSel.onchange = () => { d.providerId = provSel.value; d.model = ''; fillModels(); saver(); };
    const num = (key, label, min, max, step, w) => h('label', { class: 'field', style: 'flex:1;margin:0' },
      h('span', {}, label),
      h('input', { type: 'number', value: d[key] ?? '', min, max, step, style: w ? 'width:' + w : 'width:100%',
        oninput: (e) => { d[key] = Number(e.target.value); saver(); } }));
    box.append(h('div', { class: 'row-line' }, provSel, modelSel),
      h('div', { class: 'row-line' },
        num('temperature', '温度 temperature', 0, 2, 0.1, '90px'),
        num('maxTokens', '单次最大输出 tokens', 256, 100000, 256, '130px'),
        num('chapterWords', '单章目标字数（默认）', 500, 30000, 100, '130px'),
        num('retries', '失败重试次数', 0, 5, 1, '90px')));
    return box;
  }

  // ---------- 提示词模板 ----------
  function templatesCard() {
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('settings.templates'), h('span', { class: 'hint' }, t('settings.templatesHint', { n: S.templates.length }))));
    box.append(h('div', { class: 'btn-row', style: 'margin-bottom:6px' },
      h('button', { class: 'btn sm ghost', onclick: async () => {
        const yes = await confirmDialog(t('settings.tplResetTitle'), t('settings.tplResetMsg'), { okText: t('settings.tplResetOk'), danger: true });
        if (!yes) return;
        try {
          const r = await api.resetTemplates();
          S.templates = r.templates;
          render();
          toast(t('settings.tplResetDone'), 'ok');
        } catch (e) { toast(t('settings.tplResetFail', { msg: e.message }), 'err', 5000); }
      } }, t('settings.tplReset'))));
    const STAGE_ORDER = ['idea', 'bible', 'characters', 'outline', 'writing', 'audit'];
    const groups = new Map();
    for (const t of S.templates) {
      const key = STAGE_ORDER.includes(t.stage) ? t.stage : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    for (const [stage, list] of [...groups.entries()]) {
      const stageName = { idea: '点子', bible: '设定', characters: '人物', outline: '大纲', writing: '写作', audit: '审校' }[stage] || '其他';
      const dbox = h('details', { class: 'fold' }, h('summary', {}, `${stageName} 阶段 · ${list.length} 套`));
      const body = h('div', { class: 'fold-body' });
      for (const t of list) {
        const tbox = h('details', { class: 'fold', style: 'margin:4px 0' },
          h('summary', {}, `${t.label || t.key}${t.output === 'json' ? '（结构化输出）' : t.output === 'prose' ? '（正文输出）' : ''}`),
          h('div', { class: 'fold-body' },
            t.about ? h('div', { class: 'small faint', style: 'margin-bottom:6px' }, t.about) : null,
            h('div', { class: 'small faint', style: 'margin-bottom:4px' }, '可用变量：' + (t.vars || []).map((v) => `{{${v}}}`).join(' ')),
            h('label', { class: 'field' }, h('span', {}, 'System'),
              h('textarea', { rows: 6, class: 'mono', oninput: (e) => { t.system = e.target.value; saver(); } }, t.system || '')),
            h('label', { class: 'field' }, h('span', {}, 'User'),
              h('textarea', { rows: 8, class: 'mono', oninput: (e) => { t.user = e.target.value; saver(); } }, t.user || '')),
            h('div', { class: 'small faint' }, '输出规范（纯净 JSON / 纯正文）由系统自动追加，此处无需重复书写。')));
        body.append(tbox);
      }
      dbox.append(body);
      box.append(dbox);
    }
    return box;
  }

  // ---------- 流水线 ----------
  function pipelineCard() {
    const pl = S.pipeline = S.pipeline || {};
    const box = h('div', { class: 'card' });
    box.append(h('h3', {}, t('settings.pipeline')));
    const sw = (key, label, hint) => h('label', { class: 'field', style: 'display:flex;gap:10px;align-items:center' },
      h('input', { type: 'checkbox', checked: !!pl[key], onchange: (e) => { pl[key] = e.target.checked; saver(); } }),
      h('span', {}, h('b', {}, label), h('div', { class: 'small faint' }, hint)));
    box.append(sw('autoSummary', t('settings.pAutoSummary'), t('settings.pAutoSummaryHint')),
      sw('autoContinuity', t('settings.pAutoContinuity'), t('settings.pAutoContinuityHint')),
      sw('continueOnError', t('settings.pContinueOnError'), t('settings.pContinueOnErrorHint')));
    return box;
  }
}

// 供外部（如 app.js 引擎下拉刷新）取到最新设置
export function settingsSnapshot() { return S; }
