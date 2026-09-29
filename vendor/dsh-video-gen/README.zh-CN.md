# 🎬 dsh-video-gen

**让 DeepSeek Harness 在对话中直接生成视频与图生视频，支持阿里云通义万相、火山引擎豆包 Seedance、Google Veo、OpenAI Sora 及兼容中转站。**

[![npm version](https://img.shields.io/npm/v/dsh-video-gen.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/dsh-video-gen)
[![DSH Plugin](https://img.shields.io/badge/Plugin%20For-DeepSeek%20Harness-6366f1?style=flat-square)](https://github.com/deepseek-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

![dsh-video-gen 封面](docs/assets/hero-poster.jpg)

[English](README.md) | **简体中文**

---

## 💡 它解决什么问题？

**`dsh-video-gen` 是专为 DeepSeek Harness (DSH) 打造的开源视频生成插件。**

- ✅ **多提供商支持**：阿里云 DashScope、火山引擎/豆包 Seedance、Google Veo、OpenAI Sora
- ✅ **两个工具**：`generate_video`（文生视频）和 `animate_image`（图生视频）
- ✅ **对话内播放**：生成的视频直接在对话流中显示
- ✅ **自动保存**：视频文件自动保存到 Agent 工作区
- ✅ **视频画廊**：会话顶栏 Tab，集中浏览、搜索、筛选、预览、下载、删除所有历史视频
- ✅ **Web 设置界面**：在 DSH Settings 中可视化配置

---

## 🚀 快速安装

```bash
pnpm dsh plugin --profile web add dsh-video-gen@latest
```

### 配置 API Key

进入 **Settings → Plugins → Video generation**，选择 Provider，填写 API Key。

**密钥环境变量：**
- 阿里云 DashScope: `DASHSCOPE_API_KEY`
- 火山引擎 Ark: `ARK_API_KEY`
- OpenAI / 中转站: `OPENAI_API_KEY`
- Google Gemini: `GEMINI_API_KEY`

### 开始生成

```text
帮我生成一段 5 秒的视频：雨夜霓虹街头，一只赛博朋克猫在奔跑。
```

或图生视频：

```text
把这张图动起来：猫咪缓缓眨眼，尾巴轻轻摆动。
```

---

## 🖼️ 视频画廊

Agent 生成的每个视频都会自动收录进**视频画廊** —— 会话顶栏的原生 Tab（与 [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) 画廊同款交互）：

- **网格总览**：卡片悬停自动预览播放，带厂商/模型标签、图生视频角标、文件大小、请求时长与生成日期
- **搜索与筛选**：按 Prompt 关键词或模型搜索，按厂商筛选
- **灯箱预览**：点击卡片全屏播放，支持控制条
- **卡片与灯箱操作**：下载视频、复制 Prompt、从画廊删除（不影响聊天记录；删除后通过墓碑机制避免再次收录）
- **持久可播**：画廊不依赖内存缓存。条目通过 HTTP 路由的持久化回退（POST attachment + 视频目录旁的 marker 索引）从工作区文件重新取回视频，24 条 LRU 淘汰和 DSH 重启后依然可播（需开启默认的"保存到工作区"）

---

## 📖 支持的提供商

| 提供商 | 模型 | 图生视频 |
|--------|------|:---:|
| **阿里云 DashScope** | `wanx2.1-t2v-turbo` | ✅ |
| **火山引擎 / 豆包** | `doubao-seedance-1-0-pro-250528` | ✅ |
| **Google Veo** | `veo-3.0-generate-preview` | ✅ |
| **OpenAI Sora** | `sora-2` | ❌ |

---

## 🛠️ 工具

### `generate_video`（文生视频）
- **`prompt`** (必填): 视频描述
- **`size`**: 分辨率/宽高比
- **`duration`**: 时长（秒）

### `animate_image`（图生视频）
- **`prompt`** (必填): 动画描述
- **`source_path`**: 工作区图片路径
- **`source_attachment_id`**: 对话附件 ID
- **`size`** / **`duration`**: 同上

---

## 🔧 开发与测试

```bash
npm run check      # node --check 语法检查
npm run typecheck  # tsc --noEmit（src 为公共类型面，勿执行 tsc build 覆盖 lib）
npm test           # node:test 单元/集成测试（零额外依赖）
```

---

## 📄 许可证

MIT © Yang-wudi

本软件部分代码改编自 [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen)（MIT © dsh-image-gen contributors），详见 [LICENSE](LICENSE)。

---

## 🙏 鸣谢

本项目改编自 shanliuling 的 [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen)（MIT 许可证）：视频画廊、设置卡片、对话内结果展示与多提供商架构源自该项目的设计与代码。感谢 shanliuling 出色的基础工作。