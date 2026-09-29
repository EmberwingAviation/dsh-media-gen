# dsh-media-gen

DeepSeek Harness（DSH）**生图 + 生视频整合插件**：一个插件、一套设置页、三个工具、多条供应商通道。

Fork 合并自两个 MIT 项目（版权归属见 [NOTICE.md](NOTICE.md) 与 [vendor/](vendor/)）：

- [dsh-image-generation](https://github.com/whiteS18/dsh-image-generation)（whiteS18）— 生图 host/client 核心
- `dsh-video-gen@0.2.4`（Yang-wudi，原仓库已不可达，npm 仅存包）— 生视频 host/client 核心

License: **MIT**（含上游 MIT 代码，保留其版权声明）。

---

## 功能

| 工具 | 说明 |
|---|---|
| `image_generate` | 文生图 / 参考图编辑（`referenceImages` 1–5 张附件引用）；落盘 `generate/image/` 并对话内联 |
| `generate_video` | 文生视频（异步任务 + 轮询）；落盘 `generate/video/`、对话内播放、收录视频画廊 |
| `animate_image` | 图生视频（工作区文件 / 对话附件 / 最新对话图片三种源） |

- **多供应商目录**：生图按供应商配 API 格式（`openai-images` / `xai-images` / `gemini-image` / `openai-chat-image`）；
  生视频按目录条目配 kind（`dashscope` / `volcengine` / `google` / `openai-compatible`），默认选择 + 工具 `provider` 参数单次覆盖
- **openai-compatible 图生视频**：经 `input_reference`（data URL）传源图（New API 系中转实测会转存 OSS 后转发上游）
- **限流纪律**：`limit_requests` / 429 / 饱和类错误指数退避（≥60s 起步，可配），禁止即时重试；非限流错误绝不重试
- **任务登记簿**：openai-compatible 通道超时/失败后**先查旧任务再决定重提**（completed→直接取旧结果；failed→重提；
  进行中→拒绝重提并报状态），`resubmit=true` 可强制新任务
- **Agent 出图通道开关**（`imageLane`）：`auto` / `cli` / `tool` / `subagent`，写入 CLI 镜像并由系统提示词策略段约束 Agent 行为
- **快车道 CLI**：`scripts/gen-image.mjs` 免 Agent 回合直连出图；配置由 GUI 镜像驱动（见下）
- **设置页**：`生图`（供应商目录卡 + 默认配置卡合并一页）与 `视频生成` 两个导航页；会话顶栏 `视频画廊` Tab；
  对话流内 image/video toolview 内联卡片
- 密钥一律走 DSH 凭据服务（`credential-ref`），不进配置文件/命令行/浏览器

## 安装

```sh
# npm（发布后）
dsh plugin --profile <name> add dsh-media-gen
# GitHub
dsh plugin --profile <name> add github:EmberwingAviation/dsh-media-gen
# 本地开发（硬链接，改源码即同步副本）
dsh plugin --profile <name> add link:<本仓库绝对路径>
# 物理副本
dsh plugin --profile <name> add file:<本仓库绝对路径>
```

安装后**完全重启 DSH**（插件在进程启动时组合；host 模块缓存不会因热切换重导入已加载模块）。

兼容：DSH ≥ 0.1.6（configForms / volatile Config 模式）；在 **0.2.0-rc.1 Desktop** 实测激活。
peer 依赖为开放区间（上游 dsh-video-gen 的 `<0.2.0` 封顶在 0.2 宿主会被安装拦截，本项目已放宽）。

## 配置

### 设置 → 生图（合并页）

1. **供应商目录卡**：增删改供应商（名称 / Base URL / API 格式 / Key / 模型列表）；
   「拉取上游模型」按钮经 host loopback RPC 调 `GET {baseUrl}/models`（凭据在服务端解析，密钥不进浏览器），去重合并进模型列表
2. **默认配置卡**：启用开关、当前模型（`image_generate` 跟随）、默认尺寸/质量、
   **Agent 出图通道**、命令行出图输出目录、命令行出图请求超时

### 设置 → 视频生成

供应商目录（kind / Base URL / 模型 + 拉取候选 / Key / i2v 开关）、默认供应商单选、轮询间隔、等待超时、落盘目录。
i2v 语义：原生三家 kind 默认支持；`openai-compatible` 默认关闭、需显式勾选（经 `input_reference` 传图）。

### 预填示例（profile `cordis.patch.yml`）

```yaml
- id: media-gen
  name: dsh-media-gen
  config:
    enabled: true
    providerId: my-relay
    modelId: qwen-image-3.0-pro
    providers:
      - id: my-relay
        name: 我的中转站
        baseUrl: https://example.com/v1
        apiFormat: openai-images
        apiKeyEnv: MY_RELAY_KEY
        models:
          - { id: qwen-image-3.0-pro, name: qwen-image-3.0-pro }
    videoEnabled: true
    videoProviderId: relay-t2v
    waitTimeoutMs: 1200000
    videoProviders:
      - id: relay-t2v
        name: 中转 文生视频
        kind: openai-compatible
        baseUrl: https://example.com/v1
        model: some-t2v-model
        apiKeyEnv: MY_RELAY_KEY
        i2v: false
      - id: relay-i2v
        name: 中转 图生视频
        kind: openai-compatible
        baseUrl: https://example.com/v1
        model: some-i2v-model
        apiKeyEnv: MY_RELAY_KEY
        i2v: true
```

## 快车道 CLI 与配置镜像

```sh
node scripts/gen-image.mjs "提示词" [--model M] [--size S] [--key-env E] [--base B] [--out D] [--config P] [--timeout MS] [--dry-run]
```

- **GUI 是唯一编辑面**：设置卡保存时 host 经 `sync-cli-config` RPC 把解析后的生效配置原子写成镜像
  `~/.dsh/gen-image.config.json`（只含凭据 ref 名，不含密钥值）；CLI 优先读镜像
- 优先级：命令行 flag > GUI 镜像 > 仓库 `gen-image.config.json` > 内置默认
- host 未重启（新 RPC 未生效）时用 `node scripts/sync-cli-mirror.mjs` 从 profile patch 离线重建镜像
- `imageLane` 语义：`auto`=简单出图走 CLI、参考图/内联/画廊走原生工具；`cli`=一律 CLI；`tool`=一律原生工具；
  `subagent`=一律经子代理隔离调用

## 中转站契约实测备忘（New API 系网关）

- 生图：`/v1/images/generations`（OpenAI 形状）；chat 路由携图（`openai-chat-image`）与 images 路由**限流池独立**，优选 images
- 生视频：Sora 风格 `POST /v1/videos` → `GET /v1/videos/{id}` 轮询；状态词 `queued/in_progress/completed/failed`；
  成功态 URL 位置实测三种：顶层 `video_url` / `output.video_url` / `metadata.url`（适配器三级兜底）
- i2v：`input_reference` 传 data URL（网关转存后转发）；非法引用任务 failed 且不计费
- 拥堵期任务可能长时间停滞（实测 wan 系卡 30% 近一小时）——登记簿 + 20 分钟超时即为此设计

## 开发

```sh
node scripts/patch-client-video.mjs   # 一次性 codemod：vendor 视频 client → 本项目版本（幂等，已入库）
node scripts/build-client.mjs         # 合并两个 client 半 → lib/client.js（确定性，单模块 IIFE 隔离）
npm run check                         # node --check 全部模块
npm test                              # node:test（34 项）
```

测试含三道回归门：**import-graph 链接完整性**（改文件名漏改导入会红——曾因此事故排查数小时）、
限流退避序列与"非限流不重试"纪律、任务登记簿决策表。

### 结构

```
lib/index.js            合并 host 入口（单一 loader 条目 media-gen）
lib/media-config.js     统一 volatile Config + resolveVideoEntry（纯逻辑，可单测）
lib/image-core.js       生图 host（上游 dsh-image-generation 适配）
lib/video-core.js       生视频 host（上游 dsh-video-gen 适配 + 登记簿 + 退避）
lib/video-*.js          视频适配器/共享件（google/shared/reference-image）
lib/rate-limit.js       限流识别 + 指数退避
lib/video-tasks.js      任务登记簿（先查旧任务再重提）
lib/cli-config.js       CLI 镜像构造/原子写
lib/client-image.js     生图 client（设置页/工具视图/画廊 RPC）
lib/client-video.js     视频 client（设置卡/工具视图/视频画廊 IndexedDB）
lib/client.js           合并 client 入口（build-client.mjs 生成，勿手改）
scripts/parts/          patch-client-video.mjs 的替换部件
vendor/                 上游源码副本 + LICENSE（归属证据）
```

## 已知问题 / 上游缺陷候选

- **client 图"移除行后再添加行"同步失配**（dsh-client-hmr SSE）：bundle 开关后活页面可能丢 client 行，
  需整页重载恢复；配套工具插件 `dsh-page-reload`（F5/Ctrl+R 拦截 + 侧栏重载按钮）可免重启自愈
- **host 模块缓存**：已成功导入的模块不因 bundle 开关重导入——host 代码改动需重启 DSH 生效
  （client 代码改动可经 rebuilt 帧热替换）
- DSH Desktop 壳不提供重载加速器（F5 无效），仅拦截 F12

## Attribution & License

MIT © dsh-media-gen contributors。本插件为两个上游 MIT 项目的 fork 合并与再创作：

| 上游 | 版权 | 使用范围 |
|---|---|---|
| [dsh-image-generation](https://github.com/whiteS18/dsh-image-generation) @0.1.2 | whiteS18, MIT | `lib/image-core.js`、`lib/client-image.js` |
| `dsh-video-gen` @0.2.4（npm） | Yang-wudi / shanliuling, MIT | `lib/video-core.js`、`lib/video-*.js`、`lib/client-video.js` |

完整声明见 [NOTICE.md](NOTICE.md)；上游 LICENSE 与源码副本保留于 [vendor/](vendor/)；
各改编文件头部均有来源注释；合并 client 生成物头部含归属说明。
