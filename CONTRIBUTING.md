# 参与贡献（Contributing）

感谢你有兴趣改进 NovelForge。请先阅读 README 与本文件，保持仓库整洁。

## 双仓库与引擎单一来源（务必遵守）

| 仓库 | 定位 | 能改什么 |
|---|---|---|
| `novel-forge`（本仓库） | 小说写作引擎，唯一真源 | `server/`、`public/`、`scripts/`、文档 |
| `dsh-novel-forge` 插件仓库 | harness 生态侧 | `index.js`（服务）、`tools.js`（会话工具）、未来 client UI、patch |

规则：
1. **引擎行为改动（server/public）只在本仓库做**，禁止在插件仓库直接改 `app/` 镜像内容；
2. 改动引擎后：本仓库测试全绿 → 到插件仓库执行 `node scripts/engine-mirror.mjs sync` → 插件三套自测全绿；
3. 插件仓库只添加 harness 侧功能；引擎新能力请回本仓库实现后再同步。

## 开发环境

- Node ≥ 18.17，无 npm 依赖（不要引入第三方包——这是特性，不是限制）。
- 代码风格：与现有文件一致（CommonJS 服务端 / 浏览器 ESM / .mjs 工具脚本）；
  中文文案面向用户；标识符用英文。

## 提交前检查（必须全绿）

```bash
# 独立版
node scripts/check-syntax.js        # 语法（服务端+浏览器）
node scripts/check-imports.js       # 前端导入完整性
node scripts/test-api.js            # REST 冒烟
node scripts/test-gen.js            # 生成引擎链路
node scripts/test-pipeline.js       # 无人值守+导出
node scripts/acceptance.js          # 全流程验收（模拟引擎）
node scripts/verify-ui.js           # 真实内核渲染 9 路由（需本机 Edge）
node scripts/e2e-ui.js              # 浏览器交互自动保存

# 插件仓库
node scripts/test-standalone.mjs / test-apply.mjs / test-tools.mjs
node scripts/engine-mirror.mjs verify   # 镜像零漂移
```

## 内容与安全准则

- 不引入遥测；不改变"数据仅存本机"承诺；改动涉及数据/Key 时须在 PR 说明。
- 示例/内置文本须为原创或明确可分发；提示词模板欢迎增强（中文优先）。
- 隐私敏感改动先看 SECURITY.md。

## PR 流程

1. 小步提交，说明动机；2. 补/改测试；3. 上述检查全绿；4. 描述改动与验证输出。
安全漏洞不要走公开 issue——见 SECURITY.md 上报渠道。
