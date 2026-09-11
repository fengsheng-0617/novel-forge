// gh-mirror.mjs —— 用 GitHub API（api.github.com）把本机仓库推上 GitHub
// 场景：本机 github.com:443 不通，但 api.github.com 可达 → 绕开 git push。
// 模式：
//   upload <repo> <dir>     用 Git Data API 一次性提交（单 commit，保留文件树；自动处理空仓/已有分支）
//   (旧 import 模式已弃用，忽略)
// 用法：GH_TOKEN=ghp_xxx node scripts/gh-mirror.mjs upload novel-forge F:\typing\novel-forge
// 提交信息：默认 "feat: initial release <repo> (via GitHub API mirror)"；
//           可用第 5 个参数或环境变量 GH_MSG 覆盖，例如
//           GH_MSG="feat: 故事路线强制引导 v0.4.1" node scripts/gh-mirror.mjs upload novel-forge F:\typing\novel-forge
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWNER = process.env.GH_OWNER || 'fengsheng-0617';
const TOKEN = process.env.GH_TOKEN;
const mode = process.argv[2];
const repo = process.argv[3];
const srcDir = path.resolve(process.argv[4] || '');
const commitMsg = (process.env.GH_MSG || process.argv[5] || '').trim();

const WHITELIST = {
  'novel-forge': ['package.json', 'README.md', 'README.en.md', 'README.fr.md', 'README.ru.md', 'README.es.md', 'README.pt.md', 'CHANGELOG.md', 'CHANGELOG.en.md', 'CHANGELOG.fr.md', 'CHANGELOG.ru.md', 'CHANGELOG.es.md', 'CHANGELOG.pt.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'run.bat', 'novel-ctl.bat', 'server', 'public', 'scripts'],
  'dsh-novel-forge': ['package.json', 'README.md', 'README.en.md', 'README.fr.md', 'README.ru.md', 'README.es.md', 'README.pt.md', 'CHANGELOG.md', 'CHANGELOG.en.md', 'CHANGELOG.fr.md', 'CHANGELOG.ru.md', 'CHANGELOG.es.md', 'CHANGELOG.pt.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'cordis.patch.yml', 'index.js', 'tools.js', 'engine-mirror.json', 'app', 'scripts', 'docs', 'check-mount.bat'],
};
const EXCLUDE = ['data', 'release', 'node_modules', '.git', 'mount-check-report.txt'];

if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(2); }
if (mode !== 'upload' || !repo || !srcDir) { console.error('用法：GH_TOKEN=.. node gh-mirror.mjs upload <repo> <dir>'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 单次请求（网络抖动可重试用）。 */
async function ghOnce(method, p, body) {
  const res = await fetch('https://api.github.com' + p, {
    method,
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'novel-forge-mirror' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* ok */ }
  return { status: res.status, json, text };
}

/** 带重试的请求：网络异常/超时、5xx、429 一律退避重试（GitHub API 偶发断流时很有用）。 */
async function gh(method, p, body, tries = 4) {
  let lastErr = null;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await ghOnce(method, p, body);
      if (r.status >= 500 || r.status === 429) {
        lastErr = new Error(`HTTP ${r.status} ${r.text.slice(0, 160)}`);
        if (i < tries) { console.log(`  … ${method} ${p} → ${r.status}，第 ${i} 次重试`); await sleep(500 * i * i); continue; }
        return r;
      }
      return r;
    } catch (e) {
      lastErr = e;
      const code = (e && e.cause && e.cause.code) || e.name || 'ERR';
      if (i < tries) { console.log(`  … ${method} ${p} 网络异常(${code})，第 ${i} 次重试`); await sleep(500 * i * i); continue; }
    }
  }
  throw lastErr || new Error('请求失败：' + method + ' ' + p);
}

function collectFiles(root) {
  const files = [];
  const walk = (dir, rel) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDE.includes(f.name)) continue;
      const full = path.join(dir, f.name);
      const r = rel ? rel + '/' + f.name : f.name;
      if (f.isDirectory()) walk(full, r);
      else files.push({ rel: r, full });
    }
  };
  for (const e of WHITELIST[repo] || []) {
    const s = path.join(root, e);
    if (!fs.existsSync(s)) { console.warn('  ⚠ 缺失(跳过)：' + e); continue; }
    if (fs.statSync(s).isDirectory()) walk(s, e);
    else files.push({ rel: e, full: s });
  }
  return files;
}

