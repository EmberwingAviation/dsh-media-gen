import { setTimeout as sleep } from 'node:timers/promises'

/** Wait only on the already-created operation; never submit another task. */
export async function waitForVideo(initial, query, { signal, timeoutMs = 600000, pollIntervalMs = 12000, sleepFn = sleep, now = Date.now } = {}) {
  let result = initial
  if (result.status !== 'pending' || !result.operationId) return result
  const deadline = now() + Math.max(0, timeoutMs)
  let errors = 0
  while (result.status === 'pending' && now() < deadline && !signal?.aborted) {
    const interval = errors ? Math.min(60000 * 2 ** (errors - 1), 240000) : Math.max(10000, pollIntervalMs)
    try { await sleepFn(Math.min(interval, Math.max(0, deadline-now())), undefined, {signal}) } catch (error) {
      if (!signal?.aborted) throw error
      break
    }
    if (signal?.aborted || now() >= deadline) break
    const controller = new AbortController()
    const forward = () => controller.abort(signal.reason)
    signal?.addEventListener('abort', forward, {once:true})
    const timer = setTimeout(() => controller.abort(new Error('video wait deadline')), Math.max(1,deadline-now()))
    try {
      result = await query(result.operationId, controller.signal)
      errors = result.failedStage === 'poll' ? errors + 1 : 0
    } catch (error) {
      if (!controller.signal.aborted) throw error
      break
    } finally { clearTimeout(timer); signal?.removeEventListener('abort',forward) }
  }
  if (result.status !== 'pending') return result
  return {...result,message: signal?.aborted ? '等待已停止，原视频任务仍保留，可继续查询；未重复提交。' : '本次等待已达时限，原视频任务仍保留，可继续查询；未重复提交。',nextAction:'query_video_task'}
}
