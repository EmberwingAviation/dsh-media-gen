# NOTICE — 第三方代码归属

`dsh-media-gen` 是以下两个 MIT 许可项目的 fork 合并与再创作。按照 MIT 协议要求，
保留其版权声明与许可文本（各自完整 LICENSE 见 `vendor/` 目录）。

## 1. dsh-image-generation

- 版权：Copyright (c) dsh-image-generation contributors（whiteS18）
- 许可：MIT（见 `vendor/dsh-image-generation/LICENSE`）
- 来源：https://github.com/whiteS18/dsh-image-generation （npm: `dsh-image-generation@0.1.2`）
- 使用范围：`lib/image-core.js`（host 生图核心：多供应商目录、四种 API 格式生成器、
  `image_generate` 工具、`/image-gen` RPC 通道）与 `lib/client-image.js`（生图设置目录卡、
  模型选择卡、image_generate toolview 画廊）均复制自该项目并做少量改名适配
  （loader 条目命名空间 `image-gen` → `media-gen`）。

## 2. dsh-video-gen

- 版权：Copyright (c) dsh-video-gen contributors（Yang-wudi / shanliuling）
- 许可：MIT（见 `vendor/dsh-video-gen/LICENSE`）
- 来源：npm: `dsh-video-gen@0.2.4`（原 GitHub 仓库已不可达；其本身亦改编自 shanliuling/dsh-image-gen，MIT）
- 使用范围：`lib/video-core.js`（host 生视频核心：DashScope/火山/Google/OpenAI 兼容适配器、
  任务轮询、视频缓存与工作区持久化、`/plugins/dsh-video-gen/video` 路由、
  `generate_video`/`animate_image` 工具）、`lib/video-shared.js`、`lib/video-google.js`、
  `lib/video-reference-image.js` 复制自该项目；`lib/client-video.js`（视频 toolview、
  视频画廊 IndexedDB 存储与视图）复制自该项目并做适配。

## 本项目的主要修改（相对上游）

1. 合并为单一插件、单一 loader 条目 `media-gen`，统一 volatile Config（DSH ≥ 0.1.6 configForms 模式）。
2. 生视频从"单 provider 激活"升级为**多供应商目录**（`videoProviders[]` + 默认选择 + 工具 per-call `provider` 参数覆盖）。
3. OpenAI 兼容视频供应商新增**图生视频**支持（`input_reference` 传 data URL，实测中转站会转存 OSS）。
4. 修复 dsh-video-gen 客户端对已移除的 `settingsScope` API 的硬依赖（DSH 0.1.7+ 改用 `configForms`），
   视频设置卡重写为目录式管理并挂到 `plugins.bundle.config`。
5. peer 依赖放宽为开放区间（兼容 DSH 0.2.x；上游 dsh-video-gen 限定 `<0.2.0` 在 0.2 宿主上会被安装拦截）。
