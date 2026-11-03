import test from 'node:test'
import assert from 'node:assert/strict'
import {waitForVideo} from '../lib/video-wait.js'
const initial={status:'pending',operationId:'op',taskId:'task'}
test('wait follows one operation until video completes',async()=>{
 let time=0,calls=0;const waits=[]
 const result=await waitForVideo(initial,async id=>{assert.equal(id,'op');return ++calls===3?{...initial,status:'completed',savedTo:'video.mp4'}:initial},{now:()=>time,sleepFn:async ms=>{time+=ms;waits.push(ms)},timeoutMs:60000})
 assert.equal(result.status,'completed');assert.equal(calls,3);assert.deepEqual(waits,[12000,12000,12000])
})
test('wait expires with original task identity without submission',async()=>{
 let time=0;const result=await waitForVideo(initial,async()=>initial,{now:()=>time,sleepFn:async ms=>{time+=ms},timeoutMs:20000})
 assert.equal(result.operationId,'op');assert.equal(result.status,'pending');assert.match(result.message,/时限/)
})
test('unknown submission is never polled or resubmitted',async()=>{
 const result=await waitForVideo({...initial,status:'submission_unknown'},()=>{throw Error('should not query')})
 assert.equal(result.status,'submission_unknown')
})
test('poll failures back off and recover the same operation',async()=>{
 let time=0,calls=0;const waits=[]
 const result=await waitForVideo(initial,async()=>++calls<2?{...initial,failedStage:'poll'}:{...initial,status:'completed'},{now:()=>time,sleepFn:async ms=>{time+=ms;waits.push(ms)},timeoutMs:120000})
 assert.equal(result.status,'completed');assert.deepEqual(waits,[12000,60000])
})
test('cancel keeps task identity',async()=>{
 const controller=new AbortController();controller.abort()
 const result=await waitForVideo(initial,()=>{throw Error('must not query')},{signal:controller.signal})
 assert.equal(result.taskId,'task');assert.match(result.message,/停止/)
})
