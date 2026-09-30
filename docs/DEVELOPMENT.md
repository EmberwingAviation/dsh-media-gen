# dsh-media-gen — 开发文档

面向开发者：架构、构建、测试、发布流程、上游契约备忘与已知问题。用户使用说明见 [README.md](../README.md)。

## 结构

```
lib/index.js            合并 host 入口（单一 loader 条目 media-gen）
lib/media-config.js     统一 volatile Config + resolveVideoEntry（纯逻辑，可单测）
lib/image-core.js       生图 host（上游 dsh-image-generation 适配）
lib/video-core.js       生视频 host（上游 dsh-video-gen 适配 + 登记簿 + 退避）
lib/video-*.js          视频适配器/共享件（google / shared / reference-image）
lib/rate-limit.js       限流识别 + 指数退避
lib/video-tasks.js      任务登记簿（先查旧任务再重提）
lib/cli-config.js       CLI 镜像构造/原子写
lib/client-image.js     生图 client（设置页 / 工具视图 / 画廊 RPC）
lib/client-video.js     视频 client（设置卡 / 工具视图 / 视频画廊 IndexedDB）
lib/client.js           合并 client 入口（build-client.mjs 生成，勿手改）
scripts/parts/          patch-client-video.mjs 的替换部件
vendor/                 上游源码副本 + LICENSE（归属证据）
```

## 构建与测试

```sh
node scripts/patch-client-video.mjs   # 一次性 codemod：vendor 视频 client → 本项目版本（幂等，已入库）
node scripts/build-client.mjs         # 合并两个 client 半 → lib/client.js（确定性，单模块 IIFE 隔离）
npm run check                         # node --check 全部模块
npm test                              # node:test（34 项）
```

三道回归门：

1. **import-graph 链接完整性** —— 改文件名漏改导入会直接红（曾因此事故排查数小时）
2. **限流退避序列 + "非限流不重试"纪律**
3. **任务登记簿决策表**（completed→复用 / failed→重提 / 进行中→拒绝）

CI（`.github/workflows/test.yml`）在 push/PR 时跑 Node 22/24 矩阵，并校验**构建确定性**：
`build-client.mjs` 重新生成后 `lib/client.js` 必须与提交内容零差异（防止改了源码忘重建）。

## 发布流程

1. bump `package.json` 的 `version`
2. commit + push
3. GitHub 打 Release（tag `vX.Y.Z`）
4. `.github/workflows/publish.yml` 自动发布到 npm —— 走 **npm Trusted Publishing（OIDC）**：
   无需 `NPM_TOKEN`、无需 OTP、自动生成 **provenance（SLSA v1）** 认证
   - npm 包侧已连：`EmberwingAviation/dsh-media-gen` + `publish.yml`（权限含 npm publish）
   - 也可在 Actions 页手动 `workflow_dispatch`（注意：版本已存在会失败）

## CLI 与配置镜像

```sh
node scripts/gen-image.mjs "提示词" [--model M] [--size S] [--key-env E] [--base B] [--out D] [--config P] [--timeout MS] [--dry-run]
node scripts/sync-cli-mirror.mjs   # host 未重启（新 RPC 未生效）时，从 profile patch 离线重建镜像
```

- 优先级：命令行 flag > GUI 镜像（`~/.dsh/gen-image.config.json`）> 仓库 `gen-image.config.json` > 内置默认
- GUI 保存时 host 经 `sync-cli-config` RPC 原子写镜像（只含凭据 ref 名，不含密钥值）
- `imageLane`：`auto` / `cli` / `tool` / `subagent`，由系统提示词策略段约束 Agent 行为

## 中转站契约实测备忘（New API 系网关）

- 生图：`/v1/images/generations`（OpenAI 形状）；chat 路由携图与 images 路由**限流池独立**，优选 images
- 生视频：Sora 风格 `POST /v1/videos` → `GET /v1/videos/{id}`；状态词 `queued/in_progress/completed/failed`；
  成功态 URL 位置实测三种：顶层 `video_url` / `output.video_url` / `metadata.url`（适配器三级兜底）
- i2v：`input_reference` 传 data URL（网关转存后转发）；非法引用任务 failed 且不计费
- 拥堵期任务可能长时间停滞（实测 wan 系卡 30% 近一小时）——登记簿 + 20 分钟超时即为此设计

## 已知问题 / 上游缺陷候选

- **client 图"移除行后再添加行"同步失配**（dsh-client-hmr SSE）：bundle 开关后活页面可能丢 client 行，需整页重载恢复；
  配套工具插件 `dsh-page-reload`（F5/Ctrl+R 拦截 + 侧栏重载按钮）可免重启自愈
- **host 模块缓存**：已成功导入的模块不因 bundle 开关重导入 —— host 代码改动需**重启 DSH** 才生效；client 代码改动可经 rebuilt 帧热替换
- DSH Desktop 壳不提供重载加速器（F5 无效），仅拦截 F12