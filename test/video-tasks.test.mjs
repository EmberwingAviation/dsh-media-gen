import test from 'node:test'
import assert from 'node:assert/strict'
import {
  taskKeyFor,
  rememberTask,
  trackedTask,
  forgetTask,
  clearAllTasks,
  decideTrackedTask,
  describeTrackedTask,
} from '../lib/video-tasks.js'

test('任务键：同输入稳定、不同输入区分（provider/操作/prompt/源图）', () => {
  assert.equal(taskKeyFor('p', 't2v', 'cat', undefined), taskKeyFor('p', 't2v', 'cat', undefined))
  assert.notEqual(taskKeyFor('p', 't2v', 'cat', undefined), taskKeyFor('p', 't2v', 'dog', undefined))
  assert.notEqual(taskKeyFor('p', 't2v', 'cat', undefined), taskKeyFor('p', 'i2v', 'cat', undefined))
  assert.notEqual(taskKeyFor('a', 't2v', 'cat', undefined), taskKeyFor('b', 't2v', 'cat', undefined))
  assert.notEqual(taskKeyFor('p', 'i2v', 'cat', 'x.png'), taskKeyFor('p', 'i2v', 'cat', 'y.png'))
})

test('登记簿 remember/track/forget/clear', () => {
  clearAllTasks()
  const key = taskKeyFor('p', 't2v', 'cat', undefined)
  assert.equal(trackedTask(key), undefined)
  rememberTask(key, 'task_1')
  assert.equal(trackedTask(key).taskId, 'task_1')
  forgetTask(key)
  assert.equal(trackedTask(key), undefined)
})

test('决策：completed→reuse / failed|cancelled→resubmit / 进行中→blocked', () => {
  assert.equal(decideTrackedTask({ status: 'completed' }), 'reuse')
  assert.equal(decideTrackedTask({ status: 'failed' }), 'resubmit')
  assert.equal(decideTrackedTask({ status: 'cancelled' }), 'resubmit')
  assert.equal(decideTrackedTask({ status: 'in_progress', progress: 30 }), 'blocked')
  assert.equal(decideTrackedTask({ status: 'queued' }), 'blocked')
  assert.equal(decideTrackedTask(undefined), 'blocked')
})

test('describeTrackedTask 含进度', () => {
  assert.equal(describeTrackedTask({ status: 'in_progress', progress: 30 }), 'in_progress 30%')
  assert.equal(describeTrackedTask({ status: 'queued' }), 'queued')
  assert.equal(describeTrackedTask(undefined), 'unknown')
})
