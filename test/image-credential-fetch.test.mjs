import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const source=readFileSync(new URL('../lib/client-image.js',import.meta.url),'utf8')
// Extract actual helper declarations, without loading unrelated UI modules.
const helper=source.slice(source.indexOf('    async function fetchUpstreamModelsIntoDraft'),source.indexOf('    const API_FORMATS'))
test('both existing and new provider editors receive the credential service',()=>{
 const calls=[...source.matchAll(/React\.createElement\(ProviderEditor,\s*\{([^}]*?)(?=onCancel:)/g)]
 assert.equal(calls.length,2)
 for(const call of calls) assert.match(call[1],/\bcredentials\s*,/)
})
const naming=source.slice(source.indexOf('    function slugify('),source.indexOf('    function uniqueId('))
function setup(call,confirm=true){
 const alerts=[];const scope={IMAGE_RPC:{call},RPC_CHANNEL:'/image-gen',window:{alert:x=>alerts.push(x),confirm:()=>confirm}}
 vm.createContext(scope);vm.runInContext(naming+'\n'+helper+'\nthis.run=fetchUpstreamModelsIntoDraft',scope)
 return {...scope,alerts}
}
test('auto credential ref is nonempty and persists through create retry and models merge',async()=>{
 const requests=[],writes=[];let current,created
 const s=setup(async(_,__,p)=>{requests.push(p);return requests.length===1?{ok:false,error:{code:'missing-credential',details:{ref:p.apiKeyEnv}}}:{ok:true,value:{ids:['gpt-image-2']}}})
 const ok=await s.run({name:'gptimage',id:'',apiKeyEnv:'',baseUrl:'https://example.test/v1',models:[]},v=>current=v,{keyValue:'fake-key',credentials:{set:async(ref,key)=>writes.push({ref,key})},onCreated:ref=>created=ref})
 assert.equal(ok,true);assert.equal(requests.length,2)
 assert.equal(requests[0].apiKeyEnv,'IMAGE_GEN_GPTIMAGE_API_KEY');assert.equal(requests[1].apiKeyEnv,requests[0].apiKeyEnv)
 assert.equal(current.apiKeyEnv,created);assert.equal(writes[0].ref,current.apiKeyEnv);assert.equal(current.models[0].id,'gpt-image-2')
 assert.ok(requests.every(p=>!JSON.stringify(p).includes('fake-key')))
})
test('explicit credential name is preserved and trimmed',async()=>{
 let payload,current;const s=setup(async(_,__,p)=>{payload=p;return {ok:true,value:{ids:['m']}}})
 await s.run({name:'p',apiKeyEnv:' EXISTING ',models:[]},v=>current=v)
 assert.equal(payload.apiKeyEnv,'EXISTING');assert.equal(current.apiKeyEnv,'EXISTING')
})
test('canceling credential creation never writes or retries',async()=>{
 let count=0,writes=0;const s=setup(async()=>{count++;return {ok:false,error:{code:'missing-credential',details:{}}}},false)
 const ok=await s.run({name:'p',models:[]},()=>{},{keyValue:'fake-key',credentials:{set:async()=>writes++}})
 assert.equal(ok,false);assert.equal(count,1);assert.equal(writes,0)
})
