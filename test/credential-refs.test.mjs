import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCredentialRefs, missingCredentialMessage } from '../lib/credential-refs.js'

test('凭据名解析：顶层键形状', () => {
  const text = [
    'version: 1',
    'GPT_API_KEY: sk-xxx',
    'QWEN_TOB_API_KEY: yyy',
    'IMAGE_GEN_GPT_API_KEY: zzz',
  ].join('\n')
  assert.deepEqual(parseCredentialRefs(text), ['GPT_API_KEY', 'IMAGE_GEN_GPT_API_KEY', 'QWEN_TOB_API_KEY'])
})

test('凭据名解析：refs 缩进段形状', () => {
  const text = [
    'version: 1',
    'refs:',
    '  QWEN_TOB_API_KEY: yyy',
    '  DASHSCOPE_API_KEY: aaa',
    'kind: local',
  ].join('\n')
  assert.deepEqual(parseCredentialRefs(text), ['DASHSCOPE_API_KEY', 'QWEN_TOB_API_KEY'])
})

test('凭据名解析：refs 内联对象形状与去重', () => {
  const text = 'version: 1\nrefs: { A_KEY: v1, B_KEY: v2 }\nA_KEY: v3\n'
  assert.deepEqual(parseCredentialRefs(text), ['A_KEY', 'B_KEY'])
})

test('凭据名解析：忽略注释、空行与 meta 键', () => {
  const text = '# comment\n\nversion: 1\nkind: local\n\nREAL_KEY: v\n'
  assert.deepEqual(parseCredentialRefs(text), ['REAL_KEY'])
})

test('凭据名解析：空/异常输入返回空数组', () => {
  assert.deepEqual(parseCredentialRefs(''), [])
  assert.deepEqual(parseCredentialRefs(undefined), [])
  assert.deepEqual(parseCredentialRefs(null), [])
})

test('缺凭据报错：列出可用 ref', () => {
  const msg = missingCredentialMessage('DASHSCOPE_API_KEY', ['QWEN_TOB_API_KEY', 'GPT_API_KEY'])
  assert.match(msg, /no API key stored for "DASHSCOPE_API_KEY"/)
  assert.match(msg, /QWEN_TOB_API_KEY/)
  assert.match(msg, /GPT_API_KEY/)
})

test('缺凭据报错：没有可用 ref 时给出新建指引', () => {
  const msg = missingCredentialMessage('X', [])
  assert.match(msg, /no entries yet/)
  assert.match(msg, /Settings/)
})

test('缺凭据报错：空 ref 名也给出可读文案', () => {
  assert.match(missingCredentialMessage('', ['A']), /"\(empty\)"/)
})
