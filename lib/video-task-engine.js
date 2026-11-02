import { taskFingerprint } from './video-task-store.js'
import { compileVideoRequest, compileVideoQuery, compileVideoDownload, parseVideoResponse } from './video-protocol.js'
import { requestVideoJson, downloadVideoBytes, redactVideoError } from './video-http.js'

const messages = {
  pending: '视频任务已创建，尚未完成。请查询原操作，不要重新提交。',
  submission_unknown: '提交结果不明，上游可能已创建任务。请核对使用日志，不要自动重新提交。',
  failed: '上游明确报告任务失败。未自动重新提交。',
  cancelled: '上游报告任务已取消。',
  download_pending: '视频生成已完成，但结果尚未成功保存。请查询原操作恢复下载。',
  completed: '视频已完成并保存。',
}
export function videoTaskResult(record) {
  return Object.fromEntries(Object.entries({
    status: record.status, operationId: record.operationId, taskId: record.taskId,
    provider: record.providerSnapshot?.id ?? record.providerId ?? record.provider, model: record.model,
    lastKnownStatus: record.lastKnownStatus, progress: record.progress, observedAt: record.observedAt,
    failedStage: record.failedStage, message: messages[record.status] ?? '任务状态暂时未知，请查询原操作。',
    error: record.error?.text, savedTo: record.resultPath, attachment: record.attachment,
    videoId: record.attachment?.videoId, mediaType: record.attachment?.mediaType,
    nextAction: record.status === 'submission_unknown' || (record.status === 'download_pending' && !record.taskId) ? 'check_usage_logs' : ['failed','cancelled','completed'].includes(record.status) ? 'none' : 'query_video_task',
  }).filter(([, value]) => value !== null && value !== undefined))
}
function publicSnapshot(active) {
  // Only execution settings, never the prompt, credentials or input bytes.
  return JSON.parse(JSON.stringify({ id: active.id, model: active.model, baseUrl: active.baseUrl, apiKeyEnv: active.apiKeyEnv, kind: active.kind, protocol: active.protocol, parameterFormat: active.parameterFormat, parameters: active.parameters, capabilities: active.capabilities, providerConfig: active.providerConfig, modelConfig: active.modelConfig }))
}

