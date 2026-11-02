# dsh-media-gen 开发与维护

用户说明见 [README](../README.md)。当前已发布版本 **0.2.0**，发行提交 `151b443`，tag `v0.2.0`。

## 模块结构

| 模块 | 职责 |
|---|---|
| `lib/index.js` | Host 组合入口、共享模型管理操作与提示段 |
| `lib/media-config.js` | Cordis schema、volatile 读取及端点默认值 |
| `lib/video-model-config.js` | 浏览器安全的目录规范化、旧格式迁移、继承/覆盖/omit |
| `lib/video-model-manager.js` | UI RPC / Agent 共用管理逻辑、规范化 revision 和预览 |
| `lib/video-protocol.js` | 原生/兼容/custom-json 请求编译、响应状态映射、脱敏预览；无网络 |
| `lib/video-http.js` | 单次 POST、安全 GET 退避、有界读取、跨源下载鉴权隔离 |
| `lib/video-task-store.js` | profile 内原子任务记录、指纹、并发预留与安全摘要 |
| `lib/video-task-engine.js` | 提交、查询、恢复下载、结构化状态与工作区隔离 |
| `lib/video-core.js` | 视频工具注册、素材读取、结果展示与视频文件路由 |
| `lib/video-google.js` | 保留同步 Interactions 适配，不自动重试 POST |
| `lib/video-shared.js` / `lib/video-tasks.js` | 历史适配器辅助代码及回归兼容；不是新版工具的持久任务执行路径 |
| `lib/image-core.js` / `lib/rpc-route.js` | 生图与 `/image-gen` RPC，包括共享视频模型管理入口 |
| `lib/client-video.js` / `lib/client-image.js` | 设置页、工具结果卡与画廊 |
| `lib/client.js` | 构建产物，勿手改 |
| `vendor/` / `NOTICE.md` | 上游源码、许可证与归属声明 |

## 构建与测试

```sh
node scripts/build-client.mjs
npm run check
npm test
git diff --check
```

v0.2.0 发布时 **180 项测试通过**。测试覆盖完整 Host 启动、模型迁移/删除/保存、真实组件事件、自定义映射安全、状态恢复、跨进程原子预留及无重复 POST。历史提交重试测试仍验证旧辅助函数，不代表新版工具允许自动重提。

不要把 `scripts/patch-client-video.mjs` 当作日常构建入口：它是早期从 vendor 生成 client 的迁移脚本。修改客户端后只运行合并构建，并检查产物 diff。

可通过 `DSH_REAL_TOOLS_URL` 指向匹配 DSH 版本的真实 tools 模块运行 `test/video-tools.test.mjs`，验证 `defineTool` 与注册契约。普通 stub 测试不能替代实际 Host 激活检查。

CI 在 Node 22/24 上执行测试，并检查重新构建的客户端与提交产物一致。

## 配置版本与共享操作

- `videoConfigVersion` 缺省按 1 处理；新版保存为 2。
- v1 支持仅有 `model` 和字符串 `models`；v2 模型对象含 ID、名称、协议/参数格式、overrides、capabilities。
- v2 显式空目录不会从旧默认模型补回；空目录必须清空 `model`。
- 供应商默认值 → 模型覆盖 → 调用参数；模型 `omit` 与显式调用同字段冲突时拒绝。
- 模型名称不决定协议。已有目录迁移保留原协议，不按域名或模型名静默猜测。
- 管理 revision 对规范化目录稳定排序后计算，兼容 raw 配置与 schema 注入默认值的差异。
- UI 通过 `/image-gen/video-models` 执行 validate/preview，最终使用配置表单 revision 保存；Agent 管理工具使用同一 Host 管理操作和 configEditor。
- 不手写 profile 配置来代替管理 API。迁移前应备份配置；用户编辑中的草稿不属于已保存配置。

## 请求协议与约束

内置协议：`openai-compatible`、`dashscope`、`volcengine`、`google`、`custom-json`。

OpenAI 兼容参数格式：`standard`、`wan`、`seedance`。Wan 兼容使用字符串 `seconds`，Seedance 兼容使用数值 `duration` 和 `metadata.ratio/generate_audio`。原生 DashScope 使用 `input/parameters`；Wan3 首帧为 `input.media[].type=first_frame`，旧 Wan 使用 `input.img_url`，未适配字段明确拒绝。

