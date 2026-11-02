import { setTimeout as delay } from 'node:timers/promises'

/** Apply a credential only to the configured origin. Secrets never enter logs. */
export function authorizedVideoRequest(spec, credential) {
  const url = new URL(spec.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid video endpoint')
  const headers = { ...(spec.headers ?? {}) }
  const auth = spec.auth ?? { type: 'bearer' }
  if (credential) {
    if (auth.type === 'query') url.searchParams.set(auth.name, credential)
    else if (auth.type === 'header') headers[auth.name] = credential
    else if (auth.type === 'bearer') headers.authorization = `Bearer ${credential}`
    else throw new Error('Unsupported video authentication')
  }
  return { url: url.href, headers }
}

export function redactVideoError(error, secret) {
  let text = String(error?.message ?? error ?? 'Video request failed')
  if (secret) {
    const encoded = new URLSearchParams({ value: secret }).toString().slice(6)
    for (const form of [...new Set([secret, encodeURIComponent(secret), encoded])].sort((a,b) => b.length-a.length)) text = text.split(form).join('[REDACTED]')
  }
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/([?&](?:key|api_key|token|access_token)=)[^&\s]+/gi, '$1[REDACTED]').slice(0, 1200)
}

export async function readBoundedResponse(response, maxBytes = 1024 * 1024) {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) { await response.body?.cancel(); throw new Error('Video response exceeds size limit') }
  const chunks = []; let total = 0
  if (response.body) for await (const chunk of response.body) {
    total += chunk.byteLength
    if (total > maxBytes) throw new Error('Video response exceeds size limit')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/** POST is deliberately never retried. GET retries are bounded and >=60s. */
export async function requestVideoJson(spec, { credential, signal, fetchImpl = fetch, sleep = delay, maxRetries = 2 } = {}) {
  const { url, headers } = authorizedVideoRequest(spec, credential)
  const method = spec.method ?? 'GET'
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetchImpl(url, { method, headers, redirect: 'error', signal, ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }) })
      const requestId = response.headers.get('x-oneapi-request-id') ?? response.headers.get('x-request-id') ?? undefined
      const bytes = await readBoundedResponse(response)
      let payload
      try { payload = JSON.parse(bytes.toString('utf8')) } catch { throw Object.assign(new Error(`Video endpoint returned invalid JSON (HTTP ${response.status})`), { status: response.status, requestId }) }
      if (!response.ok) {
        const message = payload?.error?.message ?? payload?.message ?? `Video HTTP ${response.status}`
        const error = Object.assign(new Error(redactVideoError(message, credential)), { status: response.status, requestId, code: String(payload?.error?.code ?? payload?.code ?? '') })
        throw error
      }
      return { payload, requestId }
    } catch (error) {
      if (signal?.aborted || method !== 'GET' || attempt >= maxRetries || (error.status && error.status !== 429 && error.status < 500)) throw error
      await sleep(60000 * 2 ** attempt, undefined, { signal })
    }
  }
}

/** Follow public result redirects without ever forwarding supplier credentials. */
export async function downloadVideoBytes(url, { credential, auth, headers = {}, trustedOrigin, signal, maxBytes = 200 * 1024 * 1024, fetchImpl = fetch } = {}) {
  let target = new URL(url)
  for (let count = 0; count < 5; count++) {
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid video download URL')
    const trusted = trustedOrigin && target.origin === new URL(trustedOrigin).origin
    const request = trusted ? authorizedVideoRequest({ url: target.href, auth, headers }, credential) : { url: target.href, headers: {} }
    const response = await fetchImpl(request.url, { headers: request.headers, redirect: 'manual', signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel()
      if (!location) throw new Error('Video redirect has no location')
      target = new URL(location, target)
      // Never propagate query-string credentials across redirects either.
      if (auth?.type === 'query' && auth.name) target.searchParams.delete(auth.name)
      continue
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Video download HTTP ${response.status}`) }
    return { data: await readBoundedResponse(response, maxBytes), mediaType: (response.headers.get('content-type') ?? 'video/mp4').split(';')[0], sourceUrl: url }
  }
  throw new Error('Too many video download redirects')
}
