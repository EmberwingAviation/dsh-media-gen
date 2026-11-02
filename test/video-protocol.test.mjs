import test from 'node:test';
import assert from 'node:assert/strict';
import { compileVideoRequest as compile, compileVideoQuery, compileVideoDownload, parseVideoResponse, previewVideoRequest, validateCustomProtocol } from '../lib/video-protocol.js';
const base = { model: 'video-model', baseUrl: 'https://example.test/v1', apiKeyEnv: 'VIDEO_API_KEY', protocol: 'openai-compatible', parameterFormat: 'standard', parameters: {}, capabilities: { t2v: true, i2v: true } };
const input = { prompt: 'A seaside sunset' };
const custom = () => ({ createPath: '/jobs', queryPath: '/jobs/{taskId}', downloadPath: '/jobs/{taskId}/file', auth: { type: 'header', name: 'X-Credential' }, headers: { 'X-Version': '1' }, fixedBody: { mode: 'video' }, fields: { prompt: { path: 'input.prompt' }, model: { path: 'model' }, duration: { path: 'args.seconds', type: 'string' }, generateAudio: { path: 'args.audio', type: 'boolean' }, sourceUrl: { path: 'images[0].url' } }, response: { taskId: 'result.id', status: 'result.status', progress: 'result.progress', url: 'result.items[0].url', errorCode: 'error.code', errorMessage: 'error.message', requestId: 'request_id' }, states: { queued: ['wait'], running: ['work'], completed: ['done'], failed: ['bad'], cancelled: ['stop'] } });
const customActive = c => ({ ...base, protocol: 'custom-json', providerConfig: { protocolDefaults: { custom: c ?? custom() } } });
test('standard request is pure and contains credential reference only', () => {
  const active = { ...base, parameters: { duration: 8, size: '1280x720', seed: 0 } }; const before = JSON.stringify(active);
  assert.deepEqual(compile(active, input).body, { model: base.model, prompt: input.prompt, seconds: '8', size: '1280x720', seed: 0 });
  assert.equal(JSON.stringify(active), before); assert.deepEqual(compile(active, input).auth, { type: 'bearer', credentialRef: 'VIDEO_API_KEY' });
  assert.equal(compile(active, input).headers.authorization, undefined);
});
test('Wan compatible accepts ratio or resolution, bounds duration', () => {
  for (const size of ['16:9', '720p', '1080p']) assert.equal(compile({ ...base, parameterFormat: 'wan', parameters: { duration: 30, size } }, input).body.size, /^\d+p$/.test(size) ? size.toUpperCase() : size);
  for (const parameters of [{ duration: 1 }, { duration: 31 }, { duration: 2.5 }, { duration: '5' }, { size: '1280*720' }, { aspectRatio: '16:9', resolution: '720p' }]) assert.throws(() => compile({ ...base, parameterFormat: 'wan', parameters }, input));
});
test('Seedance compatible uses numeric duration, lowercase size and metadata', () => {
  assert.deepEqual(compile({ ...base, parameterFormat: 'seedance', parameters: { duration: 5, resolution: '1080P', aspectRatio: '16:9', generateAudio: false } }, input).body, { model: base.model, prompt: input.prompt, duration: 5, size: '1080p', metadata: { ratio: '16:9', generate_audio: false } });
  assert.throws(() => compile({ ...base, model: 'seedance-2-5', parameterFormat: 'seedance', parameters: { resolution: '4k' } }, input), /4k/);
});
test('native DashScope maps parameters, input and response', () => {
  const active = { ...base, protocol: 'dashscope', model: 'wan3.0-i2v', parameters: { duration: 5, aspectRatio: '16:9', resolution: '720p', generateAudio: false, seed: 0 } };
  const request = compile(active, { ...input, operation: 'i2v', sourceUrl: 'https://images.test/a.png' });
  assert.equal(request.url, 'https://example.test/v1/services/aigc/video-generation/video-synthesis');
  assert.deepEqual(request.body.input.media, [{ type: 'first_frame', url: 'https://images.test/a.png' }]);
  assert.deepEqual(request.body.parameters, { duration: 5, seed: 0, resolution: '720P', ratio: '16:9', audio: false });
  assert.deepEqual(parseVideoResponse(active, { output: { task_id: 'abc', task_status: 'SUCCEEDED', results: [{ url: 'https://video.test/a.mp4' }] } }), { taskId: 'abc', status: 'completed', url: 'https://video.test/a.mp4' });
  assert.equal(compileVideoDownload(active, 'abc'), null);
});
test('legacy DashScope uses img_url and never silently drops parameters', () => {
  const active = { ...base, protocol: 'dashscope', model: 'wan2.2-i2v-plus', parameters: { size: '1280*720', duration: 5 } };
  const body = compile(active, { ...input, operation: 'i2v', sourceUrl: 'https://image.test/a' }).body;
  assert.deepEqual(body.input, { prompt: input.prompt, img_url: 'https://image.test/a' });
  assert.deepEqual(body.parameters, { size: '1280*720', duration: 5 });
  assert.deepEqual(compile(active, input).body.input, { prompt: input.prompt });
  for (const parameters of [{ resolution: '720p' }, { aspectRatio: '16:9' }, { generateAudio: false }, { seed: 0 }]) assert.throws(() => compile({ ...active, parameters }, input), /legacy DashScope/);
});
test('native Volcengine uses typed body and content', () => {
  const active = { ...base, protocol: 'volcengine', parameters: { duration: 5, resolution: '720p', aspectRatio: '16:9', generateAudio: true } };
  const request = compile(active, input); assert.equal(request.body.duration, 5); assert.equal(request.body.generate_audio, true); assert.equal(request.body.content[0].text, input.prompt);
  assert.equal(parseVideoResponse(active, { status: 'succeeded', content: { video_url: 'https://video.test/a' } }).status, 'completed');
});
test('custom conversion, array paths, enum map and no mutation', () => {
  const c = custom(); c.fields.duration.map = { 5: 10 }; const snapshot = JSON.stringify(c);
  const active = { ...customActive(c), parameters: { duration: 5, generateAudio: false } };
  const request = compile(active, { ...input, operation: 'i2v', sourceUrl: 'https://image.test/a' });
  assert.deepEqual(request.body.args, { seconds: '10', audio: false }); assert.deepEqual(request.body.images, [{ url: 'https://image.test/a' }]); assert.equal(snapshot, JSON.stringify(c));
  assert.deepEqual(parseVideoResponse(active, { result: { id: 't', status: 'work', progress: '25', items: [{ url: 'https://video.test/a' }] } }), { taskId: 't', status: 'in_progress', progress: 25, url: 'https://video.test/a' });
});
test('custom integer and boolean conversions are strict', () => {
  for (const [type, map, expected] of [['integer', { 5: '12' }, 12], ['boolean', { 5: 'false' }, false]]) { const c = custom(); c.fields.duration = { path: 'seconds', type, map }; assert.equal(compile({ ...customActive(c), parameters: { duration: 5 } }, input).body.seconds, expected); }
  for (const [type, map] of [['integer', { 5: '1.2' }], ['boolean', { 5: '0' }], ['string', { 6: 'six' }]]) { const c = custom(); c.fields.duration = { path: 'seconds', type, map }; assert.throws(() => compile({ ...customActive(c), parameters: { duration: 5 } }, input)); }
});
test('query paths encode task IDs and retain base path', () => {
  assert.equal(compileVideoQuery(base, 'a/b?x=#').url, 'https://example.test/v1/videos/a%2Fb%3Fx%3D%23');
  assert.equal(compileVideoDownload(base, 'abc').url, 'https://example.test/v1/videos/abc/content');
  for (const id of ['', '.', '..', null]) assert.throws(() => compileVideoQuery(base, id));
});
test('custom rejects unsafe paths and credentials', () => {
  for (const path of ['https://evil.test', '//evil.test', '../jobs', '/a/%2e%2e/x', '/a/%252e/x', '/a\\x', '/a?key=x', '/{evil}', '/x\r\ny']) { const c = custom(); c.createPath = path; assert.throws(() => validateCustomProtocol(c), path); }
  for (const headers of [{ Authorization: 'secret' }, { 'X-Credential': 'secret' }, { 'x-api-key': 'secret' }, { Test: 'x\r\nInjected: yes' }, { 'bad name': 'x' }]) { const c = custom(); c.headers = headers; assert.throws(() => validateCustomProtocol(c)); }
  for (const url of ['https://u:p@example.test/v1', 'https://example.test/?key=secret', 'file:///tmp']) assert.throws(() => compile({ ...base, baseUrl: url }, input));
});
test('custom rejects prototype pollution, parent conflicts and fixedBody conflicts', () => {
  for (const path of ['__proto__.x', 'a.constructor.x', 'a.prototype', 'a[99999]', 'a..x']) { const c = custom(); c.fields.prompt.path = path; assert.throws(() => validateCustomProtocol(c)); }
  const c = custom(); c.fields.duration.path = 'input'; assert.throws(() => validateCustomProtocol(c), /conflicting/);
  const fixed = custom(); fixed.fixedBody = { input: { prompt: 'fixed' } }; assert.throws(() => validateCustomProtocol(fixed), /standard input/);
  const polluted = custom(); polluted.fixedBody = JSON.parse('{"__proto__":{"polluted":true}}'); assert.throws(() => validateCustomProtocol(polluted)); assert.equal({}.polluted, undefined);
});
test('custom rejects invalid states, fields and unmapped parameters', () => {
  const c = custom(); c.states.failed = ['DONE']; assert.throws(() => validateCustomProtocol(c), /conflicting states/);
  const c2 = custom(); c2.fields.unknown = { path: 'unknown' }; assert.throws(() => validateCustomProtocol(c2));
  assert.throws(() => compile({ ...customActive(), parameters: { seed: 3 } }, input), /mapping missing/);
});
test('capabilities, image source, overrides and Google are explicit', () => {
  assert.throws(() => compile({ ...base, protocol: 'google' }, input), /existing-adapter/);
  assert.throws(() => compile({ ...base, capabilities: { t2v: false } }, input));
  assert.throws(() => compile(base, { ...input, parameters: { duration: 8 } }), /overrides/);
  for (const sourceUrl of ['data:image/png;base64,abc', 'file:///tmp/a', 'https://u:p@test/a']) assert.throws(() => compile(base, { ...input, operation: 'i2v', sourceUrl }));
  assert.throws(() => compile({ ...customActive(), capabilities: {} }, { ...input, operation: 'i2v', sourceUrl: 'https://image.test/a' }));
  const c = custom(); delete c.fields.sourceUrl; assert.throws(() => compile(customActive(c), { ...input, operation: 'i2v', sourceUrl: 'https://image.test/a' }));
});
test('response normalization handles unknown statuses, invalid urls and progress', () => {
  assert.deepEqual(parseVideoResponse(base, { task_id: 't', status: 'something', progress: 200, url: 'javascript:alert(1)' }), { taskId: 't', status: 'unknown' });
  for (const [status, expected] of [['pending', 'queued'], ['processing', 'in_progress'], ['failed', 'failed'], ['canceled', 'cancelled']]) assert.equal(parseVideoResponse(base, { status }).status, expected);
});
test('preview masks sensitive values without credential resolution', () => {
  const result = previewVideoRequest(customActive(), { ...input, operation: 'i2v', sourceUrl: 'https://image.test/a?signature=secret' });
  assert.equal(result.body.images[0].url, 'https://image.test/a'); assert.equal(result.auth.credentialRef, 'VIDEO_API_KEY');
  assert.ok(!JSON.stringify(result).includes('signature=secret'));
});
test('custom requires recoverable task contract and forbids fixed secrets or standard parameters', () => {
  for (const mutate of [c => delete c.queryPath, c => c.queryPath = '/jobs', c => delete c.response.taskId, c => delete c.response.status, c => c.states.completed = [], c => delete c.states.failed]) { const c = custom(); mutate(c); assert.throws(() => validateCustomProtocol(c)); }
  for (const key of ['apiKey', 'access_token', 'password', 'auth', 'key', 'duration', 'seconds', 'generateAudio']) { const c = custom(); c.fixedBody = { nested: { [key]: 'fixed' } }; assert.throws(() => validateCustomProtocol(c)); }
  for (const name of ['Host', 'Content-Length', 'Connection', 'Transfer-Encoding']) { const c = custom(); c.auth.name = name; assert.throws(() => validateCustomProtocol(c)); }
});
test('task ids are nonempty strings, trimmed and fallback when id is blank', () => {
  assert.equal(parseVideoResponse(base, { id: '  ', task_id: ' valid ' }).taskId, 'valid');
  for (const id of ['', '  ', 12, '..', '.', {}]) assert.equal(parseVideoResponse(base, { id }).taskId, undefined);
  assert.equal(parseVideoResponse({ ...base, protocol: 'dashscope' }, { output: { task_status: 'UNKNOWN' } }).status, 'unknown');
});
test('image data support is protocol scoped and strictly typed', () => {
  const sourceUrl = 'data:image/png;base64,YQ==';
  for (const protocol of ['openai-compatible', 'dashscope', 'volcengine']) assert.doesNotThrow(() => compile({ ...base, protocol }, { ...input, operation: 'i2v', sourceUrl }));
  for (const active of [customActive(), { ...base, parameterFormat: 'seedance' }, { ...base, parameterFormat: 'wan' }]) assert.throws(() => compile(active, { ...input, operation: 'i2v', sourceUrl }));
  assert.throws(() => compile({ ...base, parameterFormat: 'wan' }, { ...input, operation: 'i2v', sourceUrl: 'https://image.test/a' }));
  for (const sourceUrl of ['data:text/html;base64,YQ==', 'data:image/svg+xml;base64,YQ==', 'data:image/png;base64,', 'data:image/png;base64,YQ=', 'data:image/png;base64,Y Q==']) assert.throws(() => compile(base, { ...input, operation: 'i2v', sourceUrl }));
});
test('Wan supported dimensions are constrained and uppercase resolutions', () => {
  for (const size of ['480p', '720P', '1080p', 'adaptive', '16:9', '9:16', '1:1', '4:3', '3:4']) assert.doesNotThrow(() => compile({ ...base, parameterFormat: 'wan', parameters: { size } }, input));
  for (const size of ['4k', '100:3', '0:0']) assert.throws(() => compile({ ...base, parameterFormat: 'wan', parameters: { size } }, input));
  assert.equal(compile({ ...base, parameterFormat: 'wan', parameters: { resolution: '720p' } }, input).body.size, '720P');
});
