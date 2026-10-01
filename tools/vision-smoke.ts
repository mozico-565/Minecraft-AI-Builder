import {visionEnvFrom,createVisionProvider,visionConfigured,visionProviderName,DEFAULT_OPENROUTER_MODEL} from '../backend/openrouter-vision.js';
/** Real-provider smoke. No mock/fallback/output fixture path exists here. */
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { generateImagePlan,type VisionImage } from '../backend/vision.js';
import { jpegDimensions } from '../backend/jpeg.js';
import { DETAIL_LIMITS,type Detail } from '../src/image/build-plan.js';

async function main(){
 const providerName=visionProviderName(visionEnvFrom(process.env));const required=providerName==='openrouter'?['OPENROUTER_API_KEY']:['AI_API_KEY','AI_VISION_MODEL'];const missing=required.filter(k=>!process.env[k]);
 if(missing.length){console.log(JSON.stringify({status:'blocked',missing,providerCalled:false,reason:'Configure these on the backend only; no fake plan was generated.'},null,2));process.exitCode=2;return;}
 const filenames=process.argv.slice(2).filter(a=>!a.startsWith('--'));
 const detail=(process.env.AIBUILDER_SMOKE_DETAIL??'FAST') as Detail;
 if(!Object.prototype.hasOwnProperty.call(DETAIL_LIMITS,detail)||!filenames.length||filenames.length>3)throw new Error('Provide 1-3 normalized JPEG paths, <=1536px, and a valid AIBUILDER_SMOKE_DETAIL');
 const images:VisionImage[]=[];
 for(const [i,name]of filenames.entries()){
  const bytes=await readFile(name);if(bytes.length>1120000)throw new Error('Image exceeds normalized upload budget');const size=jpegDimensions(bytes);images.push({...size,view:['front','side','rear'][i]!,data:'data:image/jpeg;base64,'+bytes.toString('base64')});
 }
 if(!visionConfigured(visionEnvFrom(process.env)))throw new Error('Vision provider configuration is invalid');
 const provider=createVisionProvider(visionEnvFrom(process.env));
 const plan=await generateImagePlan({prompt:process.env.AIBUILDER_SMOKE_PROMPT??'ابنِ مبنى صغيرًا مستوحى من هذه الصور، بأرضية وسقف ومدخل صالحين. اذكر افتراضاتك.',images,detail,scale:1,dimension:'minecraft:overworld'},provider);
 const output=resolve('.local/vision-smoke/BuildPlan.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(plan),{mode:0o600});
 console.log(JSON.stringify({status:'passed',providerCalled:true,provider:providerName,model:providerName==='openrouter'?(process.env.OPENROUTER_MODEL??DEFAULT_OPENROUTER_MODEL):process.env.AI_VISION_MODEL,plan_id:plan.plan_id,dimensions:plan.dimensions,blockWrites:plan.estimates.block_writes,file:output,bedrockExecuted:false},null,2));
}
try{await main();}catch(error){console.error(JSON.stringify({status:'failed',error:'Vision request or validation failed; credentials and upstream content are intentionally omitted'}));process.exitCode=1;}
