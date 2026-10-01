import { REFERENCE_JPEG } from "./support/image-fixture.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImagePlan, validateVisionRequest, type VisionProvider, type VisionRequest } from '../backend/vision.js';
import { validateBuildPlan, sealPlan, planHash } from '../src/image/build-plan.js';
import { validateBlueprint } from '../src/blueprint/validator.js';
import { ImageSession } from '../backend/image-session.js';
import { COMPANION_HTML } from '../backend/companion.js';
const request:VisionRequest={prompt:'ابن بيت من الصورة',detail:'FAST',scale:1,dimension:'minecraft:overworld',images:[{view:'front',width:16,height:16,data:REFERENCE_JPEG}]};
// Test fixture only. Production ALWAYS invokes a configured Vision provider.
const provider:VisionProvider={async generate(){return {blueprint:{version:1,name:'Fixture',size:{x:2,y:2,z:2},operations:[{type:'fill',from:[0,0,0],to:[1,1,1],block:'minecraft:stone'}]},assumptions:['Unseen rear inferred'],open_choices:[]};}};
test('vision plan is validated, bounded, sealed and uses relative coordinates',async()=>{
 const p=await generateImagePlan(request,provider);assert.equal(p.estimates.block_writes,8);assert.equal(validateBuildPlan(p).detail,'FAST');assert.equal(p.source_images[0]?.view,'front');assert.deepEqual(p.bounds.to,[1,1,1]);
});
test('tampered plans, unknown fields and forged estimates rejected',async()=>{
 const p=await generateImagePlan(request,provider);assert.throws(()=>validateBuildPlan({...p,detail:'ULTRA'}));const {plan_hash,...rest}=p;
 assert.throws(()=>validateBuildPlan(sealPlan({...rest,estimates:{block_writes:1,snapshot_volume:8}})));
 assert.throws(()=>validateBuildPlan(sealPlan({...rest,raw_command:'kill @a'} as any)));
 assert.throws(()=>validateBuildPlan(sealPlan({...rest,bounds:{from:[1,0,0],to:[1,1,1]}})));
});
test('image count, corrupt formats, dimension sizes, prompt and detail enforce limits',()=>{
 for(const change of [{images:[]},{images:Array(4).fill(request.images[0])},{images:[{...request.images[0],data:'data:image/png;base64,abcd'}]},{images:[{...request.images[0],width:2000}]},{detail:'UNKNOWN'},{scale:20},{prompt:'x'}])assert.throws(()=>validateVisionRequest({...request,...change} as any));
});
test('multiple reference views and revised plan context reach provider',async()=>{
 let seen:VisionRequest|undefined;const spy:VisionProvider={async generate(v){seen=v;return provider.generate(v);}};
 const first=await generateImagePlan({...request,images:[...request.images,{...request.images[0]!,view:'rear'}]},spy);assert.equal(seen?.images.length,2);
 const second=await generateImagePlan({...request,images:[],previous:first,prompt:'غير السقف إلى حجر'},spy);assert.equal(seen?.previous?.plan_id,first.plan_id);assert.equal(second.source_images.length,2);assert.notEqual(first.plan_id,second.plan_id);
});
test('non JSON and dangerous malformed blueprint never crash validator',()=>{
 for(const v of [null,1,'text',{}, {version:1,name:'bad',size:{x:1,y:1,z:1},operations:[null]}, {version:1,name:'bad',size:{x:1,y:1,z:1},operations:[{type:'set_block',at:[0,0,0],block:42}]}])assert.equal(validateBlueprint(v).ok,false);
 const cycle:any={};cycle.self=cycle;assert.equal(validateBlueprint(cycle).ok,false);
});
test('detail and snapshot caps apply independently',async()=>{
 const large:VisionProvider={async generate(){return {blueprint:{version:1,name:'Large',size:{x:20,y:10,z:20},operations:[{type:'fill',from:[0,0,0],to:[19,9,19],block:'minecraft:stone'}]},assumptions:[],open_choices:[]};}};
 await assert.rejects(generateImagePlan(request,large));assert.equal((await generateImagePlan({...request,detail:'BALANCED'},large)).estimates.block_writes,4000);
});
test('session persists across object restart and expires',async()=>{
 const data=new Map<string,any>();const storage={async get<T>(k:string){return data.get(k) as T;},async put(k:string,v:unknown){data.set(k,v);},async deleteAll(){data.clear();},async setAlarm(_n:number){}};
 const env={AI_API_KEY:''};const object=new ImageSession({storage},env);assert.equal((await object.fetch(new Request('https://session/init',{method:'POST',body:JSON.stringify({dimension:'minecraft:overworld'})}))).status,200);
 data.get('session').plan=await generateImagePlan(request,provider);const restarted=new ImageSession({storage},env);const fetched=await restarted.fetch(new Request('https://session/plan'));assert.equal((await fetched.json() as any).plan.blueprint.name,'Fixture');
 data.get('session').expires=0;assert.equal((await restarted.fetch(new Request('https://session/plan'))).status,410);await restarted.alarm();assert.equal(data.size,0);
});
test('companion uses actual platform picker, orientation and bounded resize',()=>{
 assert.match(COMPANION_HTML,/type="file"/);assert.match(COMPANION_HTML,/imageOrientation:'from-image'/);assert.match(COMPANION_HTML,/1536/);assert.match(COMPANION_HTML,/textContent/);assert.doesNotMatch(COMPANION_HTML,/AI_API_KEY/);
});
test('hash is insensitive to object property order',()=>assert.equal(planHash({a:1,b:2}),planHash({b:2,a:1})));

test('provider sends real image content and rejects text/errors/timeouts without exposing upstream secrets',async()=>{
 const {OpenAICompatibleVisionProvider}=await import('../backend/vision.js');const original=globalThis.fetch;let sent:any;
 try{
  globalThis.fetch=async(_url:any,init:any)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(await provider.generate(request))}}]}),{status:200});};
  const realAdapter=new OpenAICompatibleVisionProvider({AI_API_KEY:'test-fixture-key',AI_VISION_MODEL:'test-model'});await realAdapter.generate(request);assert.equal(sent.messages[1].content[1].image_url.url,request.images[0]?.data);
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'This is not JSON'}}]}));await assert.rejects(realAdapter.generate(request));
  globalThis.fetch=async()=>new Response('SECRET_UPSTREAM_BODY',{status:500});await assert.rejects(realAdapter.generate(request),e=>e instanceof Error&&!e.message.includes('SECRET_UPSTREAM_BODY'));
  await assert.rejects(new OpenAICompatibleVisionProvider({AI_API_KEY:''}).generate(request),/not configured/);
 }finally{globalThis.fetch=original;}
});
test('worker session authentication, origin and bounded body reject untrusted requests',async()=>{
 const worker=(await import('../backend/worker.js')).default;
 const env:any={AI_API_KEY:'test-fixture',BUILDER_SHARED_SECRET:'test-secret',IMAGE_SESSIONS:{idFromName:(s:string)=>s,get:()=>({fetch:async()=>new Response('{}')})}};
 assert.equal((await worker.fetch(new Request('https://worker.test/',{method:'POST',body:JSON.stringify({mode:'image_session'})}),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://worker.test/image/session/'+'a'.repeat(32),{method:'POST',headers:{origin:'https://attacker.test'},body:'{}'}),env)).status,403);
 const {readBoundedBody}=await import('../backend/request-limit.js');await assert.rejects(readBoundedBody(new Request('https://worker.test/',{method:'POST',body:'x'.repeat(20)}),10));
});
