import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VideoTaskStore } from '../lib/video-task-store.js'
import { VideoTaskEngine } from '../lib/video-task-engine.js'
const active = { id:'wan', model:'wan3.0-video', baseUrl:'https://example.test/v1', apiKeyEnv:'TEST_REF', protocol:'openai-compatible', parameterFormat:'wan', parameters:{duration:5,aspectRatio:'16:9'}, capabilities:{t2v:true} }
async function setup(t, fetchImpl, collect=async()=>({savedTo:'C:/work/result.mp4'})) {
  const directory=await mkdtemp(join(tmpdir(),'dsh-task-engine-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const store=new VideoTaskStore({directory}); const make=()=>new VideoTaskEngine({store,resolveCredential:async()=> 'test-secret',collect,fetchImpl,sleep:async()=>{}})
  return {store,engine:make(),make}
}
test('creation survives later polling failure and restart without another POST',async t=>{
  let posts=0,complete=false
  const {engine,make}=await setup(t,async(url,init)=>{
    if(init.method==='POST'){posts++;return Response.json({id:'task-1',status:'queued'})}
    if(!complete)throw new Error('connection lost')
    return url.endsWith('/content')?new Response('video',{headers:{'content-type':'video/mp4'}}):Response.json({id:'task-1',status:'completed'})
  })
  const first=await engine.generate(active,{prompt:'sea'},{workspace:'C:/work'})
  assert.equal(first.status,'pending');assert.equal(first.taskId,'task-1')
  const interrupted=await engine.query(first.operationId,{workspace:'C:/work'})
  assert.equal(interrupted.status,'pending');assert.equal(interrupted.failedStage,'poll')
  complete=true
  const restored=await make().generate(active,{prompt:'sea'},{workspace:'C:/work'})
  assert.equal(restored.status,'completed');assert.equal(posts,1)
  assert.equal(restored.failedStage, undefined); assert.equal(restored.error, undefined)
})
test('lost creation response stays unknown and duplicate request never resubmits',async t=>{
  let posts=0;const {engine}=await setup(t,async()=>{posts++;throw new Error('lost response')})
  const a=await engine.generate(active,{prompt:'sea'})
  const b=await engine.generate(active,{prompt:'sea'})
  assert.equal(a.status,'submission_unknown');assert.equal(a.operationId,b.operationId);assert.equal(posts,1)
})
test('download failure remains completed upstream and is recoverable without POST',async t=>{
  let posts=0,downloads=0
  const {engine}=await setup(t,async(url,init)=>{
    if(init.method==='POST'){posts++;return Response.json({id:'task-1',status:'queued'})}
    if(url.endsWith('/content')){if(++downloads===1)throw new Error('download offline');return new Response('video')}
    return Response.json({id:'task-1',status:'completed'})
  })
  const a=await engine.generate(active,{prompt:'sea'})
  assert.equal((await engine.query(a.operationId)).status,'download_pending')
  assert.equal((await engine.query(a.operationId)).status,'completed');assert.equal(posts,1)
})
test('different model and parameters do not reuse an old task',async t=>{
  let posts=0;const {engine}=await setup(t,async()=>Response.json({id:`task-${++posts}`,status:'queued'}))
  await engine.generate(active,{prompt:'sea'})
  await engine.generate({...active,model:'wan3.0-video-prime'},{prompt:'sea'})
  await engine.generate({...active,parameters:{duration:10}},{prompt:'sea'})
  assert.equal(posts,3)
})
test('same concurrent request creates one task',async t=>{
  let posts=0;const {engine}=await setup(t,async()=>Response.json({id:`task-${++posts}`,status:'queued'}))
  const [a,b]=await Promise.all([engine.generate(active,{prompt:'sea'}),engine.generate(active,{prompt:'sea'})])
  assert.equal(a.operationId,b.operationId);assert.equal(posts,1)
})
test('separate engines share an atomic fingerprint reservation',async t=>{
  let posts=0;const {engine,make}=await setup(t,async()=>Response.json({id:`task-${++posts}`,status:'queued'}))
  const [a,b]=await Promise.all([engine.generate(active,{prompt:'atomic'}),make().generate(active,{prompt:'atomic'})])
  assert.equal(a.operationId,b.operationId);assert.equal(posts,1)
})
test('input parameter overrides participate in fingerprint',async t=>{
  let posts=0;const {engine}=await setup(t,async()=>Response.json({id:`task-${++posts}`,status:'queued'}))
  await assert.rejects(engine.generate(active,{prompt:'sea',parameters:{duration:5}}), /resolve call overrides/)
  await engine.generate({...active,parameters:{duration:5}},{prompt:'sea'})
  await engine.generate({...active,parameters:{duration:10}},{prompt:'sea'})
  assert.equal(posts,2)
})
test('completed restart returns metadata only in original workspace',async t=>{
  const attachment={attachmentId:'result',mediaType:'video/mp4',bytes:5}
  const {engine,make}=await setup(t,async(url,init)=>url.endsWith('/content')?new Response('video'):Response.json({id:'task',status:init.method==='POST'?'queued':'completed'}),async()=>({savedTo:'C:/original/video.mp4',attachment}))
  const a=await engine.generate(active,{prompt:'sea'},{workspace:'C:/original'})
  await engine.query(a.operationId,{workspace:'C:/original'})
  assert.deepEqual((await make().query(a.operationId,{workspace:'C:/original'})).attachment,attachment)
  const other=await make().query(a.operationId,{workspace:'C:/other'})
  assert.equal('savedTo' in other,false);assert.equal('attachment' in other,false)
  assert.equal(other.nextAction,'query_from_original_workspace')
})
test('disabled saving remains recoverable after restart without a second POST',async t=>{
  let posts=0,downloads=0
  const {engine,make}=await setup(t,async(url,init)=>{
    if(init.method==='POST'){posts++;return Response.json({id:'task',status:'queued'})}
    if(url.endsWith('/content')){downloads++;return new Response('video')}
    return Response.json({id:'task',status:'completed'})
  },async()=>({attachment:{attachmentId:'result',bytes:5}}))
  const a=await engine.generate(active,{prompt:'sea'})
  assert.equal((await engine.query(a.operationId)).status,'download_pending')
  assert.equal((await make().query(a.operationId)).status,'download_pending')
  assert.equal(posts,1);assert.equal(downloads,2)
})
test('legacy atomic reservation and disabled saving never trigger replacement',async t=>{
  let posts=0
  const {engine,make}=await setup(t,async()=>{throw new Error('unexpected fetch')},async()=>({attachment:{attachmentId:'legacy',bytes:5}}))
  const submit=async()=>{posts++;return {data:Buffer.from('video')}}
  const [a,b]=await Promise.all([engine.generateLegacy(active,{prompt:'legacy'},{workspace:'C:/original'},submit),make().generateLegacy(active,{prompt:'legacy'},{workspace:'C:/original'},submit)])
  assert.equal(a.operationId,b.operationId);assert.equal(posts,1)
  const retry=await make().generateLegacy(active,{prompt:'legacy'},{workspace:'C:/original'},submit)
  assert.equal(retry.status,'download_pending');assert.equal(retry.nextAction,'check_usage_logs');assert.equal(posts,1)
  const other=await make().generateLegacy(active,{prompt:'legacy'},{workspace:'C:/other'},submit)
  assert.equal('attachment' in other,false);assert.equal('savedTo' in other,false)
})
test('shared inflight legacy request never leaks first workspace output',async t=>{
  const {engine}=await setup(t,async()=>{throw new Error('unexpected fetch')},async()=>({savedTo:'C:/original/video.mp4',attachment:{videoId:'v',savedTo:'C:/original/video.mp4',mediaType:'video/mp4'}}))
  let release;const gate=new Promise(resolve=>{release=resolve})
  const first=engine.generateLegacy(active,{prompt:'shared'},{workspace:'C:/original'},async()=>{await gate;return {data:Buffer.from('video')}})
  const second=engine.generateLegacy(active,{prompt:'shared'},{workspace:'C:/other'},async()=>{throw new Error('duplicate')})
  release();await first;const other=await second
  for(const key of ['savedTo','attachment','videoId','mediaType'])assert.equal(key in other,false)
  assert.equal(other.nextAction,'query_from_original_workspace')
})
test('cross-workspace query does not download into caller workspace',async t=>{
  let saves=0;const {engine}=await setup(t,async(_url,init)=>Response.json({id:'task',status:init.method==='POST'?'queued':'completed'}),async()=>{saves++;return {}})
  const a=await engine.generate(active,{prompt:'sea'},{workspace:'C:/original'})
  const result=await engine.query(a.operationId,{workspace:'C:/other'})
  assert.equal(result.nextAction,'query_from_original_workspace');assert.equal(saves,0)
})