参考来源：

- [Wan 3.0 官方 API](https://help.aliyun.com/en/model-studio/wan3-video-generation-api-reference)
- [火山官方任务 API](https://ark.volcengine.com/region:cn-beijing/docs/create-video-generation-task-api)
- [中转兼容契约样例](https://www.yotopivot.top/docs/)

不要把中转限制当成模型全球能力。官方文档可抓取性与实际调用验证须分别记录；本次新版没有批量运行付费模型验收。

自定义 JSON 支持端点、字段/类型/枚举映射、响应字段与状态对应；不执行脚本。鉴权只使用凭据引用。任务 ID 编码后拼入同源端点；下载到其他域名不得带供应商鉴权。固定参数与映射冲突、危险对象键、非法 Header、缺少恢复所需字段应在提交前拒绝。

## 任务生命周期

1. 编译并验证请求；使用包含供应商、模型、协议、实际参数及提示词/素材指纹的匹配键。
2. 在网络 POST 前原子预留操作记录。只有取得新预留的调用可以提交。
3. 创建 POST 只发送一次。响应丢失或无法取得任务 ID 返回 `submission_unknown`，不得自动重提。
4. 取得 ID 后返回 `pending`，使用 `query_video_task` 查询。正常查询一次观察状态；网络/429/5xx 安全 GET 采用 60 秒、120 秒退避，不是连续自动轮询。
5. 上游完成后下载/保存；失败为 `download_pending`。成功持久化后为 `completed`。
6. 保存关闭、结果只在内存时保留可恢复状态，不能宣称重启后文件仍存在。

状态携带 `operationId`、可用的 `taskId`、最近观察时间和阶段。网络错误不能改成上游失败；未知/404 不自动重提。显式 `resubmit` 新建操作，保留历史记录。

任务记录位于当前 profile 的 `data/dsh-media-gen/tasks`（未使用 profile 时回退至 DSH home 下相应目录）。不保存真实 Key、原始提示词或图片 Base64。跨工作区查询不返回结果路径/素材，也不向当前工作区下载。

目录锁冲突失败关闭。异常崩溃留下 `.write-lock` 时，必须先确认没有存活写进程，再由操作者恢复；不得自动抢锁。坏记录保留并报错，不能当作任务不存在后重提。

Google 现有同步 Interactions 适配没有任务 ID：可以记录提交不确定性并防重提，但无法承诺查询恢复。复杂 HMAC/OAuth、WebSocket、通用 multipart、多步骤素材上传不属于当前 custom-json 支持范围。

## 安装、发布与验证

通过插件管理器安装。支持 HMR 的宿主可移除旧包后重新安装以替换模块；仅开关 bundle 不等于重导入代码。以 `application` 和实际启动状态为准，不把重启当作修复代码缺陷的方法。

发布步骤：

1. 更新版本与用户说明，构建、测试、检查 diff。
2. 提交并推送，创建 `vX.Y.Z` tag 与 GitHub Release。
3. `publish.yml` 通过 npm Trusted Publishing/OIDC 发布，无需 token 或 OTP。
4. 检查 CI 的发布步骤及 npm 精确版本端点。registry 缓存可能延迟，不重复发布同一版本。

v0.2.0 验证记录：

- [Release](https://github.com/EmberwingAviation/dsh-media-gen/releases/tag/v0.2.0)
- [测试 CI](https://github.com/EmberwingAviation/dsh-media-gen/actions/runs/41422713551)：成功
- [发布 CI](https://github.com/EmberwingAviation/dsh-media-gen/actions/runs/41422770961)：成功
- [npm 精确版本](https://www.npmjs.com/package/dsh-media-gen/v/0.2.0)：已核实
- 本地 Host active、模型配置读写与两种兼容格式的无费用预览通过。
- 页面 Slot 已注册，组件测试通过；实际视觉布局尚未做浏览器自动化验收。

## 排错重点

- HTTP 405 只能说明请求未进入预期路由，不能直接断言 Key 错误。
- v0.1.6 曾因 `RPC_LOG` 未定义导致整个 Host 插件失败；v0.2.0 包含修复与完整启动回归。
- 先检查插件 active/failed 及真实异常，再检查路由与上游请求。
- 日志、预览、任务错误均不输出凭据；不要为诊断打印完整凭据文件。
