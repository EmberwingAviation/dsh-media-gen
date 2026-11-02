import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import path from 'node:path'
const queues = new Map()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/i
const fields = new Set('operationId schemaVersion createdAt observedAt stage status taskId provider providerSnapshot credentialRef originWorkspace resultPath resultPaths fingerprint requestFingerprint operation model promptHash sourceIdentityHash sourceIdentity actualParams parameters sessionId attachment lastKnownStatus progress failedStage error requestId'.split(' '))
const fail = (code, message, cause) => Object.assign(new Error(message, cause ? { cause } : undefined), { code })
const plain = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (!Array.isArray(value) && !plain(value)) throw fail('ERR_VIDEO_TASK_INPUT', 'Expected finite JSON data')
  if (seen.has(value)) throw fail('ERR_VIDEO_TASK_INPUT', 'Cyclic input')
  if (Object.keys(value).some(k => ['__proto__', 'prototype', 'constructor'].includes(k))) throw fail('ERR_VIDEO_TASK_UNSAFE', 'Prototype keys are forbidden')
  seen.add(value)
  const result = Array.isArray(value) ? `[${value.map(v => canonical(v, seen)).join(',')}]` : `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(value[k], seen)}`).join(',')}}`
  seen.delete(value)
  return result
}
const hash = v => createHash('sha256').update(v).digest('hex')
/** Stable SHA256 over actual request fields, without modifying input. */
export function taskFingerprint(input) {
  if (!plain(input)) throw fail('ERR_VIDEO_TASK_INPUT', 'Fingerprint input must be an object')
  const p = plain(input.provider) ? input.provider : {}
  return hash(canonical({ endpoint: input.endpoint ?? p.endpoint ?? p.baseUrl ?? null, protocol: input.protocol ?? p.protocol ?? null, model: input.model ?? p.model ?? null, provider: typeof input.provider === 'string' ? input.provider : input.providerId ?? p.id ?? p.providerId ?? null, operation: input.operation ?? null, actualParams: input.actualParams ?? input.parameters ?? input.params ?? {}, promptHash: input.promptHash ?? hash(String(input.prompt ?? '')), sourceIdentityHash: input.sourceIdentityHash ?? hash(canonical(input.sourceIdentity ?? input.source ?? null)) }))
}
function safeJson(value, key = '', trail = []) {
  // Custom protocol field maps name the prompt destination, not prompt content.
  const mappingPath = v => typeof v === 'string' && /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/.test(v) && !v.split('.').some(k => ['__proto__', 'prototype', 'constructor'].includes(k))
  const mapping = plain(value) && Object.keys(value).every(k => ['path', 'type'].includes(k)) && mappingPath(value.path) && (value.type === undefined || value.type === 'string')
  const fieldMapping = key === 'prompt' && trail[0] === 'providerSnapshot' && trail.at(-1) === 'fields' && mapping
  if (!fieldMapping && /^(?:(?:x[-_])?api[-_]?key|authorization|proxy-authorization|cookie|set-cookie|token|access[-_]?token|secret|password|prompt|raw[-_]?prompt|negative[-_]?prompt|base64|b64_json|imageBase64|buffer|data)$/i.test(key)) throw fail('ERR_VIDEO_TASK_UNSAFE', 'Sensitive fields must not be persisted')
  if (typeof value === 'string') {
    if (/data:[^\s,]*;base64,|\bBearer\s+(?!\[REDACTED\])|\bsk-[a-zA-Z0-9_-]{8,}/i.test(value)) throw fail('ERR_VIDEO_TASK_UNSAFE', 'Inline credentials or media must not be persisted')
    if (/^https?:/i.test(value)) {
      let url
      try { url = new URL(value) } catch { throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid URL') }
      if (url.username || url.password || url.search || url.hash) throw fail('ERR_VIDEO_TASK_UNSAFE', 'Persisted URLs cannot contain credentials, queries, or fragments')
    }
  } else if (Array.isArray(value)) value.forEach(v => safeJson(v))
  else if (plain(value)) for (const [k, v] of Object.entries(value)) if (v !== undefined) safeJson(v, k, [...trail, key].filter(Boolean))
}
function validate(r) {
  if (!plain(r)) throw fail('ERR_VIDEO_TASK_INPUT', 'Record must be an object')
  for (const k of Object.keys(r)) if (!fields.has(k)) throw fail('ERR_VIDEO_TASK_UNSAFE', `Unsupported task field: ${k}`)
  canonical(r); safeJson(r)
  if (!UUID.test(r.operationId) || r.schemaVersion !== 1) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid identity or schema')
  for (const k of ['stage', 'status', 'createdAt', 'observedAt']) if (typeof r[k] !== 'string' || !r[k]) throw fail('ERR_VIDEO_TASK_INPUT', `Invalid ${k}`)
  for (const k of ['createdAt', 'observedAt']) if (!Number.isFinite(Date.parse(r[k]))) throw fail('ERR_VIDEO_TASK_INPUT', `Invalid ${k}`)
  for (const k of ['taskId', 'credentialRef', 'originWorkspace', 'resultPath', 'operation', 'model', 'sessionId', 'requestId', 'failedStage', 'lastKnownStatus']) if (r[k] != null && typeof r[k] !== 'string') throw fail('ERR_VIDEO_TASK_INPUT', `Invalid ${k}`)
  for (const k of ['fingerprint', 'requestFingerprint', 'promptHash', 'sourceIdentityHash']) if (r[k] != null && (typeof r[k] !== 'string' || !HASH.test(r[k]))) throw fail('ERR_VIDEO_TASK_INPUT', `Invalid ${k}`)
  for (const k of ['providerSnapshot', 'parameters', 'actualParams', 'attachment', 'error']) if (r[k] != null && !plain(r[k])) throw fail('ERR_VIDEO_TASK_INPUT', `Invalid ${k}`)
  if (r.provider != null && typeof r.provider !== 'string' && !plain(r.provider)) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid provider')
  if (r.error != null && Object.entries(r.error).some(([k, v]) => !['text', 'code'].includes(k) || typeof v !== 'string')) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid error')
  if (r.resultPaths != null && (!Array.isArray(r.resultPaths) || r.resultPaths.some(v => typeof v !== 'string'))) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid resultPaths')
  if (r.progress != null && (typeof r.progress !== 'number' || !Number.isFinite(r.progress))) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid progress')
  return r
}
/** Private directory. Writes serialize locally and fail closed across processes.
 * Abandoned .write-lock requires operator recovery. Corruption is retained and throws. */
export class VideoTaskStore {
  constructor({ directory }) {
    if (typeof directory !== 'string' || !directory) throw fail('ERR_VIDEO_TASK_INPUT', 'directory required')
    this.directory = path.resolve(directory)
  }
  _path(id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid operationId')
    return path.join(this.directory, `${id}.json`)
  }
  async _writeLocked(action) {
    const key = process.platform === 'win32' ? this.directory.toLowerCase() : this.directory
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
      const lock = path.join(this.directory, '.write-lock')
      try { await fs.mkdir(lock) } catch (e) {
        if (e.code === 'EEXIST') throw fail('ERR_VIDEO_TASK_LOCKED', 'Store locked; abandoned locks require manual recovery', e)
        throw e
      }
      try { return await action() } finally { await fs.rmdir(lock) }
    })
    queues.set(key, next)
    try { return await next } finally { if (queues.get(key) === next) queues.delete(key) }
  }
  async _atomic(record) {
    validate(record)
    const clean = JSON.parse(canonical(record))
    const target = this._path(record.operationId)
    const temp = path.join(this.directory, `.${record.operationId}.${randomUUID()}.tmp`)
    let handle
    try {
      handle = await fs.open(temp, 'wx', 0o600)
      await handle.writeFile(`${canonical(clean)}\n`, 'utf8'); await handle.sync()
      await handle.close(); handle = null
      await fs.rename(temp, target)
    } catch (e) {
      if (handle) await handle.close()
      try { await fs.unlink(temp) } catch (cleanup) { if (cleanup.code !== 'ENOENT') throw new AggregateError([e, cleanup], 'Write and cleanup failed') }
      throw e
    }
    return clean
  }
  async create(input) {
    if (!plain(input)) throw fail('ERR_VIDEO_TASK_INPUT', 'Record must be an object')
    if ('operationId' in input || 'schemaVersion' in input || 'createdAt' in input) throw fail('ERR_VIDEO_TASK_INPUT', 'Identity fields are generated')
    const now = new Date().toISOString()
    const record = JSON.parse(canonical({ stage: 'created', status: 'pending', taskId: null, provider: {}, credentialRef: null, originWorkspace: null, resultPaths: [], ...input, operationId: randomUUID(), schemaVersion: 1, createdAt: now, observedAt: input.observedAt ?? now }))
    validate(record)
    return this._writeLocked(() => this._atomic(record))
  }
  /** Atomic reservation: only created=true authorizes a new upstream submission. */
  async createIfAbsent(fingerprint, input) {
    if (typeof fingerprint !== 'string' || !HASH.test(fingerprint)) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid fingerprint')
    if (!plain(input) || ['operationId', 'schemaVersion', 'createdAt'].some(k => k in input)) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid reservation input')
    const copy = JSON.parse(canonical(input))
    return this._writeLocked(async () => {
      const existing = await this.findByFingerprint(fingerprint)
      if (existing) return { record: existing, created: false }
      const now = new Date().toISOString()
      const record = await this._atomic({ stage: 'created', status: 'pending', taskId: null, provider: {}, credentialRef: null, originWorkspace: null, resultPaths: [], ...copy, fingerprint, operationId: randomUUID(), schemaVersion: 1, createdAt: now, observedAt: copy.observedAt ?? now })
      return { record, created: true }
    })
  }
  async get(id) {
    let text
    try { text = await fs.readFile(this._path(id), 'utf8') } catch (e) {
      if (e.code !== 'ENOENT') throw e
      // Windows can report ENOENT when an intermediate component is a file.
      try {
        const stat = await fs.stat(this.directory)
        if (!stat.isDirectory()) throw fail('ERR_VIDEO_TASK_DIRECTORY', 'Store path is not a directory')
      } catch (directoryError) { if (directoryError.code !== 'ENOENT') throw directoryError }
      return null
    }
    try {
      const record = validate(JSON.parse(text))
      if (record.operationId !== id) throw fail('ERR_VIDEO_TASK_INPUT', 'Identity mismatch')
      return record
    } catch (e) {
      console.warn(`[video-task-store] Corrupt record retained: ${id}`)
      throw fail('ERR_VIDEO_TASK_CORRUPT', `Corrupt task record: ${id}`, e)
    }
  }
  async update(id, patch) {
    this._path(id)
    if (!plain(patch)) throw fail('ERR_VIDEO_TASK_INPUT', 'Patch must be an object')
    for (const k of ['operationId', 'schemaVersion', 'createdAt']) if (k in patch) throw fail('ERR_VIDEO_TASK_INPUT', `Cannot change ${k}`)
    const copy = JSON.parse(canonical(patch))
    return this._writeLocked(async () => {
      const previous = await this.get(id)
      if (!previous) throw fail('ERR_VIDEO_TASK_NOT_FOUND', 'Task does not exist')
      return this._atomic({ ...previous, ...copy, observedAt: copy.observedAt ?? previous.observedAt })
    })
  }
  async _records() {
    let names
    try { names = await fs.readdir(this.directory) } catch (e) { if (e.code === 'ENOENT') return []; throw e }
    const records = []
    for (const name of names.sort()) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -5)
      if (!UUID.test(id)) { console.warn('[video-task-store] Unexpected JSON record retained'); throw fail('ERR_VIDEO_TASK_CORRUPT', 'Invalid task filename') }
      const record = await this.get(id)
      if (!record) throw fail('ERR_VIDEO_TASK_CORRUPT', 'Task disappeared during scan')
      records.push(record)
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.observedAt.localeCompare(a.observedAt) || b.operationId.localeCompare(a.operationId))
  }
  async list({ limit = 50, offset = 0, status } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(offset) || offset < 0 || (status !== undefined && typeof status !== 'string')) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid pagination or status')
    return (await this._records()).filter(r => status === undefined || r.status === status).slice(offset, offset + limit).map(r => {
      const providerId = r.providerSnapshot?.id ?? (typeof r.provider === 'string' ? r.provider : r.provider?.id)
      const summary = typeof providerId === 'string' ? { providerId } : {}
      if (typeof (r.model ?? r.providerSnapshot?.model) === 'string') summary.model = r.model ?? r.providerSnapshot.model
      for (const k of ['operationId', 'schemaVersion', 'createdAt', 'observedAt', 'stage', 'status', 'taskId', 'operation', 'progress', 'lastKnownStatus', 'failedStage']) if (r[k] !== undefined) summary[k] = r[k]
      return summary
    })
  }
  async findByTaskId(taskId) {
    if (typeof taskId !== 'string' || !taskId) throw fail('ERR_VIDEO_TASK_INPUT', 'taskId required')
    const matches = (await this._records()).filter(r => r.taskId === taskId)
    if (matches.length > 1) throw fail('ERR_VIDEO_TASK_AMBIGUOUS', 'Multiple tasks match taskId; use operationId')
    return matches[0] ?? null
  }
  async findByFingerprint(fingerprint) {
    if (typeof fingerprint !== 'string' || !HASH.test(fingerprint)) throw fail('ERR_VIDEO_TASK_INPUT', 'Invalid fingerprint')
    return (await this._records()).find(r => (r.fingerprint ?? r.requestFingerprint) === fingerprint) ?? null
  }
}
