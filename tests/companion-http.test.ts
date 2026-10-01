import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCompanionHost } from '../tools/serve-companion.js';
import { REFERENCE_JPEG } from './support/image-fixture.js';
import { normalizedJPEGDimensions } from '../backend/jpeg.js';
import { validateVisionRequest } from '../backend/vision.js';

const normalized={prompt:'ابن بيت من هذه الصورة',images:[{view:'front',width:16,height:16,data:REFERENCE_JPEG}],detail:'FAST',scale:1};
const auth={'content-type':'application/json',authorization:'Bearer test-local-auth'};
// Real loopback HTTP, actual Worker/session/Vision validation, durable local files.
// No Vision provider replacement: missing credentials MUST return 503, not a plan.
test('actual HTTP image upload reaches explicit real Vision configuration gate',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'aibuilder-http-'));let host:Awaited<ReturnType<typeof startCompanionHost>>|undefined;
 try{
  host=await startCompanionHost({port:0,directory,env:{BUILDER_SHARED_SECRET:'test-local-auth'}});
  const page=await fetch(host.url+'/companion');assert.equal(page.status,200);assert.match(await page.text(),/type="file"/);assert.match(page.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);
  const session=new URL(host.sessionUrl).hash.slice(1);const response=await fetch(host.url+'/image/session/'+session,{method:'POST',headers:{'content-type':'application/json',origin:host.url},body:JSON.stringify(normalized)});
  assert.equal(response.status,503);const body=await response.json() as any;assert.equal(body.code,'VISION_NOT_CONFIGURED');assert.equal(body.plan,undefined);
  const stored=await readFile(join(directory,session,'session.json'),'utf8');assert.doesNotMatch(stored,/base64|test-local-auth/);assert.equal(JSON.parse(stored).requests,0);
 }finally{await host?.close();await rm(directory,{recursive:true,force:true});}
});
test('actual HTTP sessions survive host restart and expire without provider credentials',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'aibuilder-http-'));let host:Awaited<ReturnType<typeof startCompanionHost>>|undefined;
 try{
  host=await startCompanionHost({port:0,directory,env:{BUILDER_SHARED_SECRET:'test-local-auth'}});const session=new URL(host.sessionUrl).hash.slice(1);await host.close();
  host=await startCompanionHost({port:0,directory,env:{BUILDER_SHARED_SECRET:'test-local-auth'}});
  const fetchPlan=()=>fetch(host!.url,{method:'POST',headers:auth,body:JSON.stringify({mode:'image_fetch',session})});
  let response=await fetchPlan();assert.equal(response.status,200);assert.equal((await response.json() as any).plan,null);
  const file=join(directory,session,'session.json');const stored=JSON.parse(await readFile(file,'utf8'));stored.expires=0;await writeFile(file,JSON.stringify(stored));response=await fetchPlan();assert.equal(response.status,410);
 }finally{await host?.close();await rm(directory,{recursive:true,force:true});}
});
test('actual HTTP upload rejects cross-origin and malformed images before Vision',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'aibuilder-http-'));let host:Awaited<ReturnType<typeof startCompanionHost>>|undefined;
 try{
  host=await startCompanionHost({port:0,directory,env:{BUILDER_SHARED_SECRET:'test-local-auth'}});const session=new URL(host.sessionUrl).hash.slice(1);
  const post=(body:unknown,origin=host!.url)=>fetch(host!.url+'/image/session/'+session,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
  assert.equal((await post(normalized,'https://untrusted.test')).status,403);
  for(const payload of [null,{...normalized,images:[]},{...normalized,images:[{...normalized.images[0],data:'data:image/jpeg;base64,/9j/AA=='}]},{...normalized,images:[{...normalized.images[0],width:128}]}])assert.equal((await post(payload)).status,400);
  assert.equal((await fetch(host.url,{method:'POST',headers:auth,body:'null'})).status,400);
  assert.equal((await fetch(host.url,{method:'POST',headers:auth,body:JSON.stringify({mode:'image_session',dimension:42})})).status,400);
 }finally{await host?.close();await rm(directory,{recursive:true,force:true});}
});
test('normalized JPEG headers reject corruption and mismatched dimensions',()=>{
 assert.deepEqual(normalizedJPEGDimensions(REFERENCE_JPEG),{width:16,height:16});
 for(const image of ['data:image/jpeg;base64,/9j/AA==','data:image/jpeg;base64,/9j/=AAA','data:image/png;base64,AA=='])assert.throws(()=>normalizedJPEGDimensions(image));
 assert.throws(()=>validateVisionRequest({...normalized,dimension:'minecraft:overworld',detail:'__proto__'} as any));
});
