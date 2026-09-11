// build-release.mjs —— 一键发布：封装 独立版 与 插件版 的 zip（零依赖，Windows/macOS/Linux）
// 用法：node scripts/build-release.mjs [--out ../release]
// 产出：<out>/novel-forge-v<ver>.zip、<out>/dsh-novel-forge-v<ver>.zip、SHA256SUMS.txt、清单
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STANDALONE = path.resolve(HERE, '..');
const PLUGIN = path.resolve(process.argv.includes('--plugin') ? process.argv[process.argv.indexOf('--plugin') + 1] : path.join(STANDALONE, '..', 'novel-forge-plugin'));
const OUT = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(STANDALONE, 'release'));

const readVer = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-release-'));
const log = (...a) => console.log(...a);

/** 白名单复制：收集条目(文件或目录树)内所有文件，逐个复制（自动建父目录）。 */
function copyEntries(srcRoot, dstRoot, entries, exclude = []) {
  const files = [];
  const walk = (dir, rel) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (exclude.includes(f.name)) continue;
      const full = path.join(dir, f.name);
      const r = rel ? rel + '/' + f.name : f.name;
      if (f.isDirectory()) walk(full, r);
      else files.push({ full, rel: r });
    }
  };
  for (const e of entries) {
    const s = path.join(srcRoot, e);
    if (!fs.existsSync(s)) { log('  ⚠ 缺失（跳过）：' + e); continue; }
    if (fs.statSync(s).isDirectory()) walk(s, e);
    else files.push({ full: s, rel: e });
  }
  for (const f of files) {
    const target = path.join(dstRoot, f.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(f.full, target);
  }
  return files.length;
}

function makeZip(dir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  // 系统自带 tar（Windows10+/macOS/Linux 均可用），按扩展名产出 zip
  execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', dir, '.'], { stdio: 'pipe' });
  return fs.statSync(zipPath).size;
}

const RELEASE_NOTES = `==============================================================
织文 NovelForge - 发布包（大陆分发说明）
==============================================================
本 zip 为离线发布包，不含任何运行时数据（data/ 首次启动自动生成）。

【独立版 novel-forge】
- 运行：双击 run.bat（前台+自动开浏览器）或 novel-ctl.bat start（后台服务）
- 端口：默认 7390（set NOVEL_PORT=7400 可改）
- 无需 Node 以外的任何安装；零 npm 依赖；内置离线模拟引擎（无需 Key 体验全流程）
- 接真实大模型：打开页面后 ⚙ 设置 → 模型厂商 → 填入 DeepSeek/Qwen/GLM/Kimi/
  OpenAI/Gemini/Grok 等的 Key → 测试连接 → 默认引擎选它
- 数据目录：data/（书稿与 Key 仅存本机；分发/备份请勿外传该目录）

【插件版 dsh-novel-forge】
- 面向 DeepSeek Harness：在宿主执行 dsh plugin add <解压目录> 后重启宿主，
  会话内即可用 novel_forge_* 工具完成写作（详见包内 README）

【校验】
- SHA256SUMS.txt 与本包同目录；Windows 校验示例：
  certutil -hashfile novel-forge-vX.zip SHA256
  （或 PowerShell: Get-FileHash .\\novel-forge-vX.zip -Algorithm SHA256）

【大陆下载/镜像建议】
- 上传到你的国内服务器/网盘（如 gitee releases、蓝奏云等）后分发本 zip；
  请勿把任何人的 data/ 目录打进二次分发包。
- Node.js 未安装时请从国内镜像下载：nodejs.cn 或 npmmirror.com
  （https://npmmirror.com/mirrors/node/ 选 LTS 的 .msi）
==============================================================
`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const v1 = readVer(STANDALONE);
  const v2 = fs.existsSync(PLUGIN) ? readVer(PLUGIN) : null;
  const results = [];
  log('发布目录：' + OUT);

  // ---------- 独立版 ----------
  log(`\n[1/2] 独立版 novel-forge v${v1}`);
  const s1 = path.join(stage, 'novel-forge');
  copyEntries(STANDALONE, s1, [
    'package.json', 'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md',
    'run.bat', 'novel-ctl.bat', 'server', 'public',
  ], ['data', 'release', 'node_modules', '.git']);
  const notes1 = path.join(s1, 'README_大陆分发说明.txt');
  fs.writeFileSync(notes1, RELEASE_NOTES, 'utf8');
  const z1 = path.join(OUT, `novel-forge-v${v1}.zip`);
  const size1 = makeZip(s1, z1);
  results.push({ file: z1, size: size1, hash: sha(z1) });
  log(`  ✓ ${path.basename(z1)}（${(size1 / 1024).toFixed(1)} KB）`);

  // ---------- 插件版 ----------
  if (!fs.existsSync(PLUGIN)) {
    log(`[2/2] 跳过插件版：未找到 ${PLUGIN}（可用 --plugin <目录> 指定）`);
  } else {
    log(`\n[2/2] 插件版 dsh-novel-forge v${v2}`);
    const s2 = path.join(stage, 'dsh-novel-forge');
    copyEntries(PLUGIN, s2, [
      'package.json', 'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md',
      'cordis.patch.yml', 'index.js', 'tools.js', 'engine-mirror.json', 'app', 'scripts',
    ], ['data', 'release', 'node_modules', '.git', 'mount-check-report.txt']);
    fs.writeFileSync(path.join(s2, 'README_大陆分发说明.txt'), RELEASE_NOTES, 'utf8');
    const z2 = path.join(OUT, `dsh-novel-forge-v${v2}.zip`);
    const size2 = makeZip(s2, z2);
    results.push({ file: z2, size: size2, hash: sha(z2) });
    log(`  ✓ ${path.basename(z2)}（${(size2 / 1024).toFixed(1)} KB）`);
  }

  // ---------- 校验和与清单 ----------
  let sums = '';
  for (const r of results) sums += `${r.hash}  ${path.basename(r.file)}\n`;
  fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), sums, 'utf8');
  let manifest = `NovelForge release\n时间：${new Date().toLocaleString('zh-CN', { hour12: false })}\n\n`;
  for (const r of results) {
    manifest += `${path.basename(r.file)}  ${(r.size / 1024).toFixed(1)} KB  sha256=${r.hash}\n`;
  }
  fs.writeFileSync(path.join(OUT, 'release-manifest.txt'), manifest, 'utf8');
  log('\n✓ SHA256SUMS.txt 与 release-manifest.txt 已生成');
  log('\n发布包列表：');
  for (const r of results) log('  · ' + r.file);
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* ignore */ }
}

main().catch((e) => { console.error('发布失败：', e); process.exit(1); });
