# dsh-image-generation

DeepSeek Harness 生图插件：在设置里配置多个生图供应商 / 模型，对话里通过 `image_generate` 调用当前选中的那一个模型。

结合了官方 `@deepseek-ai/dsh-tool-image-generation`（对话生图工具）和 `dsh-plugin-subscriptions`（设置页可配置）的思路，面向 **API Key + Base URL** 的网关，而不是订阅登录。

## 功能

- **设置 → 生图配置**（左侧导航）：添加多个供应商。每个供应商有名称、Base URL、API 格式、API Key，以及一组生图模型。保存后写入 `settings.yaml` 的 `image-gen` 段，密钥走凭据服务，不进设置文件。
- **设置 → 插件 → 插件配置 → 图形生成**：从上面配置过的模型里**只选一个**作为对话生图模型，可开关工具、设置默认尺寸 / 质量。
- **对话工具 `image_generate`**：Agent 需要出图时调用当前选中的模型；图片写到工作区 `generate/image/`，并在对话里内联显示，点击可放大。

## API 格式

按模型 / 网关选择，不要用聊天用的 Anthropic Messages：

| 格式 | 适用 | 请求 |
|------|------|------|
| **OpenAI Images** (`/v1/images/generations`) | `gpt-image-2`、`gpt-image-1`、DALL·E，以及兼容 OpenAI Images 的网关 | `POST {base}/images/generations`，`response_format: b64_json` |
| **xAI Images** (`/v1/images/generations`) | `grok-imagine-image-2.0` | 同上路径，但用 `aspect_ratio` |
| **Gemini / Imagen** | `gemini-*-image`、`imagen-*` | `{base}/models/{id}:generateContent` 或 `:predict` |
| **OpenAI Chat Completions** | 在 chat 响应里返回图片的聚合网关 | `POST {base}/chat/completions` |

Base URL 填到 `/v1`（或 Gemini 的 `/v1beta`）这一层，插件会补上后面的路径。例如：

- OpenAI：`https://api.openai.com/v1`
- xAI：`https://api.x.ai/v1`
- Gemini 官方：`https://generativelanguage.googleapis.com/v1beta`
- 本地网关：`http://127.0.0.1:8317/v1`

## 安装

npm：

```sh
dsh plugin --profile <name> add dsh-image-generation
```

> [!WARNING]
> `0.1.0` 的 `__ModuleLoader__` id 仍是 `dsh-image-gen`，DSH 会按包名 `dsh-image-generation` 校验并拒绝启动。请安装 `0.1.1` 或更新版本。已装 `0.1.0` 的 profile：
>
> ```sh
> dsh plugin --profile <name> add dsh-image-generation@0.1.1
> ```
>
> 然后完全退出并重新打开 DSH。

GitHub：

```sh
dsh plugin --profile <name> add github:whiteS18/dsh-image-generation
```

本地检出：

```sh
dsh plugin --profile <name> add /绝对路径/dsh-image-generation
```

> [!IMPORTANT]
> DSH 在进程**启动时**组合插件。先启动再安装时，必须完全退出并重新打开 DSH（不是刷新页面）。

装完后可用：

```sh
dsh --profile <name> --dump-config | grep image-gen
```

## 使用

1. 打开 **设置 → 生图配置**，添加供应商和模型，填 Base URL / API 格式 / API Key，点保存。
2. 打开 **设置 → 插件 → 插件配置**，展开 **图形生成**，选择刚才配置的某一个模型并保存。
3. 在对话里让 Agent 生图，它会调用 `image_generate`。

可选参数：`prompt`（必填）、`size`（`1024x1024` / `1024x1536` / `1536x1024` / `auto`）、`quality`（`low` / `medium` / `high` / `auto`）、`referenceImages`（1–5 张已有图片引用，用于编辑；本地文件先 `read_image`）。

## 与现有插件的关系

- 官方 `@deepseek-ai/dsh-tool-image-generation` 只有工具、没有设置页；本插件自带设置页，一般不必再装官方包。
- npm 上另有同名风格的 `dsh-image-gen`（其他作者）。本包发布名为 `dsh-image-generation`，避免抢名。
- `dsh-plugin-subscriptions` 走的是 ChatGPT / Grok **订阅登录**，也会注册名为 `image_generate` 的工具。两边同时安装可能抢同一个工具名。需要 API 网关生图时用本插件；需要订阅生图时用 subscriptions。

## 卸载

```sh
dsh plugin --profile <name> remove dsh-image-generation
```

---

## English

Image-generation plugin for DeepSeek Harness. Configure providers and models under **Settings → Image generation**, pick exactly one model under **Settings → Plugins → Plugin configuration → Image generation**, then conversations call `image_generate` with that model.

Install:

```sh
dsh plugin --profile <name> add dsh-image-generation
```

`0.1.0` registered the client as `dsh-image-gen` and DSH refused to boot. Use `0.1.1` or later (`dsh plugin --profile <name> add dsh-image-generation@0.1.1`), then fully quit and reopen DSH.

API keys are stored through the credentials service. Generated files land in `generate/image/` of the session workspace and are shown inline in the conversation.
