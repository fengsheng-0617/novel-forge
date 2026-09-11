// 校验 public/js 下相对导入目标均存在
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../public/js');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const base = path.resolve(path.dirname(f), spec);
    if (!['.js', '.mjs', ''].some((e) => fs.existsSync(base + e))) {
      bad++;
      console.log('BAD', path.relative(root, f), '->', spec);
    }
  }
}
console.log(bad ? bad + ' 个缺失引用' : '全部相对导入可解析（' + files.length + ' 个模块）');
process.exit(bad ? 1 : 0);
