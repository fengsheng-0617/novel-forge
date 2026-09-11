'use strict';
// Syntax-check every JS file in ROOT（默认本仓库；可传参检查其他目录，如插件包）。
// 规则：app/public 浏览器 ESM / 根 index.js / *.mjs → 复制为 .mjs 检查；其余按 CJS node --check。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-check-'));
const targets = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (f === 'node_modules' || f === 'data' || f === '.git' || f === tmpDir) continue;
      walk(full);
    } else if (f.endsWith('.js') || f.endsWith('.mjs')) targets.push(full);
  }
})(ROOT);

let failed = 0;
for (const f of targets) {
  const norm = f.replace(/\\/g, '/');
  const isEsm = norm.includes('public/') || path.basename(f) === 'index.js' || f.endsWith('.mjs');
  try {
    if (isEsm) {
      const src = fs.readFileSync(f, 'utf8');
      const tmp = path.join(tmpDir, 'm_' + Math.random().toString(36).slice(2, 8) + '.mjs');
      fs.writeFileSync(tmp, src, 'utf8');
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
      fs.unlinkSync(tmp);
    } else {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    }
    console.log('ok  ', path.relative(ROOT, f));
  } catch (e) {
    failed++;
    console.log('FAIL', path.relative(ROOT, f));
    console.log(String(e.stderr || e.message).split('\n').slice(0, 8).join('\n'));
  }
}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
console.log(failed ? `\n${failed} 个文件语法错误` : `\n全部 ${targets.length} 个 JS 文件语法通过`);
process.exit(failed ? 1 : 0);