async function main() {
  console.log(`上传 ${repo}（owner=${OWNER}）from ${srcDir}`);
  const files = collectFiles(srcDir);
  console.log(`  收集文件：${files.length} 个`);
  if (!files.length) { console.error('无文件'); process.exit(2); }

  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // git 空树固定 SHA

  // 1) 现有 main 分支；空仓库时先用 Contents API 激活（Git Data API 要求仓库已有提交）
  const ref = await gh('GET', `/repos/${OWNER}/${repo}/git/ref/heads/main`);
  let baseCommit = null, baseTree = EMPTY_TREE;
  if (ref.status === 200) {
    baseCommit = ref.json.object.sha;
    const c = await gh('GET', `/repos/${OWNER}/${repo}/git/commits/${baseCommit}`);
    if (c.status === 200) baseTree = c.json.tree.sha;
    console.log(`  已有分支 main @${baseCommit.slice(0, 8)}，将追加到其内容上`);
  } else {
    // 激活：用 Contents API 提交 README（空仓库首个提交只能走 Contents API）
    const readmePath = path.join(srcDir, 'README.md');
    const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : `# ${repo}\n\n${repo} release.\n`;
    const put = await gh('PUT', `/repos/${OWNER}/${repo}/contents/README.md`, {
      message: 'chore: activate repository',
      content: Buffer.from(readme, 'utf8').toString('base64'),
      branch: 'main',
    });
    if (![200, 201, 409].includes(put.status)) {
      console.error('激活失败（Contents API）：' + put.text.slice(0, 300));
      process.exit(2);
    }
    console.log('  空仓已通过 Contents 激活（README 占位，后续整体替换为正式内容）');
    const ref2 = await gh('GET', `/repos/${OWNER}/${repo}/git/ref/heads/main`);
    if (ref2.status !== 200) { console.error('激活后读 main 失败'); process.exit(2); }
    baseCommit = ref2.json.object.sha;
    const c = await gh('GET', `/repos/${OWNER}/${repo}/git/commits/${baseCommit}`);
    if (c.status === 200) baseTree = c.json.tree.sha;
  }

  // 2) 逐文件 blob
  const tree = [];
  let idx = 0;
  for (const f of files) {
    idx++;
    const b = await gh('POST', `/repos/${OWNER}/${repo}/git/blobs`, {
      content: fs.readFileSync(f.full).toString('base64'),
      encoding: 'base64',
    });
    if (b.status !== 201) { console.error('  blob 失败 ' + f.rel + '：' + b.text.slice(0, 200)); process.exit(2); }
    tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: b.json.sha });
    if (idx % 8 === 0 || idx === files.length) console.log(`  blobs ${idx}/${files.length}`);
  }

  // 3) tree（以现有树为基础，并入新节点）
  const t = await gh('POST', `/repos/${OWNER}/${repo}/git/trees`, { base_tree: baseTree, tree });
  if (t.status !== 201) { console.error('tree 失败：' + t.text.slice(0, 300)); process.exit(2); }
  const treeSha = t.json.sha;
  console.log(`  tree ${treeSha.slice(0, 8)}`);

  // 4) commit
  const c = await gh('POST', `/repos/${OWNER}/${repo}/git/commits`, {
    message: commitMsg || `feat: initial release ${repo} (via GitHub API mirror)`,
    tree: treeSha,
    parents: [baseCommit],
  });
  if (c.status !== 201) { console.error('commit 失败：' + c.text.slice(0, 300)); process.exit(2); }
  const commitSha = c.json.sha;
  console.log(`  commit ${commitSha.slice(0, 8)}`);

  // 5) 移动 main
  const r = await gh('PATCH', `/repos/${OWNER}/${repo}/git/refs/heads/main`, { sha: commitSha, force: true });
  if (r.status !== 200) { console.error('ref 失败：' + r.text.slice(0, 300)); process.exit(2); }
  console.log(`  main -> ${commitSha.slice(0, 8)} ✓`);

  console.log(`完成：https://github.com/${OWNER}/${repo}（${files.length} 文件，单次内容提交）`);
}
main().catch((e) => { console.error('异常：', e); process.exit(2); });
