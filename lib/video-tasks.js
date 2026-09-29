/**
 * dsh-media-gen — 视频任务登记簿（openai-compatible 中转通道）。
 *
 * 纪律（2026-09-29 用户指令）：超时或失败后**不盲发新任务**——先 GET 旧任务状态再决定：
 *   completed → 直接取旧任务结果（reuse）；failed/cancelled → 允许重提（resubmit）；
 *   queued/in_progress → 拒绝重提并明确报错（blocked），避免重复提交加重上游淤积。
 * 登记簿为进程内 Map（host 重启即清空；重启后旧任务靠工具超时错误里的 task id 人工/模型追溯）。
 */
import { createHash } from 'node:crypto'

const registry = new Map()

/** 稳定任务键：provider + 操作 + prompt(+源图标签) 的 sha1 前缀。 */
export function taskKeyFor(providerId, operation, prompt, sourceTag) {
  const hash = createHash('sha1')
  hash.update(`${operation}\n${String(prompt ?? '')}\n${String(sourceTag ?? '')}`)
  return `${providerId}|${hash.digest('hex').slice(0, 16)}`
}

export function rememberTask(key, taskId) {
  registry.set(key, { taskId, rememberedAt: Date.now() })
}

export function trackedTask(key) {
  return registry.get(key)
}

export function forgetTask(key) {
  registry.delete(key)
}

/** 测试辅助：清空登记簿。 */
export function clearAllTasks() {
  registry.clear()
}

/**
 * 依旧任务状态决策。
 * @returns 'reuse' | 'resubmit' | 'blocked'
 */
export function decideTrackedTask(state) {
  const status = String(state?.status ?? '').toLowerCase()
  if (status === 'completed') return 'reuse'
  if (status === 'failed' || status === 'cancelled') return 'resubmit'
  return 'blocked'
}

export function describeTrackedTask(state) {
  if (state === undefined) return 'unknown'
  const progress = typeof state.progress === 'number' ? ` ${state.progress}%` : ''
  return `${state.status ?? 'unknown'}${progress}`
}
