# dsh-media-gen

[![test](https://github.com/EmberwingAviation/dsh-media-gen/actions/workflows/test.yml/badge.svg)](https://github.com/EmberwingAviation/dsh-media-gen/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/dsh-media-gen)](https://www.npmjs.com/package/dsh-media-gen)
[![license](https://img.shields.io/npm/l/dsh-media-gen)](LICENSE)

**让 DeepSeek Harness 会画图、会出片。** 一个插件，统一生图、生视频、模型配置和任务恢复。

> Unified image + video generation for DeepSeek Harness — `image_generate` / `generate_video` / `animate_image`,
> multi-provider (OpenAI-compatible relays, DashScope 通义万相, Volcengine Seedance, Google Veo, Sora-style `/v1/videos`),
> per-model configuration, custom JSON protocols, persistent task recovery, video gallery, MIT.

**当前版本：[v0.2.1](https://github.com/EmberwingAviation/dsh-media-gen/releases/tag/v0.2.1)** · [npm 安装版本](https://www.npmjs.com/package/dsh-media-gen/v/0.2.1)

本版修复凭据创建和模型拉取流程，增加视频页独立 API Key 密码输入、覆盖确认和错误脱敏；视频生成默认持续等待完成后交付，超时/停止仍保留原任务。模型独立配置、自定义映射和无费用预览继续保留。

---

## 30 秒上手

**1. 安装插件**（三种渠道任选，推荐 npm）

```sh
# ① npm 注册表（推荐，安装当前可用版本）
dsh plugin --profile desktop add dsh-media-gen

# ② GitHub 仓库直装
dsh plugin --profile desktop add github:EmberwingAviation/dsh-media-gen

# ③ 本地源码（开发用，更新后需构建并按宿主流程重新加载）
dsh plugin --profile desktop add link:/path/to/dsh-media-gen
```

**或者用图形界面**：设置 → 内置插件 → **添加插件** → 输入 `dsh-media-gen`（也接受 GitHub 地址或本地目录路径）。

> npm 包页：https://www.npmjs.com/package/dsh-media-gen ｜ 装完可在「设置 → 内置插件」列表看到 `dsh-media-gen` 与版本号
> 升级请使用当前 DSH 插件管理器。若提示 already-installed，按管理器要求移除旧包再安装；不要仅靠关闭/开启插件来更新 Host 代码。升级前备份配置。

**2. 检查安装结果**：支持热加载的 DSH 可直接生效；提示 restart-required 时再重启。设置页仍显示旧版时刷新页面。

**3. 填一个生图供应商** → 设置 → **生图** → 供应商目录卡 → 新建：
- 名称、Base URL（如 `https://你的中转站/v1`）、API 格式（多数中转站选 `openai-images`）
- 密钥（写入 DSH 凭据服务，不会明文存配置文件）
- 模型列表：可以点 **「拉取上游模型」** 一键从上游 `GET /models` 拉取候选

**4. 选默认模型** → 同一页的默认配置卡 → 当前模型选一个（`image_generate` 就跟着它走）

**5.（可选）配视频** → 设置 → **视频生成** → 加供应商（类型 / Base URL / 模型 / 密钥 / 是否支持图生视频）

**6. 开始用** —— 新建一个会话，直接对 Agent 说：

> 「画一只在深夜海面上跃起的座头鲸，电影海报风格」
> 「把这张图做成 5 秒视频」（附图）
> 「生成一段视频：赛博朋克城市雨夜，镜头缓慢推进」

> 工具是否实时更新取决于 DSH 版本和 Agent 预设；当前会话看不到新工具时，新建会话再试。

---

## 你会得到什么

| 工具 | 做什么 |
|---|---|
| `image_generate` | 文生图、**参考图改图**（`referenceImages` 传 1–5 张对话里的图）；结果存 `generate/image/` 并**直接显示在对话里** |
| `generate_video` | 文生视频；异步提交返回操作 ID，使用查询工具继续取回结果 |
| `animate_image` | 图生视频：源图可来自工作区或对话附件；以所选协议和模型能力为准 |
| `query_video_task` | 列出已登记任务、查询进度、恢复下载；不会创建新任务 |
| `manage_video_models` | 查询/修改模型目录、默认选择、预览请求；修改需目录 revision |

产物都在工作区的 `generate/` 下，随时可再引用；视频还能在会话顶栏的 **视频画廊** 里回看。

---

## 支持哪些服务商

**生图**（按供应商选择 API 格式）：

| 格式 | 适用 |
|---|---|
| `openai-images` | OpenAI 官方、以及绝大多数 New API 系中转站的 `/v1/images/generations`（推荐） |
| `openai-chat-image` | 只提供 chat 路由携图的中转站（兼容兜底） |
| `xai-images` / `gemini-image` | xAI、Google Gemini 系原生格式 |

**生视频**（按供应商选择类型）：

| 类型 | 说明 | 图生视频 |
|---|---|---|
| `dashscope` | 阿里云通义万相 | ✅ 默认支持 |
| `volcengine` | 火山引擎 Seedance | ✅ 默认支持 |
| `google` | Google Veo | ✅ 默认支持 |
| `openai-compatible` | `/v1/videos`；参数格式可选 standard / wan / seedance | 按格式与模型配置验证，不能只勾选就开启上游能力 |
| `custom-json` | 自定义异步 JSON 端点、字段及状态映射 | 需显式能力和 sourceUrl 映射；不支持 Base64 |

同一供应商可配多个模型，并独立选择协议与参数格式；单次调用可用 `provider` 和 `model` 切换。当前图片工具输入为本地文件/附件，不能直接使用仅接受公网 URL 的参考素材接口。

---

## 配置详解

### 设置 → 生图（一页两卡）

- **供应商目录卡**：增删改供应商（名称 / Base URL / API 格式 / Key / 模型列表），每行有密钥状态徽章；
  「拉取上游模型」按钮会带着你填的密钥向 `GET {BaseURL}/models` 请求，把返回的模型 id 去重合并进列表
- **默认配置卡**：
  - **启用 image_generate**：关掉后工具会拒答
  - **当前模型**：`image_generate` 实际使用的模型
  - **默认尺寸 / 默认质量**：不给参数时用这套
  - **Agent 出图通道**：`auto`（默认，简单出图走命令行、需要参考图/内联/画廊时走原生工具）／`cli`／`tool`／`subagent`
  - **命令行出图输出目录 / 请求超时**：给下面的命令行工具用

### 设置 → 视频生成

供应商目录（类型 / Base URL / 本地模型目录 / Key / 图生视频开关）、**默认供应商单选**、轮询间隔、等待超时、落盘目录。

**一次保存多个模型：**

1. 添加或编辑供应商，填好 Base URL 和 Key 凭据。
2. 点击「拉取上游模型」，勾选需要的模型（支持全选 / 取消全选）。
3. 点击「添加所选模型到草稿」，将它们合并到本地模型目录；相同 ID 自动去重，不覆盖原来的默认模型。
4. 从目录中选择默认模型，点击「确定」，再点击页面底部「保存设置」。
5. 重新打开设置，目录仍会保留；同一供应商的模型共用 Base URL 和 Key 凭据。

生成工具默认使用**默认供应商的默认模型**；可用 `provider` 选择供应商、`model` 选择该供应商目录内模型。旧版字符串目录自动兼容，保存后升级为模型对象目录。

**模型独立配置与删除：** 展开模型卡片，可编辑 ID/名称、设为默认、删除模型，并为每个模型分别选择协议和参数格式。删除默认模型需要确认，随后改选剩余首个模型；删除最后一个模型后供应商保留，但不能生成。

协议包括 OpenAI 兼容视频、DashScope 原生、火山 Ark 原生、Google 和自定义异步 JSON。兼容视频可选 standard / wan / seedance 参数格式，名称不绑定中转站。参数可继承供应商默认、单独覆盖或不发送；调用显式参数优先，但不能覆盖“不发送”的限制。

**供应商高级设置**提供默认参数、能力和自定义 JSON 配置。自定义模式支持提交/查询/下载路径、Bearer/Header/Query 凭据引用、JSON 字段转换、返回字段和状态映射。不执行 JavaScript，不支持自定义 HMAC/OAuth、多步骤素材上传或 WebSocket。不要在固定请求头/请求体里放密钥。

点击模型的**请求预览**可查看最终请求和解析规则，预览不发送网络请求、不产生生成费用。原生协议与中转兼容格式不能混用；模型 ID 相同也不代表端点和参数结构相同。

**任务恢复：** 生成工具提交异步任务后默认持续等待并查询原任务，完成后下载、保存并返回视频。只有等待超时、停止或无法自动继续时才返回 `pending` 等可恢复状态和本地 `operationId`；可用 `query_video_task` 继续查询或取回视频。任务记录保存在当前 profile 的 `data/dsh-media-gen/tasks`，重启后仍可查询；不存 API Key 或参考图 Base64。不同工作区的查询不会把原任务文件写到当前工作区。

| 返回状态 | 含义 |
|---|---|
| `pending` | 任务已创建，继续查询原任务 |
| `submission_unknown` | 提交结果不明，先核对使用日志，不能自动重提 |
| `download_pending` | 生成已完成，下载/保存待恢复 |
| `failed` / `cancelled` | 上游明确终态，未自动重提 |
| `completed` | 已有可交付结果 |

创建 POST 不自动重试；查询网络错误与限流采用至少 60 秒指数退避。Google 现有同步 Interactions 接口没有可恢复任务 ID，失败后会保留操作记录并要求核对日志，不会假装能续查或自动再提交。

`manage_video_models` 提供目录查询、无费用预览、模型增改删和默认选择，写操作需要最近目录 revision。保存的是调用配置，不会下载模型权重；模型列表存在某项不代表当前账号有额度或支持所有生成模式。

### 密钥放哪

Key 保存在 DSH 凭据服务，供应商配置与任务记录只保存引用名。服务端不会将已存 Key 返回浏览器；请求预览脱敏。请勿把 Key 放进自定义固定请求头、请求体或公开代码。

---

## 命令行直连出图（可选）

不想经过 Agent 回合、想最快拿到图：

```sh
node scripts/gen-image.mjs "提示词" [--model qwen-image-3.0-pro] [--size 1024x1024] [--dry-run]
```

- 默认值来自「设置 → 生图」保存的配置（host 会把它同步成配置文件镜像），命令行参数可临时覆盖
- `--dry-run` 只打印生效配置，不消耗额度
- 参数、优先级、镜像机制见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

---

## 常见问题

**Q：安装后看不到工具？**
先检查插件是否 active 和当前 Agent 预设是否开放工具；部分 DSH 版本需要新建会话。v0.2.0 提供三个生成工具及两个视频管理/查询工具。

**Q：报 429 / 限流 / "负载已饱和"怎么办？**
视频查询请求遇限流或网络故障时按 60 秒、120 秒退避；视频创建 POST 不自动重试。生图保留独立退避策略。不要手动连发生成请求。

**Q：视频任务一直转圈？**
异步视频任务偶尔会长时间停滞（上游排队）。插件会保留任务 id：超时后**先查旧任务**，而不是盲目重提；
确实要开新任务时，明确说「重提」或让 Agent 传 `resubmit`。

**Q：图/视频存哪了？**
工作区 `generate/image/`、`generate/video/`；图片会内联在对话里，视频同时出现在**视频画廊**。

**Q：改了设置要重启吗？**
配置修改通常热生效。代码升级是否需要重启由 DSH 插件管理器的安装结果决定；支持 HMR 的宿主可通过移除旧包、安装新版完成模块替换。

**Q：图生视频为什么提示不支持？**
检查模型能力与协议格式。Wan 兼容格式当前只提供文生视频；Seedance 兼容格式不接受本地图片/Base64。能力开关不能绕过接口限制。

---

## 反馈与贡献

- 遇到问题或有需求：开 [Issue](https://github.com/EmberwingAviation/dsh-media-gen/issues)
- 开发、架构、测试、发布流程：见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

---

## English quick start

```sh
dsh plugin --profile desktop add dsh-media-gen   # follow the manager's activation instructions
```

Then go to **Settings → Image generation**: add a provider (Base URL / key / models), pick a default model, and ask the
agent in a **new session**:

> "Draw a humpback whale breaching at night, movie-poster style"

Five tools are exposed: `image_generate`, `generate_video`, `animate_image`, `query_video_task`, and `manage_video_models`. Async video submission returns an operation ID; query that operation to recover progress and results without creating another paid task. Per-model cards support deletion, protocol selection, inherited/overridden/omitted parameters and credential-free request previews. Generated files use `generate/image/` and `generate/video/`. Persistent task records contain credential references, never API key values.

---

## Attribution & License

MIT © dsh-media-gen contributors. 本插件是以下两个 MIT 项目的 fork 合并与再创作：

| 上游 | 版权 | 使用范围 |
|---|---|---|
| [dsh-image-generation](https://github.com/whiteS18/dsh-image-generation) @0.1.2 | whiteS18, MIT | `lib/image-core.js`、`lib/client-image.js` |
| `dsh-video-gen` @0.2.4（npm） | Yang-wudi / shanliuling, MIT | `lib/video-core.js`、`lib/video-*.js`、`lib/client-video.js` |

完整声明见 [NOTICE.md](NOTICE.md)；上游 LICENSE 与源码副本保留于 [vendor/](vendor/)；各改编文件头部均有来源注释。