import test from 'node:test';
import assert from 'node:assert/strict';
import {Ajv2020} from 'ajv/dist/2020.js';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OpenRouterVisionProvider,DEFAULT_OPENROUTER_MODEL,createVisionProvider,visionConfigured,VISION_ANALYSIS_SCHEMA,VISION_PROVIDER_SCHEMA,visionEnvFrom} from '../backend/openrouter-vision.js';
import {validateBlueprint} from '../src/blueprint/validator.js';
import {startCompanionHost} from '../tools/serve-companion.js';
import {REFERENCE_JPEG} from './support/image-fixture.js';
import type {VisionRequest} from '../backend/vision.js';
const request:VisionRequest={prompt:'ابنِ هذا بعرض 40 بلوك والسقف أسود',images:[{data:REFERENCE_JPEG,width:16,height:16,view:'front'}],dimension:'minecraft:overworld',detail:'FAST',scale:1};
// Negative/configuration tests only. No mocked provider output or BuildPlan.
test('OpenRouter selection defaults to verified M3 and never falls back on missing key',async()=>{
 assert.equal(DEFAULT_OPENROUTER_MODEL,'minimax/minimax-m3');assert.equal(visionConfigured({VISION_PROVIDER:'openrouter',AI_API_KEY:'test-only',AI_VISION_MODEL:'legacy'}),false);
 assert.ok(createVisionProvider({VISION_PROVIDER:'openrouter'}) instanceof OpenRouterVisionProvider);
 await assert.rejects(()=>createVisionProvider({VISION_PROVIDER:'openrouter'}).generate(request),/not configured/);
 assert.throws(()=>createVisionProvider({VISION_PROVIDER:'unknown'}),/Unsupported/);
});
test('OpenRouter rejects unsafe configuration before any network request',async()=>{
 for(const env of [{OPENROUTER_MODEL:'https://untrusted.test/key'},{OPENROUTER_OUTPUT_FORMAT:'code'}])await assert.rejects(()=>new OpenRouterVisionProvider({OPENROUTER_API_KEY:'negative-test-only',...env}).generate(request),/Invalid OpenRouter/);
});
test('OpenRouter analysis schema resolves Blueprint refs and forbids commands',()=>{
 const ajv=new Ajv2020({strict:false});const validate=ajv.compile(VISION_ANALYSIS_SCHEMA);
 assert.equal(validate({raw_command:'execute forbidden'}),false);
 assert.equal(validate({blueprint:{version:1,name:'Bad',size:{x:1,y:1,z:1},operations:[{type:'command',command:'forbidden'}]},assumptions:[],open_choices:[]}),false);
});
test('Provider grammar avoids observed unsupported keywords while full local schema remains authoritative',()=>{
 const text=JSON.stringify(VISION_PROVIDER_SCHEMA);assert.doesNotMatch(text,/"propertyNames"|"oneOf"/);
 const ajv=new Ajv2020({strict:false});const grammar=ajv.compile(VISION_PROVIDER_SCHEMA as any);
 const blueprint={version:1,name:'Schema boundary',size:{x:1,y:1,z:1},palette:{'Bad-Key':'minecraft:stone'},operations:[{type:'set_block',at:[0,0,0],block:'minecraft:stone'}]};
 assert.equal(grammar({blueprint,assumptions:[],open_choices:[]}),true);
 assert.equal(validateBlueprint(blueprint).ok,false);
 assert.equal(grammar({blueprint:{...blueprint,operations:[{type:'command',command:'forbidden'}]},assumptions:[],open_choices:[]}),false);
});
test('Server-side provider routing is retained and unsafe endpoint configuration is rejected before network',async()=>{
 assert.equal(visionEnvFrom({OPENROUTER_PROVIDER:'Together'}).OPENROUTER_PROVIDER,'Together');
 await assert.rejects(()=>new OpenRouterVisionProvider({OPENROUTER_API_KEY:'negative-test-only',OPENROUTER_PROVIDER:'https://untrusted.test'}).generate(request),/Invalid OpenRouter provider configuration/);
});
test('real HTTP OpenRouter image session returns missing-key gate without a plan',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openrouter-http-'));const host=await startCompanionHost({port:0,directory,env:{VISION_PROVIDER:'openrouter',BUILDER_SHARED_SECRET:'local-test-only'}});
 try{const session=new URL(host.sessionUrl).hash.slice(1);const response=await fetch(host.url+'/image/session/'+session,{method:'POST',headers:{origin:host.url,'content-type':'application/json'},body:JSON.stringify(request)});
 assert.equal(response.status,503);const text=await response.text();assert.match(text,/VISION_NOT_CONFIGURED/);assert.doesNotMatch(text,/blueprint|local-test-only/);
 assert.equal(JSON.parse(await readFile(join(directory,session,'session.json'),'utf8')).requests,0);
 }finally{await host.close();await rm(directory,{recursive:true,force:true});}
});
test('real HTTP invalid OpenRouter model gives sanitized failure and no generated plan',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openrouter-http-'));const host=await startCompanionHost({port:0,directory,env:{VISION_PROVIDER:'openrouter',OPENROUTER_API_KEY:'negative-test-only',OPENROUTER_MODEL:'invalid configuration',BUILDER_SHARED_SECRET:'local-test-only'}});
 try{const session=new URL(host.sessionUrl).hash.slice(1);const response=await fetch(host.url+'/image/session/'+session,{method:'POST',headers:{origin:host.url,'content-type':'application/json'},body:JSON.stringify(request)});
 assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/negative-test-only|invalid configuration|blueprint/);
 assert.equal(JSON.parse(await readFile(join(directory,session,'session.json'),'utf8')).plan,undefined);
 }finally{await host.close();await rm(directory,{recursive:true,force:true});}
});