/** Owns one submit, then read-only recovery. Network dependencies are injectable. */
export class VideoTaskEngine {
  constructor({ store, resolveCredential, collect, fetchImpl, sleep }) {
    Object.assign(this, { store, resolveCredential, collect, fetchImpl, sleep })
    this.inflight = new Map()
  }
  /** Legacy synchronous provider: record uncertainty before its sole paid POST. */
  async generateLegacy(active, input, context = {}, submitCallback) {
    const fingerprint = taskFingerprint({ provider: active.id, endpoint: active.baseUrl, protocol: active.protocol, model: active.model, operation: input.operation ?? 't2v', actualParams: active.parameters, prompt: input.prompt, sourceIdentity: input.sourceIdentity })
    if (this.inflight.has(fingerprint)) {
      const result = await this.inflight.get(fingerprint)
      const record = await this.store.get(result.operationId)
      return record?.originWorkspace && record.originWorkspace !== context.workspace ? this.query(result.operationId, context) : result
    }
    const run = (async () => {
      if (!input.resubmit) {
        const previous = await this.store.findByFingerprint(fingerprint)
        if (previous) return this.query(previous.operationId, context)
      }
      const credential = await this.resolveCredential(active.apiKeyEnv)
      if (!credential) throw new Error(`Missing credential: ${active.apiKeyEnv}`)
      const draft = { status: 'submission_unknown', stage: 'submit', fingerprint, providerSnapshot: publicSnapshot(active), model: active.model, operation: input.operation ?? 't2v', credentialRef: active.apiKeyEnv, originWorkspace: context.workspace, sessionId: context.sessionId, parameters: active.parameters, observedAt: new Date().toISOString() }
      const reservation = input.resubmit ? { record: await this.store.create(draft), created: true } : await this.store.createIfAbsent(fingerprint, draft)
      let record = reservation.record
      if (!reservation.created) return this.query(record.operationId, context)
      let generated
      try { generated = await submitCallback(credential) } catch (error) {
        record = await this.store.update(record.operationId, { failedStage: 'submit', error: { text: redactVideoError(error, credential), code: String(error.code ?? '') } })
        return { ...videoTaskResult(record), message: 'Legacy Google submission outcome is unknown and has no resumable task ID. Check provider usage logs; do not automatically resubmit.' }
      }
      record = await this.store.update(record.operationId, { status: 'download_pending', stage: 'download' })
      try {
        const delivered = await this.collect(generated, active, context, record)
        if (delivered.saveError) throw new Error(delivered.saveError)
        const durable = Boolean(delivered.savedTo)
        record = await this.store.update(record.operationId, { status: durable ? 'completed' : 'download_pending', stage: durable ? 'terminal' : 'download', failedStage: null, error: null, ...(delivered.savedTo ? { resultPath: delivered.savedTo } : {}), ...(delivered.attachment ? { attachment: delivered.attachment } : {}) })
        return { ...videoTaskResult(record), ...delivered, status: record.status, ...(!durable ? { message: 'Legacy output was delivered but not saved; there is no resumable task ID. Check provider usage logs; no replacement was submitted.', nextAction: 'check_usage_logs' } : {}) }
      } catch (error) {
        record = await this.store.update(record.operationId, { failedStage: 'download', error: { text: redactVideoError(error, credential), code: String(error.code ?? '') } })
        return { ...videoTaskResult(record), message: 'Legacy Google output could not be saved; no resumable task ID is available. Do not automatically resubmit.', nextAction: 'check_usage_logs' }
      }
    })()
    this.inflight.set(fingerprint, run)
    try { return await run } finally { this.inflight.delete(fingerprint) }
  }
  async generate(active, input, context = {}) {
    const spec = compileVideoRequest(active, input)
    const fingerprint = taskFingerprint({ provider: active.id, endpoint: active.baseUrl, protocol: active.protocol, model: active.model, operation: input.operation ?? 't2v', actualParams: active.parameters, prompt: input.prompt, sourceIdentity: input.sourceIdentity ?? input.sourceUrl })
    if (this.inflight.has(fingerprint)) {
      const result = await this.inflight.get(fingerprint)
      const record = await this.store.get(result.operationId)
      return record?.originWorkspace && record.originWorkspace !== context.workspace ? this.query(result.operationId, context) : result
    }
    const run = this._generate(active, input, context, spec, fingerprint)
    this.inflight.set(fingerprint, run)
    try { return await run } finally { this.inflight.delete(fingerprint) }
  }
  async _generate(active, input, context, spec, fingerprint) {
    if (!input.resubmit) {
      const previous = await this.store.findByFingerprint(fingerprint)
      if (previous) return this.query(previous.operationId, context)
    }
    const credential = await this.resolveCredential(active.apiKeyEnv)
    if (!credential) throw new Error(`Missing credential: ${active.apiKeyEnv}`)
    const draft = { status: 'submission_unknown', stage: 'submit', fingerprint, providerSnapshot: publicSnapshot(active), model: active.model, operation: input.operation ?? 't2v', credentialRef: active.apiKeyEnv, originWorkspace: context.workspace, sessionId: context.sessionId, parameters: active.parameters, observedAt: new Date().toISOString() }
    const reservation = input.resubmit ? { record: await this.store.create(draft), created: true } : await this.store.createIfAbsent(fingerprint, draft)
    let record = reservation.record
    if (!reservation.created) return this.query(record.operationId, context)
    let response
    try {
      response = await requestVideoJson(spec, { credential, signal: context.signal, fetchImpl: this.fetchImpl, sleep: this.sleep })
    } catch (error) {
      // Even HTTP errors are not automatically resubmitted. Unknown is safest
      // where an intermediary may have accepted a task before losing response.
      record = await this.store.update(record.operationId, { status: 'submission_unknown', failedStage: 'submit', error: { text: redactVideoError(error, credential), code: String(error.code ?? '') }, ...(error.requestId ? { requestId: error.requestId } : {}) })
      return videoTaskResult(record)
    }
    let parsed
    try { parsed = parseVideoResponse(active, response.payload) } catch (error) {
      record = await this.store.update(record.operationId, { status: 'submission_unknown', failedStage: 'submit', error: { text: redactVideoError(error, credential), code: 'invalid-response' } })
      return videoTaskResult(record)
    }
    if (!parsed.taskId) {
      record = await this.store.update(record.operationId, { status: 'submission_unknown', failedStage: 'submit', error: { text: 'Creation response contained no task ID', code: 'missing-task-id' } })
      return videoTaskResult(record)
    }
    record = await this.store.update(record.operationId, { taskId: parsed.taskId, status: 'pending', stage: 'poll', lastKnownStatus: parsed.status, observedAt: new Date().toISOString(), ...(response.requestId ? { requestId: response.requestId } : {}) })
    return videoTaskResult(record)
  }
  async query(operationId, context = {}) {
    let record = await this.store.get(operationId)
    if (!record) throw new Error('Unknown video operation')
    if (record.originWorkspace && context.workspace !== record.originWorkspace) {
      const result = videoTaskResult(record)
      delete result.savedTo; delete result.attachment; delete result.error; delete result.videoId; delete result.mediaType
      return { ...result, message: '请从原工作区查询结果；未向当前工作区公开结果路径或素材。', nextAction: 'query_from_original_workspace' }
    }
    if (record.status === 'completed' || !record.taskId || ['failed', 'cancelled'].includes(record.status)) return videoTaskResult(record)
    const active = record.providerSnapshot
    const credential = await this.resolveCredential(record.credentialRef)
    if (!credential) return { ...videoTaskResult(record), error: `Missing credential: ${record.credentialRef}`, nextAction: 'restore_credential' }
    let state
    try {
      const response = await requestVideoJson(compileVideoQuery(active, record.taskId), { credential, signal: context.signal, fetchImpl: this.fetchImpl, sleep: this.sleep })
      state = parseVideoResponse(active, response.payload)
      record = await this.store.update(operationId, { lastKnownStatus: state.status, failedStage: null, error: null, observedAt: new Date().toISOString(), ...(typeof state.progress === 'number' ? { progress: state.progress } : {}), ...(response.requestId ? { requestId: response.requestId } : {}) })
    } catch (error) {
      record = await this.store.update(operationId, { failedStage: 'poll', error: { text: redactVideoError(error, credential), code: String(error.code ?? '') } })
      return videoTaskResult(record)
    }
    if (['failed', 'cancelled'].includes(state.status)) {
      record = await this.store.update(operationId, { status: state.status, stage: 'terminal', error: { text: redactVideoError(state.errorMessage ?? state.status, credential), code: state.errorCode ?? '' } })
      return videoTaskResult(record)
    }
    if (state.status !== 'completed') return videoTaskResult(record)
    record = await this.store.update(operationId, { status: 'download_pending', stage: 'download' })
    if (record.originWorkspace && context.workspace !== record.originWorkspace) return { ...videoTaskResult(record), error: '请从原工作区查询以保存结果；没有向当前工作区写入视频。', nextAction: 'query_from_original_workspace' }
    try {
      const spec = compileVideoDownload(active, record.taskId)
      const url = spec?.url ?? state.url
      if (!url) throw new Error('Completed task has no download endpoint or result URL')
      const generated = await downloadVideoBytes(url, { credential, auth: spec?.auth, headers: spec?.headers, trustedOrigin: spec ? active.baseUrl : undefined, signal: context.signal, fetchImpl: this.fetchImpl })
      const delivered = await this.collect(generated, active, context, record)
      if (delivered.saveError) throw new Error(delivered.saveError)
      const durable = Boolean(delivered.savedTo)
      record = await this.store.update(operationId, { status: durable ? 'completed' : 'download_pending', stage: durable ? 'terminal' : 'download', failedStage: null, error: null, ...(delivered.savedTo ? { resultPath: delivered.savedTo } : {}), ...(delivered.attachment ? { attachment: delivered.attachment } : {}) })
      return { ...videoTaskResult(record), ...delivered, status: record.status, ...(!durable ? { message: '视频已交付但未保存到工作区；保留原任务以便重启后重新下载。', nextAction: 'query_video_task' } : {}) }
    } catch (error) {
      record = await this.store.update(operationId, { status: 'download_pending', failedStage: 'download', error: { text: redactVideoError(error, credential), code: String(error.code ?? '') } })
      return videoTaskResult(record)
    }
  }
}
