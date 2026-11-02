import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VideoTaskStore } from '../lib/video-task-store.js'
import { VideoTaskEngine } from '../lib/video-task-engine.js'
import { generateGoogleVideo } from '../lib/video-google.js'
const source = text => ({url:`data:text/javascript,${encodeURIComponent(text)}`,shortCircuit:true})
const hooks = registerHooks({resolve(specifier,context,next){
  if(specifier==='@deepseek-ai/dsh-tools')return process.env.DSH_REAL_TOOLS_URL ? {url:process.env.DSH_REAL_TOOLS_URL,shortCircuit:true} : source('export const defineTool = value => value')
  if(specifier==='@deepseek-ai/dsh-credentials')return source('export const credentialRef = value => value')
  return next(specifier,context)
}})
const {applyVideo, VIDEO_OUTPUT_SCHEMA}=await import('../lib/video-core.js')
hooks.deregister()
const realTools = process.env.DSH_REAL_TOOLS_URL ? await import(process.env.DSH_REAL_TOOLS_URL) : undefined
test('Google lost response remains unknown across restart and never resubmits automatically',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'dsh-video-google-'))
 const original=globalThis.fetch
 let submits=0
 try {
  globalThis.fetch=async()=>{submits++;throw new Error('connection lost')}
  const store=new VideoTaskStore({directory})
  const active={id:'google',model:'veo',protocol:'google',kind:'google',baseUrl:'https://example.invalid/interactions',apiKeyEnv:'TEST_KEY',parameters:{}}
  const input={prompt:'sunset',operation:'t2v'}
  const callback=credential=>generateGoogleVideo({apiKey:credential,endpoint:active.baseUrl,model:active.model,prompt:input.prompt,maxBytes:1024,signal:new AbortController().signal})
  const options={store,resolveCredential:async()=> 'fake-key',collect:async()=>{throw Error('must not collect')}}
  const first=await new VideoTaskEngine(options).generateLegacy(active,input,{},callback)
  assert.equal(first.status,'submission_unknown')
  assert.equal(submits,1)
  const second=await new VideoTaskEngine(options).generateLegacy(active,input,{},callback)
  assert.equal(second.operationId,first.operationId)
  assert.equal(second.nextAction,'check_usage_logs')
  assert.equal(submits,1)
  assert.doesNotMatch(JSON.stringify(await store.get(first.operationId)),/fake-key|sunset/)
 } finally {globalThis.fetch=original;await rm(directory,{recursive:true,force:true})}
})

