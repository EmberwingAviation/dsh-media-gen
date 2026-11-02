import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync(new URL('../lib/client-video.js', import.meta.url), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))
function harness({rpc, accepted = true, confirm = () => true} = {}) {
  let index = 0, component, tree, writes = []
  const states = [], confirmations = [], calls = []
  const react = {
    createElement: (type, props, ...children) => ({type, props: props ?? {}, children: children.flat(Infinity).filter(x => x != null && x !== false)}),
    useState(initial) { const i=index++; if (!(i in states)) states[i]=typeof initial==='function'?initial():initial; return [states[i], value=>{states[i]=typeof value==='function'?value(states[i]):value}] },
    useRef(initial) { const i=index++; return states[i] ??= {current:initial} },
    useEffect() {},
  }
  // Deliberately retain a v1 fixture: opening and saving migrates legacy strings.
  const initial = {videoProviders:[{id:'relay',name:'Relay',model:'old',kind:'openai-compatible',apiKeyEnv:'KEY',models:['old']}], videoProviderId:'relay'}
  const defaultRpc = {call:async(route, method, input)=>{
    calls.push({route, method, input})
    if (method === 'models') return {ok:true,value:{ids:['old','prime','prime','seedance']}}
    if (method === 'video-models' && input.action === 'validate') return {ok:true,value:input.provider}
    throw new Error(`Unexpected RPC ${method}/${input.action}`)
  }}
  const props = {scope:{getSnapshot:()=>({value:initial,revision:'revision-test',status:'ready',writable:true}),mutate:async(ops,revision)=>{writes.push({ops:JSON.parse(JSON.stringify(ops)),revision});return accepted}},locale:{getSnapshot:()=>({active:'zh'})},credentials:{describe:async()=>({ok:true,configured:true})},rpc:rpc??defaultRpc}
  vm.runInNewContext(source.replace('return module.exports;', 'return { VideoGenerationSettingsCard };'), {window:{alert:msg=>{throw new Error(msg)},confirm:message=>{confirmations.push(message);return confirm(message)},__ModuleLoader__:{load(def){component=def.factory(()=>react).VideoGenerationSettingsCard}}}})
  const render=()=>{index=0;tree=component(props);return tree}
  const descendants=root=>{const out=[];const walk=n=>{if(typeof n!=='object')return;out.push(n);n.children.forEach(walk)};walk(root);return out}
  const nodes=()=>descendants(tree)
  const text=n=>typeof n==='object'?n.children.map(text).join(''):String(n)
  const button=label=>nodes().find(n=>n.type==='button'&&text(n)===label)
  const activate=async b=>{assert.ok(b,'missing button');assert.ok(!b.props.disabled);await b.props.onClick();await tick();render()}
  const click=async label=>{const b=button(label);assert.ok(b,`missing button ${label}`);await activate(b)}
  const modelCard=id=>nodes().find(n=>n.type==='details'&&n.children.some(c=>typeof c==='object'&&c.type==='summary'&&c.children.includes(id)))
  const modelClick=async(id,label)=>{const card=modelCard(id);assert.ok(card,`missing model ${id}`);await activate(descendants(card).find(n=>n.type==='button'&&text(n)===label))}
  const submit=async()=>{await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render()}
  render();nodes().find(n=>n.props.className==='dsh-vg-head').props.onClick();render()
  return {render,nodes,text,button,click,modelCard,modelClick,submit,writes,confirmations,calls}
}
const savedProvider=(ui,index=0)=>ui.writes[index].ops.find(op=>op.path[0]==='videoProviders').value[0]

test('actual UI handlers bulk import, preserve default, confirm and save models with revision', async()=>{
  const ui=harness();await ui.click('编辑');await ui.click('拉取上游模型');await ui.click('取消全选');
  assert.equal(ui.button('添加所选模型到草稿').props.disabled,true)
  await ui.click('全选');await ui.click('添加所选模型到草稿');await ui.click('添加所选模型到草稿');
  await ui.submit();assert.equal(ui.writes.length,0,'open draft cannot silently be discarded')
  await ui.click('确定');await ui.submit();
  const saved=ui.writes[0];assert.equal(saved.revision,'revision-test')
  assert.equal(saved.ops.find(op=>op.path[0]==='videoConfigVersion').value,2)
  const row=savedProvider(ui)
  assert.deepEqual(row.models.map(model=>model.id),['old','prime','seedance']);assert.equal(row.model,'old')
  assert.ok(row.models.every(model=>typeof model.name==='string'&&model.overrides&&model.capabilities))
  assert.ok(ui.calls.some(call=>call.method==='video-models'&&call.input.action==='validate'))
  await ui.click('编辑');await ui.modelClick('prime','设为默认');await ui.click('确定');await ui.submit()
  assert.equal(savedProvider(ui,1).model,'prime')
})

test('cancel discards imported models and rejected persistence is not reported saved', async()=>{
  const ui=harness({accepted:false});await ui.click('编辑');await ui.click('拉取上游模型');await ui.click('添加所选模型到草稿');await ui.click('取消');await ui.submit()
  assert.deepEqual(savedProvider(ui).models.map(model=>model.id),['old'])
  assert.ok(!ui.nodes().some(n=>ui.text(n)==='✓ 已保存'))
})

test('late model response cannot populate a different provider draft', async()=>{
  let resolve, calls=0;const ui=harness({rpc:{call:()=>{calls++;return new Promise(r=>resolve=r)}}})
  await ui.click('编辑');await ui.click('拉取上游模型');await ui.click('取消');await ui.click('添加供应商')
  resolve({ok:true,value:{ids:['stale-model']}});await tick();ui.render()
  assert.equal(calls,1);assert.ok(!ui.button('添加所选模型到草稿'))
})

test('deleting default requires confirmation and chooses first remaining model', async()=>{
  let approved=false
  const ui=harness({confirm:()=>approved});await ui.click('编辑');await ui.click('拉取上游模型');await ui.click('添加所选模型到草稿')
  await ui.modelClick('old','删除')
  assert.equal(ui.confirmations.length,1);assert.ok(ui.modelCard('old'),'declining preserves default')
  approved=true;await ui.modelClick('old','删除')
  assert.equal(ui.confirmations.length,2);assert.ok(!ui.modelCard('old'))
  assert.match(ui.text(ui.modelCard('prime').children[0]),/默认/)
  await ui.click('确定');await ui.submit()
  assert.equal(savedProvider(ui).model,'prime');assert.deepEqual(savedProvider(ui).models.map(row=>row.id),['prime','seedance'])
})

test('deleting nondefault needs no confirmation; deleting final model stays empty after save and reopen', async()=>{
  const ui=harness();await ui.click('编辑');await ui.click('拉取上游模型');await ui.click('添加所选模型到草稿')
  await ui.modelClick('prime','删除');await ui.modelClick('seedance','删除')
  assert.equal(ui.confirmations.length,0)
  await ui.modelClick('old','删除');assert.equal(ui.confirmations.length,1)
  await ui.click('确定');await ui.submit()
  assert.deepEqual(savedProvider(ui).models,[]);assert.equal(savedProvider(ui).model,'')
  await ui.click('编辑');assert.ok(!ui.modelCard('old'))
  await ui.click('确定');await ui.submit()
  assert.deepEqual(savedProvider(ui,1).models,[]);assert.equal(savedProvider(ui,1).model,'')
})
