/** Pure video protocol compiler. No network, credentials lookup, or runtime services. */
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const INPUT_FIELDS = new Set(['model', 'prompt', 'duration', 'resolution', 'aspectRatio', 'generateAudio', 'seed', 'size', 'sourceUrl']);
const OUTPUT_FIELDS = new Set(['taskId', 'status', 'progress', 'url', 'errorCode', 'errorMessage', 'requestId']);
const STATES = { queued: ['queued', 'pending'], running: ['running', 'in_progress', 'processing'], completed: ['completed', 'succeeded'], failed: ['failed', 'error'], cancelled: ['cancelled', 'canceled'] };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function fail(message) { throw new Error(`Video protocol: ${message}`); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function jsonCopy(value, depth = 0) {
  if (depth > 32) fail('JSON nesting exceeds 32');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map(v => jsonCopy(v, depth + 1));
  if (!plain(value)) fail('only JSON values are supported');
  const out = {};
  for (const [key, v] of Object.entries(value)) { if (BAD_KEYS.has(key)) fail('unsafe JSON key'); out[key] = jsonCopy(v, depth + 1); }
  return out;
}
function tokens(path) {
  if (typeof path !== 'string' || path.length > 512 || !/^[A-Za-z_][\w-]*(?:(?:\.[A-Za-z_][\w-]*)|(?:\[(?:0|[1-9]\d{0,3})\]))*$/.test(path)) fail('invalid field path');
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  if (parts.some(x => BAD_KEYS.has(x))) fail('unsafe field path');
  return parts;
}
function getPath(obj, path) { let current = obj; for (const key of tokens(path)) { if (current === null || typeof current !== 'object' || !own(current, key)) return undefined; current = current[key]; } return current; }
function setPath(obj, path, value) {
  const parts = tokens(path); let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i], array = /^\d+$/.test(parts[i + 1]);
    if (!own(current, key)) current[key] = array ? [] : {};
    if (current[key] === null || typeof current[key] !== 'object' || Array.isArray(current[key]) !== array) fail('field conflicts with fixedBody');
    current = current[key];
  }
  if (own(current, parts.at(-1))) fail('field conflicts with fixedBody');
  current[parts.at(-1)] = value;
}
function checkPath(path, task = false) {
  if (typeof path !== 'string' || !path || /[\\?#\s\u0000-\u001f\u007f]/.test(path) || path.startsWith('//') || /^[a-z][\w+.-]*:/i.test(path)) fail('expected same-origin relative path');
  const probe = path.replaceAll('{taskId}', 'task');
  if (/[{}]/.test(probe) || (!task && path.includes('{taskId}'))) fail('invalid path placeholder');
  for (const segment of probe.split('/')) { let decoded; try { decoded = decodeURIComponent(segment); } catch { fail('invalid path encoding'); } if (decoded === '.' || decoded === '..' || /[\\/%?#\u0000-\u001f\u007f]/.test(decoded)) fail('unsafe relative path'); }
  return path;
}
function baseUrl(active) {
  let url; try { url = new URL(active.baseUrl); } catch { fail('invalid baseUrl'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail('baseUrl must be HTTP(S) without credentials, query or fragment');
  return url.href.replace(/\/+$/, '');
}
function endpoint(active, path, taskId) {
  checkPath(path, taskId !== undefined);
  if (taskId !== undefined) {
    if (typeof taskId !== 'string' || !taskId.trim() || taskId === '.' || taskId === '..') fail('invalid taskId');
    path = path.replaceAll('{taskId}', encodeURIComponent(taskId));
  }
  return `${baseUrl(active)}/${path.replace(/^\/+/, '')}`;
}
function checkHeaders(headers = {}, auth = {}) {
  if (!plain(headers)) fail('headers must be an object');
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) fail('invalid header');
    if (/^(authorization|proxy-authorization|cookie|set-cookie|host|content-length|connection|x-api-key|api-key)$/i.test(name) || (auth.name && name.toLowerCase() === auth.name.toLowerCase())) fail('fixed credential or transport header forbidden');
  }
}
export function validateCustomProtocol(custom) {
  const c = jsonCopy(custom);
  if (!plain(c)) fail('custom protocol must be an object');
  checkPath(c.createPath);
  if (!c.queryPath || !c.queryPath.includes('{taskId}')) fail('custom queryPath with taskId required');
  checkPath(c.queryPath, true);
  if (c.downloadPath !== undefined) checkPath(c.downloadPath, true);
  if (!plain(c.auth) || !['bearer', 'header', 'query'].includes(c.auth.type)) fail('invalid auth type');
  if (Object.keys(c.auth).some(k => !['type', 'name'].includes(k))) fail('auth accepts type/name only; credentials must use apiKeyEnv');
  if (c.auth.type !== 'bearer' && (typeof c.auth.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(c.auth.name) || BAD_KEYS.has(c.auth.name))) fail('invalid auth name');
  if (c.auth.type === 'header' && /^(host|content-length|connection|transfer-encoding|trailer|upgrade|te|proxy-authorization|cookie|set-cookie)$/i.test(c.auth.name)) fail('transport header cannot carry credentials');
  checkHeaders(c.headers, c.auth);
  if (c.fixedBody !== undefined && !plain(c.fixedBody)) fail('fixedBody must be an object');
  const checkSecrets = value => { if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { if (/authorization|cookie|api.?key|token|secret|password|credential|^key$|^auth$/i.test(key)) fail('fixedBody secret fields forbidden'); if (INPUT_FIELDS.has(key) || ['seconds', 'ratio', 'audio', 'generate_audio', 'input_reference'].includes(key)) fail('fixedBody cannot fix standard input parameters; use parameter defaults'); checkSecrets(child); } };
  checkSecrets(c.fixedBody);
  if (!plain(c.fields) || !c.fields.prompt) fail('custom prompt field required');
  const paths = [];
  for (const [name, field] of Object.entries(c.fields)) {
    if (!INPUT_FIELDS.has(name) || !plain(field)) fail('unknown custom input field');
    const path = tokens(field.path).join('.');
    if (paths.some(p => p === path || p.startsWith(path + '.') || path.startsWith(p + '.'))) fail('conflicting field paths');
    paths.push(path);
    if (field.type !== undefined && !['string', 'integer', 'boolean'].includes(field.type)) fail('invalid field conversion');
    if (field.map !== undefined && (!plain(field.map) || Object.values(field.map).some(v => v !== null && !['string', 'number', 'boolean'].includes(typeof v)))) fail('invalid enum map');
  }
  const probe = jsonCopy(c.fixedBody ?? {});
  for (const field of Object.values(c.fields)) setPath(probe, field.path, null);
  if (!plain(c.response) || !c.response.taskId || !c.response.status) fail('response taskId/status mappings required');
  for (const [name, path] of Object.entries(c.response)) { if (!OUTPUT_FIELDS.has(name)) fail('unknown response field'); tokens(path); }
  if (!plain(c.states) || !c.states.completed?.length || !c.states.failed?.length) fail('completed/failed states required');
  const seen = new Set();
  for (const [state, values] of Object.entries(c.states)) {
    if (!own(STATES, state) || !Array.isArray(values) || values.some(v => typeof v !== 'string' || !v)) fail('invalid states');
    for (const value of values) { const key = value.toLowerCase(); if (seen.has(key)) fail('conflicting states'); seen.add(key); }
  }
  return c;
}
function convert(value, field) {
  if (field.map) { if (!own(field.map, String(value))) fail('value missing from enum map'); value = field.map[String(value)]; }
  if (!field.type) return jsonCopy(value);
  if (field.type === 'string') { if (value !== null && ['string', 'number', 'boolean'].includes(typeof value)) return String(value); fail('cannot convert to string'); }
  if (field.type === 'integer') { if ((typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value))) && Number.isSafeInteger(Number(value))) return Number(value); fail('cannot convert to integer'); }
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  fail('cannot convert to boolean');
}
function definition(active) {
  switch (active.protocol) {
    case 'custom-json': return validateCustomProtocol(active.providerConfig?.protocolDefaults?.custom);
    case 'google': fail('google requires existing-adapter'); break;
    case 'openai-compatible': return { createPath: '/videos', queryPath: '/videos/{taskId}', downloadPath: '/videos/{taskId}/content', auth: { type: 'bearer' }, response: { taskId: 'id', status: 'status', progress: 'progress', url: 'url', errorCode: 'error.code', errorMessage: 'error.message', requestId: 'request_id' }, states: STATES };
    case 'dashscope': return { createPath: '/services/aigc/video-generation/video-synthesis', queryPath: '/tasks/{taskId}', auth: { type: 'bearer' }, headers: { 'X-DashScope-Async': 'enable' }, response: { taskId: 'output.task_id', status: 'output.task_status', url: 'output.video_url', errorCode: 'output.code', errorMessage: 'output.message', requestId: 'request_id' }, states: { queued: ['PENDING'], running: ['RUNNING'], completed: ['SUCCEEDED'], failed: ['FAILED'], cancelled: ['CANCELED', 'CANCELLED'] } };
    case 'volcengine': return { createPath: '/contents/generations/tasks', queryPath: '/contents/generations/tasks/{taskId}', auth: { type: 'bearer' }, response: { taskId: 'id', status: 'status', url: 'content.video_url', errorCode: 'error.code', errorMessage: 'error.message', requestId: 'request_id' }, states: STATES };
    default: fail('unsupported protocol');
  }
}
function descriptor(active, d, path, method, taskId) {
  if (typeof active.apiKeyEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(active.apiKeyEnv)) fail('invalid credential reference');
  return { url: endpoint(active, path, taskId), method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(d.headers ?? {}) }, auth: { ...d.auth, credentialRef: active.apiKeyEnv }, response: jsonCopy(d.response), states: jsonCopy(d.states), queryPath: d.queryPath ?? null, downloadPath: d.downloadPath ?? null };
}
function validateParams(active) {
  const p = jsonCopy(active.parameters ?? {});
  if (!plain(p)) fail('parameters must be an object');
  for (const name of Object.keys(p)) if (!INPUT_FIELDS.has(name) || ['model', 'prompt', 'sourceUrl'].includes(name)) fail(`unsupported parameter ${name}`);
  if (p.duration !== undefined && (!Number.isInteger(p.duration) || p.duration < 2 || p.duration > 30)) fail('duration must be integer 2..30');
  if (p.seed !== undefined && !Number.isSafeInteger(p.seed)) fail('seed must be an integer');
  if (p.generateAudio !== undefined && typeof p.generateAudio !== 'boolean') fail('generateAudio must be boolean');
  for (const k of ['size', 'resolution', 'aspectRatio']) if (p[k] !== undefined && (typeof p[k] !== 'string' || !p[k])) fail(`${k} must be a string`);
  if (p.aspectRatio && !/^\d+:\d+$/.test(p.aspectRatio) && p.aspectRatio !== 'adaptive') fail('invalid aspectRatio');
  if (p.resolution) p.resolution = p.resolution.toLowerCase();
  if (p.resolution && !/^(480p|720p|1080p|4k)$/.test(p.resolution)) fail('invalid resolution');
  if (p.size && (p.resolution || p.aspectRatio)) fail('size conflicts with resolution/aspectRatio');
  return p;
}
/** Call overrides must already have been resolved into active.parameters. */
export function compileVideoRequest(active, { prompt, operation = 't2v', sourceUrl, parameters } = {}) {
  if (parameters && Object.keys(parameters).length) fail('resolve call overrides before compilation');
  if (typeof prompt !== 'string' || !prompt.trim()) fail('prompt required');
  if (!['t2v', 'i2v'].includes(operation)) fail('unsupported operation');
  if (active.capabilities?.[operation] === false) fail(`model does not support ${operation}`);
  const d = definition(active), p = validateParams(active);
  if (operation === 'i2v') {
    if (!sourceUrl || typeof sourceUrl !== 'string') fail('sourceUrl required');
    if (active.protocol === 'openai-compatible' && active.parameterFormat === 'wan') fail('Wan compatible i2v is not supported');
    let source; try { source = new URL(sourceUrl); } catch { fail('invalid sourceUrl'); }
    const supportsData = ['dashscope', 'volcengine'].includes(active.protocol) || (active.protocol === 'openai-compatible' && (!active.parameterFormat || active.parameterFormat === 'standard'));
    const validData = /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(sourceUrl) && sourceUrl.split(',')[1]?.length > 0;
    if (source.protocol === 'data:' ? !(supportsData && validData) : (!['https:', 'http:'].includes(source.protocol) || source.username || source.password)) fail('unsupported sourceUrl or invalid image data URI');
    if (active.protocol === 'custom-json' && (active.capabilities?.i2v !== true || !d.fields.sourceUrl)) fail('custom i2v capability and sourceUrl mapping required');
  } else if (sourceUrl !== undefined) fail('sourceUrl requires i2v');
  let body;
  if (active.protocol === 'custom-json') {
    body = jsonCopy(d.fixedBody ?? {});
    for (const [name, value] of Object.entries({ ...p, model: active.model, prompt, ...(operation === 'i2v' ? { sourceUrl } : {}) })) {
      if (value === undefined) continue;
      if (!d.fields[name]) { if (name === 'model') continue; fail(`custom mapping missing for ${name}`); }
      setPath(body, d.fields[name].path, convert(value, d.fields[name]));
    }
  } else if (active.protocol === 'openai-compatible') {
    body = { model: active.model, prompt };
    const format = active.parameterFormat ?? 'standard';
    if (!['standard', 'wan', 'seedance'].includes(format)) fail('unsupported parameterFormat');
    if (format === 'seedance') {
      if (p.duration !== undefined) body.duration = p.duration;
      const size = p.size?.toLowerCase() ?? p.resolution;
      if (size && !/^(480p|720p|1080p|4k)$/.test(size)) fail('Seedance size must be resolution');
      if (/2[.-]5/.test(active.model) && size === '4k') fail('Seedance 2.5 does not support 4k');
      if (size) body.size = size;
      if (p.aspectRatio !== undefined || p.generateAudio !== undefined) body.metadata = { ...(p.aspectRatio !== undefined ? { ratio: p.aspectRatio } : {}), ...(p.generateAudio !== undefined ? { generate_audio: p.generateAudio } : {}) };
    } else {
      if (p.duration !== undefined) body.seconds = String(p.duration);
      if (p.generateAudio !== undefined) fail('audio unsupported by this compatible parameter format');
      if (p.resolution && p.aspectRatio) fail('compatible size can encode ratio OR resolution, not both');
      const size = p.size ?? p.resolution ?? p.aspectRatio;
      if (format === 'wan' && size && !/^(adaptive|16:9|9:16|1:1|4:3|3:4|480p|720p|1080p)$/i.test(size)) fail('Wan size must be a supported ratio or resolution');
      if (size) body.size = format === 'wan' && /^\d+p$/i.test(size) ? size.toUpperCase() : size;
    }
    if (p.seed !== undefined) body.seed = p.seed;
    if (operation === 'i2v') body.input_reference = sourceUrl;
  } else if (active.protocol === 'dashscope') {
    const params = {};
    const wan3 = /^wan(?:x)?[-_.]?3(?:[.\-_]|$)/i.test(active.model);
    if (!wan3 && ['resolution', 'aspectRatio', 'generateAudio', 'seed'].some(key => p[key] !== undefined)) fail('legacy DashScope supports size/duration only; omit unsupported parameters explicitly');
    for (const k of ['duration', 'seed', 'size']) if (p[k] !== undefined) params[k] = p[k];
    if (p.resolution !== undefined) params.resolution = p.resolution.toUpperCase();
    if (p.aspectRatio !== undefined) params.ratio = p.aspectRatio;
    if (p.generateAudio !== undefined) params.audio = p.generateAudio;
    const imageInput = wan3 ? { media: [{ type: 'first_frame', url: sourceUrl }] } : { img_url: sourceUrl };
    body = { model: active.model, input: { prompt, ...(operation === 'i2v' ? imageInput : {}) }, parameters: params };
  } else {
    body = { model: active.model, content: [{ type: 'text', text: prompt }, ...(operation === 'i2v' ? [{ type: 'image_url', image_url: { url: sourceUrl }, role: 'first_frame' }] : [])] };
    if (p.duration !== undefined) body.duration = p.duration;
    if (p.seed !== undefined) body.seed = p.seed;
    if (p.resolution !== undefined) body.resolution = p.resolution;
    if (p.aspectRatio !== undefined) body.ratio = p.aspectRatio;
    if (p.size !== undefined) { if (/^\d+:\d+$/.test(p.size)) body.ratio = p.size; else if (/^(480p|720p|1080p|4k)$/i.test(p.size)) body.resolution = p.size.toLowerCase(); else fail('invalid Volcengine size'); }
    if (p.generateAudio !== undefined) body.generate_audio = p.generateAudio;
    if (/2[.-]5/.test(active.model) && body.resolution === '4k') fail('Seedance 2.5 does not support 4k');
  }
  return { ...descriptor(active, d, d.createPath, 'POST'), body };
}
export function compileVideoQuery(active, taskId) { const d = definition(active); if (!d.queryPath) fail('queryPath not configured'); return descriptor(active, d, d.queryPath, 'GET', taskId); }
export function compileVideoDownload(active, taskId) { const d = definition(active); return d.downloadPath ? descriptor(active, d, d.downloadPath, 'GET', taskId) : null; }
export function parseVideoResponse(active, payload) {
  const d = definition(active); const result = {};
  if (!plain(payload)) fail('response must be a JSON object');
  for (const [name, path] of Object.entries(d.response)) { const value = getPath(payload, path); if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) result[name] = value; }
  const normalizedId = value => typeof value === 'string' && value.trim() && !['.', '..'].includes(value.trim()) ? value.trim() : undefined;
  result.taskId = normalizedId(result.taskId);
  if (active.protocol === 'openai-compatible') { result.taskId ??= normalizedId(payload.task_id); result.url ??= payload.video_url ?? payload.metadata?.video_url; }
  if (result.taskId === undefined) delete result.taskId;
  if (active.protocol === 'dashscope') { result.url ??= payload.output?.results?.[0]?.url; result.errorCode ??= payload.code; result.errorMessage ??= payload.message; }
  for (const key of Object.keys(result)) if (!['string', 'number'].includes(typeof result[key])) delete result[key];
  const raw = String(result.status ?? '').toLowerCase(); result.status = 'unknown';
  for (const [state, values] of Object.entries(d.states)) if (values.some(v => v.toLowerCase() === raw)) { result.status = state === 'running' ? 'in_progress' : state; break; }
  if (result.progress !== undefined) { const value = Number(result.progress); if (Number.isFinite(value) && value >= 0 && value <= 100) result.progress = value; else delete result.progress; }
  if (result.url !== undefined) { try { const url = new URL(result.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) delete result.url; } catch { delete result.url; } }
  return result;
}
/** Sanitized preview: never resolves credentials; masks potentially sensitive custom values and source URLs. */
export function previewVideoRequest(active, input) {
  const request = compileVideoRequest(active, input);
  const redact = (value, key = '') => {
    if (/authorization|cookie|api.?key|token|secret|password|credential/i.test(key)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map(v => redact(v));
    if (plain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) { try { const url = new URL(value); url.search = ''; url.hash = ''; return url.href; } catch { return '[REDACTED URL]'; } }
    return value;
  };
  const result = redact(request);
  result.auth = { ...request.auth, credentialRef: request.auth.credentialRef };
  return result;
}