test('Google 429 is a single paid POST, never an automatic retry',async()=>{
 const original=globalThis.fetch;let submits=0
 try {globalThis.fetch=async()=>{submits++;return new Response('{"error":"limited"}',{status:429})}
 await assert.rejects(generateGoogleVideo({apiKey:'fake-key',endpoint:'https://example.invalid',model:'veo',prompt:'test',maxBytes:1024,signal:new AbortController().signal}),/429/)
 assert.equal(submits,1)
 } finally {globalThis.fetch=original}
})
const row={id:'p',model:'m',kind:'openai-compatible',baseUrl:'https://example.invalid/v1',apiKeyEnv:'TEST_KEY',models:[{id:'m'},{id:'n',overrides:{generateAudio:{mode:'override',value:false}}}],capabilityDefaults:{i2v:true},generationDefaults:{duration:5}}
function setup(extra={}){
 const tools=new Map(), calls=[]
 const config={videoConfigVersion:2,videoProviders:[structuredClone(row)],...extra.config}
 const engine={generate:async(active,input,context)=>{calls.push({active,input,context});return {status:'pending',operationId:'op1',taskId:'t1',provider:active.id,model:active.model,nextAction:'query_video_task'}},query:async(id)=>({status:'pending',operationId:id})}
 const ctx={effect:fn=>fn(),webServer:{register:()=>()=>{}},tools:{register:tool=>{if(realTools)realTools.ToolRuntime.prototype.register.call({ctx:{},layers:{effect:(_ctx,fn)=>fn({tools:{insert:()=>()=>{}}})}},tool);tools.set(tool.name,tool)}},credentials:{resolve:async()=>{throw Error('Unexpected credential access')}},attachments:{readImage:async()=>({data:Buffer.from('image bytes'),ref:{mediaType:'image/png'}})}}
 const store={list:async()=>[{operationId:'op1',taskId:'t1',status:'pending',model:'m',providerSnapshot:{id:'p'}}],findByTaskId:async id=>id==='t1'?{operationId:'op1'}:null}
 const managed=[]
 applyVideo(ctx,()=>config,{taskEngine:engine,taskStore:store,videoModels:async request=>{managed.push(request);return {revision:'r1',providers:[]}}})
 const exec={signal:new AbortController().signal,agent:{session:{header:{cwd:process.cwd(),id:'s1'},deriveMessages:()=>[{content:[{type:'image',attachment:{attachmentId:'a1'}}]}]}}}
 return {tools,calls,exec,config,managed}
}
test('generation returns pending without rendering completion and preserves model params',async()=>{
 const {tools,calls,exec}=setup();const tool=tools.get('generate_video')
 const result=await tool.execute({prompt:'sunset',model:'n',duration:0,generate_audio:false,aspect_ratio:'16:9'},exec)
 assert.equal(result.status,'pending');assert.equal(calls[0].active.model,'n')
 assert.deepEqual(calls[0].active.parameters,{duration:0,generateAudio:false,aspectRatio:'16:9'})
 assert.doesNotMatch(tool.output.render({},result)[0].text,/Generated video is attached/)
 assert.equal(tool.output.presentationMeta({},result).status,'pending')
 assert.equal(tool.presentResult({}, {meta:{...result,route:'/fake'}}),undefined)
 assert.equal(VIDEO_OUTPUT_SCHEMA.properties.videoId.required,undefined)
})
test('omit conflicts and unsupported capability fail before paid submission',async()=>{
 const s=setup();s.config.videoProviders[0].models[0].overrides={duration:{mode:'omit'}}
 await assert.rejects(s.tools.get('generate_video').execute({prompt:'x',duration:5},s.exec),/omit/)
 s.config.videoProviders[0].capabilityDefaults.i2v=false
 await assert.rejects(s.tools.get('animate_image').execute({prompt:'x'},s.exec),/i2v/)
 assert.equal(s.calls.length,0)
})
test('animate resolves actual content before fingerprinting and produces data URL',async()=>{
 const {tools,calls,exec}=setup()
 await tools.get('animate_image').execute({prompt:'waves'},exec)
 assert.equal(calls[0].input.sourceIdentity,createHash('sha256').update('image bytes').digest('hex'))
 assert.equal(calls[0].input.sourceUrl,'data:image/png;base64,'+Buffer.from('image bytes').toString('base64'))
 assert.equal(calls[0].input.operation,'i2v')
 await assert.rejects(tools.get('animate_image').execute({prompt:'x',source_path:'a.png',source_attachment_id:'a1'},exec),/not both/)
})
test('query finds original operation by task ID and list never submits',async()=>{
 const {tools,exec,calls}=setup();const tool=tools.get('query_video_task')
 assert.equal((await tool.execute({action:'get',task_id:'t1'},exec)).operationId,'op1')
 assert.equal((await tool.execute({action:'list'},exec)).tasks[0].taskId,'t1')
 await assert.rejects(tool.execute({action:'get',task_id:'unknown'},exec),/unknown/)
 await assert.rejects(tool.execute({action:'get',task_id:'t1',operation_id:'op1'},exec),/only/)
 assert.equal(calls.length,0)
})
test('model management shares manager and never accepts credential fields',async()=>{
 const {tools,managed}=setup();const tool=tools.get('manage_video_models')
 await tool.execute({action:'upsert',provider:'p',model:JSON.stringify({id:'new',overrides:{duration:{mode:'override',value:5}}}),expected_revision:'r1'})
 assert.equal(managed[0].model.id,'new');assert.equal(managed[0].expectedRevision,'r1')
 await assert.rejects(tool.execute({action:'upsert',model:JSON.stringify({id:'x',apiKey:'secret'})}),/credentials/)
 await tool.execute({action:'set_default',provider:'p',model_id:'n',expected_revision:'r2',make_provider_default:true})
 assert.equal(managed[1].makeProviderDefault,true)
})
