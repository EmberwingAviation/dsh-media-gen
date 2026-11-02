/**
 * dsh-media-gen — 凭据名解析（零依赖，可单测）。
 *
 * DSH 的凭据服务只按 ref 名解析值；设置页需要先知道"有哪些 ref 可填"，
 * 否则用户只能靠猜（典型的报错是 `no API key stored for "DASHSCOPE_API_KEY"`）。
 *
 * 本模块只读凭据文件的**键名**，永不读取值。
 * 兼容两种落盘形状：
 *   version: 1
 *   refs:                     ← 形状 A：refs 段内缩进列出
 *     QWEN_TOB_API_KEY: xxx
 *   GPT_API_KEY: xxx          ← 形状 B：顶层键直接是 ref
 */
import { readFileSync } from 'node:fs'

const META_KEYS = new Set(['version', 'refs', 'kind', 'updatedAt', 'createdAt'])

/**
 * 从凭据文件文本里解析出 ref 名列表。
 * @param text 文件内容
 * @returns 去重排序后的 ref 名
 */
export function parseCredentialRefs(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const names = new Set()
  let inRefsBlock = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue
    const top = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line)
    if (top !== null) {
      inRefsBlock = top[1] === 'refs'
      if (!META_KEYS.has(top[1])) names.add(top[1])
      // 形状 A 的内联对象：refs: { KEY: value, ... }
      if (inRefsBlock && top[2].trimStart().startsWith('{')) {
        for (const m of top[2].matchAll(/([A-Za-z0-9_.-]+)\s*:/g)) {
          if (!META_KEYS.has(m[1])) names.add(m[1])
        }
      }
      continue
    }
    // 形状 A 的缩进子项（两空格以上）
    if (inRefsBlock) {
      const inner = /^\s{2,}([A-Za-z0-9_.-]+):/.exec(line)
      if (inner !== null && !META_KEYS.has(inner[1])) names.add(inner[1])
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * 读取凭据文件并解析 ref 名；文件不存在或不可读时返回空数组（绝不抛错）。
 * @param path 凭据文件绝对路径
 */
export function readCredentialRefs(path) {
  try {
    return parseCredentialRefs(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

/**
 * 组装"凭据缺失"的可读错误：直接列出可用 ref，避免用户猜名字。
 * @param apiKeyEnv 用户填写的 ref 名
 * @param available 可用 ref 名列表
 */
export function missingCredentialMessage(apiKeyEnv, available) {
  const ref = String(apiKeyEnv ?? '').trim() || '(empty)'
  const list = Array.isArray(available) ? available : []
  if (list.length === 0) {
    return `no API key stored for "${ref}"; the credential store has no entries yet — create one in Settings → Account (or type a key in the provider editor)`
  }
  return `no API key stored for "${ref}". Available credentials: ${list.join(', ')}. Pick one of these, or create "${ref}" first.`
}
