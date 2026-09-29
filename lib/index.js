/**
 * dsh-media-gen — 合并 host 入口。
 *
 * 单一 loader 条目 `media-gen`（见 cordis.patch.yml），组合两个上游 MIT 项目的核心：
 *   - lib/image-core.js  ← dsh-image-generation@0.1.2（whiteS18）：image_generate + /image-gen RPC
 *   - lib/video-core.js  ← dsh-video-gen@0.2.4（Yang-wudi）：generate_video / animate_image + 视频路由
 *
 * 统一 volatile Config（lib/media-config.js）：DSH >= 0.1.6 经 client configForms 热编辑，
 * 也可在 profile cordis.patch.yml 的 `media-gen` 条目下预填。
 */
import { Config, readConfigField, DEFAULT_VIDEO_FOLDER, DEFAULT_POLL_INTERVAL_MS, DEFAULT_WAIT_TIMEOUT_MS, DEFAULT_RATE_LIMIT_BASE_MS, DEFAULT_RATE_LIMIT_MAX_RETRIES } from './media-config.js'
import { applyImage } from './image-core.js'
import { applyVideo } from './video-core.js'

export const name = 'dsh-media-gen'

// video 半硬依赖这四个服务；image 半对 attachments/credentials/connection/settings/systemPrompt 全部软引用。
export const inject = ['tools', 'credentials', 'webServer', 'attachments']

export { Config }

export function apply(ctx, config = {}) {
  // 生图：image-core 自带 volatile reader，直接吃合并 Config（字段同名）。
  applyImage(ctx, config)

  // 生视频：每次工具调用取最新快照（volatile 热写入立即生效）。
  const getVideoConfig = () => ({
    videoEnabled: readConfigField(config, 'videoEnabled', true),
    videoProviders: readConfigField(config, 'videoProviders', []),
    videoProviderId: readConfigField(config, 'videoProviderId', ''),
    pollIntervalMs: readConfigField(config, 'pollIntervalMs', DEFAULT_POLL_INTERVAL_MS),
    waitTimeoutMs: readConfigField(config, 'waitTimeoutMs', DEFAULT_WAIT_TIMEOUT_MS),
    saveToWorkspace: readConfigField(config, 'saveToWorkspace', true),
    // finishVideo 沿用上游字段名 workspaceFolder；统一 Config 里叫 videoFolder。
    workspaceFolder: readConfigField(config, 'videoFolder', DEFAULT_VIDEO_FOLDER),
    rateLimitBaseMs: readConfigField(config, 'rateLimitBaseMs', DEFAULT_RATE_LIMIT_BASE_MS),
    rateLimitMaxRetries: readConfigField(config, 'rateLimitMaxRetries', DEFAULT_RATE_LIMIT_MAX_RETRIES),
  })
  applyVideo(ctx, getVideoConfig)

  // 视频工具的系统提示词段落（生图段落由 image-core 注册）。
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'tool:video-gen',
      order: 122,
      text: 'To create a video, call generate_video with a complete visual prompt; to animate an existing image, call animate_image. '
        + 'Both use the video provider selected in Settings → Plugins → dsh-media-gen → Video generation, and accept an optional provider '
        + 'parameter naming a catalog entry. Generation is asynchronous and may take minutes; the video plays inline in the conversation and '
        + 'is saved under generate/video in the workspace. Do not read or search for the video file afterwards. '
        + 'If a previous task for the same request is still tracked upstream, the tool reports it instead of submitting a new one '
        + '(do not retry blindly); pass resubmit=true only when the user explicitly wants a fresh task.',
    })
  })
}
// hmr-touch 20260929-1219
