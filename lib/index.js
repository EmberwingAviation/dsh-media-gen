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
import { createVideoModelManager, videoCatalogRevision } from './video-model-manager.js'

export const name = 'dsh-media-gen'

// video 半硬依赖这四个服务；image 半对 attachments/credentials/connection/settings/systemPrompt 全部软引用。
export const inject = ['tools', 'credentials', 'webServer', 'attachments']

export { Config }

export function apply(ctx, config = {}) {
  // 生视频：每次工具调用取最新快照（volatile 热写入立即生效）。
  const getVideoConfig = () => ({
    videoConfigVersion: readConfigField(config, 'videoConfigVersion', 1),
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
  let editor
  ctx.inject(['configEditor'], scope => { editor = scope.configEditor; scope.on?.('dispose', () => { editor = undefined }) })
  const videoModels = createVideoModelManager({ getConfig: getVideoConfig, commit: async (patch, revision) => {
    if (!editor) throw new Error('Video configuration editor is unavailable')
    const row = editor.entries().find(entry => entry.options?.name === 'dsh-media-gen')
    if (!row) throw new Error('Video configuration entry is unavailable')
    await editor.edit(row, (current, inherited) => {
      const effective = { ...inherited, ...current }
      if (videoCatalogRevision(effective) !== revision) throw new Error('Video catalog changed; read it again before saving')
      return { ...current, ...patch }
    })
  } })
  applyImage(ctx, config, { videoModels })
  applyVideo(ctx, getVideoConfig, { videoModels })

  // 视频工具的系统提示词段落（生图段落由 image-core 注册）。
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'tool:video-gen',
      order: 122,
      text: 'Use manage_video_models to discover configured video models or preview their request format without generating. '
        + 'Pending video operations are not completed videos: report their operation ID and use query_video_task to recover them. '
        + 'A timeout or submission_unknown does not prove generation failed; do not submit a replacement without explicit user intent. '
        + 'Completed videos are shown inline and may include savedTo; do not read or search for the saved video.',
    })
  })
}
// hmr-touch 20260929-1219
