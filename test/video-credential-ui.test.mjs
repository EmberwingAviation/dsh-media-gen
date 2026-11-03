import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync(new URL('../lib/client-video.js', import.meta.url), 'utf8')
const SECRET = 'sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY'
function harness({ configured = false, approve = true, fail = '', initialRef = 'EXISTING_KEY' } = {}) {
  let index = 0, tree, component
  const states = [], calls = [], writes = [], credentials = [], alerts = [], confirmations = []
  const react = { createElement:(type, props,...children)=>({type,props:props??{},children:children.flat(Infinity).filter(x=>x!=null&&x!==false)}),useState(initial){const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useRef(v){const i=index++;return states[i]??={current:v}},useEffect(){} }
  const props = {locale:{getSnapshot:()=>({active:'zh'})},scope:{getSnapshot:()=>({revision:'r',value:{videoProviders:[{id:'relay',name:'Relay',model:'a',models:['a'],apiKeyEnv:initialRef,kind:'openai-compatible'}]}}),mutate:async ops=>{writes.push(ops);return true}},credentials:{describe:async ref=>{credentials.push(['describe',ref]);if(fail==='describe')throw Error(SECRET);return {ok:true,configured}},set:async(ref,value)=>{credentials.push(['set',ref,value]);if(fail==='set')throw Error(SECRET)}},rpc:{call:async(route,method,input)=>{calls.push({route,method,input});if(fail==='rpc')throw Error(SECRET);return {ok:true,value:method==='models'?{ids:['a','b']}:input.provider}}}}
  vm.runInNewContext(source.replace('return module.exports;','return {VideoGenerationSettingsCard};'),{window:{alert:x=>alerts.push(x),confirm:x=>{confirmations.push(x);return approve},__ModuleLoader__:{load:d=>component=d.factory(()=>react).VideoGenerationSettingsCard}}})
  const render=()=>{index=0;tree=component(props)}
  const nodes=()=>{const result=[];const visit=n=>{if(typeof n!=='object')return;result.push(n);n.children.forEach(visit)};visit(tree);return result}
  const text=n=>typeof n==='object'?n.children.map(text).join(''):String(n)
  const click=async label=>{const b=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(b,label);await b.props.onClick();await new Promise(r=>setImmediate(r));render()}
  const input=(label,value)=>{nodes().find(n=>n.props['aria-label']===label).props.onChange({target:{value}});render()}
  const mode=()=>{nodes().find(n=>n.type==='select'&&n.children.some(c=>c.props?.value==='existing')).props.onChange({target:{value:'new'}});render()}
  const submit=async()=>{await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render()}
  render();nodes().find(n=>n.props.className==='dsh-vg-head').props.onClick();render()
  return {click,input,mode,submit,nodes,text,calls,writes,credentials,alerts,confirmations}
}
test('new password key saves only through credential API then fetches models',async()=>{
 const ui=harness();await ui.click('编辑');ui.mode();assert.equal(ui.nodes().find(n=>n.props['aria-label']==='凭据名称').props.value,'VIDEO_GEN_RELAY_API_KEY')
 ui.input('API Key',SECRET);assert.equal(ui.nodes().find(n=>n.props['aria-label']==='API Key').props.type,'password')
 await ui.click('确定');assert.equal(ui.credentials.length,0);assert.equal(ui.calls.length,0)
 await ui.click('保存 Key 并拉取模型');assert.deepEqual(ui.credentials,[['describe','VIDEO_GEN_RELAY_API_KEY'],['set','VIDEO_GEN_RELAY_API_KEY',SECRET]])
 assert.equal(ui.calls[0].method,'models');assert.ok(!JSON.stringify(ui.calls).includes(SECRET))
 await ui.click('确定');await ui.submit();assert.ok(!JSON.stringify(ui.writes).includes(SECRET));assert.equal(ui.writes.length,1)
})
test('existing credential overwrite requires confirmation and declining neither writes nor fetches',async()=>{
 const ui=harness({configured:true,approve:false});await ui.click('编辑');ui.mode();ui.input('API Key',SECRET);await ui.click('保存 Key 并拉取模型')
 assert.equal(ui.confirmations.length,1);assert.equal(ui.credentials.length,1);assert.equal(ui.calls.length,0)
 assert.ok(!ui.confirmations[0].includes(SECRET))
})
test('pasted key or invalid ref is cleared and blocked before fetch, confirmation and save',async()=>{
 for(const value of [SECRET,'bad-name','123_BAD']){
 const ui=harness();await ui.click('编辑');ui.input('凭据名称',value);await ui.click('拉取上游模型');await ui.click('确定')
 assert.equal(ui.calls.length,0);assert.equal(ui.credentials.length,0);assert.ok(!JSON.stringify(ui.nodes()).includes(value));assert.ok(ui.nodes().some(n=>ui.text(n).includes('添加 API Key')))
 }
 const ui=harness({initialRef:SECRET});await ui.submit();assert.equal(ui.calls.length,0);assert.equal(ui.writes.length,0)
})
test('credential and model errors never render raw exception containing key',async()=>{
 for(const fail of ['describe','set','rpc']){
 const ui=harness({fail});await ui.click('编辑');ui.mode();ui.input('API Key',SECRET);await ui.click('保存 Key 并拉取模型')
 const visible=ui.nodes().map(ui.text).join('\n')+JSON.stringify(ui.alerts)
 assert.ok(!visible.includes(SECRET));assert.ok(visible.includes('操作失败'))
 assert.ok(!JSON.stringify(ui.calls).includes(SECRET))
 }
})
test('approved overwrite writes once and validation errors are sanitized',async()=>{
 const ui=harness({configured:true});await ui.click('编辑');ui.mode();ui.input('API Key',SECRET);await ui.click('保存 Key 并拉取模型')
 assert.equal(ui.confirmations.length,1);assert.equal(ui.credentials.filter(x=>x[0]==='set').length,1)
 const broken=harness({fail:'rpc'});await broken.click('编辑');await broken.click('确定')
 assert.ok(!broken.nodes().map(broken.text).join('').includes(SECRET));assert.ok(broken.nodes().some(n=>broken.text(n).includes('操作失败')))
})
test('cancel drops unsaved password without credential mutation',async()=>{
 const ui=harness();await ui.click('编辑');ui.mode();ui.input('API Key',SECRET);await ui.click('取消');await ui.click('编辑');ui.mode()
 assert.equal(ui.nodes().find(n=>n.props['aria-label']==='API Key').props.value,'');assert.equal(ui.credentials.length,0)
})
