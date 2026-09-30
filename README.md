# dsh-media-gen

[![test](https://github.com/EmberwingAviation/dsh-media-gen/actions/workflows/test.yml/badge.svg)](https://github.com/EmberwingAviation/dsh-media-gen/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/dsh-media-gen)](https://www.npmjs.com/package/dsh-media-gen)
[![license](https://img.shields.io/npm/l/dsh-media-gen)](LICENSE)

**让 DeepSeek Harness 会画图、会出片。** 一个插件、一套设置页、三个工具、多条供应商通道。

> Unified image + video generation for DeepSeek Harness — `image_generate` / `generate_video` / `animate_image`,
> multi-provider (OpenAI-compatible relays, DashScope 通义万相, Volcengine Seedance, Google Veo, Sora-style `/v1/videos`),
> settings UI, video gallery, MIT.

---

## 30 秒上手

**1. 安装插件**

```sh
dsh plugin --profile desktop add dsh-media-gen
```

> 也可以从 GitHub 装：`dsh plugin --profile desktop add github:EmberwingAviation/dsh-media-gen`

**2. 完全重启 DSH**（插件在启动时装载）

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

> ⚠️ **工具只在新建的会话里出现**：DSH 的会话工具集在会话创建时快照，装完插件后请**开新会话**。

---

## 你会得到什么

| 工具 | 做什么 |
|---|---|
| `image_generate` | 文生图、**参考图改图**（`referenceImages` 传 1–5 张对话里的图）；结果存 `generate/image/` 并**直接显示在对话里** |
| `generate_video` | 文生视频（异步任务 + 自动轮询）；结果存 `generate/video/`、**对话内播放**，并收录进**视频画廊** |
| `animate_image` | 图生视频：源图可以是工作区文件、对话附件、或"对话里最新那张图" |

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
| `openai-compatible` | OpenAI / Sora 风格 `/v1/videos` 异步任务，含各类中转站 | ⚠️ 需手动勾选「支持图生视频」（经 `input_reference` 传图） |

同一条通道可配多个模型，默认供应商在设置页单选；单次调用还可用工具参数 `provider` 临时换。

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

供应商目录（类型 / Base URL / 模型 / Key / 图生视频开关）、**默认供应商单选**、轮询间隔、等待超时、落盘目录。

### 密钥放哪

所有 Key 都交给 DSH 凭据服务（配置里只存引用名），**不会明文写进配置文件、不会传进浏览器、不会进命令行**。

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

**Q：为什么新会话里才有这三个工具？**
DSH 的会话工具集在会话创建时快照，装完插件或改了工具开关，**新开一个会话**即可。

**Q：报 429 / 限流 / "负载已饱和"怎么办？**
插件会自动指数退避重试（默认 ≥60 秒起步，最多 3 次），**不要手动连发**；上游拥堵时等一会儿或换个供应商。

**Q：视频任务一直转圈？**
异步视频任务偶尔会长时间停滞（上游排队）。插件会保留任务 id：超时后**先查旧任务**，而不是盲目重提；
确实要开新任务时，明确说「重提」或让 Agent 传 `resubmit`。

**Q：图/视频存哪了？**
工作区 `generate/image/`、`generate/video/`；图片会内联在对话里，视频同时出现在**视频画廊**。

**Q：改了设置要重启吗？**
改配置（供应商、模型、开关）**不用**重启；安装/升级插件、改插件自身代码需要**重启 DSH**。

**Q：图生视频为什么提示不支持？**
`openai-compatible` 类型默认关闭图生视频（不同中转站能力不一），到「视频生成」页把该供应商的「支持图生视频」勾上。

---

## 反馈与贡献

- 遇到问题或有需求：开 [Issue](https://github.com/EmberwingAviation/dsh-media-gen/issues)
- 开发、架构、测试、发布流程：见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

---

## English quick start

```sh
dsh plugin --profile desktop add dsh-media-gen   # restart DSH afterwards
```

Then go to **Settings → Image generation**: add a provider (Base URL / key / models), pick a default model, and ask the
agent in a **new session**:

> "Draw a humpback whale breaching at night, movie-poster style"

Three tools are exposed: `image_generate` (text-to-image and reference-image edits), `generate_video` (text-to-video,
async polling) and `animate_image` (image-to-video). Outputs land in `generate/image/` and `generate/video/`, inline in the
conversation, with a video gallery tab. Keys are stored through the DSH credential service — never in config files.

---

## Attribution & License

MIT © dsh-media-gen contributors. 本插件是以下两个 MIT 项目的 fork 合并与再创作：

| 上游 | 版权 | 使用范围 |
|---|---|---|
| [dsh-image-generation](https://github.com/whiteS18/dsh-image-generation) @0.1.2 | whiteS18, MIT | `lib/image-core.js`、`lib/client-image.js` |
| `dsh-video-gen` @0.2.4（npm） | Yang-wudi / shanliuling, MIT | `lib/video-core.js`、`lib/video-*.js`、`lib/client-video.js` |

完整声明见 [NOTICE.md](NOTICE.md)；上游 LICENSE 与源码副本保留于 [vendor/](vendor/)；各改编文件头部均有来源注释。